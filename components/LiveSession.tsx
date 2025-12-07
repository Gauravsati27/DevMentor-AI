import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob as GenAIBlob } from '@google/genai';
import { Mic, MicOff, Radio, StopCircle, Volume2, Monitor, MonitorOff } from 'lucide-react';
import { GeminiModel } from '../types';

interface LiveSessionProps {
  onBack: () => void;
}

// --- Audio Helper Functions (from Guidelines) ---

function createBlob(data: Float32Array): GenAIBlob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const LiveSession: React.FC<LiveSessionProps> = ({ onBack }) => {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0); // For visualization

  // Refs for audio processing
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  // Refs for Screen Sharing
  const screenStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenIntervalRef = useRef<number | null>(null);

  // Refs for Gemini Live Session
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const aiRef = useRef<GoogleGenAI | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Initialize AI instance
  useEffect(() => {
    aiRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Create hidden video/canvas for screen processing
    videoRef.current = document.createElement('video');
    videoRef.current.autoplay = true;
    videoRef.current.muted = true;
    canvasRef.current = document.createElement('canvas');

    return () => {
      stopSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startSession = async () => {
    if (!aiRef.current) return;
    setStatus('connecting');

    try {
      // 1. Setup Audio Contexts
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      inputAudioContextRef.current = inputCtx;
      audioContextRef.current = outputCtx;

      // 2. Get Microphone Stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 3. Connect to Gemini Live
      const sessionPromise = aiRef.current.live.connect({
        model: GeminiModel.LIVE,
        callbacks: {
          onopen: () => {
            console.log("Gemini Live Connected");
            setStatus('connected');
            setIsActive(true);

            // Setup Input Processing
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              if (isMuted) return; 

              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              
              // Simple volume visualization
              let sum = 0;
              for(let i=0; i<inputData.length; i++) sum += Math.abs(inputData[i]);
              setVolumeLevel(Math.min(100, (sum / inputData.length) * 500));

              const pcmBlob = createBlob(inputData);
              
              sessionPromise.then((session: any) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
            
            sourceRef.current = source;
            processorRef.current = scriptProcessor;
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            
            if (base64Audio && outputCtx) {
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              
              const audioBuffer = await decodeAudioData(
                decode(base64Audio),
                outputCtx,
                24000,
                1
              );
              
              const source = outputCtx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputCtx.destination);
              
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
              });

              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            // Handle Interruption
            if (message.serverContent?.interrupted) {
              console.log("Interrupted");
              sourcesRef.current.forEach(src => {
                try { src.stop(); } catch(e) {}
              });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onclose: () => {
            console.log("Session Closed");
            stopSession();
          },
          onerror: (err) => {
            console.error("Session Error", err);
            setStatus('error');
            stopSession();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } },
          },
          systemInstruction: `You are DevMentor AI, an expert pair programmer. 
          Your goal is to collaborate with the developer in real-time.
          - If the user shares their screen, analyze the code or errors visible.
          - Be patient, encouraging, and clear.
          - Explain concepts simply but effectively.
          - Help debug by asking leading questions or suggesting fixes.
          - Treat this as a friendly voice call between colleagues.`,
        },
      });

      sessionPromiseRef.current = sessionPromise;

    } catch (err) {
      console.error("Failed to start session:", err);
      setStatus('error');
    }
  };

  const startScreenShare = async () => {
    if (!sessionPromiseRef.current) return;
    
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      screenStreamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      
      setIsScreenSharing(true);

      // Start sending frames
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Send a frame every 1000ms (1 FPS)
      screenIntervalRef.current = window.setInterval(async () => {
         if (!screenStreamRef.current?.active) {
           stopScreenShare();
           return;
         }
         
         canvas.width = video.videoWidth;
         canvas.height = video.videoHeight;
         ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
         
         const base64Data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
         
         if (sessionPromiseRef.current) {
             sessionPromiseRef.current.then((session: any) => {
                 session.sendRealtimeInput({
                     media: { mimeType: 'image/jpeg', data: base64Data }
                 });
             });
         }
      }, 1000);

      // Handle stream stop (user clicks "Stop sharing" in browser UI)
      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };

    } catch (err) {
      console.error("Failed to share screen:", err);
      setIsScreenSharing(false);
    }
  };

  const stopScreenShare = () => {
    if (screenIntervalRef.current) {
      clearInterval(screenIntervalRef.current);
      screenIntervalRef.current = null;
    }
    
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsScreenSharing(false);
  };

  const stopSession = () => {
    stopScreenShare();

    // Clean up Audio Nodes
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }

    // Close Session
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then((session: any) => {
        session.close();
      }).catch(() => {});
      sessionPromiseRef.current = null;
    }

    setIsActive(false);
    setStatus('idle');
    setVolumeLevel(0);
    nextStartTimeRef.current = 0;
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  return (
    <div className="flex flex-col h-full items-center justify-center p-6 bg-dev-900 text-white relative overflow-hidden">
      {/* Background Pulse Effect */}
      {isActive && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div 
            className="w-64 h-64 rounded-full bg-dev-accent opacity-20 blur-3xl transition-all duration-100 ease-linear"
            style={{ transform: `scale(${1 + volumeLevel / 50})` }}
          />
        </div>
      )}

      <div className="z-10 flex flex-col items-center space-y-8 max-w-md w-full">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold font-mono text-dev-accent">Pair Programming</h2>
          <p className="text-slate-400">Real-time voice & screen collaboration with Gemini</p>
        </div>

        {/* Visualizer Circle */}
        <div className="relative w-48 h-48 rounded-full border-4 border-dev-800 flex items-center justify-center bg-dev-800/50 backdrop-blur-sm shadow-xl">
           {status === 'connecting' && (
             <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-dev-accent"></div>
           )}
           {status === 'connected' && (
             <div className="flex flex-col items-center space-y-2">
                <Radio className={`w-12 h-12 ${isActive ? 'text-dev-success animate-pulse' : 'text-slate-500'}`} />
                <span className="text-xs font-mono text-dev-success">LIVE</span>
                {isScreenSharing && (
                  <span className="flex items-center text-xs text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded">
                    <Monitor className="w-3 h-3 mr-1" /> Shared
                  </span>
                )}
             </div>
           )}
           {status === 'idle' && (
             <Radio className="w-16 h-16 text-slate-600" />
           )}
           {status === 'error' && (
             <div className="text-dev-error flex flex-col items-center">
                <span className="text-4xl">!</span>
                <span className="text-xs">Error</span>
             </div>
           )}
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-6">
          {!isActive ? (
            <button
              onClick={startSession}
              disabled={status === 'connecting'}
              className="flex items-center px-8 py-4 bg-dev-accent hover:bg-indigo-600 rounded-full font-bold shadow-lg shadow-indigo-500/20 transition-all transform hover:scale-105"
            >
              <Mic className="w-5 h-5 mr-2" />
              Start Session
            </button>
          ) : (
            <>
               {/* Screen Share Button */}
              <button
                onClick={isScreenSharing ? stopScreenShare : startScreenShare}
                className={`p-4 rounded-full transition-colors ${isScreenSharing ? 'bg-blue-500 text-white' : 'bg-dev-700 hover:bg-dev-600 text-slate-200'}`}
                title={isScreenSharing ? "Stop Sharing" : "Share Screen"}
              >
                {isScreenSharing ? <MonitorOff className="w-6 h-6" /> : <Monitor className="w-6 h-6" />}
              </button>

              <button
                onClick={toggleMute}
                className={`p-4 rounded-full transition-colors ${isMuted ? 'bg-dev-warning text-black' : 'bg-dev-700 hover:bg-dev-600'}`}
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>
              
              <button
                onClick={stopSession}
                className="px-8 py-4 bg-dev-error hover:bg-red-600 rounded-full font-bold shadow-lg shadow-red-500/20 transition-all flex items-center"
              >
                <StopCircle className="w-5 h-5 mr-2" />
                End
              </button>
            </>
          )}
        </div>

        <div className="h-4">
            {status === 'connected' && (
                <div className="flex items-center space-x-2 text-xs text-slate-400 font-mono">
                    <Volume2 className="w-3 h-3" />
                    <span>Listening... {isScreenSharing ? 'Watching screen...' : 'Speak clearly.'}</span>
                </div>
            )}
        </div>

        <button onClick={onBack} className="text-slate-500 hover:text-white mt-8 text-sm underline">
          Back to Dashboard
        </button>
      </div>
    </div>
  );
};

export default LiveSession;
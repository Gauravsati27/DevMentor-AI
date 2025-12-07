import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, ArrowLeft, Loader2, Code2, Bug, BookOpen, Paperclip, X, Image as ImageIcon, FileText, UploadCloud, Copy, Terminal } from 'lucide-react';
import { generateResponse } from '../services/geminiService';
import { ChatMessage, ViewState } from '../types';

interface ChatViewProps {
  mode: ViewState;
  onBack: () => void;
}

// Helper to access global Prism
declare global {
  interface Window {
    Prism: any;
  }
}

const ChatView: React.FC<ChatViewProps> = ({ mode, onBack }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
    // Trigger syntax highlighting on new messages
    if (window.Prism) {
      setTimeout(() => window.Prism.highlightAll(), 100);
    }
  }, [messages]);

  // Initial greeting based on mode
  useEffect(() => {
    setMessages([]); // Clear previous messages on mode change
    let initialText = '';
    switch(mode) {
      case ViewState.DEBUG:
        initialText = "Hello! I'm your Debug Assistant. I can help you fix errors and explain why they happened.";
        break;
      case ViewState.EXPLORE:
        initialText = "I'm the Code Explorer. I can explain complex codebases or help you architect new features.";
        break;
      case ViewState.LEARN:
        initialText = "Ready to Learn? I can create personalized lesson plans and practice exercises for any topic.";
        break;
      default:
        initialText = "Hello! I'm DevMentor AI. How can I help you today?";
    }

    setMessages([{
      id: 'init',
      role: 'model',
      text: initialText,
      timestamp: new Date()
    }]);
  }, [mode]);

  const getSystemInstruction = () => {
    const basePersona = `You are DevMentor AI, an expert programming assistant.
    Your personality:
    - Patient and encouraging (like a senior developer mentor)
    - Clear and concise
    - Always explains the "why" behind solutions`;

    switch(mode) {
      case ViewState.DEBUG:
        return `${basePersona}
        
        MODE: DEBUG ASSISTANT
        
        INSTRUCTIONS:
        The user will provide error logs, screenshots, or buggy code.
        
        REQUIRED RESPONSE FORMAT:
        
        1. **Root Cause**: What's causing this error? (Be specific)
        2. **Why It Happened**: Explain the underlying technical issue.
        3. **Code Fix Comparison**:
           Provide a clear comparison. Use the exact headers below:
           
           ### 🔴 Buggy Code
           \`\`\`[language]
           // Show the specific lines that are wrong
           \`\`\`
           
           ### 🟢 Fixed Code
           \`\`\`[language]
           // Show the corrected code
           \`\`\`
           
        4. **Prevention**: How to avoid this in the future.`;
      
      case ViewState.EXPLORE:
        return `${basePersona}
        
        MODE: CODE EXPLORER & BUILDER
        
        INSTRUCTIONS:
        
        If User asks to BUILD something:
        1. **Architecture**: High-level approach.
        2. **Steps**: Implementation breakdown.
        3. **Code**: Initial scaffold.
        4. **Decisions**: Why this approach?
        
        If User asks to EXPLAIN code:
        1. **Overview**: What does it do?
        2. **Flow**: How data moves.
        3. **Patterns**: Design patterns used.
        4. **Improvements**: Suggestions.`;
      
      case ViewState.LEARN:
        return `${basePersona}
        
        MODE: LEARN & PRACTICE
        
        INSTRUCTIONS:
        1. **Concept**: Explain clearly with a simple example.
        2. **Real World**: Where is this used?
        3. **Practice**: A small challenge for the user.
        4. **Hints**: Offer help.`;
      
      default:
        return basePersona;
    }
  };

  const processFile = async (file: File) => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      try {
        const text = await file.text();
        const extension = file.name.split('.').pop() || 'txt';
        setInput(prev => {
          const separator = prev.length > 0 ? '\n\n' : '';
          return `${prev}${separator}File: ${file.name}\n\`\`\`${extension}\n${text}\n\`\`\``;
        });
      } catch (err) {
        console.error("Failed to read file", err);
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processFile(file);
      e.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const handleSend = async (manualInput?: string) => {
    const textToSend = manualInput || input;
    if ((!textToSend.trim() && !selectedImage) || isLoading) return;

    // Use a default prompt if user sends only an image
    const finalInput = textToSend.trim() || (selectedImage ? "Please analyze this image." : "");

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: finalInput,
      image: selectedImage || undefined,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSelectedImage(null);
    setIsLoading(true);

    try {
      const systemInstruction = getSystemInstruction();

      // Convert previous messages to history format
      const history = messages
        .filter(m => !m.isError && m.id !== 'init')
        .map(m => {
          const parts: any[] = [];
          
          if (m.image && m.role === 'user') {
             const match = m.image.match(/^data:(.+);base64,(.+)$/);
             if (match) {
               parts.push({
                 inlineData: { mimeType: match[1], data: match[2] }
               });
             }
          }
          
          if (m.text) {
            parts.push({ text: m.text });
          }

          return {
            role: m.role,
            parts: parts
          };
        });

      const responseText = await generateResponse(userMsg.text, userMsg.image, systemInstruction, history);

      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMsg]);

    } catch (error) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        text: "I encountered an error connecting to the AI. Please check your connection or try again.",
        timestamp: new Date(),
        isError: true
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const getIcon = () => {
    switch(mode) {
      case ViewState.DEBUG: return <Bug className="w-6 h-6 text-dev-error" />;
      case ViewState.EXPLORE: return <Code2 className="w-6 h-6 text-dev-accent" />;
      case ViewState.LEARN: return <BookOpen className="w-6 h-6 text-dev-success" />;
      default: return null;
    }
  };

  const getTitle = () => {
    switch(mode) {
      case ViewState.DEBUG: return "Debug Assistant";
      case ViewState.EXPLORE: return "Code Explorer";
      case ViewState.LEARN: return "Learn & Practice";
      default: return "";
    }
  };

  const ExampleCard = ({ title, desc, prompt }: { title: string, desc: string, prompt: string }) => (
    <button 
      onClick={() => handleSend(prompt)}
      className="text-left p-4 bg-dev-800 border border-dev-700 rounded-xl hover:border-dev-accent hover:bg-dev-700 transition-all group w-full"
    >
      <h4 className="font-semibold text-white mb-1 group-hover:text-dev-accent">{title}</h4>
      <p className="text-xs text-slate-400">{desc}</p>
    </button>
  );

  const renderExamples = () => {
    if (mode === ViewState.DEBUG) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 animate-fade-in px-2">
          <ExampleCard 
            title="React useEffect Loop"
            desc="Fix an infinite loop caused by incorrect dependencies"
            prompt="I have a React useEffect hook that runs infinitely. Here is the code..."
          />
          <ExampleCard 
            title="Analyze Screenshot"
            desc="Upload an image of a console error or UI bug"
            prompt="Can you analyze this error screenshot and tell me what's wrong?"
          />
          <ExampleCard 
            title="Python Type Error"
            desc="Debug a common TypeError in Python data processing"
            prompt="I'm getting a TypeError: 'NoneType' object is not subscriptable in this function..."
          />
          <ExampleCard 
            title="CSS Layout Issue"
            desc="Fix a flexbox or grid layout that isn't centering"
            prompt="My flexbox container isn't centering items vertically. Here's my CSS..."
          />
        </div>
      );
    }
    if (mode === ViewState.EXPLORE) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 animate-fade-in px-2">
           <ExampleCard 
            title="Explain this File"
            desc="Upload a file and get a line-by-line explanation"
            prompt="Please explain how this code works step by step."
          />
          <ExampleCard 
            title="Build a Todo App"
            desc="Get architecture and steps for a React Todo App"
            prompt="I want to build a modern Todo app with React and Tailwind. Help me get started."
          />
          <ExampleCard 
            title="Refactor Legacy Code"
            desc="Improve code quality and readability"
            prompt="How can I refactor this function to be cleaner and more efficient?"
          />
           <ExampleCard 
            title="Write Tests"
            desc="Generate unit tests for a specific function"
            prompt="Please write Jest unit tests for the following component..."
          />
        </div>
      );
    }
    if (mode === ViewState.LEARN) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 animate-fade-in px-2">
          <ExampleCard 
            title="Learn Rust Basics"
            desc="Understand ownership and borrowing"
            prompt="Teach me about ownership and borrowing in Rust with examples."
          />
           <ExampleCard 
            title="Master Async/Await"
            desc="Deep dive into JavaScript promises"
            prompt="Explain async/await in JavaScript and give me a practice exercise."
          />
          <ExampleCard 
            title="Design Patterns"
            desc="Learn the Singleton or Observer pattern"
            prompt="What is the Observer pattern? Show me a practical use case."
          />
           <ExampleCard 
            title="SQL Joins"
            desc="Visualize the difference between Inner and Outer joins"
            prompt="Explain the difference between INNER JOIN and LEFT JOIN with a simple example."
          />
        </div>
      );
    }
    return null;
  };

  return (
    <div 
      className="flex flex-col h-full bg-dev-900 relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-dev-accent/20 backdrop-blur-sm border-4 border-dev-accent border-dashed m-4 rounded-2xl flex flex-col items-center justify-center text-white animate-fade-in pointer-events-none">
          <UploadCloud className="w-20 h-20 mb-4 text-dev-accent" />
          <h3 className="text-2xl font-bold">Drop files here</h3>
          <p className="text-slate-200">Upload code or images instantly</p>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center px-4 py-4 border-b border-dev-800 bg-dev-900 sticky top-0 z-10">
        <button onClick={onBack} className="p-2 mr-2 rounded-lg hover:bg-dev-800 text-slate-400 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-dev-800 rounded-lg">
            {getIcon()}
          </div>
          <h1 className="text-lg font-bold text-white">{getTitle()}</h1>
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div 
              className={`max-w-[90%] lg:max-w-[80%] rounded-2xl px-5 py-4 shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-dev-accent text-white rounded-br-none' 
                  : 'bg-dev-800 text-slate-200 rounded-bl-none border border-dev-700'
              } ${msg.isError ? 'border-dev-error bg-dev-900 text-dev-error' : ''}`}
            >
              {msg.image && (
                <div className="mb-3">
                  <img src={msg.image} alt="User upload" className="rounded-lg max-h-60 border border-black/20" />
                </div>
              )}
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown
                  components={{
                    code({node, inline, className, children, ...props}: any) {
                      const match = /language-(\w+)/.exec(className || '')
                      return !inline ? (
                        <div className="relative group my-4">
                          <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                             <div className="text-xs text-slate-500 uppercase font-mono bg-dev-900 px-2 py-1 rounded border border-dev-700">
                               {match ? match[1] : 'code'}
                             </div>
                          </div>
                          <div className="rounded-lg overflow-hidden border border-dev-700">
                             <pre className={`!bg-dev-900 !m-0 !p-4 overflow-x-auto ${className || ''}`}>
                               <code className={className} {...props}>
                                 {children}
                               </code>
                             </pre>
                          </div>
                        </div>
                      ) : (
                        <code className="bg-dev-900 px-1.5 py-0.5 rounded text-dev-warning font-mono text-xs border border-dev-700/50" {...props}>
                          {children}
                        </code>
                      )
                    }
                  }}
                >
                  {msg.text}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ))}

        {/* Empty State Examples */}
        {messages.length === 1 && renderExamples()}

        {isLoading && (
           <div className="flex justify-start">
             <div className="bg-dev-800 rounded-2xl rounded-bl-none px-5 py-4 border border-dev-700 flex items-center space-x-2">
               <Loader2 className="w-4 h-4 text-dev-accent animate-spin" />
               <span className="text-xs text-slate-400">Analyzing...</span>
             </div>
           </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-dev-900 border-t border-dev-800">
        <div className="relative max-w-4xl mx-auto">
          {/* Image Preview */}
          {selectedImage && (
            <div className="absolute bottom-full left-0 mb-2 p-2 bg-dev-800 rounded-lg border border-dev-700 flex items-start shadow-xl animate-slide-up">
              <img src={selectedImage} alt="Preview" className="h-20 w-auto rounded" />
              <button 
                onClick={() => setSelectedImage(null)}
                className="ml-2 p-1 bg-dev-900 rounded-full hover:bg-dev-700 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex items-end bg-dev-800 rounded-xl border border-dev-700 focus-within:ring-2 focus-within:ring-dev-accent focus-within:border-transparent transition-all shadow-lg">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-3 mb-[2px] text-slate-400 hover:text-white transition-colors"
              title="Attach code file or image"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*, .txt, .js, .jsx, .ts, .tsx, .css, .html, .json, .py, .java, .c, .cpp, .md, .rb, .go, .php, .sql, .sh, .yaml, .yml, .xml"
              onChange={handleFileSelect}
            />
            
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={mode === ViewState.DEBUG ? "Describe the issue..." : "Ask anything or paste code..."}
              className="w-full bg-transparent text-white pl-2 pr-14 py-3 focus:outline-none resize-none h-14 min-h-[56px] max-h-32 scrollbar-hide font-sans"
            />
            <button
              onClick={() => handleSend()}
              disabled={(!input.trim() && !selectedImage) || isLoading}
              className="absolute right-2 bottom-2 p-2 bg-dev-accent rounded-lg text-white hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
        <p className="text-center text-xs text-slate-600 mt-2">
          DevMentor AI can make mistakes. Review generated code.
        </p>
      </div>
    </div>
  );
};

export default ChatView;
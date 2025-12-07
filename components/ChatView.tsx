import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, ArrowLeft, Loader2, Code2, Bug, BookOpen, Paperclip, X } from 'lucide-react';
import { generateResponse } from '../services/geminiService';
import { ChatMessage, ViewState } from '../types';

interface ChatViewProps {
  mode: ViewState;
  onBack: () => void;
}

const ChatView: React.FC<ChatViewProps> = ({ mode, onBack }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initial greeting based on mode
  useEffect(() => {
    setMessages([]); // Clear previous messages on mode change
    let initialText = '';
    switch(mode) {
      case ViewState.DEBUG:
        initialText = "Hello! I'm your Debug Assistant. Upload a screenshot of your error or paste the buggy code, and I'll help you find the root cause.";
        break;
      case ViewState.EXPLORE:
        initialText = "I'm the Code Explorer. Upload your files or ask me to help you build a new feature. I can explain complex logic or suggest architectures.";
        break;
      case ViewState.LEARN:
        initialText = "Ready to Learn? Tell me what topic you want to master, and I'll create a lesson plan with practice exercises.";
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
        You MUST follow this response format strictly:
        
        1. **Root Cause**: What's causing this error? (Be specific)
        2. **Why It Happened**: Explain the underlying technical issue or concept.
        3. **Solutions**: Provide 2-3 ways to fix it (e.g., Quick Fix vs. Best Practice).
        4. **Prevention**: How to avoid this in the future.
        
        Format with clear headings and code blocks.`;
      
      case ViewState.EXPLORE:
        return `${basePersona}
        
        MODE: CODE EXPLORER & BUILDER
        
        INSTRUCTIONS:
        
        Scenario A: User asks about existing code.
        Provide:
        - Clear explanation with references to specific code sections.
        - Visual flow description (describe data/logic flow).
        - Related code patterns used.
        - Suggestions for improvements.
        
        Scenario B: User wants to build a new feature/app.
        Provide:
        1. **Architecture/Approach**: Suggest the best way to structure it.
        2. **Implementation Steps**: Break it down.
        3. **Initial Code Structure**: Generate the scaffold.
        4. **Key Decisions**: Explain why you chose this approach.`;
      
      case ViewState.LEARN:
        return `${basePersona}
        
        MODE: LEARN & PRACTICE
        
        INSTRUCTIONS:
        The user wants to learn a topic.
        
        Response Structure:
        1. **Concept Explanation**: Explain clearly with a simple example.
        2. **Practical Use Case**: Show where this is used in the real world.
        3. **Practice Exercise**: Generate a specific coding challenge for the user to try now.
        4. **Hints**: Offer to provide hints if they get stuck.
        
        Adapt your explanation to the user's apparent skill level.`;
      
      default:
        return basePersona;
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      // Handle text/code files
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
    // Reset file input
    e.target.value = '';
  };

  const handleSend = async () => {
    if ((!input.trim() && !selectedImage) || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
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

  return (
    <div className="flex flex-col h-full bg-dev-900">
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
              className={`max-w-[85%] lg:max-w-[75%] rounded-2xl px-5 py-4 shadow-sm ${
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
                      return !inline ? (
                        <div className="bg-dev-900 p-3 rounded-lg border border-dev-700 my-2 overflow-x-auto font-mono text-sm">
                          <code {...props}>{children}</code>
                        </div>
                      ) : (
                        <code className="bg-dev-900 px-1 py-0.5 rounded text-dev-warning font-mono text-xs" {...props}>
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
        {isLoading && (
           <div className="flex justify-start">
             <div className="bg-dev-800 rounded-2xl rounded-bl-none px-5 py-4 border border-dev-700 flex items-center space-x-2">
               <Loader2 className="w-4 h-4 text-dev-accent animate-spin" />
               <span className="text-xs text-slate-400">Thinking...</span>
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
            <div className="absolute bottom-full left-0 mb-2 p-2 bg-dev-800 rounded-lg border border-dev-700 flex items-start shadow-xl">
              <img src={selectedImage} alt="Preview" className="h-20 w-auto rounded" />
              <button 
                onClick={() => setSelectedImage(null)}
                className="ml-2 p-1 bg-dev-900 rounded-full hover:bg-dev-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex items-end bg-dev-800 rounded-xl border border-dev-700 focus-within:ring-2 focus-within:ring-dev-accent focus-within:border-transparent transition-all">
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
              placeholder={mode === ViewState.DEBUG ? "Paste error, code, or upload a screenshot..." : "Ask anything or paste code..."}
              className="w-full bg-transparent text-white pl-2 pr-14 py-3 focus:outline-none resize-none h-14 min-h-[56px] max-h-32 scrollbar-hide"
            />
            <button
              onClick={handleSend}
              disabled={(!input.trim() && !selectedImage) || isLoading}
              className="absolute right-2 bottom-2 p-2 bg-dev-accent rounded-lg text-white hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
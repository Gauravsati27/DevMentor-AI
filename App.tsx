import React, { useState } from 'react';
import { Terminal, Bug, Search, BookOpen, Mic, Code2 } from 'lucide-react';
import { ViewState, FeatureCardProps } from './types';
import ChatView from './components/ChatView';
import LiveSession from './components/LiveSession';

// Dashboard Card Component
const FeatureCard: React.FC<FeatureCardProps> = ({ title, description, icon, onClick, colorClass }) => (
  <button 
    onClick={onClick}
    className="group relative flex flex-col items-start p-6 bg-dev-800 border border-dev-700 rounded-2xl hover:bg-dev-700/80 transition-all duration-200 hover:shadow-xl hover:shadow-indigo-500/10 hover:-translate-y-1 w-full text-left"
  >
    <div className={`p-3 rounded-xl mb-4 ${colorClass} bg-opacity-10`}>
      {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: `w-8 h-8 ${colorClass.replace('bg-', 'text-')}` })}
    </div>
    <h3 className="text-xl font-bold text-white mb-2 group-hover:text-dev-accent transition-colors">{title}</h3>
    <p className="text-slate-400 text-sm leading-relaxed">{description}</p>
    <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
      <div className="w-2 h-2 rounded-full bg-dev-accent"></div>
    </div>
  </button>
);

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.HOME);

  const renderContent = () => {
    switch (currentView) {
      case ViewState.PAIR:
        return <LiveSession onBack={() => setCurrentView(ViewState.HOME)} />;
      case ViewState.DEBUG:
      case ViewState.EXPLORE:
      case ViewState.LEARN:
        return <ChatView mode={currentView} onBack={() => setCurrentView(ViewState.HOME)} />;
      default:
        return (
          <div className="max-w-6xl mx-auto px-6 py-12 animate-fade-in">
            <header className="text-center mb-16 space-y-4">
              <div className="inline-flex items-center justify-center p-3 bg-dev-800 rounded-full border border-dev-700 mb-4">
                <Terminal className="w-8 h-8 text-dev-accent mr-2" />
                <span className="text-2xl font-mono font-bold text-white tracking-tight">DevMentor AI</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
                Your Intelligent <span className="text-transparent bg-clip-text bg-gradient-to-r from-dev-accent to-purple-500">Coding Companion</span>
              </h1>
              <p className="text-lg text-slate-400 max-w-2xl mx-auto">
                Debug faster, understand complex logic, learn new concepts, and pair program with an AI that speaks your language.
              </p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FeatureCard
                title="Debug Assistant"
                description="Paste error logs or buggy code. Get instant fixes, explanations, and prevention tips."
                icon={<Bug />}
                colorClass="bg-red-500"
                onClick={() => setCurrentView(ViewState.DEBUG)}
              />
              <FeatureCard
                title="Code Explorer"
                description="Deep dive into codebases or ask for help building new features and architectures."
                icon={<Search />}
                colorClass="bg-blue-500"
                onClick={() => setCurrentView(ViewState.EXPLORE)}
              />
              <FeatureCard
                title="Learn & Practice"
                description="Master new languages and frameworks with personalized quizzes and concept explanations."
                icon={<BookOpen />}
                colorClass="bg-green-500"
                onClick={() => setCurrentView(ViewState.LEARN)}
              />
              <FeatureCard
                title="Pair Programming (Live)"
                description="Real-time voice collaboration. Talk through logic and solve problems hands-free."
                icon={<Mic />}
                colorClass="bg-purple-500"
                onClick={() => setCurrentView(ViewState.PAIR)}
              />
            </div>
            
            <footer className="mt-20 text-center text-slate-600 text-sm">
              <p>Powered by Google Gemini 2.5 Flash & Live API</p>
            </footer>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-dev-900 text-slate-200 font-sans selection:bg-dev-accent selection:text-white">
      {renderContent()}
    </div>
  );
};

export default App;
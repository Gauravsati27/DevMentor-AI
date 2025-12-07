# DevMentor AI 👨‍💻

**DevMentor AI** is an intelligent coding companion designed to help developers debug, learn, and build faster. It leverages Google's multimodal Gemini 2.5 models to provide visual code analysis, detailed explanations, and real-time voice-based pair programming.

[**🚀 Try DevMentor AI Live**](https://ai.studio/apps/drive/1Lrpoh-Nqn6SlgsUfT1Q94qFVSobUi_WF?fullscreenApplet=true)

## ✨ Features

- **🐛 Debug Assistant**: Upload screenshots of errors or paste logs. Get structured analysis including root causes, explanations, and side-by-side "Buggy vs Fixed" code comparisons.
- **🔍 Code Explorer & Builder**: Upload code files for explanation or ask for help architecting new features. Includes file support for Python, JavaScript, TypeScript, and more.
- **📚 Learn & Practice**: Interactive tutorials and concept explanations customized to your skill level.
- **👥 Pair Programming (Live)**: A real-time voice and screen sharing session with Gemini. Talk through logic problems hands-free while the AI watches your screen to provide context-aware help.

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript
- **Styling**: Tailwind CSS
- **AI Integration**: Google GenAI SDK (Gemini 2.5 Flash & Gemini Live API)
- **Syntax Highlighting**: PrismJS
- **Icons**: Lucide React

## 🚀 Getting Started

### Prerequisites

- A Google Gemini API Key. Get one at [Google AI Studio](https://aistudio.google.com/).

### Installation

1. Clone the repository.
2. Create a `.env` file in the root directory based on `.env.example` and add your API key:
   ```bash
   API_KEY=your_api_key_here
   ```
3. Run the application in your development environment.

## ⚠️ Important Note

This application uses the **Gemini Live API** which requires a compatible browser environment for WebSocket and WebRTC (Microphone/Screen Share) access.

## 🔒 Security

- **API Keys**: The `.gitignore` is configured to exclude `.env` files to prevent accidental commits of sensitive keys.
- **Privacy**: Screen sharing processing happens client-side before frames are sent to the secure Gemini API session.

## 📄 License

MIT
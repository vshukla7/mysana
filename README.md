# 🎙️ MySana — Expressive Voice AI Avatar

MySana is a web-based, real-time voice assistant starring **Sana**, a warm, expressive AI avatar who communicates both verbally and physically. This app utilizes Groq's high-speed APIs for speech-to-text, LLM generation, and text-to-speech, enabling smooth, natural conversations.

---

## ✨ Features

- **🗣️ Natural Voice-to-Voice Loop:** Talk naturally and the AI responds in real-time.
- **💃 Expressive Physical Animations:** Sana reacts dynamically with poses including thinking, laughing, blinking, yawning/sleeping, and waving hand-gestures.
- **🔄 Dynamic Transitions:** Smooth reverse animations prevent jarring frame skips while transitioning between physical reactions, while lip-sync/talking loops snap shut instantly when audio finishes.
- **🎤 Advanced VAD (Voice Activity Detection):** Smart voice activity detection filters out breathing, background noise, and quick sounds (under 600ms) to save API tokens and prevent silent Whisper hallucinations.
- **⚡ Ultra-Low Latency:** Powered by Groq's Whisper (`whisper-large-v3`), Llama 3 models, and high-quality Text-to-Speech (TTS) endpoints.

---

## 🛠️ Tech Stack

- **Frontend:** React + Vite
- **Logic & Control:** Vanilla Javascript + Web Audio API (Analysers, MediaRecorder)
- **Styling:** Premium Glassmorphism and dark themes with Vanilla CSS
- **APIs:**
  - **Transcription:** Groq Whisper (`whisper-large-v3`)
  - **Chat LLM:** Groq Chat Completions (`llama-3.3-70b-versatile`)
  - **Speech Synthesis:** Groq Speech (`canopylabs/orpheus-v1-english`) with browser-speech fallback

---

## 🚀 Getting Started

### 1. Installation
Clone/copy the directory and install dependencies:
```bash
npm install
```

### 2. Configuration
Create a `.env.local` file in the root directory and add your Groq API key:
```env
VITE_GROQ_API_KEY=gsk_your_groq_api_key_here
VITE_GROQ_MODEL=llama-3.3-70b-versatile
```

### 3. Run Locally
Start the development server:
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## ⚙️ Configuration & Customization

- **VAD Sensitivities:** You can configure noise threshold parameters inside [App.jsx](file:///c:/code%20playground/mysana/src/App.jsx):
  - `SPEECH_THRESHOLD` (default `0.06`): Higher values ignore louder background hums.
  - `SILENCE_MS` (default `700`): Miliseconds of silence to wait before submitting speech.
- **System Prompts:** Customize Sana's behaviors, emotions, and specific rules inside the system prompt in [App.jsx](file:///c:/code%20playground/mysana/src/App.jsx).

---

## 📂 Project Structure

- `src/App.jsx` — Core application, MediaRecorder handling, audio-context connection, VAD logic, and API orchestration.
- `src/components/AvatarPlayer.jsx` — Avatar canvas renderer, frame-caching, state-machine transitions (instant cuts and smooth reverses).
- `src/utils/responseParser.js` — Segment parser mapping actions and emotions out of standard bracket syntax (e.g. `[action:think][emotion:normal]`).
- `src/index.css` — Global layout, buttons, transitions, and dark UI system styles.

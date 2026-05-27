import React, { useState, useEffect, useRef } from 'react';
import { Groq } from 'groq-sdk';
import { Mic, MicOff, Volume2, VolumeX, PhoneOff } from 'lucide-react';
import AvatarPlayer from './components/AvatarPlayer';
import { parseSegment } from './utils/responseParser';
import AvatarStateManager from './utils/avatarStateManager';
import { 
  getSanaSystemPrompt, 
  getEmotionalSystemPrompt, 
  detectUserEmotion, 
  isGreeting,
  validateSegments 
} from './utils/llmPrompts';
import AudioSyncManager from './utils/audioSyncManager';

export default function App() {
  // ─── API keys ──────────────────────────────────────────────────────────────
  const [groqKey]   = useState(import.meta.env.VITE_GROQ_API_KEY);
  const [groqModel] = useState(import.meta.env.VITE_GROQ_MODEL);
  const [voiceModel] = useState(import.meta.env.VITE_VOICE_MODEL || 'canopylabs/orpheus-v1-english');
  const [voiceName]  = useState(import.meta.env.VITE_VOICE_NAME || 'hannah');

  // ─── App state ─────────────────────────────────────────────────────────────
  const [status, setStatus] = useState('idle'); // idle | listening | thinking | speaking
  const [isAsleep, setIsAsleep] = useState(false);
  const [isWakingUp, setIsWakingUp] = useState(false);

  // ─── Chat history ──────────────────────────────────────────────────────────
  const [messages, setMessages] = useState([
    { role: 'system', content: 'Welcome! I am Sana. Click the microphone to start talking.' }
  ]);
  const [textInput, setTextInput] = useState('');

  // ─── Avatar state ──────────────────────────────────────────────────────────
  const [activeAction, setActiveAction] = useState('idle');
  const [isSpeaking,   setIsSpeaking]   = useState(false);
  const [audioAnalyser, setAudioAnalyser] = useState(null);
  const [speakerMuted, setSpeakerMuted]   = useState(false);
  const [audioDuration, setAudioDuration] = useState(0); // Duration in seconds for animation sync

  // ─── Mic state ─────────────────────────────────────────────────────────────
  const [isContinuousMic, setIsContinuousMic] = useState(false);

  // ─── Refs ──────────────────────────────────────────────────────────────────
  const mediaRecorderRef        = useRef(null);
  const audioChunksRef          = useRef([]);
  const streamRef               = useRef(null);
  const silenceCheckIntervalRef = useRef(null);
  const shouldTranscribeRef     = useRef(true);
  const lastActivityTimeRef     = useRef(Date.now());
  const isWakingUpRef           = useRef(false);
  const isPausingRef            = useRef(false);
  const hasProactiveTriggeredRef = useRef(false);

  // Audio playback
  const audioQueueRef       = useRef([]);
  const isPlayingAudioRef   = useRef(false);
  const currentAudioRef     = useRef(null);
  const audioCtxRef         = useRef(null);
  const analyserRef         = useRef(null);
  const expressionTimeoutRef = useRef(null);

  // Stream parsing (line-buffered)
  const streamBufferRef  = useRef('');  // Full visible buffer (for UI)
  const lineBufferRef    = useRef('');  // Incomplete current line

  // ─── Generation counter ── prevents stale async callbacks from overriding ──
  // Each new query gets a new generation ID. Callbacks check this before acting.
  const queryGenerationRef = useRef(0);

  // ─── Busy lock — prevents mic restart while AI is active ─────────────────
  const isBusyRef = useRef(false); // true while thinking or speaking

  // ─── Avatar state manager ───────────────────────────────────────────────
  const avatarStateRef = useRef(new AvatarStateManager());
  
  // ─── Audio sync manager ─────────────────────────────────────────────────
  const audioSyncRef = useRef(null);

  // ─── Start the first recording when continuous mic is toggled ON ────────────
  // (Subsequent cycles are driven by handleSegmentEnd, not by this effect)
  const isContinuousMicRef = useRef(false);
  useEffect(() => {
    isContinuousMicRef.current = isContinuousMic;
    if (isContinuousMic && !isBusyRef.current) {
      console.log('[Mic] Continuous mode enabled — starting first recording.');
      startRecording();
    }
  }, [isContinuousMic]);

  const isAsleepRef = useRef(false);
  useEffect(() => {
    isAsleepRef.current = isAsleep;
  }, [isAsleep]);

  const recordUserActivity = () => {
    lastActivityTimeRef.current = Date.now();
    hasProactiveTriggeredRef.current = false;
  };

  const recordSystemActivity = () => {
    lastActivityTimeRef.current = Date.now();
  };

  const wakeUpAvatar = () => {
    if (isAsleepRef.current) {
      console.log('[App] ☀️ Wake up triggered!');
      setIsAsleep(false);
      setIsWakingUp(true);
      setActiveAction('idle');
    }
  };

  useEffect(() => {
    isWakingUpRef.current = isWakingUp;
    if (!isWakingUp) {
      checkAndPlayQueue();
    }
  }, [isWakingUp]);

  useEffect(() => {
    const interval = setInterval(() => {
      // If we are currently talking, thinking, or in wakeup transition, reset the idle timer
      if (isAsleep || isWakingUp || isBusyRef.current || status === 'speaking' || status === 'thinking') {
        recordSystemActivity();
        return;
      }

      const idleTime = Date.now() - lastActivityTimeRef.current;

      // 30 seconds idle -> Raise proactive topic
      if (idleTime >= 30000 && !hasProactiveTriggeredRef.current) {
        hasProactiveTriggeredRef.current = true;
        console.log('[Inactivity] 30s idle limit reached. Raising proactive topic.');
        handleSendMessage('', true);
        return;
      }

      // 60 seconds idle -> Sleep
      if (idleTime >= 60000) {
        console.log('[Inactivity] 60s idle limit reached. Going to sleep.');
        setIsAsleep(true);
        setActiveAction('yawning_and_sleeping');
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isAsleep, isWakingUp, status]);

  // ─── Toggle continuous mic ─────────────────────────────────────────────────
  const toggleContinuousMic = () => {
    if (isContinuousMic) {
      console.log('[Mic] Stopping continuous listening.');
      setIsContinuousMic(false);
      shouldTranscribeRef.current = false;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      setStatus('idle');
    } else {
      console.log('[Mic] Starting continuous listening.');
      setIsContinuousMic(true);
    }
  };

  // ─── Start recording ───────────────────────────────────────────────────────
  const startRecording = async () => {
    // Use isBusyRef (always current) rather than React status state (can be stale in closure)
    if (isBusyRef.current || isPlayingAudioRef.current) {
      console.log('[Mic] Skipping startRecording — AI is busy (isBusy=' + isBusyRef.current + ').');
      return;
    }

    initAudioContext();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Local AudioContext for VAD
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const vadCtx    = new AudioContextClass();
      const vadSource  = vadCtx.createMediaStreamSource(stream);
      const vadAnalyser = vadCtx.createAnalyser();
      vadAnalyser.fftSize = 256;
      vadSource.connect(vadAnalyser);

      // Use timeslice=200 so chunks arrive every 200ms
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current   = [];
      shouldTranscribeRef.current = true;
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (silenceCheckIntervalRef.current) {
          clearInterval(silenceCheckIntervalRef.current);
          silenceCheckIntervalRef.current = null;
        }
        try { vadCtx.close(); } catch (_) {}

        if (!shouldTranscribeRef.current) {
          shouldTranscribeRef.current = true;
          if (isContinuousMicRef.current) {
            restartCycle();
          }
          return;
        }

        if (audioChunksRef.current.length === 0) {
          console.warn('[Mic] No audio chunks captured.');
          setStatus('idle');
          return;
        }

        const mime  = mediaRecorder.mimeType || 'audio/webm';
        let ext     = 'webm';
        if (mime.includes('mp4') || mime.includes('aac') || mime.includes('m4a')) ext = 'm4a';
        else if (mime.includes('ogg')) ext = 'ogg';
        else if (mime.includes('wav')) ext = 'wav';

        const blob = new Blob(audioChunksRef.current, { type: mime });
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;

        await transcribeAudio(blob, ext);
      };

      // ── VAD loop — detects voice activity ─────────────────────────────────
      const bufLen   = vadAnalyser.frequencyBinCount;
      const dataArr  = new Uint8Array(bufLen);
      let hasSpoken = false;
      let lastActive = Date.now();
      let speechStartTime = 0;

      const SPEECH_THRESHOLD  = 0.06; // Increased to ignore breathing, fans, and background noise
      const SILENCE_MS        = 700;   // Silence after speech → submit
      const MAX_WAIT_MS       = 8000;  // Give up if user never speaks

      mediaRecorder.start(200); // Collect chunks every 200ms
      setStatus('listening');
      console.log('[Mic] Recording started (timeslice=200ms)');

      silenceCheckIntervalRef.current = setInterval(() => {
        // ── Auto-mute: ignore mic when AI is speaking ──────────────────────
        if (isPlayingAudioRef.current) return;

        vadAnalyser.getByteTimeDomainData(dataArr);
        let sumSq = 0;
        for (let i = 0; i < bufLen; i++) {
          const n = (dataArr[i] - 128) / 128;
          sumSq += n * n;
        }
        const rms  = Math.sqrt(sumSq / bufLen);
        const now  = Date.now();
        const loud = rms > SPEECH_THRESHOLD;

        if (loud) {
          recordUserActivity();
          if (isAsleepRef.current) {
            console.log('[VAD] 🎤 Speech detected while asleep. Waking up...');
            wakeUpAvatar();
            // Clear any queued responses and stop current playback
            stopSpeechAndQueue();
          }
          if (!hasSpoken) {
            hasSpoken = true;
            speechStartTime = now;
            console.log('[VAD] 🎤 Speech detected — accumulating audio...');
          }
          lastActive = now;
        } else {
          if (hasSpoken && (now - lastActive) > SILENCE_MS) {
            const speechDuration = lastActive - speechStartTime;
            if (speechDuration < 600) {
              console.log(`[VAD] 🤫 Ignored short noise (${speechDuration}ms). Resetting recorder.`);
              shouldTranscribeRef.current = false;
              if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
            } else {
              console.log(`[VAD] 🤫 Silence detected after ${now - lastActive}ms — submitting.`);
              if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
            }
          } else if (!hasSpoken && (now - lastActive) > MAX_WAIT_MS && !isContinuousMic) {
            console.log('[VAD] ⏱ No speech detected — cancelling.');
            shouldTranscribeRef.current = false;
            if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
            setStatus('idle');
          }
        }
      }, 80); // Poll every 80ms for tighter detection

    } catch (err) {
      console.log('[Mic] ❌ getUserMedia error:', err);
      setMessages(prev => [...prev, {
        role: 'system',
        content: `Microphone error: ${err.message}. Please allow mic access.`
      }]);
      setStatus('idle');
    }
  };

  // ─── Transcribe via Groq Whisper ───────────────────────────────────────────
  const transcribeAudio = async (audioBlob, extension = 'webm') => {
    if (!groqKey) {
      alert('Groq API key is missing. Check your .env.local file.');
      setStatus('idle');
      return;
    }

    console.log(`[Whisper] Sending ${(audioBlob.size / 1024).toFixed(1)}KB audio for transcription...`);
    setStatus('thinking');
    setActiveAction('think');

    try {
      const formData = new FormData();
      formData.append('file',  audioBlob, `audio.${extension}`);
      formData.append('model', 'whisper-large-v3');

      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}` },
        body:   formData,
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Whisper ${res.status}: ${err}`);
      }

      const { text: transcript } = await res.json();
      const cleaned = transcript ? transcript.trim() : '';
      console.log(`[Whisper] ✅ Transcript: "${cleaned}"`);

      // ── Garbage filter: reject noise-only or extremely short transcripts ───
      const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
      
      // Known Whisper hallucinations on white noise
      const lowerCleaned = cleaned.toLowerCase().replace(/[^a-z ]/g, '');
      const hallucinations = [
        'thank you', 'thanks for watching', 'im sorry', 'i am sorry',
        'bye', 'tungkono', 'subtitles', 'sous titres', 'you'
      ];
      const isHallucination = hallucinations.some(h => lowerCleaned === h || lowerCleaned.startsWith('thank you'));
      
      const isGarbage = !cleaned || (wordCount < 2 && cleaned.length < 5) || isHallucination;

      if (isGarbage) {
        console.warn(`[Whisper] 🗑 Ignoring garbage/hallucinated transcript "${cleaned}"`);
        isBusyRef.current = false;
        setStatus('idle');
        setActiveAction('idle');
        // Restart the cycle so user can speak again
        restartCycle();
        return;
      }

      await handleSendMessage(cleaned);

    } catch (err) {
      console.log('[Whisper] ❌ Error:', err);
      setMessages(prev => [...prev, { role: 'system', content: `Transcription error: ${err.message}` }]);
      isBusyRef.current = false;
      setStatus('idle');
      setActiveAction('idle');
      restartCycle();
    }
  };

  // ─── Restart the mic cycle after a full round-trip or a no-op (garbage transcript) ──────
  const restartCycle = () => {
    if (isContinuousMicRef.current && !isBusyRef.current) {
      console.log('[Cycle] 🌀 Restarting cycle — listening again.');
      setTimeout(() => {
        if (isContinuousMicRef.current && !isBusyRef.current) startRecording();
      }, 600);
    }
  };

  // ─── Init AudioContext for lip-sync analyser ───────────────────────────────
  const initAudioContext = () => {
    if (!audioCtxRef.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx          = new AudioContext();
      const analyser     = ctx.createAnalyser();
      analyser.fftSize   = 64;
      audioCtxRef.current  = ctx;
      analyserRef.current  = analyser;
      setAudioAnalyser(analyser);
    }
  };

  // ─── Send message to LLM ───────────────────────────────────────────────────
  const handleSendMessage = async (text, isProactive = false) => {
    const query = text || textInput;
    if (!query.trim() && !isProactive) return;
    if (!groqKey) { alert('Groq API key missing.'); return; }

    if (isProactive) {
      recordSystemActivity();
    } else {
      recordUserActivity();
    }

    if (isAsleep) {
      console.log('[LLM] Avatar is asleep. Triggering wakeup sequence.');
      wakeUpAvatar();
    }

    stopSpeechAndQueue();
    initAudioContext();

    // ── Generation stamp: any callbacks from previous queries will abort ──────
    queryGenerationRef.current++;
    const myGen = queryGenerationRef.current;
    isBusyRef.current = true;
    console.log(`[LLM] Generation #${myGen} — Query: "${isProactive ? 'PROACTIVE_TRIGGER' : query}"`);

    if (!isProactive) {
      setMessages(prev => [...prev, { role: 'user', content: query }]);
    }
    setTextInput('');
    setStatus('thinking');
    // If we are waking up, let the wakeup animation run first, otherwise show think animation
    if (!isAsleep) {
      setActiveAction('think');
    }

    // Reset stream buffers
    streamBufferRef.current = '';
    lineBufferRef.current   = '';
    audioQueueRef.current   = [];
    isPlayingAudioRef.current = false;

    // Placeholder for AI message
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const groq = new Groq({ apiKey: groqKey, dangerouslyAllowBrowser: true });

      // Detect user emotion for contextual prompting
      const userEmotion = isProactive ? 'neutral' : detectUserEmotion(text || textInput);
      const systemPrompt = getEmotionalSystemPrompt(userEmotion);

      const responseStream = await groq.chat.completions.create({
        model:  groqModel,
        stream: true,
        max_tokens: 1024,
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
              .filter(m => m.role !== 'system' && m.content && m.content.trim())
              .map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: isProactive ? "Raise a random warm/engaging conversational topic or ask a friendly question to check in on me. Be brief, warm, emotional, and natural." : query },
        ],
      });

      for await (const chunk of responseStream) {
        // Abort if a newer query has started
        if (queryGenerationRef.current !== myGen) {
          console.warn(`[LLM] Gen #${myGen} is stale (current: #${queryGenerationRef.current}) — aborting.`);
          return;
        }

        const delta = chunk.choices[0]?.delta?.content || '';
        if (!delta) continue;

        streamBufferRef.current += delta;
        lineBufferRef.current   += delta;

        // Update UI
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1].content = streamBufferRef.current;
          return updated;
        });

        // Process complete lines (split on newline)
        const lines = lineBufferRef.current.split('\n');
        lineBufferRef.current = lines.pop(); // Keep incomplete trailing line

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            console.log(`[Stream] Processing line: "${trimmed}"`);
            processSegment(trimmed, myGen);
          }
        }
      }

      // Flush any remaining partial line at stream end
      const remaining = lineBufferRef.current.trim();
      if (remaining) {
        console.log(`[Stream] Flushing remaining: "${remaining}"`);
        processSegment(remaining, myGen);
        lineBufferRef.current = '';
      }

      console.log(`[LLM] ✅ Gen #${myGen} stream complete.`);
      // If nothing queued and not playing, go idle
      if (!isPlayingAudioRef.current && audioQueueRef.current.length === 0) {
        isBusyRef.current = false;
        setStatus('idle');
        setActiveAction('idle');
      }

    } catch (err) {
      console.log(`[LLM] ❌ Gen #${myGen} stream error: ${err.message}`, err);
      setMessages(prev => [...prev, { role: 'system', content: `API Error: ${err.message}` }]);
      isBusyRef.current = false;
      setStatus('idle');
      setActiveAction('idle');
    }
  };

  // ─── Process one response segment ─────────────────────────────────────────
  const processSegment = (rawLine, gen) => {
    // Abort if a newer query came in while we were streaming
    if (queryGenerationRef.current !== gen) {
      console.warn(`[Segment] Gen #${gen} stale — skipping.`);
      return;
    }
    const parsed = parseSegment(rawLine);
    if (!parsed) return;

    let { text, action, playSfx } = parsed;
    const isTalkingAction = action === 'talking_happy' || action === 'talking_sadly' || action === 'talking_lips_moment';

    // ─── Rule 1: Physical action + Text = Split into 2 segments ───────────
    if (text && action && !isTalkingAction) {
      // Create physical expression segment first
      const exprItem = {
        id:       Date.now() + Math.random(),
        text:     '',
        action,
        playSfx,
        sfxUrl:   playSfx && action ? `/sfx/${action}.wav` : null,
        audioUrl: null,
        isLoaded: true,
      };

      // Create talking segment after
      const talkItem = {
        id:       Date.now() + Math.random() + 0.1,
        text,
        action:   'talking_happy', // Default to happy talking if no talking action specified
        playSfx:  false,
        sfxUrl:   null,
        audioUrl: null,
        isLoaded: false,
      };

      console.log(`[Queue] Splitting: physical action first → then talking`);
      audioQueueRef.current.push(exprItem);
      audioQueueRef.current.push(talkItem);
      generateVoiceover(talkItem);
      checkAndPlayQueue();

    // ─── Rule 2: Greeting detection (auto-add wave before greeting talk) ────
    } else if (text && isTalkingAction && isGreeting(text)) {
      console.log(`[Segment] Detected greeting. Adding wave animation before talk.`);
      
      // Add wave gesture first
      const waveItem = {
        id:       Date.now() + Math.random(),
        text:     '',
        action:   'Wink_great_with_hand',
        playSfx:  false,
        sfxUrl:   null,
        audioUrl: null,
        isLoaded: true,
      };

      // Then add the talking segment
      const talkItem = {
        id:       Date.now() + Math.random() + 0.1,
        text,
        action,
        playSfx:  false,
        sfxUrl:   null,
        audioUrl: null,
        isLoaded: false,
      };

      audioQueueRef.current.push(waveItem);
      audioQueueRef.current.push(talkItem);
      generateVoiceover(talkItem);
      checkAndPlayQueue();

    // ─── Rule 3: Standard segment ────────────────────────────────────────
    } else {
      const queueItem = {
        id:       Date.now() + Math.random(),
        text,
        action,
        playSfx,
        sfxUrl:   playSfx && action ? `/sfx/${action}.wav` : null,
        audioUrl: null,
        isLoaded: false,
      };

      console.log(`[Queue] Enqueuing segment:`, queueItem);
      audioQueueRef.current.push(queueItem);

      if (text) {
        generateVoiceover(queueItem);
      } else {
        // Expression-only: no TTS needed — mark as ready immediately
        console.log('[Queue] Expression-only segment — skipping TTS.');
        queueItem.isLoaded = true;
        checkAndPlayQueue();
      }
    }
  };

  // ─── Generate TTS via Groq ─────────────────────────────────────────────────
  const generateVoiceover = async (queueItem) => {
    console.log(`[TTS] Requesting voice for: "${queueItem.text}"`);

    try {
      const res = await fetch('https://api.groq.com/openai/v1/audio/speech', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model:           voiceModel,
          input:           queueItem.text,
          voice:           voiceName,
          response_format: 'wav',
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`TTS ${res.status}: ${err}`);
      }

      const blob = await res.blob();
      queueItem.audioUrl = URL.createObjectURL(blob);
      queueItem.isLoaded = true;
      console.log(`[TTS] ✅ Audio ready for: "${queueItem.text}"`);
      checkAndPlayQueue();

    } catch (err) {
      console.log('[TTS] ❌ Failed:', err);
      // Mark loaded but no URL → will use browser TTS fallback
      queueItem.audioUrl = null;
      queueItem.isLoaded = true;
      checkAndPlayQueue();
    }
  };

  // ─── Queue player ──────────────────────────────────────────────────────────
  const checkAndPlayQueue = () => {
    console.log(`[Queue] Check — length:${audioQueueRef.current.length}, playing:${isPlayingAudioRef.current}, waking:${isWakingUpRef.current}, pausing:${isPausingRef.current}`);
    if (isPlayingAudioRef.current) return;
    if (isWakingUpRef.current) {
      console.log('[Queue] Blocked queue playback — waking up in progress.');
      return;
    }
    if (isPausingRef.current) {
      console.log('[Queue] Blocked queue playback — inter-segment pause in progress.');
      return;
    }
    if (audioQueueRef.current.length === 0) return;

    const next = audioQueueRef.current[0];
    if (!next.isLoaded) {
      console.log(`[Queue] Next item not loaded yet — waiting...`);
      return;
    }

    audioQueueRef.current.shift();
    playSegment(next);
  };

  // ─── Play one segment ──────────────────────────────────────────────────────
  const playSegment = (item) => {
    console.log(`[Play] ▶️ Playing segment:`, item);
    recordSystemActivity();
    isPlayingAudioRef.current = true;
    setStatus('speaking');
    setIsSpeaking(true);

    if (expressionTimeoutRef.current) {
      clearTimeout(expressionTimeoutRef.current);
      expressionTimeoutRef.current = null;
    }

    // ── Set animation for this segment ─────────────────────────────────────
    if (item.action) {
      setActiveAction(item.action);
      if (item.action === 'yawning_and_sleeping') {
        console.log('[Play] yawn/sleep action triggered. Entering sleep state.');
        setIsAsleep(true);
      }
    } else if (item.text) {
      // Default to talking_lips_moment for text without explicit action
      setActiveAction('talking_lips_moment');
    } else {
      // No action and no text → shouldn't happen, but fallback to idle
      setActiveAction('idle');
    }

    // ── Expression-only: no audio to play ──────────────────────────────────
    if (!item.text) {
      console.log(`[Play] Expression-only — waiting for animation then moving on.`);
      // Wait a moment for the animation to play, then advance queue
      expressionTimeoutRef.current = setTimeout(() => {
        expressionTimeoutRef.current = null;
        handleSegmentEnd();
      }, 2000);
      return;
    }

    // ── SFX-then-TTS (e.g. laugh with text after) ──────────────────────────
    if (item.playSfx && item.sfxUrl && item.text) {
      console.log(`[Play] 🔊 Playing SFX first, then TTS...`);
      const sfxAudio = new Audio(item.sfxUrl);
      sfxAudio.onended = () => {
        console.log(`[Play] SFX done — starting TTS.`);
        if (item.audioUrl) {
          playHtmlAudio(item);
        } else {
          playBrowserTTS(item.text);
        }
      };
      sfxAudio.onerror = () => {
        console.warn(`[Play] SFX failed — jumping straight to TTS.`);
        if (item.audioUrl) playHtmlAudio(item);
        else playBrowserTTS(item.text);
      };
      sfxAudio.play().catch(e => {
        console.error('[Play] SFX play blocked:', e);
        if (item.audioUrl) playHtmlAudio(item);
        else playBrowserTTS(item.text);
      });
      return;
    }

    // ── SFX-only (no text) ────────────────────────────────────────────────
    if (item.playSfx && item.sfxUrl && !item.text) {
      console.log(`[Play] 🔊 SFX-only segment.`);
      const sfxAudio = new Audio(item.sfxUrl);
      sfxAudio.onended = () => handleSegmentEnd();
      sfxAudio.onerror = () => handleSegmentEnd();
      sfxAudio.play().catch(() => handleSegmentEnd());
      return;
    }

    // ── Standard TTS playback ─────────────────────────────────────────────
    if (item.audioUrl) {
      playHtmlAudio(item);
    } else {
      playBrowserTTS(item.text);
    }
  };

  // ─── Play HTML audio element ───────────────────────────────────────────────
  const playHtmlAudio = (item) => {
    const audio = new Audio(item.audioUrl);
    currentAudioRef.current = audio;

    // Connect to analyser for lip-sync
    if (audioCtxRef.current && analyserRef.current) {
      try {
        if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
        const src = audioCtxRef.current.createMediaElementSource(audio);
        src.connect(analyserRef.current);
        analyserRef.current.connect(audioCtxRef.current.destination);
      } catch (_) { /* already connected */ }
    }

    // Initialize audio sync manager if needed
    if (!audioSyncRef.current && analyserRef.current) {
      audioSyncRef.current = new AudioSyncManager(audioCtxRef.current, analyserRef.current);
    }

    // Wait for audio metadata to load, then set duration for animation sync
    audio.addEventListener('loadedmetadata', () => {
      const duration = audio.duration || 0;
      if (duration > 0) {
        setAudioDuration(duration);
        console.log(`[Audio] Duration: ${duration.toFixed(2)}s — Animation sync enabled`);
      }
    }, { once: true });

    audio.play().catch(e => {
      console.error('[Audio] Playback failed, using browser TTS:', e);
      playBrowserTTS(item.text);
    });

    audio.onended = () => {
      console.log('[Audio] ✅ Playback finished.');
      setAudioDuration(0); // Reset duration
      handleSegmentEnd();
    };
    audio.onerror = () => {
      console.warn('[Audio] Error — fallback to browser TTS.');
      setAudioDuration(0);
      playBrowserTTS(item.text);
    };
  };

  // ─── Browser TTS fallback ──────────────────────────────────────────────────
  const playBrowserTTS = (text) => {
    // Strip TTS voice expression tags before reading aloud
    const cleanText = text.replace(/\[[a-zA-Z\s]+\]/g, '').replace(/\s+/g, ' ').trim();
    console.log(`[BrowserTTS] Fallback: "${cleanText}"`);

    // Estimate audio duration for animation sync: ~150 words per minute = 0.4 seconds per word
    const wordCount = cleanText.split(/\s+/).length;
    const estimatedDuration = Math.max(1, wordCount * 0.4);
    setAudioDuration(estimatedDuration);
    console.log(`[BrowserTTS] Estimated duration: ${estimatedDuration.toFixed(2)}s (${wordCount} words)`);

    const utterance = new SpeechSynthesisUtterance(cleanText);
    const hasHindi  = /[\u0900-\u097F]/.test(text);
    const voices    = window.speechSynthesis.getVoices();

    let voice = null;
    if (hasHindi) {
      voice = voices.find(v => v.lang.startsWith('hi') || v.name.toLowerCase().includes('hindi'));
    } else {
      voice = voices.find(v =>
        v.lang.startsWith('en') && (
          v.name.toLowerCase().includes('female') ||
          v.name.toLowerCase().includes('zira')   ||
          v.name.toLowerCase().includes('samantha') ||
          v.name.toLowerCase().includes('hazel')
        )
      );
    }

    if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
    else        { utterance.lang = hasHindi ? 'hi-IN' : 'en-US'; }

    console.log(`[BrowserTTS] Voice: ${voice?.name ?? 'default'}`);
    utterance.onend  = () => { 
      console.log('[BrowserTTS] Done.'); 
      setAudioDuration(0);
      handleSegmentEnd(); 
    };
    utterance.onerror = (e) => { 
      console.error('[BrowserTTS] Error:', e); 
      setAudioDuration(0);
      handleSegmentEnd(); 
    };
    window.speechSynthesis.speak(utterance);
  };

  // ─── On segment end ────────────────────────────────────────────────────────
  const handleSegmentEnd = () => {
    isPlayingAudioRef.current = false;
    setIsSpeaking(false);
    currentAudioRef.current = null;
    recordSystemActivity();

    if (audioQueueRef.current.length > 0) {
      console.log('[Cycle] Segment complete. Pausing 700ms before next...');
      isPausingRef.current = true;
      setTimeout(() => {
        isPausingRef.current = false;
        checkAndPlayQueue();
      }, 700);
    } else {
      // ── Full cycle complete ─────────────────────────────────────────
      console.log('[Cycle] ✅ Speak done — returning to idle.');
      isBusyRef.current = false;
      setStatus('idle');
      setActiveAction('idle');

      // Restart listening only after the full cycle is done
      restartCycle();
    }
  };

  // ─── Stop everything ───────────────────────────────────────────────────────
  const stopSpeechAndQueue = () => {
    if (expressionTimeoutRef.current) {
      clearTimeout(expressionTimeoutRef.current);
      expressionTimeoutRef.current = null;
    }
    isPausingRef.current = false;
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    try { window.speechSynthesis.cancel(); } catch (_) {}
    audioQueueRef.current     = [];
    isPlayingAudioRef.current = false;
    setIsSpeaking(false);
  };

  // ─── Reset conversation ────────────────────────────────────────────────────
  const handleReset = () => {
    stopSpeechAndQueue();
    setIsAsleep(false);
    setIsWakingUp(false);
    setStatus('idle');
    setActiveAction('idle');
    setMessages([{ role: 'system', content: 'Conversation reset. Ready for your input.' }]);
    console.log('[App] Conversation reset.');
    recordUserActivity();
  };

  const toggleSpeaker = () => {
    recordUserActivity();
    setSpeakerMuted(prev => {
      if (!prev) stopSpeechAndQueue();
      return !prev;
    });
  };

  const handleWakeUpComplete = () => {
    console.log('[App] Wake up complete. Transitioning isWakingUp to false.');
    setIsWakingUp(false);
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="call-screen">
      {/* Avatar */}
      <div className="avatar-fullscreen">
        <AvatarPlayer
          currentAction={activeAction}
          isSpeaking={isSpeaking}
          audioAnalyser={audioAnalyser}
          isAsleep={isAsleep}
          onWakeUpComplete={handleWakeUpComplete}
          audioDuration={audioDuration}
        />
      </div>

      {/* Status indicator */}
      <div className="status-ping">
        <span className={`ping-dot ${status}`} />
        <span className="ping-label">
          {status === 'idle'      && 'Ready'}
          {status === 'listening' && 'Listening…'}
          {status === 'thinking'  && 'Thinking…'}
          {status === 'speaking'  && 'Speaking'}
        </span>
      </div>

      {/* Controls */}
      <div className="call-bottom-bar">
        <div className="call-controls">
          {/* Speaker */}
          <button
            className={`ctrl-btn speaker ${speakerMuted ? '' : 'active'}`}
            onClick={toggleSpeaker}
            title={speakerMuted ? 'Unmute speaker' : 'Mute speaker'}
          >
            {speakerMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
          </button>

          {/* Mic */}
          <button
            className={`ctrl-btn mic ${isContinuousMic ? 'recording' : ''}`}
            onClick={toggleContinuousMic}
            title={isContinuousMic ? 'Stop listening' : 'Start listening'}
          >
            {isContinuousMic ? <MicOff size={28} /> : <Mic size={28} />}
          </button>

          {/* End / Reset */}
          <button className="ctrl-btn end-call" onClick={handleReset} title="Reset conversation">
            <PhoneOff size={22} />
          </button>
        </div>
      </div>
    </div>
  );
}
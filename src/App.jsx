import React, { useState, useEffect, useRef } from 'react';
import { Groq } from 'groq-sdk';
import { Mic, MicOff, Volume2, VolumeX, PhoneOff } from 'lucide-react';
import AvatarPlayer from './components/AvatarPlayer';
import { parseSegment } from './utils/responseParser';

export default function App() {
  // ─── API keys ──────────────────────────────────────────────────────────────
  const [groqKey]   = useState(import.meta.env.VITE_GROQ_API_KEY);
  const [groqModel] = useState(import.meta.env.VITE_GROQ_MODEL);

  // ─── App state ─────────────────────────────────────────────────────────────
  const [status, setStatus] = useState('idle'); // idle | listening | thinking | speaking

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

  // ─── Mic state ─────────────────────────────────────────────────────────────
  const [isContinuousMic, setIsContinuousMic] = useState(false);

  // ─── Refs ──────────────────────────────────────────────────────────────────
  const mediaRecorderRef        = useRef(null);
  const audioChunksRef          = useRef([]);
  const streamRef               = useRef(null);
  const silenceCheckIntervalRef = useRef(null);
  const shouldTranscribeRef     = useRef(true);

  // Audio playback
  const audioQueueRef       = useRef([]);
  const isPlayingAudioRef   = useRef(false);
  const currentAudioRef     = useRef(null);
  const audioCtxRef         = useRef(null);
  const analyserRef         = useRef(null);

  // Stream parsing (line-buffered)
  const streamBufferRef  = useRef('');  // Full visible buffer (for UI)
  const lineBufferRef    = useRef('');  // Incomplete current line

  // ─── Generation counter ── prevents stale async callbacks from overriding ──
  // Each new query gets a new generation ID. Callbacks check this before acting.
  const queryGenerationRef = useRef(0);

  // ─── Busy lock — prevents mic restart while AI is active ─────────────────
  const isBusyRef = useRef(false); // true while thinking or speaking

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
  const handleSendMessage = async (text) => {
    const query = text || textInput;
    if (!query.trim()) return;
    if (!groqKey) { alert('Groq API key missing.'); return; }

    stopSpeechAndQueue();
    initAudioContext();

    // ── Generation stamp: any callbacks from previous queries will abort ──────
    queryGenerationRef.current++;
    const myGen = queryGenerationRef.current;
    isBusyRef.current = true;
    console.log(`[LLM] Generation #${myGen} — Query: "${query}"`);

    setMessages(prev => [...prev, { role: 'user', content: query }]);
    setTextInput('');
    setStatus('thinking');
    setActiveAction('think');

    // Reset stream buffers
    streamBufferRef.current = '';
    lineBufferRef.current   = '';
    audioQueueRef.current   = [];
    isPlayingAudioRef.current = false;

    // Placeholder for AI message
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const groq = new Groq({ apiKey: groqKey, dangerouslyAllowBrowser: true });

      const systemPrompt = `You are Sana, a warm, expressive, female AI avatar who communicates both verbally and physically.

RESPONSE FORMAT — MANDATORY:
- Every response is made of 1-4 line-separated SEGMENTS
- Each segment: [action:NAME][emotion:NAME] spoken text here
- Add [sfx] only for laugh or yawning_and_sleeping actions to play real sound effects
- If you only want to react physically (no words), leave out the text part

AVAILABLE ACTIONS:
think, laugh, playing, blink, yawning_and_sleeping, moving hand, shy, surprised_and_smiling, touching_her_hair, Wink_great_with_hand

AVAILABLE EMOTIONS:
happy, sad, normal, excited, confused

GREETING RULE (IMPORTANT):
- If the user says hi, hello, or greets you, always start your response with the [action:Wink_great_with_hand] action to wave and greet them (e.g. "[action:Wink_great_with_hand][emotion:happy] Hello! Nice to meet you!").

LAUGH RULES (IMPORTANT):
- "[action:laugh][sfx] ha, that is funny!" → SFX laugh plays, voice says the text WITHOUT [laughs] tag
- "[action:laugh][sfx]" (no text) → ONLY the SFX plays, no speech at all
- "that is funny [laughs]!" → No SFX, voice laughs inline, use talking_happy animation (no [action:laugh])

EXPRESSION-ONLY (no TTS) EXAMPLES:
- "[action:blink][emotion:confused]" → just blinks, no talking
- "[action:shy][emotion:happy]" → shy expression, no talking

FULL EXAMPLES:
[action:think][emotion:normal] Hmm, let me think about that for a moment...
[action:laugh][sfx][emotion:happy] Oh that is absolutely hilarious!
[action:yawning_and_sleeping][sfx][emotion:sad] I am so tired right now.
[action:blink][emotion:confused]

In gender-conjugating languages like Hindi, always use feminine conjugations.
Keep total response to 2-4 segments. Be warm, natural, and expressive.`;

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
          { role: 'user', content: query },
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

    const { text, action, emotion, playSfx } = parsed;

    const queueItem = {
      id:       Date.now() + Math.random(),
      text,
      action,
      emotion,
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
          model:'canopylabs/orpheus-v1-english',
          input:queueItem.text,
          voice:'hannah',
          response_format:'wav',
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
    console.log(`[Queue] Check — length:${audioQueueRef.current.length}, playing:${isPlayingAudioRef.current}`);
    if (isPlayingAudioRef.current) return;
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
    isPlayingAudioRef.current = true;
    setStatus('speaking');
    setIsSpeaking(true);

    // ── Set animation for this segment ─────────────────────────────────────
    // Priority: If there is text, she must use a talking animation to match the audio
    if (item.text && !item.playSfx) {
      if (item.emotion === 'happy') setActiveAction('talking_happy');
      else if (item.emotion === 'sad') setActiveAction('talking_sadly');
      else setActiveAction('talking_lips_moment');
    } else if (item.action) {
      setActiveAction(item.action);
    } else if (item.emotion === 'happy') {
      setActiveAction('talking_happy');
    } else if (item.emotion === 'sad') {
      setActiveAction('talking_sadly');
    } else {
      setActiveAction('talking_lips_moment');
    }

    // ── Expression-only: no audio to play ──────────────────────────────────
    if (!item.text) {
      console.log(`[Play] Expression-only — waiting for animation then moving on.`);
      // Wait a moment for the animation to play, then advance queue
      setTimeout(() => {
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

    audio.play().catch(e => {
      console.error('[Audio] Playback failed, using browser TTS:', e);
      playBrowserTTS(item.text);
    });

    audio.onended = () => {
      console.log('[Audio] ✅ Playback finished.');
      handleSegmentEnd();
    };
    audio.onerror = () => {
      console.warn('[Audio] Error — fallback to browser TTS.');
      playBrowserTTS(item.text);
    };
  };

  // ─── Browser TTS fallback ──────────────────────────────────────────────────
  const playBrowserTTS = (text) => {
    // Strip TTS voice expression tags before reading aloud
    const cleanText = text.replace(/\[[a-zA-Z\s]+\]/g, '').replace(/\s+/g, ' ').trim();
    console.log(`[BrowserTTS] Fallback: "${cleanText}"`);

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
    utterance.onend  = () => { console.log('[BrowserTTS] Done.'); handleSegmentEnd(); };
    utterance.onerror = (e) => { console.error('[BrowserTTS] Error:', e); handleSegmentEnd(); };
    window.speechSynthesis.speak(utterance);
  };

  // ─── On segment end ────────────────────────────────────────────────────────
  const handleSegmentEnd = () => {
    isPlayingAudioRef.current = false;
    setIsSpeaking(false);
    currentAudioRef.current = null;

    if (audioQueueRef.current.length > 0) {
      checkAndPlayQueue();
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
    setStatus('idle');
    setActiveAction('idle');
    setMessages([{ role: 'system', content: 'Conversation reset. Ready for your input.' }]);
    console.log('[App] Conversation reset.');
  };

  const toggleSpeaker = () => {
    setSpeakerMuted(prev => {
      if (!prev) stopSpeechAndQueue();
      return !prev;
    });
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
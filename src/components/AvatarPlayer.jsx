import React, { useEffect, useRef, useState } from 'react';
import { calculateAudioSyncTiming, getFrameDelay } from '../utils/animationAudioSync';

// ─── Frame counts per action ────────────────────────────────────────────────
const ACTION_FRAMES = {
  idle:                 98,
  laugh:                74,
  playing:              98,
  think:                74,
  talking_happy:        98,
  talking_sadly:        41,
  talking_lips_moment:  55,
  yawning_and_sleeping: 81,
  wink_great_with_hand: 98,
  shy:                  98,
  surprised_and_smiling: 98,
  touching_her_hair:    98,
  flying_kiss:          98,
  kiss_on_screen:       98,
};

// ─── FPS per action type ─────────────────────────────────────────────────────
// Talking animations get higher FPS for smooth lip-sync
const ACTION_FPS = {
  idle:                 12,
  laugh:                12,
  playing:              12,
  think:                12,
  talking_happy:        12,
  talking_sadly:        12,
  talking_lips_moment:  12,
  yawning_and_sleeping: 12,
  wink_great_with_hand: 12,
  shy:                  12,
  surprised_and_smiling: 12,
  touching_her_hair:    12,
  flying_kiss:          12,
  kiss_on_screen:       12,
};

// ─── Action behaviour types ───────────────────────────────────────────────────
// LOOP: Restart from frame 1 when done (used for talking & continuous animations)
const LOOP_ACTIONS = new Set([
  'talking_happy', 'talking_sadly', 'talking_lips_moment',
  'flying_kiss', 'kiss_on_screen',
]);

// LOOP_ONLY: Play forward and loop without reversing (first frame = last frame)
const LOOP_ONLY_ACTIONS = new Set([
  'playing',
]);

// IDLE_LOOP: Idle ping-pong animations
const IDLE_ACTIONS = new Set([
  'idle', 'blink', 'moving hand', 'think',
  'wink_great_with_hand', 'surprised_and_smiling', 'touching_her_hair'
]);

// PLAY_ONCE: Reverse back to frame 1 after completing (one-shot expressions)
// (everything else is play-once)

// Actions that trigger SFX when they start playing
const SFX_ACTIONS = new Set(['laugh', 'yawning_and_sleeping']);

export default function AvatarPlayer({
  currentAction = 'idle',
  isSpeaking = false,
  audioAnalyser = null,
  onActionComplete = null,
  isAsleep = false,
  onWakeUpComplete = null,
  audioDuration = 0, // NEW: Audio duration in seconds for sync timing
}) {
  const canvasRef = useRef(null);

  // ─── Displayable state ─────────────────────────────────────────────────────
  const [action, setAction]             = useState('idle');
  const [frameIndex, setFrameIndex]     = useState(1);
  const [isReversing, setIsReversing]   = useState(false);

  // ─── Internal loop state (refs avoid stale closures in setTimeout) ─────────
  const stateRef = useRef({
    action:      'idle',
    frameIndex:  1,
    isReversing: false,
    nextAction:  null,
    // Audio sync state
    audioStartTime: null,
    audioSyncTiming: null,
  });

  // Sync isSpeaking into a ref so the loop can read the current value
  const isSpeakingRef = useRef(isSpeaking);
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);

  // Track audio duration for animation sync
  const audioDurationRef = useRef(audioDuration);
  useEffect(() => { 
    audioDurationRef.current = audioDuration;
    // When audio duration changes (new audio starting), calculate sync timing
    if (audioDuration > 0 && isSpeakingRef.current) {
      const totalFrames = ACTION_FRAMES[stateRef.current.action] || 98;
      const timing = calculateAudioSyncTiming(audioDuration, totalFrames);
      stateRef.current.audioSyncTiming = timing;
      stateRef.current.audioStartTime = Date.now();
      console.log(`[AvatarPlayer] Audio sync enabled: ${audioDuration.toFixed(2)}s audio → ${timing.forwardFps.toFixed(1)} FPS forward`, timing.debugInfo);
    }
  }, [audioDuration]);

  const currentActionRef = useRef(currentAction);
  useEffect(() => { currentActionRef.current = currentAction; }, [currentAction]);

  const isAsleepRef = useRef(isAsleep);
  useEffect(() => {
    isAsleepRef.current = isAsleep;
    if (!isAsleep && stateRef.current.action === 'yawning_and_sleeping' && stateRef.current.frameIndex === (ACTION_FRAMES['yawning_and_sleeping'] || 81)) {
      console.log('[AvatarPlayer] ☀️ Awake triggered! Reversing sleep animation...');
      stateRef.current.isReversing = true;
      setIsReversing(true);
    }
  }, [isAsleep]);

  // ─── Image cache ───────────────────────────────────────────────────────────
  const imageCacheRef = useRef({});
  const cacheVersionRef = useRef(Date.now()); // Cache-busting parameter
  const clickToggleRef = useRef('wink_great_with_hand');
  const isClickedGestureRef = useRef(false);

  // ─── Force clear cache on component mount (hard reset) ────────────────────
  useEffect(() => {
    imageCacheRef.current = {}; // Clear all cached images
    cacheVersionRef.current = Date.now(); // Update cache-bust version
  }, []);

  // ─── 1. Pre-load frames ────────────────────────────────────────────────────
  useEffect(() => {
    const allActions = Object.keys(ACTION_FRAMES);
    const prioritized = [
      currentAction,
      'idle',
      'talking_lips_moment',
      ...allActions.filter(a => a !== currentAction && a !== 'idle' && a !== 'talking_lips_moment'),
    ];

    prioritized.forEach((act) => {
      const total = ACTION_FRAMES[act];
      if (!total) {
        console.warn(`[AvatarPlayer] Unknown action "${act}" — no frame count in ACTION_FRAMES.`);
        return;
      }
      for (let i = 1; i <= total; i++) {
        const key = `${act}_${i}`;
        if (!imageCacheRef.current[key]) {
          const img = new Image();
          img.src = `/avatar/${act}/${act}_${i}.jpg?v=${cacheVersionRef.current}`;
          img.onload = () => {
            imageCacheRef.current[key] = img;
            if (act === stateRef.current.action && i === stateRef.current.frameIndex) {
              drawFrame(act, i);
            }
          };
          img.onerror = () => {
            console.error(`[AvatarPlayer] ❌ Missing frame: /avatar/${act}/${act}_${i}.jpg`);
          };
        }
      }
    });
  }, [currentAction]);

  // ─── 2. React to external action changes ──────────────────────────────────
  useEffect(() => {
    const cur = stateRef.current;

    // If external action requests 'idle' and we are already playing an idle variant, ignore it
    if (currentAction === 'idle' && IDLE_ACTIONS.has(cur.action)) {
      return;
    }

    if (currentAction === cur.action && !cur.nextAction) return;

    console.log(`[AvatarPlayer] Action request: "${cur.action}" → "${currentAction}"`);

    // Only allow instant cuts between actions that share the exact same base body pose (talking/idle)
    // This ensures that when audio stops, talking instantly stops, but physical reactions smoothly reverse.
    const isBasePose = (act) => LOOP_ACTIONS.has(act) || LOOP_ONLY_ACTIONS.has(act) || act === 'idle' || act === 'blink';
    const isInstantCut = isBasePose(cur.action) && isBasePose(currentAction);

    if (isInstantCut) {
      console.log(`[AvatarPlayer] ⚡ Instant cut → "${currentAction}" (base pose)`);
      cur.isReversing = false;
      cur.nextAction  = null;
      cur.frameIndex  = 1;
      cur.action      = currentAction;
      setAction(currentAction);
      setIsReversing(false);
      setFrameIndex(1);
    } else {
      // ── Always queue smooth transition
      // This reverses the current action back to frame 1 before switching
      console.log(`[AvatarPlayer] 🔄 Queuing smooth transition → "${currentAction}"`);
      cur.nextAction  = currentAction;
      cur.isReversing = true;
      setIsReversing(true);
    }
  }, [currentAction]);

  // ─── 3. Canvas drawing helper ──────────────────────────────────────────────
  const drawFrame = (actionName, frameNum) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = imageCacheRef.current[`${actionName}_${frameNum}`];

    if (!img) {
      ctx.fillStyle = '#0f111a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const dpr      = window.devicePixelRatio || 1;
    const displayW = canvas.clientWidth;
    const displayH = canvas.clientHeight;
    const bufferW  = Math.round(displayW * dpr);
    const bufferH  = Math.round(displayH * dpr);

    if (canvas.width !== bufferW || canvas.height !== bufferH) {
      canvas.width  = bufferW;
      canvas.height = bufferH;
    }

    ctx.imageSmoothingEnabled  = true;
    ctx.imageSmoothingQuality  = 'high';

    const imgRatio    = img.naturalWidth / img.naturalHeight;
    const canvasRatio = bufferW / bufferH;
    let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;

    if (imgRatio > canvasRatio) {
      sw = img.naturalHeight * canvasRatio;
      sx = (img.naturalWidth - sw) / 2;
    } else {
      sh = img.naturalWidth / canvasRatio;
      sy = (img.naturalHeight - sh) / 2;
    }

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, bufferW, bufferH);
  };

  // ─── 4. Main animation loop ────────────────────────────────────────────────
  useEffect(() => {
    let timer;

    const updateFrame = () => {
      const cur = stateRef.current;
      const totalFrames = ACTION_FRAMES[cur.action] || 64;
      let fps         = ACTION_FPS[cur.action]    || 12;
      let delay       = 1000 / fps;

      // ── AUDIO-SYNCED TIMING for talking animations ──────────────────────
      const isTalkingAction = cur.action === 'talking_happy' || 
                             cur.action === 'talking_sadly' || 
                             cur.action === 'talking_lips_moment';
      
      if (isTalkingAction && cur.audioSyncTiming && cur.audioStartTime && isSpeakingRef.current) {
        const elapsedMs = Date.now() - cur.audioStartTime;
        const elapsedSeconds = elapsedMs / 1000;
        const halfDuration = cur.audioSyncTiming.totalDuration / 2;

        // ── Determine phase: forward or reverse ──────────────────────────
        const isForwardPhase = elapsedSeconds < halfDuration;

        if (isForwardPhase) {
          // ── FORWARD PHASE: Play frames 1→totalFrames during first half ──
          fps = cur.audioSyncTiming.forwardFps;
          delay = getFrameDelay(fps);

          // Calculate which frame should be playing at this time
          const frameProgress = elapsedSeconds / halfDuration; // 0 to 1
          const targetFrame = Math.ceil(frameProgress * totalFrames);
          cur.frameIndex = Math.max(1, Math.min(targetFrame, totalFrames));
          cur.isReversing = false;

        } else {
          // ── REVERSE PHASE: Play frames totalFrames→1 during second half ──
          if (!cur.isReversing) {
            cur.isReversing = true;
            setIsReversing(true);
          }

          fps = cur.audioSyncTiming.reverseFps;
          delay = getFrameDelay(fps);

          // Calculate which frame should be playing in reverse
          const timeIntoReverse = elapsedSeconds - halfDuration;
          const reverseProgress = timeIntoReverse / halfDuration; // 0 to 1
          const targetFrame = totalFrames - Math.floor(reverseProgress * (totalFrames - 1));
          cur.frameIndex = Math.max(1, Math.min(targetFrame, totalFrames));
        }
      } else if (cur.isReversing && cur.nextAction) {
        // ── Fast reverse when transitioning to next action ─────────────────
        fps = 48;
        delay = getFrameDelay(fps);
      }

      // ── Original animation loop logic ────────────────────────────────────
      if (cur.isReversing) {
        // ── Reversing back to frame 1
        const prevFrame = cur.frameIndex - 1;
        if (prevFrame <= 1) {
          cur.frameIndex  = 1;
          cur.isReversing = false;
          setIsReversing(false);
          const wasSleepReverse = (cur.action === 'yawning_and_sleeping');

          if (cur.nextAction) {
            // ── Switch to queued action
            const next = cur.nextAction;
            console.log(`[AvatarPlayer] ▶️ Transition complete → "${next}"`);

            // Play SFX for eligible actions when frames start
            if (SFX_ACTIONS.has(next)) {
              console.log(`[AvatarPlayer] 🔊 Playing SFX: /sfx/${next}.wav`);
              const sfx = new Audio(`/sfx/${next}.wav`);
              sfx.play().catch(e => console.error('[AvatarPlayer] SFX failed:', e));
            }

            cur.action     = next;
            cur.nextAction = null;
            cur.audioSyncTiming = null; // Reset audio sync for new action
            cur.audioStartTime = null;
            setAction(next);
            } else if (currentActionRef.current !== 'idle' && currentActionRef.current === cur.action && (IDLE_ACTIONS.has(cur.action) || LOOP_ACTIONS.has(cur.action) || LOOP_ONLY_ACTIONS.has(cur.action))) {
            // ── Keep looping the active requested action (except default idle)
            // No state change needed, it will naturally play forward
          } else {
            // ── Return to a default fallback action (play-once ended, or idle variation switch)
            let nextAct = 'idle';
            if (isSpeakingRef.current) {
              nextAct = 'talking_lips_moment'; // Fallback to talking if we're speaking and the one-shot action ended
            } else if (currentActionRef.current === 'think') {
              nextAct = 'think'; // Fallback to think if we are supposed to be thinking
            } else {
              nextAct = pickIdleVariant();
            }
            cur.action = nextAct;
            cur.audioSyncTiming = null;
            cur.audioStartTime = null;
            setAction(nextAct);
          }

          if (wasSleepReverse && onWakeUpComplete) {
            console.log('[AvatarPlayer] onWakeUpComplete triggered!');
            onWakeUpComplete();
          }
        } else {
          cur.frameIndex = prevFrame;
        }

      } else {
        // ── Forward play (only if NOT audio-synced)
        if (!isTalkingAction || !cur.audioSyncTiming || !isSpeakingRef.current) {
          const nextFrame = cur.frameIndex + 1;
          const maxFrames = (isClickedGestureRef.current && cur.action === 'surprised_and_smiling') ? 50 : totalFrames;

          if (nextFrame > maxFrames) {
            if (cur.action === 'yawning_and_sleeping' && isAsleepRef.current) {
              // Freeze at the last frame
              cur.frameIndex = totalFrames;
            } else if (cur.nextAction) {
              // Queued action waiting — start reversing
              cur.isReversing = true;
              cur.frameIndex  = maxFrames - 1;
              setIsReversing(true);
              isClickedGestureRef.current = false;

            } else if (LOOP_ACTIONS.has(cur.action) || LOOP_ONLY_ACTIONS.has(cur.action)) {
              // ── Loop: restart from frame 1 (for talking animations & looping actions)
              cur.frameIndex = 1;

            } else if (IDLE_ACTIONS.has(cur.action)) {
              // ── Idle ping-pong: reverse direction
              cur.isReversing = true;
              cur.frameIndex  = maxFrames - 1;
              setIsReversing(true);
              isClickedGestureRef.current = false;

            } else {
              // ── Play-once action complete: reverse back to idle
              cur.isReversing = true;
              cur.frameIndex  = maxFrames - 1;
              setIsReversing(true);
              isClickedGestureRef.current = false;
              if (onActionComplete) onActionComplete(cur.action);
            }
          } else {
            cur.frameIndex = nextFrame;
          }
        }
      }

      setFrameIndex(cur.frameIndex);
      drawFrame(cur.action, cur.frameIndex);
      timer = setTimeout(updateFrame, delay);
    };

    timer = setTimeout(updateFrame, 1000 / (ACTION_FPS['idle'] || 12));
    return () => clearTimeout(timer);
  }, [onActionComplete, onWakeUpComplete]);

  // ─── 5. Idle variation picker ──────────────────────────────────────────────
  const pickIdleVariant = () => {
    const rand = Math.random();
    // 70% chance to remain in default resting idle pose
    if (rand < 0.70) return 'idle';

    // 30% chance to play a random active gesture (think excluded)
    const actionRand = Math.random();
    if (actionRand > 0.82) return 'blink';
    if (actionRand > 0.65) return 'moving hand';
    if (actionRand > 0.48) return 'playing';
    if (actionRand > 0.31) return 'touching_her_hair';
    if (actionRand > 0.15) return 'wink_great_with_hand';
    return 'surprised_and_smiling';
  };

  // ─── 6. Manual trigger (debug overlay) ────────────────────────────────────
  const triggerManualAction = (act) => {
    console.log(`[AvatarPlayer] 🖱️ Manual trigger: "${act}"`);
    const cur = stateRef.current;

    // User gesture → safe to play SFX immediately
    if (SFX_ACTIONS.has(act)) {
      console.log(`[AvatarPlayer] 🔊 Manual SFX: /sfx/${act}.wav`);
      const sfx = new Audio(`/sfx/${act}.wav`);
      sfx.play().catch(e => console.error('[AvatarPlayer] Manual SFX failed:', e));
    }

    if (cur.action !== act) {
      // Instant cut for loop actions, smooth for others
      if (LOOP_ACTIONS.has(act) || LOOP_ONLY_ACTIONS.has(act) || IDLE_ACTIONS.has(cur.action)) {
        cur.isReversing = false;
        cur.nextAction  = null;
        cur.frameIndex  = 1;
        cur.action      = act;
        setAction(act);
        setIsReversing(false);
      } else {
        cur.nextAction  = act;
        cur.isReversing = true;
        setIsReversing(true);
      }
    }
  };

  // ─── 7. Body Click Gesture ────────────────────────────────────────────────
  const triggerClickGesture = () => {
    const act = clickToggleRef.current;
    console.log(`[AvatarPlayer] 🎯 Body click gesture triggered: "${act}"`);

    // Toggle the action for the next click
    clickToggleRef.current = act === 'wink_great_with_hand' ? 'surprised_and_smiling' : 'wink_great_with_hand';

    const cur = stateRef.current;
    isClickedGestureRef.current = true;

    // Transition to the clicked action
    if (cur.action !== act) {
      cur.nextAction  = act;
      cur.isReversing = true;
      setIsReversing(true);
    } else {
      cur.frameIndex = 1;
      cur.isReversing = false;
      setIsReversing(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        onClick={triggerClickGesture}
        style={{
          position: 'absolute', top: 0, left: 0,
          width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'center',
          display: 'block',
          cursor: 'pointer',
        }}
      />

      {/* Debug Overlay */}
      <div style={{
        position: 'absolute', top: 20, left: 20,
        backgroundColor: 'rgba(0,0,0,0.65)',
        color: 'white', padding: '10px 15px', borderRadius: '8px',
        fontFamily: 'monospace', zIndex: 100,
        backdropFilter: 'blur(4px)',
        border: '1px solid rgba(255,255,255,0.1)',
        maxWidth: 280,
      }}>
        <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 'bold' }}>
          <span style={{ color: '#4facfe' }}>{action}</span>
          {' '}frame <span style={{ color: '#4facfe' }}>{frameIndex}/{ACTION_FRAMES[action]}</span>
          {' '}@ <span style={{ color: '#a8ff78' }}>{ACTION_FPS[action] || 12}fps</span>
          {' '}{isReversing ? '⏪' : '▶️'}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {Object.keys(ACTION_FRAMES).map(act => (
            <button
              key={act}
              onClick={() => triggerManualAction(act)}
              style={{
                background: action === act ? '#4facfe' : 'rgba(255,255,255,0.1)',
                border: 'none', color: 'white',
                padding: '3px 7px', borderRadius: 4,
                fontSize: 11, cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {act}
            </button>
          ))}
        </div>
      </div>

      {/* Apple style name tag overlay */}
      <div style={{
        position: 'absolute',
        bottom: '0',
        right: '0',
        background: '#ffffff',
        borderLeft: '1px solid rgba(0, 0, 0, 0.1)',
        borderTop: '1px solid rgba(0, 0, 0, 0.1)',
        borderTopLeftRadius: '40px',
        padding: '15px 35px',
        color: '#000000',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        fontSize: '32px',
        fontWeight: 'bold',
        letterSpacing: '0.5px',
        boxShadow: '0 -5px 25px rgba(0, 0, 0, 0.15)',
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: '15px',
      }}>
        <span style={{
          width: '15px',
          height: '15px',
          backgroundColor: '#30d158',
          borderRadius: '50%',
          boxShadow: '0 0 10px #30d158',
        }} />
        Sara
      </div>
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';

// ─── Frame counts per action ────────────────────────────────────────────────
const ACTION_FRAMES = {
  idle:                 64,
  blink:                64,
  laugh:                74,
  'moving hand':        64,
  playing:              64,
  think:                73,
  talking_happy:        98,
  talking_sadly:        42,
  talking_lips_moment:  98,
  yawning_and_sleeping: 81,
  Wink_great_with_hand: 98,
  shy:                  98,
  surprised_and_smiling: 98,
  touching_her_hair:    98,
  'touchig hair':       98,
};

// ─── FPS per action type ─────────────────────────────────────────────────────
// Talking animations get higher FPS for smooth lip-sync
const ACTION_FPS = {
  idle:                 8,
  blink:                12,
  laugh:                12,
  'moving hand':        10,
  playing:              10,
  think:                10,
  talking_happy:        18,
  talking_sadly:        18,
  talking_lips_moment:  18,
  yawning_and_sleeping: 12,
  Wink_great_with_hand: 12,
  shy:                  10,
  surprised_and_smiling: 10,
  touching_her_hair:    10,
  'touchig hair':       10,
};

// ─── Action behaviour types ───────────────────────────────────────────────────
// LOOP: Restart from frame 1 when done (used for talking & idle)
const LOOP_ACTIONS = new Set([
  'talking_happy', 'talking_sadly', 'talking_lips_moment',
]);

// IDLE_LOOP: Idle ping-pong animations
const IDLE_ACTIONS = new Set([
  'idle', 'blink', 'playing', 'moving hand', 'think'
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
  });

  // Sync isSpeaking into a ref so the loop can read the current value
  const isSpeakingRef = useRef(isSpeaking);
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);

  const currentActionRef = useRef(currentAction);
  useEffect(() => { currentActionRef.current = currentAction; }, [currentAction]);

  // ─── Image cache ───────────────────────────────────────────────────────────
  const imageCacheRef = useRef({});

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
          img.src = `/avatar/${act}/${act}_${i}.jpg`;
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
    if (currentAction === cur.action && !cur.nextAction) return;

    console.log(`[AvatarPlayer] Action request: "${cur.action}" → "${currentAction}"`);

    // Only allow instant cuts between actions that share the exact same base body pose (talking/idle)
    // This ensures that when audio stops, talking instantly stops, but physical reactions smoothly reverse.
    const isBasePose = (act) => LOOP_ACTIONS.has(act) || act === 'idle' || act === 'blink';
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
      const fps         = ACTION_FPS[cur.action]    || 12;
      const delay       = 1000 / fps;

      if (cur.isReversing) {
        // ── Reversing back to frame 1
        const prevFrame = cur.frameIndex - 1;
        if (prevFrame <= 1) {
          cur.frameIndex  = 1;
          cur.isReversing = false;
          setIsReversing(false);

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
            setAction(next);
          } else if (currentActionRef.current === cur.action && (IDLE_ACTIONS.has(cur.action) || LOOP_ACTIONS.has(cur.action))) {
            // ── Keep looping the active requested action
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
            setAction(nextAct);
          }
        } else {
          cur.frameIndex = prevFrame;
        }

      } else {
        // ── Forward play
        const nextFrame = cur.frameIndex + 1;

        if (nextFrame > totalFrames) {
          if (cur.nextAction) {
            // Queued action waiting — start reversing
            cur.isReversing = true;
            cur.frameIndex  = totalFrames - 1;
            setIsReversing(true);

          } else if (LOOP_ACTIONS.has(cur.action)) {
            // ── Loop: restart from frame 1 (for talking animations)
            cur.frameIndex = 1;

          } else if (IDLE_ACTIONS.has(cur.action)) {
            // ── Idle ping-pong: reverse direction
            cur.isReversing = true;
            cur.frameIndex  = totalFrames - 1;
            setIsReversing(true);

          } else {
            // ── Play-once action complete: reverse back to idle
            cur.isReversing = true;
            cur.frameIndex  = totalFrames - 1;
            setIsReversing(true);
            if (onActionComplete) onActionComplete(cur.action);
          }
        } else {
          cur.frameIndex = nextFrame;
        }
      }

      setFrameIndex(cur.frameIndex);
      drawFrame(cur.action, cur.frameIndex);
      timer = setTimeout(updateFrame, delay);
    };

    timer = setTimeout(updateFrame, 1000 / (ACTION_FPS['idle'] || 12));
    return () => clearTimeout(timer);
  }, [onActionComplete]);

  // ─── 5. Idle variation picker ──────────────────────────────────────────────
  const pickIdleVariant = () => {
    const rand = Math.random();
    if (rand > 0.88) return 'playing';
    if (rand > 0.75) return 'moving hand';
    if (rand > 0.55) return 'blink';
    return 'idle';
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
      if (LOOP_ACTIONS.has(act) || IDLE_ACTIONS.has(cur.action)) {
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

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', top: 0, left: 0,
          width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'center',
          display: 'block',
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
    </div>
  );
}

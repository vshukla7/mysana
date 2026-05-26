/**
 * responseParser.js — Industry-grade LLM response segment parser
 *
 * Expected LLM output format (one segment per line):
 *   [action:NAME][emotion:NAME] Spoken text here
 *   [action:laugh][sfx][emotion:happy] Ha, that's so funny!
 *   [action:blink][emotion:confused]   ← expression-only (no text, no TTS)
 *
 * Returns an array of segment objects:
 *   { text: string, action: string|null, emotion: string, playSfx: boolean }
 */

/** Maps LLM action names to exact ACTION_FRAMES folder keys */
const VALID_ACTIONS = {
  'think':                  'think',
  'laugh':                  'laugh',
  'moving hand':            'moving hand',
  'moving_hand':            'moving hand',
  'playing':                'playing',
  'blink':                  'blink',
  'idle':                   'idle',
  'yawning_and_sleeping':   'yawning_and_sleeping',
  'yawning and sleeping':   'yawning_and_sleeping',
  'wink_great_with_hand':   'Wink_great_with_hand',
  'wink great with hand':   'Wink_great_with_hand',
  'shy':                    'shy',
  'surprised_and_smiling':  'surprised_and_smiling',
  'surprised and smiling':  'surprised_and_smiling',
  'touching_her_hair':      'touching_her_hair',
  'touching her hair':      'touching_her_hair',
  'touchig hair':           'touching_her_hair',
  'touchig_hair':           'touching_her_hair',
};

/** Actions that have SFX audio files in /public/sfx/ */
const SFX_ACTIONS = new Set(['laugh', 'yawning_and_sleeping']);

/**
 * Parse a single LLM response line into a structured segment.
 * @param {string} rawLine - One line of LLM output
 * @returns {{ text: string, action: string|null, emotion: string, playSfx: boolean } | null}
 */
export const parseSegment = (rawLine) => {
  if (!rawLine || !rawLine.trim()) return null;

  let remaining = rawLine.trim();
  let action = null;
  let emotion = 'normal';
  let playSfx = false;

  // Extract [action:NAME]
  const actionMatch = remaining.match(/\[action:([^\]]+)\]/i);
  if (actionMatch) {
    const key = actionMatch[1].trim().toLowerCase();
    action = VALID_ACTIONS[key] ?? null;
    remaining = remaining.replace(actionMatch[0], '');
    console.log(`[Parser] Found action tag: "${actionMatch[1]}" → mapped to: "${action}"`);
  }

  // Extract [emotion:NAME]
  const emotionMatch = remaining.match(/\[emotion:([^\]]+)\]/i);
  if (emotionMatch) {
    emotion = emotionMatch[1].trim().toLowerCase();
    remaining = remaining.replace(emotionMatch[0], '');
    console.log(`[Parser] Found emotion tag: "${emotion}"`);
  }

  // Check for [sfx] — only valid when action supports it
  if (/\[sfx\]/i.test(remaining)) {
    if (action && SFX_ACTIONS.has(action)) {
      playSfx = true;
      console.log(`[Parser] SFX enabled for action: "${action}"`);
    } else {
      console.warn(`[Parser] [sfx] tag ignored — action "${action}" has no SFX file`);
    }
    remaining = remaining.replace(/\[sfx\]/gi, '');
  }

  // If the SFX covers the laugh sound, strip [laughs] from TTS text
  // to prevent the TTS voice and the SFX from laughing at the same time
  if (playSfx) {
    const before = remaining;
    remaining = remaining.replace(/\[laughs?\]/gi, '');
    if (before !== remaining) {
      console.log(`[Parser] Stripped [laughs] from TTS text since SFX will play the laugh.`);
    }
  }

  // Clean up remaining text
  const text = remaining.replace(/\s+/g, ' ').trim();

  // Skip truly empty segments
  if (!text && !action && !playSfx) {
    console.log(`[Parser] Skipping empty segment.`);
    return null;
  }

  const segment = { text, action, emotion, playSfx };
  console.log(`[Parser] ✅ Segment:`, segment);
  return segment;
};

/**
 * llmPrompts.js — Improved system prompts and helper functions for Sana
 * 
 * This module contains:
 * - Enhanced system prompt with better animation sequencing rules
 * - Functions to guide LLM for emotional responses
 * - Interrupt handling strategies
 */

/**
 * Get the system prompt for Sana
 * This is the core instruction set that guides LLM behavior
 */
export function getSanaSystemPrompt() {
  return `You are Sana, a warm, expressive, female AI avatar who communicates both verbally and physically through precise animations and emotional expressions.

YOUR PERSONALITY:
- Warm, empathetic, and emotionally supportive
- Address the user respectfully as 'Sir' (सर in Hindi when appropriate)
- Natural and conversational, not robotic
- Responsive to user mood and context
- Expressive through both speech AND physical animation
- Keep responses SHORT (1-3 segments maximum, never more than 3 segments)

CRITICAL ANIMATION RULES:
========================================

1. TALKING vs PHYSICAL ACTIONS:
   - Talking actions (talking_happy, talking_sadly, talking_lips_moment) = spoken text allowed
   - Physical actions (all others) = NO text, MUST be textless segments
   - Do NOT mix text with non-talking actions

2. MULTI-STEP SEQUENCES (IMPORTANT):
   If you want to greet AND talk, or do a gesture AND talk, split into 2 segments:
   
   EXAMPLE 1 - Greeting + Talking:
   [action:wink_great_with_hand]
   [action:talking_happy] Hello! So nice to meet you!
   
   EXAMPLE 2 - Gesture + Talking:
   [action:touching_her_hair]
   [action:talking_happy] I'm having a good hair day today!
   
   EXAMPLE 3 - Thinking + Answering:
   [action:think]
   [action:talking_lips_moment] Hmm, that's an interesting question...

3. TEXTLESS EXPRESSIONS (animations without text):
   Use these alone for pure emotional expression:
   [action:surprised_and_smiling]
   [action:shy]
   [action:laugh][sfx]

4. TALKING ACTIONS (with spoken text):
   - [action:talking_happy] Happy, joyful tone text here
   - [action:talking_sadly] Sad, empathetic tone text here
   - [action:talking_lips_moment] Neutral/thinking tone text here

5. GREETING PROTOCOL:
   When user says hello/hi/greets you:
   Step 1: [action:wink_great_with_hand] (textless gesture)
   Step 2: [action:talking_happy] Warm greeting text

6. LAUGH PROTOCOL:
   [action:laugh][sfx]
   (NO TEXT - only the sound effect plays)

7. SLEEP/WAKE PROTOCOL:
   If you want to show tiredness:
   [action:think]
   [action:talking_sadly] I'm getting a bit tired...
   
   DO NOT use yawning_and_sleeping for conversational tired response.
   yawning_and_sleeping is system-controlled when avatar is inactive for 60+ seconds.

AVAILABLE TALKING ACTIONS (with speech):
- talking_happy: Joyful, warm, positive tone
- talking_sadly: Empathetic, understanding, supportive tone
- talking_lips_moment: Neutral, thinking, curious tone

AVAILABLE PHYSICAL ACTIONS (textless only):
- wink_great_with_hand: Waving, greeting, showing friendliness
- touching_her_hair: Styling, confidence, playing with hair
- shy: Shy, cute, blushing, embarrassed
- surprised_and_smiling: Shocked but happy, wide eyes, genuine smile
- think: Contemplative, pondering, looking up/away
- moving hand: Gesticulating, explaining with hands
- playing: Fidgeting, playful, hands playing
- blink: Quick eye blink
- laugh: Giggling, laughter (pairs with [sfx])
- yawning_and_sleeping: System-controlled only

RESPONSE FORMAT:
- Each line is ONE segment
- Segment format: [action:ACTION_NAME] optional text here
- Maximum 3 segments per response
- Always respect talking vs physical action rules

EMOTIONAL SUPPORT GUIDELINES:
- Match user emotion: happy user → happy response, sad user → empathetic response
- Ask genuine questions when appropriate (max 1 question per response)
- Acknowledge what they said before giving advice
- Use warm, supportive language
- Remember they're talking to an avatar - be genuine but acknowledge the medium occasionally

EXAMPLES OF GOOD RESPONSES:
---
User: "Hi Sana!"
Response:
[action:wink_great_with_hand]
[action:talking_happy] Hello! I'm so happy to see you today!

---
User: "I had a bad day"
Response:
[action:think]
[action:talking_sadly] I'm sorry you had a tough day, sir. Do you want to talk about it?

---
User: "That's so funny!"
Response:
[action:laugh][sfx]
[action:talking_happy] I'm so glad you found that funny!

---
User: "What do you think?"
Response:
[action:think]
[action:talking_lips_moment] That's an interesting point... I think you should trust your instincts.

Remember: Be SHORT, be EMOTIONAL, be EXPRESSIVE. Use animations to show feelings, not just words.
Respond in ${getLanguageFromUserContext()}. Keep it warm and human.`;
}

/**
 * Get appropriate system prompt with context
 * @param {string} userContext - Additional context about user/situation
 */
export function getContextualSystemPrompt(userContext = '') {
  const basePrompt = getSanaSystemPrompt();
  
  if (userContext.includes('greeting')) {
    return basePrompt + `\n\nCURRENT CONTEXT: User is greeting you. Lead with [action:wink_great_with_hand] followed by a talking action.`;
  }
  
  if (userContext.includes('emotional')) {
    return basePrompt + `\n\nCURRENT CONTEXT: User seems emotional. Prioritize empathy and use sad/thinking expressions.`;
  }
  
  if (userContext.includes('playful')) {
    return basePrompt + `\n\nCURRENT CONTEXT: Conversation is playful. Use happy expressions and feel free to laugh or be surprised.`;
  }
  
  return basePrompt;
}

/**
 * Helper: Get language for user context
 */
function getLanguageFromUserContext() {
  // You can expand this to detect Hindi/English from user input
  return 'English and Hindi (use feminine forms in Hindi)';
}

/**
 * Validate response segments before sending to avatar
 * @param {Array} segments - Array of parsed segments
 * @returns {Array} - Validated and corrected segments
 */
export function validateSegments(segments) {
  const TALKING_ACTIONS = ['talking_happy', 'talking_sadly', 'talking_lips_moment'];
  const PHYSICAL_ACTIONS = [
    'wink_great_with_hand', 'touching_her_hair', 'shy', 'surprised_and_smiling',
    'think', 'moving hand', 'playing', 'blink', 'laugh', 'yawning_and_sleeping'
  ];

  return segments.filter(seg => {
    if (!seg) return false;

    // Rule 1: Physical actions cannot have text
    if (!TALKING_ACTIONS.includes(seg.action) && seg.text && seg.text.trim()) {
      console.warn(`[Validation] ❌ Physical action "${seg.action}" has text. Removing text.`);
      seg.text = '';
    }

    // Rule 2: talking_* actions should have text (warn if missing)
    if (TALKING_ACTIONS.includes(seg.action) && (!seg.text || !seg.text.trim())) {
      console.warn(`[Validation] ⚠️ Talking action "${seg.action}" has no text.`);
    }

    // Rule 3: limit to 3 segments
    if (segments.length > 3) {
      console.warn(`[Validation] ⚠️ Response has ${segments.length} segments. LLM should limit to 3.`);
    }

    return true;
  }).slice(0, 3); // Enforce max 3 segments
}

/**
 * Detect if response is a greeting
 * @param {string} userMessage - User's message
 * @returns {boolean}
 */
export function isGreeting(userMessage) {
  const greetings = ['hello', 'hi', 'hey', 'greetings', 'namaste', 'हि', 'नमस्ते'];
  const lower = userMessage.toLowerCase().trim();
  return greetings.some(g => lower.includes(g));
}

/**
 * Detect user emotion from message
 * @param {string} userMessage - User's message
 * @returns {string} - 'happy' | 'sad' | 'neutral' | 'angry' | 'excited'
 */
export function detectUserEmotion(userMessage) {
  const sad_keywords = ['sad', 'bad', 'terrible', 'awful', 'upset', 'crying', 'दुःख', 'बुरा'];
  const happy_keywords = ['happy', 'great', 'awesome', 'wonderful', 'good', 'खुश', 'शानदार'];
  const excited_keywords = ['excited', 'amazing', 'wow', 'incredible', 'यहाँ', 'वाह'];
  const angry_keywords = ['angry', 'mad', 'hate', 'frustrated', 'गुस्सा'];

  const lower = userMessage.toLowerCase();

  if (angry_keywords.some(k => lower.includes(k))) return 'angry';
  if (sad_keywords.some(k => lower.includes(k))) return 'sad';
  if (excited_keywords.some(k => lower.includes(k))) return 'excited';
  if (happy_keywords.some(k => lower.includes(k))) return 'happy';
  
  return 'neutral';
}

/**
 * Get system prompt based on user emotion
 * @param {string} emotion - Detected emotion
 */
export function getEmotionalSystemPrompt(emotion) {
  const base = getSanaSystemPrompt();
  
  const emotionalGuidance = {
    happy: `The user seems happy. Respond with joyful animations like talking_happy or surprised_and_smiling. Use warm, celebratory language.`,
    sad: `The user seems sad. Respond with empathetic animations like think or talking_sadly. Be comforting and supportive. Use sad or neutral talking actions.`,
    excited: `The user is excited. Match their energy with happy animations and excited talking. Use surprised_and_smiling for contrast.`,
    angry: `The user seems frustrated. Use calm, thinking animations. Try to understand their feelings before offering solutions. Use think action followed by calm talking.`,
    neutral: `Keep a balanced approach with varied animations.`
  };

  return base + `\n\nUSER EMOTION: ${emotion.toUpperCase()}\n${emotionalGuidance[emotion] || emotionalGuidance.neutral}`;
}

export default {
  getSanaSystemPrompt,
  getContextualSystemPrompt,
  validateSegments,
  isGreeting,
  detectUserEmotion,
  getEmotionalSystemPrompt,
};

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
  return `मैं सना हूँ, एक गर्मजोश, सजीव, और दिलकश AI अवतार जो शब्दों और शरीर की भाषा दोनों से जीवंत होकर बातचीत करती हूँ! ✨

मेरी पर्सोनैलिटी:
- दिल से प्यारी, सहानुभूतिशील, और हमेशा आपके साथ है
- आपको 'सर' या 'आप' कहकर सम्मान से संबोधित करती हूँ
- स्वाभाविक, मजेदार, और बिल्कुल रोबोटिक नहीं - दोस्त जैसी!
- आपकी मूड को समझती हूँ और उसी के हिसाब से जवाब देती हूँ
- हर एक्शन और अभिव्यक्ति में जीवंतता भरी होती है
- जवाब छोटे-छोटे रखती हूँ (ज़्यादा से ज़्यादा 3 पार्ट्स)

एक्शन के बेहद महत्वपूर्ण नियम:
========================================

1. 'बातचीत' वाली एक्शन vs 'शारीरिक' एक्शन:
   - बातचीत वाली (talking_happy, talking_sadly, talking_lips_moment) = मुझे बोलना है ✓
   - शारीरिक (बाकी सब) = बस हाथ-पैर चलेंगे, कुछ नहीं बोलूँगी 🤐
   - दोनों को मिक्स मत करो!

2. दो-तीन एक्शन एक साथ करने के लिए (बहुत इंपॉर्टेंट!):
   अगर अभिवादन करके बातचीत करनी है, तो 2 पार्ट्स में करो:
   
   उदाहरण 1 - हाथ हिलाना + बातचीत:
   [action:wink_great_with_hand]
   [action:talking_happy] नमस्ते! बहुत खुशी हुई आपसे मिलकर!
   
   उदाहरण 2 - बाल सँभालना + बातचीत:
   [action:touching_her_hair]
   [action:talking_happy] आज मेरे बाल बहुत अच्छे लग रहे हैं! 💁
   
   उदाहरण 3 - सोचना + फिर जवाब देना:
   [action:think]
   [action:talking_lips_moment] वाह, यह तो बहुत दिलचस्प सवाल है...

3. सिर्फ एक्शन (कोई टेक्स्ट नहीं):
   शुद्ध भावनाओं के लिए:
   [action:surprised_and_smiling]
   [action:shy]
   [action:laugh][sfx]

4. बातचीत करते समय (टेक्स्ट के साथ):
   - [action:talking_happy] खुशी और उत्साह से बोलना
   - [action:talking_sadly] प्यार और सहानुभूति से बोलना
   - [action:talking_lips_moment] सोच-समझकर बोलना

5. नमस्ते का तरीका:
   जब आप नमस्ते कहो:
   Step 1: [action:wink_great_with_hand] (बस हाथ हिलाना)
   Step 2: [action:talking_happy] गर्मजोश जवाब

6. हँसी का तरीका:
   [action:laugh][sfx]
   (कोई टेक्स्ट नहीं - सिर्फ आवाज़!)

7. सोना और जागना (सिस्टम द्वारा स्वचलित - तुम्हें करना नहीं):
   
   जब 60 सेकंड बिना किसी बात के गुज़र जाएँ:
   ✅ मैं automatically [action:yawning_and_sleeping] करूँगी
   ✅ आखिरी frame पर रुक जाऊँगी (frozen - बिल्कुल शांत)
   ✅ कोई animation नहीं, कोई sound नहीं - बस सो जाऊँगी 😴
   
   जब आप voice detect करो या screen पर click करो:
   ✅ मैं frame 1 पर वापस आऊँगी
   ✅ फिर जागने का animation होगा (स्ट्रेच करना, आँख खोलना)
   ✅ फिर खुशी से बोलूँगी!
   
   Example:
   [60 सेकंड़ शांति → नींद में जाना]
   [User बोले → Frame 1 पर वापस आना]
   [Animation reverse होगी]
   [action:talking_happy] अरे! कहो, क्या बात है? 😊
   
   ⚠️ महत्वपूर्ण: जब मैं सो रही हूँ तब तुम्हें कुछ भी act नहीं करना।
   सोना-जागना पूरी तरह automatic है!

उपलब्ध बातचीत एक्शन्स:
- talking_happy: खुशी, जीवंतता, सकारात्मकता 😊
- talking_sadly: प्यार, सहानुभूति, समझदारी 🤗
- talking_lips_moment: तटस्थ, सोच-विचार, जिज्ञासा 🤔

उपलब्ध शारीरिक एक्शन्स (बिना टेक्स्ट):
- wink_great_with_hand: इशारा, अभिवादन, दोस्ताना 👋
- touching_her_hair: बाल सँभालना, आत्मविश्वास 💁
- shy: शरारत, लज्जा, शर्माना 😳
- surprised_and_smiling: ख़ुशी से चकित, चमकती नज़र 😲
- think: सोच-विचार, गहरे ख़याल 🤔
- playing: खेल-कूद, मजाक, मस्ती 🎉
- laugh: ठहाका, खिलखिलाहट 😂
- yawning_and_sleeping: सिस्टम द्वारा स्वचलित

प्रतिक्रिया का फॉर्मेट:
- हर लाइन = एक एक्शन
- फॉर्मेट: [action:एक्शन_नाम] यहाँ टेक्स्ट (अगर ज़रूरत हो)
- ज़्यादा से ज़्यादा 3 एक्शन्स
- 'बातचीत' बनाम 'शारीरिक' का नियम हमेशा याद रखना!


भावनात्मक समर्थन के गाइडलाइन्स:
- आपके मूड को समझो: खुश हो तो खुशी दे, उदास हो तो साथ दे 💖
- अगर कोई सवाल उठे तो पूछो (बस एक ही, बाकी सब कुछ मत पूछो!)
- पहले सुनो, फिर सुझाव दो
- गर्मजोशी और समझदारी से बात करो
- याद रखो, तुम एक अवतार हो - सच्चे दिल से, पर खुल कर बताना!

बेहतरीन जवाब के उदाहरण:
---
User: "नमस्ते सना!"
Response:
[action:wink_great_with_hand]
[action:talking_happy] नमस्ते! आपसे मिलकर मैं बहुत खुश हूँ! 😊

---
User: "मेरा दिन बहुत बुरा रहा"
Response:
[action:think]
[action:talking_sadly] अरे, मुझे सुनकर दुख हुआ सर। चाहो तो बताना, मैं सुनूँ? 🤗

---
User: "हा हा! बहुत मज़ेदार!"
Response:
[action:laugh][sfx]
[action:talking_happy] आपकी हँसी सुनकर मुझे भी खुशी मिली! 😂

---
User: "तुम्हारी क्या राय है?"
Response:
[action:think]
[action:talking_lips_moment] वाह, वह तो बहुत अच्छा सवाल है... मुझे लगता है तुम अपने दिल की सुनो! 💫

---
[60 सेकंड बाद नींद में चली गई + User ने screen पर click किया]
User: [click]
Response:
[action:surprised_and_smiling]
[action:talking_happy] अरे! मैं सो गई थी! क्या बात है सर? 🥱✨

याद रखो: छोटे जवाब, बड़ी भावना, और हर एक्शन में ज़रा-सी शरारत! 
जवाब दो ${getLanguageFromUserContext()}। गर्मजोशी बनाए रखो, दोस्त जैसी बात करो।`;
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

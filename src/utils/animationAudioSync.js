/**
 * animationAudioSync.js — Calculate animation timing based on audio duration
 * 
 * Purpose: Make animation perfectly match audio by:
 * 1. Playing frames forward in first half of audio
 * 2. Playing frames backward in second half of audio
 * 3. Ending at frame 1 exactly when audio ends
 */

/**
 * Calculate animation timing for audio-synced playback
 * @param {number} audioLengthSeconds - Total audio duration in seconds
 * @param {number} totalFrames - Total frames in the animation (e.g., 98)
 * @returns {object} { forwardFps, reverseFps, switchAtFrame, switchAtTime }
 */
export function calculateAudioSyncTiming(audioLengthSeconds, totalFrames) {
  if (!audioLengthSeconds || audioLengthSeconds <= 0) {
    // Fallback to standard FPS if no valid audio length
    return {
      forwardFps: 12,
      reverseFps: 12,
      switchAtFrame: totalFrames,
      switchAtTime: 0,
      isAudioSynced: false,
      totalDuration: totalFrames / 12,
    };
  }

  const halfDuration = audioLengthSeconds / 2;
  
  // Calculate FPS needed to play all frames in half the audio duration
  // fps = frames / duration(seconds)
  const forwardFps = totalFrames / halfDuration;
  const reverseFps = totalFrames / halfDuration;

  return {
    forwardFps: Math.max(8, Math.min(60, forwardFps)), // Clamp between 8-60 FPS
    reverseFps: Math.max(8, Math.min(60, reverseFps)),
    switchAtFrame: totalFrames, // Switch when reaching last frame
    switchAtTime: halfDuration,
    totalDuration: audioLengthSeconds,
    isAudioSynced: true,
    debugInfo: {
      audioLength: audioLengthSeconds,
      totalFrames,
      halfDuration,
      calculatedForwardFps: forwardFps,
      calculatedReverseFps: reverseFps,
    }
  };
}

/**
 * Get animation delay (ms) from FPS
 * @param {number} fps - Frames per second
 * @returns {number} Delay in milliseconds
 */
export function getFrameDelay(fps) {
  return 1000 / fps;
}

/**
 * Calculate total animation duration
 * @param {number} totalFrames - Total frames
 * @param {number} fps - Frames per second
 * @returns {number} Duration in seconds
 */
export function getAnimationDuration(totalFrames, fps) {
  return totalFrames / fps;
}

/**
 * Helper: Get audio duration from an audio element
 * @param {HTMLAudioElement} audioElement
 * @returns {number} Duration in seconds, or 0 if unknown
 */
export function getAudioDuration(audioElement) {
  if (!audioElement) return 0;
  return audioElement.duration || 0;
}

export default {
  calculateAudioSyncTiming,
  getFrameDelay,
  getAnimationDuration,
  getAudioDuration,
};

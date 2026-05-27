/**
 * avatarStateManager.js — Centralized state management for avatar animations and interactions
 * 
 * This module handles:
 * - Avatar state tracking (idle, talking, sleeping, thinking, etc.)
 * - Animation queuing and sequencing
 * - Interrupt handling (e.g., waking up during sleep)
 * - Audio-animation synchronization
 */

export class AvatarStateManager {
  constructor() {
    this.state = 'idle'; // idle | thinking | talking | sleeping | waking_up | listening
    this.currentAction = 'idle';
    this.animationQueue = []; // Queue of animations to play in sequence
    this.isInterrupted = false;
    this.currentAudio = null;
    this.audioStartTime = null;
  }

  /**
   * Transition to a new state
   * @param {string} newState - New state name
   * @param {string} action - Associated avatar action
   * @param {boolean} interrupt - If true, clears animation queue
   */
  transitionTo(newState, action = null, interrupt = false) {
    console.log(`[AvatarStateManager] State transition: ${this.state} → ${newState}`);
    
    if (interrupt) {
      this.animationQueue = [];
      this.isInterrupted = true;
    }

    this.state = newState;
    
    if (action) {
      this.currentAction = action;
    }

    return {
      state: this.state,
      action: this.currentAction,
      queue: this.animationQueue.length,
    };
  }

  /**
   * Queue an animation sequence
   * Useful for multi-step animations like greeting → talking
   * @param {Array<string>} actions - Array of action names in sequence
   */
  queueAnimations(actions) {
    this.animationQueue = [...actions];
    console.log(`[AvatarStateManager] Queued ${actions.length} animations:`, actions);
    return this.animationQueue[0] || null;
  }

  /**
   * Pop the next animation from queue
   */
  popNextAnimation() {
    if (this.animationQueue.length === 0) return null;
    const next = this.animationQueue.shift();
    console.log(`[AvatarStateManager] Playing queued animation: ${next}`);
    return next;
  }

  /**
   * Handle interrupt during sleep
   * @returns {string} - Next action to play (wake-up reverse animation)
   */
  handleSleepInterrupt() {
    if (this.state === 'sleeping') {
      console.log('[AvatarStateManager] Sleep interrupted!');
      this.transitionTo('waking_up', 'yawning_and_sleeping', true);
      return 'yawning_and_sleeping'; // Avatar component will reverse this
    }
    return null;
  }

  /**
   * Register audio playback for lip-sync
   * @param {HTMLAudioElement} audioElement
   * @param {number} duration - Audio duration in seconds
   */
  registerAudio(audioElement, duration) {
    this.currentAudio = audioElement;
    this.audioStartTime = Date.now();
    console.log(`[AvatarStateManager] Audio registered: ${duration}s`);
  }

  /**
   * Get current audio position (0-1)
   * @returns {number} - Progress from 0 to 1
   */
  getAudioProgress() {
    if (!this.currentAudio) return 0;
    return this.currentAudio.currentTime / this.currentAudio.duration;
  }

  /**
   * Check if audio is still playing
   */
  isAudioPlaying() {
    return this.currentAudio && !this.currentAudio.paused;
  }

  /**
   * Clear audio reference
   */
  clearAudio() {
    this.currentAudio = null;
    this.audioStartTime = null;
  }

  /**
   * Get state summary for debugging
   */
  getDebugInfo() {
    return {
      state: this.state,
      action: this.currentAction,
      queueLength: this.animationQueue.length,
      audioPlaying: this.isAudioPlaying(),
      isInterrupted: this.isInterrupted,
    };
  }
}

export default AvatarStateManager;

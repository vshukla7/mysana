/**
 * audioSyncManager.js — Real-time audio-to-animation synchronization
 * 
 * This ensures that:
 * - Talking animation plays while audio is playing
 * - Animation stops when audio stops
 * - Lip-sync uses frequency analysis for natural movement
 * - Handles audio interrupts properly
 */

export class AudioSyncManager {
  constructor(audioContext, analyser) {
    this.audioContext = audioContext;
    this.analyser = analyser;
    this.isPlaying = false;
    this.currentAudio = null;
    this.animationUpdateCallback = null;
    this.animationStopCallback = null;
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
    this.lastIntensity = 0;
  }

  /**
   * Start audio playback with animation sync
   * @param {HTMLAudioElement} audioElement - Audio to play
   * @param {Function} onUpdate - Callback for animation frame updates
   * @param {Function} onStop - Callback when audio stops
   */
  playWithSync(audioElement, onUpdate, onStop) {
    this.currentAudio = audioElement;
    this.isPlaying = true;
    this.animationUpdateCallback = onUpdate;
    this.animationStopCallback = onStop;

    console.log('[AudioSyncManager] ▶️ Starting audio playback with sync');

    // Start the sync loop
    this.syncLoop();

    // Handle natural audio end
    const onEnded = () => {
      console.log('[AudioSyncManager] Audio ended naturally');
      this.stop();
      if (this.animationStopCallback) {
        this.animationStopCallback();
      }
    };

    audioElement.addEventListener('ended', onEnded, { once: true });
    audioElement.play().catch(err => {
      console.error('[AudioSyncManager] ❌ Playback failed:', err);
      this.stop();
    });
  }

  /**
   * Stop audio playback
   */
  stop() {
    this.isPlaying = false;
    this.currentAudio = null;
    this.lastIntensity = 0;
    console.log('[AudioSyncManager] ⏹️ Audio sync stopped');
  }

  /**
   * Force stop (interrupts current audio)
   */
  forceStop() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
    }
    this.stop();
  }

  /**
   * Main sync loop - runs continuously while audio plays
   */
  syncLoop = () => {
    if (!this.isPlaying || !this.currentAudio) {
      return;
    }

    // Get frequency data for lip-sync
    if (this.analyser) {
      this.analyser.getByteFrequencyData(this.frequencyData);
    }

    // Calculate audio intensity (0-1)
    const intensity = this.calculateIntensity();
    this.lastIntensity = intensity;

    // Notify animation callback
    if (this.animationUpdateCallback) {
      this.animationUpdateCallback({
        intensity,
        progress: this.currentAudio.currentTime / this.currentAudio.duration,
        isPlaying: !this.currentAudio.paused,
      });
    }

    // Continue loop
    requestAnimationFrame(this.syncLoop);
  };

  /**
   * Calculate audio intensity from frequency data
   * Higher intensity = more mouth movement
   * @returns {number} 0-1 intensity value
   */
  calculateIntensity() {
    if (!this.frequencyData) return 0;

    // Focus on lower frequencies (0-1kHz) for speech
    const lowerBins = this.frequencyData.slice(0, Math.floor(this.frequencyData.length * 0.3));
    const sum = lowerBins.reduce((a, b) => a + b, 0);
    const average = sum / lowerBins.length;

    // Normalize to 0-1 range
    // 255 is max byte value, we consider > 40 as meaningful speech
    return Math.max(0, Math.min(1, (average - 40) / 215));
  }

  /**
   * Get current audio progress (0-1)
   */
  getProgress() {
    if (!this.currentAudio) return 0;
    return this.currentAudio.currentTime / this.currentAudio.duration;
  }

  /**
   * Get current audio position in seconds
   */
  getCurrentTime() {
    return this.currentAudio?.currentTime || 0;
  }

  /**
   * Get audio duration in seconds
   */
  getDuration() {
    return this.currentAudio?.duration || 0;
  }

  /**
   * Check if audio is currently playing
   */
  isAudioPlaying() {
    return this.isPlaying && this.currentAudio && !this.currentAudio.paused;
  }

  /**
   * Get debug info for troubleshooting
   */
  getDebugInfo() {
    return {
      isPlaying: this.isPlaying,
      intensity: this.lastIntensity,
      progress: this.getProgress(),
      duration: this.getDuration(),
      currentTime: this.getCurrentTime(),
    };
  }
}

export default AudioSyncManager;

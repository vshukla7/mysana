import React, { useState, useEffect, useRef } from 'react';
import { Phone, Sparkles } from 'lucide-react';
import '../styles/landing.css';

const WINK_FRAMES   = 98;
const PLAYING_FRAMES = 98;

// ── Intersection Observer reveal ──────────────────────────────────────────────
function useReveal() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, visible];
}

export default function LandingPage({ onStartCall }) {
  // Single frame state: wink frames 1-98, then playing frames 1-98
  const [phase, setPhase]       = useState('wink');
  const [winkFrame, setWinkFrame] = useState(1);
  const [playFrame, setPlayFrame] = useState(1);
  const [headerReady, setHeaderReady] = useState(false);

  // The tall scroll zone that drives both animations
  const animZoneRef = useRef(null);

  // Reveal refs
  const [bodyRef,   bodyVisible]   = useReveal();
  const [card1Ref,  card1Visible]  = useReveal();
  const [card2Ref,  card2Visible]  = useReveal();
  const [card3Ref,  card3Visible]  = useReveal();
  const [bottomRef, bottomVisible] = useReveal();
  const [footerRef, footerVisible] = useReveal();

  // Header entrance
  useEffect(() => {
    const t = setTimeout(() => setHeaderReady(true), 200);
    return () => clearTimeout(t);
  }, []);

  // Preload all frames eagerly
  useEffect(() => {
    for (let i = 1; i <= WINK_FRAMES; i++) {
      const img = new Image();
      img.src = `/avatar/wink_great_with_hand/wink_great_with_hand_${i}.jpg`;
    }
    for (let i = 1; i <= PLAYING_FRAMES; i++) {
      const img = new Image();
      img.src = `/avatar/playing/playing_${i}.jpg`;
    }
  }, []);

  // ── Single scroll listener driving BOTH animations ────────────────────────
  // Zone is 500vh tall. Sticky hero = 100vh.
  // Scroll 0 → midpoint   → wink   frames 1→98  (forward) / 98→1 (reverse)
  // Scroll midpoint → end → playing frames 1→98  (forward) / 98→1 (reverse)
  useEffect(() => {
    const handleScroll = () => {
      const el = animZoneRef.current;
      if (!el) return;

      const scrollTop     = window.scrollY;
      const vh            = window.innerHeight;
      const zoneTop       = el.offsetTop;           // where the zone starts on the page
      const zoneHeight    = el.offsetHeight;        // actual rendered height (≈ 500vh in px)
      const totalScrollable = zoneHeight - vh;      // scrollable range inside the zone
      const midpoint      = totalScrollable / 2;    // wink ends / playing begins

      // How far the user has scrolled WITHIN the zone (clamped to zone bounds)
      const scrollInZone = Math.max(0, Math.min(totalScrollable, scrollTop - zoneTop));

      if (scrollInZone <= midpoint) {
        // ── Wink phase (first half) ──
        const progress = midpoint > 0 ? scrollInZone / midpoint : 0;
        const frame = Math.max(1, Math.min(WINK_FRAMES, Math.floor(progress * WINK_FRAMES) + 1));
        setPhase('wink');
        setWinkFrame(frame);
      } else {
        // ── Playing phase (second half) ──
        const playProgress = midpoint > 0 ? (scrollInZone - midpoint) / midpoint : 0;
        const frame = Math.max(1, Math.min(PLAYING_FRAMES, Math.floor(playProgress * PLAYING_FRAMES) + 1));
        setPhase('play');
        setPlayFrame(frame);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    // Delay the initial call until after paint so offsetHeight is correct
    const raf = requestAnimationFrame(handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Image driven by phase + frame
  const imgSrc = phase === 'wink'
    ? `/avatar/wink_great_with_hand/wink_great_with_hand_${winkFrame}.jpg`
    : `/avatar/playing/playing_${playFrame}.jpg`;

  return (
    <div className="landing-container">
      {/* Ambient glows */}
      <div className="liquid-glow glow-1"></div>
      <div className="liquid-glow glow-2"></div>
      <div className="liquid-glow glow-3"></div>

      {/* HEADER */}
      <header className={`header glass-card ${headerReady ? 'header-ready' : 'header-hidden'}`}>
        <div className="header-content">
          <div className="logo">
            <Sparkles size={22} className="logo-icon" />
            <span>Sana</span>
          </div>
          <button className="header-cta" onClick={onStartCall}>Start Call</button>
        </div>
      </header>

      <main className="main-content">

        {/* ── ANIMATION ZONE (500vh) ── sticky hero inside ── */}
        <div ref={animZoneRef} className="anim-zone">
          <div className="sticky-hero">
            {/* Frame image */}
            <img
              src={imgSrc}
              alt="Sana"
              className="frame-bg-image"
              loading="eager"
            />

            {/* Dark gradient vignette */}
            <div className="frame-bg-overlay"></div>

            {/* Phase labels */}
            <div className="scroll-phase-label">
              {phase === 'wink'
                ? <><span>👋</span> Greeting  · frame {winkFrame}/{WINK_FRAMES}</>
                : <><span>✨</span> Exploring · frame {playFrame}/{PLAYING_FRAMES}</>
              }
            </div>

            {/* Scroll hint */}
            <div className="hero-scroll-hint">
              <span>Scroll to animate — reverse to rewind</span>
              <div className="scroll-arrow">↓</div>
            </div>
          </div>
        </div>

        {/* ── BODY SECTION ── */}
        <section className="body-section" id="features">
          <div
            ref={bodyRef}
            className={`section-header reveal ${bodyVisible ? 'reveal-visible' : ''}`}
          >
            <h1 className="body-title">Meet <span className="gradient-text">Sana</span></h1>
            <p className="body-subtitle">
              Your AI companion that talks, listens, and expresses emotions naturally.
            </p>
            <button
              className="cta-button"
              onClick={onStartCall}
              style={{ marginTop: '1rem', marginBottom: '3.5rem' }}
            >
              <Phone size={18} />
              <span>Start Conversation</span>
            </button>

            <h2>Next-Generation AI</h2>
            <p>Designed with liquid aesthetics and conversational excellence.</p>
          </div>

          <div className="features-grid">
            <div
              ref={card1Ref}
              className={`feature-card glass-card reveal reveal-left ${card1Visible ? 'reveal-visible' : ''}`}
              style={{ transitionDelay: '0ms' }}
            >
              <div className="feature-icon">🎤</div>
              <h3>Real-time Voice</h3>
              <p>Talk naturally in Hindi &amp; English, and Sana responds instantly without lag.</p>
            </div>

            <div
              ref={card2Ref}
              className={`feature-card glass-card reveal ${card2Visible ? 'reveal-visible' : ''}`}
              style={{ transitionDelay: '100ms' }}
            >
              <div className="feature-icon">✨</div>
              <h3>Emotional AI</h3>
              <p>Expressive facial animations matching the mood and context of your chat.</p>
            </div>

            <div
              ref={card3Ref}
              className={`feature-card glass-card reveal reveal-right ${card3Visible ? 'reveal-visible' : ''}`}
              style={{ transitionDelay: '200ms' }}
            >
              <div className="feature-icon">📱</div>
              <h3>Liquid Interface</h3>
              <p>A simple, clutter-free Apple-inspired interface crafted for visual elegance.</p>
            </div>
          </div>
        </section>

        {/* ── BOTTOM CTA ── */}
        <section
          ref={bottomRef}
          className={`bottom-section glass-card reveal ${bottomVisible ? 'reveal-visible' : ''}`}
          id="demo"
        >
          <h2>Experience Sana</h2>
          <p>Start a natural voice conversation with your new AI assistant.</p>
          <button className="cta-button" onClick={onStartCall}>
            <Phone size={20} />
            Start Your Journey
          </button>
        </section>
      </main>

      {/* FOOTER with vivid gradient SANA wordmark */}
      <footer className="footer">
        <div
          ref={footerRef}
          className={`footer-sana-wordmark reveal ${footerVisible ? 'reveal-visible' : ''}`}
        >
          SANA
        </div>
        <div className="footer-content">
          <p>&copy; 2026 Sana AI. All rights reserved.</p>
          <div className="footer-links">
            <a href="#privacy">Privacy</a>
            <a href="#terms">Terms</a>
            <a href="#contact">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

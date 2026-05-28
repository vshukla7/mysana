import React, { useState, useEffect, useRef } from 'react';
import { Phone, Sparkles } from 'lucide-react';
import '../styles/landing.css';

const TOTAL_FRAMES = 98;
const ANIM = 'touching_her_hair';

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
  const [frame, setFrame]             = useState(1);
  const [isAtTop, setIsAtTop]         = useState(true);
  const [headerReady, setHeaderReady] = useState(false);
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
    for (let i = 1; i <= TOTAL_FRAMES; i++) {
      const img = new Image();
      img.src = `/avatar/${ANIM}/${ANIM}_${i}.jpg`;
    }
  }, []);

  // ── Auto-loop first 17 frames when not scrolling (idle at top) ─────────────
  useEffect(() => {
    if (!isAtTop) return;

    let current = 1;
    let direction = 1; // 1 for forward, -1 for backward

    const interval = setInterval(() => {
      current += direction;
      if (current >= 17) {
        current = 17;
        direction = -1;
      } else if (current <= 1) {
        current = 1;
        direction = 1;
      }
      setFrame(current);
    }, 100); // Smooth loop

    return () => clearInterval(interval);
  }, [isAtTop]);

  // ── Scroll-driven frame animation (bidirectional) ─────────────────────────
  useEffect(() => {
    const handleScroll = () => {
      const el = animZoneRef.current;
      if (!el) return;

      const scrollTop      = window.scrollY;
      const vh             = window.innerHeight;
      const zoneTop        = el.offsetTop;
      const totalScrollable = el.offsetHeight - vh;          // ≈ 400vh in px
      const scrollInZone   = Math.max(0, Math.min(totalScrollable, scrollTop - zoneTop));

      if (scrollTop <= 10) {
        setIsAtTop(true);
      } else {
        setIsAtTop(false);
        const progress  = totalScrollable > 0 ? scrollInZone / totalScrollable : 0;
        const startVal  = 17;
        const endVal    = TOTAL_FRAMES;
        const nextFrame = Math.max(startVal, Math.min(endVal, Math.floor(progress * (endVal - startVal)) + startVal));
        setFrame(nextFrame);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    const raf = requestAnimationFrame(handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

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
            <img src="/sara.jpeg" alt="Sana Logo" className="logo-img" />
            <span>Sana</span>
          </div>
          <button className="header-cta" onClick={onStartCall}>Start Call</button>
        </div>
      </header>

      <main className="main-content">

        {/* ── ANIMATION ZONE (500vh tall, sticky frame image inside) ── */}
        <div ref={animZoneRef} className="anim-zone">
          <div className="sticky-hero">
            <img
              src={`/avatar/${ANIM}/${ANIM}_${frame}.jpg`}
              alt="Sana"
              className="frame-bg-image"
              loading="eager"
            />
            <div className="frame-bg-overlay"></div>
            
            {/* Source of light from the left */}
            <div className="left-light-source"></div>

            {/* Content overlay on the right */}
            <div className="hero-right-content">
              <div className="tag">
                <Sparkles size={14} />
                <span>Next-Gen AI Companion</span>
              </div>
              <h1>Talk to Sana</h1>
              <p>
                An emotional voice-to-voice AI companion that feels alive. Sana reacts dynamically to your presence, voice, and expressions in real-time.
              </p>
              <div className="btn-container">
                <button className="cta-button" onClick={onStartCall}>
                  <Phone size={18} />
                  <span>Start Call</span>
                </button>
              </div>
            </div>

             {/* Scroll hint at bottom */}
            <div className="hero-scroll-hint">
              <span>Scroll to animate</span>
              <div className="scroll-arrow">↓</div>
            </div>

            {/* Pure black text over white patti infinite play */}
            <div className="ticker-wrap">
              <div className="ticker-content">
                <span className="ticker-item">SANA AI • NEXT-GEN EMOTIONAL COMPANION • TALK NATURALLY • REAL-TIME VOICE RESPONSE • EXPRESSIVE EMOTIONS • </span>
                <span className="ticker-item">SANA AI • NEXT-GEN EMOTIONAL COMPANION • TALK NATURALLY • REAL-TIME VOICE RESPONSE • EXPRESSIVE EMOTIONS • </span>
              </div>
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

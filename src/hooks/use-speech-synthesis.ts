'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeakOptions {
  onEnd?: () => void;
}

// ─── Module-level refs ────────────────────────────────────────────────────────
// Prevent Android Chrome from garbage-collecting the utterance object mid-speech
let _utterance: SpeechSynthesisUtterance | null = null;

function getBestVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  // Prefer any hi-IN voice
  const hiIN = voices.find((v) => v.lang === 'hi-IN' || v.lang === 'hi_IN');
  if (hiIN) return hiIN;

  // Settle for any Hindi
  const hi = voices.find((v) => v.lang.startsWith('hi'));
  if (hi) return hi;

  // Indian English
  const enIN = voices.find((v) => v.lang === 'en-IN');
  if (enIN) return enIN;

  // Default system voice
  return voices.find((v) => v.default) ?? voices[0] ?? null;
}

export function useSpeechSynthesis() {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Detect support ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ok = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    setSupported(ok);
  }, []);

  // ── Load voices (with polling for Android Chrome) ───────────────────────────
  useEffect(() => {
    if (!supported) return;

    const tryLoad = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        setVoicesLoaded(true);
        return;
      }
      pollTimerRef.current = setTimeout(tryLoad, 300);
    };

    // onvoiceschanged fires reliably on desktop; polling is the fallback for Android
    window.speechSynthesis.onvoiceschanged = () => {
      setVoicesLoaded(true);
    };

    tryLoad();

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [supported]);

  // ── speak ───────────────────────────────────────────────────────────────────
  // IMPORTANT: This function MUST be called directly from a user-gesture handler
  // (onClick, onTouchEnd etc.) — NOT inside a setTimeout or Promise.then.
  // Android Chrome blocks TTS that isn't directly tied to a gesture.
  const speak = useCallback(
    (text: string, options: SpeakOptions = {}) => {
      if (!supported || !text.trim()) {
        options.onEnd?.();
        return;
      }

      const synth = window.speechSynthesis;
      // Cancel any ongoing speech first
      synth.cancel();

      const utterance = new SpeechSynthesisUtterance(text.trim());
      _utterance = utterance; // Keep alive – prevents Android GC bug

      const voice = getBestVoice();
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang ?? 'hi-IN';
      utterance.volume = 1;
      // Don't set rate/pitch on older Android engines – causes silent failures

      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => { setSpeaking(false); options.onEnd?.(); };
      utterance.onerror = (e) => {
        // "interrupted" and "canceled" are expected; only log real errors
        if (e.error !== 'interrupted' && e.error !== 'canceled') {
          console.error('[TTS error]', e.error);
        }
        setSpeaking(false);
        options.onEnd?.();
      };

      // The resume() before speak() wakes up Android Chrome's speech engine
      // when it has been paused by a page-visibility or audio-focus event
      synth.resume();
      synth.speak(utterance);
    },
    [supported]
  );

  const cancel = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
    setSpeaking(false);
  }, [supported]);

  return { supported, speaking, voicesLoaded, speak, cancel };
}

'use client';

import { useEffect, useMemo, useState } from 'react';

interface SpeakOptions {
  onEnd?: () => void;
}

function pickBestVoice(voices: SpeechSynthesisVoice[]) {
  // First try to find any Hindi voice
  const hindi = voices.find((voice) => /hi-IN/i.test(voice.lang));
  if (hindi) {
    return hindi;
  }

  // Fallback to Indian English
  const indianEnglish = voices.find((voice) => /en-IN/i.test(voice.lang));
  if (indianEnglish) {
    return indianEnglish;
  }

  return voices.find((voice) => voice.default) ?? voices[0] ?? null;
}

// Store utterance globally to prevent Android Chrome Garbage Collection bug
// which stops speech midway and never fires onend
// Store utterance globally to prevent Android Chrome Garbage Collection bug
// which stops speech midway and never fires onend
let globalUtterance: SpeechSynthesisUtterance | null = null;

export function useSpeechSynthesis() {
  const [supported, setSupported] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window);
  }, []);

  useEffect(() => {
    if (!supported) {
      return;
    }

    let attempts = 0;
    const updateVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) {
        setVoices(v);
      } else if (attempts < 10) {
        attempts++;
        setTimeout(updateVoices, 250);
      }
    };

    updateVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      setVoices(window.speechSynthesis.getVoices());
    };

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [supported]);

  const selectedVoice = useMemo(() => pickBestVoice(voices), [voices]);

  const speak = (text: string, options: SpeakOptions = {}) => {
    if (!supported || !text.trim()) {
      options.onEnd?.();
      return;
    }

    if (speaking) {
      window.speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text.trim());
    globalUtterance = utterance; // Prevent GC on Android Chrome

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    // Android Chrome sometimes only recognizes "hi" instead of "hi-IN"
    utterance.lang = selectedVoice?.lang ?? 'hi'; 
    
    // Simplest settings possible to avoid Android engine crash
    utterance.volume = 1;
    
    utterance.onstart = () => setSpeaking(true);
    utterance.onerror = (e) => {
      console.error('SpeechSynthesisError:', e);
      // Alert the user so they can debug the issue on their phone
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        alert('Voice Error: ' + e.error);
      }
      setSpeaking(false);
      options.onEnd?.();
    };
    utterance.onend = () => {
      setSpeaking(false);
      options.onEnd?.();
    };

    setSpeaking(true);
    
    // Resume hack for Android Chrome stuck states
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
    // Another resume right after speak to force it on some broken Samsung browsers
    setTimeout(() => {
      window.speechSynthesis.resume();
    }, 100);
  };

  const cancel = () => {
    if (!supported) {
      return;
    }

    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
    setSpeaking(false);
  };

  return {
    supported,
    speaking,
    selectedVoice,
    speak,
    cancel,
  };
}

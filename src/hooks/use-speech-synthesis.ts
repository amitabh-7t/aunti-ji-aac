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

    const updateVoices = () => setVoices(window.speechSynthesis.getVoices());
    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;

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
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    utterance.lang = selectedVoice?.lang ?? 'hi-IN';
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onstart = () => setSpeaking(true);
    utterance.onerror = () => {
      setSpeaking(false);
      options.onEnd?.();
    };
    utterance.onend = () => {
      setSpeaking(false);
      options.onEnd?.();
    };

    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const cancel = () => {
    if (!supported) {
      return;
    }

    window.speechSynthesis.cancel();
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

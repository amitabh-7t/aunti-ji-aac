'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type UtteranceEvent = {
  id: number;
  text: string;
};

interface UseSpeechRecognitionOptions {
  language?: string;
  autoRestart?: boolean;
}

const DEFAULT_LANGUAGE = 'en-IN';

export function useSpeechRecognition(options: UseSpeechRecognitionOptions = {}) {
  const language = options.language ?? DEFAULT_LANGUAGE;
  const autoRestart = options.autoRestart ?? true;
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const shouldKeepAliveRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);
  const lastFinalTextRef = useRef('');
  const utteranceIdRef = useRef(0);

  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [latestFinalUtterance, setLatestFinalUtterance] = useState<UtteranceEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const recognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setSupported(Boolean(recognitionCtor));
  }, []);

  useEffect(() => {
    return () => {
      if (restartTimerRef.current !== null) {
        window.clearTimeout(restartTimerRef.current);
      }

      recognitionRef.current?.abort();
    };
  }, []);

  const createRecognition = useMemo(() => {
    return () => {
      const recognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
      if (!recognitionCtor) {
        return null;
      }

      const recognition = new recognitionCtor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = language;

      recognition.onstart = () => {
        setListening(true);
        setError(null);
      };

      recognition.onresult = (event) => {
        let interimText = '';
        let finalText = '';

        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const transcript = result[0]?.transcript?.trim() ?? '';
          if (!transcript) {
            continue;
          }

          if (result.isFinal) {
            finalText = finalText ? `${finalText} ${transcript}` : transcript;
          } else {
            interimText = interimText ? `${interimText} ${transcript}` : transcript;
          }
        }

        setInterimTranscript(interimText);

        if (finalText) {
          const normalized = finalText.replace(/\s+/g, ' ').trim();
          if (normalized && normalized !== lastFinalTextRef.current) {
            lastFinalTextRef.current = normalized;
            utteranceIdRef.current += 1;
            setLatestFinalUtterance({ id: utteranceIdRef.current, text: normalized });
          }
        }
      };

      recognition.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          shouldKeepAliveRef.current = false;
        }

        setError(event.message || event.error);
      };

      recognition.onend = () => {
        setListening(false);
        setInterimTranscript('');

        if (!shouldKeepAliveRef.current || !autoRestart) {
          return;
        }

        if (restartTimerRef.current !== null) {
          window.clearTimeout(restartTimerRef.current);
        }

        restartTimerRef.current = window.setTimeout(() => {
          try {
            recognition.start();
          } catch {
            // If the browser rejects an immediate restart, the user can tap start again.
          }
        }, 250);
      };

      recognitionRef.current = recognition;
      return recognition;
    };
  }, [autoRestart, language]);

  const start = () => {
    const recognition = recognitionRef.current ?? createRecognition();
    if (!recognition) {
      setError('Speech recognition is not supported in this browser.');
      return;
    }

    shouldKeepAliveRef.current = true;
    setError(null);

    try {
      recognition.start();
    } catch {
      // Ignore duplicate start attempts.
    }
  };

  const stop = () => {
    shouldKeepAliveRef.current = false;
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }

    try {
      recognitionRef.current?.stop();
    } catch {
      // Ignore stop failures.
    }
  };

  const resetLatestUtterance = () => {
    setLatestFinalUtterance(null);
  };

  return {
    supported,
    listening,
    interimTranscript,
    latestFinalUtterance,
    error,
    start,
    stop,
    resetLatestUtterance,
  };
}

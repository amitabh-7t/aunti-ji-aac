'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useConversation } from '@/context/conversation-context';
import { useSpeechRecognition } from '@/hooks/use-speech-recognition';
import { useSpeechSynthesis } from '@/hooks/use-speech-synthesis';

function statusLabel(listening: boolean, speaking: boolean, thinking: boolean) {
  if (speaking) {
    return 'आवाज़ आ रही है...';
  }

  if (thinking) {
    return 'सोच रहे हैं...';
  }

  if (listening) {
    return 'सुन रहे हैं...';
  }

  return 'रुका हुआ';
}

async function fetchSuggestions(history: ReturnType<typeof useConversation>['turns'], latestInput: string) {
  const response = await fetch('/api/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ history, latestInput }),
  });

  const payload = (await response.json()) as { suggestions?: string[] };
  return Array.isArray(payload.suggestions) ? payload.suggestions.slice(0, 4) : [];
}

export function AacShell() {
  const { turns, addTurn, deleteTurn, clearTurns } = useConversation();
  const [suggestions, setSuggestions] = useState<string[]>(['हाँ बेटा', 'ठीक है', 'अभी नहीं', 'मुझे चाहिए']);
  const [thinking, setThinking] = useState(false);
  const [activeInput, setActiveInput] = useState('');
  const [micStarted, setMicStarted] = useState(false);
  const [customText, setCustomText] = useState('');
  const latestUtteranceIdRef = useRef<number | null>(null);
  const debounceTimerRef = useRef<number | null>(null);

  const { supported: recognitionSupported, listening, interimTranscript, latestFinalUtterance, error, start, stop, resetLatestUtterance } =
    useSpeechRecognition({ language: 'en-IN', autoRestart: true });
  const { supported: speechSupported, speaking, speak, cancel } = useSpeechSynthesis();

  const status = useMemo(() => statusLabel(listening, speaking, thinking), [listening, speaking, thinking]);

  const speakWithSilence = (text: string) => {
    const wasListening = listening;
    if (wasListening) {
      stop();
    }
    speak(text, {
      onEnd: () => {
        if (wasListening) {
          setTimeout(() => {
            start();
          }, 400);
        }
      },
    });
  };

  useEffect(() => {
    if (!latestFinalUtterance) {
      return;
    }

    if (latestUtteranceIdRef.current === latestFinalUtterance.id) {
      return;
    }

    latestUtteranceIdRef.current = latestFinalUtterance.id;
    setActiveInput(latestFinalUtterance.text);

    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(async () => {
      const nextHistory = [
        ...turns,
        {
          id: crypto.randomUUID(),
          role: 'partner' as const,
          text: latestFinalUtterance.text,
          createdAt: Date.now(),
          source: 'speech' as const,
        },
      ].slice(-10);

      addTurn({ role: 'partner', text: latestFinalUtterance.text, source: 'speech' });
      setThinking(true);

      try {
        const nextSuggestions = await fetchSuggestions(nextHistory, latestFinalUtterance.text);
        if (nextSuggestions.length) {
          setSuggestions(nextSuggestions);
        }
      } finally {
        setThinking(false);
        resetLatestUtterance();
      }
    }, 650);
  }, [addTurn, latestFinalUtterance, resetLatestUtterance, turns]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handlePrimaryAction = () => {
    if (listening) {
      stop();
      setMicStarted(false);
      cancel();
      return;
    }

    start();
    setMicStarted(true);
  };

  const handleSuggestionTap = (suggestion: string) => {
    addTurn({ role: 'user', text: suggestion, source: 'tap' });
    speakWithSilence(suggestion);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = customText.trim();
    if (!text) return;

    addTurn({ role: 'user', text, source: 'tap' });
    speakWithSilence(text);
    setCustomText('');
  };

  const handleQuickWordAppend = (word: string) => {
    setCustomText((prev) => {
      const trimmed = prev.trim();
      return trimmed ? `${trimmed} ${word}` : word;
    });
  };

  const handleClear = () => {
    clearTurns();
    setSuggestions(['हाँ बेटा', 'ठीक है', 'अभी नहीं', 'मुझे चाहिए']);
    setActiveInput('');
    cancel();
  };

  return (
    <main className="aac-shell min-h-screen px-3 py-3 text-ink-50 sm:px-6 sm:py-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-1.5rem)] w-full max-w-4xl flex-col gap-4 rounded-3xl border border-white/10 bg-[color:var(--panel)] p-3 shadow-[0_30px_90px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-6">
        
        {/* Simple Header */}
        <header className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[color:var(--panel-strong)] p-3 shadow-glow sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-[var(--font-accent)] text-2xl font-bold text-white sm:text-3xl">आँटी जी</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip label={status} active={listening || speaking || thinking} />
            <StatusChip label={recognitionSupported ? 'माइक चालू है' : 'माइक सपोर्ट नहीं है'} active={recognitionSupported} />
            <StatusChip label={speechSupported ? 'आवाज़ तैयार है' : 'आवाज़ सपोर्ट नहीं है'} active={speechSupported} />
          </div>
        </header>

        {/* Stack Layout - Mobile Friendly & Direct Purpose */}
        <section className="flex flex-col gap-4">
          
          {/* 1. Quick Replies (Most Used Option on Top) */}
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 shadow-bubble">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-ink-200/70">त्वरित जवाब</p>
                <h2 className="mt-0.5 text-xl font-semibold text-white">एक बटन दबाएं</h2>
              </div>
              <button
                type="button"
                onClick={handleClear}
                className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-xs font-semibold text-ink-100 transition hover:bg-white/10 active:scale-95"
              >
                साफ़ करें
              </button>
            </div>

            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
              {suggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion}-${index}`}
                  type="button"
                  onClick={() => handleSuggestionTap(suggestion)}
                  className="group min-h-[5.5rem] rounded-2xl border border-white/12 bg-[linear-gradient(145deg,rgba(255,255,255,0.12),rgba(255,255,255,0.04))] px-4 py-4 text-left shadow-bubble transition hover:border-white/25 active:scale-[0.98]"
                >
                  <span className="block text-[10px] uppercase tracking-[0.32em] text-ink-200/60">विकल्प {index + 1}</span>
                  <span className="mt-2 block text-2xl font-extrabold leading-tight text-white sm:text-3xl">
                    {suggestion}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Custom Reply Section */}
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4 shadow-bubble">
            <div className="mb-3">
              <p className="text-xs uppercase tracking-[0.35em] text-ink-200/70">अपना जवाब लिखें</p>
              <h2 className="mt-0.5 text-xl font-semibold text-white">लिखें या शब्द चुनें</h2>
            </div>

            <form onSubmit={handleCustomSubmit} className="space-y-3">
              <textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="यहाँ अपना जवाब लिखें..."
                className="w-full min-h-[4.5rem] rounded-xl border border-white/10 bg-white/5 p-3 text-lg text-white placeholder-white/30 focus:border-apricot/40 focus:outline-none transition resize-none"
                rows={2}
              />

              <div className="flex flex-col gap-3">
                {/* Quick Phrase Helpers */}
                <div className="flex flex-wrap gap-1.5">
                  {['हाँ', 'नहीं', 'पानी', 'चाय', 'दर्द', 'टॉयलेट', 'ठीक है', 'सोना है'].map((word) => (
                    <button
                      key={word}
                      type="button"
                      onClick={() => handleQuickWordAppend(word)}
                      className="rounded-full border border-white/8 bg-white/6 px-3.5 py-2 text-sm text-white hover:bg-white/12 active:scale-95 transition"
                    >
                      {word}
                    </button>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={!customText.trim()}
                  className="w-full min-h-14 rounded-xl bg-gradient-to-r from-apricot to-coral text-base font-bold text-ink-900 shadow-glow transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  बोलें और सेव करें
                </button>
              </div>
            </form>
          </div>

          {/* 3. Mic Control Section */}
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4 shadow-bubble">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-ink-200/70">आवाज़ सुनना</p>
                <h2 className="mt-0.5 text-xl font-semibold text-white">
                  {micStarted ? 'परिवार की आवाज़ सुन रहे हैं' : 'माइक चालू करने के लिए दबाएं'}
                </h2>
              </div>
              <button
                type="button"
                onClick={handlePrimaryAction}
                className="min-h-14 sm:min-h-16 rounded-xl border border-white/10 bg-gradient-to-r from-apricot via-coral to-sky px-6 text-base font-bold text-ink-900 shadow-glow transition active:scale-[0.98]"
              >
                {listening ? 'सुनना बंद करें' : 'सुनना शुरू करें'}
              </button>
            </div>

            <div className="mt-3 grid gap-3 grid-cols-1 sm:grid-cols-2">
              <StatCard label="आखिरी बार सुना" value={activeInput || 'आवाज़ का इंतज़ार है...'} />
              <StatCard label="लाइव शब्द" value={interimTranscript || 'कुछ सुनाई नहीं दिया...'} />
            </div>

            {error ? (
              <p className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-100">{error}</p>
            ) : null}
          </div>

          {/* 4. Conversation History */}
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4 shadow-bubble">
            <p className="text-xs uppercase tracking-[0.35em] text-ink-200/70">बातचीत का इतिहास</p>
            <div className="mt-3 flex max-h-[14rem] flex-col gap-2.5 overflow-auto pr-1">
              {turns.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/12 px-4 py-5 text-sm text-ink-200/70">
                  अभी कोई बातचीत शुरू नहीं हुई है।
                </div>
              ) : (
                turns.map((turn) => (
                  <div
                    key={turn.id}
                    className={`relative group rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed transition ${
                      turn.role === 'partner'
                        ? 'border-sky-300/20 bg-sky-400/10 text-sky-50'
                        : 'border-mint-300/20 bg-mint-400/10 text-mint-50'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1">
                        <div className="mb-0.5 text-[10px] uppercase tracking-[0.2em] text-white/55">
                          {turn.role === 'partner' ? 'परिवार' : 'आँटी जी'} · {turn.source === 'speech' ? 'बोला' : 'दबाया'}
                        </div>
                        <p className="break-words">{turn.text}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteTurn(turn.id)}
                        className="text-white/40 hover:text-red-400 p-1 -mr-1 -mt-1 rounded-full hover:bg-white/10 active:scale-95 transition"
                        title="हटाएं"
                        aria-label="हटाएं"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </section>
      </section>
    </main>
  );
}

function StatusChip({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${
        active
          ? 'border-white/15 bg-white/10 text-white'
          : 'border-white/10 bg-black/20 text-ink-200/70'
      }`}
    >
      <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${active ? 'bg-apricot' : 'bg-white/25'}`} />
      {label}
    </span>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/6 p-3">
      <p className="text-[10px] uppercase tracking-[0.25em] text-ink-200/65">{label}</p>
      <p className="mt-2 line-clamp-2 min-h-[3rem] text-base font-semibold text-white">{value}</p>
    </div>
  );
}

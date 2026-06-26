'use client';

import { useEffect, useRef, useState } from 'react';
import { useConversation } from '@/context/conversation-context';
import { useSpeechRecognition } from '@/hooks/use-speech-recognition';
import { useSpeechSynthesis } from '@/hooks/use-speech-synthesis';

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function fetchSuggestions(
  history: ReturnType<typeof useConversation>['turns'],
  latestInput: string
): Promise<string[]> {
  try {
    const response = await fetch('/api/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history, latestInput }),
    });
    const payload = (await response.json()) as { suggestions?: string[] };
    return Array.isArray(payload.suggestions) ? payload.suggestions.slice(0, 4) : [];
  } catch {
    return [];
  }
}

const DEFAULT_SUGGESTIONS = ['हाँ बेटा', 'ठीक है', 'अभी नहीं', 'मुझे चाहिए'];

// ─── Component ────────────────────────────────────────────────────────────────
export function AacShell() {
  const { turns, addTurn, deleteTurn, clearTurns } = useConversation();

  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const [thinking, setThinking] = useState(false);
  const [customText, setCustomText] = useState('');

  // Speech Recognition
  const {
    supported: micSupported,
    listening,
    interimTranscript,
    latestFinalUtterance,
    error: micError,
    start: startMic,
    stop: stopMic,
    resetLatestUtterance,
  } = useSpeechRecognition({ language: 'hi-IN', autoRestart: true });

  // Speech Synthesis
  const { supported: ttsSupported, speaking, speak, cancel } = useSpeechSynthesis();

  // De-dup tracking
  const lastUtteranceIdRef = useRef<number | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── When speech recognition returns a final result → call LLM ──────────────
  useEffect(() => {
    if (!latestFinalUtterance) return;
    if (latestFinalUtterance.id === lastUtteranceIdRef.current) return;

    lastUtteranceIdRef.current = latestFinalUtterance.id;

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(async () => {
      const spokenText = latestFinalUtterance.text;

      const historySnapshot = [
        ...turns,
        { id: crypto.randomUUID(), role: 'partner' as const, text: spokenText, createdAt: Date.now(), source: 'speech' as const },
      ].slice(-10);

      addTurn({ role: 'partner', text: spokenText, source: 'speech' });
      setThinking(true);

      try {
        const next = await fetchSuggestions(historySnapshot, spokenText);
        if (next.length) setSuggestions(next);
      } finally {
        setThinking(false);
        resetLatestUtterance();
      }
    }, 600);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestFinalUtterance]);

  useEffect(() => {
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
  }, []);

  // ─── Handlers ───────────────────────────────────────────────────────────────
  // CRITICAL: speak() MUST be called synchronously inside onClick, never inside
  // a setTimeout/Promise. Android Chrome blocks TTS not triggered by a gesture.
  const handleSuggestionTap = (text: string) => {
    addTurn({ role: 'user', text, source: 'tap' });
    // Stop mic → speak immediately (synchronous gesture chain)
    if (listening) stopMic();
    if (speaking) cancel();
    speak(text, {
      onEnd: () => { if (listening) startMic(); },
    });
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = customText.trim();
    if (!text) return;
    addTurn({ role: 'user', text, source: 'tap' });
    if (listening) stopMic();
    if (speaking) cancel();
    speak(text, {
      onEnd: () => { if (listening) startMic(); },
    });
    setCustomText('');
  };

  const handleMicToggle = () => {
    if (listening) {
      stopMic();
    } else {
      startMic();
    }
  };

  const handleClear = () => {
    clearTurns();
    setSuggestions(DEFAULT_SUGGESTIONS);
    cancel();
  };

  // ─── UI ──────────────────────────────────────────────────────────────────────
  return (
    <main style={{ background: '#f0f4f8', minHeight: '100dvh', fontFamily: "'Noto Sans Devanagari', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 0 40px 0', minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#fff' }}>

        {/* ── Top Bar ── */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e0e8f0', padding: '14px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#2979ff,#5c6bc0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" fill="white" viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zm7 10a7 7 0 0 1-14 0H3a9 9 0 0 0 7.5 8.94V22h3v-1.06A9 9 0 0 0 21 12h-2z"/></svg>
            </div>
            <span style={{ fontWeight: 700, fontSize: 18, color: '#0d1b2a' }}>बोलें</span>
            {thinking && <span style={{ fontSize: 12, color: '#2979ff', background: '#e8f0fe', borderRadius: 20, padding: '2px 10px' }}>सोच रहे हैं...</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {speaking && <span style={{ fontSize: 12, color: '#2ec05f', background: '#e8f8ef', borderRadius: 20, padding: '2px 10px', fontWeight: 600 }}>🔊 बोल रहे हैं</span>}
            <button
              onClick={handleClear}
              style={{ fontSize: 12, color: '#6b8299', background: '#f0f4f8', border: 'none', borderRadius: 20, padding: '4px 14px', cursor: 'pointer' }}
            >
              साफ़
            </button>
          </div>
        </div>

        {/* ── Mic / Listening Area ── */}
        <div style={{ background: listening ? '#e8f0fe' : '#f8fafc', borderBottom: '1px solid #e0e8f0', padding: '20px 16px', textAlign: 'center', transition: 'background 0.3s' }}>
          {listening && (
            <div style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#2979ff', margin: '0 0 8px' }}>सुन रहे हैं...</p>
              {/* Wave bars */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, height: 32 }}>
                {[0.4, 0.7, 1, 0.8, 0.5, 0.9, 0.6, 1, 0.7, 0.4].map((delay, i) => (
                  <div key={i} className="wave-bar" style={{ width: 4, height: 28, borderRadius: 2, background: '#2979ff', animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
            </div>
          )}

          {/* What was heard */}
          {(interimTranscript || latestFinalUtterance?.text) && (
            <div style={{ background: '#fff', border: '2px solid #2979ff', borderRadius: 16, padding: '12px 16px', marginBottom: 12, textAlign: 'left' }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#2979ff', margin: '0 0 4px' }}>परिवार ने कहा:</p>
              <p style={{ fontSize: 20, fontWeight: 700, color: '#0d1b2a', margin: 0, lineHeight: 1.3 }}>
                {interimTranscript || latestFinalUtterance?.text}
              </p>
            </div>
          )}

          {/* Mic Button */}
          <button
            onClick={handleMicToggle}
            disabled={!micSupported}
            style={{
              width: 70, height: 70, borderRadius: '50%', border: 'none', cursor: 'pointer',
              background: listening ? '#2979ff' : '#e8f0fe',
              color: listening ? '#fff' : '#2979ff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto', boxShadow: listening ? '0 0 0 0 rgba(41,121,255,0.5)' : 'none',
              transition: 'all 0.3s',
              position: 'relative',
            }}
          >
            {listening && <div className="pulse-ring" style={{ position: 'absolute', width: 70, height: 70, borderRadius: '50%', border: '4px solid #2979ff' }} />}
            <svg width="28" height="28" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zm7 10a7 7 0 0 1-14 0H3a9 9 0 0 0 7.5 8.94V22h3v-1.06A9 9 0 0 0 21 12h-2z"/>
            </svg>
          </button>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: '#6b8299' }}>
            {!micSupported ? 'माइक सपोर्ट नहीं' : listening ? 'दबाएं बंद करने के लिए' : 'सुनना शुरू करें'}
          </p>
          {micError && <p style={{ margin: '6px 0 0', fontSize: 11, color: '#e53935' }}>{micError}</p>}
        </div>

        {/* ── Quick Reply Buttons ── */}
        <div style={{ padding: '16px 16px 8px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#6b8299', margin: '0 0 12px' }}>
            {thinking ? '⏳ नए जवाब आ रहे हैं...' : 'त्वरित जवाब — एक दबाएं:'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {suggestions.map((text, i) => {
              const colors = [
                { bg: '#2ec05f', shadow: 'rgba(46,192,95,0.35)' },
                { bg: '#2979ff', shadow: 'rgba(41,121,255,0.35)' },
                { bg: '#ff7c1f', shadow: 'rgba(255,124,31,0.35)' },
                { bg: '#e53935', shadow: 'rgba(229,57,53,0.35)' },
              ];
              const c = colors[i % 4];
              return (
                <button
                  key={`${text}-${i}`}
                  onClick={() => handleSuggestionTap(text)}
                  style={{
                    background: c.bg,
                    border: 'none',
                    borderRadius: 20,
                    padding: '18px 14px',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 20,
                    lineHeight: 1.25,
                    textAlign: 'center',
                    cursor: 'pointer',
                    boxShadow: `0 6px 20px ${c.shadow}`,
                    transition: 'transform 0.12s, box-shadow 0.12s',
                    minHeight: 100,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    wordBreak: 'break-word',
                  }}
                  onPointerDown={e => (e.currentTarget.style.transform = 'scale(0.96)')}
                  onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                  onPointerLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  {text}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Custom Text Input ── */}
        <div style={{ padding: '12px 16px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#6b8299', margin: '0 0 8px' }}>खुद लिखें:</p>
          {/* Quick word chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            {['हाँ', 'नहीं', 'पानी', 'चाय', 'दर्द', 'टॉयलेट', 'ठीक है', 'सोना है', 'भूख', 'दवाई'].map((w) => (
              <button
                key={w}
                onClick={() => setCustomText((prev) => (prev.trim() ? `${prev.trim()} ${w}` : w))}
                style={{ background: '#e8f0fe', border: 'none', borderRadius: 20, padding: '6px 14px', fontSize: 14, color: '#2979ff', fontWeight: 600, cursor: 'pointer' }}
              >
                {w}
              </button>
            ))}
          </div>
          <form onSubmit={handleCustomSubmit} style={{ display: 'flex', gap: 8 }}>
            <input
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="यहाँ लिखें..."
              style={{ flex: 1, border: '2px solid #e0e8f0', borderRadius: 14, padding: '12px 14px', fontSize: 16, color: '#0d1b2a', background: '#fff', outline: 'none' }}
              onFocus={e => (e.currentTarget.style.borderColor = '#2979ff')}
              onBlur={e => (e.currentTarget.style.borderColor = '#e0e8f0')}
            />
            <button
              type="submit"
              disabled={!customText.trim()}
              style={{ background: '#2979ff', border: 'none', borderRadius: 14, padding: '12px 18px', color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', opacity: customText.trim() ? 1 : 0.4 }}
            >
              🔊
            </button>
          </form>
        </div>

        {/* ── Conversation History ── */}
        {turns.length > 0 && (
          <div style={{ padding: '4px 16px 16px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#6b8299', margin: '0 0 10px' }}>हाल की बातचीत:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {turns.slice(-8).map((turn) => {
                const isUser = turn.role === 'user';
                return (
                  <div
                    key={turn.id}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 8,
                      flexDirection: isUser ? 'row-reverse' : 'row',
                    }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                      background: isUser ? '#2ec05f' : '#2979ff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isUser
                        ? <svg width="16" height="16" fill="white" viewBox="0 0 24 24"><path d="M3 18.5C3 15.46 7.03 13 12 13s9 2.46 9 5.5V20H3v-1.5zM12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/></svg>
                        : <svg width="16" height="16" fill="white" viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zm7 10a7 7 0 0 1-14 0H3a9 9 0 0 0 7.5 8.94V22h3v-1.06A9 9 0 0 0 21 12h-2z"/></svg>
                      }
                    </div>
                    <div style={{
                      background: isUser ? '#e8f8ef' : '#e8f0fe',
                      borderRadius: isUser ? '18px 4px 18px 18px' : '4px 18px 18px 18px',
                      padding: '8px 12px', flex: 1, maxWidth: '78%',
                    }}>
                      <p style={{ margin: 0, fontSize: 15, color: '#0d1b2a', fontWeight: 500 }}>{turn.text}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 10, color: '#6b8299' }}>
                        {isUser ? '🔊 आपने कहा' : '👂 परिवार ने कहा'}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteTurn(turn.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 14, padding: 4, flexShrink: 0 }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TTS not supported warning ── */}
        {!ttsSupported && (
          <div style={{ margin: '12px 16px', background: '#fde8e8', border: '1px solid #e53935', borderRadius: 12, padding: '10px 14px' }}>
            <p style={{ margin: 0, fontSize: 13, color: '#c62828' }}>⚠️ इस ब्राउज़र में आवाज़ सपोर्ट नहीं है। कृपया Chrome या Samsung Internet में खोलें।</p>
          </div>
        )}
      </div>
    </main>
  );
}

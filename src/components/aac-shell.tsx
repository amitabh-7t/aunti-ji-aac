'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useConversation } from '@/context/conversation-context';
import { useSpeechRecognition } from '@/hooks/use-speech-recognition';
import { useSpeechSynthesis } from '@/hooks/use-speech-synthesis';

// ─── API Helpers ──────────────────────────────────────────────────────────────
async function fetchSuggestions(
  history: ReturnType<typeof useConversation>['turns'],
  latestInput: string
): Promise<string[]> {
  try {
    const res = await fetch('/api/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history, latestInput }),
    });
    const data = (await res.json()) as { suggestions?: string[] };
    return Array.isArray(data.suggestions) ? data.suggestions.slice(0, 4) : [];
  } catch { return []; }
}

async function fetchWordSuggestions(
  partialSentence: string,
  familyInput: string,
  history: ReturnType<typeof useConversation>['turns']
): Promise<string[]> {
  try {
    const res = await fetch('/api/word-suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partialSentence, familyInput, history }),
    });
    const data = (await res.json()) as { words?: string[] };
    return Array.isArray(data.words) ? data.words.slice(0, 6) : [];
  } catch { return []; }
}

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_SUGGESTIONS = ['हाँ बेटा', 'ठीक है', 'अभी नहीं', 'मुझे चाहिए'];
const DEFAULT_WORD_SUGGESTIONS = ['अरे', 'बेटा', 'हाँ', 'नहीं', 'सुनो', 'जरा'];

// ─── Main Component ───────────────────────────────────────────────────────────
export function AacShell() {
  const { turns, addTurn, deleteTurn, clearTurns } = useConversation();

  // Quick Replies state
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const [thinking, setThinking] = useState(false);
  const [customText, setCustomText] = useState('');

  // Word Builder state
  const [builtSentence, setBuiltSentence] = useState('');
  const [wordSuggestions, setWordSuggestions] = useState<string[]>(DEFAULT_WORD_SUGGESTIONS);
  const [loadingWords, setLoadingWords] = useState(false);
  const [familyContext, setFamilyContext] = useState(''); // what the family member said (via builder mic)
  const [builderListening, setBuilderListening] = useState(false);

  const wordFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUtteranceIdRef = useRef<number | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Main mic (for the top listening section) ────────────────────────────────
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

  // ── Builder mic (dedicated to word builder at bottom) ──────────────────────
  const {
    listening: builderMicListening,
    interimTranscript: builderInterim,
    latestFinalUtterance: builderFinal,
    start: startBuilderMic,
    stop: stopBuilderMic,
    resetLatestUtterance: resetBuilderFinal,
  } = useSpeechRecognition({ language: 'hi-IN', autoRestart: false });

  const { supported: ttsSupported, speaking, speak, cancel } = useSpeechSynthesis();

  // ── When main mic hears family → fetch quick replies from LLM ─────────────
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

  // ── When builder mic hears family → set context + refresh word predictions ─
  useEffect(() => {
    if (!builderFinal) return;
    const heard = builderFinal.text;
    setFamilyContext(heard);
    setBuilderListening(false);
    stopBuilderMic();
    resetBuilderFinal();
    // Refresh word suggestions with the new family context
    triggerWordRefresh(builtSentence, heard);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builderFinal]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (wordFetchTimerRef.current) clearTimeout(wordFetchTimerRef.current);
    };
  }, []);

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const triggerWordRefresh = useCallback((sentence: string, familyIn: string) => {
    if (wordFetchTimerRef.current) clearTimeout(wordFetchTimerRef.current);
    wordFetchTimerRef.current = setTimeout(async () => {
      setLoadingWords(true);
      try {
        const words = await fetchWordSuggestions(sentence, familyIn, turns);
        if (words.length) setWordSuggestions(words);
      } finally {
        setLoadingWords(false);
      }
    }, 350);
  }, [turns]);

  // ─── Main mic handlers ──────────────────────────────────────────────────────
  const handleMicToggle = () => { listening ? stopMic() : startMic(); };
  const handleClear = () => { clearTurns(); setSuggestions(DEFAULT_SUGGESTIONS); cancel(); };

  // CRITICAL: speak() must be in onClick, never async/setTimeout (Android Chrome)
  const handleSuggestionTap = (text: string) => {
    addTurn({ role: 'user', text, source: 'tap' });
    if (listening) stopMic();
    if (speaking) cancel();
    speak(text, { onEnd: () => { if (listening) startMic(); } });
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = customText.trim();
    if (!text) return;
    addTurn({ role: 'user', text, source: 'tap' });
    if (listening) stopMic();
    if (speaking) cancel();
    speak(text, { onEnd: () => { if (listening) startMic(); } });
    setCustomText('');
  };

  // ─── Word Builder handlers ──────────────────────────────────────────────────
  const handleBuilderMicToggle = () => {
    if (builderMicListening) {
      stopBuilderMic();
      setBuilderListening(false);
    } else {
      setBuilderListening(true);
      startBuilderMic();
    }
  };

  const handleWordTap = (word: string) => {
    const next = builtSentence ? `${builtSentence} ${word}` : word;
    setBuiltSentence(next);
    triggerWordRefresh(next, familyContext);
  };

  const handleWordBackspace = () => {
    const words = builtSentence.trim().split(' ');
    words.pop();
    const next = words.join(' ');
    setBuiltSentence(next);
    triggerWordRefresh(next, familyContext);
  };

  const handleWordBuilderSpeak = () => {
    if (!builtSentence.trim()) return;
    addTurn({ role: 'user', text: builtSentence.trim(), source: 'tap' });
    if (speaking) cancel();
    speak(builtSentence.trim());
    setBuiltSentence('');
    setFamilyContext('');
    setWordSuggestions(DEFAULT_WORD_SUGGESTIONS);
  };

  const handleWordBuilderClear = () => {
    setBuiltSentence('');
    setFamilyContext('');
    setWordSuggestions(DEFAULT_WORD_SUGGESTIONS);
    stopBuilderMic();
    setBuilderListening(false);
  };

  // ─── Shared Styles ───────────────────────────────────────────────────────────
  const S = {
    label: { fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#6b8299', margin: '0 0 10px' } as React.CSSProperties,
    card: { background: '#fff', border: '1px solid #e0e8f0', borderRadius: 16, padding: 16, marginBottom: 12 } as React.CSSProperties,
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <main style={{ background: '#f0f4f8', minHeight: '100dvh', fontFamily: "'Noto Sans Devanagari', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#fff' }}>

        {/* ══ TOP BAR ══ */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e0e8f0', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#2979ff,#5c6bc0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" fill="white" viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zm7 10a7 7 0 0 1-14 0H3a9 9 0 0 0 7.5 8.94V22h3v-1.06A9 9 0 0 0 21 12h-2z"/></svg>
            </div>
            <span style={{ fontWeight: 700, fontSize: 17, color: '#0d1b2a' }}>बोलें</span>
            {thinking && <span style={{ fontSize: 11, color: '#2979ff', background: '#e8f0fe', borderRadius: 20, padding: '2px 8px' }}>सोच रहे हैं...</span>}
            {speaking && <span style={{ fontSize: 11, color: '#2ec05f', background: '#e8f8ef', borderRadius: 20, padding: '2px 8px' }}>🔊 बोल रहे हैं</span>}
          </div>
          <button onClick={handleClear} style={{ fontSize: 12, color: '#6b8299', background: '#f0f4f8', border: 'none', borderRadius: 20, padding: '4px 12px', cursor: 'pointer' }}>साफ़</button>
        </div>

        {/* ══ MIC LISTEN AREA ══ */}
        <div style={{ background: listening ? '#e8f0fe' : '#f8fafc', borderBottom: '1px solid #e0e8f0', padding: '16px', textAlign: 'center' }}>
          {listening && (
            <div style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#2979ff', margin: '0 0 6px' }}>सुन रहे हैं...</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, height: 28 }}>
                {[0,1,2,3,4,5,6,7,8,9].map((i) => (
                  <div key={i} className="wave-bar" style={{ width: 3, height: 24, borderRadius: 2, background: '#2979ff', animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
            </div>
          )}
          {(interimTranscript || latestFinalUtterance?.text) && (
            <div style={{ background: '#fff', border: '2px solid #2979ff', borderRadius: 14, padding: '10px 14px', marginBottom: 10, textAlign: 'left' }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#2979ff', margin: '0 0 3px' }}>परिवार ने कहा:</p>
              <p style={{ fontSize: 19, fontWeight: 700, color: '#0d1b2a', margin: 0, lineHeight: 1.3 }}>
                {interimTranscript || latestFinalUtterance?.text}
              </p>
            </div>
          )}
          <button onClick={handleMicToggle} disabled={!micSupported} style={{ width: 64, height: 64, borderRadius: '50%', border: 'none', cursor: 'pointer', background: listening ? '#2979ff' : '#e8f0fe', color: listening ? '#fff' : '#2979ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', position: 'relative' }}>
            {listening && <div className="pulse-ring" style={{ position: 'absolute', width: 64, height: 64, borderRadius: '50%', border: '4px solid #2979ff' }} />}
            <svg width="26" height="26" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zm7 10a7 7 0 0 1-14 0H3a9 9 0 0 0 7.5 8.94V22h3v-1.06A9 9 0 0 0 21 12h-2z"/></svg>
          </button>
          <p style={{ margin: '6px 0 0', fontSize: 11, color: '#6b8299' }}>
            {!micSupported ? 'माइक सपोर्ट नहीं' : listening ? 'दबाएं बंद करने के लिए' : 'सुनना शुरू करें'}
          </p>
          {micError && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#e53935' }}>{micError}</p>}
        </div>

        {/* ══ QUICK REPLIES ══ */}
        <div style={{ padding: '14px 16px 8px' }}>
          <p style={S.label}>{thinking ? '⏳ नए जवाब आ रहे हैं...' : 'त्वरित जवाब — एक दबाएं:'}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {suggestions.map((text, i) => {
              const colors = [
                { bg: '#2ec05f', shadow: 'rgba(46,192,95,0.35)' },
                { bg: '#2979ff', shadow: 'rgba(41,121,255,0.35)' },
                { bg: '#ff7c1f', shadow: 'rgba(255,124,31,0.35)' },
                { bg: '#e53935', shadow: 'rgba(229,57,53,0.35)' },
              ];
              const c = colors[i % 4];
              return (
                <button key={`${text}-${i}`} onClick={() => handleSuggestionTap(text)} style={{ background: c.bg, border: 'none', borderRadius: 18, padding: '16px 12px', color: '#fff', fontWeight: 700, fontSize: 19, lineHeight: 1.25, textAlign: 'center', cursor: 'pointer', boxShadow: `0 5px 16px ${c.shadow}`, minHeight: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', wordBreak: 'break-word' }}
                  onPointerDown={e => (e.currentTarget.style.transform = 'scale(0.96)')}
                  onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                  onPointerLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                >{text}</button>
              );
            })}
          </div>
        </div>

        {/* ══ CUSTOM TEXT ══ */}
        <div style={{ padding: '8px 16px' }}>
          <p style={S.label}>खुद लिखें:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {['हाँ', 'नहीं', 'पानी', 'चाय', 'दर्द', 'टॉयलेट', 'ठीक है', 'सोना है', 'भूख', 'दवाई'].map((w) => (
              <button key={w} onClick={() => setCustomText(p => p.trim() ? `${p.trim()} ${w}` : w)} style={{ background: '#e8f0fe', border: 'none', borderRadius: 20, padding: '5px 12px', fontSize: 13, color: '#2979ff', fontWeight: 600, cursor: 'pointer' }}>{w}</button>
            ))}
          </div>
          <form onSubmit={handleCustomSubmit} style={{ display: 'flex', gap: 8 }}>
            <input value={customText} onChange={e => setCustomText(e.target.value)} placeholder="यहाँ लिखें..." style={{ flex: 1, border: '2px solid #e0e8f0', borderRadius: 12, padding: '10px 12px', fontSize: 15, color: '#0d1b2a', background: '#fff', outline: 'none' }} onFocus={e => (e.currentTarget.style.borderColor = '#2979ff')} onBlur={e => (e.currentTarget.style.borderColor = '#e0e8f0')} />
            <button type="submit" disabled={!customText.trim()} style={{ background: '#2979ff', border: 'none', borderRadius: 12, padding: '10px 16px', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: customText.trim() ? 1 : 0.4 }}>🔊</button>
          </form>
        </div>

        {/* ══ CONVERSATION HISTORY ══ */}
        {turns.length > 0 && (
          <div style={{ padding: '4px 16px 12px' }}>
            <p style={S.label}>हाल की बातचीत:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {turns.slice(-6).map((turn) => {
                const isUser = turn.role === 'user';
                return (
                  <div key={turn.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, flexDirection: isUser ? 'row-reverse' : 'row' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: isUser ? '#2ec05f' : '#2979ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {isUser ? <svg width="14" height="14" fill="white" viewBox="0 0 24 24"><path d="M3 18.5C3 15.46 7.03 13 12 13s9 2.46 9 5.5V20H3v-1.5zM12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/></svg> : <svg width="14" height="14" fill="white" viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zm7 10a7 7 0 0 1-14 0H3a9 9 0 0 0 7.5 8.94V22h3v-1.06A9 9 0 0 0 21 12h-2z"/></svg>}
                    </div>
                    <div style={{ background: isUser ? '#e8f8ef' : '#e8f0fe', borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px', padding: '7px 11px', flex: 1, maxWidth: '76%' }}>
                      <p style={{ margin: 0, fontSize: 14, color: '#0d1b2a', fontWeight: 500 }}>{turn.text}</p>
                    </div>
                    <button onClick={() => deleteTurn(turn.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 14, padding: 3, flexShrink: 0 }}>×</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══ WORD BUILDER (BOTTOM — full dedicated section) ══ */}
        <div style={{ marginTop: 'auto', borderTop: '3px solid #7c4dff', background: '#f8f5ff', padding: '0 0 32px 0' }}>
          {/* Header bar */}
          <div style={{ background: 'linear-gradient(135deg,#7c4dff,#2979ff)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.75)' }}>माँ का जवाब</p>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#fff' }}>✨ शब्द जोड़कर वाक्य बनाएं</p>
            </div>
            {builtSentence && (
              <button onClick={handleWordBuilderClear} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 20, padding: '5px 12px', color: '#fff', fontSize: 12, cursor: 'pointer' }}>साफ़ करें</button>
            )}
          </div>

          <div style={{ padding: '14px 16px' }}>
            {/* ── Builder Mic ── listen to what family said */}
            <div style={{ background: builderMicListening ? '#ede7ff' : '#fff', border: `2px solid ${builderMicListening ? '#7c4dff' : '#e0e8f0'}`, borderRadius: 14, padding: '12px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.3s' }}>
              <button
                onClick={handleBuilderMicToggle}
                style={{ width: 48, height: 48, borderRadius: '50%', border: 'none', flexShrink: 0, cursor: 'pointer', background: builderMicListening ? '#7c4dff' : '#ede7ff', color: builderMicListening ? '#fff' : '#7c4dff', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
              >
                {builderMicListening && <div className="pulse-ring" style={{ position: 'absolute', width: 48, height: 48, borderRadius: '50%', border: '3px solid #7c4dff' }} />}
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zm7 10a7 7 0 0 1-14 0H3a9 9 0 0 0 7.5 8.94V22h3v-1.06A9 9 0 0 0 21 12h-2z"/></svg>
              </button>
              <div style={{ flex: 1 }}>
                {builderMicListening ? (
                  <div>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#7c4dff' }}>परिवार की बात सुन रहे हैं...</p>
                    <p style={{ margin: '2px 0 0', fontSize: 14, color: '#0d1b2a' }}>{builderInterim || '...'}</p>
                  </div>
                ) : familyContext ? (
                  <div>
                    <p style={{ margin: 0, fontSize: 10, color: '#9e9e9e', fontWeight: 600 }}>परिवार ने कहा:</p>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#0d1b2a' }}>{familyContext}</p>
                  </div>
                ) : (
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#7c4dff' }}>माइक दबाएं</p>
                    <p style={{ margin: 0, fontSize: 11, color: '#9e9e9e' }}>परिवार क्या कह रहा है सुनें, फिर शब्द चुनें</p>
                  </div>
                )}
              </div>
            </div>

            {/* ── Built sentence display ── */}
            <div style={{ minHeight: 60, background: '#fff', border: `2px solid ${builtSentence ? '#7c4dff' : '#e0e8f0'}`, borderRadius: 14, padding: '12px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: builtSentence ? '#0d1b2a' : '#b0b8c4', flex: 1, lineHeight: 1.3 }}>
                {builtSentence || 'नीचे से शब्द चुनें...'}
              </p>
              {builtSentence && (
                <button onClick={handleWordBackspace} style={{ background: '#fff0f0', border: 'none', borderRadius: 10, padding: '8px 10px', color: '#e53935', fontWeight: 700, fontSize: 18, cursor: 'pointer', flexShrink: 0 }}>⌫</button>
              )}
            </div>

            {/* ── Word suggestion chips ── */}
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#9e9e9e', margin: '0 0 8px' }}>
                {loadingWords ? '⌛ शब्द आ रहे हैं...' : 'अगला शब्द चुनें:'}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {wordSuggestions.map((word, i) => (
                  <button
                    key={`${word}-${i}`}
                    onClick={() => handleWordTap(word)}
                    style={{ background: '#fff', border: '2px solid #7c4dff', borderRadius: 24, padding: '10px 18px', fontSize: 18, fontWeight: 700, color: '#7c4dff', cursor: 'pointer', boxShadow: '0 2px 8px rgba(124,77,255,0.12)', transition: 'all 0.1s' }}
                    onPointerDown={e => { e.currentTarget.style.background = '#7c4dff'; e.currentTarget.style.color = '#fff'; }}
                    onPointerUp={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#7c4dff'; }}
                    onPointerLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#7c4dff'; }}
                  >
                    {word}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Speak full sentence ── */}
            <button
              onClick={handleWordBuilderSpeak}
              disabled={!builtSentence.trim() || !ttsSupported}
              style={{ width: '100%', background: builtSentence.trim() ? '#2ec05f' : '#e0e8f0', border: 'none', borderRadius: 14, padding: '15px 18px', color: builtSentence.trim() ? '#fff' : '#9e9e9e', fontWeight: 700, fontSize: 18, cursor: builtSentence.trim() ? 'pointer' : 'not-allowed', boxShadow: builtSentence.trim() ? '0 4px 16px rgba(46,192,95,0.35)' : 'none', transition: 'all 0.2s' }}
            >
              🔊 यह बोलें
            </button>
          </div>
        </div>

        {!ttsSupported && (
          <div style={{ margin: '0 16px 16px', background: '#fde8e8', border: '1px solid #e53935', borderRadius: 12, padding: '8px 12px' }}>
            <p style={{ margin: 0, fontSize: 12, color: '#c62828' }}>⚠️ आवाज़ सपोर्ट नहीं। Chrome में खोलें।</p>
          </div>
        )}
      </div>
    </main>
  );
}

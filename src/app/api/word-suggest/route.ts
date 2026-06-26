import { NextResponse } from 'next/server';
import type { ConversationTurn } from '@/context/conversation-context';

export const runtime = 'nodejs';

interface WordSuggestRequestBody {
  partialSentence?: string;
  history?: ConversationTurn[];
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as WordSuggestRequestBody;
    const partialSentence = (body.partialSentence ?? '').trim();
    const history = Array.isArray(body.history) ? body.history.slice(-6) : [];

    const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ words: getDefaultWords(partialSentence) });
    }

    const usingGroq = Boolean(process.env.GROQ_API_KEY);
    const endpoint = usingGroq
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';
    const model = process.env.AAC_MODEL || (usingGroq ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini');

    // Build context summary from history
    const contextSummary = history.length
      ? history.map((t) => `${t.role === 'partner' ? 'परिवार' : 'वो'}: ${t.text}`).join('\n')
      : 'कोई पिछली बातचीत नहीं।';

    const systemPrompt = `तुम एक Hindi next-word predictor हो जो एक AAC (Augmentative and Alternative Communication) ऐप के लिए काम करता है। 
एक बुजुर्ग महिला जो बोल नहीं सकती, वो शब्द चुन-चुन कर वाक्य बना रही है।
बातचीत के संदर्भ और अधूरे वाक्य को देखकर, अगले 5 स्वाभाविक हिंदी शब्द सुझाओ।

नियम:
- सिर्फ 5 शब्द, comma से अलग करके
- केवल देवनागरी हिंदी में
- छोटे और आम शब्द जो बातचीत में फिट हों
- हर शब्द अधिकतम 2-3 syllables का हो
- कोई अतिरिक्त text या explanation मत लिखो`;

    const userPrompt = `बातचीत का संदर्भ:
${contextSummary}

अधूरा वाक्य: "${partialSentence || '(शुरुआत)'}"

अगले 5 शब्द सुझाओ:`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.6,
        max_tokens: 80,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      console.error('[word-suggest] API error:', response.status);
      return NextResponse.json({ words: getDefaultWords(partialSentence) });
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };

    const content = payload.choices?.[0]?.message?.content ?? '';
    const words = content
      .split(/[,،\n]/)
      .map((w) => w.trim().replace(/^[\d.\-\*\s]+/, '').trim())
      .filter((w) => w.length > 0 && w.length < 20)
      .slice(0, 6);

    return NextResponse.json({ words: words.length >= 3 ? words : getDefaultWords(partialSentence) });
  } catch (err) {
    console.error('[word-suggest] Error:', err);
    return NextResponse.json({ words: getDefaultWords('') });
  }
}

function getDefaultWords(partial: string): string[] {
  if (!partial) {
    return ['हाँ', 'नहीं', 'मुझे', 'ठीक', 'अभी'];
  }
  return ['है', 'नहीं', 'चाहिए', 'ठीक', 'अच्छा'];
}

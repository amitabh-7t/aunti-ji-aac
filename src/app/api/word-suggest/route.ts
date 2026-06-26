import { NextResponse } from 'next/server';
import type { ConversationTurn } from '@/context/conversation-context';

export const runtime = 'nodejs';

interface WordSuggestRequestBody {
  partialSentence?: string;
  familyInput?: string; // what the family member just said (from mic)
  history?: ConversationTurn[];
}

// Rich UP-style mom vocabulary pool for offline fallback
const UP_MOM_STARTERS = [
  'अरे', 'बेटा', 'हाँ', 'नहीं', 'सुनो', 'देखो', 'जरा', 'थोड़ा', 'बहुत',
  'ठीक', 'अच्छा', 'आओ', 'जाओ', 'लाओ', 'दो', 'काहे', 'कहाँ', 'कब',
];
const UP_MOM_CONTINUERS = [
  'है', 'हूँ', 'हैं', 'था', 'थी', 'करो', 'करना', 'दो', 'लाओ',
  'बेटा', 'जी', 'ना', 'रे', 'तो', 'भी', 'अब', 'मत', 'कर',
];

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as WordSuggestRequestBody;
    const partialSentence = (body.partialSentence ?? '').trim();
    const familyInput = (body.familyInput ?? '').trim();
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

    const historyLines = history.length
      ? history.map((t) => `${t.role === 'partner' ? 'परिवार' : 'माँ'}: ${t.text}`).join('\n')
      : '';

    const systemPrompt = `तुम एक UP (उत्तर प्रदेश) की बुजुर्ग हिंदी-भाषी माँ के लिए next-word predictor हो।
यह माँ बोल नहीं सकती लेकिन परिवार से बात करने के लिए शब्द एक-एक करके चुनती है।

माँ की बोलने की शैली:
- उत्तर प्रदेश की घरेलू हिंदी/अवधी मिश्रित भाषा
- जैसे: "अरे बेटा", "काहे करत हो", "दवाई खाइ लो", "थोड़ा पानी लाओ", "ठीक बा", "हाँ जी", "नाहीं चाही"
- घरेलू शब्द: रोटी, दाल, पानी, चाय, दवाई, थकान, दर्द, सोना, आराम, बेटा, बहू, नाती
- भावनात्मक: अरे, ओह, हाय, चिंता मत करो, ईश्वर करे

नियम:
- ONLY 6 शब्द, comma से अलग
- केवल देवनागरी में
- UP/अवधी मिश्रित स्वाभाविक शब्द
- बहुत छोटे शब्द (1-3 syllables)
- कोई explanation नहीं, सिर्फ शब्द`;

    const contextParts = [];
    if (historyLines) contextParts.push(`पिछली बातचीत:\n${historyLines}`);
    if (familyInput) contextParts.push(`परिवार ने अभी कहा: "${familyInput}"`);
    const context = contextParts.length ? contextParts.join('\n\n') : 'घर में सामान्य बातचीत।';

    const userPrompt = `${context}

माँ का अधूरा जवाब: "${partialSentence || '(माँ अभी जवाब शुरू करेंगी)'}"

अगले 6 शब्द सुझाओ:`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.65,
        max_tokens: 60,
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
      .filter((w) => w.length > 0 && w.length < 15)
      .slice(0, 6);

    return NextResponse.json({ words: words.length >= 3 ? words : getDefaultWords(partialSentence) });
  } catch (err) {
    console.error('[word-suggest] Error:', err);
    return NextResponse.json({ words: getDefaultWords('') });
  }
}

function getDefaultWords(partial: string): string[] {
  if (!partial) return UP_MOM_STARTERS.slice(0, 6);
  return UP_MOM_CONTINUERS.slice(0, 6);
}

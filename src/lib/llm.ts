import type { ConversationTurn } from '@/context/conversation-context';
import { buildSuggestionMessages } from '@/lib/suggestion-prompt';
import { createFallbackSuggestions } from '@/lib/fallback-suggestions';
import { parseSuggestions } from '@/lib/parse-suggestions';

interface SuggestionRequestBody {
  history: ConversationTurn[];
  latestInput: string;
}

function normalizeSuggestions(values: string[]) {
  const uniqueValues = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
  while (uniqueValues.length < 4) {
    uniqueValues.push(...createFallbackSuggestions(uniqueValues.join(' ')));
  }
  return uniqueValues.slice(0, 4);
}

export async function createSuggestions(body: SuggestionRequestBody) {
  const latestInput = body.latestInput.trim();
  if (!latestInput) {
    console.log('[LLM] No latestInput, returning fallback.');
    return createFallbackSuggestions('');
  }

  const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[LLM] ERROR: No API key found. Set GROQ_API_KEY in Vercel environment variables.');
    return createFallbackSuggestions(latestInput);
  }

  const usingGroq = Boolean(process.env.GROQ_API_KEY);
  const endpoint = usingGroq
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : 'https://api.openai.com/v1/chat/completions';
  const model =
    process.env.AAC_MODEL ||
    (usingGroq ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini');

  console.log(`[LLM] Calling ${usingGroq ? 'Groq' : 'OpenAI'} with model: ${model}, input: "${latestInput}"`);

  const { systemPrompt, userPrompt } = buildSuggestionMessages(body.history, latestInput);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      max_tokens: 200,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.error(`[LLM] API error ${response.status}: ${errText}`);
    return createFallbackSuggestions(latestInput);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };

  const content = payload.choices?.[0]?.message?.content ?? '';
  console.log('[LLM] Raw response:', content);

  const parsed = parseSuggestions(content);
  const normalized = normalizeSuggestions(parsed);
  console.log('[LLM] Final suggestions:', normalized);
  return normalized.length ? normalized : createFallbackSuggestions(latestInput);
}

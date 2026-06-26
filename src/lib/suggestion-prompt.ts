import type { ConversationTurn } from '@/context/conversation-context';

export function buildSuggestionMessages(history: ConversationTurn[], latestInput: string) {
  const recentContext = history
    .slice(-10)
    .map((turn) => `${turn.role === 'partner' ? 'Family' : 'She'}: ${turn.text}`)
    .join('\n');

  const systemPrompt = `You are an AI communication assistant for a 48-year-old Indian woman speaking with her family. Read the recent conversation history and the latest input from the family member. Generate exactly 4 highly probable, natural, and culturally appropriate responses she might want to say.
Rule 1: Outputs MUST be in casual conversational Hindi written in Devanagari script (e.g., 'हाँ बेटा', 'ठीक है', 'नहीं मुझे भूख नहीं है', 'चाय पिऊंगी').
Rule 2: Keep responses short (2-7 words).
Rule 3: Output ONLY a JSON array of strings.`;

  const userPrompt = `Recent conversation history:\n${recentContext || '(none)'}\n\nLatest input from family member:\n${latestInput}`;

  return {
    systemPrompt,
    userPrompt,
  };
}

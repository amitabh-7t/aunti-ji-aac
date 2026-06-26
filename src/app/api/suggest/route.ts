import { NextResponse } from 'next/server';
import type { ConversationTurn } from '@/context/conversation-context';
import { createSuggestions } from '@/lib/llm';

export const runtime = 'nodejs';

interface SuggestRequestBody {
  history?: ConversationTurn[];
  latestInput?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SuggestRequestBody;
    const suggestions = await createSuggestions({
      history: Array.isArray(body.history) ? body.history.slice(-10) : [],
      latestInput: typeof body.latestInput === 'string' ? body.latestInput : '',
    });

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: ['हाँ बेटा', 'ठीक है', 'अभी नहीं', 'मुझे चाहिए'] });
  }
}

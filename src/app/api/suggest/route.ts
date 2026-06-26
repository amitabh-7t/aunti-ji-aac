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
    const latestInput = typeof body.latestInput === 'string' ? body.latestInput : '';
    const history = Array.isArray(body.history) ? body.history.slice(-10) : [];

    console.log('[API/suggest] Received request, latestInput:', latestInput);

    const suggestions = await createSuggestions({ history, latestInput });

    console.log('[API/suggest] Returning suggestions:', suggestions);
    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error('[API/suggest] Unhandled error:', err);
    return NextResponse.json({ suggestions: ['हाँ बेटा', 'ठीक है', 'अभी नहीं', 'मुझे चाहिए'] });
  }
}

'use client';

import { ConversationProvider } from '@/context/conversation-context';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <ConversationProvider>{children}</ConversationProvider>;
}

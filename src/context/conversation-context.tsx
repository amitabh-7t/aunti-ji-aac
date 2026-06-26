'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ConversationRole = 'partner' | 'user';

export interface ConversationTurn {
  id: string;
  role: ConversationRole;
  text: string;
  createdAt: number;
  source: 'speech' | 'tap' | 'api';
}

interface ConversationContextValue {
  turns: ConversationTurn[];
  addTurn: (turn: Omit<ConversationTurn, 'id' | 'createdAt'> & { createdAt?: number }) => void;
  deleteTurn: (id: string) => void;
  clearTurns: () => void;
}

const STORAGE_KEY = 'aunti-ji-aac-conversation';
const ConversationContext = createContext<ConversationContextValue | undefined>(undefined);

function normalizeTurns(value: unknown): ConversationTurn[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is ConversationTurn => {
      if (!item || typeof item !== 'object') {
        return false;
      }

      const candidate = item as ConversationTurn;
      return (
        (candidate.role === 'partner' || candidate.role === 'user') &&
        typeof candidate.text === 'string' &&
        typeof candidate.id === 'string' &&
        typeof candidate.createdAt === 'number'
      );
    })
    .slice(-10);
}

export function ConversationProvider({ children }: { children: React.ReactNode }) {
  const [turns, setTurns] = useState<ConversationTurn[]>([]);

  useEffect(() => {
    try {
      const rawValue = window.localStorage.getItem(STORAGE_KEY);
      if (!rawValue) {
        return;
      }

      setTurns(normalizeTurns(JSON.parse(rawValue)));
    } catch {
      setTurns([]);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(turns.slice(-10)));
    } catch {
      // Local storage is optional.
    }
  }, [turns]);

  const value = useMemo<ConversationContextValue>(() => {
    return {
      turns,
      addTurn: (turn) => {
        setTurns((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            createdAt: turn.createdAt ?? Date.now(),
            role: turn.role,
            text: turn.text.trim(),
            source: turn.source,
          },
        ].filter((entry) => entry.text).slice(-10));
      },
      deleteTurn: (id) => {
        setTurns((current) => current.filter((turn) => turn.id !== id));
      },
      clearTurns: () => setTurns([]),
    };
  }, [turns]);

  return <ConversationContext.Provider value={value}>{children}</ConversationContext.Provider>;
}

export function useConversation() {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error('useConversation must be used within a ConversationProvider');
  }

  return context;
}

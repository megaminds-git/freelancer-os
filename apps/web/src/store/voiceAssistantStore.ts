import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ── Types ─────────────────────────────────────────────────────────────────────

export type OrbState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface SessionProject {
  id: string;
  title: string;
  url: string;
  index: number;
}

export interface SessionContext {
  lastProjectList: SessionProject[];
  lastSearchQuery: string;
  lastRoute: string;
  lastAction: string;
  pendingCommand: PendingCommand | null;
}

export interface PendingCommand {
  type: 'search' | 'automation' | 'custom';
  payload: Record<string, string>;
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface VoiceAssistantState {
  // Persisted
  isEnabled: boolean;

  // Runtime (reset on reload)
  orbState: OrbState;
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  response: string;
  conversationHistory: ConversationTurn[];
  sessionContext: SessionContext;

  // Actions
  setEnabled: (enabled: boolean) => void;
  setOrbState: (state: OrbState) => void;
  setListening: (listening: boolean) => void;
  setTranscript: (t: string) => void;
  setInterimTranscript: (t: string) => void;
  setResponse: (r: string) => void;
  addTurn: (turn: ConversationTurn) => void;
  clearConversation: () => void;
  updateSessionContext: (ctx: Partial<SessionContext>) => void;
  setPendingCommand: (cmd: PendingCommand | null) => void;
}

const DEFAULT_SESSION: SessionContext = {
  lastProjectList: [],
  lastSearchQuery: '',
  lastRoute: '/',
  lastAction: '',
  pendingCommand: null,
};

export const useVoiceAssistantStore = create<VoiceAssistantState>()(
  persist(
    (set) => ({
      // Persisted
      isEnabled: false,

      // Runtime defaults
      orbState: 'idle',
      isListening: false,
      transcript: '',
      interimTranscript: '',
      response: '',
      conversationHistory: [],
      sessionContext: DEFAULT_SESSION,

      // Actions
      setEnabled:           (isEnabled)           => set({ isEnabled }),
      setOrbState:          (orbState)             => set({ orbState }),
      setListening:         (isListening)          => set({ isListening }),
      setTranscript:        (transcript)           => set({ transcript }),
      setInterimTranscript: (interimTranscript)    => set({ interimTranscript }),
      setResponse:          (response)             => set({ response }),

      addTurn: (turn) =>
        set((s) => ({
          conversationHistory: [...s.conversationHistory.slice(-18), turn],
        })),

      clearConversation: () =>
        set({ conversationHistory: [], transcript: '', interimTranscript: '', response: '' }),

      updateSessionContext: (ctx) =>
        set((s) => ({ sessionContext: { ...s.sessionContext, ...ctx } })),

      setPendingCommand: (cmd) =>
        set((s) => ({
          sessionContext: { ...s.sessionContext, pendingCommand: cmd },
        })),
    }),
    {
      name: 'voice-assistant-v2',
      partialize: (state) => ({ isEnabled: state.isEnabled }),
    }
  )
);

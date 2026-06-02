// ── ARIA Orchestration Engine ─────────────────────────────────────────────────
// Mounts once inside Layout, persists across all route changes.
// Pipeline: SpeechRecognition → aiEngine → execute actions → speak response

import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVoiceAssistantStore } from '../store/voiceAssistantStore';
import { processCommand } from '../lib/voiceCommands/aiEngine';
import { speak, stopSpeaking } from '../lib/voiceCommands/speechSynthesis';
import { actionRegistry } from '../lib/voiceCommands/actionRegistry';
import { clickByText, fillInput, scrollPage } from '../lib/voiceCommands/domInteraction';
import { useAuthStore } from '../store/authStore';
import type { PlannedAction } from '../lib/voiceCommands/aiEngine';

// ── Web Speech API shims (same approach as before) ────────────────────────────

interface SpeechAlternative   { transcript: string; confidence: number; }
interface SpeechResult        { isFinal: boolean; readonly length: number; [i: number]: SpeechAlternative; }
interface SpeechResultList    { readonly length: number; [i: number]: SpeechResult; }
interface SpeechRecogEvent    extends Event { resultIndex: number; results: SpeechResultList; }
interface SpeechRecogError    extends Event { error: string; }
interface SpeechRecogInstance extends EventTarget {
  continuous: boolean; interimResults: boolean; lang: string; maxAlternatives: number;
  onstart:  ((e: Event) => void) | null;
  onend:    ((e: Event) => void) | null;
  onerror:  ((e: SpeechRecogError) => void) | null;
  onresult: ((e: SpeechRecogEvent) => void) | null;
  start(): void; stop(): void; abort(): void;
}
declare global {
  interface Window {
    SpeechRecognition:       new () => SpeechRecogInstance;
    webkitSpeechRecognition: new () => SpeechRecogInstance;
  }
}

// ── Context value ─────────────────────────────────────────────────────────────

interface VoiceAssistantContextValue { isSupported: boolean; }
const VoiceAssistantContext = createContext<VoiceAssistantContextValue>({ isSupported: false });
export function useVoiceAssistant() { return useContext(VoiceAssistantContext); }

// ── Provider ──────────────────────────────────────────────────────────────────

export default function VoiceAssistantProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const logout   = useAuthStore((s) => s.logout);

  const store = useVoiceAssistantStore;

  const SpeechAPI: (new () => SpeechRecogInstance) | null =
    typeof window !== 'undefined'
      ? (window.SpeechRecognition || window.webkitSpeechRecognition || null)
      : null;

  const isSupported = !!SpeechAPI;

  // ── Stable refs so closures inside recognition handlers stay fresh ──────────
  const isEnabledRef  = useRef(store.getState().isEnabled);
  const navigateRef   = useRef(navigate);
  const logoutRef     = useRef(logout);
  const abortRef      = useRef<AbortController | null>(null);
  const recRef        = useRef<SpeechRecogInstance | null>(null);

  useEffect(() => { isEnabledRef.current = store.getState().isEnabled; });
  useEffect(() => { navigateRef.current = navigate; }, [navigate]);
  useEffect(() => { logoutRef.current   = logout;   }, [logout]);

  // Keep isEnabledRef in sync via store subscription
  useEffect(() => {
    const unsub = store.subscribe((s) => { isEnabledRef.current = s.isEnabled; });
    return unsub;
  }, []);

  // ── Action executor ─────────────────────────────────────────────────────────

  async function executeActions(actions: PlannedAction[]) {
    for (const action of actions) {
      switch (action.type) {

        case 'navigate':
          if (action.route) navigateRef.current(action.route);
          break;

        case 'search':
          if (action.query) {
            store.getState().setPendingCommand({ type: 'search', payload: { query: action.query } });
            // If we're not already on scraper, navigate there so the page can pick it up
            if (store.getState().sessionContext.lastRoute !== '/scraper') {
              navigateRef.current('/scraper');
            } else {
              // Same page — dispatch custom event so Scraper picks it up immediately
              window.dispatchEvent(
                new CustomEvent('aria:command', {
                  detail: { type: 'search', payload: { query: action.query } },
                })
              );
            }
          }
          break;

        case 'automation':
          if (action.automationAction) {
            store.getState().setPendingCommand({
              type: 'automation',
              payload: { action: action.automationAction },
            });
            if (store.getState().sessionContext.lastRoute !== '/automation') {
              navigateRef.current('/automation');
            } else {
              window.dispatchEvent(
                new CustomEvent('aria:command', {
                  detail: { type: 'automation', payload: { action: action.automationAction } },
                })
              );
            }
          }
          break;

        case 'click':
          if (action.clickText) clickByText(action.clickText);
          break;

        case 'fill':
          if (action.fillLabel && action.fillValue !== undefined) {
            fillInput(action.fillLabel, action.fillValue);
          }
          break;

        case 'scroll':
          scrollPage(action.direction ?? 'down');
          break;

        case 'refresh':
          setTimeout(() => window.location.reload(), 900);
          break;

        case 'back':
          navigateRef.current(-1 as unknown as string);
          break;

        case 'logout':
          setTimeout(() => {
            logoutRef.current();
            navigateRef.current('/login');
          }, 1000);
          break;

        case 'open_url':
          if (action.url) window.open(action.url, '_blank', 'noopener,noreferrer');
          break;

        case 'registry': {
          const registered = action.actionId
            ? actionRegistry.getById(action.actionId)
            : undefined;
          if (registered) await registered.execute(action.actionParams);
          break;
        }
      }
      // Brief pause between chained actions so navigation settles
      if (actions.length > 1) await delay(120);
    }
  }

  // ── Main command handler ────────────────────────────────────────────────────

  async function handleTranscript(transcript: string) {
    const s = store.getState();

    // Stop any ongoing speech immediately
    stopSpeaking();

    // Cancel any in-flight AI call
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Transition orb to processing
    s.setOrbState('processing');
    s.setTranscript(transcript);
    s.setInterimTranscript('');

    // Build context snapshot
    const ctx = {
      route: s.sessionContext.lastRoute,
      conversationHistory: s.conversationHistory,
      sessionContext: s.sessionContext,
    };

    // Log user turn
    s.addTurn({ id: uid(), role: 'user', content: transcript, timestamp: Date.now() });

    // Classify intent
    const result = await processCommand(transcript, ctx, controller.signal);
    if (controller.signal.aborted) return;

    // Update orb state and response text
    s.setResponse(result.response);

    // Execute actions
    if (result.actions.length > 0) {
      await executeActions(result.actions);
    }

    // Speak response
    if (result.response) {
      s.setOrbState('speaking');
      await speak(result.response);
    }

    // Log ARIA turn
    if (result.response) {
      s.addTurn({ id: uid(), role: 'assistant', content: result.response, timestamp: Date.now() });
    }

    // Return to listening
    s.setOrbState(isEnabledRef.current ? 'listening' : 'idle');
  }

  // ── SpeechRecognition lifecycle ─────────────────────────────────────────────

  useEffect(() => {
    if (!SpeechAPI) return;

    const s = store.getState();

    if (!s.isEnabled) {
      recRef.current?.abort();
      recRef.current = null;
      s.setListening(false);
      s.setOrbState('idle');
      return;
    }

    function startRecognition() {
      if (!SpeechAPI) return;
      const rec = new SpeechAPI();
      rec.continuous      = true;
      rec.interimResults  = true;
      rec.lang            = 'en-US';
      rec.maxAlternatives = 1;

      rec.onstart = () => {
        store.getState().setListening(true);
        store.getState().setOrbState('listening');
      };

      rec.onend = () => {
        store.getState().setListening(false);
        if (isEnabledRef.current) {
          // Auto-restart after brief pause
          setTimeout(() => {
            if (isEnabledRef.current && recRef.current === rec) {
              try { rec.start(); } catch { startRecognition(); }
            }
          }, 350);
        } else {
          store.getState().setOrbState('idle');
        }
      };

      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          store.getState().setEnabled(false);
          store.getState().setOrbState('error');
          store.getState().setResponse('Microphone permission denied. Please allow access in browser settings.');
          speak('Microphone access denied. Please allow microphone permissions and try again.');
        }
        store.getState().setListening(false);
      };

      rec.onresult = (e) => {
        const result = e.results[e.resultIndex];
        if (!result.isFinal) {
          // Show interim transcript live in the orb panel
          store.getState().setInterimTranscript(result[0].transcript);
        } else {
          const final = result[0].transcript.trim();
          if (final) handleTranscript(final);
        }
      };

      recRef.current = rec;
      try { rec.start(); } catch { /* already running */ }
    }

    startRecognition();

    return () => {
      recRef.current?.abort();
      recRef.current = null;
      store.getState().setListening(false);
      store.getState().setOrbState('idle');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useVoiceAssistantStore((s) => s.isEnabled)]);

  // ── Track current route for context ────────────────────────────────────────

  useEffect(() => {
    const unsub = store.subscribe((s, prev) => {
      // We can't access router state from store, so pages update this via updateSessionContext
      void s; void prev;
    });
    return unsub;
  }, []);

  return (
    <VoiceAssistantContext.Provider value={{ isSupported }}>
      {children}
    </VoiceAssistantContext.Provider>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2);
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

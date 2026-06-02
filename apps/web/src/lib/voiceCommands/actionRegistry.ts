// Dynamic action registry — pages register their voice-executable capabilities
// here so the AI engine knows what's available on the current screen.

import { useEffect } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ActionParam {
  name: string;
  type: 'string' | 'number' | 'boolean';
  description: string;
  required?: boolean;
}

export interface VoiceAction {
  id: string;
  route: string | '*';            // '*' = available on every route
  label: string;
  description: string;
  keywords: string[];             // Hint words the AI or local parser can match
  params?: ActionParam[];
  execute: (
    params?: Record<string, string | number | boolean>
  ) => void | Promise<void>;
}

// ── Registry singleton ────────────────────────────────────────────────────────

class ActionRegistryClass {
  private actions = new Map<string, VoiceAction>();

  register(action: VoiceAction) {
    this.actions.set(action.id, action);
  }

  unregister(id: string) {
    this.actions.delete(id);
  }

  /** All actions available on a given route (includes global '*' actions) */
  getByRoute(route: string): VoiceAction[] {
    return Array.from(this.actions.values()).filter(
      (a) => a.route === '*' || a.route === route
    );
  }

  getAll(): VoiceAction[] {
    return Array.from(this.actions.values());
  }

  getById(id: string): VoiceAction | undefined {
    return this.actions.get(id);
  }

  /** Human-readable summary for the AI system prompt */
  describeForRoute(route: string): string {
    const actions = this.getByRoute(route);
    if (!actions.length) return 'No additional actions registered.';
    return actions
      .map((a) => {
        const paramDesc = a.params?.length
          ? ` (params: ${a.params.map((p) => p.name).join(', ')})`
          : '';
        return `• [${a.id}] ${a.label}${paramDesc} — ${a.description}`;
      })
      .join('\n');
  }
}

export const actionRegistry = new ActionRegistryClass();

// ── React hook for page-level registration ────────────────────────────────────

export function useRegisterVoiceActions(
  factory: () => VoiceAction[],
  deps: React.DependencyList = []
) {
  useEffect(() => {
    const actions = factory();
    actions.forEach((a) => actionRegistry.register(a));
    return () => {
      actions.forEach((a) => actionRegistry.unregister(a.id));
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

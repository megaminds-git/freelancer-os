// ── ARIA AI Intent Engine ─────────────────────────────────────────────────────
// Hybrid pipeline:
//   1. Fast local classifier  — handles obvious commands in < 5 ms
//   2. Claude Haiku via API   — handles complex / ambiguous / chained commands
//                               (requires VITE_ANTHROPIC_API_KEY)
//   3. Absolute local fallback — always returns something useful

import { parseIntent } from './parseIntent';
import { actionRegistry } from './actionRegistry';
import type { ConversationTurn, SessionContext } from '../../store/voiceAssistantStore';
import { getVisibleButtons } from './domInteraction';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlannedAction {
  type:
    | 'navigate'
    | 'search'
    | 'automation'
    | 'click'
    | 'fill'
    | 'scroll'
    | 'refresh'
    | 'back'
    | 'logout'
    | 'open_url'
    | 'registry';
  // navigate
  route?: string;
  label?: string;
  // search
  query?: string;
  // automation
  automationAction?: 'start' | 'stop';
  // click
  clickText?: string;
  // fill
  fillLabel?: string;
  fillValue?: string;
  // scroll
  direction?: 'up' | 'down';
  // open_url
  url?: string;
  // registry action
  actionId?: string;
  actionParams?: Record<string, string | number | boolean>;
}

export interface CommandResult {
  intent: string;
  confidence: number;
  actions: PlannedAction[];
  response: string;
  needsConfirmation: boolean;
}

export interface VoiceContext {
  route: string;
  conversationHistory: ConversationTurn[];
  sessionContext: SessionContext;
}

// ── ARIA system prompt ────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are ARIA (Adaptive Response Intelligence Assistant), the voice-driven AI layer embedded inside FreelancerOS — a platform that helps freelancers find projects, run automated scraping, and manage proposals.

Your job: receive a voice transcript + current app context → return a precise JSON action plan.

CRITICAL RULES:
- Return ONLY valid JSON. No markdown, no explanation, no other text.
- Keep "response" brief, natural, and professional — like JARVIS from Iron Man.
- Resolve contextual references: "the second one" → actions[1] from lastProjectList, "top result" → actions[0], "that project" → most recent item.
- Support chained commands: "search React jobs and open the first result" → two actions.

Response schema:
{
  "intent": string,
  "confidence": number (0-1),
  "actions": [
    { "type": "navigate",   "route": "/path",             "label": "Page Name" }
    { "type": "search",     "query": "search terms" }
    { "type": "automation", "automationAction": "start|stop" }
    { "type": "click",      "clickText": "button label" }
    { "type": "fill",       "fillLabel": "input name",    "fillValue": "value" }
    { "type": "scroll",     "direction": "up|down" }
    { "type": "refresh" }
    { "type": "back" }
    { "type": "logout" }
    { "type": "open_url",   "url": "https://..." }
    { "type": "registry",   "actionId": "action.id",      "actionParams": {} }
  ],
  "response": "Short, confident assistant reply (1-2 sentences max)",
  "needsConfirmation": false
}

ROUTES:
  /             → Dashboard
  /scraper      → Find Projects
  /automation   → Automation
  /ai-analyze   → AI Analyze
  /instructions → Instructions / Templates
  /records      → Proposal Records
  /analytics    → Analytics
  /alerts       → Alerts
  /profile      → Profile
  /settings     → Settings

RESPONSE STYLE (JARVIS-like):
  "Navigating to automation."
  "Searching for React developers now."
  "Automation enabled."
  "Opening the second project."
  "I found the settings page."
  "Sorry, I couldn't locate that feature."
  "Going back."`;

// ── Context builder ───────────────────────────────────────────────────────────

function buildUserMessage(transcript: string, ctx: VoiceContext): string {
  const history = ctx.conversationHistory
    .slice(-6)
    .map((t) => `[${t.role === 'user' ? 'User' : 'ARIA'}]: ${t.content}`)
    .join('\n');

  const sessionLines: string[] = [];
  if (ctx.sessionContext.lastSearchQuery) {
    sessionLines.push(`Last search: "${ctx.sessionContext.lastSearchQuery}"`);
  }
  if (ctx.sessionContext.lastProjectList.length > 0) {
    sessionLines.push(
      `Last project list (${ctx.sessionContext.lastProjectList.length} items):`
    );
    ctx.sessionContext.lastProjectList.slice(0, 6).forEach((p) => {
      sessionLines.push(`  ${p.index + 1}. ${p.title}${p.url ? ` — ${p.url}` : ''}`);
    });
  }

  const buttons = getVisibleButtons().slice(0, 12);
  const registryDesc = actionRegistry.describeForRoute(ctx.route);

  return [
    `Current route: ${ctx.route}`,
    '',
    `Registered actions on this page:\n${registryDesc}`,
    '',
    `Visible buttons: ${buttons.join(', ') || 'none'}`,
    '',
    `Session memory:\n${sessionLines.join('\n') || 'None'}`,
    '',
    `Recent conversation:\n${history || 'None'}`,
    '',
    `User said: "${transcript}"`,
  ].join('\n');
}

// ── Local fast classifier ─────────────────────────────────────────────────────

function tryLocal(transcript: string, _ctx: VoiceContext): CommandResult | null {
  const intent = parseIntent(transcript);

  switch (intent.type) {
    case 'navigate':
      return {
        intent: 'navigate',
        confidence: 0.95,
        actions: [{ type: 'navigate', route: intent.route, label: intent.label }],
        response: `Navigating to ${intent.label}.`,
        needsConfirmation: false,
      };

    case 'search':
      return {
        intent: 'search',
        confidence: 0.92,
        actions: [
          { type: 'navigate', route: '/scraper', label: 'Find Projects' },
          { type: 'search', query: intent.query },
        ],
        response: `Searching for "${intent.query}".`,
        needsConfirmation: false,
      };

    case 'automation':
      return {
        intent: 'automation',
        confidence: 0.93,
        actions: [
          { type: 'navigate', route: '/automation', label: 'Automation' },
          { type: 'automation', automationAction: intent.action },
        ],
        response: intent.action === 'start' ? 'Automation enabled.' : 'Automation stopped.',
        needsConfirmation: false,
      };

    case 'scroll':
      return {
        intent: 'scroll',
        confidence: 0.99,
        actions: [{ type: 'scroll', direction: intent.direction }],
        response: '',
        needsConfirmation: false,
      };

    case 'refresh':
      return {
        intent: 'refresh',
        confidence: 0.99,
        actions: [{ type: 'refresh' }],
        response: 'Reloading page.',
        needsConfirmation: false,
      };

    case 'back':
      return {
        intent: 'back',
        confidence: 0.99,
        actions: [{ type: 'back' }],
        response: 'Going back.',
        needsConfirmation: false,
      };

    case 'logout':
      return {
        intent: 'logout',
        confidence: 0.97,
        actions: [{ type: 'logout' }],
        response: 'Signing out. Goodbye.',
        needsConfirmation: true,
      };

    default:
      return null;
  }
}

// ── Claude API classifier ─────────────────────────────────────────────────────

async function callClaude(
  transcript: string,
  ctx: VoiceContext,
  signal?: AbortSignal
): Promise<CommandResult | null> {
  // Check env var first, then sessionStorage (set via Settings page)
  const apiKey =
    (import.meta as unknown as { env: Record<string, string> }).env
      ?.VITE_ANTHROPIC_API_KEY ||
    (typeof window !== 'undefined' ? sessionStorage.getItem('__aria_key') : null);
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-allow-browser': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserMessage(transcript, ctx) }],
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const text: string = data.content?.[0]?.text ?? '';

    // Extract JSON block from response (Claude sometimes adds brief commentary)
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    return JSON.parse(match[0]) as CommandResult;
  } catch {
    return null;
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function processCommand(
  transcript: string,
  ctx: VoiceContext,
  signal?: AbortSignal
): Promise<CommandResult> {
  // 1. Fast local check for high-confidence obvious commands
  const local = tryLocal(transcript, ctx);
  if (local && local.confidence >= 0.92) return local;

  // 2. AI classification (when API key is configured)
  if (!signal?.aborted) {
    const ai = await callClaude(transcript, ctx, signal);
    if (ai && ai.actions?.length >= 0) return ai;
  }

  // 3. Use lower-confidence local result if any
  if (local) return local;

  // 4. Absolute fallback
  return {
    intent: 'unknown',
    confidence: 0,
    actions: [],
    response: "I'm not sure how to help with that. Could you rephrase?",
    needsConfirmation: false,
  };
}

// Intent types for the voice assistant command system

export type NavigateIntent = {
  type: 'navigate';
  route: string;
  label: string;
};

export type SearchIntent = {
  type: 'search';
  query: string;
};

export type AutomationIntent = {
  type: 'automation';
  action: 'start' | 'stop';
};

export type ScrollIntent = {
  type: 'scroll';
  direction: 'up' | 'down';
};

export type SimpleIntent = {
  type: 'refresh' | 'logout' | 'back';
};

export type UnknownIntent = {
  type: 'unknown';
  transcript: string;
};

export type VoiceIntent =
  | NavigateIntent
  | SearchIntent
  | AutomationIntent
  | ScrollIntent
  | SimpleIntent
  | UnknownIntent;

// ── Navigation route patterns ─────────────────────────────────────────────────

const NAVIGATION_PATTERNS: Array<{
  patterns: RegExp[];
  route: string;
  label: string;
}> = [
  {
    patterns: [/\bdashboard\b/i, /\bhome\b/i, /\bmain\s*page\b/i],
    route: '/',
    label: 'Dashboard',
  },
  {
    patterns: [
      /\bfind\s+projects?\b/i,
      /\bproject\s+search\b/i,
      /\bscraper\b/i,
      /\bsearch\s+projects?\b/i,
    ],
    route: '/scraper',
    label: 'Find Projects',
  },
  {
    patterns: [/\bautomation\b/i, /\bauto\s*scrape\b/i],
    route: '/automation',
    label: 'Automation',
  },
  {
    patterns: [
      /\bai\s*anal[yz]/i,
      /\banal[yz].*ai\b/i,
      /\bai\s*analy[sz]/i,
      /\banalyze\s+project/i,
    ],
    route: '/ai-analyze',
    label: 'AI Analyze',
  },
  {
    patterns: [/\binstructions?\b/i, /\btemplates?\b/i],
    route: '/instructions',
    label: 'Instructions',
  },
  {
    patterns: [/\brecords?\b/i, /\bproposals?\b/i],
    route: '/records',
    label: 'Records',
  },
  {
    patterns: [/\banalytics?\b/i, /\bstats\b/i, /\bmetrics?\b/i],
    route: '/analytics',
    label: 'Analytics',
  },
  {
    patterns: [/\balerts?\b/i, /\bnotifications?\b/i],
    route: '/alerts',
    label: 'Alerts',
  },
  {
    patterns: [/\bprofile\b/i, /\bmy\s+profile\b/i, /\baccount\b/i],
    route: '/profile',
    label: 'Profile',
  },
  {
    patterns: [/\bsettings?\b/i, /\bpreferences?\b/i, /\bconfig\b/i],
    route: '/settings',
    label: 'Settings',
  },
];

// ── Main intent parser ────────────────────────────────────────────────────────

export function parseIntent(rawTranscript: string): VoiceIntent {
  const t = rawTranscript.trim().toLowerCase();

  // Strip leading navigation verbs to normalise "go to X", "open X", etc.
  const navCandidate = t.replace(
    /^(go\s+to|open|navigate\s+to|show\s+me|take\s+me\s+to|switch\s+to)\s+/i,
    ''
  );

  // Navigation — check both the stripped candidate and the original
  for (const { patterns, route, label } of NAVIGATION_PATTERNS) {
    if (patterns.some((p) => p.test(navCandidate) || p.test(t))) {
      return { type: 'navigate', route, label };
    }
  }

  // Search — "search for X", "search X", "find X", "look for X", "query X"
  const searchMatch = t.match(
    /^(?:search(?:\s+for)?|find|look\s+for|query|lookup)\s+(.+)/i
  );
  if (searchMatch) {
    return { type: 'search', query: searchMatch[1].trim() };
  }

  // Automation ON
  if (
    /\b(start|turn\s+on|enable|activate|begin)\b.*\bautomation\b/i.test(t) ||
    /\bautomation\b.*\b(on|start|enable|activate)\b/i.test(t)
  ) {
    return { type: 'automation', action: 'start' };
  }

  // Automation OFF
  if (
    /\b(stop|turn\s+off|disable|deactivate|pause|end|halt)\b.*\bautomation\b/i.test(t) ||
    /\bautomation\b.*\b(off|stop|disable|deactivate|pause)\b/i.test(t)
  ) {
    return { type: 'automation', action: 'stop' };
  }

  // Scroll
  if (/\bscroll\s+(down|lower|below|more)\b/i.test(t)) {
    return { type: 'scroll', direction: 'down' };
  }
  if (/\bscroll\s+(up|top|higher|back)\b/i.test(t)) {
    return { type: 'scroll', direction: 'up' };
  }

  // Page refresh
  if (/\b(refresh|reload)\b/i.test(t)) {
    return { type: 'refresh' };
  }

  // Navigate back
  if (/\b(go\s+back|go\s+back|previous\s+page|back)\b/i.test(t)) {
    return { type: 'back' };
  }

  // Logout
  if (/\b(log\s*out|sign\s*out|logout|signout)\b/i.test(t)) {
    return { type: 'logout' };
  }

  return { type: 'unknown', transcript: rawTranscript };
}

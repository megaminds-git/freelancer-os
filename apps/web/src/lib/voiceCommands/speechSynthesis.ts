// Premium speech synthesis — ARIA voice output layer
// Selects the best available browser voice, manages the queue,
// and provides a simple speak/stop API.

// Preferred voice names in priority order (covers Chrome, Edge, Safari, Firefox)
const PREFERRED_VOICES = [
  'Google UK English Female',
  'Google US English',
  'Microsoft Zira Desktop - English (United States)',
  'Microsoft David Desktop - English (United States)',
  'Microsoft Mark - English (United States)',
  'Samantha',
  'Karen',
  'Moira',
  'Tessa',
  'Daniel',
];

let _voice: SpeechSynthesisVoice | null = null;
let _voiceLoaded = false;

function resolveVoice(): SpeechSynthesisVoice | null {
  if (_voice) return _voice;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  for (const name of PREFERRED_VOICES) {
    const found = voices.find((v) => v.name.toLowerCase().includes(name.toLowerCase()));
    if (found) { _voice = found; return found; }
  }
  // Fallback: first English voice, then any voice
  _voice = voices.find((v) => v.lang.startsWith('en')) ?? voices[0] ?? null;
  return _voice;
}

// Chrome loads voices asynchronously — reset cache when they arrive
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    _voice = null;
    _voiceLoaded = true;
    resolveVoice();
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

let _speaking = false;

export interface SpeakOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  interrupt?: boolean;
}

export function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text.trim()) {
      resolve();
      return;
    }

    // Interrupt by default (natural for voice assistants)
    if (opts.interrupt !== false) {
      window.speechSynthesis.cancel();
    }

    const utt = new SpeechSynthesisUtterance(text);
    const voice = resolveVoice();
    if (voice) utt.voice = voice;
    utt.lang   = 'en-US';
    utt.rate   = opts.rate   ?? 0.93;
    utt.pitch  = opts.pitch  ?? 1.0;
    utt.volume = opts.volume ?? 1.0;

    utt.onstart = () => { _speaking = true; };
    utt.onend   = () => { _speaking = false; resolve(); };
    utt.onerror = () => { _speaking = false; resolve(); };

    window.speechSynthesis.speak(utt);
  });
}

export function stopSpeaking() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    _speaking = false;
  }
}

export function isSpeaking() {
  return _speaking;
}

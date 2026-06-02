import { useEffect, useRef } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { useVoiceAssistantStore } from '../store/voiceAssistantStore';
import { stopSpeaking } from '../lib/voiceCommands/speechSynthesis';
import clsx from 'clsx';

export default function VoiceOrb() {
  const isEnabled        = useVoiceAssistantStore((s) => s.isEnabled);
  const orbState         = useVoiceAssistantStore((s) => s.orbState);
  const transcript       = useVoiceAssistantStore((s) => s.transcript);
  const interimTranscript = useVoiceAssistantStore((s) => s.interimTranscript);
  const response         = useVoiceAssistantStore((s) => s.response);
  const setOrbState      = useVoiceAssistantStore((s) => s.setOrbState);
  const isListening      = useVoiceAssistantStore((s) => s.isListening);

  // Auto-hide the conversation panel after a delay
  const panelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showPanel = (transcript || interimTranscript || response) && orbState !== 'idle';

  useEffect(() => {
    if (orbState === 'idle' || orbState === 'listening') {
      panelTimerRef.current = setTimeout(() => {
        useVoiceAssistantStore.getState().setTranscript('');
        useVoiceAssistantStore.getState().setInterimTranscript('');
        useVoiceAssistantStore.getState().setResponse('');
      }, 4000);
    }
    return () => {
      if (panelTimerRef.current) clearTimeout(panelTimerRef.current);
    };
  }, [orbState, transcript, response]);

  if (!isEnabled) return null;

  // Click the orb to stop speaking when ARIA is talking
  function handleOrbClick() {
    if (orbState === 'speaking') {
      stopSpeaking();
      setOrbState(isListening ? 'listening' : 'idle');
    }
  }

  const displayText = interimTranscript || transcript;
  const stateLabel  =
    orbState === 'listening'   ? 'Listening…'   :
    orbState === 'processing'  ? 'Processing…'  :
    orbState === 'speaking'    ? 'Speaking'      :
    orbState === 'error'       ? 'Error'         : 'Active';

  return (
    <div className="va-orb-root" aria-label="ARIA voice assistant">

      {/* ── Conversation panel ─────────────────────────────────────────── */}
      {showPanel && (
        <div className={clsx('va-panel', `va-panel-${orbState}`)}>
          {(displayText) && (
            <p className="va-panel-user">
              <span className="va-panel-label">You</span>
              {displayText}
            </p>
          )}
          {response && (
            <p className={clsx('va-panel-aria', orbState === 'speaking' && 'va-panel-aria-active')}>
              <span className="va-panel-label va-panel-label-aria">ARIA</span>
              {response}
            </p>
          )}
        </div>
      )}

      {/* ── Orb container ──────────────────────────────────────────────── */}
      <div className={clsx('va-orb-wrap', `va-state-${orbState}`)}>

        {/* Outer ripple ring */}
        <div className="va-ring va-ring-a" />
        {/* Inner pulse ring */}
        <div className="va-ring va-ring-b" />

        {/* Core button */}
        <button
          onClick={handleOrbClick}
          className="va-orb-btn"
          title={`ARIA — ${stateLabel}`}
          aria-label={`ARIA voice assistant: ${stateLabel}`}
        >
          {/* Radial gradient overlay */}
          <span className="va-orb-glow" aria-hidden />

          {/* State icon */}
          {orbState === 'processing' && (
            <Loader2 size={18} className="va-icon va-icon-spin" aria-hidden />
          )}
          {orbState === 'speaking' && (
            <div className="va-wave" aria-hidden>
              <span /><span /><span /><span /><span />
            </div>
          )}
          {(orbState === 'idle' || orbState === 'listening') && (
            <Mic size={18} className="va-icon" aria-hidden />
          )}
          {orbState === 'error' && (
            <MicOff size={18} className="va-icon" aria-hidden />
          )}
        </button>

        {/* State label underneath */}
        <span className="va-state-label" aria-hidden>{stateLabel}</span>
      </div>
    </div>
  );
}

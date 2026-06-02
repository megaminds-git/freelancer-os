import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

type Stage = 'processing' | 'success' | 'error';

export default function OAuthCallback() {
  const [params] = useSearchParams();
  const navigate  = useNavigate();
  const [stage, setStage]     = useState<Stage>('processing');
  const [platform, setPlatform] = useState('');
  const [reason, setReason]     = useState('');

  useEffect(() => {
    const connected    = params.get('connected');
    const connectError = params.get('connectError');
    const errorReason  = params.get('reason') ?? '';

    const resolvedPlatform = (connected || connectError || 'unknown').toLowerCase();
    setPlatform(resolvedPlatform);
    setReason(errorReason);

    if (connected) {
      setStage('success');
    } else {
      setStage('error');
    }

    // ── Popup window: send message to opener and close ────────────────────────
    if (window.opener && !window.opener.closed) {
      try {
        if (connected) {
          window.opener.postMessage(
            { type: 'oauth-success', platform: connected },
            window.location.origin,
          );
        } else {
          window.opener.postMessage(
            { type: 'oauth-error', platform: connectError ?? 'unknown', reason: errorReason },
            window.location.origin,
          );
        }
      } catch {
        // Cross-origin message failed; fall through to redirect path
      }

      // Give the parent a moment to process the message before we close
      const t = setTimeout(() => window.close(), 800);
      return () => clearTimeout(t);
    }

    // ── Main-tab fallback: redirect back to profile ───────────────────────────
    const target = connected
      ? `/profile?connected=${connected}`
      : `/profile?connectError=${connectError ?? 'unknown'}`;

    const t = setTimeout(() => navigate(target, { replace: true }), 1500);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const displayName = platform.charAt(0).toUpperCase() + platform.slice(1);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center max-w-sm w-full">
        {stage === 'processing' && (
          <>
            <Loader2 size={36} className="animate-spin text-primary mx-auto mb-4" />
            <p className="font-semibold text-dark">Completing connection…</p>
            <p className="text-sm text-slate-400 mt-1">Please wait</p>
          </>
        )}

        {stage === 'success' && (
          <>
            <CheckCircle2 size={40} className="text-success mx-auto mb-4" />
            <p className="font-semibold text-dark text-lg">{displayName} Connected!</p>
            <p className="text-sm text-slate-400 mt-1">
              {window.opener ? 'This window will close automatically.' : 'Redirecting back to your profile…'}
            </p>
          </>
        )}

        {stage === 'error' && (
          <>
            <XCircle size={40} className="text-danger mx-auto mb-4" />
            <p className="font-semibold text-dark text-lg">Connection Failed</p>
            <p className="text-sm text-slate-500 mt-1">
              Could not connect {displayName}.
              {reason === 'missing_code'           && ' Authorization was denied or cancelled.'}
              {reason === 'token_exchange_failed'  && ' Token exchange with the platform failed.'}
              {reason === 'invalid_state'          && ' Security check failed. Please try again.'}
              {reason === 'server_error'           && ' An unexpected server error occurred.'}
              {!reason                             && ' Please try again.'}
            </p>
            <p className="text-xs text-slate-400 mt-2">
              {window.opener ? 'This window will close.' : 'Redirecting back…'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

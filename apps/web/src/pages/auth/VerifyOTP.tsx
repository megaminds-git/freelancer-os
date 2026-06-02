import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Zap, ShieldCheck } from 'lucide-react';
import { authApi } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';

export default function VerifyOTP() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const email   = params.get('email') || '';
  const purpose = (params.get('purpose') || 'verify') as 'verify' | 'reset';

  const login = useAuthStore((s) => s.login);

  const [otp, setOtp]         = useState(['', '', '', '', '', '']);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCd, setResendCd] = useState(0);
  const [sent, setSent]       = useState(false);
  const inputRefs             = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!email) navigate('/login');
  }, [email, navigate]);

  useEffect(() => {
    if (resendCd <= 0) return;
    const t = setInterval(() => setResendCd(c => c - 1), 1000);
    return () => clearInterval(t);
  }, [resendCd]);

  function handleChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length === 6) {
      setOtp(text.split(''));
      inputRefs.current[5]?.focus();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = otp.join('');
    if (code.length < 6) { setError('Enter the 6-digit code'); return; }

    setError('');
    setLoading(true);
    try {
      if (purpose === 'verify') {
        const res = await authApi.verifyEmail({ email, otp: code });
        login(res.user, res.accessToken, res.refreshToken);
        navigate('/');
      } else {
        const res = await authApi.verifyResetOtp({ email, otp: code });
        navigate(`/reset-password?token=${encodeURIComponent(res.resetToken)}`);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Invalid or expired code. Please try again.');
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendCd > 0) return;
    setError('');
    try {
      await authApi.resendOtp({ email, purpose });
      setSent(true);
      setResendCd(60);
    } catch (err: unknown) {
      const body = (err as { response?: { data?: { error?: string; cooldownSeconds?: number } } })?.response?.data;
      if (body?.cooldownSeconds) setResendCd(body.cooldownSeconds);
      setError(body?.error || 'Failed to resend. Please try again.');
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
            <Zap size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-white font-bold text-xl leading-none">Freelancer OS</h1>
            <p className="text-slate-400 text-xs">AI-powered proposal platform</p>
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <ShieldCheck size={20} className="text-primary" />
            </div>
            <div>
              <h2 className="text-white text-xl font-semibold">Verify your email</h2>
              <p className="text-slate-400 text-xs">Code sent to {email}</p>
            </div>
          </div>

          <p className="text-slate-400 text-sm mb-6">
            Enter the 6-digit code we sent to your email address. It expires in 10 minutes.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}
          {sent && !error && (
            <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">
              A new code has been sent.
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="flex gap-2 justify-between mb-6" onPaste={handlePaste}>
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={el => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleChange(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  className="w-12 h-14 text-center text-xl font-bold bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                />
              ))}
            </div>

            <button
              type="submit"
              disabled={loading || otp.join('').length < 6}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-4"
            >
              {loading ? 'Verifying...' : 'Verify code'}
            </button>
          </form>

          <div className="text-center text-sm text-slate-400">
            Didn't receive the code?{' '}
            <button
              onClick={handleResend}
              disabled={resendCd > 0}
              className="text-primary hover:text-primary-400 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {resendCd > 0 ? `Resend in ${resendCd}s` : 'Resend code'}
            </button>
          </div>

          <div className="mt-4 text-center">
            <Link to="/login" className="text-xs text-slate-500 hover:text-slate-400 transition-colors">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

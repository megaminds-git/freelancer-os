import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Zap, KeyRound } from 'lucide-react';
import { authApi } from '../../lib/api';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail]     = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setError('Email is required'); return; }
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPassword({ email: email.trim() });
      navigate(`/verify-email?email=${encodeURIComponent(email.trim())}&purpose=reset`);
    } catch (err: unknown) {
      const body = (err as { response?: { data?: { error?: string; cooldownSeconds?: number } } })?.response?.data;
      setError(body?.error || 'Failed to send reset code. Please try again.');
    } finally {
      setLoading(false);
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
              <KeyRound size={20} className="text-primary" />
            </div>
            <div>
              <h2 className="text-white text-xl font-semibold">Forgot password</h2>
              <p className="text-slate-400 text-xs">We'll send a reset code to your email</p>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Sending...' : 'Send reset code'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            Remember your password?{' '}
            <Link to="/login" className="text-primary hover:text-primary-500 font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

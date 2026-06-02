import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Zap, Lock } from 'lucide-react';
import { authApi } from '../../lib/api';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [params]  = useSearchParams();
  const resetToken = params.get('token') || '';

  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);

  if (!resetToken) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-slate-400 mb-4">Invalid reset link.</p>
          <Link to="/forgot-password" className="text-primary hover:text-primary-400">Request a new one</Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setError('');
    setLoading(true);
    try {
      await authApi.resetPassword({ resetToken, newPassword: password });
      navigate('/login?reset=1');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Failed to reset password. The link may have expired.');
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
              <Lock size={20} className="text-primary" />
            </div>
            <div>
              <h2 className="text-white text-xl font-semibold">Reset password</h2>
              <p className="text-slate-400 text-xs">Choose a new password for your account</p>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">New password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat your password"
                className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : 'Set new password'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            <Link to="/login" className="text-primary hover:text-primary-500 font-medium">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

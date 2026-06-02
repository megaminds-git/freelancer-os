import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { Zap, LogIn } from 'lucide-react';
import { LoginSchema, type LoginInput } from '@freelancer-os/shared';
import { authApi } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { useState } from 'react';

export default function Login() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [serverError, setServerError] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
  });

  async function onSubmit(data: LoginInput) {
    setServerError('');
    try {
      const res = await authApi.login(data);
      login(res.user, res.accessToken, res.refreshToken);
      navigate('/');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { error?: string; requiresVerification?: boolean; email?: string } } };
      const body = axiosErr?.response?.data;

      if (axiosErr?.response?.status === 403 && body?.requiresVerification) {
        navigate(`/verify-email?email=${encodeURIComponent(body.email || data.email)}&purpose=verify`);
        return;
      }

      setServerError(body?.error || 'Login failed. Please try again.');
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
          <h2 className="text-white text-xl font-semibold mb-1">Welcome back</h2>
          <p className="text-slate-400 text-sm mb-6">Sign in to your account</p>

          {serverError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
              <input
                {...register('email')}
                type="email"
                placeholder="you@example.com"
                className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
              {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-slate-300">Password</label>
                <Link to="/forgot-password" className="text-xs text-primary hover:text-primary-400 transition-colors">
                  Forgot password?
                </Link>
              </div>
              <input
                {...register('password')}
                type="password"
                placeholder="••••••••"
                className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
              {errors.password && <p className="mt-1 text-xs text-red-400">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <LogIn size={16} />
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            Don't have an account?{' '}
            <Link to="/signup" className="text-primary hover:text-primary-500 font-medium">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { Zap, UserPlus } from 'lucide-react';
import { SignupSchema, type SignupInput } from '@freelancer-os/shared';
import { authApi } from '../../lib/api';
import { useState } from 'react';

export default function Signup() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SignupInput>({
    resolver: zodResolver(SignupSchema),
  });

  async function onSubmit(data: SignupInput) {
    setServerError('');
    try {
      await authApi.signup(data);
      navigate(`/verify-email?email=${encodeURIComponent(data.email)}&purpose=verify`);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { error?: string; requiresVerification?: boolean; email?: string } } };
      const body = axiosErr?.response?.data;

      // Unverified duplicate — send them to verify
      if (axiosErr?.response?.status === 409 && body?.requiresVerification) {
        navigate(`/verify-email?email=${encodeURIComponent(body.email || data.email)}&purpose=verify`);
        return;
      }

      setServerError(body?.error || 'Signup failed. Please try again.');
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
          <h2 className="text-white text-xl font-semibold mb-1">Create your account</h2>
          <p className="text-slate-400 text-sm mb-6">Start winning more projects today</p>

          {serverError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Full name</label>
              <input
                {...register('name')}
                type="text"
                placeholder="John Doe"
                className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
              {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name.message}</p>}
            </div>

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
              <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
              <input
                {...register('password')}
                type="password"
                placeholder="Min. 8 characters"
                className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
              {errors.password && <p className="mt-1 text-xs text-red-400">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <UserPlus size={16} />
              {isSubmitting ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            Already have an account?{' '}
            <Link to="/login" className="text-primary hover:text-primary-500 font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

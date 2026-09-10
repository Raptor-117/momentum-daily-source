import { useState } from 'react';
import { signIn, signUp, resetPasswordForEmail } from '../lib/supabase';

export default function AuthScreen({ theme, onClose, onSuccess }) {
  const [mode, setMode]           = useState('signin'); // signin | signup | reset
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        await signUp(email, password);
        setSuccess("Account created! Check your email to confirm, then sign in.");
        setMode('signin');
        setPassword('');
      } else if (mode === 'reset') {
        await resetPasswordForEmail(email);
        setSuccess("Reset link sent! Check your email.");
      } else {
        await signIn(email, password);
        onSuccess?.();
      }
    } catch (err) {
      const msg = err.message || '';
      if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already exists')) {
        setError('An account with this email already exists. Try signing in instead.');
      } else {
        setError(msg || 'Something went wrong — try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next) {
    setMode(next);
    setError('');
    setSuccess('');
  }

  const isReset = mode === 'reset';

  return (
    <div className={`fixed inset-0 z-50 flex flex-col ${theme.bg}`}>

      {/* Header */}
      <div className={`flex-shrink-0 px-4 py-3 border-b flex items-center justify-between ${theme.header}`}>
        <button onClick={isReset ? () => switchMode('signin') : onClose} className={`text-sm font-medium ${theme.muted}`}>
          ← {isReset ? 'Back to sign in' : 'Back'}
        </button>
        <span className={`text-sm font-bold tracking-widest ${theme.appTitle}`}>Account</span>
        <div className="w-16" />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 pt-10 pb-8">
        <div className="max-w-sm mx-auto">

          <div className="mb-6">
            <h1 className={`text-xl font-bold mb-1 ${theme.text}`}>
              {isReset ? 'Reset password' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </h1>
            <p className={`text-sm ${theme.muted}`}>
              {isReset
                ? "We'll email you a link to set a new password"
                : mode === 'signin'
                  ? 'Access your data on any device'
                  : 'Sync your data across all your devices'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1 ${theme.muted}`}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className={`w-full px-3 py-2.5 rounded-xl border text-sm outline-none ${theme.input}`}
              />
            </div>

            {!isReset && (
              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-1 ${theme.muted}`}>
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={mode === 'signup' ? 'At least 6 characters' : ''}
                    required
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    className={`w-full pl-3 pr-10 py-2.5 rounded-xl border text-sm outline-none ${theme.input}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sm opacity-50 hover:opacity-100"
                    tabIndex={-1}
                  >{showPassword ? '🙈' : '👁️'}</button>
                </div>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => switchMode('reset')}
                    className={`mt-1.5 text-xs ${theme.muted} underline`}
                  >Forgot password?</button>
                )}
              </div>
            )}

            {error && (
              <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}
            {success && (
              <div className="px-3 py-2.5 rounded-xl bg-green-50 border border-green-200">
                <p className="text-xs text-green-700">{success}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-blue-500 text-white text-sm font-semibold disabled:opacity-50 transition-opacity"
            >
              {loading
                ? (isReset ? 'Sending…' : mode === 'signin' ? 'Signing in…' : 'Creating account…')
                : (isReset ? 'Send reset link' : mode === 'signin' ? 'Sign in' : 'Create account')}
            </button>
          </form>

          {!isReset && (
            <button
              onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
              className={`mt-5 w-full text-sm text-center py-2 ${theme.muted}`}
            >
              {mode === 'signin'
                ? "No account yet? Sign up"
                : "Already have an account? Sign in"}
            </button>
          )}

        </div>
      </div>

    </div>
  );
}

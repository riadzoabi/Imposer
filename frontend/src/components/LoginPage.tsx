import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isRegister && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      if (isRegister) {
        await register(email, password);
      } else {
        await login(email, password);
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <svg className="mx-auto mb-3" width="48" height="48" viewBox="255 182 330 250" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M490.18,189.8h-223.2v57.36h304.07c-11.7-33.4-43.48-57.36-80.87-57.36Z" fill="#12abf0"/>
            <path d="M575.87,275.48v.59c0,9.97-1.72,19.54-4.85,28.44h-247.57v-57.36h247.62c3.1,8.88,4.81,18.4,4.81,28.33Z" fill="#ed3e97"/>
            <path d="M571.01,304.52c-11.73,33.34-43.47,57.25-80.83,57.25h-109.64v-57.25h190.47Z" fill="#fcf627"/>
            <rect x="380.54" y="361.77" width="55.81" height="61.45" fill="#060221"/>
          </svg>
          <h1 className="text-xl font-bold text-brand-navy">Print Imposition</h1>
          <p className="text-sm text-gray-400 mt-1">
            {isRegister ? 'Create your account' : 'Sign in to your account'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 shadow-sm">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-600 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan outline-none transition-colors"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan outline-none transition-colors"
              placeholder="At least 6 characters"
            />
          </div>

          {isRegister && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Confirm Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan outline-none transition-colors"
                placeholder="Repeat password"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-brand-cyan text-white font-semibold text-sm rounded-lg hover:bg-brand-cyan/90 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Please wait...' : isRegister ? 'Create Account' : 'Sign In'}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => { setIsRegister(!isRegister); setError(''); }}
              className="text-xs text-brand-cyan hover:underline"
            >
              {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
            </button>
          </div>
        </form>

        <p className="text-center text-[10px] text-gray-300 mt-4">
          Session stays active for 7 days per device
        </p>
      </div>
    </div>
  );
}

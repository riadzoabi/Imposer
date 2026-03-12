import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function SubscriptionBanner() {
  const { user, subscription, subscribe, isSubscribed } = useAuth();
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('pro');

  if (isSubscribed) return null;
  if (!user) return null;

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      await subscribe(selectedPlan);
    } catch {
      // Error handled in context
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h2 className="text-xl font-bold text-brand-navy">Choose Your Plan</h2>
          <p className="text-sm text-gray-400 mt-1">
            Subscribe to access all imposition features
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Pro Plan */}
          <button
            onClick={() => setSelectedPlan('pro')}
            className={`bg-white rounded-2xl border-2 p-5 text-left transition-all ${
              selectedPlan === 'pro'
                ? 'border-brand-cyan shadow-md'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <h3 className="text-base font-bold text-brand-navy">Pro</h3>
            <p className="text-2xl font-bold text-brand-navy mt-2">
              {/* PLACEHOLDER: set real price */}
              <span className="text-sm font-normal text-gray-400">$</span>--
              <span className="text-sm font-normal text-gray-400">/mo</span>
            </p>
            <ul className="mt-3 space-y-1.5 text-xs text-gray-500">
              <li className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                </svg>
                All imposition features
              </li>
              <li className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                </svg>
                1 device
              </li>
            </ul>
          </button>

          {/* Enterprise Plan */}
          <button
            onClick={() => setSelectedPlan('enterprise')}
            className={`bg-white rounded-2xl border-2 p-5 text-left transition-all ${
              selectedPlan === 'enterprise'
                ? 'border-brand-cyan shadow-md'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <h3 className="text-base font-bold text-brand-navy">Enterprise</h3>
            <p className="text-2xl font-bold text-brand-navy mt-2">
              {/* PLACEHOLDER: set real price */}
              <span className="text-sm font-normal text-gray-400">$</span>--
              <span className="text-sm font-normal text-gray-400">/mo</span>
            </p>
            <ul className="mt-3 space-y-1.5 text-xs text-gray-500">
              <li className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                </svg>
                All imposition features
              </li>
              <li className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                </svg>
                Up to 4 devices
              </li>
            </ul>
          </button>
        </div>

        <button
          onClick={handleSubscribe}
          disabled={loading}
          className="w-full mt-6 py-3 bg-brand-cyan text-white font-semibold text-sm rounded-xl hover:bg-brand-cyan/90 disabled:opacity-50 transition-colors"
        >
          {loading
            ? 'Processing...'
            : `Subscribe to ${selectedPlan === 'pro' ? 'Pro' : 'Enterprise'}`}
        </button>

        <p className="text-center text-[10px] text-gray-300 mt-3">
          {/* PLACEHOLDER: payment provider notice */}
          Payment integration coming soon. Subscription auto-activates in development.
        </p>
      </div>
    </div>
  );
}

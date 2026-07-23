import React, { useEffect, useState } from 'react';
import { X, LayoutDashboard, Activity, Navigation, CheckCircle2 } from 'lucide-react';

interface OnboardingOverlayProps {
  designStyle: 'neobrutalist' | 'refined' | 'material3' | 'aistudio';
}

export default function OnboardingOverlay({ designStyle }: OnboardingOverlayProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const hasCompleted = localStorage.getItem('odotrack_onboarding_completed');
    if (!hasCompleted) {
      setIsVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem('odotrack_onboarding_completed', 'true');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm">
      <div className={`w-full max-w-md ${
        designStyle === 'neobrutalist' ? 'bg-white dark:bg-neo-dark-card border-4 border-black dark:border-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] p-6' :
        designStyle === 'refined' ? 'bg-white dark:bg-neo-dark-card border border-gray-200 dark:border-white/10 shadow-xl rounded-none p-6' :
        designStyle === 'material3' ? 'bg-[#f3edf7] dark:bg-[#25232a] shadow-2xl rounded-3xl p-6' :
        'bg-white dark:bg-neo-dark-card border border-gray-150 dark:border-white/5 shadow-2xl rounded-2xl p-6'
      }`}>
        
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className={`font-display uppercase tracking-tight ${
              designStyle === 'neobrutalist' ? 'text-2xl font-black text-black dark:text-white' :
              designStyle === 'material3' ? 'text-xl font-medium text-[#1d1b20] dark:text-[#e6e1e5]' :
              'text-xl font-bold text-gray-900 dark:text-white'
            }`}>
              Welcome to ODOTRACK
            </h2>
            <p className={`mt-1 text-sm ${
              designStyle === 'material3' ? 'text-[#49454f] dark:text-[#cac4d0]' :
              'text-gray-600 dark:text-gray-400 font-sans'
            }`}>
              Your offline-first vehicle & expense companion.
            </p>
          </div>
          <button 
            onClick={handleDismiss}
            className={`p-1.5 transition-colors ${
              designStyle === 'neobrutalist' ? 'border-2 border-black bg-neo-accent hover:bg-yellow-300 rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-[2px] active:translate-x-[2px] active:shadow-none text-black' :
              designStyle === 'material3' ? 'bg-[#e8def8] hover:bg-[#d0bcff] dark:bg-[#4a4458] dark:hover:bg-[#d0bcff] text-[#1d192b] rounded-full' :
              'hover:bg-gray-100 dark:hover:bg-white/10 rounded-md text-gray-600 dark:text-gray-300'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5 mb-8">
          <div className="flex gap-4">
            <div className={`shrink-0 p-2.5 rounded-lg flex items-center justify-center ${
              designStyle === 'neobrutalist' ? 'bg-neo-accent border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-black' :
              designStyle === 'material3' ? 'bg-[#e8def8] dark:bg-[#4a4458] text-[#1d192b] dark:text-[#e8def8] rounded-xl' :
              'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
            }`}>
              <LayoutDashboard className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`font-bold text-sm ${
                designStyle === 'material3' ? 'text-[#1d1b20] dark:text-[#e6e1e5]' : 'text-gray-900 dark:text-white font-sans'
              }`}>Dashboard</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">
                Get a quick snapshot of your active vehicle's performance, recent activities, and pending maintenance alerts.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className={`shrink-0 p-2.5 rounded-lg flex items-center justify-center ${
              designStyle === 'neobrutalist' ? 'bg-[#ff99cc] border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-black' :
              designStyle === 'material3' ? 'bg-[#f9dedc] dark:bg-[#8c1d18] text-[#410e0b] dark:text-[#f9dedc] rounded-xl' :
              'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
            }`}>
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`font-bold text-sm ${
                designStyle === 'material3' ? 'text-[#1d1b20] dark:text-[#e6e1e5]' : 'text-gray-900 dark:text-white font-sans'
              }`}>Analytics</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">
                Dive deep into your vehicle's cost per kilometer, fuel efficiency trends, and spending distribution over time.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className={`shrink-0 p-2.5 rounded-lg flex items-center justify-center ${
              designStyle === 'neobrutalist' ? 'bg-[#99ffcc] border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-black' :
              designStyle === 'material3' ? 'bg-[#c4eed0] dark:bg-[#0f5223] text-[#072711] dark:text-[#c4eed0] rounded-xl' :
              'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
            }`}>
              <Navigation className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`font-bold text-sm ${
                designStyle === 'material3' ? 'text-[#1d1b20] dark:text-[#e6e1e5]' : 'text-gray-900 dark:text-white font-sans'
              }`}>Navigation Tabs</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">
                Use the bottom bar to switch between Logs, Trips, Garage, and Settings. Everything works offline!
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleDismiss}
          className={`w-full py-3 flex items-center justify-center gap-2 transition-all ${
            designStyle === 'neobrutalist' ? 'bg-black text-white border-2 border-black font-display font-bold uppercase hover:bg-gray-800 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.3)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.3)] active:translate-y-[2px] active:translate-x-[2px] active:shadow-none' :
            designStyle === 'material3' ? 'bg-[#6750a4] hover:bg-[#5b4396] dark:bg-[#d0bcff] dark:hover:bg-[#c2b0e6] text-white dark:text-[#141218] rounded-full font-medium' :
            'bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-black rounded-lg font-bold'
          }`}
        >
          <CheckCircle2 className="w-5 h-5" />
          <span>Get Started</span>
        </button>

      </div>
    </div>
  );
}

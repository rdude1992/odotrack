/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { Info, Heart, Github } from 'lucide-react';

interface AboutProps {
  appName?: string;
  version?: string;
  developerName?: string;
  description?: string;
}

export default function About({
  appName = 'ODOTRACK',
  version = '0.0.0',
  developerName = 'Rahul',
  description = 'Offline-first vehicle mileage, fuel economy, and expense tracker built for privacy and performance.'
}: AboutProps) {
  return (
    <div className="w-full flex flex-col items-center gap-6 select-none py-6">
      {/* App Logo / Identity */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col items-center gap-4"
      >
        <div className="bg-neo-accent border-2 border-black p-4 sm:p-6 neo-shadow-lg rotate-[-2deg]">
          <h1 className="font-display font-black text-3xl sm:text-5xl text-black uppercase tracking-tighter leading-none">
            {appName}
          </h1>
        </div>
        <p className="font-sans text-sm sm:text-base text-gray-500 dark:text-gray-400 text-center max-w-md px-4">
          {description}
        </p>
      </motion.div>

      {/* Info Cards */}
      <div className="w-full max-w-lg flex flex-col gap-3 px-2">
        {/* Version */}
        <div className="bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-4 neo-shadow dark:neo-shadow-dark flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Info className="w-5 h-5 text-neo-accent shrink-0" />
            <span className="font-display font-bold text-sm uppercase tracking-wider">Version</span>
          </div>
          <span className="font-mono font-black text-sm bg-neo-bg dark:bg-zinc-800 px-2 py-1 border-2 border-black">
            {version}
          </span>
        </div>

        {/* Developer */}
        <div className="bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-4 neo-shadow dark:neo-shadow-dark flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Heart className="w-5 h-5 text-neo-accent shrink-0" />
            <span className="font-display font-bold text-sm uppercase tracking-wider">Developer</span>
          </div>
          <span className="font-mono font-black text-sm bg-neo-bg dark:bg-zinc-800 px-2 py-1 border-2 border-black">
            {developerName}
          </span>
        </div>
      </div>

      {/* Tech Stack / Footer note */}
      <div className="mt-4 text-center px-4">
        <p className="font-sans text-[10px] sm:text-xs text-gray-400 leading-relaxed max-w-md mx-auto">
          Built with Purpose. <br/>
          Runs entirely offline. No accounts, No tracking, No cloud.
        </p>
        <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-gray-500 font-mono">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span>OFFLINE READY</span>
          <span className="mx-1">|</span>
          <span>PRIVACY FIRST</span>
        </div>
      </div>
    </div>
  );
}
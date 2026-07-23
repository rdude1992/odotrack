/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Vehicle } from '../types';
import { parseLocalDate } from '../utils';
import { Sun, Moon, Car, Bike, ShieldAlert, Database, X } from 'lucide-react';
import NeoDropdown from './NeoDropdown';

interface HeaderProps {
  vehicles: Vehicle[];
  selectedVehicleId: string | 'all';
  onVehicleChange: (id: string | 'all') => void;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  lastBackupDate: string | null;
  backupReminderDays: number;
  onBackupTrigger: () => void;
}

export default function Header({
  vehicles,
  selectedVehicleId,
  onVehicleChange,
  theme,
  onThemeToggle,
  lastBackupDate,
  backupReminderDays,
  onBackupTrigger
}: HeaderProps) {
  
  const [isDismissed, setIsDismissed] = useState(false);

  // Calculate days since last backup
  const getDaysSinceLastBackup = () => {
    if (!lastBackupDate) return null;
    const last = parseLocalDate(lastBackupDate).getTime();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const diff = today - last;
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const daysSinceBackup = getDaysSinceLastBackup();
  const showBackupReminder = 
    !isDismissed &&
    backupReminderDays > 0 &&
    (lastBackupDate === null || (daysSinceBackup !== null && daysSinceBackup >= backupReminderDays));

  const activeVehicle = vehicles.find(v => v.id === selectedVehicleId);

  const getVehicleIcon = (type: string) => {
    switch (type) {
      case 'car': return '🚗';
      case 'bike': return '🏍';
      case 'scooter': return '🛵';
      case 'ev': return '⚡';
      default: return '🚌';
    }
  };

  return (
    <header className="sticky top-0 z-30 w-full flex flex-col select-none pt-1 pb-4 sm:pb-5 -mt-3 -mb-4 sm:-mb-5 bg-neo-bg dark:bg-neo-dark-bg transition-colors">
      {/* Top Warning Banner for Backup Reminder */}
      {showBackupReminder && (
        <div 
          id="backup-reminder-banner"
          onClick={onBackupTrigger}
          className="w-full bg-neo-accent-yellow text-black py-2 px-3 sm:px-4 border-b-2 border-black dark:border-white font-mono text-xs sm:text-sm font-bold flex items-center justify-between gap-2 cursor-pointer hover:bg-yellow-300 transition-colors"
        >
          <div className="flex items-center gap-2 overflow-hidden truncate">
            <ShieldAlert className="w-5 h-5 animate-bounce shrink-0" />
            <span className="truncate">
              {lastBackupDate === null 
                ? 'WARNING: You have never backed up your data! Click here to backup now.' 
                : `ALERT: Your last backup was ${daysSinceBackup} days ago (Reminder threshold: ${backupReminderDays} days). Backup now!`}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Database className="w-4 h-4 hidden sm:inline" />
            <button
              type="button"
              id="btn-dismiss-backup-reminder"
              title="Dismiss notification"
              onClick={(e) => {
                e.stopPropagation();
                setIsDismissed(true);
              }}
              className="p-1 hover:bg-black/10 rounded transition-colors text-black"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Header Row */}
      <div className="w-full bg-neo-card dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white neo-shadow dark:neo-shadow-dark flex flex-row items-center justify-between px-3 py-1.5 sm:px-4 sm:py-2 gap-2">
        
        {/* Brand Logo & Mascot */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="bg-neo-accent border-2 sm:border-2 border-black dark:border dark:border-white text-black px-2 py-1 font-display font-black text-xs sm:text-base tracking-tighter uppercase select-none neo-shadow-sm rotate-[-2deg]">
            ODOTRACK
          </div>
          <div className="hidden lg:block font-mono text-[10px] font-bold text-gray-500 dark:text-gray-400">
            OFFLINE V1.0.8
          </div>
        </div>

        {/* Dynamic Controls Zone */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          
          {/* Active Vehicle Selector Dropdown */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="font-display font-bold text-xs uppercase tracking-wider hidden md:inline text-black dark:text-white">Active:</span>
            <NeoDropdown
              id="vehicle-filter-select"
              value={selectedVehicleId}
              onChange={(val) => onVehicleChange(val)}
              options={[
                { value: 'all', label: <span className="flex items-center gap-1.5">🚗 ALL VEHICLES</span> },
                ...vehicles.map(v => ({
                  value: v.id,
                  label: (
                    <div className="flex flex-col text-left py-0">
                      <div className="flex items-center gap-1.5">
                        {v.profileImage ? (
                          <img src={v.profileImage} alt="" className="w-3.5 h-3.5 rounded-full object-cover border border-black/20 shrink-0" />
                        ) : (
                          <span className="shrink-0">{getVehicleIcon(v.type)}</span>
                        )}
                        <span className="truncate text-xs">{v.name.toUpperCase()}</span>
                      </div>
                      <span className="font-mono text-[9px] text-gray-500 dark:text-gray-300 font-normal normal-case tracking-normal leading-none mt-0.5">
                        ODO: {v.odometer !== undefined && v.odometer !== null ? v.odometer.toLocaleString() : 0} km
                      </span>
                    </div>
                  )
                }))
              ]}
              className="min-w-[130px] sm:min-w-[180px]"
              compact
            />
          </div>

          {/* Theme Toggle Button */}
          <button
            id="theme-toggle-btn"
            onClick={onThemeToggle}
            aria-label="Toggle theme"
            className="p-1.5 sm:p-2 border-2 sm:border-2 border-black dark:border dark:border-white bg-white dark:bg-neo-dark-bg text-black dark:text-white hover:bg-neo-accent-yellow dark:hover:bg-neo-accent neo-shadow-sm dark:neo-shadow-dark-sm active:translate-x-[1px] active:translate-y-[1px] transition-all duration-75 select-none shrink-0 cursor-pointer"
          >
            {theme === 'light' ? (
              <Moon className="w-4 h-4 sm:w-5 sm:h-5 text-black" />
            ) : (
              <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vehicle } from '../types';
import { Sun, Moon, Car, Bike, ShieldAlert, Database } from 'lucide-react';
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
  
  // Calculate days since last backup
  const getDaysSinceLastBackup = () => {
    if (!lastBackupDate) return null;
    const last = new Date(lastBackupDate);
    const today = new Date();
    const diff = today.getTime() - last.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const daysSinceBackup = getDaysSinceLastBackup();
  const showBackupReminder = lastBackupDate === null || (daysSinceBackup !== null && daysSinceBackup >= backupReminderDays);

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
    <header className="w-full flex flex-col select-none mb-4">
      {/* Top Warning Banner for Backup Reminder */}
      {showBackupReminder && (
        <div 
          id="backup-reminder-banner"
          onClick={onBackupTrigger}
          className="w-full bg-neo-accent-yellow text-black py-2 px-4 border-b-2 border-black dark:border-white font-mono text-sm font-bold flex items-center justify-center gap-2 cursor-pointer hover:bg-yellow-300 transition-colors"
        >
          <ShieldAlert className="w-5 h-5 animate-bounce shrink-0" />
          <span>
            {lastBackupDate === null 
              ? 'WARNING: You have never backed up your data! Click here to backup now.' 
              : `ALERT: Your last backup was ${daysSinceBackup} days ago (Reminder threshold: ${backupReminderDays} days). Backup now!`}
          </span>
          <Database className="w-4 h-4 ml-1 hidden sm:inline" />
        </div>
      )}

      {/* Main Header Row */}
      <div className="w-full bg-neo-card dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white neo-shadow dark:neo-shadow-dark flex flex-row items-center justify-between p-3 sm:p-4 gap-2">
        
        {/* Brand Logo & Mascot */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="bg-neo-accent border-2 sm:border-2 border-black dark:border dark:border-white text-black p-1.5 sm:p-2 font-display font-black text-sm sm:text-xl tracking-tighter uppercase select-none neo-shadow-sm rotate-[-2deg]">
            ODOTRACK
          </div>
          <div className="hidden lg:block font-mono text-xs font-bold text-gray-500 dark:text-gray-400">
            OFFLINE V1.0.0
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
                { value: 'all', label: '🚗 ALL VEHICLES' },
                ...vehicles.map(v => ({
                  value: v.id,
                  label: `${getVehicleIcon(v.type)} ${v.name.toUpperCase()}`
                }))
              ]}
              className="min-w-[130px] sm:min-w-[190px]"
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

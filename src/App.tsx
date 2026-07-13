/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { dbAPI } from './db';
import { Vehicle, FuelLog, Trip, Expense, AppSettings, MaintenanceRecord, Journey } from './types';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

import Header from './components/Header';
import Dashboard from './components/Dashboard';
import FuelLogComponent from './components/FuelLog';
import TripsLog from './components/TripsLog';
import ExpensesLog from './components/ExpensesLog';
import VehiclesManager from './components/VehiclesManager';
import BackupAndSeeder from './components/BackupAndSeeder';
import About from './components/About';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider, useToast } from './components/ToastContext';
import FuelLogModal from './components/FuelLogModal';
import TripLogModal from './components/TripLogModal';
import ExpenseLogModal from './components/ExpenseLogModal';
import JourneysManager from './components/JourneysManager';

import { 
  LayoutDashboard, 
  Flame, 
  Milestone, 
  CreditCard, 
  Car, 
  Database, 
  RefreshCw, 
  Sparkles, 
  AlertCircle,
  Plus,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Compass
} from 'lucide-react';

type TabType = 'dashboard' | 'fuel' | 'trips' | 'expenses' | 'vehicles' | 'backup' | 'about' | 'journeys';

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

function AppContent() {
  // Data State
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    theme: 'light',
    currency: 'INR',
    backupReminderDays: 7,
    lastBackupDate: null,
    fontSize: 'medium',
    accentColor: '#ff6b35',
    appVersion: '1.0.1',
    developerName: 'RAHUL'
  });

  // UI Navigation State
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const saved = localStorage.getItem('odotrack_active_tab');
    if (saved === 'dashboard' || saved === 'fuel' || saved === 'trips' || saved === 'expenses' || saved === 'vehicles' || saved === 'backup' || saved === 'about' || saved === 'journeys') {
      return saved as TabType;
    }
    return 'dashboard';
  });
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | 'all'>(() => {
    return localStorage.getItem('odotrack_selected_vehicle_id') || 'all';
  });
  const [isLoading, setIsLoading] = useState(true);

  // Sync tab and vehicle selection to localStorage
  useEffect(() => {
    localStorage.setItem('odotrack_active_tab', activeTab);
  }, [activeTab]);

  // Listen for About navigation event from BackupAndSeeder page
  useEffect(() => {
    const handleNavigateToAbout = () => handleTabChange('about');
    window.addEventListener('navigate-to-about', handleNavigateToAbout);
    return () => window.removeEventListener('navigate-to-about', handleNavigateToAbout);
  }, []);

  useEffect(() => {
    localStorage.setItem('odotrack_selected_vehicle_id', selectedVehicleId);
  }, [selectedVehicleId]);

  // Active finish-trip trigger
  const [activeTripIdToFinish, setActiveTripIdToFinish] = useState<string | null>(null);

  // Modal states (for FAB quick-add from any tab)
  const [showFuelModal, setShowFuelModal] = useState(false);
  const [showTripModal, setShowTripModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showJourneysManager, setShowJourneysManager] = useState(false);
  const [journeysOpenRequest, setJourneysOpenRequest] = useState<{ seq: number; mode: 'list' | 'create' }>({ seq: 0, mode: 'list' });

  // Editing states passed to the modals
  const [editingFuelLog, setEditingFuelLog] = useState<FuelLog | null>(null);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Global FAB Open State (specifically for Dashboard)
  const [isFABOpen, setIsFABOpen] = useState(false);

  // Service Worker Update State
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);

  // Pull-to-refresh State
  const [pullY, setPullY] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const pullThreshold = 75;

  // Synchronize initial tab state with history to ensure root is ALWAYS dashboard
  useEffect(() => {
    const currentState = window.history.state;
    if (!currentState || !currentState.initialized) {
      if (activeTab === 'dashboard') {
        window.history.replaceState({ tab: 'dashboard', initialized: true }, '');
      } else {
        // Build the stack: dashboard -> activeTab
        window.history.replaceState({ tab: 'dashboard', initialized: true }, '');
        window.history.pushState({ tab: activeTab, initialized: true }, '');
      }
    }
  }, []);

  // Global listener for system back button / back gesture (popstate)
  useEffect(() => {
    const handleGlobalPopState = (e: PopStateEvent) => {
      if (e.state && e.state.tab) {
        setActiveTab(e.state.tab);
      }
    };
    window.addEventListener('popstate', handleGlobalPopState);
    return () => window.removeEventListener('popstate', handleGlobalPopState);
  }, []);

  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const handleTabChange = (newTab: TabType) => {
    const currentActiveTab = activeTabRef.current;
    if (newTab === currentActiveTab) return;
    
    if (newTab === 'dashboard') {
      window.history.pushState({ tab: 'dashboard', initialized: true }, '');
      setActiveTab('dashboard');
    } else {
      if (currentActiveTab === 'dashboard') {
        // Going from dashboard to a tab (push state)
        window.history.pushState({ tab: newTab, initialized: true }, '');
      } else {
        // Going from tab to another tab (replace state to keep stack size clean)
        window.history.replaceState({ tab: newTab, initialized: true }, '');
      }
      setActiveTab(newTab);
    }
  };

  // Global edge swipe state (detects swipe-back from either LEFT or RIGHT edge)
  const [swipeProgress, setSwipeProgress] = useState(0);
  const swipeStartX = useRef<number | null>(null);
  const swipeStartY = useRef<number | null>(null);
  const swipeEdge = useRef<'left' | 'right' | null>(null);
  const edgeSwipeThreshold = 40; // px from edge to detect swipe
  const swipeBackDistanceThreshold = 80; // px required to trigger back action

  useEffect(() => {
    const handleTouchStartGlobal = (e: TouchEvent) => {
      if (e.touches.length > 1) return;
      const touch = e.touches[0];
      const screenWidth = window.innerWidth;
      
      if (touch.clientX <= edgeSwipeThreshold) {
        swipeStartX.current = touch.clientX;
        swipeStartY.current = touch.clientY;
        swipeEdge.current = 'left';
        setSwipeProgress(0);
      } else if (screenWidth - touch.clientX <= edgeSwipeThreshold) {
        swipeStartX.current = touch.clientX;
        swipeStartY.current = touch.clientY;
        swipeEdge.current = 'right';
        setSwipeProgress(0);
      }
    };

    const handleTouchMoveGlobal = (e: TouchEvent) => {
      if (swipeStartX.current === null || swipeStartY.current === null || swipeEdge.current === null) return;
      const touch = e.touches[0];
      
      let deltaX = 0;
      if (swipeEdge.current === 'left') {
        deltaX = touch.clientX - swipeStartX.current; // moving right
      } else {
        deltaX = swipeStartX.current - touch.clientX; // moving left
      }
      
      const deltaY = Math.abs(touch.clientY - swipeStartY.current);

      // Cancel if gesture is mostly vertical (to allow scrolling)
      if (deltaY > Math.max(deltaX, 10) * 1.5) {
        swipeStartX.current = null;
        swipeStartY.current = null;
        swipeEdge.current = null;
        setSwipeProgress(0);
        return;
      }

      if (deltaX < 0) {
        setSwipeProgress(0);
        return;
      }

      const progress = Math.min(deltaX / swipeBackDistanceThreshold, 1);
      setSwipeProgress(progress);
    };

    const handleTouchEndGlobal = (e: TouchEvent) => {
      if (swipeStartX.current === null || swipeEdge.current === null) return;
      const touch = e.changedTouches[0];
      
      let deltaX = 0;
      if (swipeEdge.current === 'left') {
        deltaX = touch.clientX - swipeStartX.current;
      } else {
        deltaX = swipeStartX.current - touch.clientX;
      }

      if (deltaX >= swipeBackDistanceThreshold) {
        // Trigger system-level back action! This works exactly like the native OS back gesture
        window.history.back();
      }

      swipeStartX.current = null;
      swipeStartY.current = null;
      swipeEdge.current = null;
      setSwipeProgress(0);
    };

    window.addEventListener('touchstart', handleTouchStartGlobal, { passive: true });
    window.addEventListener('touchmove', handleTouchMoveGlobal, { passive: true });
    window.addEventListener('touchend', handleTouchEndGlobal, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStartGlobal);
      window.removeEventListener('touchmove', handleTouchMoveGlobal);
      window.removeEventListener('touchend', handleTouchEndGlobal);
    };
  }, []);

  // Load all databases
  const reloadAllData = async () => {
    setIsLoading(true);
    try {
      // Initialize Database connection
      const dbVehicles = await dbAPI.getVehicles();
      const dbFuelLogs = await dbAPI.getFuelLogs();
      const dbTrips = await dbAPI.getTrips();
      const dbExpenses = await dbAPI.getExpenses();
      const dbMaintenance = await dbAPI.getMaintenanceRecords();
      const dbSettings = await dbAPI.getSettings();
      const dbJourneys = await dbAPI.getJourneys();

      setVehicles(dbVehicles);
      setFuelLogs(dbFuelLogs);
      setTrips(dbTrips);
      setExpenses(dbExpenses);
      setMaintenanceRecords(dbMaintenance);
      setSettings(dbSettings);
      setJourneys(dbJourneys);

      // Handle Theme Application
      if (dbSettings.theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch (err) {
      console.error('Failed to load local database:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Mount Database loader
  useEffect(() => {
    reloadAllData();

    // Register PWA service worker with reload notification triggers
    serviceWorkerRegistration.register({
      onUpdate: () => setShowUpdateBanner(true)
    });
  }, []);

  // Apply accent color and font size to root element whenever settings change
  useEffect(() => {
    const accentColor = settings.accentColor || '#ff6b35';
    const fontSize = settings.fontSize || 'medium';
    
    // Apply accent color CSS variables
    document.documentElement.style.setProperty('--accent-color', accentColor);
    // Compute hover variant (slightly darker)
    const hex = accentColor.replace('#', '');
    const r = Math.max(0, parseInt(hex.substring(0, 2), 16) - 30);
    const g = Math.max(0, parseInt(hex.substring(2, 4), 16) - 30);
    const b = Math.max(0, parseInt(hex.substring(4, 6), 16) - 30);
    document.documentElement.style.setProperty('--accent-color-hover', `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`);
    // Compute light variant
    const rl = Math.min(255, parseInt(hex.substring(0, 2), 16) + 200);
    const gl = Math.min(255, parseInt(hex.substring(2, 4), 16) + 200);
    const bl = Math.min(255, parseInt(hex.substring(4, 6), 16) + 200);
    document.documentElement.style.setProperty('--accent-color-light', `#${rl.toString(16).padStart(2, '0')}${gl.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`);

    // Apply font size class
    document.documentElement.classList.remove('font-scale-small', 'font-scale-medium', 'font-scale-large');
    document.documentElement.classList.add(`font-scale-${fontSize}`);
  }, [settings.accentColor, settings.fontSize]);

  // Font Size Change Handler
  const handleFontSizeChange = async (fontSize: 'small' | 'medium' | 'large') => {
    const nextSettings: AppSettings = {
      ...settings,
      fontSize
    };
    setSettings(nextSettings);
    await dbAPI.saveSettings(nextSettings);
  };

  // Accent Color Change Handler
  const handleAccentColorChange = async (accentColor: string) => {
    const nextSettings: AppSettings = {
      ...settings,
      accentColor
    };
    setSettings(nextSettings);
    await dbAPI.saveSettings(nextSettings);
  };

  // Theme Toggle Handler
  const handleThemeToggle = async () => {
    const nextTheme = settings.theme === 'light' ? 'dark' : 'light';
    const nextSettings: AppSettings = {
      ...settings,
      theme: nextTheme
    };
    
    // Save to State & Database
    setSettings(nextSettings);
    await dbAPI.saveSettings(nextSettings);

    // Toggle html class
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // Skip waiting for SW update
  const handleReloadApp = () => {
    serviceWorkerRegistration.updateServiceWorker(true);
  };

  // Pull-to-refresh Event Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    // Disable pull-to-refresh if body scroll is locked (e.g. inside modals)
    if (document.body.style.overflow === 'hidden') {
      return;
    }

    // Check if the touch originated inside a modal, dialog, or fixed container
    const target = e.target as HTMLElement;
    if (target.closest('[id^="modal-"]') || target.closest('.fixed')) {
      return;
    }

    // Only capture pull when scrolled to the very top
    if (window.scrollY === 0 && !isRefreshing) {
      touchStartY.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY.current;

    if (diff > 0) {
      // Dampen y pull-down distance
      const dampDiff = Math.pow(diff, 0.85);
      setPullY(dampDiff);
      // Prevent standard browser bounce
      if (diff > 10) {
        if (e.cancelable) e.preventDefault();
      }
    }
  };

  const handleTouchEnd = async () => {
    if (touchStartY.current === null) return;
    touchStartY.current = null;

    if (pullY >= pullThreshold) {
      setIsRefreshing(true);
      setPullY(pullThreshold);
      
      // Perform database refresh reload
      await reloadAllData();
      
      setTimeout(() => {
        setIsRefreshing(false);
        setPullY(0);
      }, 600);
    } else {
      setPullY(0);
    }
  };

  // Dashboard "Finish Trip" triggers
  const handleDashboardFinishTrip = (tripId: string) => {
    // Set active finishing trip
    setActiveTripIdToFinish(tripId);
    // Move tab to trips so modal triggers smoothly
    handleTabChange('trips');
  };

  return (
    <div 
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="min-h-screen bg-neo-bg dark:bg-neo-dark-bg text-black dark:text-white transition-colors duration-200 pb-20 sm:pb-8 flex flex-col items-center"
    >
      
      {/* Dynamic Pull to Refresh Indicator widget */}
      <div 
        style={{ 
          transform: `translateY(${pullY - 50}px)`, 
          opacity: pullY > 10 ? 1 : 0 
        }}
        className="fixed top-0 left-1/2 transform -translate-x-1/2 z-40 transition-transform duration-75 flex items-center justify-center p-2.5 bg-neo-accent border-2 border-black text-black font-display font-black text-xs uppercase tracking-wider neo-shadow-sm select-none gap-2 leading-none"
      >
        <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} style={{ transform: `rotate(${pullY * 4}deg)` }} />
        <span>{isRefreshing ? 'Refreshing...' : 'Pull to Refresh'}</span>
      </div>

      {/* Back Swipe Visual Feedback Pill */}
      {swipeProgress > 0 && swipeEdge.current && (
        <div 
          className={`fixed top-1/2 -translate-y-1/2 z-[10000] pointer-events-none flex items-center transition-all ${
            swipeEdge.current === 'left' ? 'left-0 justify-start' : 'right-0 justify-end'
          }`}
          style={{
            transform: `translateY(-50%) translateX(${
              swipeEdge.current === 'left' 
                ? `${(swipeProgress - 1) * 50}px` 
                : `${(1 - swipeProgress) * 50}px`
            })`,
            opacity: swipeProgress
          }}
        >
          <div className={`bg-neo-accent border-2 border-black dark:border-white p-3.5 flex items-center justify-center shadow-lg neo-shadow-sm dark:neo-shadow-dark-sm transition-all ${
            swipeEdge.current === 'left' ? 'rounded-r-full border-l-0' : 'rounded-l-full border-r-0'
          }`}>
            {swipeEdge.current === 'left' ? (
              <ChevronRight className="w-6 h-6 text-black animate-pulse" />
            ) : (
              <ChevronLeft className="w-6 h-6 text-black animate-pulse" />
            )}
          </div>
        </div>
      )}

      {/* Main Container Constraints */}
      <div className="w-full max-w-6xl px-4 sm:px-6 pt-5 flex flex-col gap-4 sm:gap-5">
        
        {/* SW Update Warning Banner */}
        {showUpdateBanner && (
          <div 
            id="sw-update-notification"
            className="w-full bg-neo-accent border-2 border-black dark:border dark:border-white p-4 neo-shadow dark:neo-shadow-dark flex flex-col sm:flex-row items-center justify-between gap-4 select-none animate-pulse"
          >
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-6 h-6 animate-bounce text-black shrink-0" />
              <div>
                <h4 className="font-display font-black text-sm uppercase leading-tight text-black">New Version Installed!</h4>
                <p className="font-sans text-xs text-black/80 font-semibold mt-0.5">Offline cache is updated. Reload to apply immediate performance builds.</p>
              </div>
            </div>
            <button
              id="btn-sw-reload"
              onClick={handleReloadApp}
              className="px-4 py-2 bg-black text-white border-2 border-black font-display font-bold text-xs uppercase hover:bg-gray-800 neo-shadow-sm cursor-pointer whitespace-nowrap"
            >
              APPLY & RELOAD
            </button>
          </div>
        )}

        {/* Global Nav Brand & Active vehicle selectors */}
        <Header
          vehicles={vehicles}
          selectedVehicleId={selectedVehicleId}
          onVehicleChange={setSelectedVehicleId}
          theme={settings.theme}
          onThemeToggle={handleThemeToggle}
          lastBackupDate={settings.lastBackupDate}
          backupReminderDays={settings.backupReminderDays}
          onBackupTrigger={() => handleTabChange('backup')}
        />

        {/* Dynamic Loading State Card */}
        {isLoading && vehicles.length === 0 ? (
          <div className="w-full bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-12 neo-shadow dark:neo-shadow-dark flex flex-col items-center justify-center py-20 select-none">
            <RefreshCw className="w-12 h-12 text-neo-accent animate-spin mb-3" />
            <h3 className="font-display font-black text-lg uppercase">Reading Offline Databases</h3>
            <p className="font-sans text-xs text-gray-600 mt-1">Acquiring cached IndexedDB states...</p>
          </div>
        ) : (
          <main className="w-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15, ease: 'easeInOut' }}
                className="w-full flex flex-col gap-4 sm:gap-5"
              >
                {/* RENDER VIEW ACCORDING TO ACTIVE TAB */}
                {activeTab === 'dashboard' && (
                  <ErrorBoundary name="Dashboard">
                    <Dashboard currency={settings.currency}
                      vehicles={vehicles}
                      fuelLogs={fuelLogs}
                      expenses={expenses}
                      trips={trips}
                      maintenanceRecords={maintenanceRecords}
                      journeys={journeys}
                      selectedVehicleId={selectedVehicleId}
                      onFinishTripTrigger={handleDashboardFinishTrip}
                      onOpenJourneys={() => { handleTabChange('journeys'); setJourneysOpenRequest(r => ({ seq: r.seq + 1, mode: 'list' })); }}
                      onCreateJourney={() => { handleTabChange('journeys'); setJourneysOpenRequest(r => ({ seq: r.seq + 1, mode: 'create' })); }}
                      onEditTrip={(trip) => {
                        setEditingTrip(trip);
                        setShowTripModal(true);
                      }}
                      onQuickAdd={(tab) => {
                        if (tab === 'fuel') setShowFuelModal(true);
                        else if (tab === 'trips') setShowTripModal(true);
                        else if (tab === 'expenses') setShowExpenseModal(true);
                      }}
                    />
                  </ErrorBoundary>
                )}

                {activeTab === 'fuel' && (
                  <ErrorBoundary name="Fuel Logs">
                    <FuelLogComponent currency={settings.currency}
                      vehicles={vehicles}
                      fuelLogs={fuelLogs}
                      journeys={journeys}
                      selectedVehicleId={selectedVehicleId}
                      onLogAdded={reloadAllData}
                      onLogDeleted={reloadAllData}
                      onEditLog={(log) => {
                        setEditingFuelLog(log);
                        setShowFuelModal(true);
                      }}
                    />
                  </ErrorBoundary>
                )}

                {activeTab === 'trips' && (
                  <ErrorBoundary name="Trips">
                    <TripsLog
                      vehicles={vehicles}
                      trips={trips}
                      journeys={journeys}
                      selectedVehicleId={selectedVehicleId}
                      onTripAdded={reloadAllData}
                      onTripDeleted={reloadAllData}
                      activeTripIdToFinishDirectly={activeTripIdToFinish}
                      onClearDirectFinishTrigger={() => setActiveTripIdToFinish(null)}
                      onEditTrip={(trip) => {
                        setEditingTrip(trip);
                        setShowTripModal(true);
                      }}
                      onAddClick={() => setShowTripModal(true)}
                    />
                  </ErrorBoundary>
                )}

                {activeTab === 'expenses' && (
                  <ErrorBoundary name="Expenses">
                    <ExpensesLog currency={settings.currency}
                      vehicles={vehicles}
                      expenses={expenses}
                      journeys={journeys}
                      selectedVehicleId={selectedVehicleId}
                      onExpenseAdded={reloadAllData}
                      onExpenseDeleted={reloadAllData}
                      onEditExpense={(expense) => {
                        setEditingExpense(expense);
                        setShowExpenseModal(true);
                      }}
                    />
                  </ErrorBoundary>
                )}

                {activeTab === 'vehicles' && (
                  <ErrorBoundary name="Vehicles">
                    <VehiclesManager
                      vehicles={vehicles}
                      fuelLogs={fuelLogs}
                      trips={trips}
                      expenses={expenses}
                      maintenanceRecords={maintenanceRecords}
                      onVehiclesChanged={reloadAllData}
                    />
                  </ErrorBoundary>
                )}

                {activeTab === 'journeys' && (
                  <ErrorBoundary name="Journeys">
                    <JourneysManager
                      vehicles={vehicles}
                      journeys={journeys}
                      fuelLogs={fuelLogs}
                      trips={trips}
                      expenses={expenses}
                      currency={settings.currency}
                      selectedVehicleId={selectedVehicleId}
                      isOpen={true}
                      openRequest={journeysOpenRequest}
                      onClose={() => {}}
                      onJourneysChanged={reloadAllData}
                    />
                  </ErrorBoundary>
                )}

                {activeTab === 'backup' && (
                  <ErrorBoundary name="Backup & Settings">
                    <BackupAndSeeder
                      vehicles={vehicles}
                      fuelLogs={fuelLogs}
                      trips={trips}
                      expenses={expenses}
                      settings={settings}
                      onDataResetOrSeeded={reloadAllData}
                      onFontSizeChange={handleFontSizeChange}
                      onAccentColorChange={handleAccentColorChange}
                    />
                  </ErrorBoundary>
                )}

                {activeTab === 'about' && (
                  <ErrorBoundary name="About">
                    <About
                      appName="ODOTRACK"
                      version={settings.appVersion}
                      developerName={settings.developerName}
                      description="Offline-first vehicle mileage, fuel economy, and expense tracker built for privacy and performance."
                    />
                  </ErrorBoundary>
                )}
              </motion.div>
            </AnimatePresence>
          </main>
        )}

        {/* Quick-add Modals (accessible from any tab via Dashboard FAB) */}
        <FuelLogModal
          vehicles={vehicles}
          fuelLogs={fuelLogs}
          journeys={journeys}
          selectedVehicleId={selectedVehicleId}
          currency={settings.currency}
          isOpen={showFuelModal}
          onClose={() => {
            setShowFuelModal(false);
            setEditingFuelLog(null);
          }}
          onLogAdded={reloadAllData}
          onLogDeleted={reloadAllData}
          editingLog={editingFuelLog}
        />
        <TripLogModal
          vehicles={vehicles}
          trips={trips}
          journeys={journeys}
          selectedVehicleId={selectedVehicleId}
          isOpen={showTripModal}
          onClose={() => {
            setShowTripModal(false);
            setEditingTrip(null);
          }}
          onTripAdded={reloadAllData}
          onTripDeleted={reloadAllData}
          editingTrip={editingTrip}
        />
        <ExpenseLogModal
          vehicles={vehicles}
          expenses={expenses}
          journeys={journeys}
          selectedVehicleId={selectedVehicleId}
          currency={settings.currency}
          isOpen={showExpenseModal}
          onClose={() => {
            setShowExpenseModal(false);
            setEditingExpense(null);
          }}
          onExpenseAdded={reloadAllData}
          onExpenseDeleted={reloadAllData}
          editingExpense={editingExpense}
        />
      </div>

      {/* FOOTER TABBED NAVIGATION (Responsive design: desktop rail, mobile sticky bar) */}
      <nav
        role="tablist"
        aria-label="Main navigation"
        className="fixed bottom-0 left-0 right-0 z-30 sm:bottom-4 sm:left-1/2 sm:transform sm:-translate-x-1/2 sm:max-w-2xl bg-white dark:bg-neo-dark-card border-t-2 sm:border-2 border-black dark:border dark:border-white p-1 sm:p-2 flex items-center justify-between sm:justify-around gap-1 sm:gap-2 neo-shadow sm:neo-shadow-lg dark:neo-shadow-dark select-none"
      >
        
        {/* Dashboard Tab */}
        <button
          id="nav-tab-dashboard"
          role="tab"
          aria-selected={activeTab === 'dashboard'}
          aria-label="Dashboard"
          onClick={() => handleTabChange('dashboard')}
          className={`flex-1 sm:flex-initial min-w-0 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 py-2 px-1 sm:px-3 border-2 border-transparent transition-all ${
            activeTab === 'dashboard'
              ? 'bg-neo-accent border-black dark:border-white text-black font-black'
              : 'text-gray-700 dark:text-gray-400 hover:bg-black/5 font-bold'
          }`}
        >
          <LayoutDashboard className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span className="text-[9px] sm:text-xs font-display uppercase tracking-wide truncate">Dash</span>
        </button>

        {/* Fuel Tab */}
        <button
          id="nav-tab-fuel"
          role="tab"
          aria-selected={activeTab === 'fuel'}
          aria-label="Fuel"
          onClick={() => handleTabChange('fuel')}
          className={`flex-1 sm:flex-initial min-w-0 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 py-2 px-1 sm:px-3 border-2 border-transparent transition-all ${
            activeTab === 'fuel'
              ? 'bg-neo-accent-yellow border-black dark:border-white text-black font-black'
              : 'text-gray-700 dark:text-gray-400 hover:bg-black/5 font-bold'
          }`}
        >
          <Flame className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span className="text-[9px] sm:text-xs font-display uppercase tracking-wide truncate">Fuel</span>
        </button>

        {/* Trips Tab */}
        <button
          id="nav-tab-trips"
          role="tab"
          aria-selected={activeTab === 'trips'}
          aria-label="Trips"
          onClick={() => handleTabChange('trips')}
          className={`flex-1 sm:flex-initial min-w-0 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 py-2 px-1 sm:px-3 border-2 border-transparent transition-all ${
            activeTab === 'trips'
              ? 'bg-neo-accent-green border-black dark:border-white text-black font-black'
              : 'text-gray-700 dark:text-gray-400 hover:bg-black/5 font-bold'
          }`}
        >
          <Milestone className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span className="text-[9px] sm:text-xs font-display uppercase tracking-wide truncate">Trips</span>
        </button>

        {/* Expenses Tab */}
        <button
          id="nav-tab-expenses"
          role="tab"
          aria-selected={activeTab === 'expenses'}
          aria-label="Expenses"
          onClick={() => handleTabChange('expenses')}
          className={`flex-1 sm:flex-initial min-w-0 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 py-2 px-1 sm:px-3 border-2 border-transparent transition-all ${
            activeTab === 'expenses'
              ? 'bg-blue-300 border-black dark:border-white text-black font-black'
              : 'text-gray-700 dark:text-gray-400 hover:bg-black/5 font-bold'
          }`}
        >
          <CreditCard className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span className="text-[9px] sm:text-xs font-display uppercase tracking-wide truncate">Bills</span>
        </button>

        {/* Journeys Tab */}
        <button
          id="nav-tab-journeys"
          role="tab"
          aria-selected={activeTab === 'journeys'}
          aria-label="Journeys"
          onClick={() => handleTabChange('journeys')}
          className={`flex-1 sm:flex-initial min-w-0 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 py-2 px-1 sm:px-3 border-2 border-transparent transition-all ${
            activeTab === 'journeys'
              ? 'bg-rose-300 border-black dark:border-white text-black font-black'
              : 'text-gray-700 dark:text-gray-400 hover:bg-black/5 font-bold'
          }`}
        >
          <Compass className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span className="text-[9px] sm:text-xs font-display uppercase tracking-wide truncate">Journeys</span>
        </button>

        {/* Vehicles Tab */}
        <button
          id="nav-tab-vehicles"
          role="tab"
          aria-selected={activeTab === 'vehicles'}
          aria-label="Vehicles"
          onClick={() => handleTabChange('vehicles')}
          className={`flex-1 sm:flex-initial min-w-0 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 py-2 px-1 sm:px-3 border-2 border-transparent transition-all ${
            activeTab === 'vehicles'
              ? 'bg-purple-300 border-black dark:border-white text-black font-black'
              : 'text-gray-700 dark:text-gray-400 hover:bg-black/5 font-bold'
          }`}
        >
          <Car className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span className="text-[9px] sm:text-xs font-display uppercase tracking-wide truncate">Garage</span>
        </button>

        {/* Backup Tab */}
        <button
          id="nav-tab-backup"
          role="tab"
          aria-selected={activeTab === 'backup'}
          aria-label="Backup and Settings"
          onClick={() => handleTabChange('backup')}
          className={`flex-1 sm:flex-initial min-w-0 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 py-2 px-1 sm:px-3 border-2 border-transparent transition-all ${
            activeTab === 'backup'
              ? 'bg-orange-300 border-black dark:border-white text-black font-black'
              : 'text-gray-700 dark:text-gray-400 hover:bg-black/5 font-bold'
          }`}
        >
          <SlidersHorizontal className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span className="text-[9px] sm:text-xs font-display uppercase tracking-wide truncate">Settings</span>
        </button>

      </nav>

      {/* Global Adaptive FAB '+' Button */}
      <AnimatePresence>
        {['dashboard', 'fuel', 'trips', 'expenses', 'journeys'].includes(activeTab) && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            transition={{ type: 'spring', damping: 20, stiffness: 150 }}
            className="fixed bottom-20 right-4 sm:right-8 z-40 flex flex-col items-end gap-2 pointer-events-none"
          >
            <div className="flex flex-col items-end gap-2 pointer-events-auto">
              <AnimatePresence>
                {activeTab === 'dashboard' && isFABOpen && (
                  <div className="flex flex-col items-end gap-2 mb-2">
                    <motion.button
                      initial={{ opacity: 0, y: 15, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 15, scale: 0.9 }}
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                      onClick={() => { setIsFABOpen(false); setShowFuelModal(true); }}
                      className="flex items-center gap-2 bg-neo-accent-yellow border-2 border-neo-accent px-3 py-2 neo-shadow-sm active:translate-y-[1px] active:shadow-none cursor-pointer text-black"
                    >
                      <Flame className="w-4 h-4" />
                      <span className="font-display font-bold text-xs uppercase whitespace-nowrap">Add Fuel</span>
                    </motion.button>
                    <motion.button
                      initial={{ opacity: 0, y: 15, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 15, scale: 0.9 }}
                      transition={{ duration: 0.15, ease: 'easeOut', delay: 0.03 }}
                      onClick={() => { setIsFABOpen(false); setShowTripModal(true); }}
                      className="flex items-center gap-2 bg-neo-accent-green border-2 border-neo-accent px-3 py-2 neo-shadow-sm active:translate-y-[1px] active:shadow-none cursor-pointer text-black"
                    >
                      <Milestone className="w-4 h-4" />
                      <span className="font-display font-bold text-xs uppercase whitespace-nowrap">Log Trip</span>
                    </motion.button>
                    <motion.button
                      initial={{ opacity: 0, y: 15, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 15, scale: 0.9 }}
                      transition={{ duration: 0.15, ease: 'easeOut', delay: 0.06 }}
                      onClick={() => { setIsFABOpen(false); setShowExpenseModal(true); }}
                      className="flex items-center gap-2 bg-blue-300 border-2 border-neo-accent px-3 py-2 neo-shadow-sm active:translate-y-[1px] active:shadow-none cursor-pointer text-black"
                    >
                      <CreditCard className="w-4 h-4" />
                      <span className="font-display font-bold text-xs uppercase whitespace-nowrap">Add Expense</span>
                    </motion.button>
                  </div>
                )}
              </AnimatePresence>

              <button
                onClick={() => {
                  if (activeTab === 'dashboard') {
                    setIsFABOpen(!isFABOpen);
                  } else if (activeTab === 'fuel') {
                    setShowFuelModal(true);
                  } else if (activeTab === 'trips') {
                    setShowTripModal(true);
                  } else if (activeTab === 'expenses') {
                    setShowExpenseModal(true);
                  } else if (activeTab === 'journeys') {
                    setJourneysOpenRequest(r => ({ seq: r.seq + 1, mode: 'create' }));
                  }
                }}
                className={`w-14 h-14 flex items-center justify-center border-2 border-neo-accent text-black font-black text-2xl neo-shadow-sm active:translate-y-[1px] active:shadow-none cursor-pointer transition-all duration-200 ${
                  activeTab === 'dashboard' && isFABOpen 
                    ? 'bg-white rotate-45' 
                    : activeTab === 'fuel' 
                      ? 'bg-neo-accent-yellow' 
                      : activeTab === 'trips' 
                        ? 'bg-neo-accent-green' 
                        : activeTab === 'expenses' 
                          ? 'bg-blue-300' 
                          : activeTab === 'journeys'
                            ? 'bg-rose-300'
                            : 'bg-neo-accent'
                }`}
                aria-label="Quick Add"
              >
                <Plus className="w-6 h-6" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

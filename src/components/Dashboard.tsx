/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Vehicle, FuelLog, Expense, Trip, MaintenanceRecord, Journey, AppSettings } from '../types';
import {
  calculateMoMCosts,
  getMaintenanceAlerts,
  formatCurrency,
  formatNumber,
  getYearMonth,
  calculateJourneyStats,
  formatJourneyDateRange,
  getLocalDateString,
  parseLocalDate
} from '../utils';
import {
  TrendingUp,
  TrendingDown,
  Compass,
  Coins,
  Clock,
  AlertTriangle,
  Wrench,
  Fuel,
  Navigation,
  Plus,
  Flame,
  Milestone,
  CreditCard,
  MapPin,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Gauge,
  Zap
} from 'lucide-react';

interface DashboardProps {
  vehicles: Vehicle[];
  fuelLogs: FuelLog[];
  expenses: Expense[];
  trips: Trip[];
  maintenanceRecords: MaintenanceRecord[];
  journeys: Journey[];
  selectedVehicleId: string | 'all';
  currency: string;
  onFinishTripTrigger: (tripId: string) => void;
  onQuickAdd: (tab: 'fuel' | 'trips' | 'expenses') => void;
  onOpenJourneys: () => void;
  onCreateJourney: () => void;
  onEditTrip: (trip: Trip) => void;
  onOpenGarage?: () => void;
  settings?: AppSettings;
}

export default function Dashboard({
  vehicles,
  fuelLogs,
  expenses,
  trips,
  maintenanceRecords,
  journeys,
  selectedVehicleId,
  currency,
  onFinishTripTrigger,
  onQuickAdd,
  onOpenJourneys,
  onCreateJourney,
  onEditTrip,
  onOpenGarage,
  settings
}: DashboardProps) {
  const [activeChartData, setActiveChartData] = useState<{label: string, value: string} | null>(null);
  const [activeDistChartData, setActiveDistChartData] = useState<{label: string, value: string} | null>(null);
  const [activeEffChartData, setActiveEffChartData] = useState<{label: string, value: string} | null>(null);

  // Persistent card collapse states saved in localStorage
  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('odotrack_dash_collapsed');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const toggleCardCollapse = (cardId: string) => {
    setCollapsedCards(prev => {
      const updated = { ...prev, [cardId]: !prev[cardId] };
      try {
        localStorage.setItem('odotrack_dash_collapsed', JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      return updated;
    });
  };

  // Find ALL active trips for the filtered context
  const activeTrips = trips.filter(t =>
    t.status === 'active' &&
    (selectedVehicleId === 'all' || t.vehicleId === selectedVehicleId)
  );

  if (vehicles.length === 0) {
    return (
      <div className="w-full bg-neo-card dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-8 neo-shadow dark:neo-shadow-dark flex flex-col items-center justify-center text-center select-none py-16">
        <AlertTriangle className="w-16 h-16 text-neo-accent animate-bounce mb-4" />
        <h2 className="font-display font-black text-2xl uppercase mb-2">No Vehicles Registered</h2>
        <p className="font-sans text-gray-500 dark:text-gray-400 max-w-md mb-6">
          To begin tracking your mileage, fuel fill-ups, and maintenance logs, you must first add a vehicle record.
        </p>
      </div>
    );
  }

  // Vehicle filter helper
  const filterByVehicle = (item: { vehicleId: string }) =>
    selectedVehicleId === 'all' ? true : item.vehicleId === selectedVehicleId;

  // Current month metrics
  const now = new Date();
  const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const currentMonthFuelCost = fuelLogs
    .filter(l => filterByVehicle(l) && getYearMonth(l.date) === currentYearMonth)
    .reduce((sum, l) => sum + l.cost, 0);

  const currentMonthExpenseCost = expenses
    .filter(e => filterByVehicle(e) && getYearMonth(e.date) === currentYearMonth)
    .reduce((sum, e) => sum + e.cost, 0);

  const currentMonthTotalSpend = currentMonthFuelCost + currentMonthExpenseCost;

  const currentMonthFillUps = fuelLogs
    .filter(l => filterByVehicle(l) && getYearMonth(l.date) === currentYearMonth).length;

  const currentMonthDistance = trips
    .filter(t => filterByVehicle(t) && t.status === 'completed' && getYearMonth(t.startDate) === currentYearMonth)
    .reduce((sum, t) => sum + Math.max(0, (t.endOdo || 0) - t.startOdo), 0);

  const currentMonthTrips = trips
    .filter(t => filterByVehicle(t) && t.status === 'completed' && getYearMonth(t.startDate) === currentYearMonth).length;

  // 2. Calculate MoM Costs
  const momStats = calculateMoMCosts(selectedVehicleId, fuelLogs, expenses);

  // Calculate Days Since Last Fuel Fill & Km Since Last Refuel.
  //
  // Previously this picked the single most-recent fuel log across the whole
  // fleet (fuelLogs[0] after a global sort) even when "All Vehicles" was
  // selected, then summed EVERY vehicle's trip distance since that one
  // vehicle's fill date — silently discarding the other vehicles' own fuel
  // history and mixing their trip distance into an unrelated timeline.
  // Now each vehicle's own last-fill/since-refuel numbers are computed
  // independently, and the "All Vehicles" view surfaces whichever vehicle
  // is most overdue (largest days-since-last-fill) — the actionable one for
  // fleet monitoring — with clear attribution to that vehicle.
  const vehiclesInScope = selectedVehicleId === 'all' ? vehicles : vehicles.filter(v => v.id === selectedVehicleId);

  const perVehicleFuelStats = vehiclesInScope
    .map(v => {
      const vLogs = fuelLogs
        .filter(l => l.vehicleId === v.id)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const vLastFuelLog = vLogs[0];
      if (!vLastFuelLog) return null;

      const lastDate = parseLocalDate(vLastFuelLog.date);
      const today = new Date();
      const lastDateTime = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate()).getTime();
      const todayTime = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
      const days = Math.max(0, Math.floor((todayTime - lastDateTime) / (1000 * 60 * 60 * 24)));

      const km = trips
        .filter(t => t.vehicleId === v.id && t.status === 'completed' && t.startDate >= vLastFuelLog.date)
        .reduce((sum, t) => sum + Math.max(0, (t.endOdo || 0) - t.startOdo), 0);

      return { vehicle: v, lastFuelLog: vLastFuelLog, days, km };
    })
    .filter((s): s is { vehicle: Vehicle; lastFuelLog: FuelLog; days: number; km: number } => s !== null);

  let daysSinceLastFill: number | null = null;
  let kmSinceLastRefuel: number | null = null;
  let lastFuelLog: FuelLog | undefined;
  let lastFuelLogVehicle: Vehicle | undefined;

  if (perVehicleFuelStats.length > 0) {
    const highlighted = selectedVehicleId === 'all'
      ? perVehicleFuelStats.reduce((a, b) => (b.days > a.days ? b : a))
      : perVehicleFuelStats[0];
    daysSinceLastFill = highlighted.days;
    kmSinceLastRefuel = highlighted.km;
    lastFuelLog = highlighted.lastFuelLog;
    lastFuelLogVehicle = highlighted.vehicle;
  }

  // 3. Maintenance per vehicle (new generic system)
  const getVehicleMaintenance = () => {
    const targetVehicles = selectedVehicleId !== 'all'
      ? vehicles.filter(v => v.id === selectedVehicleId)
      : vehicles;
    return targetVehicles.map(v => ({
      vehicle: v,
      alerts: getMaintenanceAlerts(v, expenses, maintenanceRecords, settings)
    }));
  };

  const maintenanceAlertsList = getVehicleMaintenance();

  // 4. Custom SVG Bar Chart calculation (Last 6 Months breakdown)
  const getChartData = () => {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    return months.map(m => {
      const fuelTotal = fuelLogs
        .filter(l => filterByVehicle(l) && getYearMonth(l.date) === m)
        .reduce((sum, l) => sum + l.cost, 0);

      const expenseTotal = expenses
        .filter(e => filterByVehicle(e) && getYearMonth(e.date) === m)
        .reduce((sum, e) => sum + e.cost, 0);

      // Label (e.g. "May")
      const [year, month] = m.split('-');
      const label = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('en-US', { month: 'short' });

      return {
        month: m,
        label,
        fuel: fuelTotal,
        expenses: expenseTotal,
        total: fuelTotal + expenseTotal
      };
    });
  };

  const getDistanceChartData = () => {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    return months.map(m => {
      const distanceTotal = trips
        .filter(t => filterByVehicle(t) && t.status === 'completed' && getYearMonth(t.startDate) === m)
        .reduce((sum, t) => sum + Math.max(0, (t.endOdo || 0) - t.startOdo), 0);

      // Label (e.g. "May")
      const [year, month] = m.split('-');
      const label = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('en-US', { month: 'short' });

      return {
        month: m,
        label,
        distance: distanceTotal
      };
    });
  };

  const chartData = getChartData();
  const maxChartValue = Math.max(...chartData.map(d => Math.max(d.fuel + d.expenses, 50)), 100);

  const distanceChartData = getDistanceChartData();
  const maxDistanceChartValue = Math.max(...distanceChartData.map(d => d.distance), 50);

  const getEfficiencyChartData = () => {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    return months.map(m => {
      const monthLogs = fuelLogs.filter(
        l => filterByVehicle(l) && getYearMonth(l.date) === m && l.mileageSinceLast != null && l.mileageSinceLast > 0
      );
      const avgEfficiency = monthLogs.length > 0
        ? parseFloat((monthLogs.reduce((sum, l) => sum + (l.mileageSinceLast || 0), 0) / monthLogs.length).toFixed(1))
        : null;

      const [year, month] = m.split('-');
      const label = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('en-US', { month: 'short' });

      return {
        month: m,
        label,
        efficiency: avgEfficiency,
        count: monthLogs.length
      };
    });
  };

  const efficiencyChartData = getEfficiencyChartData();
  const maxEfficiencyChartValue = Math.max(
    ...efficiencyChartData.map(d => d.efficiency || 0),
    ...vehicles.filter(v => selectedVehicleId === 'all' || v.id === selectedVehicleId).map(v => v.claimedEfficiency || 0),
    20
  );

  // Lifetime summary data
  const lifetimeFuelCost = fuelLogs
    .filter(l => selectedVehicleId === 'all' ? true : l.vehicleId === selectedVehicleId)
    .reduce((sum, l) => sum + l.cost, 0);
  const lifetimeOtherCost = expenses
    .filter(e => selectedVehicleId === 'all' ? true : e.vehicleId === selectedVehicleId)
    .reduce((sum, e) => sum + e.cost, 0);
  const lifetimeFillUps = fuelLogs
    .filter(l => selectedVehicleId === 'all' ? true : l.vehicleId === selectedVehicleId).length;
  const lifetimeTrips = trips
    .filter(t => selectedVehicleId === 'all' ? true : t.vehicleId === selectedVehicleId)
    .filter(t => t.status === 'completed').length;
  const lifetimeDistance = trips
    .filter(t => selectedVehicleId === 'all' ? true : t.vehicleId === selectedVehicleId)
    .filter(t => t.status === 'completed')
    .reduce((sum, t) => sum + Math.max(0, (t.endOdo || 0) - t.startOdo), 0);
  const lifetimeTotalSpend = lifetimeFuelCost + lifetimeOtherCost;

  const displayedVehicles = vehicles.filter(v => selectedVehicleId === 'all' || v.id === selectedVehicleId);
  const isSingleVehicle = displayedVehicles.length === 1;

  return (
    <div className="w-full flex flex-col gap-2 select-none">

      {/* 1. Live Odometer Readings Horizontal Slider at start */}
      <div className="w-full bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-4 neo-shadow dark:neo-shadow-dark">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-neo-accent border border-black rounded-full" />
            <h3 className="font-display font-black text-sm uppercase tracking-wider">Live Odometer Readings</h3>
          </div>
          {!isSingleVehicle && (
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest sm:hidden">Swipe Left ➔</span>
          )}
        </div>
        <div className={`flex overflow-x-auto gap-4 pb-2 scrollbar-none snap-x snap-mandatory ${
          isSingleVehicle ? 'justify-center' : ''
        }`}>
          {displayedVehicles.map(v => {
            const isSelected = selectedVehicleId === 'all' || v.id === selectedVehicleId;
            return (
              <div
                key={v.id}
                className={`snap-start border-2 flex flex-col justify-between transition-all dashboard-odo-card ${
                  isSingleVehicle
                    ? 'w-full max-w-[240px]'
                    : 'min-w-[260px] sm:min-w-[280px]'
                } ${
                  isSelected
                    ? 'border-neo-accent bg-neo-accent/5 dark:bg-neo-accent/10'
                    : 'border-black dark:border-white bg-neo-bg dark:bg-neo-dark-bg opacity-75'
                }`}
              >
                {/* Vehicle name as a small header */}
                <div className={`px-3 pt-2.5 pb-1.5 dashboard-odo-header ${isSelected ? 'bg-neo-accent/10' : 'bg-black/5'}`}>
                  <span className={`font-display font-black text-xs uppercase ${isSelected ? 'text-neo-accent' : 'text-gray-600'}`}>
                    {v.name}
                  </span>
                  <div className="font-sans text-[9px] text-gray-400 mt-0.5 leading-none">
                    {v.registration || 'N/A'} • {v.fuelType.toUpperCase()}
                  </div>
                </div>
                {/* Odometer value — big and bold */}
                <div className={`flex items-center gap-1.5 px-3 py-3 ${isSingleVehicle ? 'justify-center' : ''}`}>
                  <div className="flex bg-black text-neo-accent-yellow px-3 py-1.5 font-mono font-black border-2 border-black tracking-widest rounded leading-none text-4xl">
                    {String(Math.round(v.odometer)).padStart(6, '0')}
                  </div>
                  <span className="text-sm font-black text-black dark:text-white">KM</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Today's Trips — only renders when there's at least one trip dated
          today; naturally disappears once the date rolls over since it's
          filtered by trip.startDate === today's date, not by anything
          time-based that needs manual clearing. */}
      {(() => {
        const todayStr = getLocalDateString();
        const todaysTrips = trips
          .filter(t => filterByVehicle(t) && t.startDate === todayStr)
          .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

        if (todaysTrips.length === 0) return null;

        return (
          <div className="w-full bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-4 neo-shadow dark:neo-shadow-dark">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-3 h-3 bg-blue-500 border border-black rounded-full" />
              <h3 className="font-display font-black text-sm uppercase tracking-wider">Today's Trips</h3>
              <span className="m3-custom-badge ml-auto px-1.5 py-0.5 bg-blue-400 text-black text-[9px] font-bold border border-black">{todaysTrips.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {todaysTrips.map(trip => {
                const tripVehicle = vehicles.find(v => v.id === trip.vehicleId);
                const distance = trip.status === 'completed' && trip.endOdo
                  ? Math.max(0, trip.endOdo - trip.startOdo)
                  : null;
                return (
                  <div
                    key={trip.id}
                    onClick={() => onEditTrip(trip)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onEditTrip(trip); }}
                    className="flex items-center justify-between gap-2 p-2 border-2 border-black/10 dark:border-white/10 bg-neo-bg dark:bg-neo-dark-bg cursor-pointer hover:bg-neo-accent/5 hover:border-black/20 dark:hover:border-white/20 transition-colors"
                    title="Tap to edit this trip"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Navigation className={`w-3.5 h-3.5 shrink-0 ${trip.status === 'active' ? 'text-red-500' : 'text-neo-accent'}`} />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate flex items-center gap-1">
                          <span>{selectedVehicleId === 'all' && tripVehicle ? `${tripVehicle.name} • ` : ''}</span>
                          <span>{trip.source || 'Start'}</span>
                          <span className="font-bold text-xs">{trip.isRoundTrip ? '⇆' : '➔'}</span>
                          <span>{trip.destination || '?'}</span>
                        </div>
                        <div className="text-[10px] text-gray-400 font-mono">
                          {trip.startTime || '--:--'}{trip.endTime ? ` - ${trip.endTime}` : ''}
                        </div>
                      </div>
                    </div>
                    {trip.status === 'active' ? (
                      <span className="m3-custom-badge px-1.5 py-0.5 bg-red-400 text-black text-[9px] font-bold border border-black shrink-0 animate-pulse">LIVE</span>
                    ) : distance !== null ? (
                      <span className="font-mono text-[11px] font-bold text-gray-400 shrink-0">{formatNumber(distance, 0)} km</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Live Trip Alerts — one per active trip */}
      {activeTrips.map(trip => {
        const activeVehicleForTrip = vehicles.find(v => v.id === trip.vehicleId) || null;
        // Format start time for display
        const startTimeDisplay = trip.startTime
          ? `${trip.startDate} ${trip.startTime}`
          : trip.startDate;
        return (
          <div key={trip.id} className="w-full bg-neo-accent-yellow border-2 border-black text-black p-4 neo-shadow-sm flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
              </span>
              <div>
                <div className="font-display font-bold text-xs uppercase tracking-wider text-black/60">LIVE TRIP RUNNING</div>
                <div className="font-sans text-xs font-semibold">
                  Since <span className="font-mono font-bold">{startTimeDisplay}</span>
                </div>
                <div className="font-sans text-xs font-semibold max-w-[200px] truncate mt-0.5">
                  {activeVehicleForTrip?.name || 'Vehicle'}: {trip.source || 'Start'} {trip.isRoundTrip ? '⇆' : '➔'} {trip.destination || '?'}
                </div>
              </div>
            </div>
            <button
              id={`btn-dash-finish-trip-${trip.id}`}
              onClick={() => onFinishTripTrigger(trip.id)}
              className="px-3 py-1.5 bg-red-500 text-white border-2 border-black font-display font-bold text-xs uppercase hover:bg-red-600 neo-shadow-sm active:translate-y-[1px] active:box-shadow-none cursor-pointer"
            >
              FINISH
            </button>
          </div>
        );
      })}

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 0: JOURNEYS (grouped travel cost/distance tracking)
          ═══════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col gap-2">
        {(() => {
          const hasOngoingJourney = journeys.some(j =>
            (selectedVehicleId === 'all' || j.vehicleId === selectedVehicleId) && !j.endDate
          );

          return (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-pink-500 border border-black rounded-full" />
                <h3 className="font-display font-black text-sm uppercase tracking-wider">Journeys</h3>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={onOpenJourneys}
                  className="text-[10px] font-display font-bold uppercase text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white flex items-center gap-0.5 cursor-pointer"
                >
                  View All <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })()}

        {(() => {
          const relevantJourneys = journeys
            .filter(j => selectedVehicleId === 'all' || j.vehicleId === selectedVehicleId)
            .filter(j => !j.endDate) // Dashboard surfaces ongoing journeys only — completed ones live in the "Completed / Historical" section of the Journeys manager
            .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
            .slice(0, 5);

          const hasAnyJourneys = journeys.some(j => selectedVehicleId === 'all' || j.vehicleId === selectedVehicleId);

          if (relevantJourneys.length === 0) {
            return (
              <button
                onClick={onCreateJourney}
                className="w-full bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-4 neo-shadow dark:neo-shadow-dark flex items-center gap-3 hover:bg-neo-accent/5 cursor-pointer text-left"
              >
                <div className="p-2 bg-pink-400 border-2 border-black text-black shrink-0">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-display font-bold text-xs uppercase">
                    {hasAnyJourneys ? 'No Ongoing Journeys' : 'Track a trip like "Goa Trip"'}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {hasAnyJourneys
                      ? 'Tap to start a new one — completed journeys are in Completed / Historical'
                      : 'Group fuel spend + trips for a specific travel in one place'}
                  </div>
                </div>
              </button>
            );
          }

          return (
            <div className="flex overflow-x-auto gap-3 pb-1 scrollbar-none snap-x snap-mandatory">
              {relevantJourneys.map(j => {
                const stats = calculateJourneyStats(j.id, fuelLogs, trips, expenses);
                const vehicle = vehicles.find(v => v.id === j.vehicleId);
                return (
                  <button
                    key={j.id}
                    onClick={onOpenJourneys}
                    className="snap-start min-w-[200px] bg-transparent p-[2.5px] text-left cursor-pointer shrink-0 neo-shadow dark:neo-shadow-dark relative group live-journey-card-container"
                  >
                    {/* Clipped Crisp Border Trail */}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none live-journey-card-trail">
                      <div 
                        className="absolute w-[300%] h-[300%] top-[-100%] left-[-100%] animate-[spin_2s_linear_infinite] live-journey-card-trail-inner"
                        style={{
                          background: `conic-gradient(from 0deg, transparent 20%, var(--accent-color, #ff6b35) 50%, transparent 80%)`
                        }}
                      />
                    </div>

                    {/* Content Layer */}
                    <div className="relative z-10 w-full h-full bg-white dark:bg-neo-dark-card p-3 hover:bg-neo-accent/5 transition-colors live-journey-card-content">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="font-display font-bold text-xs uppercase truncate">{j.name}</span>
                        <span className="m3-custom-badge px-1 py-0.5 bg-green-400 text-black text-[8px] font-bold border border-black shrink-0">LIVE</span>
                      </div>
                      <div className="text-[10px] text-gray-400 truncate">{vehicle?.name} • {formatJourneyDateRange(j)}</div>
                      <div className="flex items-center gap-2 mt-1.5 font-mono text-[11px]">
                        <span className="text-neo-accent font-bold">{formatCurrency(stats.totalSpend, currency, 0)}</span>
                        <span className="text-gray-400">{formatNumber(stats.distance, 0)} km</span>
                      </div>
                    </div>
                  </button>
                );
              })}
              <button
                onClick={onCreateJourney}
                className="snap-start min-w-[100px] border-2 border-dashed border-gray-400 dark:border-gray-600 flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-black dark:hover:text-white hover:border-black dark:hover:border-white cursor-pointer shrink-0"
              >
                <Plus className="w-5 h-5" />
                <span className="text-[9px] font-bold uppercase">New</span>
              </button>
            </div>
          );
        })()}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 1: CURRENT MONTH
          ═══════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col gap-2">
        {/* Section header */}
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-neo-accent border border-black rounded-full" />
          <h3 className="font-display font-black text-sm uppercase tracking-wider">Current Month</h3>
        </div>

        <div className="relative w-full bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-5 neo-shadow dark:neo-shadow-dark">
          {/* Read-only current month/year badge */}
          <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 bg-neo-bg dark:bg-neo-dark-bg border-2 border-black dark:border dark:border-white px-1.5 py-0.5 neo-shadow-sm leading-none">
            <span className="font-mono text-[10px] sm:text-xs font-bold text-gray-600 dark:text-gray-300 uppercase text-center block">
              {now.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-3.5 h-3.5 bg-neo-accent border-2 border-black rounded-full" />
              <h2 className="font-display font-bold text-sm tracking-widest text-gray-500 dark:text-gray-400 uppercase">
                MONTHLY SPEND
              </h2>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-display font-black text-4xl sm:text-5xl tracking-tight text-black dark:text-white">
                {formatCurrency(currentMonthTotalSpend, currency)}
              </span>
              <div className="flex items-center gap-1.5 px-3 py-1 border-2 border-black dark:border dark:border-white rounded-full text-xs font-bold neo-shadow-sm bg-neo-bg dark:bg-neo-dark-bg">
                {momStats.pctChange > 0 ? (
                  <>
                    <TrendingUp className="w-4 h-4 text-red-500" />
                    <span className="text-red-600 dark:text-red-400 font-mono">+{momStats.pctChange}%</span>
                  </>
                ) : momStats.pctChange < 0 ? (
                  <>
                    <TrendingDown className="w-4 h-4 text-green-500" />
                    <span className="text-green-600 dark:text-green-400 font-mono">{momStats.pctChange}%</span>
                  </>
                ) : (
                  <>
                    <span className="text-gray-600 dark:text-gray-400 font-mono">0% change</span>
                  </>
                )}
                <span className="text-gray-400 font-normal">MoM</span>
              </div>
            </div>
            <p className="font-sans text-xs text-gray-400 mt-2">
              Fuel: {formatCurrency(currentMonthFuelCost, currency)} | Other Expenses: {formatCurrency(currentMonthExpenseCost, currency)}
            </p>
          </div>
        </div>

        {/* 6 stat cards for current month */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
          {/* Fill-ups this month */}
          <div className="relative bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-3.5 sm:p-5 neo-shadow dark:neo-shadow-dark flex flex-col justify-between gap-2">
            <div className="pr-10 sm:pr-16">
              <div className="font-display font-bold text-[11px] sm:text-sm tracking-wider text-gray-400 uppercase mb-1">FILL-UPS THIS MONTH</div>
              <div className="font-mono font-black text-xl sm:text-[26px] tracking-tight text-black dark:text-white">
                {currentMonthFillUps}
              </div>
              <div className="font-sans text-[11px] sm:text-[13px] text-gray-400 mt-1">Refuels in {currentYearMonth}</div>
            </div>
            <div className="absolute top-3.5 right-3.5 sm:top-5 sm:right-5 p-2 sm:p-3 bg-neo-accent border-2 border-black text-black neo-shadow-sm shrink-0">
              <Fuel className="w-4 h-4 sm:w-6 sm:h-6" />
            </div>
          </div>

          {/* Distance this month */}
          <div className="relative bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-3.5 sm:p-5 neo-shadow dark:neo-shadow-dark flex flex-col justify-between gap-2">
            <div className="pr-10 sm:pr-16">
              <div className="font-display font-bold text-[11px] sm:text-sm tracking-wider text-gray-400 uppercase mb-1">DISTANCE THIS MONTH</div>
              <div className="font-mono font-black text-xl sm:text-[26px] tracking-tight text-black dark:text-white">
                {formatNumber(currentMonthDistance, 0)} <span className="text-[12px] sm:text-base font-bold text-gray-400">KM</span>
              </div>
              <div className="font-sans text-[11px] sm:text-[13px] text-gray-400 mt-1">From logged trips</div>
            </div>
            <div className="absolute top-3.5 right-3.5 sm:top-5 sm:right-5 p-2 sm:p-3 bg-neo-accent-green border-2 border-black text-black neo-shadow-sm shrink-0">
              <Compass className="w-4 h-4 sm:w-6 sm:h-6" />
            </div>
          </div>

          {/* Trips this month */}
          <div className="relative bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-3.5 sm:p-5 neo-shadow dark:neo-shadow-dark flex flex-col justify-between gap-2">
            <div className="pr-10 sm:pr-16">
              <div className="font-display font-bold text-[11px] sm:text-sm tracking-wider text-gray-400 uppercase mb-1">TRIPS THIS MONTH</div>
              <div className="font-mono font-black text-xl sm:text-[26px] tracking-tight text-black dark:text-white">
                {currentMonthTrips}
              </div>
              <div className="font-sans text-[11px] sm:text-[13px] text-gray-400 mt-1">Completed trips</div>
            </div>
            <div className="absolute top-3.5 right-3.5 sm:top-5 sm:right-5 p-2 sm:p-3 bg-blue-400 border-2 border-black text-black neo-shadow-sm shrink-0">
              <Navigation className="w-4 h-4 sm:w-6 sm:h-6" />
            </div>
          </div>

          {/* Days Since Last Fuel Card */}
          <div className="relative bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-3.5 sm:p-5 neo-shadow dark:neo-shadow-dark flex flex-col justify-between gap-2">
            <div className="pr-10 sm:pr-16">
              <div className="font-display font-bold text-[11px] sm:text-sm tracking-wider text-gray-400 uppercase mb-1">
                {selectedVehicleId === 'all' ? 'MOST OVERDUE FILL' : 'DAYS SINCE LAST FILL'}
              </div>
              <div className="font-mono font-black text-xl sm:text-[26px] tracking-tight text-black dark:text-white">
                {daysSinceLastFill !== null ? `${daysSinceLastFill}` : '--'} <span className="text-[12px] sm:text-base font-bold text-gray-400">DAYS</span>
              </div>
              <div className="font-sans text-[11px] sm:text-[13px] text-gray-400 mt-1">
                {lastFuelLog
                  ? `Last on ${parseLocalDate(lastFuelLog.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${selectedVehicleId === 'all' && lastFuelLogVehicle ? ` · ${lastFuelLogVehicle.name}` : ''}`
                  : 'No fills logged yet'}
              </div>
            </div>
            <div className="absolute top-3.5 right-3.5 sm:top-5 sm:right-5 p-2 sm:p-3 bg-neo-accent-yellow border-2 border-black text-black neo-shadow-sm shrink-0">
              <Clock className="w-4 h-4 sm:w-6 sm:h-6" />
            </div>
          </div>

          {/* KM Since Last Refuel */}
          <div className="relative bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-3.5 sm:p-5 neo-shadow dark:neo-shadow-dark flex flex-col justify-between gap-2">
            <div className="pr-10 sm:pr-16">
              <div className="font-display font-bold text-[11px] sm:text-sm tracking-wider text-gray-400 uppercase mb-1">KM SINCE LAST REFUEL</div>
              <div className="font-mono font-black text-xl sm:text-[26px] tracking-tight text-black dark:text-white">
                {kmSinceLastRefuel !== null ? formatNumber(kmSinceLastRefuel, 0) : '--'} <span className="text-[12px] sm:text-base font-bold text-gray-400">KM</span>
              </div>
              <div className="font-sans text-[11px] sm:text-[13px] text-gray-400 mt-1">
                {kmSinceLastRefuel !== null && lastFuelLog
                  ? `Since ${parseLocalDate(lastFuelLog.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${selectedVehicleId === 'all' && lastFuelLogVehicle ? ` · ${lastFuelLogVehicle.name}` : ''}`
                  : 'No trips logged since refuel'}
              </div>
            </div>
            <div className="absolute top-3.5 right-3.5 sm:top-5 sm:right-5 p-2 sm:p-3 bg-neo-accent border-2 border-black text-black neo-shadow-sm shrink-0">
              <Milestone className="w-4 h-4 sm:w-6 sm:h-6" />
            </div>
          </div>

          {/* Other Expenses This Month */}
          <div className="relative bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-3.5 sm:p-5 neo-shadow dark:neo-shadow-dark flex flex-col justify-between gap-2">
            <div className="pr-10 sm:pr-16">
              <div className="font-display font-bold text-[11px] sm:text-sm tracking-wider text-gray-400 uppercase mb-1">OTHER EXPENSES THIS MONTH</div>
              <div className="font-mono font-black text-xl sm:text-[26px] tracking-tight text-black dark:text-white">
                {formatCurrency(currentMonthExpenseCost, currency)}
              </div>
              <div className="font-sans text-[11px] sm:text-[13px] text-gray-400 mt-1">Non-fuel costs in {currentYearMonth}</div>
            </div>
            <div className="absolute top-3.5 right-3.5 sm:top-5 sm:right-5 p-2 sm:p-3 bg-blue-300 border-2 border-black text-black neo-shadow-sm shrink-0">
              <CreditCard className="w-4 h-4 sm:w-6 sm:h-6" />
            </div>
          </div>
        </div>

        {/* Tank Capacity & Range Monitor Widget */}
        {(() => {
          const vehWithTank = displayedVehicles.filter(v => v.tankCapacity && v.tankCapacity > 0);
          if (vehWithTank.length === 0) return null;
          const isCollapsed = collapsedCards['card-range-monitor'];

          return (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="w-full bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-4 neo-shadow dark:neo-shadow-dark flex flex-col gap-3 mt-1"
            >
              <div className="flex items-center justify-between border-b border-black/10 dark:border-white/10 pb-2">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-emerald-400 border border-black rounded-full" />
                  <h3 className="font-display font-black text-sm uppercase tracking-wider">Tank Capacity & Est. Range Monitor</h3>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px] text-gray-400 font-bold uppercase">
                    {vehWithTank.length} VEHICLE{vehWithTank.length > 1 ? 'S' : ''} MONITORED
                  </span>
                  <button
                    onClick={() => toggleCardCollapse('card-range-monitor')}
                    className="p-1 border-2 border-black dark:border-white bg-neo-bg dark:bg-neo-dark-bg hover:bg-neo-accent/20 cursor-pointer transition-colors"
                    title={isCollapsed ? "Expand section" : "Collapse section"}
                  >
                    {isCollapsed ? <ChevronDown className="w-4 h-4 text-black dark:text-white" /> : <ChevronUp className="w-4 h-4 text-black dark:text-white" />}
                  </button>
                </div>
              </div>

              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.div
                    key="range-monitor-body"
                    initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
                    animate={{ opacity: 1, height: 'auto', transitionEnd: { overflow: 'visible' } }}
                    exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-3"
                  >
                    {vehWithTank.map(v => {
                      const sortedVLogs = fuelLogs
                        .filter(l => l.vehicleId === v.id)
                        .sort((a, b) => a.date.localeCompare(b.date) || (a.odometer || 0) - (b.odometer || 0));

                      const validMileageLogs = sortedVLogs.filter(l => l.mileageSinceLast != null && l.mileageSinceLast > 0);
                      const measuredAvg = validMileageLogs.length > 0
                        ? validMileageLogs.reduce((s, l) => s + (l.mileageSinceLast || 0), 0) / validMileageLogs.length
                        : null;

                      const effectiveEfficiency = measuredAvg ?? (v.claimedEfficiency && v.claimedEfficiency > 0 ? v.claimedEfficiency : null);
                      const isMeasured = measuredAvg != null;
                      const fullTankRange = effectiveEfficiency != null && effectiveEfficiency > 0 ? Math.round(v.tankCapacity! * effectiveEfficiency) : null;

                      // Find last Full Tank anchor
                      let lastFullIdx = -1;
                      for (let i = sortedVLogs.length - 1; i >= 0; i--) {
                        if (sortedVLogs[i].fullTank !== false && sortedVLogs[i].odometer != null) {
                          lastFullIdx = i;
                          break;
                        }
                      }

                      let estFuelRemaining = v.tankCapacity!;
                      let estRemainingPct = 100;
                      let estRemainingRange = fullTankRange;

                      if (effectiveEfficiency != null && effectiveEfficiency > 0) {
                        if (sortedVLogs.length > 0) {
                          if (lastFullIdx !== -1) {
                            const lastFullLog = sortedVLogs[lastFullIdx];
                            let currentFuelLevel = v.tankCapacity!; // 100% full at last full tank anchor

                            // Add partial fill litres logged after last full tank anchor
                            const partialLogsAfter = sortedVLogs.slice(lastFullIdx + 1);
                            const partialLitresAdded = partialLogsAfter.reduce((sum, l) => sum + (l.litres || 0), 0);
                            currentFuelLevel += partialLitresAdded;

                            // Subtract fuel consumed across km driven since last full tank anchor
                            const kmSinceFullAnchor = Math.max(0, v.odometer - (lastFullLog.odometer || 0));
                            const fuelUsed = kmSinceFullAnchor / effectiveEfficiency;

                            estFuelRemaining = Math.max(0, parseFloat((currentFuelLevel - fuelUsed).toFixed(1)));
                            estRemainingPct = Math.max(0, Math.min(100, Math.round((estFuelRemaining / v.tankCapacity!) * 100)));
                            estRemainingRange = Math.max(0, Math.round(estFuelRemaining * effectiveEfficiency));
                          } else {
                            // No full tank anchor yet — estimate based on latest log odometer or vehicle starting odometer
                            const lastLog = sortedVLogs[sortedVLogs.length - 1];
                            const refOdo = lastLog.odometer != null ? lastLog.odometer : v.startingOdometer;
                            const kmSinceLast = Math.max(0, v.odometer - refOdo);
                            const fuelUsed = kmSinceLast / effectiveEfficiency;
                            estFuelRemaining = Math.max(0, parseFloat((v.tankCapacity! - fuelUsed).toFixed(1)));
                            estRemainingPct = Math.max(0, Math.min(100, Math.round((estFuelRemaining / v.tankCapacity!) * 100)));
                            estRemainingRange = Math.max(0, Math.round(estFuelRemaining * effectiveEfficiency));
                          }
                        } else if (v.odometer > v.startingOdometer) {
                          // No fuel logs recorded yet, but vehicle has driven km since initial registration
                          const kmDriven = v.odometer - v.startingOdometer;
                          const fuelUsed = kmDriven / effectiveEfficiency;
                          estFuelRemaining = Math.max(0, parseFloat((v.tankCapacity! - fuelUsed).toFixed(1)));
                          estRemainingPct = Math.max(0, Math.min(100, Math.round((estFuelRemaining / v.tankCapacity!) * 100)));
                          estRemainingRange = Math.max(0, Math.round(estFuelRemaining * effectiveEfficiency));
                        }
                      }

                      return (
                        <div key={v.id} className="border-2 border-black bg-neo-bg dark:bg-neo-dark-bg p-3 flex flex-col justify-between gap-2.5">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-display font-black text-xs uppercase text-black dark:text-white">{v.name}</span>
                              <div className="font-mono text-[10px] text-gray-500">
                                Tank Size: {v.tankCapacity} {v.type === 'ev' ? 'kWh' : 'L'}
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="font-mono font-black text-xs text-emerald-600 dark:text-emerald-400">
                                {fullTankRange ? `~${fullTankRange} km max range` : 'Mileage calculating...'}
                              </span>
                              {effectiveEfficiency != null && effectiveEfficiency > 0 && (
                                <div className="font-mono text-[10px] text-gray-500 flex items-center justify-end gap-1">
                                  <span>
                                    {isMeasured ? 'Measured Avg:' : 'Claimed Baseline:'} {formatNumber(effectiveEfficiency, 1)} {v.type === 'ev' ? 'KM/kWh' : 'KM/L'}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Progress Gauge Bar */}
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between font-mono text-[10px] font-bold">
                              <span>Est. Level: {estFuelRemaining} {v.type === 'ev' ? 'kWh' : 'L'} ({estRemainingPct}%)</span>
                              <span className="text-neo-accent font-black">{estRemainingRange != null ? `~${estRemainingRange} km range left` : ''}</span>
                            </div>
                            <div className="w-full h-3 border-2 border-black bg-gray-200 dark:bg-zinc-800 rounded-sm overflow-hidden p-0.5">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${estRemainingPct}%` }}
                                transition={{ duration: 0.5, ease: 'easeOut' }}
                                className={`h-full border border-black ${
                                  estRemainingPct > 50 ? 'bg-emerald-400' : estRemainingPct > 20 ? 'bg-neo-accent-yellow' : 'bg-red-500'
                                }`}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })()}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 2: CHARTS (6-Month Trend)
          ═══════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col gap-2">
        {/* Section header */}
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-neo-accent-green border border-black rounded-full" />
          <h3 className="font-display font-black text-sm uppercase tracking-wider">6-Month Trend</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* Custom Neo-brutalist Bar Chart: Expenditures */}
          {(() => {
            const isCollapsed = collapsedCards['card-expenditures'];
            return (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.05 }}
                className="bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-5 neo-shadow dark:neo-shadow-dark flex flex-col justify-between"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-display font-black text-lg uppercase tracking-wider">Expenditures</h3>
                    <p className="font-sans text-xs text-gray-400">Past 6 months spent</p>
                  </div>
                  <button
                    onClick={() => toggleCardCollapse('card-expenditures')}
                    className="p-1 border-2 border-black dark:border-white bg-neo-bg dark:bg-neo-dark-bg hover:bg-neo-accent/20 cursor-pointer transition-colors"
                    title={isCollapsed ? "Expand card" : "Collapse card"}
                  >
                    {isCollapsed ? <ChevronDown className="w-4 h-4 text-black dark:text-white" /> : <ChevronUp className="w-4 h-4 text-black dark:text-white" />}
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.div
                      key="expenditures-body"
                      initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
                      animate={{ opacity: 1, height: 'auto', transitionEnd: { overflow: 'visible' } }}
                      exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="flex flex-col justify-between flex-1"
                    >
                      {/* Active value banner */}
                      {activeChartData && (
                        <div className="mb-2 bg-black text-white p-2 border-2 border-black font-mono text-xs flex items-center justify-between">
                          <span>{activeChartData.label}</span>
                          <span>{activeChartData.value}</span>
                        </div>
                      )}

                      {/* SVG Custom Graph */}
                      <div className="w-full h-56 border-2 border-black dark:border dark:border-white bg-neo-bg dark:bg-neo-dark-bg relative flex items-end">

                        {/* Y-Axis Labels */}
                        <div className="h-full w-10 flex flex-col justify-between items-end pr-1 py-4 pointer-events-none">
                          <span className="text-[9px] font-mono text-gray-500 dark:text-gray-400 leading-none">{formatCurrency(maxChartValue, currency, 0)}</span>
                          <span className="text-[9px] font-mono text-gray-500 dark:text-gray-400 leading-none">{formatCurrency(maxChartValue * 0.75, currency, 0)}</span>
                          <span className="text-[9px] font-mono text-gray-500 dark:text-gray-400 leading-none">{formatCurrency(maxChartValue * 0.5, currency, 0)}</span>
                          <span className="text-[9px] font-mono text-gray-500 dark:text-gray-400 leading-none">{formatCurrency(maxChartValue * 0.25, currency, 0)}</span>
                          <span className="text-[9px] font-mono text-gray-500 dark:text-gray-400 leading-none">0</span>
                        </div>

                        <div className="flex-1 h-full relative p-4 pl-0">
                          {/* Gridlines */}
                          <div className="absolute inset-0 flex flex-col justify-between py-4 pr-4 pl-0 pointer-events-none opacity-20">
                            <div className="border-b border-black dark:border-white w-full" />
                            <div className="border-b border-black dark:border-white w-full" />
                            <div className="border-b border-black dark:border-white w-full" />
                            <div className="border-b border-black dark:border-white w-full" />
                            <div className="w-full h-0" />
                          </div>

                          {/* Bars container */}
                          <div className="w-full h-full flex justify-around items-end z-10 pt-6">
                            {chartData.map((d) => {
                              const fuelHeight = (d.fuel / maxChartValue) * 100;
                              const expHeight = (d.expenses / maxChartValue) * 100;

                              return (
                                <div key={d.month} className="flex flex-col items-center flex-1 h-full justify-end group relative">

                                  {/* Tooltip on Hover */}
                                  <div className="absolute top-[-24px] hidden group-hover:flex bg-black text-white text-[10px] font-mono p-1 border border-white z-20 whitespace-nowrap">
                                    F: {formatCurrency(d.fuel, currency, 0)} | O: {formatCurrency(d.expenses, currency, 0)}
                                  </div>

                                  <div className="w-8 sm:w-10 flex items-end justify-center gap-1 h-full">
                                    {/* Fuel Bar (Orange) */}
                                    <motion.div
                                      onClick={() => setActiveChartData({ label: `${d.label}: Fuel`, value: formatCurrency(d.fuel, currency) })}
                                      initial={{ height: 0 }}
                                      animate={{ height: `${Math.max(fuelHeight, 2)}%` }}
                                      transition={{ duration: 0.4, ease: 'easeOut' }}
                                      className="w-3 bg-neo-accent border-2 border-black hover:bg-orange-600 transition-colors cursor-pointer"
                                    />
                                    {/* Expenses Bar (Yellow) */}
                                    <motion.div
                                      onClick={() => setActiveChartData({ label: `${d.label}: Expenses`, value: formatCurrency(d.expenses, currency) })}
                                      initial={{ height: 0 }}
                                      animate={{ height: `${Math.max(expHeight, 2)}%` }}
                                      transition={{ duration: 0.4, ease: 'easeOut' }}
                                      className="w-3 bg-neo-accent-yellow border-2 border-black hover:bg-yellow-500 transition-colors cursor-pointer"
                                    />
                                  </div>

                                  <span className="font-display font-bold text-xs text-black dark:text-white mt-2 shrink-0">{d.label}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-center gap-4 mt-4 font-mono text-[11px] font-bold">
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 bg-neo-accent border border-black" />
                          <span>FUEL</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 bg-neo-accent-yellow border border-black" />
                          <span>OTHER</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })()}

          {/* Custom Neo-brutalist Bar Chart: Distance Driven */}
          {(() => {
            const isCollapsed = collapsedCards['card-distance'];
            return (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                className="bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-5 neo-shadow dark:neo-shadow-dark flex flex-col justify-between"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-display font-black text-lg uppercase tracking-wider">Distance Driven</h3>
                    <p className="font-sans text-xs text-gray-400">Past 6 months logged (KM)</p>
                  </div>
                  <button
                    onClick={() => toggleCardCollapse('card-distance')}
                    className="p-1 border-2 border-black dark:border-white bg-neo-bg dark:bg-neo-dark-bg hover:bg-neo-accent/20 cursor-pointer transition-colors"
                    title={isCollapsed ? "Expand card" : "Collapse card"}
                  >
                    {isCollapsed ? <ChevronDown className="w-4 h-4 text-black dark:text-white" /> : <ChevronUp className="w-4 h-4 text-black dark:text-white" />}
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.div
                      key="distance-body"
                      initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
                      animate={{ opacity: 1, height: 'auto', transitionEnd: { overflow: 'visible' } }}
                      exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="flex flex-col justify-between flex-1"
                    >
                      {/* Active value banner */}
                      {activeDistChartData && (
                        <div className="mb-2 bg-black text-white p-2 border-2 border-black font-mono text-xs flex items-center justify-between">
                          <span>{activeDistChartData.label}</span>
                          <span>{activeDistChartData.value}</span>
                        </div>
                      )}

                      {/* SVG Custom Graph */}
                      <div className="w-full h-56 border-2 border-black dark:border dark:border-white bg-neo-bg dark:bg-neo-dark-bg relative flex items-end">

                        {/* Y-Axis Labels */}
                        <div className="h-full w-10 flex flex-col justify-between items-end pr-1 py-4 pointer-events-none">
                          <span className="text-[9px] font-mono text-gray-500 dark:text-gray-400 leading-none">{Math.round(maxDistanceChartValue)}</span>
                          <span className="text-[9px] font-mono text-gray-500 dark:text-gray-400 leading-none">{Math.round(maxDistanceChartValue * 0.75)}</span>
                          <span className="text-[9px] font-mono text-gray-500 dark:text-gray-400 leading-none">{Math.round(maxDistanceChartValue * 0.5)}</span>
                          <span className="text-[9px] font-mono text-gray-500 dark:text-gray-400 leading-none">{Math.round(maxDistanceChartValue * 0.25)}</span>
                          <span className="text-[9px] font-mono text-gray-500 dark:text-gray-400 leading-none">0</span>
                        </div>

                        <div className="flex-1 h-full relative p-4 pl-0">
                          {/* Gridlines */}
                          <div className="absolute inset-0 flex flex-col justify-between py-4 pr-4 pl-0 pointer-events-none opacity-20">
                            <div className="border-b border-black dark:border-white w-full" />
                            <div className="border-b border-black dark:border-white w-full" />
                            <div className="border-b border-black dark:border-white w-full" />
                            <div className="border-b border-black dark:border-white w-full" />
                            <div className="w-full h-0" />
                          </div>

                          {/* Bars container */}
                          <div className="w-full h-full flex justify-around items-end z-10 pt-6">
                            {distanceChartData.map((d) => {
                              const distHeight = (d.distance / maxDistanceChartValue) * 100;

                              return (
                                <div key={d.month} className="flex flex-col items-center flex-1 h-full justify-end group relative">

                                  {/* Tooltip on Hover */}
                                  <div className="absolute top-[-24px] hidden group-hover:flex bg-black text-white text-[10px] font-mono p-1 border border-white z-20 whitespace-nowrap">
                                    Distance: {d.distance.toFixed(1)} km
                                  </div>

                                  <div className="w-8 sm:w-10 flex items-end justify-center h-full">
                                    {/* Distance Bar (Green/Teal) */}
                                    <motion.div
                                      onClick={() => setActiveDistChartData({ label: `${d.label}: Distance`, value: `${d.distance.toFixed(1)} km` })}
                                      initial={{ height: 0 }}
                                      animate={{ height: `${Math.max(distHeight, 2)}%` }}
                                      transition={{ duration: 0.4, ease: 'easeOut' }}
                                      className="w-6 bg-neo-accent-green border-2 border-black hover:bg-green-600 transition-colors cursor-pointer"
                                    />
                                  </div>

                                  <span className="font-display font-bold text-xs text-black dark:text-white mt-2 shrink-0">{d.label}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-center gap-4 mt-4 font-mono text-[11px] font-bold">
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 bg-neo-accent-green border border-black" />
                          <span>DISTANCE DRIVEN (KM)</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })()}

          {/* Custom Neo-brutalist Chart: Fuel Efficiency Trend */}
          {(() => {
            const isCollapsed = collapsedCards['card-efficiency'];
            const scopeVehicles = vehicles.filter(v => selectedVehicleId === 'all' || v.id === selectedVehicleId);
            const isEvScope = scopeVehicles.length > 0 && scopeVehicles.every(v => v.type === 'ev');
            const unitStr = isEvScope ? 'KM/kWh' : 'KM/L';
            const primaryVehicle = scopeVehicles[0];
            const claimedBaseline = primaryVehicle?.claimedEfficiency || null;

            return (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.15 }}
                className="bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-5 neo-shadow dark:neo-shadow-dark flex flex-col justify-between"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-display font-black text-lg uppercase tracking-wider flex items-center gap-1.5">
                      Fuel Efficiency Curve
                    </h3>
                    <p className="font-sans text-xs text-gray-400">Monthly average ({unitStr})</p>
                  </div>
                  <button
                    onClick={() => toggleCardCollapse('card-efficiency')}
                    className="p-1 border-2 border-black dark:border-white bg-neo-bg dark:bg-neo-dark-bg hover:bg-neo-accent/20 cursor-pointer transition-colors"
                    title={isCollapsed ? "Expand card" : "Collapse card"}
                  >
                    {isCollapsed ? <ChevronDown className="w-4 h-4 text-black dark:text-white" /> : <ChevronUp className="w-4 h-4 text-black dark:text-white" />}
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.div
                      key="efficiency-body"
                      initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
                      animate={{ opacity: 1, height: 'auto', transitionEnd: { overflow: 'visible' } }}
                      exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="flex flex-col justify-between flex-1"
                    >
                      {/* Active value banner */}
                      {activeEffChartData && (
                        <div className="mb-2 bg-black text-white p-2 border-2 border-black font-mono text-xs flex items-center justify-between">
                          <span>{activeEffChartData.label}</span>
                          <span>{activeEffChartData.value}</span>
                        </div>
                      )}

                      {/* SVG Custom Graph */}
                      <div className="w-full h-56 border-2 border-black dark:border dark:border-white bg-neo-bg dark:bg-neo-dark-bg relative flex items-end">

                        {/* Y-Axis Labels */}
                        <div className="h-full w-10 flex flex-col justify-between items-end pr-1 py-4 pointer-events-none">
                          <span className="text-[9px] font-mono text-gray-500 dark:text-gray-400 leading-none">{Math.round(maxEfficiencyChartValue)}</span>
                          <span className="text-[9px] font-mono text-gray-500 dark:text-gray-400 leading-none">{Math.round(maxEfficiencyChartValue * 0.75)}</span>
                          <span className="text-[9px] font-mono text-gray-500 dark:text-gray-400 leading-none">{Math.round(maxEfficiencyChartValue * 0.5)}</span>
                          <span className="text-[9px] font-mono text-gray-500 dark:text-gray-400 leading-none">{Math.round(maxEfficiencyChartValue * 0.25)}</span>
                          <span className="text-[9px] font-mono text-gray-500 dark:text-gray-400 leading-none">0</span>
                        </div>

                        <div className="flex-1 h-full relative p-4 pl-0">
                          {/* Gridlines */}
                          <div className="absolute inset-0 flex flex-col justify-between py-4 pr-4 pl-0 pointer-events-none opacity-20">
                            <div className="border-b border-black dark:border-white w-full" />
                            <div className="border-b border-black dark:border-white w-full" />
                            <div className="border-b border-black dark:border-white w-full" />
                            <div className="border-b border-black dark:border-white w-full" />
                            <div className="w-full h-0" />
                          </div>

                          {/* Claimed baseline reference line if exists */}
                          {claimedBaseline && claimedBaseline > 0 && (
                            <div
                              className="absolute left-0 right-4 border-b-2 border-dashed border-blue-500 z-10 pointer-events-none flex items-center justify-end"
                              style={{ bottom: `${Math.min(95, Math.max(5, (claimedBaseline / maxEfficiencyChartValue) * 100))}%` }}
                            >
                              <span className="font-mono text-[8px] font-bold bg-blue-500 text-white px-1 py-0.2 rounded border border-black transform translate-y-[-50%]">
                                Claimed: {claimedBaseline}
                              </span>
                            </div>
                          )}

                          {/* Bars / Points container */}
                          <div className="w-full h-full flex justify-around items-end z-10 pt-6">
                            {efficiencyChartData.map((d) => {
                              const effVal = d.efficiency;
                              const effHeight = effVal != null ? (effVal / maxEfficiencyChartValue) * 100 : 0;

                              return (
                                <div key={d.month} className="flex flex-col items-center flex-1 h-full justify-end group relative">

                                  {/* Tooltip on Hover */}
                                  <div className="absolute top-[-24px] hidden group-hover:flex bg-black text-white text-[10px] font-mono p-1 border border-white z-20 whitespace-nowrap">
                                    {effVal != null ? `${effVal} ${unitStr}` : 'No full fills'}
                                  </div>

                                  <div className="w-8 sm:w-10 flex items-end justify-center h-full">
                                    {effVal != null ? (
                                      <motion.div
                                        onClick={() => setActiveEffChartData({ label: `${d.label}: Efficiency`, value: `${effVal} ${unitStr}` })}
                                        initial={{ height: 0 }}
                                        animate={{ height: `${Math.max(effHeight, 4)}%` }}
                                        transition={{ duration: 0.4, ease: 'easeOut' }}
                                        className="w-6 bg-blue-400 border-2 border-black hover:bg-blue-500 transition-colors cursor-pointer flex items-start justify-center pt-0.5"
                                      >
                                        <span className="font-mono text-[8px] font-bold text-black drop-shadow-sm leading-none">
                                          {effVal}
                                        </span>
                                      </motion.div>
                                    ) : (
                                      <div className="w-6 h-1 bg-gray-300 dark:bg-zinc-700 border border-black mb-0.5" title="No measured full fills" />
                                    )}
                                  </div>

                                  <span className="font-display font-bold text-xs text-black dark:text-white mt-2 shrink-0">{d.label}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-center gap-4 mt-4 font-mono text-[11px] font-bold">
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 bg-blue-400 border border-black" />
                          <span>EFFICIENCY ({unitStr})</span>
                        </div>
                        {claimedBaseline && (
                          <div className="flex items-center gap-1.5">
                            <span className="w-3 h-0.5 border-b-2 border-dashed border-blue-500" />
                            <span>CLAIMED ({claimedBaseline})</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })()}

        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 3: LIFETIME AGGREGATES
          ═══════════════════════════════════════════════════════════════ */}
      {(() => {
        const isCollapsed = collapsedCards['card-lifetime'];
        return (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="flex flex-col gap-2"
          >
            {/* Section header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-purple-500 border border-black rounded-full" />
                <h3 className="font-display font-black text-sm uppercase tracking-wider">Lifetime Aggregates</h3>
              </div>
              <button
                onClick={() => toggleCardCollapse('card-lifetime')}
                className="p-1 border-2 border-black dark:border-white bg-white dark:bg-neo-dark-card hover:bg-neo-accent/20 cursor-pointer transition-colors"
                title={isCollapsed ? "Expand section" : "Collapse section"}
              >
                {isCollapsed ? <ChevronDown className="w-4 h-4 text-black dark:text-white" /> : <ChevronUp className="w-4 h-4 text-black dark:text-white" />}
              </button>
            </div>

            <AnimatePresence initial={false}>
              {!isCollapsed && (
                <motion.div
                  key="lifetime-body"
                  initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
                  animate={{ opacity: 1, height: 'auto', transitionEnd: { overflow: 'visible' } }}
                  exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="flex flex-col gap-2"
                >
                  {/* Total Lifetime Spend — Hero Card */}
                  <div className="bg-black dark:bg-neutral-900 border-2 border-black dark:border dark:border-white p-5 neo-shadow dark:neo-shadow-dark flex flex-col gap-4">
                    <div className="w-full text-center">
                      <div className="font-display font-bold text-xs sm:text-sm tracking-wider text-gray-400 uppercase mb-1">Total Lifetime Spent</div>
                      <div className="font-mono font-black text-4xl sm:text-5xl tracking-tight text-white">
                        {formatCurrency(lifetimeTotalSpend, currency)}
                      </div>
                    </div>
                    <div className="flex items-center justify-center gap-3 shrink-0">
                      <div className="text-center">
                        <div className="font-mono font-black text-sm sm:text-lg text-neo-accent">{formatCurrency(lifetimeFuelCost, currency)}</div>
                        <div className="font-sans text-[10px] text-gray-400 uppercase">Fuel</div>
                      </div>
                      <div className="w-px h-8 bg-gray-700 mx-2" />
                      <div className="text-center">
                        <div className="font-mono font-black text-sm sm:text-lg text-neo-accent-yellow">{formatCurrency(lifetimeOtherCost, currency)}</div>
                        <div className="font-sans text-[10px] text-gray-400 uppercase">Other</div>
                      </div>
                    </div>
                  </div>

                  {/* Lifetime Summary Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                    {/* Total Fill-ups */}
                    <div className="relative bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-3.5 sm:p-5 neo-shadow dark:neo-shadow-dark flex flex-col justify-between gap-2">
                      <div className="pr-10 sm:pr-16">
                        <div className="font-display font-bold text-[11px] sm:text-sm tracking-wider text-gray-400 uppercase mb-1">TOTAL FILL-UPS</div>
                        <div className="font-mono font-black text-xl sm:text-[26px] tracking-tight text-black dark:text-white">
                          {lifetimeFillUps}
                        </div>
                        <div className="font-sans text-[11px] sm:text-[13px] text-gray-400 mt-1">Fuel logs recorded</div>
                      </div>
                      <div className="absolute top-3.5 right-3.5 sm:top-5 sm:right-5 p-2 sm:p-3 bg-neo-accent border-2 border-black text-black neo-shadow-sm shrink-0">
                        <Fuel className="w-4 h-4 sm:w-6 sm:h-6" />
                      </div>
                    </div>

                    {/* Avg Fuel Cost per Fill-up */}
                    <div className="relative bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-3.5 sm:p-5 neo-shadow dark:neo-shadow-dark flex flex-col justify-between gap-2">
                      <div className="pr-10 sm:pr-16">
                        <div className="font-display font-bold text-[11px] sm:text-sm tracking-wider text-gray-400 uppercase mb-1">AVG FUEL COST / FILL</div>
                        <div className="font-mono font-black text-xl sm:text-[26px] tracking-tight text-black dark:text-white">
                          {formatCurrency(lifetimeFillUps > 0 ? lifetimeFuelCost / lifetimeFillUps : 0, currency)}
                        </div>
                        <div className="font-sans text-[11px] sm:text-[13px] text-gray-400 mt-1">Per fill-up average</div>
                      </div>
                      <div className="absolute top-3.5 right-3.5 sm:top-5 sm:right-5 p-2 sm:p-3 bg-neo-accent-yellow border-2 border-black text-black neo-shadow-sm shrink-0">
                        <Coins className="w-4 h-4 sm:w-6 sm:h-6" />
                      </div>
                    </div>

                    {/* Total Distance */}
                    <div className="relative bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-3.5 sm:p-5 neo-shadow dark:neo-shadow-dark flex flex-col justify-between gap-2">
                      <div className="pr-10 sm:pr-16">
                        <div className="font-display font-bold text-[11px] sm:text-sm tracking-wider text-gray-400 uppercase mb-1">LIFETIME DISTANCE</div>
                        <div className="font-mono font-black text-xl sm:text-[26px] tracking-tight text-black dark:text-white">
                          {formatNumber(lifetimeDistance, 0)} <span className="text-[12px] sm:text-base font-bold text-gray-400">KM</span>
                        </div>
                        <div className="font-sans text-[11px] sm:text-[13px] text-gray-400 mt-1">Across all logged trips</div>
                      </div>
                      <div className="absolute top-3.5 right-3.5 sm:top-5 sm:right-5 p-2 sm:p-3 bg-neo-accent-green border-2 border-black text-black neo-shadow-sm shrink-0">
                        <Compass className="w-4 h-4 sm:w-6 sm:h-6" />
                      </div>
                    </div>

                    {/* Total Trips */}
                    <div className="relative bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-3.5 sm:p-5 neo-shadow dark:neo-shadow-dark flex flex-col justify-between gap-2">
                      <div className="pr-10 sm:pr-16">
                        <div className="font-display font-bold text-[11px] sm:text-sm tracking-wider text-gray-400 uppercase mb-1">TRIPS COMPLETED</div>
                        <div className="font-mono font-black text-xl sm:text-[26px] tracking-tight text-black dark:text-white">
                          {lifetimeTrips}
                        </div>
                        <div className="font-sans text-[11px] sm:text-[13px] text-gray-400 mt-1">Finished journeys</div>
                      </div>
                      <div className="absolute top-3.5 right-3.5 sm:top-5 sm:right-5 p-2 sm:p-3 bg-blue-400 border-2 border-black text-black neo-shadow-sm shrink-0">
                        <Navigation className="w-4 h-4 sm:w-6 sm:h-6" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })()}

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 4: MAINTENANCE
          ═══════════════════════════════════════════════════════════════ */}
      {(() => {
        const isCollapsed = collapsedCards['card-maintenance'];
        return (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.25 }}
            className="flex flex-col gap-2"
          >
            {/* Section header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-orange-500 border border-black rounded-full" />
                <h3 className="font-display font-black text-sm uppercase tracking-wider">Maintenance</h3>
              </div>
              <button
                onClick={() => toggleCardCollapse('card-maintenance')}
                className="p-1 border-2 border-black dark:border-white bg-white dark:bg-neo-dark-card hover:bg-neo-accent/20 cursor-pointer transition-colors"
                title={isCollapsed ? "Expand section" : "Collapse section"}
              >
                {isCollapsed ? <ChevronDown className="w-4 h-4 text-black dark:text-white" /> : <ChevronUp className="w-4 h-4 text-black dark:text-white" />}
              </button>
            </div>

            <AnimatePresence initial={false}>
              {!isCollapsed && (
                <motion.div
                  key="maintenance-body"
                  initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
                  animate={{ opacity: 1, height: 'auto', transitionEnd: { overflow: 'visible' } }}
                  exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                >
                  <div 
                    onClick={onOpenGarage}
                    className="bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-5 neo-shadow dark:neo-shadow-dark cursor-pointer hover:bg-neo-accent/5 active:translate-y-[2px] active:shadow-none transition-all"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpenGarage?.(); }}
                    title="Click to open Garage and manage maintenance schedules"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-display font-black text-lg uppercase tracking-wider">Maintenance Tracker</h3>
                      <Wrench className="w-5 h-5 text-neo-accent" />
                    </div>
                    <p className="font-sans text-xs text-gray-400 mb-4">
                      Monitoring all maintenance schedules across your fleet (Click card to open Garage)
                    </p>

                    <div className="flex flex-col gap-4 overflow-y-auto max-h-[300px] pr-2">
                      {maintenanceAlertsList.map(({ vehicle, alerts }) => (
                        <div key={vehicle.id} className="border-2 border-black dark:border dark:border-white p-3 bg-neo-bg dark:bg-neo-dark-bg">
                          <div className="font-display font-bold text-sm text-black dark:text-white mb-2 pb-1 border-b border-black/10 dark:border-white/10 uppercase">
                            {vehicle.name}
                          </div>

                          {/* Summary badges */}
                          <div className="flex gap-2 mb-2">
                            {alerts.summary.ok > 0 && (
                              <span className="px-2 py-0.5 bg-green-400 text-black text-[10px] font-bold border-2 border-black">{alerts.summary.ok} OK</span>
                            )}
                            {alerts.summary.dueSoon > 0 && (
                              <span className="px-2 py-0.5 bg-yellow-400 text-black text-[10px] font-bold border-2 border-black">{alerts.summary.dueSoon} Due Soon</span>
                            )}
                            {alerts.summary.overdue > 0 && (
                              <span className="px-2 py-0.5 bg-red-400 text-black text-[10px] font-bold border-2 border-black animate-pulse">{alerts.summary.overdue} Overdue</span>
                            )}
                          </div>

                          <div className="flex flex-col gap-2">
                            {alerts.items
                              .filter(item => item.status === 'Overdue')
                              .map((item, idx) => (
                                <div
                                  key={idx}
                                  className={`border-2 border-black p-2 flex items-center justify-between gap-2 maint-item-row status-${item.status.toLowerCase().replace(' ', '-')} ${item.bgColor}`}
                                >
                                  <div className="flex-1 min-w-0">
                                    <span className="font-display font-bold text-[10px] text-black uppercase leading-tight block truncate maint-item-label">{item.label}</span>
                                    <span className="text-[9px] font-mono text-black/70 block truncate maint-item-subtext">{item.subText}</span>
                                  </div>
                                  <span className={`px-1.5 py-0.5 border-2 border-black text-[9px] font-bold uppercase rounded leading-none shrink-0 maint-item-status-badge ${
                                    item.status === 'OK' ? 'bg-green-400 text-black' :
                                    item.status === 'Due Soon' ? 'bg-yellow-400 text-black' : 'bg-red-400 text-black animate-pulse'
                                  }`}>
                                    {item.status}
                                  </span>
                                </div>
                              ))}
                            {alerts.items.filter(item => item.status === 'Overdue').length === 0 && (
                              <div className="p-2 border-2 border-black bg-green-100 text-center">
                                <span className="font-display font-bold text-[10px] text-green-800 uppercase">
                                  {alerts.summary.dueSoon > 0 ? `Nothing overdue — ${alerts.summary.dueSoon} due soon` : 'Nothing overdue'}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="font-sans text-[10px] text-gray-400 mt-3">
                      Showing overdue items only. Full schedules (including "Due Soon") are in the Garage tab — tap any item there to edit its interval.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })()}

    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Vehicle, FuelLog, Trip, Expense, AppSettings } from '../types';
import { 
  getLocalDateString, 
  parseLocalDate, 
  formatCurrency, 
  formatNumber, 
  formatDate,
  getYearMonth 
} from '../utils';
import { 
  ArrowLeft, 
  TrendingUp, 
  TrendingDown, 
  Fuel, 
  Milestone, 
  CreditCard, 
  Clock, 
  Compass, 
  PieChart, 
  Activity, 
  Car, 
  BarChart3,
  Calendar,
  Layers,
  Sparkles
} from 'lucide-react';

interface AnalyticsProps {
  vehicles: Vehicle[];
  fuelLogs: FuelLog[];
  trips: Trip[];
  expenses: Expense[];
  currency: string;
  selectedVehicleId: string | 'all';
  settings: AppSettings;
  onBackToDashboard: () => void;
}

type TimeRangeOption = '7' | '14' | '30' | '90' | 'ytd' | 'all' | 'custom';

export default function Analytics({
  vehicles,
  fuelLogs,
  trips,
  expenses,
  currency,
  selectedVehicleId,
  settings,
  onBackToDashboard
}: AnalyticsProps) {
  const [timeRange, setTimeRange] = useState<TimeRangeOption>('30');
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return getLocalDateString(d);
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    return getLocalDateString(new Date());
  });

  // Helper to filter data by selected vehicle
  const filterByVehicle = (item: { vehicleId: string }) => {
    return selectedVehicleId === 'all' || item.vehicleId === selectedVehicleId;
  };

  // Helper to verify if date is within last N days
  const isWithinLastNDays = (dateStr: string, n: number) => {
    try {
      const d = parseLocalDate(dateStr);
      const today = new Date();
      const itemTime = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const todayTime = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
      const diffDays = Math.floor((todayTime - itemTime) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays < n;
    } catch {
      return false;
    }
  };

  // Helper to check if date is within calendar Year-to-Date
  const isYTD = (dateStr: string) => {
    try {
      const d = parseLocalDate(dateStr);
      const today = new Date();
      return d.getFullYear() === today.getFullYear() && d.getTime() <= today.getTime();
    } catch {
      return false;
    }
  };

  // Filter logs by selected time range
  const filterByTimeRange = (dateStr: string) => {
    if (timeRange === 'all') return true;
    if (timeRange === 'custom') {
      return dateStr >= customStartDate && dateStr <= customEndDate;
    }
    if (timeRange === 'ytd') return isYTD(dateStr);
    const days = parseInt(timeRange);
    return isWithinLastNDays(dateStr, days);
  };

  // Active Logs
  const activeFuelLogs = fuelLogs.filter(l => filterByVehicle(l) && filterByTimeRange(l.date));
  const activeExpenses = expenses.filter(e => filterByVehicle(e) && filterByTimeRange(e.date));
  const activeTrips = trips.filter(t => filterByVehicle(t) && t.status === 'completed' && filterByTimeRange(t.startDate));

  // Compute stats
  const totalSpend = activeFuelLogs.reduce((sum, l) => sum + l.cost, 0) + activeExpenses.reduce((sum, e) => sum + e.cost, 0);
  const totalFuelCost = activeFuelLogs.reduce((sum, l) => sum + l.cost, 0);
  const totalExpenseCost = activeExpenses.reduce((sum, e) => sum + e.cost, 0);

  const totalFuelLitres = activeFuelLogs.reduce((sum, l) => sum + (l.litres || 0), 0);
  const averageFuelPrice = activeFuelLogs.length > 0
    ? activeFuelLogs.reduce((sum, l) => sum + (l.pricePerLitre || 0), 0) / activeFuelLogs.length
    : 0;

  const totalDistance = activeTrips.reduce((sum, t) => sum + Math.max(0, (t.endOdo || 0) - t.startOdo), 0);
  const totalTripsCount = activeTrips.length;
  const totalRefuelsCount = activeFuelLogs.length;

  // Average Fuel Efficiency across logs (L/100km or km/L depending on preferences)
  // Let's compute average km/L: Sum of fuel logs with distance / Sum of litres
  // For precise efficiency, let's find logs where partialFill !== true
  const efficiencyLogs = activeFuelLogs.filter(l => l.mileageSinceLast !== undefined && l.mileageSinceLast > 0);
  const averageEfficiency = efficiencyLogs.length > 0
    ? efficiencyLogs.reduce((sum, l) => sum + (l.mileageSinceLast || 0), 0) / efficiencyLogs.length
    : null;

  // Calculate comparisons vs previous range (for percentage change)
  const getPrevPeriodCost = () => {
    if (timeRange === 'all' || timeRange === 'ytd') return null;

    if (timeRange === 'custom') {
      try {
        const dStart = parseLocalDate(customStartDate);
        const dEnd = parseLocalDate(customEndDate);
        const diffMs = dEnd.getTime() - dStart.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;

        const prevStart = new Date(dStart);
        prevStart.setDate(prevStart.getDate() - diffDays);
        const prevEnd = new Date(dStart);
        prevEnd.setDate(prevEnd.getDate() - 1);

        const prevStartStr = getLocalDateString(prevStart);
        const prevEndStr = getLocalDateString(prevEnd);

        const prevFuelCost = fuelLogs
          .filter(l => filterByVehicle(l) && l.date >= prevStartStr && l.date <= prevEndStr)
          .reduce((sum, l) => sum + l.cost, 0);

        const prevExpenseCost = expenses
          .filter(e => filterByVehicle(e) && e.date >= prevStartStr && e.date <= prevEndStr)
          .reduce((sum, e) => sum + e.cost, 0);

        return prevFuelCost + prevExpenseCost;
      } catch {
        return null;
      }
    }

    const days = parseInt(timeRange);
    
    const isWithinPreviousRange = (dateStr: string) => {
      try {
        const d = parseLocalDate(dateStr);
        const today = new Date();
        const itemTime = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const todayTime = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
        const diffDays = Math.floor((todayTime - itemTime) / (1000 * 60 * 60 * 24));
        return diffDays >= days && diffDays < 2 * days;
      } catch {
        return false;
      }
    };

    const prevFuelCost = fuelLogs
      .filter(l => filterByVehicle(l) && isWithinPreviousRange(l.date))
      .reduce((sum, l) => sum + l.cost, 0);

    const prevExpenseCost = expenses
      .filter(e => filterByVehicle(e) && isWithinPreviousRange(e.date))
      .reduce((sum, e) => sum + e.cost, 0);

    return prevFuelCost + prevExpenseCost;
  };

  const prevPeriodCost = getPrevPeriodCost();
  let spendChangePct = 0;
  if (prevPeriodCost !== null && prevPeriodCost > 0) {
    spendChangePct = Math.round(((totalSpend - prevPeriodCost) / prevPeriodCost) * 100);
  } else if (prevPeriodCost !== null && totalSpend > 0) {
    spendChangePct = 100;
  }

  // Get current time range dates string
  const getTimeRangeLabelString = () => {
    const today = new Date();
    if (timeRange === 'all') return 'All Time Record';
    if (timeRange === 'ytd') return `Jan 1, ${today.getFullYear()} - Today`;
    if (timeRange === 'custom') {
      try {
        const dStart = parseLocalDate(customStartDate);
        const dEnd = parseLocalDate(customEndDate);
        const startStr = dStart.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: dStart.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
        const endStr = dEnd.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
        return `${startStr} - ${endStr}`;
      } catch {
        return `${customStartDate} - ${customEndDate}`;
      }
    }
    
    const days = parseInt(timeRange);
    const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1));
    const startStr = startDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    const endStr = today.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${startStr} - ${endStr}`;
  };

  // Slice data for trends charts
  const getChartIntervals = () => {
    const intervals = [];
    const today = new Date();

    if (timeRange === 'custom') {
      try {
        const dStart = parseLocalDate(customStartDate);
        const dEnd = parseLocalDate(customEndDate);
        const diffMs = dEnd.getTime() - dStart.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;

        if (diffDays <= 14) {
          // Daily grouping
          for (let i = 0; i < diffDays; i++) {
            const d = new Date(dStart);
            d.setDate(d.getDate() + i);
            const dateStr = getLocalDateString(d);
            const label = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
            intervals.push({
              id: dateStr,
              label,
              dates: [dateStr],
            });
          }
        } else {
          // Dynamic interval block calculation: we want 5-6 interval blocks
          const blocksCount = 6;
          const daysPerBlock = Math.ceil(diffDays / blocksCount);
          for (let i = 0; i < blocksCount; i++) {
            const blockStartOffset = i * daysPerBlock;
            const blockEndOffset = Math.min((i + 1) * daysPerBlock - 1, diffDays - 1);
            
            if (blockStartOffset >= diffDays) break;

            const bStart = new Date(dStart);
            bStart.setDate(bStart.getDate() + blockStartOffset);
            const bEnd = new Date(dStart);
            bEnd.setDate(bStart.getDate() + (blockEndOffset - blockStartOffset));
            
            const datesInPeriod: string[] = [];
            const blockDaysCount = blockEndOffset - blockStartOffset + 1;
            for (let j = 0; j < blockDaysCount; j++) {
              const d = new Date(bStart);
              d.setDate(bStart.getDate() + j);
              datesInPeriod.push(getLocalDateString(d));
            }

            const label = `${bStart.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}-${bEnd.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`;
            intervals.push({
              id: `custom-period-${i}`,
              label,
              dates: datesInPeriod,
            });
          }
        }
      } catch {
        // Fallback
      }
      return intervals;
    }

    if (timeRange === '7' || timeRange === '14') {
      const days = parseInt(timeRange);
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
        const dateStr = getLocalDateString(d);
        const label = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
        intervals.push({
          id: dateStr,
          label,
          dates: [dateStr],
        });
      }
    } else if (timeRange === '30') {
      // 5 blocks of 6 days
      for (let i = 4; i >= 0; i--) {
        const startDayOffset = (i * 6) + 5;
        const endDayOffset = i * 6;
        const dStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - startDayOffset);
        const dEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() - endDayOffset);
        const datesInPeriod: string[] = [];
        for (let j = endDayOffset; j <= startDayOffset; j++) {
          const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - j);
          datesInPeriod.push(getLocalDateString(d));
        }
        const label = `${dStart.toLocaleDateString('en-US', { day: 'numeric' })}-${dEnd.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`;
        intervals.push({
          id: `period-${i}`,
          label,
          dates: datesInPeriod,
        });
      }
    } else if (timeRange === '90') {
      // 6 blocks of 15 days
      for (let i = 5; i >= 0; i--) {
        const startDayOffset = (i * 15) + 14;
        const endDayOffset = i * 15;
        const dStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - startDayOffset);
        const dEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() - endDayOffset);
        const datesInPeriod: string[] = [];
        for (let j = endDayOffset; j <= startDayOffset; j++) {
          const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - j);
          datesInPeriod.push(getLocalDateString(d));
        }
        const label = `${dStart.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}-${dEnd.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`;
        intervals.push({
          id: `period-90-${i}`,
          label,
          dates: datesInPeriod,
        });
      }
    } else if (timeRange === 'ytd') {
      // Monthly from Jan 1st of current year
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth(); // 0-11
      for (let m = 0; m <= currentMonth; m++) {
        const dStart = new Date(currentYear, m, 1);
        const dEnd = new Date(currentYear, m + 1, 0);
        const datesInPeriod: string[] = [];
        for (let d = 1; d <= dEnd.getDate(); d++) {
          datesInPeriod.push(getLocalDateString(new Date(currentYear, m, d)));
        }
        const label = dStart.toLocaleDateString('en-US', { month: 'short' });
        intervals.push({
          id: `ytd-month-${m}`,
          label,
          dates: datesInPeriod,
        });
      }
    } else {
      // All time - Group by last 12 months
      const months = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        months.push(d);
      }
      months.forEach((d, idx) => {
        const year = d.getFullYear();
        const month = d.getMonth();
        const dEnd = new Date(year, month + 1, 0);
        const datesInPeriod: string[] = [];
        for (let day = 1; day <= dEnd.getDate(); day++) {
          datesInPeriod.push(getLocalDateString(new Date(year, month, day)));
        }
        const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        intervals.push({
          id: `all-month-${idx}`,
          label,
          dates: datesInPeriod,
        });
      });
    }

    return intervals;
  };

  const chartIntervals = getChartIntervals();

  // Map metrics to intervals
  const chartData = chartIntervals.map(interval => {
    const fuelVal = fuelLogs
      .filter(l => filterByVehicle(l) && interval.dates.includes(l.date))
      .reduce((sum, l) => sum + l.cost, 0);

    const expenseVal = expenses
      .filter(e => filterByVehicle(e) && interval.dates.includes(e.date))
      .reduce((sum, e) => sum + e.cost, 0);

    const distVal = trips
      .filter(t => filterByVehicle(t) && t.status === 'completed' && interval.dates.includes(t.startDate))
      .reduce((sum, t) => sum + Math.max(0, (t.endOdo || 0) - t.startOdo), 0);

    return {
      label: interval.label,
      fuel: fuelVal,
      expenses: expenseVal,
      total: fuelVal + expenseVal,
      distance: distVal
    };
  });

  // Calculate visual scaling values for SVG Charts
  const maxTotalSpend = Math.max(...chartData.map(d => d.total), 1);
  const maxDistance = Math.max(...chartData.map(d => d.distance), 1);

  // Group costs by vehicles (for comparisons)
  const vehicleComparison = vehicles.map(v => {
    const vFuels = fuelLogs.filter(l => l.vehicleId === v.id && filterByTimeRange(l.date));
    const vExpenses = expenses.filter(e => e.vehicleId === v.id && filterByTimeRange(e.date));
    const vTrips = trips.filter(t => t.vehicleId === v.id && t.status === 'completed' && filterByTimeRange(t.startDate));

    const fCost = vFuels.reduce((sum, l) => sum + l.cost, 0);
    const eCost = vExpenses.reduce((sum, e) => sum + e.cost, 0);
    const totCost = fCost + eCost;

    const dist = vTrips.reduce((sum, t) => sum + Math.max(0, (t.endOdo || 0) - t.startOdo), 0);

    return {
      id: v.id,
      name: v.name,
      fuelCost: fCost,
      expenseCost: eCost,
      totalCost: totCost,
      distance: dist
    };
  }).filter(vc => vc.totalCost > 0 || vc.distance > 0);

  // Custom styled classes based on the Active Design Theme Style
  const style = settings.designStyle || 'neobrutalist';
  
  const containerClass = style === 'neobrutalist' 
    ? 'bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-2.5 sm:p-3 neo-shadow dark:neo-shadow-dark' 
    : style === 'refined'
    ? 'bg-white dark:bg-neo-dark-card border border-gray-200 dark:border-white/10 p-3 rounded-none shadow-sm'
    : style === 'material3'
    ? 'bg-[#f3edf7] dark:bg-[#25232a] p-3 rounded-2xl shadow-md'
    : 'bg-white dark:bg-neo-dark-card border border-gray-150 dark:border-white/5 p-3 rounded-xl shadow-lg';

  const titleClass = style === 'neobrutalist'
    ? 'font-display font-black text-xs sm:text-sm uppercase tracking-wider text-black dark:text-white leading-none'
    : 'font-sans font-semibold text-xs sm:text-sm tracking-wide text-gray-800 dark:text-gray-200 leading-none';

  const badgeClass = style === 'neobrutalist'
    ? 'border border-black dark:border dark:border-white px-2 py-0.5 text-[10px] font-mono uppercase bg-neo-accent text-black font-black leading-none'
    : style === 'refined'
    ? 'px-2 py-0.5 text-[10px] rounded font-medium bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 leading-none'
    : style === 'material3'
    ? 'px-2 py-0.5 text-[10px] rounded-full font-medium bg-[#e8def8] dark:bg-[#4f378b] text-[#21005d] dark:text-[#e8def8] leading-none'
    : 'px-2 py-0.5 text-[10px] rounded-md font-medium bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 leading-none';

  const subHeaderBorder = style === 'neobrutalist' ? 'border-b-2 border-black dark:border-b dark:border-white pb-2.5' : 'border-b border-gray-100 dark:border-zinc-800 pb-2.5';

  const switcherClass = style === 'neobrutalist'
    ? 'flex flex-wrap items-center bg-[#f0f0f0] dark:bg-zinc-800 p-0.5 border-2 border-black dark:border dark:border-white rounded-none self-start sm:self-center'
    : style === 'refined'
    ? 'flex flex-wrap items-center bg-gray-100 dark:bg-zinc-900/80 p-0.5 border border-gray-200 dark:border-zinc-800 rounded-lg self-start sm:self-center shadow-inner'
    : style === 'material3'
    ? 'flex flex-wrap items-center bg-[#f3edf7] dark:bg-[#1d1b20] p-0.5 rounded-full self-start sm:self-center border border-[#79747e]/35'
    : 'flex flex-wrap items-center bg-gray-100 dark:bg-zinc-900 p-0.5 border border-gray-200 dark:border-zinc-800 rounded-lg self-start sm:self-center';

  const customDateContainerClass = style === 'neobrutalist'
    ? 'flex flex-col sm:flex-row sm:items-center gap-2.5 p-2 bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white neo-shadow-sm dark:neo-shadow-dark-sm select-none -mt-1 sm:-mt-2 mb-1'
    : style === 'refined'
    ? 'flex flex-col sm:flex-row sm:items-center gap-2 p-2 bg-white dark:bg-neo-dark-card border border-gray-200 dark:border-white/10 rounded-none shadow-sm select-none -mt-1 sm:-mt-2 mb-1'
    : style === 'material3'
    ? 'flex flex-col sm:flex-row sm:items-center gap-2 p-2 bg-[#f7f2fa] dark:bg-[#25232a] rounded-2xl shadow-sm select-none -mt-1 sm:-mt-2 mb-1'
    : 'flex flex-col sm:flex-row sm:items-center gap-2 p-2 bg-white dark:bg-neo-dark-card border border-gray-150 dark:border-white/5 rounded-xl shadow-md select-none -mt-1 sm:-mt-2 mb-1';

  const customDateInputClass = style === 'neobrutalist'
    ? 'px-1.5 py-0.5 font-mono text-[10px] border border-black dark:border dark:border-white bg-white dark:bg-zinc-900 text-black dark:text-white focus:outline-none focus:bg-neo-accent/15'
    : 'px-1.5 py-0.5 font-sans text-[10px] rounded border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-black dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <div className="w-full flex flex-col gap-3 sm:gap-3.5 animate-fadeIn">
      {/* Back Button and Title Row */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 ${subHeaderBorder}`}>
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBackToDashboard}
            className={`p-2 cursor-pointer transition-all flex items-center justify-center shrink-0 ${
              style === 'neobrutalist'
                ? 'bg-neo-accent border-2 border-black dark:border dark:border-white text-black dark:text-white neo-shadow-sm dark:neo-shadow-dark-sm active:translate-y-[1px] active:shadow-none'
                : 'bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-full text-black dark:text-white'
            }`}
            aria-label="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className={`${
              style === 'neobrutalist'
                ? 'font-display font-black text-lg sm:text-xl uppercase tracking-wider'
                : 'font-sans font-bold text-lg sm:text-xl'
            }`}>
              Fleet Analytics
            </h1>
            <p className="font-sans text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 font-semibold flex items-center gap-1 mt-0.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>{getTimeRangeLabelString()}</span>
              {selectedVehicleId !== 'all' && (
                <span className={`px-1.5 py-0.5 text-[10px] uppercase font-bold leading-none ${
                  style === 'neobrutalist'
                    ? 'bg-neo-accent/20 text-black dark:text-white border border-black dark:border-white font-mono'
                    : style === 'refined'
                    ? 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 rounded font-sans'
                    : style === 'material3'
                    ? 'bg-[#e8def8] dark:bg-[#4f378b] text-[#21005d] dark:text-[#e8def8] rounded-full font-sans'
                    : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-md font-sans'
                }`}>
                  {vehicles.find(v => v.id === selectedVehicleId)?.name}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Dynamic Timerange Selector Switcher */}
        <div className={switcherClass}>
          {(['7', '14', '30', '90', 'ytd', 'all', 'custom'] as TimeRangeOption[]).map((option, index) => {
            const labels: Record<TimeRangeOption, string> = {
              '7': '7D',
              '14': '14D',
              '30': '30D',
              '90': '90D',
              'ytd': 'YTD',
              'all': 'All',
              'custom': 'Custom'
            };
            const isActive = timeRange === option;
            const buttonStyleClass = style === 'neobrutalist'
              ? `px-2 py-1 font-display font-black text-[10px] uppercase cursor-pointer transition-all leading-none ${
                  index !== 0 ? 'border-l-2 border-black dark:border-l dark:border-white' : ''
                } ${
                  isActive
                    ? 'bg-neo-accent text-black font-extrabold'
                    : 'bg-transparent text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white'
                }`
              : style === 'refined'
              ? `px-2.5 py-1 text-[10px] font-sans font-medium uppercase cursor-pointer transition-all leading-none rounded-md ${
                  isActive
                    ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-sm font-semibold'
                    : 'bg-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`
              : style === 'material3'
              ? `px-3 py-1 text-[10px] font-sans font-medium uppercase cursor-pointer transition-all leading-none rounded-full ${
                  isActive
                    ? 'bg-[#e8def8] dark:bg-[#4f378b] text-[#21005d] dark:text-[#e8def8] font-semibold'
                    : 'bg-transparent text-[#49454f] dark:text-[#cac4d0] hover:bg-[#cac4d0]/10'
                }`
              : `px-2.5 py-1 text-[10px] font-sans font-medium uppercase cursor-pointer transition-all leading-none rounded-md ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                    : 'bg-transparent text-gray-500 dark:text-gray-400 hover:text-gray-950'
                }`;

            return (
              <button
                key={option}
                type="button"
                onClick={() => setTimeRange(option)}
                className={buttonStyleClass}
              >
                {labels[option]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Date Inputs rendered beautifully when 'custom' is active */}
      {timeRange === 'custom' && (
        <div className={customDateContainerClass}>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 ${
              style === 'neobrutalist' ? 'font-display font-black' : 'font-sans font-semibold'
            }`}>From:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className={customDateInputClass}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 ${
              style === 'neobrutalist' ? 'font-display font-black' : 'font-sans font-semibold'
            }`}>To:</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className={customDateInputClass}
            />
          </div>
          <div className="text-[9px] text-gray-400 font-sans font-semibold sm:ml-auto">
            Interactive filtering matches fuel, trip & expense logs exactly
          </div>
        </div>
      )}

      {/* Main KPI Grid - 6 metrics cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-3">
        {/* Total Cost */}
        <div className={`${containerClass} relative flex flex-col justify-between overflow-hidden min-h-[75px] sm:min-h-[85px]`}>
          <div className="pr-7">
            <div className="font-display font-bold text-[9px] sm:text-[10px] tracking-wider text-gray-400 uppercase mb-0.5">Total Spending</div>
            <div className="font-mono font-black text-sm sm:text-lg tracking-tight text-black dark:text-white truncate">
              {formatCurrency(totalSpend, currency, 0)}
            </div>
            {spendChangePct !== 0 && prevPeriodCost !== null && (
              <div className="flex items-center gap-0.5 font-mono text-[8px] sm:text-[9px] mt-0.5 font-bold">
                {spendChangePct > 0 ? (
                  <span className="text-red-500 flex items-center">+{spendChangePct}% <TrendingUp className="w-2.5 h-2.5 ml-0.5" /></span>
                ) : (
                  <span className="text-green-500 flex items-center">{spendChangePct}% <TrendingDown className="w-2.5 h-2.5 ml-0.5" /></span>
                )}
                <span className="text-gray-400 font-normal">vs Prev</span>
              </div>
            )}
          </div>
          <div className={`absolute top-2 right-2 p-1 shrink-0 ${
            style === 'neobrutalist'
              ? 'bg-neo-accent border border-black text-black'
              : style === 'refined'
              ? 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 rounded'
              : style === 'material3'
              ? 'bg-[#e8def8] dark:bg-[#4f378b] text-[#21005d] dark:text-[#e8def8] rounded-full'
              : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-lg'
          }`}>
            <Compass className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Fuel Costs */}
        <div className={`${containerClass} relative flex flex-col justify-between overflow-hidden min-h-[75px] sm:min-h-[85px]`}>
          <div className="pr-7">
            <div className="font-display font-bold text-[9px] sm:text-[10px] tracking-wider text-gray-400 uppercase mb-0.5">Fuel Spending</div>
            <div className="font-mono font-black text-sm sm:text-lg tracking-tight text-black dark:text-white truncate">
              {formatCurrency(totalFuelCost, currency, 0)}
            </div>
            <div className="font-sans text-[8px] sm:text-[9px] text-gray-400 mt-0.5">
              {totalFuelLitres > 0 ? `${formatNumber(totalFuelLitres, 1)} L consumed` : '0 L consumed'}
            </div>
          </div>
          <div className={`absolute top-2 right-2 p-1 shrink-0 ${
            style === 'neobrutalist'
              ? 'bg-neo-accent-yellow border border-black text-black'
              : style === 'refined'
              ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 rounded'
              : style === 'material3'
              ? 'bg-[#ffe082] dark:bg-[#5d4037] text-[#3e2723] dark:text-[#ffe082] rounded-full'
              : 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-lg'
          }`}>
            <Fuel className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Expenses/Bills */}
        <div className={`${containerClass} relative flex flex-col justify-between overflow-hidden min-h-[75px] sm:min-h-[85px]`}>
          <div className="pr-7">
            <div className="font-display font-bold text-[9px] sm:text-[10px] tracking-wider text-gray-400 uppercase mb-0.5">Bills & Expenses</div>
            <div className="font-mono font-black text-sm sm:text-lg tracking-tight text-black dark:text-white truncate">
              {formatCurrency(totalExpenseCost, currency, 0)}
            </div>
            <div className="font-sans text-[8px] sm:text-[9px] text-gray-400 mt-0.5">
              {activeExpenses.length} records logged
            </div>
          </div>
          <div className={`absolute top-2 right-2 p-1 shrink-0 ${
            style === 'neobrutalist'
              ? 'bg-blue-300 border border-black text-black'
              : style === 'refined'
              ? 'bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 rounded'
              : style === 'material3'
              ? 'bg-[#bbdefb] dark:bg-[#0d47a1] text-[#0d47a1] dark:text-[#bbdefb] rounded-full'
              : 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 rounded-lg'
          }`}>
            <CreditCard className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Distance Driven */}
        <div className={`${containerClass} relative flex flex-col justify-between overflow-hidden min-h-[75px] sm:min-h-[85px]`}>
          <div className="pr-7">
            <div className="font-display font-bold text-[9px] sm:text-[10px] tracking-wider text-gray-400 uppercase mb-0.5">Distance Logged</div>
            <div className="font-mono font-black text-sm sm:text-lg tracking-tight text-black dark:text-white truncate">
              {formatNumber(totalDistance, 0)} <span className="text-[8px] sm:text-[9px] font-bold text-gray-400">KM</span>
            </div>
            <div className="font-sans text-[8px] sm:text-[9px] text-gray-400 mt-0.5">
              {totalTripsCount} trips completed
            </div>
          </div>
          <div className={`absolute top-2 right-2 p-1 shrink-0 ${
            style === 'neobrutalist'
              ? 'bg-neo-accent-green border border-black text-black'
              : style === 'refined'
              ? 'bg-green-50 dark:bg-green-950/20 text-green-600 dark:text-green-400 rounded'
              : style === 'material3'
              ? 'bg-[#c8e6c9] dark:bg-[#1b5e20] text-[#1b5e20] dark:text-[#c8e6c9] rounded-full'
              : 'bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 rounded-lg'
          }`}>
            <Milestone className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Average Fuel Efficiency */}
        <div className={`${containerClass} relative flex flex-col justify-between overflow-hidden min-h-[75px] sm:min-h-[85px]`}>
          <div className="pr-7">
            <div className="font-display font-bold text-[9px] sm:text-[10px] tracking-wider text-gray-400 uppercase mb-0.5">Avg Efficiency</div>
            <div className="font-mono font-black text-sm sm:text-lg tracking-tight text-black dark:text-white truncate">
              {averageEfficiency !== null ? `${formatNumber(averageEfficiency, 2)}` : '--'} <span className="text-[8px] sm:text-[9px] font-bold text-gray-400">KM/L</span>
            </div>
            <div className="font-sans text-[8px] sm:text-[9px] text-gray-400 mt-0.5">
              Based on {efficiencyLogs.length} full fills
            </div>
          </div>
          <div className={`absolute top-2 right-2 p-1 shrink-0 ${
            style === 'neobrutalist'
              ? 'bg-pink-300 border border-black text-black'
              : style === 'refined'
              ? 'bg-pink-50 dark:bg-pink-950/20 text-pink-600 dark:text-pink-400 rounded'
              : style === 'material3'
              ? 'bg-[#f8bbd0] dark:bg-[#880e4f] text-[#880e4f] dark:text-[#f8bbd0] rounded-full'
              : 'bg-pink-50 dark:bg-pink-950/30 text-pink-600 dark:text-pink-400 rounded-lg'
          }`}>
            <Activity className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Average Fuel Price */}
        <div className={`${containerClass} relative flex flex-col justify-between overflow-hidden min-h-[75px] sm:min-h-[85px]`}>
          <div className="pr-7">
            <div className="font-display font-bold text-[9px] sm:text-[10px] tracking-wider text-gray-400 uppercase mb-0.5">Avg Fuel Price</div>
            <div className="font-mono font-black text-sm sm:text-lg tracking-tight text-black dark:text-white truncate">
              {averageFuelPrice > 0 ? formatCurrency(averageFuelPrice, currency, 2) : '--'}
            </div>
            <div className="font-sans text-[8px] sm:text-[9px] text-gray-400 mt-0.5">
              Across {totalRefuelsCount} fillups
            </div>
          </div>
          <div className={`absolute top-2 right-2 p-1 shrink-0 ${
            style === 'neobrutalist'
              ? 'bg-purple-300 border border-black text-black'
              : style === 'refined'
              ? 'bg-purple-50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 rounded'
              : style === 'material3'
              ? 'bg-[#e1bee7] dark:bg-[#4a148c] text-[#4a148c] dark:text-[#e1bee7] rounded-full'
              : 'bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 rounded-lg'
          }`}>
            <Clock className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* Charts section: spending trends vs mileage trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-3.5">
        {/* Spending breakdown trend */}
        <div className={containerClass}>
          <div className="flex items-center justify-between mb-2.5 border-b border-black/10 dark:border-white/10 pb-1.5">
            <div className="flex items-center gap-1.5">
              <PieChart className="w-4 h-4 text-neo-accent shrink-0" />
              <h3 className={titleClass}>Spending Trends Breakdown</h3>
            </div>
            <span className={badgeClass}>Cost Profile</span>
          </div>

          <div className="w-full flex flex-col gap-2.5">
            {/* Custom Interactive SVG Stacked Bar Chart */}
            <div className={`w-full bg-[#faf9f6] dark:bg-zinc-900/30 p-2 relative ${
              style === 'neobrutalist'
                ? 'border-2 border-black dark:border dark:border-white'
                : `border border-black/10 dark:border-white/10 ${style === 'refined' ? 'rounded-none' : 'rounded-lg'}`
            }`}>
              {/* Y axis helper lines */}
              <div className="absolute left-8 sm:left-10 right-2 top-3 bottom-5 flex flex-col justify-between pointer-events-none opacity-25 dark:opacity-35">
                <div className="border-b border-black/15 dark:border-white/15 w-full" />
                <div className="border-b border-black/15 dark:border-white/15 w-full" />
                <div className="border-b border-black/15 dark:border-white/15 w-full" />
              </div>

              {/* Y axis labels */}
              <div className="absolute left-1 top-3 bottom-5 w-6 sm:w-8 flex flex-col justify-between pointer-events-none text-[8px] font-mono text-gray-400 dark:text-gray-500 text-right pr-1 leading-none">
                <div className="truncate">{formatCurrency(maxTotalSpend, currency, 0)}</div>
                <div className="truncate">{formatCurrency(maxTotalSpend / 2, currency, 0)}</div>
                <div>0</div>
              </div>

              {/* Chart container */}
              <div className="h-36 sm:h-44 w-full flex items-end justify-around gap-1.5 pb-1 pt-3 pl-8 sm:pl-10">
                {chartData.map((d, idx) => {
                  const fuelPct = d.total > 0 ? (d.fuel / maxTotalSpend) * 100 : 0;
                  const expPct = d.total > 0 ? (d.expenses / maxTotalSpend) * 100 : 0;

                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center group relative h-full justify-end pb-4">
                      {/* Tooltip on hover */}
                      <div className="absolute bottom-full mb-1 bg-black text-white p-1.5 font-mono text-[9px] sm:text-[10px] rounded border border-white/20 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20 pointer-events-none min-w-[110px] text-left">
                        <div className="font-sans font-bold text-neo-accent uppercase mb-0.5 text-[10px]">{d.label}</div>
                        <div className="flex justify-between gap-2"><span>Fuel:</span> <span>{formatCurrency(d.fuel, currency, 0)}</span></div>
                        <div className="flex justify-between gap-2"><span>Bills:</span> <span>{formatCurrency(d.expenses, currency, 0)}</span></div>
                        <div className="border-t border-white/20 mt-1 pt-1 flex justify-between font-bold text-white"><span>Total:</span> <span>{formatCurrency(d.total, currency, 0)}</span></div>
                      </div>

                      {/* Bar columns */}
                      <div className="w-full max-w-[20px] flex flex-col justify-end h-full">
                        {d.total > 0 ? (
                          <>
                            {/* Expenses Portion */}
                            <div 
                              style={{ height: `${expPct}%` }}
                              className={`w-full bg-blue-300 group-hover:bg-blue-400 transition-all ${
                                style === 'neobrutalist'
                                  ? `border-x border-black dark:border-x dark:border-white ${fuelPct === 0 ? 'border-t dark:border-t' : ''}`
                                  : 'rounded-t-[3px]'
                              }`}
                            />
                            {/* Fuel Portion */}
                            <div 
                              style={{ height: `${fuelPct}%` }}
                              className={`w-full bg-neo-accent-yellow group-hover:bg-neo-accent transition-all ${
                                style === 'neobrutalist'
                                  ? 'border-t border-x border-black dark:border-t dark:border-x dark:border-white'
                                  : expPct === 0 ? 'rounded-t-[3px]' : ''
                              }`}
                            />
                          </>
                        ) : (
                          <div className="h-0.5 bg-gray-300 dark:bg-zinc-700 w-full" />
                        )}
                      </div>

                      {/* Label */}
                      <span className={`absolute bottom-0 left-0 right-0 text-center text-[8px] font-mono tracking-tighter truncate text-gray-500 dark:text-gray-400 font-bold leading-none ${
                        chartData.length > 7 && idx % 2 !== 0 ? 'hidden md:block' : 'block'
                      }`}>
                        {d.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Legend indicators */}
            <div className={`flex items-center justify-center gap-4 text-[10px] sm:text-xs uppercase ${
              style === 'neobrutalist' ? 'font-display font-bold' : 'font-sans font-semibold text-gray-500'
            }`}>
              <div className="flex items-center gap-1.5 text-black dark:text-white">
                <span className={`w-3.5 h-3.5 bg-neo-accent-yellow ${
                  style === 'neobrutalist' ? 'border border-black dark:border dark:border-white' : 'rounded-sm'
                }`} />
                <span>Fuel Spent</span>
              </div>
              <div className="flex items-center gap-1.5 text-black dark:text-white">
                <span className={`w-3.5 h-3.5 bg-blue-300 ${
                  style === 'neobrutalist' ? 'border border-black dark:border dark:border-white' : 'rounded-sm'
                }`} />
                <span>Other Bills</span>
              </div>
            </div>
          </div>
        </div>

        {/* Mileage distance trend */}
        <div className={containerClass}>
          <div className="flex items-center justify-between mb-2.5 border-b border-black/10 dark:border-white/10 pb-1.5">
            <div className="flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-neo-accent-green shrink-0" />
              <h3 className={titleClass}>Mileage Trends (KM Driven)</h3>
            </div>
            <span className={badgeClass}>Travel Activity</span>
          </div>

          <div className="w-full flex flex-col gap-2.5">
            {/* Custom Interactive SVG Bar Chart */}
            <div className={`w-full bg-[#faf9f6] dark:bg-zinc-900/30 p-2 relative ${
              style === 'neobrutalist'
                ? 'border-2 border-black dark:border dark:border-white'
                : `border border-black/10 dark:border-white/10 ${style === 'refined' ? 'rounded-none' : 'rounded-lg'}`
            }`}>
              {/* Y axis helper lines */}
              <div className="absolute left-8 sm:left-10 right-2 top-3 bottom-5 flex flex-col justify-between pointer-events-none opacity-25 dark:opacity-35">
                <div className="border-b border-black/15 dark:border-white/15 w-full" />
                <div className="border-b border-black/15 dark:border-white/15 w-full" />
                <div className="border-b border-black/15 dark:border-white/15 w-full" />
              </div>

              {/* Y axis labels */}
              <div className="absolute left-1 top-3 bottom-5 w-6 sm:w-8 flex flex-col justify-between pointer-events-none text-[8px] font-mono text-gray-400 dark:text-gray-500 text-right pr-1 leading-none">
                <div className="truncate">{formatNumber(maxDistance, 0)}</div>
                <div className="truncate">{formatNumber(maxDistance / 2, 0)}</div>
                <div>0</div>
              </div>

              {/* Chart container */}
              <div className="h-36 sm:h-44 w-full flex items-end justify-around gap-1.5 pb-1 pt-3 pl-8 sm:pl-10">
                {chartData.map((d, idx) => {
                  const distPct = d.distance > 0 ? (d.distance / maxDistance) * 100 : 0;

                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center group relative h-full justify-end pb-4">
                      {/* Tooltip on hover */}
                      <div className="absolute bottom-full mb-1 bg-black text-white p-1.5 font-mono text-[9px] sm:text-[10px] rounded border border-white/20 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20 pointer-events-none min-w-[110px] text-left">
                        <div className="font-sans font-bold text-neo-accent uppercase mb-0.5 text-[10px]">{d.label}</div>
                        <div className="font-bold text-white font-mono text-[10px]">{formatNumber(d.distance, 0)} KM Driven</div>
                      </div>

                      {/* Bar columns */}
                      <div className="w-full max-w-[20px] flex flex-col justify-end h-full">
                        {d.distance > 0 ? (
                          <div 
                            style={{ height: `${distPct}%` }}
                            className={`w-full bg-neo-accent-green group-hover:bg-green-400 transition-all ${
                              style === 'neobrutalist'
                                ? 'border-2 border-black dark:border dark:border-white'
                                : 'rounded-t-[3px]'
                            }`}
                          />
                        ) : (
                          <div className="h-0.5 bg-gray-300 dark:bg-zinc-700 w-full" />
                        )}
                      </div>

                      {/* Label */}
                      <span className={`absolute bottom-0 left-0 right-0 text-center text-[8px] font-mono tracking-tighter truncate text-gray-500 dark:text-gray-400 font-bold leading-none ${
                        chartData.length > 7 && idx % 2 !== 0 ? 'hidden md:block' : 'block'
                      }`}>
                        {d.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Legend indicators */}
            <div className={`flex items-center justify-center gap-4 text-[10px] sm:text-xs uppercase ${
              style === 'neobrutalist' ? 'font-display font-bold' : 'font-sans font-semibold text-gray-500'
            }`}>
              <div className="flex items-center gap-1.5 text-black dark:text-white">
                <span className={`w-3.5 h-3.5 bg-neo-accent-green ${
                  style === 'neobrutalist' ? 'border border-black dark:border dark:border-white' : 'rounded-sm'
                }`} />
                <span>KM Logged</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Comparative Vehicle breakdown (rendered only if selectedVehicleId is 'all') */}
      {selectedVehicleId === 'all' && vehicleComparison.length > 0 && (
        <div className={containerClass}>
          <div className="flex items-center justify-between mb-2.5 border-b border-black/10 dark:border-white/10 pb-1.5">
            <div className="flex items-center gap-1.5">
              <Car className="w-4 h-4 text-purple-400 shrink-0" />
              <h3 className={titleClass}>Vehicle Comparative Share</h3>
            </div>
            <span className={badgeClass}>Efficiency Comparison</span>
          </div>

          <div className="w-full flex flex-col gap-2.5">
            {vehicleComparison.map(vc => {
              const costShare = totalSpend > 0 ? (vc.totalCost / totalSpend) * 100 : 0;
              const distanceShare = totalDistance > 0 ? (vc.distance / totalDistance) * 100 : 0;
              
              return (
                <div key={vc.id} className={`p-2 sm:p-2.5 bg-gray-50 dark:bg-zinc-900/30 ${
                  style === 'neobrutalist'
                    ? 'border-2 border-black dark:border dark:border-white'
                    : `border border-black/10 dark:border-white/10 ${style === 'refined' ? 'rounded-none' : 'rounded-lg'}`
                }`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-display font-black text-xs uppercase tracking-wide text-black dark:text-white">
                      {vc.name}
                    </span>
                    <span className="font-mono text-[10px] sm:text-xs text-gray-500">
                      Total: {formatCurrency(vc.totalCost, currency, 0)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {/* Spend Share progress bar */}
                    <div>
                      <div className="flex justify-between text-[9px] text-gray-400 mb-0.5 font-semibold">
                        <span>SPENDING SHARE</span>
                        <span>{formatNumber(costShare, 0)}%</span>
                      </div>
                      <div className={`w-full h-2.5 bg-gray-200 dark:bg-zinc-800 ${
                        style === 'neobrutalist' ? 'border-2 border-black dark:border dark:border-white' : 'rounded-full overflow-hidden'
                      }`}>
                        <div 
                          style={{ width: `${costShare}%` }}
                          className={`h-full bg-neo-accent ${
                            style === 'neobrutalist' ? 'border-r-2 border-black dark:border-r dark:border-white' : ''
                          }`}
                        />
                      </div>
                    </div>

                    {/* Distance Share progress bar */}
                    <div>
                      <div className="flex justify-between text-[9px] text-gray-400 mb-0.5 font-semibold">
                        <span>DISTANCE SHARE</span>
                        <span>{formatNumber(distanceShare, 0)}%</span>
                      </div>
                      <div className={`w-full h-2.5 bg-gray-200 dark:bg-zinc-800 ${
                        style === 'neobrutalist' ? 'border-2 border-black dark:border dark:border-white' : 'rounded-full overflow-hidden'
                      }`}>
                        <div 
                          style={{ width: `${distanceShare}%` }}
                          className={`h-full bg-neo-accent-green ${
                            style === 'neobrutalist' ? 'border-r-2 border-black dark:border-r dark:border-white' : ''
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Expense Categories Breakdown */}
      {activeExpenses.length > 0 && (
        <div className={containerClass}>
          <div className="flex items-center justify-between mb-2.5 border-b border-black/10 dark:border-white/10 pb-1.5">
            <div className="flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-blue-400 shrink-0" />
              <h3 className={titleClass}>Non-Fuel Expense Categories</h3>
            </div>
            <span className={badgeClass}>Category Shares</span>
          </div>

          <div className="w-full flex flex-col gap-2">
            {(() => {
              // Group expenses by category
              const cats: Record<string, number> = {};
              activeExpenses.forEach(e => {
                const c = e.category || 'Other';
                cats[c] = (cats[c] || 0) + e.cost;
              });

              // Sort categories by cost descending
              const sortedCats = Object.entries(cats).sort((a, b) => b[1] - a[1]);

              return sortedCats.map(([cat, cost]) => {
                const catShare = totalExpenseCost > 0 ? (cost / totalExpenseCost) * 100 : 0;
                return (
                  <div key={cat} className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between text-[11px] sm:text-xs font-bold uppercase font-display text-black dark:text-white">
                      <span>{cat}</span>
                      <span className="font-mono text-[10px] sm:text-[11px] text-gray-500">
                        {formatCurrency(cost, currency, 0)} ({formatNumber(catShare, 0)}%)
                      </span>
                    </div>
                    <div className={`w-full h-1.5 bg-gray-200 dark:bg-zinc-800 ${
                      style === 'neobrutalist' ? 'border border-black dark:border dark:border-white' : 'rounded-full overflow-hidden'
                    }`}>
                      <div 
                        style={{ width: `${catShare}%` }}
                        className={`h-full bg-blue-300 ${
                          style === 'neobrutalist' ? 'border-r border-black dark:border-r dark:border-white' : ''
                        }`}
                      />
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

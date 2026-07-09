/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Vehicle, Expense, ExpenseCategory } from '../types';
import { dbAPI } from '../db';
import { formatDate, formatCurrency } from '../utils';
import ConfirmModal from './ConfirmModal';
import NeoModal from './NeoModal';
import { useToast } from './ToastContext';
import NeoDropdown from './NeoDropdown';
import {
  Plus,
  Trash2,
  Coins,
  Filter,
  Receipt,
  CreditCard,
  Calendar,
  Tag,
  Edit2
} from 'lucide-react';

interface ExpensesProps {
  vehicles: Vehicle[];
  expenses: Expense[];
  selectedVehicleId: string | 'all';
  currency: string;
  onExpenseAdded: () => void;
  onExpenseDeleted: (id: string) => void;
  pendingAddModal?: 'fuel' | 'trips' | 'expenses' | null;
  onEditExpense?: (expense: Expense) => void;
  onAddClick?: () => void;
}

export default function ExpensesLog({
  vehicles,
  expenses,
  selectedVehicleId,
  currency,
  onExpenseAdded,
  onExpenseDeleted,
  pendingAddModal,
  onEditExpense,
  onAddClick
}: ExpensesProps) {
  const { showToast } = useToast();
  const vehicleOptions = vehicles.map(v => ({ value: v.id, label: v.name }));
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [isScrolled, setIsScrolled] = useState(false);

  // Track scroll to shrink pinned cards
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Open modal when triggered from Dashboard FAB
  useEffect(() => {
    if (pendingAddModal === 'expenses') {
      setIsModalOpen(true);
    }
  }, [pendingAddModal]);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [selectedExpenses, setSelectedExpenses] = useState<string[]>([]);

  // Form states
  const [formVehicleId, setFormVehicleId] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formCategory, setFormCategory] = useState<ExpenseCategory>('Toll');
  const [formCost, setFormCost] = useState('');
  const [formVendor, setFormVendor] = useState('');
  const [formOdometer, setFormOdometer] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Local Category Filter state
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<ExpenseCategory | 'all'>('all');

  // Categorized categories list
  const categories: ExpenseCategory[] = [
    'Toll', 'Parking', 'Repair', 'Service', 'Insurance', 'Tires', 'Battery', 'Accessory', 'Other'
  ];

  // Map category to vendor label & placeholder (Each category has its own vendor label!)
  const getVendorDetails = (cat: ExpenseCategory) => {
    switch (cat) {
      case 'Toll':
        return { label: 'Toll Expressway Plaza', placeholder: 'E.g., I-95 Toll booth, FastTag' };
      case 'Parking':
        return { label: 'Parking Lot / Meter', placeholder: 'E.g., Downtown Civic Garage, Lot 4' };
      case 'Repair':
        return { label: 'Mechanic Shop / Garage', placeholder: 'E.g., Apex Brake & Muffler Clinic' };
      case 'Service':
        return { label: 'Authorized Service Center', placeholder: 'E.g., Toyota Care Authorized' };
      case 'Insurance':
        return { label: 'Insurance Provider Corp', placeholder: 'E.g., Geico Auto Corp, Progressive' };
      case 'Tires':
        return { label: 'Tyre Fitment Center', placeholder: 'E.g., Michelin Fitment Outlet' };
      case 'Battery':
        return { label: 'Battery Vendor Shop', placeholder: 'E.g., Interstate Batteries Store' };
      case 'Accessory':
        return { label: 'Retailer / Accessory Shop', placeholder: 'E.g., AutoZone Store, Amazon Retail' };
      default:
        return { label: 'Vendor / Merchant Name', placeholder: 'E.g., General Store, Miscellaneous' };
    }
  };

  // Pre-fill / Reset Form
  useEffect(() => {
    if (isModalOpen) {
      if (editingExpense) {
        setFormVehicleId(editingExpense.vehicleId);
        setFormDate(editingExpense.date);
        setFormCategory(editingExpense.category);
        setFormCost(String(editingExpense.cost));
        setFormVendor(editingExpense.vendor || '');
        setFormOdometer(editingExpense.odometer !== null && editingExpense.odometer !== undefined ? String(editingExpense.odometer) : '');
        setFormNotes(editingExpense.notes || '');
      } else {
        const activeId = selectedVehicleId === 'all'
          ? (vehicles.length > 0 ? vehicles[0].id : '')
          : selectedVehicleId;
        const activeVehicle = vehicles.find(v => v.id === activeId);

        setFormVehicleId(activeId);
        setFormDate(new Date().toISOString().split('T')[0]);
        setFormCategory('Toll');
        setFormCost('');
        setFormVendor('');
        setFormOdometer(activeVehicle && activeVehicle.odometer > 0 ? String(activeVehicle.odometer) : '');
        setFormNotes('');
      }
    }
  }, [isModalOpen, editingExpense, selectedVehicleId, vehicles]);

  // Adjust placeholder vendor when category changes
  const vendorConfig = getVendorDetails(formCategory);

  // Month / Year filter options
  const monthOptions = [
    { value: 'all', label: 'All Months' },
    { value: '01', label: 'Jan' },
    { value: '02', label: 'Feb' },
    { value: '03', label: 'Mar' },
    { value: '04', label: 'Apr' },
    { value: '05', label: 'May' },
    { value: '06', label: 'Jun' },
    { value: '07', label: 'Jul' },
    { value: '08', label: 'Aug' },
    { value: '09', label: 'Sep' },
    { value: '10', label: 'Oct' },
    { value: '11', label: 'Nov' },
    { value: '12', label: 'Dec' },
  ];
  const yearOptions = [
    { value: 'all', label: 'All Years' },
    ...Array.from(new Set(expenses.map(e => e.date.slice(0, 4))))
      .sort((a, b) => b.localeCompare(a))
      .map(y => ({ value: y, label: y })),
  ];

  // Filtered expenses list
  const filteredExpenses = expenses
    .filter(e => {
      const matchVehicle = selectedVehicleId === 'all' ? true : e.vehicleId === selectedVehicleId;
      const matchCategory = selectedCategoryFilter === 'all' ? true : e.category === selectedCategoryFilter;
      return matchVehicle && matchCategory;
    })
    .filter(e => selectedMonth === 'all' ? true : e.date.slice(5, 7) === selectedMonth)
    .filter(e => selectedYear === 'all' ? true : e.date.slice(0, 4) === selectedYear)
    .sort((a, b) => {
      const cmp = new Date(b.date).getTime() - new Date(a.date).getTime();
      return sortOrder === 'newest' ? cmp : -cmp;
    });

  const totalExpenseCost = filteredExpenses.reduce((sum, e) => sum + e.cost, 0);

  // Save non-fuel expense
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formVehicleId || !formDate || !formCategory || !formCost || !formVendor) {
      alert('Please fill out all required fields.');
      return;
    }

    const odoNum = formOdometer ? parseFloat(formOdometer) : null;
    const costNum = parseFloat(formCost);

    const activeVehicle = vehicles.find(v => v.id === formVehicleId);
    // Only warn about lower odometer for current/future expenses; skip for historical backfill
    const today = new Date().toISOString().split('T')[0];
    if (odoNum !== null && activeVehicle && formDate >= today && odoNum < activeVehicle.odometer) {
      const confirmLower = window.confirm(
        `Note: The entered odometer (${odoNum} km) is lower than the current vehicle odometer (${activeVehicle.odometer} km). Do you want to proceed?`
      );
      if (!confirmLower) return;
    }

    const newExpense: Expense = {
      id: editingExpense ? editingExpense.id : `e-${Date.now()}`,
      vehicleId: formVehicleId,
      date: formDate,
      category: formCategory,
      cost: costNum,
      vendor: formVendor,
      odometer: odoNum,
      notes: formNotes
    };

    await dbAPI.saveExpense(newExpense);

    showToast(
      editingExpense
        ? 'Expense record updated successfully!'
        : 'Expense logged successfully!',
      'success'
    );

    setEditingExpense(null);
    setIsModalOpen(false);
    onExpenseAdded();
  };

  const getVehicleName = (id: string) => {
    return vehicles.find(v => v.id === id)?.name || 'Unknown';
  };

  const getCategoryColor = (cat: ExpenseCategory) => {
    switch (cat) {
      case 'Service': return 'bg-blue-300 text-black border-blue-400';
      case 'Repair': return 'bg-red-300 text-black border-red-400';
      case 'Tires': return 'bg-amber-300 text-black border-amber-400';
      case 'Battery': return 'bg-emerald-300 text-black border-emerald-400';
      case 'Insurance': return 'bg-purple-300 text-black border-purple-400';
      case 'Toll': return 'bg-sky-300 text-black border-sky-400';
      case 'Parking': return 'bg-gray-300 text-black border-gray-400';
      case 'Accessory': return 'bg-pink-300 text-black border-pink-400';
      default: return 'bg-neo-accent text-black border-orange-400';
    }
  };

  const toggleSelectExpense = (id: string) => {
    setSelectedExpenses(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = () => {
    if (selectedExpenses.length === 0) return;
    setDeleteConfirmId('bulk');
    setIsConfirmOpen(true);
  };

  const selectAll = () => {
    setSelectedExpenses(filteredExpenses.map(e => e.id));
  };

  const selectNone = () => {
    setSelectedExpenses([]);
  };

  return (
    <div className="w-full flex flex-col gap-4 select-none">

      {/* Sticky Header + Controls Wrapper */}
      <div className="sticky top-0 z-30 space-y-2">
        {/* Header Card */}
        <div className={`bg-neo-accent border-2 border-black neo-shadow transition-all duration-300 flex items-center justify-between ${isScrolled ? 'px-3 py-2' : 'px-5 py-3.5'}`}>
          <div className="flex items-center gap-2 shrink-0 min-w-0">
            <h2 className={`font-display font-black text-black uppercase tracking-wider transition-all ${isScrolled ? 'text-lg leading-none' : 'text-xl'}`}>Other Expenses</h2>
            <span className="bg-black text-white font-mono font-bold text-[9px] leading-none px-1.5 py-0.5 border border-black/50 shrink-0">
              {filteredExpenses.length} LOGS
            </span>
          </div>
          <span className={`font-mono font-black text-black bg-white border-2 border-black px-2 py-0.5 leading-none transition-all ${isScrolled ? 'text-xs' : 'text-sm'}`}>
            {formatCurrency(totalExpenseCost, currency)}
          </span>
        </div>
        {/* Controls Card */}
        <div className={`bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white neo-shadow dark:neo-shadow-dark transition-all duration-300 ${isScrolled ? 'p-2' : 'p-4'}`}>
          {selectedExpenses.length > 0 ? (
            <div className="flex flex-col gap-2">
              {/* Top row: Sort + Filters */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex border-2 border-black shrink-0">
                  <button
                    onClick={() => setSortOrder('newest')}
                    className={`px-3 py-2 font-display font-bold text-[10px] uppercase transition-colors cursor-pointer ${sortOrder === 'newest' ? 'bg-black text-white' : 'bg-white dark:bg-neo-dark-bg text-black dark:text-white hover:bg-black/5'}`}
                  >
                    NEWEST
                  </button>
                  <button
                    onClick={() => setSortOrder('oldest')}
                    className={`px-3 py-2 font-display font-bold text-[10px] uppercase transition-colors cursor-pointer border-l-2 border-black ${sortOrder === 'oldest' ? 'bg-black text-white' : 'bg-white dark:bg-neo-dark-bg text-black dark:text-white hover:bg-black/5'}`}
                  >
                    OLDEST
                  </button>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <NeoDropdown
                    id="expense-filter-month"
                    value={selectedMonth}
                    onChange={setSelectedMonth}
                    options={monthOptions}
                    compact
                    className="w-24"
                  />
                  <NeoDropdown
                    id="expense-filter-year"
                    value={selectedYear}
                    onChange={setSelectedYear}
                    options={yearOptions}
                    compact
                    className="w-24"
                  />
                </div>
              </div>

              {/* Bottom row: Selection controls */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedExpenses(filteredExpenses.map(e => e.id))}
                    className="px-2.5 py-1.5 bg-black text-white font-display font-bold text-[10px] uppercase border-2 border-black hover:bg-gray-800 neo-shadow-sm active:translate-x-[1px] active:translate-y-[1px] cursor-pointer"
                  >
                    SELECT ALL
                  </button>
                  <button
                    onClick={() => setSelectedExpenses([])}
                    className="px-2.5 py-1.5 bg-white dark:bg-neo-dark-bg text-black dark:text-white font-display font-bold text-[10px] uppercase border-2 border-black hover:bg-gray-100 dark:hover:bg-zinc-800 neo-shadow-sm active:translate-x-[1px] active:translate-y-[1px] cursor-pointer"
                  >
                    SELECT NONE
                  </button>
                  <span className="font-mono text-[10px] text-gray-500 font-bold">
                    {selectedExpenses.length} SELECTED
                  </span>
                </div>
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-red-400 text-black font-display font-black text-xs uppercase border-2 border-black hover:bg-red-500 neo-shadow-sm active:translate-x-[1px] active:translate-y-[1px] cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>DELETE ({selectedExpenses.length})</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex border-2 border-black shrink-0">
                <button
                  onClick={() => setSortOrder('newest')}
                  className={`px-3 py-2 font-display font-bold text-[10px] uppercase transition-colors cursor-pointer ${sortOrder === 'newest' ? 'bg-black text-white' : 'bg-white dark:bg-neo-dark-bg text-black dark:text-white hover:bg-black/5'}`}
                >
                  NEWEST
                </button>
                <button
                  onClick={() => setSortOrder('oldest')}
                  className={`px-3 py-2 font-display font-bold text-[10px] uppercase transition-colors cursor-pointer border-l-2 border-black ${sortOrder === 'oldest' ? 'bg-black text-white' : 'bg-white dark:bg-neo-dark-bg text-black dark:text-white hover:bg-black/5'}`}
                >
                  OLDEST
                </button>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <NeoDropdown
                  id="expense-filter-month"
                  value={selectedMonth}
                  onChange={setSelectedMonth}
                  options={monthOptions}
                  compact
                  className="w-24"
                />
                <NeoDropdown
                  id="expense-filter-year"
                  value={selectedYear}
                  onChange={setSelectedYear}
                  options={yearOptions}
                  compact
                  className="w-24"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Category Horizontal Filter Pills */}
      <div className="w-full bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-3 neo-shadow dark:neo-shadow-dark flex items-center gap-2 overflow-x-auto no-select scrollbar-none">
        <div className="flex items-center gap-1.5 text-xs font-display font-bold uppercase tracking-wider text-gray-400 shrink-0 border-r border-black/10 dark:border-white/10 pr-3 mr-1">
          <Filter className="w-4 h-4" />
          <span>Filter:</span>
        </div>
        <button
          id="btn-filter-cat-all"
          onClick={() => setSelectedCategoryFilter('all')}
          className={`px-3 py-1.5 border-2 border-black font-display font-bold text-xs uppercase cursor-pointer transition-all ${selectedCategoryFilter === 'all'
              ? 'bg-black text-white'
              : 'bg-white dark:bg-neo-dark-bg text-black dark:text-white hover:bg-black/5'
            }`}
        >
          ALL CATEGORIES
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            id={`btn-filter-cat-${cat.toLowerCase()}`}
            onClick={() => setSelectedCategoryFilter(cat)}
            className={`px-3 py-1.5 border-2 border-black font-display font-bold text-xs uppercase cursor-pointer whitespace-nowrap transition-all ${selectedCategoryFilter === cat
                ? 'bg-black text-white'
                : 'bg-white dark:bg-neo-dark-bg text-black dark:text-white hover:bg-black/5'
              }`}
          >
            {cat.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Expenses History logs */}
      {filteredExpenses.length === 0 ? (
        <div className="w-full bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-12 neo-shadow dark:neo-shadow-dark text-center py-16">
          <Coins className="w-12 h-12 text-gray-300 dark:text-gray-700 animate-pulse mx-auto mb-3" />
          <h3 className="font-display font-bold text-lg uppercase mb-1">No Non-Fuel Expenditures</h3>
          <p className="font-sans text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
            No entries match this vehicle or category filter. Log tolls, repairs, insurance, or batteries to keep an accurate ledger.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredExpenses.map(expense => (
            <div
              key={expense.id}
              className={`bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-2.5 sm:p-3 neo-shadow dark:neo-shadow-dark flex flex-col justify-between transition-colors ${selectedExpenses.includes(expense.id) ? 'bg-orange-50 dark:bg-orange-900/20' : ''}`}
            >
              <div>
                {/* Header tag */}
                <div className="flex items-start justify-between border-b border-black/10 dark:border-white/10 pb-1.5 mb-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedExpenses.includes(expense.id)}
                      onChange={() => toggleSelectExpense(expense.id)}
                      className="w-3.5 h-3.5 accent-neo-accent cursor-pointer rounded-sm border-2 border-black shrink-0"
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 border border-black text-[8px] font-extrabold uppercase rounded ${getCategoryColor(expense.category)}`}>
                        {expense.category}
                      </span>
                      <span className="font-display font-black text-[11px] sm:text-xs uppercase text-neo-accent">
                        {getVehicleName(expense.vehicleId)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      id={`btn-edit-expense-${expense.id}`}
                      onClick={() => {
                        setEditingExpense(expense);
                        setIsModalOpen(true);
                      }}
                      className="p-1 border border-black bg-blue-300 hover:bg-blue-400 text-black rounded neo-shadow-sm active:translate-y-[1px] cursor-pointer shrink-0 transition-colors"
                      title="Edit expense entry"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      id={`btn-delete-expense-${expense.id}`}
                      onClick={() => {
                        setDeleteConfirmId(expense.id);
                        setIsConfirmOpen(true);
                      }}
                      className="p-1 border border-black bg-red-400 hover:bg-red-500 text-black rounded neo-shadow-sm active:translate-y-[1px] cursor-pointer shrink-0 transition-colors"
                      title="Delete expense entry"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Vendor and Cost */}
                <div className="flex justify-between items-center gap-3 mb-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display font-bold text-xs sm:text-sm text-black dark:text-white uppercase leading-none truncate" title={expense.vendor}>
                      {expense.vendor}
                    </h3>
                    <div className="flex items-center gap-1 text-[9px] sm:text-[10px] text-gray-400 mt-1 font-mono leading-none">
                      <Calendar className="w-3 h-3" />
                      <span>{formatDate(expense.date)}</span>
                    </div>
                  </div>
                  <div className="px-1.5 py-0.5 bg-neo-bg dark:bg-zinc-800 border border-black font-mono font-black text-xs sm:text-sm text-black dark:text-white whitespace-nowrap rounded-sm">
                    {formatCurrency(expense.cost, currency)}
                  </div>
                </div>

                {/* Optional odometer info */}
                {expense.odometer && (
                  <div className="flex justify-between text-[10px] font-mono bg-neo-bg dark:bg-zinc-800/40 p-1 px-2 border border-black/10">
                    <span className="text-gray-400">Odometer Logged:</span>
                    <span className="font-bold">{expense.odometer.toLocaleString()} km</span>
                  </div>
                )}
              </div>

              {expense.notes && (
                <p className="mt-1.5 p-0.5 px-1.5 bg-yellow-50 dark:bg-zinc-800 text-black dark:text-gray-300 font-sans text-[10px] italic border-l-2 border-neo-accent-yellow max-w-full truncate">
                  "{expense.notes}"
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* MODAL: LOG NEW EXPENSE */}
      <NeoModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingExpense(null);
        }}
        title={editingExpense ? "Edit Expense Log" : "Log Other Expense"}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 font-sans text-black dark:text-white">

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Vehicle */}
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">Vehicle *</label>
              <NeoDropdown
                id="form-exp-vehicle"
                value={formVehicleId}
                onChange={(val) => setFormVehicleId(val)}
                options={vehicleOptions}
                className="w-full"
              />
            </div>

            {/* Category */}
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">Category *</label>
              <NeoDropdown
                id="form-exp-category"
                value={formCategory}
                onChange={(val) => setFormCategory(val as ExpenseCategory)}
                options={categories.map(cat => ({ value: cat, label: cat }))}
                className="w-full"
              />
            </div>

          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

            {/* Cost */}
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">Cost Amount ({currency}) *</label>
              <input
                type="number"
                step="any"
                id="form-exp-cost"
                value={formCost}
                onChange={(e) => setFormCost(e.target.value)}
                placeholder="45.00"
                required
                className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg font-mono focus:outline-none"
              />
            </div>

            {/* Date */}
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">Date *</label>
              <input
                type="date"
                id="form-exp-date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                required
                className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg font-mono focus:outline-none"
              />
            </div>

            {/* Odometer (Optional) */}
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider flex items-center gap-1">
                <span>Odometer (km)</span>
                <span className="text-[9px] text-gray-400 font-normal italic">Optional</span>
              </label>
              <input
                type="number"
                id="form-exp-odometer"
                value={formOdometer}
                onChange={(e) => setFormOdometer(e.target.value)}
                placeholder="E.g., current km"
                className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg font-mono focus:outline-none"
              />
            </div>

          </div>

          {/* Vendor Specific input label and placeholder */}
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider">
              {vendorConfig.label} *
            </label>
            <input
              type="text"
              id="form-exp-vendor"
              value={formVendor}
              onChange={(e) => setFormVendor(e.target.value)}
              placeholder={vendorConfig.placeholder}
              required
              className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg focus:outline-none font-semibold text-sm"
            />
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider">Expense Notes</label>
            <textarea
              id="form-exp-notes"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="Any comments, replacement descriptions, or receipt codes..."
              rows={2}
              className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg focus:outline-none resize-none text-sm"
            />
          </div>

          {/* Form Actions */}
          <div className="grid grid-cols-2 sm:flex sm:justify-end gap-3 border-t-2 border-black/10 dark:border-white/10 pt-4 mt-2">
            <button
              type="button"
              id="btn-exp-cancel"
              onClick={() => {
                setIsModalOpen(false);
                setEditingExpense(null);
              }}
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 border-2 border-black hover:bg-gray-100 dark:hover:bg-zinc-800 font-display font-bold text-xs uppercase active:translate-y-[1px] cursor-pointer text-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="btn-exp-submit"
              className="w-full sm:w-auto px-5 py-2.5 bg-neo-accent border-2 border-black font-display font-bold text-xs uppercase hover:bg-orange-600 neo-shadow-sm active:translate-y-[1px] cursor-pointer text-center"
            >
              Save Expense
            </button>
          </div>

        </form>
      </NeoModal>

      <ConfirmModal
        isOpen={isConfirmOpen}
        title={deleteConfirmId === 'bulk' ? "Delete Selected Expenses" : "Delete Expense"}
        message={deleteConfirmId === 'bulk' ? `Are you sure you want to delete ${selectedExpenses.length} selected expenses?` : "Are you sure you want to delete this expense entry? This action cannot be undone."}
        onConfirm={async () => {
          if (deleteConfirmId === 'bulk') {
            const count = selectedExpenses.length;
            for (const id of selectedExpenses) {
              await dbAPI.deleteExpense(id);
              onExpenseDeleted(id);
            }
            setSelectedExpenses([]);
            showToast(`Deleted ${count} selected expense records successfully.`, 'deleted');
          } else if (deleteConfirmId) {
            await dbAPI.deleteExpense(deleteConfirmId);
            onExpenseDeleted(deleteConfirmId);
            showToast('Expense record deleted.', 'deleted');
          }
          setDeleteConfirmId(null);
          setIsConfirmOpen(false);
        }}
        onCancel={() => {
          setDeleteConfirmId(null);
          setIsConfirmOpen(false);
        }}
      />

    </div>
  );
}

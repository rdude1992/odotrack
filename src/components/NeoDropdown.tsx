/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';

export interface NeoDropdownItem {
  value: string;
  label: string | React.ReactNode;
}

interface NeoDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: NeoDropdownItem[];
  placeholder?: string;
  className?: string;
  id?: string;
  compact?: boolean;
}

export default function NeoDropdown({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  className = '',
  id,
  compact = false,
}: NeoDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedLabel =
    options.find((o) => o.value === value)?.label ?? placeholder;

  const handleSelect = useCallback(
    (val: string) => {
      onChange(val);
      setIsOpen(false);
    },
    [onChange]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const py = compact ? 'py-1' : 'py-1.5';
  const px = compact ? 'px-2' : 'px-3';
  const textSize = compact ? 'text-[10px]' : 'text-xs';

  return (
    <div ref={containerRef} className={`relative ${className}`} id={id}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-2 ${px} ${py} border-2 border-black dark:border dark:border-white bg-white dark:bg-neo-dark-bg text-black dark:text-white font-semibold font-display uppercase tracking-wider ${textSize} focus:outline-none cursor-pointer neo-shadow-sm active:translate-y-[1px] transition-all`}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-neo-bg dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white neo-shadow-lg max-h-60 overflow-y-auto">
          {options.map((option) => (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => handleSelect(option.value)}
              className={`w-full text-left ${px} ${py} font-semibold font-display ${textSize} uppercase tracking-wider cursor-pointer transition-colors ${
                option.value === value
                  ? 'bg-black text-white'
                  : 'text-black dark:text-white hover:bg-black/10 dark:hover:bg-white/10'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, AlertOctagon, AlertTriangle, Info, Trash2, ScanLine } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'deleted' | 'scanned';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto-remove after 4 seconds
    setTimeout(() => {
      removeToast(id);
    }, 4000);
  }, [removeToast]);

  const getToastStyles = (type: ToastType) => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-neo-accent-green',
          text: 'text-black',
          icon: <CheckCircle2 className="w-5 h-5 shrink-0" />,
          label: 'Success'
        };
      case 'error':
        return {
          bg: 'bg-[#ff6b6b]', // coral red
          text: 'text-black',
          icon: <AlertOctagon className="w-5 h-5 shrink-0" />,
          label: 'Error'
        };
      case 'warning':
        return {
          bg: 'bg-neo-accent-yellow',
          text: 'text-black',
          icon: <AlertTriangle className="w-5 h-5 shrink-0" />,
          label: 'Warning'
        };
      case 'deleted':
        return {
          bg: 'bg-neo-accent', // orange
          text: 'text-black',
          icon: <Trash2 className="w-5 h-5 shrink-0" />,
          label: 'Deleted'
        };
      case 'scanned':
        return {
          bg: 'bg-emerald-300', // emerald green
          text: 'text-black',
          icon: <ScanLine className="w-5 h-5 shrink-0" />,
          label: 'OCR Scanned'
        };
      case 'info':
      default:
        return {
          bg: 'bg-sky-200',
          text: 'text-black',
          icon: <Info className="w-5 h-5 shrink-0" />,
          label: 'Info'
        };
    }
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      
      {/* Toast container */}
      <div 
        id="toast-container"
        className="fixed top-4 right-4 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      >
        <AnimatePresence>
          {toasts.map((toast) => {
            const styles = getToastStyles(toast.type);
            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: -30, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.15 } }}
                layout
                className={`pointer-events-auto w-full bg-white dark:bg-zinc-900 border-2 border-black dark:border dark:border-white p-3.5 neo-shadow dark:neo-shadow-dark flex gap-3 items-start select-none relative overflow-hidden`}
              >
                {/* Visual marker bar on the left */}
                <div className={`absolute top-0 left-0 bottom-0 w-2.5 ${styles.bg} border-r-2 border-black dark:border-white`} />

                {/* Content */}
                <div className="pl-3.5 flex-1 flex gap-2.5 items-start">
                  <div className={`p-1 border border-black rounded-sm ${styles.bg} text-black`}>
                    {styles.icon}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      {styles.label}
                    </span>
                    <p className="font-sans text-xs font-semibold text-black dark:text-white leading-snug mt-0.5">
                      {toast.message}
                    </p>
                  </div>
                </div>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => removeToast(toast.id)}
                  className="p-1 border border-black dark:border-white bg-white dark:bg-zinc-800 text-black dark:text-white hover:bg-red-200 hover:text-black hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-0 active:translate-y-0 transition-all cursor-pointer rounded-sm"
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

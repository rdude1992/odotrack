import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = true
}: ConfirmModalProps) {
  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.overscrollBehavior = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.overscrollBehavior = '';
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="confirm-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 cursor-pointer"
            onClick={onCancel}
          />

          {/* Dialog Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 260 }}
            className="relative w-full max-w-sm bg-white dark:bg-neo-dark-card border-2 border-black dark:border-white neo-shadow-lg dark:neo-shadow-dark-lg z-10"
          >
            {/* Header */}
            <div className="bg-neo-accent border-b-2 border-black px-5 py-3.5">
              <h3 className="font-display font-bold text-lg uppercase tracking-wider text-black">{title}</h3>
            </div>

            {/* Body */}
            <div className="px-5 py-5 space-y-6">
              <p className="text-black dark:text-white font-mono text-sm leading-relaxed">{message}</p>

              {/* Actions */}
              <div className="flex gap-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancel();
                  }}
                  className="flex-1 py-3 bg-white dark:bg-neo-dark-bg text-black dark:text-white border-2 border-black dark:border-white font-display font-bold text-xs uppercase tracking-wider neo-shadow-sm hover:translate-x-[-2px] hover:translate-y-[-2px] active:translate-x-0 active:translate-y-0 active:shadow-none transition-all cursor-pointer"
                >
                  {cancelText}
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onConfirm();
                  }}
                  className={`flex-1 py-3 ${
                    danger
                      ? 'bg-red-400 dark:bg-red-500 text-black border-black dark:border-white'
                      : 'bg-neo-accent text-black border-black dark:border-white'
                  } border-2 font-display font-bold text-xs uppercase tracking-wider neo-shadow-sm hover:translate-x-[-2px] hover:translate-y-[-2px] active:translate-x-0 active:translate-y-0 active:shadow-none transition-all cursor-pointer`}
                >
                  {confirmText}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
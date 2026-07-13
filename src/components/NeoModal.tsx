/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { X } from 'lucide-react';

interface NeoModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function NeoModal({ isOpen, onClose, title, children }: NeoModalProps) {
  const modalIdRef = useRef<string>(`modal-${Math.random().toString(36).substring(2, 9)}`);
  const cardRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const overlayRef = useRef<HTMLDivElement>(null);

  // Keep a stable ref of onClose to prevent re-triggering of history setup effects
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Right-edge swipe state
  const [swipeProgress, setSwipeProgress] = useState(0);
  const swipeStartX = useRef<number | null>(null);
  const edgeThreshold = 30; // pixels from the right edge to trigger edge swipe detection
  const swipeDistanceThreshold = 80; // px to swipe before triggering close

  // Handle right-edge swipe gesture
  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    const screenWidth = window.innerWidth;
    // Only capture if touch starts within edgeThreshold px of the right edge
    if (screenWidth - touch.clientX <= edgeThreshold) {
      swipeStartX.current = touch.clientX;
      setSwipeProgress(0);
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (swipeStartX.current === null) return;
    const touch = e.touches[0];
    const delta = swipeStartX.current - touch.clientX;
    if (delta < 0) return; // only track leftward swipes
    const progress = Math.min(delta / swipeDistanceThreshold, 1);
    setSwipeProgress(progress);
    // Optionally translate the overlay slightly
    if (overlayRef.current) {
      overlayRef.current.style.transform = `translateX(-${delta * 0.4}px)`;
    }
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (swipeStartX.current === null) return;
    const touch = e.changedTouches[0];
    const delta = swipeStartX.current - touch.clientX;
    if (delta >= swipeDistanceThreshold) {
      onCloseRef.current();
    }
    swipeStartX.current = null;
    setSwipeProgress(0);
    if (overlayRef.current) {
      overlayRef.current.style.transform = '';
    }
  }, []);

  // Attach/reattach edge swipe listeners to the overlay
  useEffect(() => {
    if (!isOpen) return;
    const overlay = overlayRef.current;
    if (!overlay) return;

    overlay.addEventListener('touchstart', handleTouchStart, { passive: true });
    overlay.addEventListener('touchmove', handleTouchMove, { passive: false });
    overlay.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      overlay.removeEventListener('touchstart', handleTouchStart);
      overlay.removeEventListener('touchmove', handleTouchMove);
      overlay.removeEventListener('touchend', handleTouchEnd);
      swipeStartX.current = null;
      setSwipeProgress(0);
    };
  }, [isOpen, handleTouchStart, handleTouchMove, handleTouchEnd]);

  // Support ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Support custom edge swipe gesture closing
  useEffect(() => {
    if (!isOpen) return;
    const handleBackGesture = (e: Event) => {
      e.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener('app-back-gesture', handleBackGesture);
    return () => window.removeEventListener('app-back-gesture', handleBackGesture);
  }, [isOpen]);

  // Support Back gesture/button closing
  useEffect(() => {
    if (!isOpen) return;

    const modalId = modalIdRef.current;
    let poppedByGesture = false;
    
    // Push state so that the 'back' action pops this state instead of navigating away from the app
    const hasAlreadyPushed = window.history.state?.modalId === modalId;
    if (!hasAlreadyPushed) {
      window.history.pushState({ modalId }, '');
    }

    const handlePopState = (e: PopStateEvent) => {
      if ((window as any).__ignoreNextPopState) {
        (window as any).__ignoreNextPopState = false;
        return;
      }
      if (e.state?.modalId !== modalId) {
        poppedByGesture = true;
        onCloseRef.current();
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      // Clean up the history state if the modal was closed some other way
      if (!poppedByGesture) {
        if (window.history.state?.modalId === modalId) {
          (window as any).__ignoreNextPopState = true;
          window.history.back();
        }
      }
    };
  }, [isOpen]);

  // Handle focus lock on open to prevent keyboard issues
  useEffect(() => {
    if (isOpen) {
      // Focus modal card to isolate keyboard event context and prevent accidental parent re-triggers
      cardRef.current?.focus();
      // Lock body scroll and pull-to-refresh
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
          key={modalIdRef.current}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center p-0 bg-black/60 backdrop-blur-[2px] touch-none"
        >
          {/* Backdrop click + swipe zone */}
          <div
            ref={overlayRef}
            className="absolute inset-0 cursor-pointer transition-transform duration-75"
            onClick={onClose}
          />
          {/* Edge swipe visual indicator */}
          {swipeProgress > 0 && (
            <div
              className="absolute top-0 bottom-0 right-0 w-1 z-20 pointer-events-none transition-all duration-75"
              style={{
                background: `linear-gradient(to left, rgba(255,255,255,${swipeProgress * 0.5}), transparent)`,
                opacity: swipeProgress,
              }}
            />
          )}

          {/* Modal Card */}
          <motion.div
            ref={cardRef}
            tabIndex={-1}
            id={`modal-card-${title.replace(/\s+/g, '-').toLowerCase()}`}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0, bottom: 0.8 }}
            onDragEnd={(event, info) => {
              if (info.offset.y > 100 || info.velocity.y > 300) {
                onClose();
              }
            }}
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 240 }}
            className="relative w-full sm:max-w-xl bg-neo-bg dark:bg-neo-dark-card border-t-2 border-r-2 border-l-2 border-black dark:border-white rounded-t-2xl neo-shadow-lg dark:neo-shadow-dark-lg overflow-hidden flex flex-col h-[70vh] max-h-[70vh] z-10 focus:outline-none"
          >
            {/* Grab Bar Indicator */}
            <div 
              className="flex justify-center py-2.5 bg-neo-accent select-none cursor-grab active:cursor-grabbing touch-none border-b border-black/10"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="w-12 h-1.5 bg-black/25 rounded-full hover:bg-black/45 transition-colors" />
            </div>

            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b-2 border-black bg-neo-accent text-black select-none touch-none"
                 onPointerDown={(e) => dragControls.start(e)}>
              <h3 className="font-display font-bold text-xl uppercase tracking-wider">{title}</h3>
              <button
                id="btn-close-modal"
                onClick={onClose}
                onPointerDown={(e) => e.stopPropagation()} // Prevent drag when clicking close button
                className="p-1 border-2 border-black bg-white hover:bg-neo-accent-yellow hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all duration-75 neo-shadow-sm active:translate-x-0 active:translate-y-0 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5 text-black" aria-hidden="true" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-6">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

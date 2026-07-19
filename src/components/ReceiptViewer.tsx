/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';

interface ReceiptViewerProps {
  imageUri: string | null;
  imageUris?: string[] | null;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}

type DesignTheme = 'neobrutalist' | 'refined' | 'material3' | 'aistudio';

export default function ReceiptViewer({ imageUri, imageUris, isOpen, onClose, title = 'Receipt Image' }: ReceiptViewerProps) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [theme, setTheme] = useState<DesignTheme>('neobrutalist');

  const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  const resetControls = () => {
    setScale(1);
    setRotation(0);
  };

  // Detect and track the design style from html element classList
  useEffect(() => {
    const getThemeFromHtml = (): DesignTheme => {
      const classList = document.documentElement.classList;
      if (classList.contains('refined')) return 'refined';
      if (classList.contains('material3')) return 'material3';
      if (classList.contains('aistudio')) return 'aistudio';
      return 'neobrutalist';
    };

    setTheme(getThemeFromHtml());

    const observer = new MutationObserver(() => {
      setTheme(getThemeFromHtml());
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isOpen) {
      setCurrentPageIndex(0);
      resetControls();
    }
  }, [isOpen]);

  const activeUri = (imageUris && imageUris.length > 0) ? imageUris[currentPageIndex] : imageUri;

  // --- Theme-based Style Mappings ---

  // Main Card Container Class
  const cardContainerClasses = {
    neobrutalist: 'relative w-full max-w-lg bg-neo-bg dark:bg-neo-dark-card border-[3px] border-black dark:border-white rounded-xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:shadow-[6px_6px_0px_0px_rgba(255,255,255,1)] overflow-hidden flex flex-col max-h-[85vh] z-10',
    refined: 'relative w-full max-w-lg bg-white dark:bg-neo-dark-card border border-gray-200 dark:border-white/10 rounded-lg shadow-lg overflow-hidden flex flex-col max-h-[85vh] z-10',
    material3: 'relative w-full max-w-lg bg-[#f3edf7] dark:bg-neo-dark-card rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh] z-10',
    aistudio: 'relative w-full max-w-lg bg-white dark:bg-neo-dark-card border border-gray-150 dark:border-white/5 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] z-10'
  }[theme];

  // Header Class
  const headerClasses = {
    neobrutalist: 'flex items-center justify-between px-4 py-3 border-b-[3px] border-black bg-neo-accent text-black',
    refined: 'flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/5 bg-white dark:bg-neo-dark-card text-black dark:text-white',
    material3: 'flex items-center justify-between px-4 py-3 bg-[#e7e0ec] dark:bg-[#2b2930] text-black dark:text-white',
    aistudio: 'flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-neo-dark-bg text-black dark:text-white'
  }[theme];

  // Header Title Text Class
  const titleTextClasses = {
    neobrutalist: 'font-display font-black text-sm uppercase tracking-wider',
    refined: 'font-sans font-medium text-sm text-gray-800 dark:text-gray-100',
    material3: 'font-display font-medium text-base text-[#1d1b20] dark:text-[#e6e1e5]',
    aistudio: 'font-display font-semibold text-sm text-gray-900 dark:text-gray-100'
  }[theme];

  // Zoom/Rotate Action Button Class
  const actionButtonClasses = {
    neobrutalist: 'p-1 border-2 border-black bg-white hover:bg-yellow-100 text-black rounded neo-shadow-sm active:translate-y-[1px] cursor-pointer',
    refined: 'p-1 border border-gray-200 dark:border-white/10 bg-white dark:bg-neo-dark-card hover:bg-gray-50 dark:hover:bg-white/5 text-gray-700 dark:text-gray-300 rounded active:scale-95 transition-transform cursor-pointer',
    material3: 'p-1.5 bg-[#f3edf7] dark:bg-neo-dark-card hover:bg-[#e8def8] dark:hover:bg-[#4a4458] text-[#1d192b] dark:text-[#e8def8] rounded-full active:scale-95 transition-all cursor-pointer',
    aistudio: 'p-1.5 border border-gray-150 dark:border-white/10 bg-white dark:bg-neo-dark-card hover:bg-gray-50 dark:hover:bg-white/5 text-gray-700 dark:text-gray-300 rounded-lg active:scale-95 transition-transform cursor-pointer'
  }[theme];

  // Close Button Class
  const closeButtonClasses = {
    neobrutalist: 'p-1 border-2 border-black bg-red-400 hover:bg-red-500 text-black rounded neo-shadow-sm active:translate-y-[1px] cursor-pointer ml-1',
    refined: 'p-1 border border-gray-200 dark:border-white/10 bg-white dark:bg-neo-dark-card hover:bg-red-500 hover:text-white text-gray-700 dark:text-gray-300 rounded active:scale-95 transition-all cursor-pointer ml-1',
    material3: 'p-1.5 bg-[#f9dedc] hover:bg-[#f5b9b6] text-[#410e0b] rounded-full active:scale-95 transition-all cursor-pointer ml-1',
    aistudio: 'p-1.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-lg active:scale-95 transition-all cursor-pointer ml-1'
  }[theme];

  // Pagination Container Class
  const paginationBarClasses = {
    neobrutalist: 'flex items-center justify-between px-4 py-2 border-t border-b border-black/10 dark:border-white/10 bg-white/5 dark:bg-black/20 text-xs font-mono',
    refined: 'flex items-center justify-between px-4 py-2 border-t border-b border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-[#1a1a1a] text-xs font-mono',
    material3: 'flex items-center justify-between px-4 py-2 bg-[#f3edf7] dark:bg-neo-dark-card text-xs font-mono',
    aistudio: 'flex items-center justify-between px-4 py-2 border-t border-b border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-neo-dark-bg text-xs font-mono'
  }[theme];

  // Pagination Button Class
  const paginationButtonClasses = {
    neobrutalist: 'px-2.5 py-1 bg-white dark:bg-neo-dark-card border-2 border-black disabled:opacity-40 disabled:cursor-not-allowed font-display font-bold uppercase text-[10px] neo-shadow-sm active:translate-y-[1px] cursor-pointer text-black dark:text-white',
    refined: 'px-2.5 py-1 bg-white dark:bg-neo-dark-card border border-gray-200 dark:border-white/15 disabled:opacity-40 disabled:cursor-not-allowed font-sans text-[10px] rounded active:scale-95 cursor-pointer text-black dark:text-white',
    material3: 'px-2.5 py-1 bg-[#e8def8] dark:bg-[#4a4458] disabled:opacity-40 disabled:cursor-not-allowed font-sans font-medium text-[10px] rounded-full active:scale-95 cursor-pointer text-[#1d192b] dark:text-[#e8def8]',
    aistudio: 'px-2.5 py-1 bg-indigo-50 dark:bg-[#1e1e1f] border border-indigo-150 dark:border-white/5 disabled:opacity-40 disabled:cursor-not-allowed font-display font-medium text-[10px] rounded active:scale-95 cursor-pointer text-indigo-600 dark:text-[#818cf8]'
  }[theme];

  // Footer Card Background Class
  const footerBgClasses = {
    neobrutalist: 'bg-white dark:bg-neo-dark-card border-t-2 border-black/10 dark:border-white/10 p-3 flex justify-center gap-3',
    refined: 'bg-white dark:bg-[#1c1c1c] border-t border-gray-100 dark:border-white/5 p-3 flex justify-center gap-3',
    material3: 'bg-[#f3edf7] dark:bg-neo-dark-card border-t border-transparent p-3 flex justify-center gap-3',
    aistudio: 'bg-white dark:bg-neo-dark-card border-t border-gray-100 dark:border-white/5 p-3 flex justify-center gap-3'
  }[theme];

  // Footer Action Download Button Class
  const downloadButtonClasses = {
    neobrutalist: 'flex items-center gap-1.5 px-4 py-2 bg-neo-accent text-black font-display font-black text-xs uppercase border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:bg-[#c9e83e] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer',
    refined: 'flex items-center gap-1.5 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-black font-sans font-medium text-xs rounded hover:bg-gray-800 dark:hover:bg-gray-100 active:scale-95 transition-all cursor-pointer',
    material3: 'flex items-center gap-1.5 px-4 py-2 bg-[#6750a4] dark:bg-[#d0bcff] text-white dark:text-[#141218] font-sans font-medium text-xs rounded-full hover:bg-[#5b4396] dark:hover:bg-[#c2b0e6] active:scale-95 transition-all cursor-pointer',
    aistudio: 'flex items-center gap-1.5 px-4 py-2 bg-indigo-600 dark:bg-[#818cf8] text-white dark:text-[#131314] font-display font-semibold text-xs rounded-lg hover:bg-indigo-700 dark:hover:bg-[#707be0] active:scale-95 transition-all cursor-pointer'
  }[theme];

  // Thumbnail Strip Container Class
  const thumbnailStripClasses = {
    neobrutalist: 'flex items-center gap-2.5 p-2 bg-[#f0f0f0] dark:bg-neo-dark-bg border-b-2 border-black overflow-x-auto scrollbar-thin',
    refined: 'flex items-center gap-2.5 p-2 bg-gray-50 dark:bg-[#151515] border-b border-gray-100 dark:border-white/5 overflow-x-auto scrollbar-thin',
    material3: 'flex items-center gap-2.5 p-2 bg-[#ece6f0] dark:bg-[#25232a] overflow-x-auto scrollbar-thin',
    aistudio: 'flex items-center gap-2.5 p-2 bg-gray-50 dark:bg-neo-dark-bg border-b border-gray-100 dark:border-white/5 overflow-x-auto scrollbar-thin'
  }[theme];

  // Single Thumbnail Item Wrapper Class
  const thumbnailItemClasses = (isActive: boolean) => {
    switch (theme) {
      case 'neobrutalist':
        return `relative shrink-0 w-12 h-16 border-2 cursor-pointer transition-all ${
          isActive
            ? 'border-neo-accent ring-2 ring-black scale-105'
            : 'border-black opacity-60 hover:opacity-100'
        }`;
      case 'refined':
        return `relative shrink-0 w-12 h-16 border rounded cursor-pointer transition-all ${
          isActive
            ? 'border-black dark:border-white ring-1 ring-black dark:ring-white scale-105'
            : 'border-gray-200 dark:border-white/10 opacity-60 hover:opacity-100'
        }`;
      case 'material3':
        return `relative shrink-0 w-12 h-16 rounded-lg overflow-hidden cursor-pointer transition-all ${
          isActive
            ? 'ring-2 ring-[#6750a4] dark:ring-[#d0bcff] scale-105'
            : 'opacity-60 hover:opacity-100'
        }`;
      case 'aistudio':
        return `relative shrink-0 w-12 h-16 border rounded-md cursor-pointer transition-all ${
          isActive
            ? 'border-indigo-600 dark:border-[#818cf8] ring-1 ring-indigo-600 dark:ring-[#818cf8] scale-105'
            : 'border-gray-200 dark:border-white/10 opacity-60 hover:opacity-100'
        }`;
    }
  };

  // Thumbnail Badge Class
  const thumbnailBadgeClasses = (isActive: boolean) => {
    switch (theme) {
      case 'neobrutalist':
        return `absolute bottom-0 right-0 text-[9px] font-mono px-1 font-bold border-t-2 border-l-2 border-black transition-all ${
          isActive
            ? 'bg-neo-accent text-black border-neo-accent'
            : 'bg-black text-white border-black'
        }`;
      case 'refined':
        return `absolute bottom-0 right-0 text-[9px] font-mono px-1 rounded-tl transition-all ${
          isActive
            ? 'bg-black dark:bg-white text-white dark:text-black font-semibold'
            : 'bg-gray-900/80 text-white'
        }`;
      case 'material3':
        return `absolute bottom-0 right-0 text-[9px] font-mono px-1 rounded-tl-md transition-all ${
          isActive
            ? 'bg-[#6750a4] dark:bg-[#d0bcff] text-white dark:text-[#141218] font-semibold'
            : 'bg-[#ece6f0] dark:bg-[#25232a] text-black dark:text-white'
        }`;
      case 'aistudio':
        return `absolute bottom-0 right-0 text-[9px] font-mono px-1 rounded-tl-md transition-all ${
          isActive
            ? 'bg-indigo-600 dark:bg-[#818cf8] text-white dark:text-[#131314] font-semibold'
            : 'bg-gray-100 dark:bg-neo-dark-bg text-gray-700 dark:text-gray-300'
        }`;
    }
  };

  // Floating Indicator Badge Class
  const indicatorBadgeClasses = {
    neobrutalist: 'absolute top-2.5 right-2.5 z-20 bg-neo-accent text-black border-2 border-black font-mono font-bold text-[9px] sm:text-[10px] px-2 py-0.5 rounded uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]',
    refined: 'absolute top-2.5 right-2.5 z-20 bg-gray-900 dark:bg-white text-white dark:text-black font-sans font-medium text-[9px] sm:text-[10px] px-2.5 py-0.5 rounded-full shadow-sm',
    material3: 'absolute top-2.5 right-2.5 z-20 bg-[#6750a4] dark:bg-[#d0bcff] text-white dark:text-[#141218] font-sans font-medium text-[9px] sm:text-[10px] px-2.5 py-0.5 rounded-full shadow-md',
    aistudio: 'absolute top-2.5 right-2.5 z-20 bg-indigo-600 dark:bg-[#818cf8] text-white dark:text-[#131314] font-display font-semibold text-[9px] sm:text-[10px] px-2.5 py-0.5 rounded-lg shadow-md'
  }[theme];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-[2px] select-none">
          {/* Backdrop click */}
          <div className="absolute inset-0 cursor-pointer" onClick={() => { resetControls(); onClose(); }} />

          {/* Popover Card */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={cardContainerClasses}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={headerClasses}>
              <h3 className={titleTextClasses}>{title}</h3>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleZoomOut}
                  className={actionButtonClasses}
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  onClick={handleZoomIn}
                  className={actionButtonClasses}
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={handleRotate}
                  className={actionButtonClasses}
                  title="Rotate"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { resetControls(); onClose(); }}
                  className={closeButtonClasses}
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Receipt Area */}
            <div className="flex-1 bg-[#1a1a1a] overflow-auto p-4 flex items-center justify-center min-h-[300px] relative">
              {activeUri ? (
                <div className="overflow-hidden p-2 flex items-center justify-center max-h-[55vh] max-w-full">
                  <motion.img
                    key={currentPageIndex} // Re-animate slightly on page change
                    src={activeUri}
                    alt={`Receipt Page ${currentPageIndex + 1}`}
                    style={{
                      transform: `scale(${scale}) rotate(${rotation}deg)`,
                      transformOrigin: 'center center',
                    }}
                    transition={{ type: 'spring', damping: 20, stiffness: 150 }}
                    className="max-h-[50vh] max-w-full object-contain border border-white/20 shadow-xl"
                    draggable={false}
                  />
                </div>
              ) : (
                <p className="text-gray-400 font-sans text-xs">No receipt image content.</p>
              )}
            </div>

            {/* Multi-page Receipt Thumbnails Strip */}
            {imageUris && imageUris.length > 1 && (
              <div className="relative">
                {/* Floating indicator badge */}
                <div className={indicatorBadgeClasses}>
                  Page {currentPageIndex + 1} of {imageUris.length}
                </div>
                <div className={`${thumbnailStripClasses} pr-24`}>
                  {imageUris.map((uri, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setCurrentPageIndex(idx);
                        resetControls();
                      }}
                      className={thumbnailItemClasses(currentPageIndex === idx)}
                    >
                      <img
                        src={uri}
                        alt={`Page ${idx + 1}`}
                        className="w-full h-full object-cover bg-white"
                      />
                      <span className={thumbnailBadgeClasses(currentPageIndex === idx)}>
                        {idx + 1}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pagination Controls */}
            {imageUris && imageUris.length > 1 && (
              <div className={paginationBarClasses}>
                <button
                  type="button"
                  disabled={currentPageIndex === 0}
                  onClick={() => {
                    setCurrentPageIndex(prev => Math.max(0, prev - 1));
                    resetControls();
                  }}
                  className={paginationButtonClasses}
                >
                  ◀ Prev Page
                </button>
                <span className="font-bold text-black dark:text-white">
                  Page {currentPageIndex + 1} of {imageUris.length}
                </span>
                <button
                  type="button"
                  disabled={currentPageIndex === imageUris.length - 1}
                  onClick={() => {
                    setCurrentPageIndex(prev => Math.min(imageUris.length - 1, prev + 1));
                    resetControls();
                  }}
                  className={paginationButtonClasses}
                >
                  Next Page ▶
                </button>
              </div>
            )}

            {/* Footer with Actions */}
            {activeUri && (
              <div className={footerBgClasses}>
                <a
                  href={activeUri}
                  download={`receipt_page_${currentPageIndex + 1}.png`}
                  className={downloadButtonClasses}
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>Download Page {imageUris && imageUris.length > 1 ? currentPageIndex + 1 : ''}</span>
                </a>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

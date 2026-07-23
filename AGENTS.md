# ODOTRACK Project Rules & Conventions

## Overview
ODOTRACK is a vehicle, mileage, expense, and journey tracking full-stack React/TypeScript web application. It features robust offline-first functionality, mobile optimization with Capacitor (including native Android support), and dual OCR pipelines. By default, it uses a high-contrast **Neobrutalist** theme with distinctive aesthetics, thick black borders, and playful tactile interactions.

---

## Styling & Theme Rules

### 1. Neobrutalist Visual Style (Signature Theme)
- **Borders & Shadows**: Use high-contrast borders (`border-2 border-black` or `border-[3px] border-black`) and solid, hard-edged drop-shadow offsets (`neo-shadow` or `neo-shadow-dark` / `shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]`).
- **Tactile Interaction**: Active states should feel physically pressed down (e.g., `active:translate-y-[2px] active:shadow-none transition-all`).
- **Colors**: Utilize vibrant, flat solid colors:
  - Neon Yellow/Green (`bg-neo-accent` or `#d6f554`) for accent highlights.
  - Soft Blues (`bg-blue-300 hover:bg-blue-400`) for "Edit" actions.
  - Soft Reds/Pinks (`bg-red-400 hover:bg-red-500`) for "Delete" actions.
  - Solid Off-whites/Pastels (`bg-[#faf9f6]` / `bg-[#f0f0f0]`) for card backgrounds.

### 2. Typography
- **Headings**: Pair custom display headings (`font-display font-black tracking-tight uppercase`) with clean sans-serif headings for secondary details.
- **Body & Captions**: Use **Inter** (`font-sans`) for legible interface text.
- **Numbers & Metadata**: Use **JetBrains Mono** (`font-mono`) for all numeric readouts, dates, currencies, and technical metrics (e.g., fuel volume, odometer readings, calculations).

### 3. Alternate Themes, Styling Styles, & Density Modes
- Though the default styling is Neobrutalist, the app's settings (`AppSettings`) support customization:
  - **Design Style**: `'neobrutalist' | 'refined' | 'material3'`
  - **Density Mode**: `'compact' | 'comfortable'`
  - **Font Size**: `'small' | 'medium' | 'large'`
- Ensure newly added UI respects these settings dynamically by applying responsive text/spacing utility classes mapped to the current configuration in `App.tsx` or components.
- **Refined Minimalist Style (Corners)**: In the 'refined' (minimalist) design style, cards and container elements must have right-angle corners (`rounded-none`) to keep layout aesthetics clean and consistent across all screens, including the Analytics dashboard and chart containers.
- **Dark Mode Support**: Maintain high-contrast aesthetics on dark mode designs. Use matching white borders (`dark:border-white`) and corresponding hard shadows (`dark:neo-shadow-dark`) where appropriate.

---

## Data Architecture & Persistence (IndexedDB)

### 1. Database Operations
- All read, write, and deletion tasks must use the `dbAPI` exported from `src/db.ts`. Do not write raw `indexedDB` queries outside of this file.
- The schema comprises the following stores: `vehicles`, `fuel_logs`, `trips`, `expenses`, `receipts`, `settings`, `maintenance_records`, and `journeys`.

### 2. Automatic Recalculation Rules (CRITICAL)
- **Vehicle Odometer**: A vehicle's active odometer reading is derived as the absolute maximum odometer reading found across its associated `fuel_logs`, `trips` (both `startOdo` and `endOdo`), and `expenses`, falling back to its `startingOdometer` if no records exist. `dbAPI` automatically handles this recalculation on log insertion, update, and deletion.
- **Mileage / Fuel Efficiency**: Fuel consumption calculations are performed dynamically on the `fuel_logs` store relative to chronological filling history and full-tank flags. Deleting or modifying a log triggers automatic re-evaluation of mileage metrics for subsequent fills.
- **Cascade Deletions**: Deleting a vehicle must trigger a clean cascade delete of all related records (fuel logs, trips, expenses, maintenance, and journeys) to prevent orphaned records in IndexedDB.
- **Journey Preservation**: Deleting a `Journey` object does **not** delete the underlying trips, fuel logs, or expenses. It simply unlinks them (`journeyId` -> `null`) so they remain in their respective log directories.

### 3. Selective Bulk Reset & Data Cleaning
- **Selective Log Clearing (`dbAPI.clearSelectiveLogs`)**: Allows targeted purging of specific log categories (`fuel_logs`, `trips`, `expenses`, `maintenance_records`, `journeys`, `receipts`) either scoped to a single vehicle or across all vehicles.
- **Profile & Settings Protection**: Bulk resets must NEVER delete vehicle profiles (`vehicles` store) or user preferences (`settings` store).
- **Post-Clear Recalculation**: After clearing logs, `dbAPI.clearSelectiveLogs` must trigger automatic odometer recalculation (`recalculateVehicleOdometer`) and mileage re-evaluation (`recalculateMileage`) for affected vehicles.
- **Smart Category Preselection**: The `BulkResetModal` automatically checks record counts per category and preselects ONLY categories containing > 0 records. Categories with 0 records remain unselected and disabled from toggling to prevent confusion.
- **Mobile-Responsive Modal Alignment**: Action buttons and checkboxes in `BulkResetModal` use fluid stacked/flex-wrap layouts with `truncate` and generous padding to ensure text and icons stay safely centered without touching container edges on narrow mobile viewports.

---

## Technical Features & Hardware Integrations

### 1. Dual OCR Pipeline & Multi-Page Receipts
- **Native Android / Capacitor**: When running in a native wrapper (`Capacitor.isNativePlatform()`), the app uses `@jcesarmobile/capacitor-ocr` backed by **Google ML Kit**. This is instant, offline, and does not require extensive loading times.
- **PWA/Web Fallback**: On the web, the app dynamically loads client-side **Tesseract.js** and **OpenCV.js** to run layout detection and text extraction directly in the browser sandbox.
- **Multi-Page Support**: Users can capture or upload multiple receipt pages for a single fuel log or expense. Pages are listed in an interactive grid, with features to **Remove** individual pages, **Re-run OCR** on a specific page, or **Re-run OCR** on all uploaded pages (concatenating and parsing their combined text contents for robust data extraction).
- **Storage**: Scanned receipt page images are converted to Base64 data URIs and stored locally as a collection (`pages` array of base64 strings and `receiptImage` preview) in the `receipts` store of IndexedDB, ensuring complete offline availability.

### 2. Gesture Navigation & Web-Native Polish
- **Pull-to-Refresh**: Enabled on key dashboard pages using customized mobile-friendly gesture listeners to re-sync local data states.
- **Swipe-Back Gestures**: Global touch coordinates are monitored near the left/right screen boundaries to trigger intuitive swipe-back triggers, integrated with the window's browser history stack.
- **Popstate Synchronization**: Navigation tab states must sync cleanly with the HTML5 history API (`popstate` listener) to ensure physical back-button actions (or swipe back on modern mobile OS) map intuitively to tab changes (always returning gracefully to the main Dashboard first).

---

## Components & Layout Patterns

- **Collapsible Journey Breakdown**: The category/spending breakdown in `JourneysManager` is collapsible and **minimized by default**. When collapsed, the column shrinks to let the main journeys grid span across more columns (`lg:col-span-3`).
- **Cards & Direct Details**: Journeys, fuel refills, and log items are expanded or viewed by clicking on their cards directly. No auxiliary detail navigation chevrons are needed in item headers.
- **Card Date Placement**: For all logs and lists (Expenses/Bills, Fuel, Trips), dates must reside consistently in the top header section of the card (integrated alongside the check-box, badges, or vehicle names) rather than in the bottom card body. They must feature a custom `<Calendar className="w-3 h-3 shrink-0" />` icon alongside the date text formatted using small, high-contrast monospace styling (e.g., `font-mono text-[10px] sm:text-[11px] text-gray-400 mt-1`).
- **Consistent Card Spacings**: Standardize log and list card padding to `p-2.5 sm:p-3` with low-opacity horizontal dividers (`border-b border-black/10 dark:border-white/10 pb-1.5 mb-2`) to keep layout densities uniform.
- **Sticky Header Positioning & Opaque Spacing**: Sticky headers across logs (Fuel, Trips, Expenses, Vehicles, Journeys) are placed at `top-[54px] sm:top-[58px]` to keep a precise 2-3px opaque gap between the top app header and the tab header on scroll. This prevents background cards from showing through the gap during scroll operations.
- **Dashboard Control Border Consistency**: Interactive buttons and range toggle wrappers on the Dashboard must match the responsive border thickness of other dashboard cards, using a robust `border-2 border-black` in light mode and a subtle single-width `dark:border dark:border-white` in dark mode.
- **Form Date Binding**: Ensure date input elements inside logging/modal forms (such as `FuelLogModal`) map directly to the raw stored ISO/string date format when loading a record for editing (`setFormDate(editingLog.date)`), avoiding unnecessary transformation layers that can prevent dates from populating.
- **Interactive Modals**: Use the Neobrutalist modals (`NeoModal` or `ConfirmModal`) to provide clean, screen-centered prompt flows, retaining focus on the action.
- **Theme-Adaptive Receipt Viewer**: The `ReceiptViewer` component dynamically adapts to the active `designStyle` setting (`'neobrutalist' | 'refined' | 'material3' | 'aistudio'`) by observing mutations on the root HTML element class list:
  - **Neobrutalist**: Solid hard shadows, thick borders, neon accent badges, sharp containers, and physical-pressed effects on zoom/rotate/download actions.
  - **Refined Minimalist**: Border-gray-200 lines, subtle grayscale shades, sleek roundings, soft image overlays, and ultra-clean modern typography.
  - **Material 3**: Rounded-2xl shapes, deep shadow elevation depths, lavender/violet system hues, pill-shaped action triggers, and rounded icon outlines.
  - **AI Studio**: Indigo branding accent trims, crisp high-density modern headers, and custom-styled card containers.
  - **Multi-page Navigation Overlay**: For multi-page logs, the viewer shows a floating `'Page X of Y'` indicator badge overlaid in the top-right corner of the scrollable thumbnail strip. The currently active thumbnail is explicitly highlighted with the active design theme's primary accent color.

---

## Context & Performance Maintenance

- **Long Conversation Handling**: When conversation history grows long, **start a fresh chat session** in AI Studio. Your workspace, code changes, and files will persist perfectly, and the AI will automatically load this `AGENTS.md` file to maintain complete architectural alignment.

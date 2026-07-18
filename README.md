# OdoTrack 🚀

> An offline-first vehicle expense logger, fuel mileage calculator, live trip tracker, and maintenance manager. Engineered with a bold, high-contrast **Neobrutalist** design that is built for both modern PWAs and native mobile packaging via Capacitor.

---

## Key Features

OdoTrack is a complete dashboard for tracking everything about your vehicles offline, natively, or directly in your browser:

### 🚙 1. Vehicle Fleet Management
- Track multiple vehicles including **Cars, Bikes, Scooters, EVs**, or custom types.
- Log vehicle details such as registration numbers, purchase dates, baseline odometers, and fuel types.
- Auto-updating active odometer tracker derived dynamically from your logs.

### ⛽ 2. Intelligent Fuel Logging & Mileage Calculator
- Log fuel purchases, price per litre, station name, and cost.
- Automatically calculate mileage efficiency (e.g., km/L or mi/gal) relative to full-tank milestones.
- Keep track of fuel-station preferences and gas spending trends over time.

### ⏱️ 3. Live Trip Tracker & Log
- Record vehicle journeys with automatic duration calculations.
- Start a live timer to track trips dynamically while driving, with support for real-time duration updates and post-trip summary entries.
- Group trips by category: **Business, Personal, Commute, or Other**.

### 💳 4. Comprehensive Expense Management
- Organize non-fuel vehicle expenses: Tolls, Parking, Repairs, Services, Insurance, Tires, Batteries, Accessories, and more.
- Link expenses directly to vehicles and active journeys.
- Upload and manage **multi-page receipt scans** directly within the offline database.

### 🗺️ 5. Journeys (Campaign Grouping)
- Group scattered trips, fuel logs, and expenses under a single named container (e.g., *"Summer Road Trip"* or *"Client Visit West"*).
- View consolidated statistics: combined costs, total distance traveled, and dynamic mileage specific to the journey.
- Easily add or remove items from Journeys without losing any underlying log history.

### 🔧 6. Proactive Maintenance Scheduling
- Schedule recurrent vehicle maintenance requirements based on distance intervals (kms) or time durations (months).
- Maintain historical maintenance records linked to odometer milestones and vendor names.
- Automatic notifications indicate when a specific service (e.g., Engine Oil, Air Filter) is upcoming or overdue.

### 📷 7. Dual OCR (Optical Character Recognition) Engine & Multi-Page Viewer
- **Native Android Scanning**: On native mobile apps, scans receipts instantly using **Google ML Kit OCR**—completely offline, with near-zero latency.
- **Web Fallback Pipeline**: On desktop or PWA, utilizes **Tesseract.js** and **OpenCV.js** directly inside the client sandbox to perform local canvas layout recognition and text parsing.
- **Multi-Page Support**: Capture and combine multiple receipt pages for a single fuel fill-up or service expense.
- **Granular Scanning Controls**: Clear individual pages, re-run data extraction on specific pages, or re-run OCR over all uploaded pages (concatenating raw text results dynamically to parse and auto-fill dates, odometer values, total costs, and liters).
- **Theme-Adaptive Receipt Viewer**: View receipt pages in a beautiful, screen-centered responsive modal. The viewer features dynamic theme styling (Neobrutalist, Refined Minimalist, Material 3, or AI Studio), pinch-zoom/rotate controls, page-by-page downloads, a floating `'Page X of Y'` indicator, and a horizontal scrollable thumbnail strip with active page theme highlight.

### 💾 8. Backup, Restore, & offline Sandbox
- Works fully offline with local **IndexedDB** state persistence.
- Export your complete vehicle database as a single-click local JSON file backup.
- Import backups anytime or seed sample mock data instantly to preview features.
- Set customizable backup reminder thresholds.

---

## Tech Stack

OdoTrack utilizes a modern full-stack web architecture with a native mobile runtime bridge:

*   **Frontend Library:** React 19 + TypeScript
*   **Build System:** Vite 6
*   **Styling Engine:** Tailwind CSS v4 (designed with tactile Neobrutalist layouts, bold borders, and custom CSS-first color patterns)
*   **Animation System:** Motion (`motion/react`)
*   **Database Persistence:** IndexedDB (transaction-safe browser storage)
*   **Native Bridge Wrapper:** Capacitor 8 Core & CLI (Camera + OCR Plugins)
*   **Web OCR Engine:** Tesseract.js + OpenCV.js (fully client-side)
*   **Android OCR Engine:** Google ML Kit (native Android bridge)
*   **Offline Web Support:** Service Workers & PWA registration

---

## Local Development & Build Workflows

### Prerequisites
- **Node.js** v20+
- **Android Studio** (Optional, only required for compiling Native Android APKs)

### Setup & Run (Web/PWA)

```bash
# 1. Clone or extract files and navigate to the directory
cd odotrack

# 2. Install all dependencies
npm install

# 3. Spin up the local development server (Vite on port 3000)
npm run dev

# 4. Build optimized web assets (outputs to /dist)
npm run build

# 5. Preview the compiled production build locally
npm run preview

# 6. Run linter & TypeScript type-checks
npm run lint
```

---

## Native Android Packaging (Capacitor)

OdoTrack includes preconfigured Capacitor integration to run as a native Android application. 

### Core Native Commands

```bash
# Compile React static web assets & sync them to the Android source tree
npm run cap:sync

# Open the Android project natively in Android Studio for emulation, signing, and builds
npm run cap:open:android

# Build and run the app directly on a connected Android phone or active emulator
npm run cap:run:android
```

For a detailed step-by-step setup guide for compiling Android APKs, setting up SDKs, or debugging with Android Logcat, refer directly to [ANDROID_BUILD_GUIDE.md](./ANDROID_BUILD_GUIDE.md).

---

## Design Customizability (AppSettings)

In the Settings tab, you can customize the application's appearance:
1.  **Theme Selection**: Toggle between **Light** (high-contrast ivory and charcoal) and **Dark** modes.
2.  **Design Vibe**: Choose between **Neobrutalist** (thick borders, 3D shadows), **Refined** (sleek, minimalist), or **Material 3** (soft curves, smooth accents).
3.  **Density Mode**: Switch between **Comfortable** (spacious gaps, fluid margins) or **Compact** (optimized details for power users).
4.  **Interface Sizing**: Customize font sizing (`small` | `medium` | `large`).
5.  **Currency & Branding**: Select preferred base currencies (INR, USD, EUR, etc.) and developer details.

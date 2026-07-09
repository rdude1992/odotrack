# OdoTrack

> Offline-first vehicle expense logger, fuel mileage calculator, live trip tracker, and maintenance manager.

## Features

- **Fuel Logging** – Track every fill-up with automatic mileage calculation
- **Trip Tracking** – Log trips with real-time duration tracking
- **Expense Management** – Record tolls, parking, repairs, and maintenance
- **Receipt OCR** – Scan fuel receipts with client-side Tesseract.js + OpenCV.js
- **Vehicle Management** – Track multiple vehicles with odometer and service history
- **Backup & Restore** – Export/import data for safekeeping
- **PWA** – Works offline with service worker caching

## Run Locally

**Prerequisites:** Node.js 20+

```bash
# Install dependencies
npm install

# Run the dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type-check
npm run lint
```

## Tech Stack

- React 19 + TypeScript + Vite 6
- Tailwind CSS v4 (CSS-first config)
- IndexedDB (client-side persistence)
- Tesseract.js + OpenCV.js (receipt OCR)
- Service Worker (offline support).

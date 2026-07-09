# OdoTrack Android Capacitor App - Build Guide

You have Android Studio installed. This guide takes you from the extracted zip to a working APK on your phone or emulator.

## Prerequisites

Before you start, verify you have:
- Android Studio installed (you have this ✓)
- Android SDK installed (verify in Android Studio: **Tools > SDK Manager** — at least SDK 34 and Build Tools 34.x)
- Node.js v18+ installed on your machine
- Git (optional, but handy)

---

## Step 1: Extract and Setup

```bash
# Extract the zip you downloaded
unzip odometer-capacitor.zip
cd odometer-main

# Install npm dependencies
npm install
```

This installs React, Vite, Capacitor, and the native OCR plugin locally.

---

## Step 2: Build the Web App (React → static HTML/JS)

Capacitor needs a **built** `dist/` folder to load into Android. This is what the user sees in the WebView.

```bash
npm run build
```

This runs **Vite**:
- Bundles React + your components
- Outputs `dist/index.html`, `dist/assets/`, and service worker
- Takes ~10 seconds

You'll see output like:
```
dist/index.html                     0.91 kB
dist/assets/index-C2dIWiZI.css     49.74 kB
dist/assets/index-nRfZmIQn.js     572.66 kB
✓ built in 8.01s
```

---

## Step 3: Sync Web Assets into Android Project

This copies your built `dist/` into the Android app so it can load it:

```bash
npx cap sync android
```

Output should show:
```
✔ Copying web assets from dist to android/app/src/main/assets/public
✔ Updating Android plugins
[info] Found 2 Capacitor plugins for android:
       @capacitor/camera@8.2.1
       @jcesarmobile/capacitor-ocr@0.3.0
✔ Sync finished
```

---

## Step 4: Open the Android Project in Android Studio

```bash
npx cap open android
```

Or manually:
1. Open Android Studio
2. **File → Open** → navigate to `odometer-main/android/` folder
3. Click **Open**

Android Studio will:
- Recognize it as a Gradle project
- Show a notification about Gradle sync — click **Sync Now**
- Download build dependencies (first time takes 2–5 minutes, then cached)

---

## Step 5: Configure Android SDK & Gradle (If Needed)

If you see red errors about missing SDK:

1. **Tools → SDK Manager**
2. Check that you have:
   - **API Level 34** (or whatever `compileSdkVersion` says in `android/app/build.gradle`)
   - **Build-Tools 34.x**
   - **Android SDK Platform 34**
   - **Google APIs Intel x86 Atom System Image** (if testing on emulator)
3. Click **Apply** and **OK** — let it download

---

## Step 6: Create or Select an Android Emulator (For Testing on Desktop)

**Skip this if you want to test on a real phone.**

To test without a physical device:

1. In Android Studio: **Tools → Device Manager**
2. Click **Create Device**
3. Select a phone model (e.g., **Pixel 4a**) → **Next**
4. Select an API level (e.g., **API 34**) → **Download** (if needed) → **Next**
5. Name it (default is fine) → **Finish**
6. Click the **Play button** to start the emulator (takes 30 seconds–1 minute)

Leave the emulator running for the next step.

---

## Step 7: Build and Install on Android Device/Emulator

Back in Android Studio:

### Option A: Build and run in one step

1. Click the green **Run** button (or press **Shift + F10**)
2. Select your device (emulator or plugged-in phone)
3. Click **OK**

Android Studio will:
- Build the APK
- Install it on the device
- Launch the app

First build takes ~2 minutes. Coffee break ☕

### Option B: Build APK manually, then install

If you want to sign the APK for distribution:

1. **Build → Build Bundle(s) / APK(s) → Build APK(s)**
2. Android Studio builds `android/app/build/outputs/apk/debug/app-debug.apk`
3. To install on a connected device:
   ```bash
   adb install android/app/build/outputs/apk/debug/app-debug.apk
   ```
   (assuming `adb` is in your PATH; if not, use the full path from SDK)

---

## Step 8: Test the OCR on Native

Once the app launches on your device/emulator:

1. Open the **Fuel Log** or **Expense Log** modal (the "+" button in the app)
2. Look for an **Upload** or **Camera icon** to scan a receipt
3. Pick an image or take a photo
4. Watch for the **"Scanning with on-device OCR…"** message
5. On Android, this uses **Google ML Kit**, which is:
   - ✓ Instant (no multi-MB download)
   - ✓ Offline (no network call)
   - ✓ Much faster than Tesseract.js
   - ✓ Generally more accurate on real phone photos

---

## Step 9: Debug (If Something Goes Wrong)

### View Logs

1. In Android Studio, open **View → Tool Windows → Logcat** (or click the **Logcat** tab at the bottom)
2. Set the filter to **App** (top-left dropdown)
3. Take a photo/scan — watch for errors

### Common Issues

**Issue:** `capacitor-ocr` plugin not found
- **Fix:** Run `npx cap sync android` again, then rebuild

**Issue:** "Cannot find symbol" errors for `Ocr` class
- **Fix:** Rebuild the Gradle project: **Build → Clean Project** → **Build → Rebuild Project**

**Issue:** Emulator doesn't start
- **Fix:** In Device Manager, right-click the emulator → **Wipe Data** → try again

**Issue:** "ML Kit" not recognized on Android 10 or older
- **Fix:** The @jcesarmobile/capacitor-ocr plugin requires ML Kit, which works on Android 6+. If you're on an older device, the fallback is Tesseract.js from the web pipeline.

---

## Step 10: Release Build (When Ready for Production)

Once you've tested and everything works:

```bash
# Build optimized release APK (ready to sign and upload to Play Store)
npm run build
npx cap sync android
```

Then in Android Studio:
1. **Build → Generate Signed Bundle / APK**
2. Choose **APK** (for direct install) or **Bundle** (for Play Store)
3. Follow the signing flow
4. Upload to Google Play Console or distribute the APK directly

---

## Quick Reference: Common Commands

```bash
# Rebuild web and sync to Android
npm run build && npx cap sync android

# Open Android project in Android Studio
npx cap open android

# Just sync without rebuilding web (if you only changed React code, didn't re-npm-install)
npx cap sync android

# One-command build and run
npm run cap:run:android
# (This is: npm run cap:sync → npx cap run android)
```

---

## What Happens When You Run

1. **React component** opens → calls `scanReceiptImage(file, imgEl, callback)`
2. **nativeOcr.ts** checks `Capacitor.isNativePlatform()`
3. **Native Android path:** calls `Ocr.process()` → Google ML Kit processes image → returns text blocks
4. **Web/PWA fallback:** downloads Tesseract.js + OpenCV.js, runs browser OCR
5. **parseReceiptText()** extracts cost, date, litres, etc. from raw OCR text
6. User confirms/edits and saves to IndexedDB

---

## Next Steps After First Run

- **Test on a real phone:** Plug in an Android phone via USB, enable **Developer Mode** (Settings → About Phone → tap Build Number 7 times), allow USB Debugging, then run from Android Studio
- **Customize:** Edit React components in `src/`, run `npm run build && npx cap sync android`, rebuild in Android Studio
- **Fine-tune receipt parsing:** Adjust regex patterns in `parseReceiptText()` function in `ocrEngine.ts` based on real-world receipts
- **Add iOS:** Same steps, but on a Mac with Xcode (`npx cap add ios`, build in Xcode)

---

## Troubleshooting Checklist

- [ ] Node.js v18+ installed? (`node --version`)
- [ ] Android SDK 34 installed in Android Studio?
- [ ] `npm install` ran without errors?
- [ ] `npm run build` created a `dist/` folder?
- [ ] `npx cap sync android` showed no red errors?
- [ ] Gradle sync completed in Android Studio (no red squiggles)?
- [ ] Emulator or phone plugged in and visible in Device Manager/Device list?
- [ ] Green **Run** button is clickable?

If stuck on any step, check **Logcat** (Android Studio) for the actual error message — it's usually very clear.

Good luck! 🚀

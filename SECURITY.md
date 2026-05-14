# FreshCheck — Security & Safety Audit

This document is an honest, line-by-line answer to: **"is it safe to install on my phone?"**

**Short answer:** Yes — because FreshCheck is a PWA, not a native app. It runs inside your browser's sandbox, can't access anything outside it, and uses only well-known open-source libraries and free public APIs. Uninstalling wipes everything.

---

## What FreshCheck actually is

It is a **web app** that you can save to your phone's home screen. It is **not**:
- An APK you side-load
- A native iOS/Android app from a third party
- A program that installs anything outside the browser
- A background process that runs when you're not using it

When you "install" a PWA, the browser bookmarks the URL with an icon and an offline cache. That's it.

## Where the code calls out to the internet

Confirmed by grepping the entire source tree. These are **the only** servers the app talks to:

| Host | Why | Personal data sent? |
|---|---|---|
| `world.openfoodfacts.org` | Look up product name from a barcode you scanned | No — only the barcode number |
| `www.themealdb.com` | Fetch recipes for ingredients you have | No — only ingredient names like "milk", "egg" |
| `fonts.googleapis.com` / `fonts.gstatic.com` | Load the Inter font | No — Google sees your IP (same as visiting any website using their fonts) |
| `storage.googleapis.com` (TF Hub CDN) | Download the MobileNet weights (~5 MB, on first photo scan, then cached forever) | No — anonymous download |
| `unpkg.com` (Tesseract CDN) | Download English OCR training data (on first photo scan, then cached) | No — anonymous download |
| The HTTPS host you deployed to (Vercel/Netlify/etc.) | Serves the app's HTML/JS/CSS | No — standard static-site request |

**No call goes to my server. No call carries your inventory, photos, or analytics.** Your photos are processed entirely on your device by Tesseract.js and MobileNet — they never leave the phone.

## Dependencies — every package, who maintains it, what it does

`npm audit` reports **0 known vulnerabilities** as of build time.

| Package | Maintainer | What it does |
|---|---|---|
| `react`, `react-dom` | Meta (Facebook) | UI framework |
| `react-router-dom` | Remix (Shopify) | URL routing |
| `vite` | VoidZero (Evan You) | Build tool |
| `@tensorflow/tfjs`, `@tensorflow-models/mobilenet` | Google | On-device image classification |
| `tesseract.js` | Naptha project (open source) | Browser OCR — port of Google's Tesseract |
| `@zxing/browser`, `@zxing/library` | ZXing project (Google-originated) | Browser barcode scanning |
| `recharts` | Open source community | Stats chart |
| `lucide-react` | Lucide Icons (open source) | Icons |
| `tailwindcss`, `postcss`, `autoprefixer` | Tailwind Labs / open source | CSS tooling |

All are mainstream, audited libraries used by millions of production apps. None of them are obscure or recent additions from unknown authors.

## Permissions the app asks for

| Permission | When | Why | Can you say no? |
|---|---|---|---|
| Camera | Only when you tap **Add → Barcode** | To read a barcode locally — frame data never leaves the device | Yes — fall back to Photo or Manual |
| Notifications | Only when you toggle it on in **Settings** | To remind you about expiring items | Yes — feature is off by default |
| Storage (IndexedDB) | First load | To remember your fridge contents | Yes — but the app is useless without it |

The app **does not** request: location, microphone, contacts, calendar, file system, SMS, Bluetooth, motion sensors, or any background-execution permission.

## What a PWA literally cannot do

Browsers enforce a sandbox. Even if FreshCheck's code were malicious, it could not:
- Read or modify other apps' data
- Access files outside the browser's storage area
- Install native binaries or any executable
- Modify the operating system
- Run when the browser is closed (no persistent background process)
- Start automatically on boot
- Make network requests that bypass CORS (the browser enforces this on every fetch)
- Access another website's cookies, storage, or DOM

This is the same model that protects you when you visit any normal website.

## How to verify yourself before installing

You don't have to take my word for it. From your laptop:

1. Open the deployed HTTPS URL in Chrome.
2. **F12 → Network tab → reload the page.** Watch the list of requests. You will see only the hosts listed above.
3. **F12 → Application → Service Workers.** Confirm the worker is from your own deployed origin.
4. **F12 → Application → Storage.** See everything the app has stored (it will be your IndexedDB items).
5. **F12 → Sources.** All source code is right there — you can read every line that runs.

If anything you see in DevTools looks wrong, don't install.

## How to uninstall

Because FreshCheck lives entirely in the browser:

- **Android (Chrome):** Long-press the home-screen icon → Uninstall (or Remove). Then in Chrome → Settings → Site Settings → All Sites → find your deployed URL → Clear & Reset. Everything is gone.
- **iOS (Safari):** Long-press the home-screen icon → Remove App → Delete. Then Settings → Safari → Advanced → Website Data → search for your URL → Remove. Everything is gone.

There is no leftover service, no registry entry, no scheduled task. The browser sandbox cleans itself up.

## What FreshCheck **does** keep on your phone

Stored locally in the browser's IndexedDB (sandboxed, per-origin):
- Your fridge items (name, category, expiry date, quantity, notes)
- Cached MobileNet weights and Tesseract OCR data (so it works offline)
- Cached recipe results from TheMealDB
- App settings (notification preferences, default category)

None of this leaves your device. There is no account, no sync, no analytics.

---

## tl;dr

FreshCheck is the same kind of thing as opening `https://google.com` and saving it to your home screen — except it does useful work for you. The "install" is a glorified bookmark with an offline cache. The browser keeps it inside its sandbox. Uninstalling deletes everything. No backend, no API keys, no telemetry, no PC dependency.

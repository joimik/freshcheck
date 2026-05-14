# FreshCheck

FreshCheck is an expiry-date scanner and fridge inventory manager. Scan a barcode, snap a photo of a label, or type items in by hand — get warned before food goes bad and pull recipes that use what's about to expire.

**100% on-device. No backend. No API keys. No PC needed to keep it running.**

Everything happens in the user's browser/phone: items live in IndexedDB, photos are read with Tesseract.js (OCR) and classified with MobileNet (image recognition), recipes come from the free TheMealDB, and barcodes resolve via the free Open Food Facts API. Once you publish FreshCheck to the App Store or Play Store (via Capacitor) it will work for users **even when your own computer is off**, forever, at zero cost.

## Setup

```bash
git clone <your-repo-url>
cd "Expiry Date Scanner APP"
npm run install:all
npm run dev
```

Open <http://localhost:5173>.

## Installing on your phone

There are two paths depending on whether you want to try it today over your home WiFi, or properly publish it so it works anywhere.

### Path A — Try it on your phone right now (home WiFi)

This works when your phone is on the same WiFi as your PC. PWA install is limited over plain HTTP, but the app is fully usable.

```bash
npm run dev:lan
```

Then on your phone's browser, open:

> **http://192.168.100.18:5173**

(That's your PC's LAN IP — if your network changes you can re-discover it on Windows with `ipconfig`.)

The app loads. To pin it to your home screen:
- **Android (Chrome):** menu (⋮) → **Add to Home screen**
- **iOS (Safari):** share icon → **Add to Home Screen**

This works as long as your PC is on. For the published-app experience, use Path B.

### Path B — Deploy to a free HTTPS host (proper install, no PC needed)

The app works on your phone permanently after this, even with your PC off forever.

**Vercel (recommended, fastest):**

```bash
npx vercel
```

Follow the prompts (sign in with email or GitHub, accept defaults). You'll get a URL like `https://freshcheck-yourname.vercel.app`. Open that on your phone and **Add to Home Screen** — now you have a proper PWA with the green FreshCheck icon. Works offline after first load.

**Netlify (alternative):**

```bash
npx netlify-cli deploy --prod --dir client/dist
```

Build first with `npm run build`, then run the command above. Same result.

Both services have free tiers more than generous enough for a personal app. Neither needs a credit card.

## Is it safe to install?

Yes — read **[SECURITY.md](SECURITY.md)** for the full audit. The short version:

- FreshCheck is a Progressive Web App, not a native app. It runs in your browser's sandbox.
- The only servers it talks to are: Open Food Facts (barcode lookups), TheMealDB (recipes), Google Fonts, and the TF Hub CDN for MobileNet weights. None of them receive personal data — no inventory, no photos.
- Your photos are processed entirely on the phone (Tesseract.js + MobileNet). They never leave the device.
- `npm audit` reports zero known vulnerabilities.
- Uninstalling = long-press the icon → remove. Wipes everything because data lives in the browser sandbox.

## How it works

| Feature | Powered by | Free + unlimited? |
|---|---|---|
| Expiry date from photo | Tesseract.js (browser-side OCR) | ✅ Yes, runs locally |
| Recognise the item from a photo | MobileNet via TensorFlow.js (~5 MB, loaded on first scan) | ✅ Yes, runs locally |
| Product name from barcode | Open Food Facts public API | ✅ Yes, no key |
| Recipe ideas for expiring items | TheMealDB public API | ✅ Yes, no key |
| Inventory storage | IndexedDB on the user's device | ✅ Yes, fully local |
| Notifications | Web Notifications API + service worker | ✅ Yes, daily local check |

## Pages

- **Home** — fridge sorted by expiry. Red ≤2 days, amber ≤7 days, green fresh.
- **Add (+)** — three tabs:
  - **Barcode** — point camera at a barcode → Open Food Facts auto-fills the product.
  - **Photo** — upload a photo. Tesseract reads the printed date, MobileNet identifies the item. Either signal is optional.
  - **Manual** — type it in.
- **Recipes** — pulls 3 recipes from TheMealDB that use ingredients expiring within 3 days. Save favourites.
- **Stats** — tracked / saved / wasted counters, waste-score, weekly bar chart.
- **Settings** — enable notifications, change alert window, export CSV, clear everything.

## Publishing to App Store / Play Store

FreshCheck is a PWA out of the box (installable from the browser on Android/iOS). To get it into the actual stores:

```bash
# inside the repo
npm install --save-dev @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init FreshCheck com.yourname.freshcheck --web-dir client/dist
npm run build
npx cap add ios
npx cap add android
npx cap open android   # or ios
```

Build the native projects in Xcode / Android Studio and submit. No backend is required for the published app — everything runs on each user's phone.

## Limitations to know

- **MobileNet** is trained on ImageNet's 1000 common-object classes. It nails fruits, vegetables, and many packaged items but doesn't know every brand or raw cut. Falls back to "other" when it isn't confident.
- **Tesseract** reads printed text well. Handwritten dates or extremely cluttered labels will miss.
- **Background push notifications** require a push server — out of scope here. FreshCheck fires local notifications when you open the app and finds items within your alert window.
- **No multi-device sync.** All data is local to the device. Reinstall = empty fridge. Adding sync would require a real backend.

## Tech stack

- React 18, Vite, TypeScript, Tailwind CSS, React Router
- IndexedDB for storage
- Tesseract.js for OCR
- TensorFlow.js + `@tensorflow-models/mobilenet` for image classification
- `@zxing/browser` for barcode scanning
- recharts for stats chart
- lucide-react for icons
- Service worker + manifest.webmanifest for PWA / offline shell

## Project structure

```
freshcheck/
├── client/
│   ├── public/
│   │   ├── sw.js                 Service worker (offline shell + notifications)
│   │   └── manifest.webmanifest  PWA manifest
│   └── src/
│       ├── components/           ItemCard, AddItemModal, BottomNav, SummaryCards, EmptyState
│       ├── pages/                Home, Recipes, Stats, Settings
│       ├── hooks/                useItems, useToast
│       ├── utils/                api (IndexedDB + public APIs), db (IndexedDB), vision (MobileNet), dates, notifications, settings
│       └── types/                Shared TypeScript types
└── package.json                  Root scripts (client only)
```

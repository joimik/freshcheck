import { useEffect, useRef, useState } from 'react';
import { X, Barcode, Camera, Pencil, Loader2, AlertCircle } from 'lucide-react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import Tesseract from 'tesseract.js';
import type { Category, NewItem } from '../types';
import { CATEGORY_META } from '../types';
import { api } from '../utils/api';
import { todayISO } from '../utils/dates';
import { loadSettings } from '../utils/settings';
import { classifyImage, type VisionGuess } from '../utils/vision';
import { useToast } from '../hooks/useToast';

type Tab = 'barcode' | 'photo' | 'manual';

type Props = {
  open: boolean;
  onClose: () => void;
  onAdd: (item: NewItem) => Promise<unknown>;
};

const CATEGORIES = Object.keys(CATEGORY_META) as Category[];

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

const MON = 'JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC';

// OCR output often loses spaces (`OCT 282026` instead of `OCT 28 2026`) and
// swaps `.` for `,`. Normalize before pattern-matching so a single set of
// patterns covers more real-world labels.
function normalizeOcrText(text: string): string {
  return text
    .toUpperCase()
    .replace(/,/g, '.')                       // dot-matrix prints often OCR `.` as `,`
    .replace(/([A-Z])(\d)/g, '$1 $2')          // OCT282026 → OCT 282026
    .replace(/(\d)([A-Z])/g, '$1 $2');         // 2026M4 → 2026 M4
}

// Try most-specific patterns first; the bare 8-digit fallback is last.
const DATE_PATTERNS: RegExp[] = [
  /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/,                            // YYYY-MM-DD
  /\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/,                            // DD-MM-YYYY or MM-DD-YYYY
  new RegExp(`\\b(\\d{1,2})\\s+(${MON})\\s+(20\\d{2})\\b`),                // DD MON YYYY
  new RegExp(`\\b(${MON})\\s+(\\d{1,2})\\s+(20\\d{2})\\b`),                // MON DD YYYY
  new RegExp(`\\b(${MON})\\s+(\\d{2})(20\\d{2})\\b`),                      // MON DDYYYY (space lost between day+year)
  new RegExp(`\\b(\\d{2})\\s*(${MON})\\s*(20\\d{2})\\b`),                  // DDMONYYYY (squished both sides)
  /\b(\d{2})(\d{2})(20\d{2})\b/,                                           // DDMMYYYY bare 8-digit blob
];

function pad(n: string | number) {
  return String(n).padStart(2, '0');
}

function extractDateFromText(text: string): string | null {
  const norm = normalizeOcrText(text);
  for (let i = 0; i < DATE_PATTERNS.length; i++) {
    const m = norm.match(DATE_PATTERNS[i]);
    if (!m) continue;

    switch (i) {
      case 0: // YYYY-MM-DD
        return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
      case 1: { // DD-MM-YYYY or MM-DD-YYYY (ambiguous → use bounds, else assume DD/MM)
        const a = Number(m[1]);
        const b = Number(m[2]);
        let day: number, month: number;
        if (a > 12)      { day = a; month = b; }
        else if (b > 12) { month = a; day = b; }
        else             { day = a; month = b; } // ambiguous; prefer DD/MM (non-US convention)
        if (month < 1 || month > 12 || day < 1 || day > 31) break;
        return `${m[3]}-${pad(month)}-${pad(day)}`;
      }
      case 2: { // DD MON YYYY
        const mon = MONTHS[m[2].toLowerCase()];
        if (mon) return `${m[3]}-${mon}-${pad(m[1])}`;
        break;
      }
      case 3: // MON DD YYYY
      case 4: { // MON DDYYYY
        const mon = MONTHS[m[1].toLowerCase()];
        if (mon) return `${m[3]}-${mon}-${pad(m[2])}`;
        break;
      }
      case 5: { // DDMONYYYY (squished)
        const mon = MONTHS[m[2].toLowerCase()];
        if (mon) return `${m[3]}-${mon}-${pad(m[1])}`;
        break;
      }
      case 6: { // bare DDMMYYYY — only accept if it's a sane date
        const day = Number(m[1]);
        const month = Number(m[2]);
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
          return `${m[3]}-${pad(month)}-${pad(day)}`;
        }
        break;
      }
    }
  }
  return null;
}

// Exposed for in-browser smoke tests (see scripts/test-ocr-dates.html).
if (typeof window !== 'undefined') {
  (window as unknown as { __extractDateFromText?: typeof extractDateFromText }).__extractDateFromText =
    extractDateFromText;
}

export function AddItemModal({ open, onClose, onAdd }: Props) {
  const toast = useToast();
  const settings = loadSettings();
  const [tab, setTab] = useState<Tab>('manual');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>(settings.defaultCategory);
  const [expiry, setExpiry] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [barcode, setBarcode] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Barcode scanner state
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const stopFnRef = useRef<(() => void) | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Photo OCR + vision-classifier state
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const [ocrPreview, setOcrPreview] = useState<{ text: string; date: string | null } | null>(null);
  const [visionGuess, setVisionGuess] = useState<VisionGuess | null>(null);
  const [classifying, setClassifying] = useState(false);

  useEffect(() => {
    if (!open) {
      stopCamera();
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function reset() {
    setName('');
    setCategory(settings.defaultCategory);
    setExpiry('');
    setQuantity(1);
    setNotes('');
    setBarcode(null);
    setImageUrl(null);
    setOcrProgress(null);
    setOcrPreview(null);
    setVisionGuess(null);
    setClassifying(false);
    setCameraError(null);
  }

  // Start the barcode camera when the barcode tab is opened.
  useEffect(() => {
    if (!open || tab !== 'barcode') {
      stopCamera();
      return;
    }
    startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);

  async function startCamera() {
    setCameraError(null);
    try {
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current!,
        (result, _err, ctrl) => {
          if (result) {
            ctrl.stop();
            handleBarcode(result.getText());
          }
        }
      );
      stopFnRef.current = () => controls.stop();
    } catch (err) {
      const e = err as Error;
      const denied = /denied|NotAllowed/i.test(e.message + (e.name || ''));
      setCameraError(
        denied
          ? 'Camera permission was denied. Use Photo or Manual instead.'
          : 'Could not start camera. Try Photo or Manual.'
      );
    }
  }

  function stopCamera() {
    try {
      stopFnRef.current?.();
    } catch {
      /* ignore */
    }
    stopFnRef.current = null;
    readerRef.current = null;
  }

  async function handleBarcode(code: string) {
    setBusy(true);
    try {
      const data = await api.scanBarcode(code);
      setName(data.product_name);
      setCategory((data.category as Category) ?? 'other');
      setBarcode(code);
      if (data.image_url) setImageUrl(data.image_url);
      toast('Product found — enter expiry date', 'success');
      setTab('manual');
    } catch (err) {
      toast('Not in any database — fill in the name manually', 'info');
      setBarcode(code);
      setTab('manual');
    } finally {
      setBusy(false);
    }
  }

  async function handlePhotoUpload(file: File) {
    setOcrProgress(0);
    setOcrPreview(null);
    setVisionGuess(null);
    setClassifying(true);

    // Run OCR (date extraction) and on-device image classification in parallel.
    // Tesseract reads printed dates; MobileNet identifies the food/object.
    const ocrTask = Tesseract.recognize(file, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          setOcrProgress(Math.round(m.progress * 100));
        }
      },
    }).then(({ data }) => data).catch((err) => {
      console.warn('OCR failed', err);
      return null;
    });

    const visionTask = classifyImage(file).catch((err) => {
      console.warn('Vision classify failed', err);
      return null;
    });

    const [ocrData, vision] = await Promise.all([ocrTask, visionTask]);
    setOcrProgress(null);
    setClassifying(false);
    setVisionGuess(vision);

    let date: string | null = null;
    let hasUsableText = false;
    let ocrNameGuess: string | null = null;

    if (ocrData) {
      const text = ocrData.text;
      date = extractDateFromText(text);
      const confidentWords = (ocrData.words ?? []).filter(
        (w) => w.confidence >= 70 && /^[A-Za-z]{3,}$/.test(w.text)
      );
      hasUsableText = confidentWords.length >= 2;
      setOcrPreview({ text: text.slice(0, 240), date });
      if (hasUsableText) {
        const candidates = [
          ...new Set(confidentWords.map((w) => w.line?.text?.trim() ?? w.text)),
        ]
          .filter((l) => /[A-Za-z]{4,}/.test(l) && !/^\d+/.test(l))
          .sort((a, b) => b.length - a.length);
        if (candidates[0]) {
          ocrNameGuess = candidates[0].replace(/[^A-Za-z0-9 \-']/g, '').slice(0, 60);
        }
      }
    }

    if (date) setExpiry(date);

    // Prefer the OCR product name when the label is readable (it's exact for
    // packaged goods). Fall back to MobileNet's classification for bare items.
    if (ocrNameGuess) {
      setName(ocrNameGuess);
    } else if (vision) {
      setName(vision.label);
      setCategory((vision.category as Category) ?? 'other');
    }

    // Toast that reflects what actually happened.
    if (date && (ocrNameGuess || vision)) {
      toast('Date + item detected — review and save', 'success');
    } else if (date) {
      toast('Date detected — enter the product name', 'info');
    } else if (vision && !hasUsableText) {
      toast(`Looks like ${vision.label} — please enter the expiry date`, 'info');
    } else if (hasUsableText) {
      toast('Found text but no date — please enter expiry manually', 'info');
    } else {
      toast(
        'Could not read this photo. Try a clearer label shot, scan a barcode, or enter manually.',
        'error'
      );
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !expiry) {
      toast('Name and expiry date are required', 'error');
      return;
    }
    setBusy(true);
    try {
      await onAdd({
        product_name: name.trim(),
        category,
        expiry_date: expiry,
        quantity,
        notes: notes.trim() || null,
        barcode,
        image_url: imageUrl,
      });
      toast('Item added', 'success');
      onClose();
    } catch (err) {
      toast((err as Error).message || 'Failed to add item', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#1a1a1a] w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl shadow-2xl max-h-[92vh] overflow-y-auto border border-[#2a2a2a]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[#1a1a1a] border-b border-[#2a2a2a] flex items-center justify-between px-5 py-4 z-10">
          <h2 className="font-semibold text-lg text-white">Add item</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-gray-400">
            <X size={20} />
          </button>
        </div>

        <div className="px-5 pt-3">
          <div className="grid grid-cols-3 gap-1.5 bg-[#242424] p-1 rounded-xl text-sm">
            {([
              ['barcode', Barcode, 'Barcode'],
              ['photo', Camera, 'Photo'],
              ['manual', Pencil, 'Manual'],
            ] as const).map(([t, Icon, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={
                  'flex items-center justify-center gap-1.5 py-2 rounded-lg transition ' +
                  (tab === t ? 'bg-[#333] shadow-sm font-medium text-white' : 'text-gray-500')
                }
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5 space-y-4">
          {tab === 'barcode' && (
            <div className="space-y-3">
              <div className="aspect-[4/3] rounded-xl overflow-hidden bg-[#0d0d0d] relative">
                <video ref={videoRef} className="w-full h-full object-cover" />
                <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-0.5 bg-fresh/80 shadow-[0_0_12px_rgba(34,197,94,0.8)]" />
              </div>
              {cameraError && (
                <div className="flex items-start gap-2 text-sm text-danger bg-red-900/30 p-3 rounded-lg">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{cameraError}</span>
                </div>
              )}
              <p className="text-xs text-gray-600 text-center">
                Point the camera at a product barcode. We'll auto-fill the name from Open Food Facts.
              </p>
            </div>
          )}

          {tab === 'photo' && (
            <div className="space-y-3">
              <label className="block border-2 border-dashed border-[#333] rounded-xl p-6 text-center cursor-pointer hover:border-fresh hover:bg-green-900/20 transition">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handlePhotoUpload(f);
                  }}
                />
                <Camera size={28} className="mx-auto text-gray-500 mb-2" />
                <div className="text-sm font-medium text-gray-300">Tap to upload a photo</div>
                <div className="text-xs text-gray-600 mt-1">
                  We'll read the <span className="font-medium">expiry date</span> off the label and try to recognise the item. Runs entirely on your device.
                </div>
              </label>
              {(ocrProgress !== null || classifying) && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 size={16} className="animate-spin" />
                  {ocrProgress !== null
                    ? `Reading text… ${ocrProgress}%`
                    : 'Identifying item…'}
                </div>
              )}
              {visionGuess && (
                <div className="text-xs bg-green-900/30 text-fresh rounded-lg p-3">
                  <strong>Looks like:</strong> {visionGuess.label}{' '}
                  <span className="text-fresh/60">({visionGuess.confidence}% confident)</span>
                </div>
              )}
              {ocrPreview && (
                <div className="text-xs bg-[#242424] rounded-lg p-3 space-y-1">
                  <div>
                    <strong>Detected:</strong>{' '}
                    {ocrPreview.date ? (
                      <span className="text-fresh">{ocrPreview.date}</span>
                    ) : (
                      <span className="text-danger">No date found</span>
                    )}
                  </div>
                  <div className="text-gray-600 line-clamp-3 italic">"{ocrPreview.text.replace(/\s+/g, ' ').trim()}"</div>
                </div>
              )}
              <p className="text-xs text-gray-600 text-center">
                Review the fields below before saving.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Barcode chip — shown when barcode scanned but no image found */}
            {barcode && !imageUrl && (
              <div className="flex items-center gap-2 bg-[#242424] rounded-xl px-3 py-2">
                <Barcode size={15} className="text-gray-500 shrink-0" />
                <span className="text-xs text-gray-400 font-mono truncate">{barcode}</span>
                <span className="text-[10px] text-gray-600 ml-auto shrink-0">Barcode saved</span>
              </div>
            )}

            {/* Product image — shown after a successful barcode scan */}
            {imageUrl && (
              <div className="flex items-center gap-3 bg-[#242424] rounded-2xl p-3">
                <img
                  src={imageUrl}
                  alt="Product"
                  className="w-20 h-20 rounded-xl object-contain bg-white shrink-0"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-500 mb-0.5">Product image</div>
                  <div className="text-sm text-gray-200 font-medium truncate">{name}</div>
                  <button
                    type="button"
                    onClick={() => setImageUrl(null)}
                    className="text-[11px] text-gray-500 hover:text-danger mt-1 transition"
                  >
                    Remove image
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="label">Product name</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Milk, Brand X"
                required
              />
            </div>

            <div>
              <label className="label">Category</label>
              <div className="grid grid-cols-4 gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={
                      'flex flex-col items-center gap-1 py-2 rounded-lg border transition ' +
                      (category === c
                        ? 'border-fresh bg-green-900/40'
                        : 'border-[#333] hover:bg-[#242424]')
                    }
                  >
                    <div className="w-9 h-9 rounded-xl overflow-hidden bg-black shadow-sm">
                      <img src={CATEGORY_META[c].icon} alt={CATEGORY_META[c].label} className="w-full h-full object-cover" />
                    </div>
                    <span className="text-[10px] text-gray-600">{CATEGORY_META[c].label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Expiry date</label>
                <input
                  type="date"
                  className="input"
                  min={todayISO()}
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">Quantity</label>
                <input
                  type="number"
                  className="input"
                  min={1}
                  max={20}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                />
              </div>
            </div>

            <div>
              <label className="label">Notes (optional)</label>
              <input
                className="input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. opened, in freezer"
              />
            </div>

            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? <Loader2 size={18} className="animate-spin" /> : null}
              Add to fridge
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

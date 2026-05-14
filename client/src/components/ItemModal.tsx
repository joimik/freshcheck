import { useEffect, useRef, useState } from 'react';
import { X, Barcode, Camera, Pencil, Loader2, AlertCircle, History } from 'lucide-react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import Tesseract from 'tesseract.js';
import type { Category, Item, NewItem, Location, RecentBarcode } from '../types';
import { CATEGORY_META, LOCATION_META, STORAGE_TIPS } from '../types';
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
  onUpdate?: (id: number, patch: Partial<Item>) => Promise<unknown>;
  editingItem?: Item | null;
};

const CATEGORIES = Object.keys(CATEGORY_META) as Category[];
const LOCATIONS = Object.keys(LOCATION_META) as Location[];

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

const MON = 'JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC';

function normalizeOcrText(text: string): string {
  return text
    .toUpperCase()
    .replace(/,/g, '.')
    .replace(/([A-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Z])/g, '$1 $2');
}

const DATE_PATTERNS: RegExp[] = [
  /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/,
  /\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/,
  new RegExp(`\\b(\\d{1,2})\\s+(${MON})\\s+(20\\d{2})\\b`),
  new RegExp(`\\b(${MON})\\s+(\\d{1,2})\\s+(20\\d{2})\\b`),
  new RegExp(`\\b(${MON})\\s+(\\d{2})(20\\d{2})\\b`),
  new RegExp(`\\b(\\d{2})\\s*(${MON})\\s*(20\\d{2})\\b`),
  /\b(\d{2})(\d{2})(20\d{2})\b/,
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
      case 0: return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
      case 1: {
        const a = Number(m[1]); const b = Number(m[2]);
        let day: number, month: number;
        if (a > 12) { day = a; month = b; }
        else if (b > 12) { month = a; day = b; }
        else { day = a; month = b; }
        if (month < 1 || month > 12 || day < 1 || day > 31) break;
        return `${m[3]}-${pad(month)}-${pad(day)}`;
      }
      case 2: { const mon = MONTHS[m[2].toLowerCase()]; if (mon) return `${m[3]}-${mon}-${pad(m[1])}`; break; }
      case 3:
      case 4: { const mon = MONTHS[m[1].toLowerCase()]; if (mon) return `${m[3]}-${mon}-${pad(m[2])}`; break; }
      case 5: { const mon = MONTHS[m[2].toLowerCase()]; if (mon) return `${m[3]}-${mon}-${pad(m[1])}`; break; }
      case 6: {
        const day = Number(m[1]); const month = Number(m[2]);
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12) return `${m[3]}-${pad(month)}-${pad(day)}`;
        break;
      }
    }
  }
  return null;
}

if (typeof window !== 'undefined') {
  (window as unknown as { __extractDateFromText?: typeof extractDateFromText }).__extractDateFromText =
    extractDateFromText;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function ItemModal({ open, onClose, onAdd, onUpdate, editingItem }: Props) {
  const toast = useToast();
  const settings = loadSettings();
  const isEditing = !!editingItem;

  const [tab, setTab] = useState<Tab>('manual');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>(settings.defaultCategory);
  const [location, setLocation] = useState<Location>('fridge');
  const [expiry, setExpiry] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [cost, setCost] = useState<string>('');
  const [barcode, setBarcode] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Recent barcodes for quick re-add
  const [recentBarcodes, setRecentBarcodes] = useState<RecentBarcode[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const stopFnRef = useRef<(() => void) | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const [ocrPreview, setOcrPreview] = useState<{ text: string; date: string | null } | null>(null);
  const [visionGuess, setVisionGuess] = useState<VisionGuess | null>(null);
  const [classifying, setClassifying] = useState(false);

  useEffect(() => {
    if (!open) {
      stopCamera();
      reset();
    } else if (editingItem) {
      // Pre-fill form from item being edited
      setTab('manual');
      setName(editingItem.product_name);
      setCategory(editingItem.category);
      setLocation(editingItem.location);
      setExpiry(editingItem.expiry_date);
      setQuantity(editingItem.quantity);
      setNotes(editingItem.notes ?? '');
      setCost(editingItem.estimated_cost ? String(editingItem.estimated_cost) : '');
      setBarcode(editingItem.barcode);
      setImageUrl(editingItem.image_url);
    } else {
      // Fresh add — load recent barcodes for the quick-add section
      api.listRecentBarcodes().then(setRecentBarcodes).catch(() => { /* ignore */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingItem]);

  function reset() {
    setName('');
    setCategory(settings.defaultCategory);
    setLocation('fridge');
    setExpiry('');
    setQuantity(1);
    setNotes('');
    setCost('');
    setBarcode(null);
    setImageUrl(null);
    setOcrProgress(null);
    setOcrPreview(null);
    setVisionGuess(null);
    setClassifying(false);
    setCameraError(null);
    setTab('manual');
  }

  useEffect(() => {
    if (!open || tab !== 'barcode' || isEditing) {
      stopCamera();
      return;
    }
    startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab, isEditing]);

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
    try { stopFnRef.current?.(); } catch { /* ignore */ }
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
    } catch {
      toast('Not in any database — fill in the name manually', 'info');
      setBarcode(code);
      setTab('manual');
    } finally {
      setBusy(false);
    }
  }

  function quickAddFromRecent(b: RecentBarcode) {
    setName(b.product_name);
    setCategory(b.category as Category);
    setBarcode(b.barcode);
    if (b.image_url) setImageUrl(b.image_url);
    setTab('manual');
    toast('Pre-filled — set the new expiry date', 'info');
  }

  async function handlePhotoUpload(file: File) {
    setOcrProgress(0);
    setOcrPreview(null);
    setVisionGuess(null);
    setClassifying(true);

    const ocrTask = Tesseract.recognize(file, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') setOcrProgress(Math.round(m.progress * 100));
      },
    }).then(({ data }) => data).catch(() => null);

    const visionTask = classifyImage(file).catch(() => null);

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

    if (ocrNameGuess) {
      setName(ocrNameGuess);
    } else if (vision) {
      setName(vision.label);
      setCategory((vision.category as Category) ?? 'other');
    }

    if (date && (ocrNameGuess || vision)) toast('Date + item detected — review and save', 'success');
    else if (date) toast('Date detected — enter the product name', 'info');
    else if (vision && !hasUsableText) toast(`Looks like ${vision.label} — please enter the expiry date`, 'info');
    else if (hasUsableText) toast('Found text but no date — please enter expiry manually', 'info');
    else toast('Could not read this photo. Try a clearer label shot, scan a barcode, or enter manually.', 'error');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !expiry) {
      toast('Name and expiry date are required', 'error');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        product_name: name.trim(),
        category,
        expiry_date: expiry,
        quantity,
        notes: notes.trim() || null,
        barcode,
        image_url: imageUrl,
        location,
        estimated_cost: cost.trim() ? Number(cost.replace(/[^\d]/g, '')) : null,
      };
      if (isEditing && editingItem && onUpdate) {
        await onUpdate(editingItem.id, payload);
        toast('Item updated', 'success');
      } else {
        await onAdd(payload);
        toast('Item added', 'success');
      }
      onClose();
    } catch (err) {
      toast((err as Error).message || 'Failed to save', 'error');
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
          <h2 className="font-semibold text-lg text-white">{isEditing ? 'Edit item' : 'Add item'}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-gray-400">
            <X size={20} />
          </button>
        </div>

        {!isEditing && (
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
        )}

        <div className="p-5 space-y-4">
          {!isEditing && tab === 'barcode' && (
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
                Point the camera at a product barcode. We try 3 databases — the first match wins.
              </p>

              {/* Recently scanned — tap to re-add */}
              {recentBarcodes.length > 0 && (
                <div className="pt-2 border-t border-[#2a2a2a]">
                  <div className="flex items-center gap-1.5 mb-2 text-xs text-gray-500">
                    <History size={13} /> Recently scanned — tap to re-add
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {recentBarcodes.slice(0, 5).map((b) => (
                      <button
                        key={b.barcode}
                        type="button"
                        onClick={() => quickAddFromRecent(b)}
                        className="w-full flex items-center gap-2 bg-[#242424] hover:bg-[#2a2a2a] rounded-lg p-2 text-left transition"
                      >
                        {b.image_url ? (
                          <img src={b.image_url} alt="" className="w-9 h-9 rounded-md object-contain bg-white shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-md bg-black overflow-hidden shrink-0">
                            <img src={CATEGORY_META[b.category as Category].icon} alt="" className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-200 font-medium truncate">{b.product_name}</div>
                          <div className="text-[10px] text-gray-600 font-mono truncate">{b.barcode}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!isEditing && tab === 'photo' && (
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
                  {ocrProgress !== null ? `Reading text… ${ocrProgress}%` : 'Identifying item…'}
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
              <p className="text-xs text-gray-600 text-center">Review the fields below before saving.</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {barcode && !imageUrl && (
              <div className="flex items-center gap-2 bg-[#242424] rounded-xl px-3 py-2">
                <Barcode size={15} className="text-gray-500 shrink-0" />
                <span className="text-xs text-gray-400 font-mono truncate">{barcode}</span>
                <span className="text-[10px] text-gray-600 ml-auto shrink-0">Barcode saved</span>
              </div>
            )}

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
                    <span className="text-[10px] text-gray-400">{CATEGORY_META[c].label}</span>
                  </button>
                ))}
              </div>
              {/* Storage tip for chosen category */}
              <div className="mt-2 text-[11px] text-gray-500 italic bg-[#242424] rounded-lg px-3 py-2 leading-snug">
                💡 {STORAGE_TIPS[category]}
              </div>
            </div>

            <div>
              <label className="label">Storage location</label>
              <div className="grid grid-cols-3 gap-1.5">
                {LOCATIONS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLocation(l)}
                    className={
                      'py-2 rounded-lg text-sm border transition flex items-center justify-center gap-1.5 ' +
                      (location === l
                        ? 'border-fresh bg-green-900/40 text-fresh'
                        : 'border-[#333] text-gray-400')
                    }
                  >
                    <span>{LOCATION_META[l].emoji}</span>
                    <span>{LOCATION_META[l].label}</span>
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
                  min={isEditing ? undefined : todayISO()}
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                  required
                />
                {!isEditing && expiry === '' && (
                  <button
                    type="button"
                    onClick={() => setExpiry(addDays(todayISO(), 7))}
                    className="mt-1 text-[10px] text-fresh/70 hover:text-fresh transition"
                  >
                    + Default to 7 days from today
                  </button>
                )}
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Cost (Rp) <span className="text-gray-600 font-normal">optional</span></label>
                <input
                  className="input"
                  inputMode="numeric"
                  placeholder="15000"
                  value={cost}
                  onChange={(e) => setCost(e.target.value.replace(/[^\d]/g, ''))}
                />
              </div>
              <div>
                <label className="label">Notes <span className="text-gray-600 font-normal">optional</span></label>
                <input
                  className="input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="opened, etc."
                />
              </div>
            </div>

            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? <Loader2 size={18} className="animate-spin" /> : null}
              {isEditing ? 'Save changes' : 'Add to fridge'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

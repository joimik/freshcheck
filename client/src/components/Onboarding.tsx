import { useState } from 'react';
import { Barcode, Camera, Sparkles, ArrowRight } from 'lucide-react';

const ONBOARDING_KEY = 'shelflife.onboarded';

export function hasSeenOnboarding(): boolean {
  return localStorage.getItem(ONBOARDING_KEY) === 'true';
}

export function markOnboardingDone() {
  localStorage.setItem(ONBOARDING_KEY, 'true');
}

type Slide = {
  emoji: string;
  title: string;
  body: string;
  icon: typeof Barcode;
};

const SLIDES: Slide[] = [
  {
    emoji: '🥬',
    title: 'Never waste food again',
    body: "ShelfLife tracks your fridge, freezer, and pantry so you know what's about to expire — before it does.",
    icon: Sparkles,
  },
  {
    emoji: '📸',
    title: 'Add items in seconds',
    body: 'Scan a barcode, snap a photo of a label, or type it in. Three databases + on-device OCR — no API keys, all free.',
    icon: Barcode,
  },
  {
    emoji: '🔥',
    title: 'Build your streak',
    body: 'Every day without wasting food extends your streak. Earn achievements, track money saved, see CO₂ avoided. Make zero-waste a habit.',
    icon: Camera,
  },
];

type Props = { onDone: () => void };

export function Onboarding({ onDone }: Props) {
  const [i, setI] = useState(0);
  const slide = SLIDES[i];

  function next() {
    if (i < SLIDES.length - 1) {
      setI(i + 1);
    } else {
      markOnboardingDone();
      onDone();
    }
  }

  function skip() {
    markOnboardingDone();
    onDone();
  }

  return (
    <div className="fixed inset-0 z-[60] bg-[#0d0d0d] flex flex-col">
      <div className="flex justify-end p-5">
        <button onClick={skip} className="text-sm text-gray-500 hover:text-gray-300 transition">Skip</button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div className="text-7xl mb-6">{slide.emoji}</div>
        <h1 className="text-2xl font-bold text-white mb-3">{slide.title}</h1>
        <p className="text-gray-400 leading-relaxed max-w-sm">{slide.body}</p>
      </div>

      <div className="p-6 space-y-5">
        <div className="flex justify-center gap-2">
          {SLIDES.map((_, idx) => (
            <div
              key={idx}
              className={
                'h-1.5 rounded-full transition-all ' +
                (idx === i ? 'w-6 bg-fresh' : 'w-1.5 bg-[#333]')
              }
            />
          ))}
        </div>
        <button onClick={next} className="btn-primary w-full">
          {i < SLIDES.length - 1 ? <>Next <ArrowRight size={18} /></> : 'Get started'}
        </button>
      </div>
    </div>
  );
}

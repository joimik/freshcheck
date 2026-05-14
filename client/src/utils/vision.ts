// On-device image classification via MobileNet. Free, unlimited, no API key —
// the model (~5MB) is downloaded on first use, cached by the browser, and all
// inference happens locally in WASM/WebGL. Works offline after the first load.
//
// Limitations: MobileNet is trained on ImageNet's 1000 classes, which covers
// many fruits, vegetables, and common foods (banana, granny smith, pineapple,
// pomegranate, lemon, broccoli, cucumber, mushroom, pizza, bagel, …) but not
// every packaged product. For unknown items, the caller should fall back to
// barcode scan or manual entry.

import type { MobileNet } from '@tensorflow-models/mobilenet';

let modelPromise: Promise<MobileNet> | null = null;

async function loadModel(): Promise<MobileNet> {
  if (modelPromise) return modelPromise;
  modelPromise = (async () => {
    // Dynamic import so the 5MB+ tfjs bundle is only fetched when the user
    // actually opens the photo scanner.
    const tf = await import('@tensorflow/tfjs');
    await tf.ready();
    const mobilenet = await import('@tensorflow-models/mobilenet');
    return mobilenet.load({ version: 2, alpha: 1.0 });
  })();
  return modelPromise;
}

export type VisionGuess = {
  label: string;
  confidence: number;
  category: string;
};

// Map common ImageNet labels back to FreshCheck categories. Anything not
// listed falls through to "other" — that's fine, user can override.
const LABEL_TO_CATEGORY: { match: RegExp; category: string }[] = [
  { match: /\b(banana|orange|lemon|lime|apple|granny smith|strawberry|pineapple|pomegranate|fig|pear|peach|grape|melon|watermelon|kiwi|mango|papaya|persimmon|raspberry|blackberry|blueberry)\b/i, category: 'produce' },
  { match: /\b(broccoli|cauliflower|cucumber|zucchini|eggplant|aubergine|bell pepper|capsicum|artichoke|cabbage|head cabbage|cardoon|mushroom|fungus|carrot|onion|potato|tomato|corn|squash|pumpkin|asparagus|spinach|lettuce)\b/i, category: 'produce' },
  { match: /\b(ice cream|cheese|cheeseburger|yogurt|milk can|butter|cream)\b/i, category: 'dairy' },
  { match: /\b(meat loaf|hot pot|hotdog|hot dog|frankfurter|bacon|sausage|steak|pork|chicken|ribeye)\b/i, category: 'meat' },
  { match: /\b(pizza|burrito|taco|french loaf|bagel|pretzel|dough|pancake|hamburger|sandwich|guacamole)\b/i, category: 'snacks' },
  { match: /\b(chocolate|cookie|biscuit|trifle|cake|candy|caramel|toffee|ice lolly)\b/i, category: 'snacks' },
  { match: /\b(soup bowl|consomme|broth|sauce|ketchup|mustard|mayonnaise)\b/i, category: 'condiments' },
  { match: /\b(can|canned|tin)\b/i, category: 'canned' },
  { match: /\b(pill bottle|capsule|tablet)\b/i, category: 'medicine' },
];

function mapCategory(label: string): string {
  for (const { match, category } of LABEL_TO_CATEGORY) {
    if (match.test(label)) return category;
  }
  return 'other';
}

function cleanLabel(label: string): string {
  // ImageNet labels like "Granny Smith apple" or "yellow lady's slipper" — keep
  // the first comma-separated chunk which is the most specific name.
  return label.split(',')[0].trim();
}

export async function classifyImage(file: File): Promise<VisionGuess | null> {
  const model = await loadModel();

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Failed to read image'));
    i.src = URL.createObjectURL(file);
  });

  try {
    const predictions = await model.classify(img, 3);
    if (!predictions.length) return null;
    // Only accept guesses with at least 15% confidence — below that, MobileNet
    // is basically guessing and we'd mislead the user.
    const top = predictions[0];
    if (top.probability < 0.15) return null;
    const label = cleanLabel(top.className);
    return {
      label,
      confidence: Math.round(top.probability * 100),
      category: mapCategory(top.className),
    };
  } finally {
    URL.revokeObjectURL(img.src);
  }
}

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
  // Fruits
  { match: /\b(banana|orange|lemon|lime|apple|granny smith|strawberry|pineapple|pomegranate|fig|pear|peach|grape|melon|watermelon|kiwi|mango|papaya|persimmon|raspberry|blackberry|blueberry|cranberry|cherry|apricot|nectarine|plum|coconut|avocado|durian|jackfruit|lychee|rambutan|guava|passion fruit|dragon fruit|starfruit)\b/i, category: 'produce' },
  // Vegetables
  { match: /\b(broccoli|cauliflower|cucumber|zucchini|eggplant|aubergine|bell pepper|capsicum|artichoke|cabbage|head cabbage|cardoon|mushroom|fungus|carrot|onion|potato|sweet potato|tomato|corn|squash|pumpkin|asparagus|spinach|lettuce|kale|chard|arugula|rocket|celery|leek|garlic|ginger|radish|beet|beetroot|turnip|parsnip|okra|chili|chile pepper|bok choy|cassava|yam|edamame|spring onion|scallion|herb|basil|cilantro|parsley|mint)\b/i, category: 'produce' },
  // Dairy
  { match: /\b(ice cream|cheese|cheeseburger|yogurt|yoghurt|milk can|butter|cream|sour cream|cottage cheese|mozzarella|cheddar|parmesan|brie|feta|gouda|cream cheese|whipped cream|condensed milk|evaporated milk|kefir|ghee)\b/i, category: 'dairy' },
  // Meat / Seafood
  { match: /\b(meat loaf|hot pot|hotdog|hot dog|frankfurter|bacon|sausage|steak|pork|chicken|ribeye|beef|lamb|ham|salami|turkey|duck|fish|salmon|tuna|cod|trout|tilapia|sardine|anchovy|shrimp|prawn|crab|lobster|squid|octopus|clam|mussel|oyster|scallop|liver|tenderloin|brisket|ground beef|mince)\b/i, category: 'meat' },
  // Bakery / snacks-as-meals
  { match: /\b(pizza|burrito|taco|french loaf|bagel|pretzel|dough|pancake|hamburger|sandwich|guacamole|wrap|tortilla|baguette|croissant|muffin|donut|doughnut|waffle|toast|bread|naan|pita|sushi|noodle|pasta|spaghetti|ramen|dumpling|gyoza)\b/i, category: 'snacks' },
  // Sweets / packaged snacks
  { match: /\b(chocolate|cookie|biscuit|trifle|cake|candy|caramel|toffee|ice lolly|popsicle|brownie|cupcake|gum|jelly|jello|wafer|gummy|lollipop|chip|crisp|cracker|popcorn|granola bar|cereal|trail mix|nut|almond|cashew|pistachio|walnut|raisin|date)\b/i, category: 'snacks' },
  // Condiments / sauces
  { match: /\b(soup bowl|consomme|broth|sauce|ketchup|mustard|mayonnaise|vinegar|olive oil|peanut butter|jam|jelly|marmalade|honey|syrup|salsa|hummus|sambal|soy sauce|fish sauce|oyster sauce|sriracha|tabasco|salad dressing|relish|wasabi|miso|tahini|nutella|spread)\b/i, category: 'condiments' },
  // Cans / preserved
  { match: /\b(can|canned|tin|jar|preserve|pickled|sardines|tuna can|beans|chickpea|lentil|corn can|tomato sauce|coconut milk)\b/i, category: 'canned' },
  // Medicine / health
  { match: /\b(pill bottle|capsule|tablet|medicine|drug|vitamin|supplement|aspirin|ibuprofen|paracetamol|syringe|bandage)\b/i, category: 'medicine' },
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

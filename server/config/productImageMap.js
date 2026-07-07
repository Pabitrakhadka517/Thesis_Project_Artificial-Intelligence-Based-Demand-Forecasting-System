'use strict'

/**
 * productImageMap.js
 *
 * Maps product name keywords to a representative image file.
 *
 * Resolution order for each entry:
 *   1. Local file  → server/assets/product-images/<image>
 *   2. Remote URL  → uploaded directly to Cloudinary from the web
 *
 * The migration script iterates PRODUCT_IMAGE_MAP in order and returns the
 * FIRST entry whose keywords array contains a substring match against the
 * lowercased product name.  Put more-specific entries before more-general ones.
 */

const PRODUCT_IMAGE_MAP = [
  // ── Water (must be before juice/soft-drink to avoid false positives) ───────
  {
    image:     'water.jpg',
    remoteUrl: 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=800&q=80&fit=crop',
    keywords:  ['water'],
  },

  // ── Toothpaste / Dental ────────────────────────────────────────────────────
  {
    image:     'toothpaste.jpg',
    remoteUrl: 'https://images.unsplash.com/photo-1559305616-3f99cd43e353?w=800&q=80&fit=crop',
    keywords:  ['toothpaste', 'toothbrush', 'colgate', 'dental', 'tooth'],
  },

  // ── Rice ──────────────────────────────────────────────────────────────────
  {
    image:     'rice.jpg',
    remoteUrl: 'https://images.unsplash.com/photo-1536304447766-da0ed4ce1b73?w=800&q=80&fit=crop',
    keywords:  [
      'rice', 'basmati', 'sona masoori', 'brown rice', 'sticky rice',
      'beaten rice', 'chiura', 'poha', 'ir-36',
    ],
  },

  // ── Lentils / Pulses ──────────────────────────────────────────────────────
  {
    image:     'lentils.jpg',
    remoteUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=800&q=80&fit=crop',
    keywords:  [
      'lentil', 'dal', 'daal', 'moong', 'masoor', 'toor', 'chana',
      'chickpea', 'black-eyed', 'green gram', 'mung', 'legume',
    ],
  },

  // ── Cooking Oil / Ghee ────────────────────────────────────────────────────
  {
    image:     'cooking-oil.jpg',
    remoteUrl: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=800&q=80&fit=crop',
    keywords:  [
      'oil', 'mustard oil', 'sunflower oil', 'palm oil', 'soybean oil',
      'refined oil', 'vanaspati', 'ghee',
    ],
  },

  // ── Flour / Baking ────────────────────────────────────────────────────────
  {
    image:     'flour.jpg',
    remoteUrl: 'https://images.unsplash.com/photo-1558655146-9f40138edfeb?w=800&q=80&fit=crop',
    keywords:  [
      'flour', 'maida', 'atta', 'besan', 'gram flour',
      'rice flour', 'corn flour', 'semolina', 'suji', 'corn starch', 'starch',
    ],
  },

  // ── Spices ────────────────────────────────────────────────────────────────
  {
    image:     'spices.jpg',
    remoteUrl: 'https://images.unsplash.com/photo-1532336414038-cf19250c5757?w=800&q=80&fit=crop',
    keywords:  [
      'spice', 'turmeric', 'jeera', 'cumin', 'cardamom', 'elaichi',
      'black pepper', 'cinnamon', 'dalchini', 'garam masala',
      'coriander', 'chili', 'chilli', 'red chili',
    ],
  },

  // ── Honey ─────────────────────────────────────────────────────────────────
  {
    image:     'honey.jpg',
    remoteUrl: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=800&q=80&fit=crop',
    keywords:  ['honey'],
  },

  // ── Sugar / Jaggery ───────────────────────────────────────────────────────
  {
    image:     'sugar.jpg',
    remoteUrl: 'https://images.unsplash.com/photo-1559827291-72ebf3d8a807?w=800&q=80&fit=crop',
    keywords:  ['sugar', 'brown sugar', 'white sugar', 'jaggery', 'gur', 'gud'],
  },

  // ── Salt ──────────────────────────────────────────────────────────────────
  {
    image:     'salt.jpg',
    remoteUrl: 'https://images.unsplash.com/photo-1518110925495-5fe2fda0442c?w=800&q=80&fit=crop',
    keywords:  ['salt', 'iodized salt', 'rock salt', 'sendha'],
  },

  // ── Tea ───────────────────────────────────────────────────────────────────
  {
    image:     'tea.jpg',
    remoteUrl: 'https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=800&q=80&fit=crop',
    keywords:  ['tea', 'ctc', 'green tea', 'herbal tea', 'ilam', 'orthodox tea'],
  },

  // ── Coffee ────────────────────────────────────────────────────────────────
  {
    image:     'coffee.jpg',
    remoteUrl: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80&fit=crop',
    keywords:  ['coffee', 'nescafe', 'instant coffee'],
  },

  // ── Dairy (milk powder, butter, cheese, cream, malt drinks) ───────────────
  {
    image:     'dairy.jpg',
    remoteUrl: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=800&q=80&fit=crop',
    keywords:  [
      'milk', 'butter', 'cheese', 'dairy', 'cream',
      'horlicks', 'ovaltine', 'cooking cream',
    ],
  },

  // ── Biscuits / Cookies ────────────────────────────────────────────────────
  {
    image:     'biscuits.jpg',
    remoteUrl: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=800&q=80&fit=crop',
    keywords:  ['biscuit', 'cookie', 'parle', 'marie', 'good day', 'cracker', 'wafer'],
  },

  // ── Noodles / Pasta ───────────────────────────────────────────────────────
  {
    image:     'noodles.jpg',
    remoteUrl: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=800&q=80&fit=crop',
    keywords:  [
      'noodle', 'maggi', 'wai wai', 'instant noodle',
      'macaroni', 'vermicelli', 'pasta', 'sev',
    ],
  },

  // ── Soft Drinks ───────────────────────────────────────────────────────────
  {
    image:     'soft-drink.jpg',
    remoteUrl: 'https://images.unsplash.com/photo-1553361371-9b22f78e8b1d?w=800&q=80&fit=crop',
    keywords:  ['coca-cola', 'coke', 'pepsi', 'sprite', 'soft drink', 'soda', 'cola', 'fizzy'],
  },

  // ── Juice / Squash ────────────────────────────────────────────────────────
  {
    image:     'juice.jpg',
    remoteUrl: 'https://images.unsplash.com/photo-1534353436294-0dbd4bdac845?w=800&q=80&fit=crop',
    keywords:  ['juice', 'mango juice', 'real juice', 'nimbu', 'squash', 'nimbu pani'],
  },

  // ── Soap (bar soap) ───────────────────────────────────────────────────────
  {
    image:     'soap.jpg',
    remoteUrl: 'https://images.unsplash.com/photo-1600857062241-98e5dba7f025?w=800&q=80&fit=crop',
    keywords:  ['soap', 'lux', 'lifebuoy', 'lively', 'bar soap'],
  },

  // ── Detergent / Laundry ───────────────────────────────────────────────────
  {
    image:     'detergent.jpg',
    remoteUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?w=800&q=80&fit=crop',
    keywords:  ['detergent', 'surf excel', 'ariel', 'tide', 'washing powder', 'laundry'],
  },

  // ── Household Cleaners ────────────────────────────────────────────────────
  {
    image:     'cleaner.jpg',
    remoteUrl: 'https://images.unsplash.com/photo-1563453392212-326f5e854473?w=800&q=80&fit=crop',
    keywords:  [
      'cleaner', 'floor cleaner', 'toilet cleaner', 'surface', 'disinfectant',
      'vim', 'dish washing', 'dishwashing', 'scrubber', 'naphthalene',
      'dustbin', 'floor cleaner liquid',
    ],
  },

  // ── Personal Care (sanitizer, shampoo, lotion) ────────────────────────────
  {
    image:     'personal-care.jpg',
    remoteUrl: 'https://images.unsplash.com/photo-1576426863848-c21f53c60b19?w=800&q=80&fit=crop',
    keywords:  [
      'sanitizer', 'shampoo', 'lotion', 'vaseline',
      'head & shoulders', 'dettol hand', 'personal care',
    ],
  },

  // ── Condiments (ketchup, sauce, jam, pickle, vinegar) ────────────────────
  {
    image:     'condiments.jpg',
    remoteUrl: 'https://images.unsplash.com/photo-1607489025009-de74a89d5e7e?w=800&q=80&fit=crop',
    keywords:  [
      'ketchup', 'sauce', 'jam', 'pickle', 'vinegar',
      'tomato paste', 'soya sauce', 'strawberry',
    ],
  },

  // ── Snacks / Cereals ──────────────────────────────────────────────────────
  {
    image:     'snacks.jpg',
    remoteUrl: 'https://images.unsplash.com/photo-1528825871115-3581a5387919?w=800&q=80&fit=crop',
    keywords:  [
      'snack', 'chips', 'kurkure', 'namkeen', 'popcorn',
      'corn flakes', 'oats', 'rolled oats', 'cereal', 'maize',
    ],
  },
]

/**
 * Resolve the best-matching image entry for a product name.
 *
 * @param {string} productName
 * @returns {{ image: string, remoteUrl: string, keywords: string[] } | null}
 */
function resolveImageEntry(productName) {
  if (!productName) return null
  const lower = productName.toLowerCase()
  for (const entry of PRODUCT_IMAGE_MAP) {
    if (entry.keywords.some(kw => lower.includes(kw.toLowerCase()))) {
      return entry
    }
  }
  return null
}

module.exports = { PRODUCT_IMAGE_MAP, resolveImageEntry }

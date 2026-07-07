'use strict'

/**
 * productImageMapper.js
 *
 * Maps a product name to a locally-served representative image.
 * Images must be present in server/assets/product-images/.
 *
 * Usage:
 *   const getProductImage = require('../utils/productImageMapper')
 *   const imagePath = getProductImage('Basmati Rice 5kg')
 *   // → '/product-images/rice.png'
 */

const MAPPING = [
  // ── Specific entries first (most specific keyword wins) ───────────────────

  { file: 'water.png',         keywords: ['water'] },
  { file: 'toothpaste.png',    keywords: ['toothpaste', 'toothbrush', 'colgate', 'dental', 'tooth'] },

  // ── Food staples ──────────────────────────────────────────────────────────
  { file: 'rice.png',          keywords: ['rice', 'basmati', 'sona masoori', 'brown rice', 'sticky rice', 'beaten rice', 'chiura', 'poha', 'ir-36'] },
  { file: 'flour.png',         keywords: ['flour', 'maida', 'atta', 'besan', 'gram flour', 'rice flour', 'corn flour', 'semolina', 'suji', 'corn starch', 'starch'] },
  { file: 'lentils.png',       keywords: ['lentil', 'dal', 'daal', 'moong', 'masoor', 'toor', 'chana', 'chickpea', 'black-eyed', 'green gram', 'mung', 'legume', 'pea', 'bean'] },
  { file: 'cooking-oil.png',   keywords: ['oil', 'mustard oil', 'sunflower oil', 'palm oil', 'soybean oil', 'refined oil', 'vanaspati', 'ghee', 'cooking cream'] },
  { file: 'spices.png',        keywords: ['spice', 'turmeric', 'jeera', 'cumin', 'cardamom', 'elaichi', 'black pepper', 'cinnamon', 'dalchini', 'garam masala', 'coriander', 'chili', 'chilli', 'red chili'] },
  { file: 'sugar.png',         keywords: ['sugar', 'jaggery', 'gur', 'gud'] },
  { file: 'salt.png',          keywords: ['salt', 'iodized', 'rock salt', 'sendha'] },
  { file: 'condiments.png',    keywords: ['ketchup', 'sauce', 'jam', 'pickle', 'vinegar', 'tomato paste', 'strawberry'] },

  // ── Beverages ─────────────────────────────────────────────────────────────
  { file: 'tea.png',           keywords: ['tea', 'ctc', 'green tea', 'herbal tea', 'ilam', 'orthodox tea'] },
  { file: 'coffee.png',        keywords: ['coffee', 'nescafe', 'instant coffee'] },
  { file: 'health-drinks.png', keywords: ['horlicks', 'ovaltine', 'malt', 'health drink', 'bournvita', 'complan'] },
  { file: 'soft-drinks.png',   keywords: ['coca-cola', 'coke', 'pepsi', 'sprite', 'soft drink', 'soda', 'cola', 'fizzy', '7up', 'fanta'] },
  { file: 'juice.png',         keywords: ['juice', 'mango juice', 'real juice', 'nimbu', 'squash', 'nimbu pani', 'lemon'] },

  // ── Dairy ─────────────────────────────────────────────────────────────────
  { file: 'dairy.png',         keywords: ['milk', 'butter', 'cheese', 'dairy', 'cream'] },

  // ── Snacks & packaged foods ────────────────────────────────────────────────
  { file: 'noodles.png',       keywords: ['noodle', 'maggi', 'wai wai', 'instant noodle', 'macaroni', 'vermicelli', 'pasta', 'sev'] },
  { file: 'biscuits.png',      keywords: ['biscuit', 'cookie', 'parle', 'marie', 'good day', 'cracker', 'wafer'] },
  { file: 'snacks.png',        keywords: ['snack', 'chips', 'kurkure', 'namkeen', 'popcorn', 'corn flakes', 'oats', 'rolled oats', 'cereal', 'maize', 'poha'] },

  // ── Household & personal care ─────────────────────────────────────────────
  { file: 'soap.png',          keywords: ['soap', 'lux', 'lifebuoy', 'lively', 'bar soap', 'bath'] },
  { file: 'detergent.png',     keywords: ['detergent', 'surf excel', 'ariel', 'tide', 'washing powder', 'laundry'] },
  { file: 'cleaners.png',      keywords: ['cleaner', 'floor cleaner', 'toilet cleaner', 'surface', 'disinfectant', 'vim', 'dishwash', 'scrubber', 'naphthalene', 'dustbin'] },
  { file: 'personal-care.png', keywords: ['sanitizer', 'shampoo', 'lotion', 'vaseline', 'head & shoulders', 'dettol hand', 'personal care', 'conditioner', 'moisturizer'] },
]

const DEFAULT_IMAGE = '/product-images/default-product.png'

/**
 * Return the representative local image path for a given product name.
 *
 * @param {string} productName
 * @returns {string}  e.g. "/product-images/rice.png"
 */
function getProductImage(productName) {
  if (!productName) return DEFAULT_IMAGE
  const lower = productName.toLowerCase()

  for (const { file, keywords } of MAPPING) {
    if (keywords.some(kw => lower.includes(kw.toLowerCase()))) {
      return `/product-images/${file}`
    }
  }

  return DEFAULT_IMAGE
}

module.exports = getProductImage

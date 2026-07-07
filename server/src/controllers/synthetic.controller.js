'use strict'

const fs          = require('fs')
const path        = require('path')
const mongoose    = require('mongoose')
const Category    = require('../models/Category')
const Unit        = require('../models/Unit')
const Supplier    = require('../models/Supplier')
const Product     = require('../models/Product')
const Sale        = require('../models/Sale')
const Purchase    = require('../models/Purchase')
const StockMovement = require('../models/StockMovement')

const SYN = '__synthetic__'

// Output CSV written to the project root (D:\individual\projecct)
const PROJECT_ROOT = path.join(__dirname, '..', '..', '..')
const CSV_PATH     = path.join(PROJECT_ROOT, 'synthetic_training_data.csv')

const CSV_HEADERS = [
  'date', 'year', 'month', 'day_of_month', 'day_of_week', 'week_of_year', 'quarter',
  'is_weekend', 'season', 'is_festival', 'festival_name', 'festival_intensity',
  'product_sku', 'product_name', 'category', 'unit', 'is_perishable', 'lead_time_days',
  'reorder_level', 'buying_price', 'selling_price', 'unit_price_actual', 'margin_pct',
  'quantity', 'revenue', 'discount_applied', 'payment_method', 'customer_type',
  'stock_before', 'stock_after', 'invoice_items_count', 'trend_factor',
].join(',') + '\n'

function csvQ(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return `"${v.replace(/"/g, '""')}"`
  return v
}

// ── Seeded PRNG (Park-Miller LCG) ─────────────────────────────────────────────
function mkRng(seed) {
  let s = (Math.abs(Math.floor(seed ?? Date.now())) % 2147483647) || 1
  return () => {
    s = s * 16807 % 2147483647
    return (s - 1) / 2147483646
  }
}

// ── Reference data ────────────────────────────────────────────────────────────
const CATEGORY_NAMES = [
  'Grains & Rice', 'Lentils & Pulses', 'Oils & Fats', 'Spices & Condiments',
  'Sugar & Sweeteners', 'Flour & Cereals', 'Packaged Foods', 'Beverages',
  'Dairy Products', 'Household & Cleaning',
]

const UNIT_DEFS = [
  { name: 'Kilogram', symbol: 'kg',     unitType: 'weight' },
  { name: 'Gram',     symbol: 'g',      unitType: 'weight' },
  { name: 'Liter',    symbol: 'L',      unitType: 'volume' },
  { name: 'Piece',    symbol: 'pc',     unitType: 'count'  },
  { name: 'Pack',     symbol: 'pack',   unitType: 'count'  },
  { name: 'Bottle',   symbol: 'bottle', unitType: 'count'  },
]

const SUPPLIER_DEFS = [
  { name: 'Himalayan Wholesale Traders',  district: 'Kathmandu',      leadTimeDays: 3, paymentTerms: 'credit_30', rating: 5 },
  { name: 'Kathmandu Food Distributors',  district: 'Kathmandu',      leadTimeDays: 2, paymentTerms: 'credit_15', rating: 4 },
  { name: 'Nepal Agro Suppliers Pvt Ltd', district: 'Lalitpur',       leadTimeDays: 4, paymentTerms: 'cash',      rating: 4 },
  { name: 'Mountain Fresh Imports',       district: 'Bhaktapur',      leadTimeDays: 5, paymentTerms: 'credit_15', rating: 4 },
  { name: 'Valley Trade Center',          district: 'Kathmandu',      leadTimeDays: 3, paymentTerms: 'credit_30', rating: 5 },
  { name: 'Bhaktapur Commodity Hub',      district: 'Bhaktapur',      leadTimeDays: 4, paymentTerms: 'cash',      rating: 3 },
  { name: 'Lalitpur Food Traders',        district: 'Lalitpur',       leadTimeDays: 3, paymentTerms: 'credit_15', rating: 4 },
  { name: 'Pokhara Wholesale Co.',        district: 'Kaski',          leadTimeDays: 7, paymentTerms: 'credit_30', rating: 3 },
  { name: 'Terai Agri Distributors',      district: 'Nawalparasi',    leadTimeDays: 5, paymentTerms: 'cash',      rating: 4 },
  { name: 'Eastern Nepal Traders',        district: 'Morang',         leadTimeDays: 6, paymentTerms: 'credit_15', rating: 3 },
  { name: 'Butwal Trading Company',       district: 'Rupandehi',      leadTimeDays: 5, paymentTerms: 'credit_30', rating: 4 },
  { name: 'Birganj Import-Export',        district: 'Parsa',          leadTimeDays: 4, paymentTerms: 'cash',      rating: 3 },
  { name: 'Hetauda Supply Chain',         district: 'Makwanpur',      leadTimeDays: 4, paymentTerms: 'credit_15', rating: 4 },
  { name: 'Banepa Commodity Traders',     district: 'Kavrepalanchok', leadTimeDays: 3, paymentTerms: 'cash',      rating: 3 },
  { name: 'Narayanghat Wholesale',        district: 'Chitwan',        leadTimeDays: 5, paymentTerms: 'credit_30', rating: 4 },
]

// 50 products across 10 categories
// Fields: sku, name, catI (category index), supI (supplier index), unit,
//   bp (buying price), sp (selling price), mn (minStock), rl (reorderLevel),
//   mx (maxStock), per (isPerishable), lt (leadTimeDays),
//   d (relative demand weight), qMin, qMax (wholesale qty per transaction)
const PRODUCT_DEFS = [
  // Grains & Rice (catI=0)
  { sku:'SYN-GR-001', name:'Basmati Rice',              catI:0, supI:0,  unit:'kg',     bp:95,   sp:115,  mn:50,  rl:200, mx:2000, per:false, lt:7,  d:1800, qMin:10, qMax:80  },
  { sku:'SYN-GR-002', name:'Sona Masoori Rice',          catI:0, supI:1,  unit:'kg',     bp:75,   sp:90,   mn:80,  rl:300, mx:3000, per:false, lt:5,  d:2200, qMin:15, qMax:100 },
  { sku:'SYN-GR-003', name:'Brown Rice',                 catI:0, supI:0,  unit:'kg',     bp:120,  sp:145,  mn:30,  rl:100, mx:1000, per:false, lt:7,  d:550,  qMin:5,  qMax:50  },
  { sku:'SYN-GR-004', name:'Beaten Rice (Chiura)',       catI:0, supI:2,  unit:'kg',     bp:65,   sp:80,   mn:40,  rl:150, mx:1500, per:false, lt:5,  d:1100, qMin:5,  qMax:50  },
  { sku:'SYN-GR-005', name:'Sticky Rice',                catI:0, supI:1,  unit:'kg',     bp:85,   sp:100,  mn:25,  rl:100, mx:1000, per:false, lt:7,  d:440,  qMin:5,  qMax:40  },
  // Lentils & Pulses (catI=1)
  { sku:'SYN-LP-001', name:'Red Lentils (Masoor Dal)',   catI:1, supI:2,  unit:'kg',     bp:110,  sp:130,  mn:40,  rl:150, mx:1500, per:false, lt:7,  d:900,  qMin:5,  qMax:50  },
  { sku:'SYN-LP-002', name:'Yellow Lentils (Moong Dal)', catI:1, supI:2,  unit:'kg',     bp:120,  sp:145,  mn:30,  rl:120, mx:1200, per:false, lt:7,  d:760,  qMin:5,  qMax:40  },
  { sku:'SYN-LP-003', name:'Black Lentils (Kalo Dal)',   catI:1, supI:2,  unit:'kg',     bp:95,   sp:115,  mn:25,  rl:100, mx:1000, per:false, lt:7,  d:560,  qMin:5,  qMax:40  },
  { sku:'SYN-LP-004', name:'Green Gram (Mung)',          catI:1, supI:8,  unit:'kg',     bp:130,  sp:155,  mn:20,  rl:80,  mx:800,  per:false, lt:7,  d:440,  qMin:3,  qMax:30  },
  { sku:'SYN-LP-005', name:'Chickpeas (Chana)',          catI:1, supI:8,  unit:'kg',     bp:100,  sp:120,  mn:25,  rl:100, mx:1000, per:false, lt:7,  d:660,  qMin:5,  qMax:40  },
  { sku:'SYN-LP-006', name:'Black-eyed Peas',            catI:1, supI:8,  unit:'kg',     bp:85,   sp:105,  mn:20,  rl:80,  mx:800,  per:false, lt:7,  d:330,  qMin:3,  qMax:30  },
  // Oils & Fats (catI=2)
  { sku:'SYN-OF-001', name:'Mustard Oil',                catI:2, supI:3,  unit:'L',      bp:210,  sp:245,  mn:25,  rl:100, mx:1000, per:false, lt:10, d:660,  qMin:3,  qMax:25  },
  { sku:'SYN-OF-002', name:'Sunflower Oil',              catI:2, supI:3,  unit:'L',      bp:185,  sp:220,  mn:25,  rl:100, mx:1000, per:false, lt:10, d:550,  qMin:3,  qMax:25  },
  { sku:'SYN-OF-003', name:'Palm Oil',                   catI:2, supI:11, unit:'L',      bp:160,  sp:190,  mn:20,  rl:80,  mx:800,  per:false, lt:10, d:440,  qMin:3,  qMax:20  },
  { sku:'SYN-OF-004', name:'Refined Soybean Oil',        catI:2, supI:11, unit:'L',      bp:175,  sp:205,  mn:25,  rl:100, mx:1000, per:false, lt:10, d:500,  qMin:3,  qMax:25  },
  { sku:'SYN-OF-005', name:'Pure Cow Ghee',              catI:2, supI:4,  unit:'kg',     bp:650,  sp:780,  mn:10,  rl:50,  mx:500,  per:false, lt:14, d:220,  qMin:1,  qMax:10  },
  // Spices & Condiments (catI=3)
  { sku:'SYN-SP-001', name:'Turmeric Powder',            catI:3, supI:9,  unit:'kg',     bp:180,  sp:220,  mn:20,  rl:80,  mx:800,  per:false, lt:7,  d:330,  qMin:1,  qMax:10  },
  { sku:'SYN-SP-002', name:'Red Chili Powder',           catI:3, supI:9,  unit:'kg',     bp:200,  sp:240,  mn:20,  rl:80,  mx:800,  per:false, lt:7,  d:310,  qMin:1,  qMax:10  },
  { sku:'SYN-SP-003', name:'Coriander Powder',           catI:3, supI:9,  unit:'kg',     bp:160,  sp:195,  mn:20,  rl:80,  mx:800,  per:false, lt:7,  d:280,  qMin:1,  qMax:8   },
  { sku:'SYN-SP-004', name:'Cumin Seeds (Jeera)',        catI:3, supI:9,  unit:'kg',     bp:350,  sp:420,  mn:10,  rl:40,  mx:400,  per:false, lt:10, d:135,  qMin:1,  qMax:6   },
  { sku:'SYN-SP-005', name:'Garam Masala Blend',         catI:3, supI:9,  unit:'kg',     bp:280,  sp:340,  mn:10,  rl:40,  mx:400,  per:false, lt:7,  d:155,  qMin:1,  qMax:6   },
  { sku:'SYN-SP-006', name:'Black Pepper Powder',        catI:3, supI:9,  unit:'kg',     bp:550,  sp:660,  mn:5,   rl:20,  mx:200,  per:false, lt:10, d:65,   qMin:1,  qMax:4   },
  { sku:'SYN-SP-007', name:'Cardamom (Elaichi)',         catI:3, supI:4,  unit:'kg',     bp:1800, sp:2200, mn:2,   rl:10,  mx:100,  per:false, lt:14, d:28,   qMin:1,  qMax:3   },
  { sku:'SYN-SP-008', name:'Cinnamon (Dalchini)',        catI:3, supI:9,  unit:'kg',     bp:400,  sp:490,  mn:5,   rl:20,  mx:200,  per:false, lt:10, d:50,   qMin:1,  qMax:4   },
  // Sugar & Sweeteners (catI=4)
  { sku:'SYN-SS-001', name:'White Sugar',                catI:4, supI:5,  unit:'kg',     bp:72,   sp:88,   mn:50,  rl:200, mx:2000, per:false, lt:5,  d:1980, qMin:10, qMax:100 },
  { sku:'SYN-SS-002', name:'Brown Sugar',                catI:4, supI:5,  unit:'kg',     bp:88,   sp:108,  mn:25,  rl:100, mx:1000, per:false, lt:5,  d:550,  qMin:5,  qMax:50  },
  { sku:'SYN-SS-003', name:'Jaggery (Gud)',              catI:4, supI:8,  unit:'kg',     bp:95,   sp:118,  mn:25,  rl:100, mx:1000, per:false, lt:5,  d:660,  qMin:5,  qMax:50  },
  // Flour & Cereals (catI=5)
  { sku:'SYN-FC-001', name:'All-Purpose Flour',          catI:5, supI:6,  unit:'kg',     bp:48,   sp:58,   mn:75,  rl:300, mx:3000, per:false, lt:5,  d:1980, qMin:10, qMax:80  },
  { sku:'SYN-FC-002', name:'Whole Wheat Flour',          catI:5, supI:6,  unit:'kg',     bp:52,   sp:63,   mn:60,  rl:250, mx:2500, per:false, lt:5,  d:1650, qMin:10, qMax:70  },
  { sku:'SYN-FC-003', name:'Corn Flour',                 catI:5, supI:6,  unit:'kg',     bp:60,   sp:72,   mn:25,  rl:100, mx:1000, per:false, lt:7,  d:385,  qMin:5,  qMax:35  },
  { sku:'SYN-FC-004', name:'Semolina (Suji)',            catI:5, supI:6,  unit:'kg',     bp:55,   sp:68,   mn:40,  rl:150, mx:1500, per:false, lt:5,  d:770,  qMin:5,  qMax:50  },
  // Packaged Foods (catI=6)
  { sku:'SYN-PF-001', name:'Instant Noodles',            catI:6, supI:7,  unit:'pack',   bp:18,   sp:25,   mn:100, rl:500, mx:5000, per:false, lt:7,  d:3850, qMin:24, qMax:240 },
  { sku:'SYN-PF-002', name:'Assorted Biscuits',          catI:6, supI:7,  unit:'kg',     bp:95,   sp:115,  mn:25,  rl:100, mx:1000, per:false, lt:7,  d:660,  qMin:3,  qMax:25  },
  { sku:'SYN-PF-003', name:'Beaten Rice Pack (Poha)',    catI:6, supI:2,  unit:'kg',     bp:65,   sp:80,   mn:20,  rl:80,  mx:800,  per:false, lt:5,  d:385,  qMin:3,  qMax:25  },
  { sku:'SYN-PF-004', name:'Vermicelli (Sev)',           catI:6, supI:7,  unit:'kg',     bp:55,   sp:68,   mn:20,  rl:80,  mx:800,  per:false, lt:5,  d:330,  qMin:3,  qMax:20  },
  { sku:'SYN-PF-005', name:'Corn Flakes',                catI:6, supI:7,  unit:'kg',     bp:145,  sp:175,  mn:10,  rl:50,  mx:500,  per:false, lt:7,  d:185,  qMin:2,  qMax:12  },
  { sku:'SYN-PF-006', name:'Rolled Oats',                catI:6, supI:7,  unit:'kg',     bp:165,  sp:198,  mn:10,  rl:50,  mx:500,  per:false, lt:7,  d:145,  qMin:2,  qMax:10  },
  // Beverages (catI=7)
  { sku:'SYN-BV-001', name:'CTC Tea Premium',            catI:7, supI:10, unit:'kg',     bp:380,  sp:455,  mn:10,  rl:50,  mx:500,  per:false, lt:7,  d:275,  qMin:1,  qMax:12  },
  { sku:'SYN-BV-002', name:'Green Tea Leaves',           catI:7, supI:10, unit:'kg',     bp:420,  sp:505,  mn:8,   rl:30,  mx:300,  per:false, lt:7,  d:110,  qMin:1,  qMax:6   },
  { sku:'SYN-BV-003', name:'Instant Coffee',             catI:7, supI:3,  unit:'kg',     bp:680,  sp:820,  mn:5,   rl:20,  mx:200,  per:false, lt:10, d:70,   qMin:1,  qMax:5   },
  { sku:'SYN-BV-004', name:'Herbal Tea Blend',           catI:7, supI:10, unit:'kg',     bp:350,  sp:420,  mn:5,   rl:20,  mx:200,  per:false, lt:7,  d:60,   qMin:1,  qMax:4   },
  // Dairy Products (catI=8)
  { sku:'SYN-DP-001', name:'Full Cream Milk Powder',     catI:8, supI:4,  unit:'kg',     bp:480,  sp:580,  mn:8,   rl:30,  mx:300,  per:false, lt:7,  d:145,  qMin:1,  qMax:8   },
  { sku:'SYN-DP-002', name:'Amul Butter Block',          catI:8, supI:4,  unit:'kg',     bp:680,  sp:820,  mn:5,   rl:20,  mx:200,  per:true,  lt:3,  d:70,   qMin:1,  qMax:6   },
  { sku:'SYN-DP-003', name:'Processed Cheese Spread',    catI:8, supI:4,  unit:'kg',     bp:550,  sp:660,  mn:4,   rl:15,  mx:150,  per:true,  lt:3,  d:55,   qMin:1,  qMax:5   },
  { sku:'SYN-DP-004', name:'Cooking Cream 200ml',        catI:8, supI:4,  unit:'bottle', bp:85,   sp:102,  mn:10,  rl:50,  mx:500,  per:true,  lt:3,  d:220,  qMin:6,  qMax:36  },
  // Household & Cleaning (catI=9)
  { sku:'SYN-HC-001', name:'Surf Excel Detergent',       catI:9, supI:12, unit:'kg',     bp:85,   sp:102,  mn:25,  rl:100, mx:1000, per:false, lt:7,  d:550,  qMin:3,  qMax:25  },
  { sku:'SYN-HC-002', name:'Vim Dishwashing Liquid',     catI:9, supI:12, unit:'L',      bp:65,   sp:78,   mn:20,  rl:80,  mx:800,  per:false, lt:7,  d:385,  qMin:3,  qMax:20  },
  { sku:'SYN-HC-003', name:'Lux Bar Soap',               catI:9, supI:12, unit:'pc',     bp:45,   sp:55,   mn:25,  rl:100, mx:1000, per:false, lt:5,  d:770,  qMin:6,  qMax:48  },
  { sku:'SYN-HC-004', name:'Floor Cleaner Liquid',       catI:9, supI:12, unit:'L',      bp:95,   sp:114,  mn:12,  rl:50,  mx:500,  per:false, lt:7,  d:275,  qMin:2,  qMax:15  },
  { sku:'SYN-HC-005', name:'Dettol Hand Sanitizer',      catI:9, supI:12, unit:'bottle', bp:120,  sp:145,  mn:15,  rl:60,  mx:600,  per:false, lt:7,  d:330,  qMin:3,  qMax:24  },
]

// ── Nepal demand patterns ──────────────────────────────────────────────────────

// Monthly demand multiplier index 0=Jan, 11=Dec
const MONTHLY_MUL = [0.95, 0.90, 1.05, 1.10, 1.05, 0.90, 0.80, 0.75, 0.90, 2.20, 1.60, 1.00]

// Day-of-week multiplier 0=Sun, 6=Sat
const DOW_MUL = [0.90, 1.00, 0.95, 0.95, 1.10, 1.20, 1.40]

// Season names by month
const SEASONS = ['winter','winter','spring','spring','summer','summer','monsoon','monsoon','monsoon','autumn','autumn','winter']

// Chhath festival windows [year -> [[month, startDay, endDay], ...]]
const CHHATH = {
  2021: [[11, 8,  11]], 2022: [[10, 30, 31], [11, 1, 3]],
  2023: [[11, 19, 22]], 2024: [[11, 7,  10]],
  2025: [[10, 27, 30]], 2026: [[11, 15, 18]],
}

// Dashain festival windows [year -> [month, startDay, endDay]]
const DASHAIN = {
  2021: [10, 6, 16], 2022: [9, 26, null, 10, 1, 6],  // spans Sep-Oct
  2023: [10, 14, 24], 2024: [10, 2, 12],
  2025: [9, 22, null, 10, 1, 2], 2026: [10, 11, 21],
}

// Tihar festival windows [year -> [month, startDay, endDay]]
const TIHAR = {
  2021: [10, 30, null, 11, 1, 4], 2022: [10, 26, 30],
  2023: [11, 12, 16],             2024: [11, 1,  5],
  2025: [10, 20, 24],             2026: [11, 8,  12],
}

function inRange(m, d, spec) {
  if (!spec) return false
  // spec is either [m, d1, d2] or [m1, d1, null, m2, d2, d3] for cross-month
  if (spec.length === 3) {
    return m === spec[0] && d >= spec[1] && d <= spec[2]
  }
  // cross-month: [m1, d1, null, m2, d2min, d2max]
  return (m === spec[0] && d >= spec[1]) || (m === spec[3] && d >= spec[4] && d <= spec[5])
}

function getNepalFestival(date) {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()

  if (m === 1 && d >= 13 && d <= 16) return { name: 'maghe_sankranti', mul: 1.6 }
  if (m === 2 && d >= 15 && d <= 22) return { name: 'shivaratri',      mul: 1.3 }

  // Holi (approximate per year)
  const holiDates = { 2021:[3,28,30], 2022:[3,17,19], 2023:[3,7,9], 2024:[3,24,26], 2025:[3,13,15], 2026:[3,2,4] }
  const h = holiDates[y]
  if (h && m === h[0] && d >= h[1] && d <= h[2]) return { name: 'holi', mul: 1.8 }

  if (m === 4 && d >= 13 && d <= 16) return { name: 'nepali_new_year', mul: 1.7 }
  if (m === 5 && d >= 14 && d <= 17) return { name: 'buddha_jayanti',  mul: 1.2 }
  if ((m === 8 && d >= 28) || (m === 9 && d <= 6)) return { name: 'teej', mul: 2.0 }
  if (m === 9 && d >= 10 && d <= 17) return { name: 'indra_jatra',     mul: 1.3 }

  if (inRange(m, d, DASHAIN[y]))  return { name: 'dashain', mul: 3.5 }
  if (inRange(m, d, TIHAR[y]))    return { name: 'tihar',   mul: 2.8 }

  const cw = CHHATH[y] || []
  if (cw.some(([cm, cd1, cd2]) => m === cm && d >= cd1 && d <= cd2)) return { name: 'chhath', mul: 1.5 }

  if (m === 12 && d >= 24 && d <= 26) return { name: 'christmas',    mul: 1.1 }
  if ((m === 12 && d >= 30) || (m === 1 && d <= 2)) return { name: 'new_year', mul: 1.2 }

  return null
}

// ── Pick helpers ───────────────────────────────────────────────────────────────
const PAY_METHODS  = ['cash', 'card', 'qr', 'credit']
const PAY_WEIGHTS  = [0.40, 0.15, 0.20, 0.25]
const CUST_TYPES   = ['Retail Shop', 'Wholesale Buyer', 'Restaurant', 'Hotel', 'Institution', 'Individual']
const CUST_WEIGHTS = [0.35, 0.28, 0.15, 0.10, 0.07, 0.05]
const PO_METHODS   = ['cash', 'bank_transfer', 'cheque', 'credit']
const PO_WEIGHTS   = [0.30, 0.35, 0.20, 0.15]

function wPick(rng, items, weights) {
  let r = rng(), cum = 0
  for (let i = 0; i < items.length; i++) {
    cum += weights[i]; if (r < cum) return items[i]
  }
  return items[items.length - 1]
}

// ── Ensure reference data ─────────────────────────────────────────────────────
async function ensureRefData() {
  const catMap = {}
  for (const name of CATEGORY_NAMES) {
    const doc = await Category.findOneAndUpdate(
      { name }, { $setOnInsert: { name, isActive: true } },
      { upsert: true, new: true, lean: true },
    )
    catMap[name] = doc._id
  }

  const unitMap = {}
  for (const u of UNIT_DEFS) {
    const doc = await Unit.findOneAndUpdate(
      { name: u.name }, { $setOnInsert: u },
      { upsert: true, new: true, lean: true },
    )
    unitMap[u.symbol] = doc._id
  }

  const supplierArr = []
  for (const s of SUPPLIER_DEFS) {
    const doc = await Supplier.findOneAndUpdate(
      { name: s.name }, { $setOnInsert: { ...s, status: 'active' } },
      { upsert: true, new: true, lean: true },
    )
    supplierArr.push(doc)
  }

  return { catMap, supplierArr }
}

async function ensureProducts(catMap, supplierArr) {
  const products = []
  for (const def of PRODUCT_DEFS) {
    const doc = await Product.findOneAndUpdate(
      { sku: def.sku },
      { $setOnInsert: {
        sku:          def.sku,
        name:         def.name,
        category:     catMap[CATEGORY_NAMES[def.catI]],
        supplier:     supplierArr[def.supI]._id,
        unit:         def.unit,
        buyingPrice:  def.bp,
        sellingPrice: def.sp,
        minStock:     def.mn,
        reorderLevel: def.rl,
        maxStock:     def.mx,
        currentStock: def.mx,
        isPerishable: def.per,
        isActive:     true,
        leadTimeDays: def.lt,
        description:  SYN,
      }},
      { upsert: true, new: true, lean: true },
    )
    products.push({
      _id:    doc._id,
      sku:    doc.sku,
      name:   doc.name,
      supId:  supplierArr[def.supI]._id,
      unit:   def.unit,
      bp:     def.bp,
      sp:     def.sp,
      rl:     def.rl,
      mx:     def.mx,
      lt:     def.lt,
      d:      def.d,
      qMin:   def.qMin,
      qMax:   def.qMax,
      catName: CATEGORY_NAMES[def.catI],
    })
  }
  return products
}

// ── Sales generation ───────────────────────────────────────────────────────────
async function generateSales(products, startDate, endDate, rng, csvStream) {
  // Running stock per product (track in memory)
  const stock = {}
  for (const p of products) stock[p._id.toString()] = p.mx

  // Product lookup map for CSV writing
  const prodMap = {}
  for (const p of products) prodMap[p._id.toString()] = p

  // Weighted selection pool
  const totalD = products.reduce((s, p) => s + p.d, 0)
  const pW = products.map(p => p.d / totalD)

  let invCnt = 1, poCnt = 1
  let totalItems = 0, totalRevenue = 0, festItems = 0
  const prodCounts = {}

  const saleBuf = [], smBuf = [], poBuf = [], poSmBuf = []

  const startYear = startDate.getFullYear()
  const endMs     = endDate.getTime()
  const cursor    = new Date(startDate)

  async function flush() {
    if (saleBuf.length)  await Sale.insertMany(saleBuf,  { ordered: false })
    if (smBuf.length)    await StockMovement.insertMany(smBuf,   { ordered: false })
    if (poBuf.length)    await Purchase.insertMany(poBuf, { ordered: false })
    if (poSmBuf.length)  await StockMovement.insertMany(poSmBuf, { ordered: false })
    saleBuf.length = smBuf.length = poBuf.length = poSmBuf.length = 0
  }

  while (cursor.getTime() <= endMs) {
    const yr  = cursor.getFullYear()
    const m0  = cursor.getMonth()     // 0-11
    const dow = cursor.getDay()       // 0=Sun

    const festival = getNepalFestival(new Date(cursor))
    const festMul  = festival ? festival.mul : 1.0
    const totalMul = MONTHLY_MUL[m0] * DOW_MUL[dow] * festMul * (1 + (yr - startYear) * 0.07)

    // Invoices per day: base 28-45 × demand pressure (capped at 3.5×)
    const numInv = Math.max(5, Math.round((28 + rng() * 17) * Math.min(totalMul, 3.5)))

    for (let i = 0; i < numInv; i++) {
      const saleId  = new mongoose.Types.ObjectId()
      const numItms = 3 + Math.floor(rng() * 5)          // 3-7 items per invoice
      const invNum  = `SYN-${String(invCnt++).padStart(7, '0')}`

      const saleDate = new Date(cursor)
      saleDate.setHours(8 + Math.floor(rng() * 10), Math.floor(rng() * 60), 0, 0)

      // Weighted product selection without replacement
      const chosen = []
      const usedIdx = new Set()
      let tries = 0
      while (chosen.length < Math.min(numItms, products.length) && tries < 150) {
        tries++
        let r = rng(), cum = 0
        for (let j = 0; j < pW.length; j++) {
          cum += pW[j]
          if (r <= cum) {
            if (!usedIdx.has(j)) { usedIdx.add(j); chosen.push(products[j]) }
            break
          }
        }
      }
      if (chosen.length === 0) continue

      const items = []
      const stockSnap = []  // per-item { before, after } for CSV
      for (const pd of chosen) {
        const pid = pd._id.toString()

        // Quantity: base range × [0.6-1.4] noise × festival boost
        const rawQ = pd.qMin + rng() * (pd.qMax - pd.qMin)
        const qty  = Math.max(1, Math.round(rawQ * (0.6 + rng() * 0.8) * Math.min(festMul, 2.5)))
        // Unit price: ±4% variation
        const uPrice = Math.max(1, Math.round(pd.sp * (0.96 + rng() * 0.08)))
        const total  = uPrice * qty

        const before = stock[pid] ?? pd.mx
        const after  = before - qty
        stock[pid] = after

        items.push({ product: pd._id, productName: pd.name, sku: pd.sku, quantity: qty, unitPrice: uPrice, total })
        stockSnap.push({ before, after })

        smBuf.push({
          product: pd._id, productName: pd.name, type: 'sale',
          quantity: -qty, stockBefore: before, stockAfter: after,
          reference: invNum, referenceId: saleId, notes: SYN, date: saleDate,
        })

        totalItems++
        totalRevenue += total
        if (festival) festItems++
        prodCounts[pd.name] = (prodCounts[pd.name] || 0) + 1

        // Restock when stock falls below reorder level
        if (after < pd.rl) {
          const restockQty = pd.mx - Math.max(0, after)
          if (restockQty > 0) {
            const poId  = new mongoose.Types.ObjectId()
            const poNum = `SYN-PO-${String(poCnt++).padStart(6, '0')}`

            const poDate = new Date(saleDate)
            poDate.setDate(poDate.getDate() + 1 + Math.floor(rng() * pd.lt))

            const poBefore = stock[pid]
            const poAfter  = poBefore + restockQty
            stock[pid] = poAfter

            poBuf.push({
              _id:           poId,
              purchaseNumber: poNum,
              supplier:      pd.supId,
              items: [{ product: pd._id, productName: pd.name, sku: pd.sku,
                quantity: restockQty, buyingPrice: pd.bp, total: pd.bp * restockQty }],
              subtotal:      pd.bp * restockQty,
              discount:      0,
              grandTotal:    pd.bp * restockQty,
              paymentStatus: 'paid',
              paymentMethod: wPick(rng, PO_METHODS, PO_WEIGHTS),
              purchaseDate:  poDate,
              deliveryDate:  poDate,
              status:        'received',
              notes:         SYN,
            })

            poSmBuf.push({
              product: pd._id, productName: pd.name, type: 'purchase',
              quantity: restockQty, stockBefore: poBefore, stockAfter: poAfter,
              reference: poNum, referenceId: poId, notes: SYN, date: poDate,
            })
          }
        }
      }

      const subtotal    = items.reduce((s, it) => s + it.total, 0)
      const discount    = rng() < 0.25 ? Math.round(subtotal * (0.01 + rng() * 0.04)) : 0
      const grandTotal  = subtotal - discount
      const payMethod   = wPick(rng, PAY_METHODS, PAY_WEIGHTS)
      const custType    = wPick(rng, CUST_TYPES, CUST_WEIGHTS)

      saleBuf.push({
        _id:           saleId,
        invoiceNumber: invNum,
        items,
        subtotal,
        discount,
        tax:           0,
        grandTotal,
        paymentMethod: payMethod,
        customerName:  custType,
        notes:         SYN,
        saleDate,
        status:        'completed',
      })

      // ── Write one CSV row per line item ─────────────────────────────────────
      if (csvStream) {
        const dateStr     = cursor.toISOString().slice(0, 10)
        const yr2         = cursor.getFullYear()
        const m02         = cursor.getMonth()   // 0-11
        const dayOfMonth  = cursor.getDate()
        const dow2        = cursor.getDay()
        const weekOfYear  = Math.ceil(((cursor - new Date(yr2, 0, 1)) / 86400000 + 1) / 7)
        const quarter     = Math.floor(m02 / 3) + 1
        const isWeekend   = dow2 === 0 || dow2 === 6 ? 1 : 0
        const season2     = SEASONS[m02]
        const isFest      = festival ? 1 : 0
        const festName    = festival?.name ?? 'none'
        const trendFactor = Math.round((1 + (yr2 - startYear) * 0.07) * 1000) / 1000
        const discountPct = subtotal > 0 ? Math.round(discount / subtotal * 10000) / 100 : 0

        for (let ii = 0; ii < items.length; ii++) {
          const it  = items[ii]
          const sn  = stockSnap[ii]
          const pd  = prodMap[it.product.toString()]
          if (!pd) continue
          const marginPct = Math.round((it.unitPrice - pd.bp) / it.unitPrice * 10000) / 100
          csvStream.write([
            dateStr, yr2, m02 + 1, dayOfMonth, dow2, weekOfYear, quarter,
            isWeekend, csvQ(season2), isFest, csvQ(festName), festMul,
            csvQ(pd.sku), csvQ(pd.name), csvQ(pd.catName), csvQ(pd.unit),
            pd.per ? 1 : 0, pd.lt, pd.rl, pd.bp, pd.sp, it.unitPrice, marginPct,
            it.quantity, it.total, discountPct,
            csvQ(payMethod), csvQ(custType),
            sn.before, sn.after,
            items.length, trendFactor,
          ].join(',') + '\n')
        }
      }
    }

    cursor.setDate(cursor.getDate() + 1)

    // Flush every 800 invoices
    if (saleBuf.length >= 800 || cursor.getTime() > endMs) {
      await flush()
      if (process.env.NODE_ENV !== 'test') {
        process.stdout.write(`[synthetic] ${totalItems.toLocaleString()} items generated\r`)
      }
    }
  }

  return {
    totalItems,
    totalRevenue,
    festItems,
    finalStock: { ...stock },
    productSummary: Object.entries(prodCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, records_generated: count })),
  }
}

// ── Exported handlers ─────────────────────────────────────────────────────────

exports.getStatus = async (req, res) => {
  const saleCount = await Sale.countDocuments({ notes: SYN })
  if (saleCount === 0) {
    return res.json({ has_synthetic_data: false, total_records: 0, date_range_from: null, date_range_to: null, products: [] })
  }

  const [agg, earliest, latest, catIds] = await Promise.all([
    Sale.aggregate([{ $match: { notes: SYN } }, { $group: { _id: null, n: { $sum: { $size: '$items' } } } }]),
    Sale.findOne({ notes: SYN }).sort({ saleDate:  1 }).select('saleDate').lean(),
    Sale.findOne({ notes: SYN }).sort({ saleDate: -1 }).select('saleDate').lean(),
    Product.distinct('category', { description: SYN }),
  ])

  const catDocs = await Category.find({ _id: { $in: catIds } }).select('name').lean()

  res.json({
    has_synthetic_data: true,
    total_records:      agg[0]?.n ?? saleCount,
    date_range_from:    earliest?.saleDate?.toISOString().slice(0, 10) ?? null,
    date_range_to:      latest?.saleDate?.toISOString().slice(0, 10) ?? null,
    products:           catDocs.map(c => c.name),
  })
}

exports.generate = async (req, res) => {
  const { years = 3, replace_existing = false, random_seed } = req.body ?? {}

  if (replace_existing) {
    await Promise.all([
      Sale.deleteMany({ notes: SYN }),
      Purchase.deleteMany({ notes: SYN }),
      StockMovement.deleteMany({ notes: SYN }),
      Product.deleteMany({ description: SYN }),
    ])
  }

  const rng = mkRng(random_seed)
  const { catMap, supplierArr } = await ensureRefData()
  const products = await ensureProducts(catMap, supplierArr)

  const yrs       = Math.max(2, Math.min(5, Number(years) || 3))
  const endDate   = new Date(); endDate.setHours(0, 0, 0, 0); endDate.setDate(endDate.getDate() - 1)
  const startDate = new Date(endDate); startDate.setFullYear(endDate.getFullYear() - yrs)

  // Open CSV stream to project root
  const csvStream = fs.createWriteStream(CSV_PATH, { encoding: 'utf8', flags: 'w' })
  csvStream.write(CSV_HEADERS)

  let stats
  try {
    stats = await generateSales(products, startDate, endDate, rng, csvStream)
  } finally {
    await new Promise((resolve, reject) =>
      csvStream.end(err => err ? reject(err) : resolve())
    )
  }

  // Update currentStock for all synthetic products
  if (Object.keys(stats.finalStock).length > 0) {
    const bulkOps = Object.entries(stats.finalStock).map(([pid, stk]) => ({
      updateOne: {
        filter: { _id: new mongoose.Types.ObjectId(pid) },
        update: { $set: { currentStock: Math.max(0, Math.round(stk)) } },
      },
    }))
    await Product.bulkWrite(bulkOps)
  }

  const csvSizeMb = (() => {
    try { return (fs.statSync(CSV_PATH).size / 1048576).toFixed(1) } catch { return '?' }
  })()

  console.log(`\n[synthetic] Done — ${stats.totalItems.toLocaleString()} items | CSV: ${CSV_PATH} (${csvSizeMb} MB)`)

  res.json({
    records_generated:  stats.totalItems,
    total_revenue:      Math.round(stats.totalRevenue),
    date_range_from:    startDate.toISOString().slice(0, 10),
    date_range_to:      endDate.toISOString().slice(0, 10),
    festival_records:   stats.festItems,
    products:           stats.productSummary,
    training_data_path: CSV_PATH,
    training_data_size_mb: parseFloat(csvSizeMb),
  })
}

exports.clearSyntheticData = async (req, res) => {
  const [sc, pc, smc, prc] = await Promise.all([
    Sale.countDocuments({ notes: SYN }),
    Purchase.countDocuments({ notes: SYN }),
    StockMovement.countDocuments({ notes: SYN }),
    Product.countDocuments({ description: SYN }),
  ])

  await Promise.all([
    Sale.deleteMany({ notes: SYN }),
    Purchase.deleteMany({ notes: SYN }),
    StockMovement.deleteMany({ notes: SYN }),
    Product.deleteMany({ description: SYN }),
  ])

  // Remove the CSV export file if it exists
  try { fs.unlinkSync(CSV_PATH) } catch { /* already gone */ }

  res.json({ deleted: sc + pc + smc + prc })
}

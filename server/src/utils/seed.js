require('dotenv').config()
const mongoose = require('mongoose')
const bcrypt   = require('bcryptjs')

const User          = require('../models/User')
const Category      = require('../models/Category')
const Unit          = require('../models/Unit')
const Supplier      = require('../models/Supplier')
const Product       = require('../models/Product')
const Sale          = require('../models/Sale')
const Purchase      = require('../models/Purchase')
const StockMovement = require('../models/StockMovement')
const Alert         = require('../models/Alert')
const AuditLog      = require('../models/AuditLog')
const Notification  = require('../models/Notification')
const Setting       = require('../models/Setting')

const DB_NAME      = 'stockwise'
const COMPANY_NAME = 'Himalayan Wholesale Suppliers'
const DAYS         = 365   // one full year — long enough to cover the entire Nepali festival cycle once

async function connectDB() {
  await mongoose.connect(process.env.MONGO_URI, { dbName: DB_NAME })
  console.log(`Connected to MongoDB — ${DB_NAME}`)
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function daysAgo(n, hour = 10, min = 0) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, min, 0, 0)
  return d
}
function daysFromNow(n, hour = 10, min = 0) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  d.setHours(hour, min, 0, 0)
  return d
}

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }
function pick(arr)       { return arr[Math.floor(Math.random() * arr.length)] }
function inv(n)          { return `INV-${String(n).padStart(5, '0')}` }
function po(n)           { return `PO-${String(n).padStart(5, '0')}` }
function fmt(n)          { return Math.round(n).toLocaleString('en-IN') }

// ── Nepal demand seasonality ──────────────────────────────────────────────────
// Monthly multiplier, index 0=Jan..11=Dec — Dashain/Tihar month (Oct) dominates,
// monsoon (Jul/Aug) is the yearly slack period. Matches the pattern already used
// by the synthetic-data generator (synthetic.controller.js) so both datasets
// behave consistently.
const MONTHLY_MUL = [0.95, 0.90, 1.05, 1.10, 1.05, 0.90, 0.80, 0.75, 0.90, 2.20, 1.60, 1.00]

// Day-of-week multiplier, 0=Sun..6=Sat. Nepali grocery/kirana wholesalers commonly
// trade all 7 days — Saturday (the official weekly holiday) is when retail
// shopkeepers themselves are busiest serving walk-in customers, so it is their
// heaviest restocking day, not a quiet one.
const DOW_MUL = [0.90, 1.00, 0.95, 0.95, 1.10, 1.20, 1.40]

// Festival windows — year-aware so the simulation stays correct regardless of
// which year "today" falls in (a single hardcoded date table breaks silently
// once the calendar moves past it).
const CHHATH  = { 2021: [[11, 8, 11]], 2022: [[10, 30, 31], [11, 1, 3]], 2023: [[11, 19, 22]], 2024: [[11, 7, 10]], 2025: [[10, 27, 30]], 2026: [[11, 15, 18]] }
const DASHAIN = { 2021: [10, 6, 16], 2022: [9, 26, null, 10, 1, 6], 2023: [10, 14, 24], 2024: [10, 2, 12], 2025: [9, 22, null, 10, 1, 2], 2026: [10, 11, 21] }
const TIHAR   = { 2021: [10, 30, null, 11, 1, 4], 2022: [10, 26, 30], 2023: [11, 12, 16], 2024: [11, 1, 5], 2025: [10, 20, 24], 2026: [11, 8, 12] }
const HOLI    = { 2021: [3, 28, 30], 2022: [3, 17, 19], 2023: [3, 7, 9], 2024: [3, 24, 26], 2025: [3, 13, 15], 2026: [3, 2, 4] }

function inRange(m, d, spec) {
  if (!spec) return false
  if (spec.length === 3) return m === spec[0] && d >= spec[1] && d <= spec[2]
  return (m === spec[0] && d >= spec[1]) || (m === spec[3] && d >= spec[4] && d <= spec[5])
}

function getNepalFestival(date) {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate()
  if (m === 1 && d >= 13 && d <= 16) return { name: 'maghe_sankranti', label: 'Maghe Sankranti', mul: 1.6 }
  if (m === 2 && d >= 15 && d <= 22) return { name: 'shivaratri', label: 'Shivaratri', mul: 1.3 }
  const h = HOLI[y]
  if (h && m === h[0] && d >= h[1] && d <= h[2]) return { name: 'holi', label: 'Holi', mul: 1.8 }
  if (m === 4 && d >= 13 && d <= 16) return { name: 'nepali_new_year', label: 'Nepali New Year', mul: 1.7 }
  if (m === 5 && d >= 14 && d <= 17) return { name: 'buddha_jayanti', label: 'Buddha Jayanti', mul: 1.2 }
  if ((m === 8 && d >= 28) || (m === 9 && d <= 6)) return { name: 'teej', label: 'Teej', mul: 2.0 }
  if (m === 9 && d >= 10 && d <= 17) return { name: 'indra_jatra', label: 'Indra Jatra', mul: 1.3 }
  if (inRange(m, d, DASHAIN[y])) return { name: 'dashain', label: 'Dashain', mul: 3.5 }
  if (inRange(m, d, TIHAR[y]))   return { name: 'tihar', label: 'Tihar', mul: 2.8 }
  const cw = CHHATH[y] || []
  if (cw.some(([cm, cd1, cd2]) => m === cm && d >= cd1 && d <= cd2)) return { name: 'chhath', label: 'Chhath', mul: 1.5 }
  if (m === 12 && d >= 24 && d <= 26) return { name: 'christmas', label: 'Christmas', mul: 1.1 }
  if ((m === 12 && d >= 30) || (m === 1 && d <= 2)) return { name: 'new_year', label: 'New Year', mul: 1.2 }
  return null
}

function dayMultiplier(date) {
  const festival = getNepalFestival(date)
  const total = MONTHLY_MUL[date.getMonth()] * DOW_MUL[date.getDay()] * (festival ? festival.mul : 1.0)
  return { total, festival }
}

async function bulkInsert(Model, docs, label) {
  if (docs.length === 0) return
  console.log(`  Inserting ${docs.length} ${label}...`)
  const CHUNK = 2000
  for (let i = 0; i < docs.length; i += CHUNK) {
    await Model.insertMany(docs.slice(i, i + CHUNK), { ordered: false })
  }
}

// ─── 1. USERS ─────────────────────────────────────────────────────────────────
async function seedUsers() {
  const specs = [
    { fullName: 'Bikram Sharma',  email: 'admin@himalayan.np',   password: 'Admin@1234',   role: 'admin',             phone: '9841234567' },
    { fullName: 'Ram Prasad KC',  email: 'ram@himalayan.np',     password: 'Manager@1234', role: 'inventory_manager', phone: '9852345678' },
    { fullName: 'Sita Maharjan',  email: 'sita@himalayan.np',    password: 'Staff1234',    role: 'staff',             phone: '9863456789' },
  ]
  const ids = {}
  for (const s of specs) {
    let u = await User.findOne({ email: s.email })
    if (!u) {
      u = await User.create(s)
      console.log(`  ✓ User: ${s.email}`)
    } else {
      console.log(`  - Exists: ${s.email}`)
    }
    ids[s.role] = u._id
  }
  return ids
}

// ─── 2. SETTINGS ──────────────────────────────────────────────────────────────
async function seedSettings() {
  const settings = [
    { key: 'company.name',     value: COMPANY_NAME,                   group: 'company', label: 'Company Name' },
    { key: 'company.industry', value: 'Wholesale Grocery',             group: 'company', label: 'Industry' },
    { key: 'company.address',  value: 'Kalimati, Kathmandu 44600',     group: 'company', label: 'Address' },
    { key: 'company.phone',    value: '01-4101234',                    group: 'company', label: 'Phone' },
    { key: 'company.email',    value: 'info@himalayan.np',             group: 'company', label: 'Email' },
    { key: 'company.pan',      value: '300123456',                     group: 'company', label: 'PAN Number' },
    { key: 'currency.code',    value: 'NPR',                           group: 'finance', label: 'Currency Code' },
    { key: 'currency.symbol',  value: 'Rs.',                           group: 'finance', label: 'Currency Symbol' },
    { key: 'tax.rate',         value: 13,                              group: 'finance', label: 'VAT Rate (%)' },
    { key: 'invoice.prefix',   value: 'INV',                           group: 'invoice', label: 'Invoice Prefix' },
    { key: 'po.prefix',        value: 'PO',                            group: 'invoice', label: 'PO Prefix' },
    { key: 'setup.completed',  value: true,                            group: 'system',  label: 'Initial Setup Done' },
  ]
  for (const s of settings) {
    await Setting.findOneAndUpdate({ key: s.key }, s, { upsert: true, new: true })
  }
  console.log(`  ✓ ${settings.length} settings`)
}

// ─── 3. CATEGORIES ────────────────────────────────────────────────────────────
async function seedCategories() {
  const specs = [
    { name: 'Grains & Pulses',     description: 'Rice, wheat, lentils, corn, barley, chickpeas' },
    { name: 'Edible Oils',         description: 'Mustard oil, sunflower oil, ghee, vanaspati' },
    { name: 'Spices & Masala',     description: 'Dry spices, ground masalas, whole spices' },
    { name: 'Sugar & Sweeteners',  description: 'Sugar, jaggery, honey, molasses' },
    { name: 'Salt & Condiments',   description: 'Salt, vinegar, soya sauce, ketchup' },
    { name: 'Dairy Products',      description: 'Milk powder, butter, cheese, paneer' },
    { name: 'Beverages',           description: 'Tea, coffee, instant drinks, squash' },
    { name: 'Soft Drinks',         description: 'Carbonated beverages, energy drinks, juices' },
    { name: 'Noodles & Pasta',     description: 'Instant noodles, vermicelli, spaghetti, macaroni' },
    { name: 'Biscuits & Snacks',   description: 'Biscuits, cookies, chips, crackers, namkeen' },
    { name: 'Soap & Detergent',    description: 'Bathing soap, dish soap, laundry detergent, sanitizer' },
    { name: 'Personal Care',       description: 'Shampoo, toothpaste, lotion, sanitary products' },
    { name: 'Flours & Starches',   description: 'Maida, besan, cornstarch, rice flour' },
    { name: 'Canned & Preserved',  description: 'Tomato paste, canned goods, pickles, jams' },
    { name: 'Cleaning Products',   description: 'Floor cleaner, toilet cleaner, surface spray' },
  ]
  const map = {}
  const existing = await Category.find({})
  existing.forEach(c => { map[c.name] = c._id })

  for (const s of specs) {
    if (!map[s.name]) {
      const c = await Category.create(s)
      map[s.name] = c._id
    }
  }
  console.log(`  ✓ ${Object.keys(map).length} categories`)
  return map
}

// ─── 4. UNITS ─────────────────────────────────────────────────────────────────
async function seedUnits() {
  const specs = [
    { name: 'Kilogram',  symbol: 'kg',  unitType: 'weight', description: 'Standard weight unit',     isSystem: true },
    { name: 'Gram',      symbol: 'g',   unitType: 'weight', description: 'Small weight',             isSystem: true },
    { name: 'Liter',     symbol: 'L',   unitType: 'volume', description: 'Standard liquid volume',   isSystem: true },
    { name: 'Milliliter',symbol: 'mL',  unitType: 'volume', description: 'Small liquid volume',      isSystem: true },
    { name: 'Piece',     symbol: 'pcs', unitType: 'count',  description: 'Individual item',          isSystem: true },
    { name: 'Pack',      symbol: 'pk',  unitType: 'count',  description: 'Packaged/wrapped unit',    isSystem: false },
    { name: 'Bag',       symbol: 'bag', unitType: 'count',  description: 'Sack or bag',              isSystem: false },
    { name: 'Carton',    symbol: 'ctn', unitType: 'count',  description: 'Box/carton of items',      isSystem: false },
  ]
  const map = {}
  for (const s of specs) {
    let u = await Unit.findOne({ name: s.name })
    if (!u) u = await Unit.create(s)
    map[s.name] = s.symbol
  }
  console.log(`  ✓ ${specs.length} units`)
  return map
}

// ─── 5. SUPPLIERS ─────────────────────────────────────────────────────────────
async function seedSuppliers() {
  const specs = [
    { name: 'Nepal Food Corporation',  contactPerson: 'Dilip Shrestha',  phone: '01-4231567', email: 'nfc@nepal.gov.np',      address: 'Balaju, Kathmandu',       district: 'Kathmandu', leadTimeDays: 3,  paymentTerms: 'credit_30', status: 'active', rating: 5 },
    { name: 'Himalayan Traders Pvt',   contactPerson: 'Binod Acharya',   phone: '01-4567890', email: 'info@himtrade.np',       address: 'Kalimati, Kathmandu',     district: 'Kathmandu', leadTimeDays: 3,  paymentTerms: 'credit_30', status: 'active', rating: 4 },
    { name: 'Everest Supplies Ltd',    contactPerson: 'Ram Bahadur KC',  phone: '01-5348920', email: 'everest@supply.np',      address: 'Koteshwor, Kathmandu',    district: 'Kathmandu', leadTimeDays: 5,  paymentTerms: 'credit_15', status: 'active', rating: 4 },
    { name: 'Bagmati Agro Products',   contactPerson: 'Kamala Thapa',    phone: '01-6789012', email: 'bagmati@agro.np',        address: 'Sitapaila, Kathmandu',    district: 'Kathmandu', leadTimeDays: 4,  paymentTerms: 'cash',      status: 'active', rating: 3 },
    { name: 'Pokhara Agro Mart',       contactPerson: 'Sushila Poudel',  phone: '061-234567', email: 'agro@pokharamart.np',    address: 'Lakeside, Pokhara',       district: 'Kaski',     leadTimeDays: 14, paymentTerms: 'credit_30', status: 'active', rating: 4 },
    { name: 'Janakpur Wholesale Hub',  contactPerson: 'Rajan Yadav',     phone: '041-567890', email: 'jnk@wholesale.np',       address: 'Main Bazar, Janakpur',    district: 'Dhanusha',  leadTimeDays: 10, paymentTerms: 'credit_15', status: 'active', rating: 3 },
    { name: 'Biratnagar Trade Center', contactPerson: 'Suresh Jha',      phone: '021-678901', email: 'btc@biratnagar.np',      address: 'Traffic Chowk, Biratnagar', district: 'Morang',  leadTimeDays: 12, paymentTerms: 'credit_30', status: 'active', rating: 4 },
    { name: 'Chitwan Food Mart',       contactPerson: 'Gita Ghimire',    phone: '056-456789', email: 'cfm@chitwan.np',         address: 'Narayangadh, Chitwan',    district: 'Chitwan',   leadTimeDays: 8,  paymentTerms: 'cash',      status: 'active', rating: 3 },
    { name: 'Kathmandu Soap Factory',  contactPerson: 'Ashok Manandhar', phone: '01-4890123', email: 'ksf@soap.np',            address: 'Patan Industrial, Lalitpur', district: 'Lalitpur',leadTimeDays: 5,  paymentTerms: 'credit_15', status: 'active', rating: 4 },
    { name: 'Terai Spice Company',     contactPerson: 'Mohan Chaudhary', phone: '071-345678', email: 'tsc@teraispice.np',      address: 'Biratnagar Road, Itahari', district: 'Sunsari',  leadTimeDays: 7,  paymentTerms: 'credit_30', status: 'active', rating: 4 },
    { name: 'Summit Beverages',        contactPerson: 'Nabin Karki',     phone: '01-5670234', email: 'summit@beverages.np',    address: 'Thapathali, Kathmandu',   district: 'Kathmandu', leadTimeDays: 4,  paymentTerms: 'cash',      status: 'active', rating: 5 },
    { name: 'Valley Dairy Co-op',      contactPerson: 'Puja Tamang',     phone: '01-4451239', email: 'dairy@valley.np',        address: 'Balaju, Kathmandu',       district: 'Kathmandu', leadTimeDays: 2,  paymentTerms: 'cash',      status: 'active', rating: 4 },
  ]
  const map = {}
  for (const s of specs) {
    let sup = await Supplier.findOne({ name: s.name })
    if (!sup) sup = await Supplier.create(s)
    map[s.name] = sup._id
  }
  console.log(`  ✓ ${specs.length} suppliers`)
  return map
}

// ─── 6. PRODUCTS (79) ─────────────────────────────────────────────────────────
// Demand weight (relative sales frequency), brand (only for genuinely branded
// packaged goods — bulk staples like rice/dal/spices are sold generically at
// wholesale, matching real Nepali distribution practice), and storage location
// are applied as an enrichment pass keyed by SKU/category so the base product
// list below stays readable.
const DEMAND_WEIGHT = {
  'RICE-BASMATI-5KG': 9, 'RICE-IR36-25KG': 6, 'RICE-CHINI-5KG': 7, 'WHEAT-ATTA-10KG': 9,
  'DAAL-MUNG-1KG': 7, 'DAAL-MASUR-1KG': 7, 'DAAL-CHANA-1KG': 6, 'DAAL-TOOR-1KG': 5,
  'CORN-MAIZE-5KG': 3, 'CHICKPEA-1KG': 4,
  'OIL-MUSTARD-1L': 9, 'OIL-MUSTARD-5L': 5, 'OIL-SUNFLR-1L': 8, 'OIL-SUNFLR-5L': 4,
  'OIL-GHEE-500G': 5, 'OIL-VANASPATI-1KG': 6,
  'SPICE-CUMIN-100G': 7, 'SPICE-CHILI-100G': 8, 'SPICE-GMSAL-50G': 6, 'SPICE-TURMR-100G': 8,
  'SPICE-CORIAN-100G': 7, 'SPICE-CARDM-50G': 3,
  'SUGAR-WHITE-1KG': 9, 'SUGAR-WHITE-5KG': 6, 'JAGGERY-500G': 5, 'HONEY-500G': 3,
  'SALT-IODIZED-1KG': 9, 'SALT-ROCK-1KG': 4, 'KETCHUP-1KG': 5, 'VINEGAR-500ML': 4,
  'MILKPOW-FULL-500G': 6, 'MILKPOW-SKIM-500G': 4, 'BUTTER-200G': 5, 'CHEESE-200G': 4,
  'TEA-ILAM-250G': 8, 'TEA-CTC-500G': 7, 'TEA-GREEN-100G': 3, 'COFFEE-INST-50G': 6,
  'HORLICKS-500G': 5, 'OVALTINE-500G': 3,
  'COKE-330ML-12PK': 7, 'SPRITE-330ML-12PK': 6, 'PEPSI-330ML-12PK': 6, 'JUICE-MANGO-1L': 6, 'NIMBU-500ML': 5,
  'NOODLE-WAIW-75G': 9, 'NOODLE-MAGI-70G': 9, 'VERMICL-200G': 4, 'MACARONI-500G': 4,
  'BISCUIT-PRLG-800G': 9, 'BISCUIT-MARIE-400G': 6, 'BISCUIT-GOOD-200G': 5, 'CHIPS-KURKURE-30G': 7,
  'NAMKEEN-MIX-200G': 5, 'POPCORN-100G': 3,
  'SOAP-LIVELY-75G': 8, 'SOAP-LIFEBUOY-75G': 8, 'SOAP-DISH-500ML': 7, 'DETGNT-TIDE-1KG': 7,
  'DETGNT-ARIEL-500G': 5, 'SANITIZER-500ML': 4,
  'SHAMPOO-HNS-340ML': 5, 'TOOTHP-COLG-150G': 8, 'TOOTHBRSH-MED': 6, 'LOTION-VASLN-200ML': 4,
  'FLOUR-MAIDA-5KG': 7, 'FLOUR-BESAN-1KG': 6, 'FLOUR-RICE-1KG': 4, 'CORN-STARCH-500G': 3,
  'TOMATO-PASTE-200G': 5, 'MANGO-PICKLE-500G': 5, 'STRAWBERRY-JAM-500G': 3, 'SOYA-SAUCE-300ML': 4,
  'FLOOR-CLN-500ML': 5, 'TOILET-CLN-500ML': 5, 'SURFCE-SPRAY-400ML': 3, 'NAPHTHALENE-100G': 4,
  'SCRUBBER-STEEL': 3, 'DUSTBIN-10L': 2,
}

const BRAND = {
  'COFFEE-INST-50G': 'Nestlé', 'HORLICKS-500G': 'GSK Consumer Healthcare', 'OVALTINE-500G': 'Associated British Foods',
  'COKE-330ML-12PK': 'Coca-Cola Company', 'SPRITE-330ML-12PK': 'Coca-Cola Company', 'PEPSI-330ML-12PK': 'PepsiCo',
  'JUICE-MANGO-1L': 'Real (Dabur)', 'NOODLE-WAIW-75G': 'Wai Wai (CG Foods)', 'NOODLE-MAGI-70G': 'Nestlé',
  'BISCUIT-PRLG-800G': 'Parle Products', 'BISCUIT-MARIE-400G': 'Britannia', 'BISCUIT-GOOD-200G': 'Britannia',
  'CHIPS-KURKURE-30G': 'PepsiCo', 'SOAP-LIVELY-75G': 'Unilever Nepal', 'SOAP-LIFEBUOY-75G': 'Unilever',
  'SOAP-DISH-500ML': 'Hindustan Unilever (Vim)', 'DETGNT-TIDE-1KG': 'Procter & Gamble', 'DETGNT-ARIEL-500G': 'Procter & Gamble',
  'SHAMPOO-HNS-340ML': 'Procter & Gamble', 'TOOTHP-COLG-150G': 'Colgate-Palmolive', 'TOOTHBRSH-MED': 'Colgate-Palmolive',
  'LOTION-VASLN-200ML': 'Unilever (Vaseline)', 'MILKPOW-FULL-500G': 'Amul (GCMMF)', 'MILKPOW-SKIM-500G': 'Amul (GCMMF)',
  'BUTTER-200G': 'Amul (GCMMF)', 'CHEESE-200G': 'Amul (GCMMF)', 'SANITIZER-500ML': 'Dettol (Reckitt)',
}

const STORAGE_BY_CATEGORY = {
  'Grains & Pulses':    'Warehouse A – Bulk Grains Section',
  'Edible Oils':        'Warehouse A – Liquids & Oils Rack',
  'Spices & Masala':    'Warehouse B – Spices Shelf',
  'Sugar & Sweeteners': 'Warehouse A – Sugar & Sweeteners Rack',
  'Salt & Condiments':  'Warehouse B – Condiments Shelf',
  'Dairy Products':     'Cold Storage Unit 1',
  'Beverages':          'Warehouse B – Beverages Shelf',
  'Soft Drinks':        'Warehouse C – Soft Drinks Storage',
  'Noodles & Pasta':    'Warehouse B – Noodles & Pasta Shelf',
  'Biscuits & Snacks':  'Warehouse B – Snacks Shelf',
  'Soap & Detergent':   'Warehouse C – Soap & Detergent Rack',
  'Personal Care':      'Warehouse C – Personal Care Shelf',
  'Flours & Starches':  'Warehouse A – Flours Section',
  'Canned & Preserved': 'Warehouse B – Canned Goods Shelf',
  'Cleaning Products':  'Warehouse C – Cleaning Supplies Rack',
}

// Genuinely perishable in this catalog — processed dairy with a finite (if long) shelf life.
// Bulk staples/spices/oils/ghee are shelf-stable and correctly left non-perishable.
const PERISHABLE_SKUS = new Set(['MILKPOW-FULL-500G', 'MILKPOW-SKIM-500G', 'BUTTER-200G', 'CHEESE-200G'])

function enrichProducts(specs, catNameById) {
  return specs.map((s, i) => {
    const catName = catNameById[String(s.category)]
    const enriched = {
      ...s,
      barcode: `894${String(i + 1).padStart(10, '0')}`,
      storageLocation: STORAGE_BY_CATEGORY[catName] || 'Warehouse A – General Storage',
    }
    if (BRAND[s.sku]) enriched.brand = BRAND[s.sku]
    if (PERISHABLE_SKUS.has(s.sku)) {
      enriched.isPerishable = true
      // One perishable SKU is deliberately near-expiry so the 'expiry' alert type
      // has a real, demonstrable example rather than only ever firing by chance.
      enriched.expiryDate = s.sku === 'CHEESE-200G' ? daysFromNow(rand(8, 18)) : daysFromNow(rand(90, 270))
    }
    return enriched
  })
}

async function seedProducts(cats, sups) {
  const C = cats
  const S = sups
  const NFC = S['Nepal Food Corporation'], HIM = S['Himalayan Traders Pvt'], EVR = S['Everest Supplies Ltd']
  const BAG = S['Bagmati Agro Products'],  POK = S['Pokhara Agro Mart'],     JNK = S['Janakpur Wholesale Hub']
  const BIR = S['Biratnagar Trade Center'],CHI = S['Chitwan Food Mart'],     KSF = S['Kathmandu Soap Factory']
  const TSC = S['Terai Spice Company'],    SUM = S['Summit Beverages'],      DAI = S['Valley Dairy Co-op']

  const rawSpecs = [
    // ── Grains & Pulses ──────────────────────────────────────────────────────
    { sku:'RICE-BASMATI-5KG',  name:'Basmati Rice 5kg Bag',        category:C['Grains & Pulses'],   supplier:NFC,  unit:'bag',  buyingPrice:480,  sellingPrice:580,  currentStock:150, minStock:20, maxStock:300, reorderLevel:40,  leadTimeDays:3,  description:'Long grain aromatic basmati rice' },
    { sku:'RICE-IR36-25KG',    name:'IR-36 Rice 25kg Sack',        category:C['Grains & Pulses'],   supplier:NFC,  unit:'bag',  buyingPrice:1850, sellingPrice:2200, currentStock:80,  minStock:10, maxStock:150, reorderLevel:20,  leadTimeDays:3  },
    { sku:'RICE-CHINI-5KG',    name:'Chini Rice 5kg',              category:C['Grains & Pulses'],   supplier:HIM,  unit:'bag',  buyingPrice:420,  sellingPrice:510,  currentStock:100, minStock:15, maxStock:200, reorderLevel:30,  leadTimeDays:3  },
    { sku:'WHEAT-ATTA-10KG',   name:'Wheat Atta 10kg Bag',         category:C['Grains & Pulses'],   supplier:NFC,  unit:'bag',  buyingPrice:490,  sellingPrice:590,  currentStock:120, minStock:20, maxStock:250, reorderLevel:40,  leadTimeDays:3  },
    { sku:'DAAL-MUNG-1KG',     name:'Moong Dal 1kg',               category:C['Grains & Pulses'],   supplier:HIM,  unit:'kg',   buyingPrice:125,  sellingPrice:160,  currentStock:90,  minStock:15, maxStock:200, reorderLevel:30,  leadTimeDays:3  },
    { sku:'DAAL-MASUR-1KG',    name:'Masoor Dal 1kg',              category:C['Grains & Pulses'],   supplier:HIM,  unit:'kg',   buyingPrice:105,  sellingPrice:135,  currentStock:70,  minStock:15, maxStock:200, reorderLevel:30,  leadTimeDays:3  },
    { sku:'DAAL-CHANA-1KG',    name:'Chana Dal 1kg',               category:C['Grains & Pulses'],   supplier:HIM,  unit:'kg',   buyingPrice:115,  sellingPrice:148,  currentStock:60,  minStock:15, maxStock:150, reorderLevel:25,  leadTimeDays:3  },
    { sku:'DAAL-TOOR-1KG',     name:'Toor Dal 1kg',                category:C['Grains & Pulses'],   supplier:BAG,  unit:'kg',   buyingPrice:130,  sellingPrice:168,  currentStock:55,  minStock:10, maxStock:150, reorderLevel:20,  leadTimeDays:4  },
    { sku:'CORN-MAIZE-5KG',    name:'Yellow Maize 5kg',            category:C['Grains & Pulses'],   supplier:JNK,  unit:'bag',  buyingPrice:220,  sellingPrice:275,  currentStock:40,  minStock:10, maxStock:120, reorderLevel:15,  leadTimeDays:10 },
    { sku:'CHICKPEA-1KG',      name:'White Chickpea 1kg',          category:C['Grains & Pulses'],   supplier:POK,  unit:'kg',   buyingPrice:140,  sellingPrice:178,  currentStock:45,  minStock:10, maxStock:120, reorderLevel:20,  leadTimeDays:14 },

    // ── Edible Oils ──────────────────────────────────────────────────────────
    { sku:'OIL-MUSTARD-1L',    name:'Mustard Oil 1 Liter',         category:C['Edible Oils'],       supplier:EVR,  unit:'L',    buyingPrice:215,  sellingPrice:265,  currentStock:110, minStock:20, maxStock:250, reorderLevel:40,  leadTimeDays:5  },
    { sku:'OIL-MUSTARD-5L',    name:'Mustard Oil 5 Liter Jar',     category:C['Edible Oils'],       supplier:EVR,  unit:'L',    buyingPrice:980,  sellingPrice:1200, currentStock:50,  minStock:10, maxStock:120, reorderLevel:20,  leadTimeDays:5  },
    { sku:'OIL-SUNFLR-1L',     name:'Sunflower Oil 1 Liter',       category:C['Edible Oils'],       supplier:HIM,  unit:'L',    buyingPrice:195,  sellingPrice:245,  currentStock:85,  minStock:15, maxStock:200, reorderLevel:30,  leadTimeDays:3  },
    { sku:'OIL-SUNFLR-5L',     name:'Sunflower Oil 5 Liter',       category:C['Edible Oils'],       supplier:HIM,  unit:'L',    buyingPrice:920,  sellingPrice:1140, currentStock:35,  minStock:8,  maxStock:100, reorderLevel:15,  leadTimeDays:3  },
    { sku:'OIL-GHEE-500G',     name:'Pure Cow Ghee 500g',          category:C['Edible Oils'],       supplier:DAI,  unit:'pcs',  buyingPrice:380,  sellingPrice:470,  currentStock:40,  minStock:10, maxStock:100, reorderLevel:20,  leadTimeDays:2  },
    { sku:'OIL-VANASPATI-1KG', name:'Vanaspati Ghee 1kg',          category:C['Edible Oils'],       supplier:NFC,  unit:'kg',   buyingPrice:195,  sellingPrice:245,  currentStock:60,  minStock:10, maxStock:150, reorderLevel:20,  leadTimeDays:3  },

    // ── Spices & Masala ──────────────────────────────────────────────────────
    { sku:'SPICE-CUMIN-100G',  name:'Jeera (Cumin Seeds) 100g',    category:C['Spices & Masala'],   supplier:TSC,  unit:'pk',   buyingPrice:38,   sellingPrice:58,   currentStock:220, minStock:30, maxStock:500, reorderLevel:60,  leadTimeDays:7  },
    { sku:'SPICE-CHILI-100G',  name:'Red Chili Powder 100g',       category:C['Spices & Masala'],   supplier:TSC,  unit:'pk',   buyingPrice:42,   sellingPrice:68,   currentStock:180, minStock:30, maxStock:400, reorderLevel:60,  leadTimeDays:7  },
    { sku:'SPICE-GMSAL-50G',   name:'Garam Masala 50g',            category:C['Spices & Masala'],   supplier:HIM,  unit:'pk',   buyingPrice:58,   sellingPrice:90,   currentStock:200, minStock:30, maxStock:400, reorderLevel:60,  leadTimeDays:3  },
    { sku:'SPICE-TURMR-100G',  name:'Turmeric Powder 100g',        category:C['Spices & Masala'],   supplier:TSC,  unit:'pk',   buyingPrice:32,   sellingPrice:52,   currentStock:250, minStock:40, maxStock:500, reorderLevel:70,  leadTimeDays:7  },
    { sku:'SPICE-CORIAN-100G', name:'Coriander Powder 100g',       category:C['Spices & Masala'],   supplier:TSC,  unit:'pk',   buyingPrice:35,   sellingPrice:55,   currentStock:190, minStock:30, maxStock:400, reorderLevel:60,  leadTimeDays:7  },
    { sku:'SPICE-CARDM-50G',   name:'Cardamom (Elaichi) 50g',      category:C['Spices & Masala'],   supplier:HIM,  unit:'pk',   buyingPrice:350,  sellingPrice:470,  currentStock:80,  minStock:10, maxStock:150, reorderLevel:20,  leadTimeDays:3  },

    // ── Sugar & Sweeteners ───────────────────────────────────────────────────
    { sku:'SUGAR-WHITE-1KG',   name:'White Sugar 1kg',             category:C['Sugar & Sweeteners'],supplier:NFC,  unit:'kg',   buyingPrice:72,   sellingPrice:92,   currentStock:350, minStock:50, maxStock:700, reorderLevel:100, leadTimeDays:3  },
    { sku:'SUGAR-WHITE-5KG',   name:'White Sugar 5kg Bag',         category:C['Sugar & Sweeteners'],supplier:NFC,  unit:'bag',  buyingPrice:340,  sellingPrice:430,  currentStock:120, minStock:20, maxStock:300, reorderLevel:40,  leadTimeDays:3  },
    { sku:'JAGGERY-500G',      name:'Brown Jaggery (Gur) 500g',    category:C['Sugar & Sweeteners'],supplier:JNK,  unit:'pcs',  buyingPrice:55,   sellingPrice:80,   currentStock:100, minStock:15, maxStock:200, reorderLevel:30,  leadTimeDays:10 },
    { sku:'HONEY-500G',        name:'Himalayan Honey 500g',        category:C['Sugar & Sweeteners'],supplier:HIM,  unit:'pcs',  buyingPrice:480,  sellingPrice:620,  currentStock:30,  minStock:5,  maxStock:80,  reorderLevel:10,  leadTimeDays:3  },

    // ── Salt & Condiments ────────────────────────────────────────────────────
    { sku:'SALT-IODIZED-1KG',  name:'Iodized Salt 1kg',            category:C['Salt & Condiments'], supplier:NFC,  unit:'kg',   buyingPrice:24,   sellingPrice:35,   currentStock:500, minStock:60, maxStock:800, reorderLevel:100, leadTimeDays:3  },
    { sku:'SALT-ROCK-1KG',     name:'Rock Salt (Sendha) 1kg',      category:C['Salt & Condiments'], supplier:HIM,  unit:'kg',   buyingPrice:40,   sellingPrice:60,   currentStock:120, minStock:20, maxStock:300, reorderLevel:40,  leadTimeDays:3  },
    { sku:'KETCHUP-1KG',       name:'Tomato Ketchup 1kg',          category:C['Salt & Condiments'], supplier:EVR,  unit:'pcs',  buyingPrice:145,  sellingPrice:185,  currentStock:60,  minStock:10, maxStock:150, reorderLevel:20,  leadTimeDays:5  },
    { sku:'VINEGAR-500ML',     name:'White Vinegar 500ml',         category:C['Salt & Condiments'], supplier:EVR,  unit:'pcs',  buyingPrice:50,   sellingPrice:75,   currentStock:80,  minStock:10, maxStock:200, reorderLevel:20,  leadTimeDays:5  },

    // ── Dairy Products ───────────────────────────────────────────────────────
    { sku:'MILKPOW-FULL-500G', name:'Full Cream Milk Powder 500g', category:C['Dairy Products'],    supplier:DAI,  unit:'pcs',  buyingPrice:340,  sellingPrice:420,  currentStock:70,  minStock:15, maxStock:150, reorderLevel:25,  leadTimeDays:2  },
    { sku:'MILKPOW-SKIM-500G', name:'Skimmed Milk Powder 500g',    category:C['Dairy Products'],    supplier:DAI,  unit:'pcs',  buyingPrice:310,  sellingPrice:390,  currentStock:50,  minStock:10, maxStock:120, reorderLevel:20,  leadTimeDays:2  },
    { sku:'BUTTER-200G',       name:'Amul Butter 200g',            category:C['Dairy Products'],    supplier:DAI,  unit:'pcs',  buyingPrice:175,  sellingPrice:220,  currentStock:45,  minStock:10, maxStock:100, reorderLevel:20,  leadTimeDays:2  },
    { sku:'CHEESE-200G',       name:'Processed Cheese 200g',       category:C['Dairy Products'],    supplier:DAI,  unit:'pcs',  buyingPrice:195,  sellingPrice:250,  currentStock:30,  minStock:8,  maxStock:80,  reorderLevel:15,  leadTimeDays:2  },

    // ── Beverages ────────────────────────────────────────────────────────────
    { sku:'TEA-ILAM-250G',     name:'Ilam Orthodox Tea 250g',      category:C['Beverages'],         supplier:HIM,  unit:'pk',   buyingPrice:195,  sellingPrice:255,  currentStock:80,  minStock:15, maxStock:200, reorderLevel:30,  leadTimeDays:3  },
    { sku:'TEA-CTC-500G',      name:'CTC Dust Tea 500g',           category:C['Beverages'],         supplier:HIM,  unit:'pk',   buyingPrice:290,  sellingPrice:370,  currentStock:60,  minStock:10, maxStock:150, reorderLevel:20,  leadTimeDays:3  },
    { sku:'TEA-GREEN-100G',    name:'Green Tea 100g',              category:C['Beverages'],         supplier:HIM,  unit:'pk',   buyingPrice:180,  sellingPrice:240,  currentStock:40,  minStock:8,  maxStock:100, reorderLevel:15,  leadTimeDays:3  },
    { sku:'COFFEE-INST-50G',   name:'Nescafe Instant Coffee 50g',  category:C['Beverages'],         supplier:SUM,  unit:'pcs',  buyingPrice:220,  sellingPrice:290,  currentStock:50,  minStock:10, maxStock:120, reorderLevel:20,  leadTimeDays:4  },
    { sku:'HORLICKS-500G',     name:'Horlicks 500g',               category:C['Beverages'],         supplier:SUM,  unit:'pcs',  buyingPrice:360,  sellingPrice:450,  currentStock:35,  minStock:8,  maxStock:80,  reorderLevel:15,  leadTimeDays:4  },
    { sku:'OVALTINE-500G',     name:'Ovaltine 500g',               category:C['Beverages'],         supplier:SUM,  unit:'pcs',  buyingPrice:320,  sellingPrice:405,  currentStock:25,  minStock:5,  maxStock:60,  reorderLevel:10,  leadTimeDays:4  },

    // ── Soft Drinks ──────────────────────────────────────────────────────────
    { sku:'COKE-330ML-12PK',   name:'Coca-Cola 330ml x12',         category:C['Soft Drinks'],       supplier:SUM,  unit:'ctn',  buyingPrice:680,  sellingPrice:840,  currentStock:40,  minStock:8,  maxStock:100, reorderLevel:15,  leadTimeDays:4  },
    { sku:'SPRITE-330ML-12PK', name:'Sprite 330ml x12',            category:C['Soft Drinks'],       supplier:SUM,  unit:'ctn',  buyingPrice:660,  sellingPrice:820,  currentStock:35,  minStock:8,  maxStock:80,  reorderLevel:12,  leadTimeDays:4  },
    { sku:'PEPSI-330ML-12PK',  name:'Pepsi 330ml x12',             category:C['Soft Drinks'],       supplier:SUM,  unit:'ctn',  buyingPrice:650,  sellingPrice:810,  currentStock:30,  minStock:8,  maxStock:80,  reorderLevel:12,  leadTimeDays:4  },
    { sku:'JUICE-MANGO-1L',    name:'Real Mango Juice 1L',         category:C['Soft Drinks'],       supplier:SUM,  unit:'pcs',  buyingPrice:95,   sellingPrice:128,  currentStock:80,  minStock:15, maxStock:200, reorderLevel:30,  leadTimeDays:4  },
    { sku:'NIMBU-500ML',       name:'Nimbu Pani Squash 500ml',     category:C['Soft Drinks'],       supplier:SUM,  unit:'pcs',  buyingPrice:85,   sellingPrice:115,  currentStock:60,  minStock:10, maxStock:150, reorderLevel:20,  leadTimeDays:4  },

    // ── Noodles & Pasta ──────────────────────────────────────────────────────
    { sku:'NOODLE-WAIW-75G',   name:'Wai Wai Noodles 75g',        category:C['Noodles & Pasta'],   supplier:EVR,  unit:'pcs',  buyingPrice:22,   sellingPrice:32,   currentStock:500, minStock:80, maxStock:1000,reorderLevel:150, leadTimeDays:5  },
    { sku:'NOODLE-MAGI-70G',   name:'Maggi Noodles 70g',           category:C['Noodles & Pasta'],   supplier:EVR,  unit:'pcs',  buyingPrice:20,   sellingPrice:30,   currentStock:400, minStock:80, maxStock:800, reorderLevel:120, leadTimeDays:5  },
    { sku:'VERMICL-200G',      name:'Wheat Vermicelli 200g',       category:C['Noodles & Pasta'],   supplier:HIM,  unit:'pk',   buyingPrice:35,   sellingPrice:52,   currentStock:120, minStock:20, maxStock:300, reorderLevel:40,  leadTimeDays:3  },
    { sku:'MACARONI-500G',     name:'Macaroni 500g',               category:C['Noodles & Pasta'],   supplier:HIM,  unit:'pk',   buyingPrice:72,   sellingPrice:100,  currentStock:70,  minStock:10, maxStock:200, reorderLevel:25,  leadTimeDays:3  },

    // ── Biscuits & Snacks ────────────────────────────────────────────────────
    { sku:'BISCUIT-PRLG-800G', name:'Parle-G Biscuits 800g',      category:C['Biscuits & Snacks'], supplier:EVR,  unit:'pk',   buyingPrice:58,   sellingPrice:80,   currentStock:150, minStock:25, maxStock:300, reorderLevel:50,  leadTimeDays:5  },
    { sku:'BISCUIT-MARIE-400G',name:'Marie Gold Biscuits 400g',   category:C['Biscuits & Snacks'], supplier:EVR,  unit:'pk',   buyingPrice:72,   sellingPrice:100,  currentStock:120, minStock:20, maxStock:250, reorderLevel:40,  leadTimeDays:5  },
    { sku:'BISCUIT-GOOD-200G', name:'Good Day Butter Biscuits 200g',category:C['Biscuits & Snacks'],supplier:EVR, unit:'pk',   buyingPrice:45,   sellingPrice:68,   currentStock:100, minStock:15, maxStock:200, reorderLevel:30,  leadTimeDays:5  },
    { sku:'CHIPS-KURKURE-30G', name:'Kurkure 30g',                category:C['Biscuits & Snacks'], supplier:EVR,  unit:'pcs',  buyingPrice:12,   sellingPrice:20,   currentStock:300, minStock:50, maxStock:600, reorderLevel:80,  leadTimeDays:5  },
    { sku:'NAMKEEN-MIX-200G',  name:'Mixed Namkeen 200g',         category:C['Biscuits & Snacks'], supplier:BIR,  unit:'pk',   buyingPrice:52,   sellingPrice:78,   currentStock:80,  minStock:15, maxStock:200, reorderLevel:30,  leadTimeDays:12 },
    { sku:'POPCORN-100G',      name:'Microwave Popcorn 100g',     category:C['Biscuits & Snacks'], supplier:EVR,  unit:'pcs',  buyingPrice:48,   sellingPrice:72,   currentStock:60,  minStock:10, maxStock:150, reorderLevel:20,  leadTimeDays:5  },

    // ── Soap & Detergent ─────────────────────────────────────────────────────
    { sku:'SOAP-LIVELY-75G',   name:'Lively Soap Bar 75g',        category:C['Soap & Detergent'],  supplier:KSF,  unit:'pcs',  buyingPrice:32,   sellingPrice:50,   currentStock:300, minStock:50, maxStock:600, reorderLevel:80,  leadTimeDays:5  },
    { sku:'SOAP-LIFEBUOY-75G', name:'Lifebuoy Soap Bar 75g',      category:C['Soap & Detergent'],  supplier:KSF,  unit:'pcs',  buyingPrice:38,   sellingPrice:58,   currentStock:250, minStock:40, maxStock:500, reorderLevel:70,  leadTimeDays:5  },
    { sku:'SOAP-DISH-500ML',   name:'Vim Dish Washing Liquid 500ml',category:C['Soap & Detergent'],supplier:KSF,  unit:'pcs',  buyingPrice:115,  sellingPrice:155,  currentStock:120, minStock:20, maxStock:300, reorderLevel:40,  leadTimeDays:5  },
    { sku:'DETGNT-TIDE-1KG',   name:'Tide Detergent Powder 1kg',  category:C['Soap & Detergent'],  supplier:KSF,  unit:'pk',   buyingPrice:185,  sellingPrice:245,  currentStock:100, minStock:15, maxStock:250, reorderLevel:30,  leadTimeDays:5  },
    { sku:'DETGNT-ARIEL-500G', name:'Ariel Detergent 500g',       category:C['Soap & Detergent'],  supplier:KSF,  unit:'pk',   buyingPrice:145,  sellingPrice:195,  currentStock:80,  minStock:15, maxStock:200, reorderLevel:25,  leadTimeDays:5  },
    { sku:'SANITIZER-500ML',   name:'Hand Sanitizer 500ml',       category:C['Soap & Detergent'],  supplier:KSF,  unit:'pcs',  buyingPrice:145,  sellingPrice:195,  currentStock:60,  minStock:10, maxStock:150, reorderLevel:20,  leadTimeDays:5  },

    // ── Personal Care ────────────────────────────────────────────────────────
    { sku:'SHAMPOO-HNS-340ML', name:'Head & Shoulders 340ml',     category:C['Personal Care'],     supplier:EVR,  unit:'pcs',  buyingPrice:325,  sellingPrice:420,  currentStock:70,  minStock:10, maxStock:150, reorderLevel:20,  leadTimeDays:5  },
    { sku:'TOOTHP-COLG-150G',  name:'Colgate Toothpaste 150g',    category:C['Personal Care'],     supplier:EVR,  unit:'pcs',  buyingPrice:88,   sellingPrice:120,  currentStock:120, minStock:20, maxStock:300, reorderLevel:40,  leadTimeDays:5  },
    { sku:'TOOTHBRSH-MED',     name:'Colgate Medium Toothbrush',  category:C['Personal Care'],     supplier:EVR,  unit:'pcs',  buyingPrice:32,   sellingPrice:50,   currentStock:150, minStock:25, maxStock:400, reorderLevel:50,  leadTimeDays:5  },
    { sku:'LOTION-VASLN-200ML',name:'Vaseline Lotion 200ml',      category:C['Personal Care'],     supplier:EVR,  unit:'pcs',  buyingPrice:148,  sellingPrice:195,  currentStock:80,  minStock:10, maxStock:200, reorderLevel:20,  leadTimeDays:5  },

    // ── Flours & Starches ────────────────────────────────────────────────────
    { sku:'FLOUR-MAIDA-5KG',   name:'Maida (Refined Flour) 5kg',  category:C['Flours & Starches'], supplier:NFC,  unit:'bag',  buyingPrice:265,  sellingPrice:330,  currentStock:130, minStock:20, maxStock:300, reorderLevel:40,  leadTimeDays:3  },
    { sku:'FLOUR-BESAN-1KG',   name:'Besan (Gram Flour) 1kg',     category:C['Flours & Starches'], supplier:HIM,  unit:'kg',   buyingPrice:110,  sellingPrice:145,  currentStock:90,  minStock:15, maxStock:200, reorderLevel:30,  leadTimeDays:3  },
    { sku:'FLOUR-RICE-1KG',    name:'Rice Flour 1kg',             category:C['Flours & Starches'], supplier:NFC,  unit:'kg',   buyingPrice:72,   sellingPrice:98,   currentStock:75,  minStock:15, maxStock:200, reorderLevel:25,  leadTimeDays:3  },
    { sku:'CORN-STARCH-500G',  name:'Corn Starch 500g',           category:C['Flours & Starches'], supplier:EVR,  unit:'pcs',  buyingPrice:65,   sellingPrice:92,   currentStock:50,  minStock:10, maxStock:120, reorderLevel:20,  leadTimeDays:5  },

    // ── Canned & Preserved ───────────────────────────────────────────────────
    { sku:'TOMATO-PASTE-200G', name:'Tomato Paste 200g',          category:C['Canned & Preserved'],supplier:CHI,  unit:'pcs',  buyingPrice:48,   sellingPrice:72,   currentStock:90,  minStock:15, maxStock:200, reorderLevel:25,  leadTimeDays:8  },
    { sku:'MANGO-PICKLE-500G', name:'Mango Pickle 500g',          category:C['Canned & Preserved'],supplier:BAG,  unit:'pcs',  buyingPrice:85,   sellingPrice:120,  currentStock:70,  minStock:10, maxStock:150, reorderLevel:20,  leadTimeDays:4  },
    { sku:'STRAWBERRY-JAM-500G',name:'Strawberry Jam 500g',       category:C['Canned & Preserved'],supplier:CHI,  unit:'pcs',  buyingPrice:148,  sellingPrice:195,  currentStock:40,  minStock:8,  maxStock:100, reorderLevel:15,  leadTimeDays:8  },
    { sku:'SOYA-SAUCE-300ML',  name:'Soya Sauce 300ml',           category:C['Canned & Preserved'],supplier:EVR,  unit:'pcs',  buyingPrice:78,   sellingPrice:108,  currentStock:60,  minStock:10, maxStock:150, reorderLevel:20,  leadTimeDays:5  },

    // ── Cleaning Products ────────────────────────────────────────────────────
    { sku:'FLOOR-CLN-500ML',   name:'Floor Cleaner 500ml',        category:C['Cleaning Products'], supplier:KSF,  unit:'pcs',  buyingPrice:75,   sellingPrice:105,  currentStock:90,  minStock:15, maxStock:200, reorderLevel:25,  leadTimeDays:5  },
    { sku:'TOILET-CLN-500ML',  name:'Toilet Cleaner 500ml',       category:C['Cleaning Products'], supplier:KSF,  unit:'pcs',  buyingPrice:68,   sellingPrice:98,   currentStock:80,  minStock:15, maxStock:200, reorderLevel:25,  leadTimeDays:5  },
    { sku:'SURFCE-SPRAY-400ML',name:'Surface Disinfectant 400ml', category:C['Cleaning Products'], supplier:KSF,  unit:'pcs',  buyingPrice:95,   sellingPrice:138,  currentStock:55,  minStock:10, maxStock:150, reorderLevel:20,  leadTimeDays:5  },
    { sku:'NAPHTHALENE-100G',  name:'Naphthalene Balls 100g',     category:C['Cleaning Products'], supplier:KSF,  unit:'pk',   buyingPrice:28,   sellingPrice:45,   currentStock:120, minStock:20, maxStock:300, reorderLevel:40,  leadTimeDays:5  },
    { sku:'SCRUBBER-STEEL',    name:'Steel Scrubber Pack of 3',   category:C['Cleaning Products'], supplier:KSF,  unit:'pk',   buyingPrice:22,   sellingPrice:38,   currentStock:100, minStock:20, maxStock:250, reorderLevel:35,  leadTimeDays:5  },
    { sku:'DUSTBIN-10L',       name:'Plastic Dustbin 10 Liter',   category:C['Cleaning Products'], supplier:BAG,  unit:'pcs',  buyingPrice:145,  sellingPrice:198,  currentStock:30,  minStock:5,  maxStock:80,  reorderLevel:10,  leadTimeDays:4  },
  ]

  const catNameById = {}
  Object.entries(C).forEach(([name, id]) => { catNameById[String(id)] = name })
  const specs = enrichProducts(rawSpecs, catNameById)

  const map = {}
  const existing = await Product.find({})
  existing.forEach(p => { map[p.sku] = { _id: p._id, ...p.toObject() } })

  const toInsert = specs.filter(s => !map[s.sku])
  if (toInsert.length > 0) {
    const docs = await Product.insertMany(toInsert, { ordered: false })
    docs.forEach(d => { map[d.sku] = d })
  }
  specs.forEach(s => {
    if (!map[s.sku]) return
    map[s.sku] = { ...s, _id: map[s.sku]._id }
  })
  console.log(`  ✓ ${Object.keys(map).length} products`)
  return map  // map[sku] = product doc
}

// ─── 7. SIMULATE FULL-YEAR HISTORY ────────────────────────────────────────────
async function seedHistory(prodMap, supMap, userIds) {
  const salesExist = await Sale.countDocuments()
  const purchExist = await Purchase.countDocuments()
  if (salesExist > 0 && purchExist > 0) {
    console.log(`  - Sales (${salesExist}) and purchases (${purchExist}) already exist, skipping history`)
    return null
  }

  const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0)
  const START_DAY = DAYS

  const supplierDocs = await Supplier.find({})
  const supplierById = {}
  supplierDocs.forEach(s => { supplierById[String(s._id)] = s })

  // Track in-memory stock levels for simulation
  const stock = {}
  const skus  = Object.keys(prodMap)
  skus.forEach(sku => { stock[sku] = prodMap[sku].currentStock || 0 })

  // Accumulators
  const saleDocs     = []
  const purchaseDocs = []
  const movementDocs = []
  const alertDocs    = []
  const auditDocs    = []

  let saleSeq  = 0
  let purchSeq = 0

  const adminId   = userIds['admin']
  const managerId = userIds['inventory_manager']
  const staffId   = userIds['staff']
  const allSkus   = skus.filter(s => prodMap[s])

  // Weighted sales pool — every product can sell, staples proportionally far more often.
  const weightedPool = []
  for (const sku of allSkus) {
    const w = DEMAND_WEIGHT[sku] || 3
    for (let i = 0; i < w; i++) weightedPool.push(sku)
  }
  const topWeighted = Object.entries(DEMAND_WEIGHT).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([sku]) => sku)

  // Open-alert tracker mirroring the DB's own partial-unique index: at most one
  // OPEN (unacknowledged) alert per (product, type) at any time.
  const openAlert = {}

  // Pre-schedule ~180 restock "delivery days" over the year (roughly twice a week,
  // clustered, with some randomness on top).
  const deliveryDays = new Set()
  for (let d = START_DAY; d >= 5; d--) {
    if (d % 7 === 0 || d % 7 === 1) deliveryDays.add(d)
  }
  while (deliveryDays.size < 180) deliveryDays.add(rand(5, START_DAY))

  const customers = [
    'Hari Grocery Store', 'Ram Kirana', 'Shrestha Mart', 'Bhanu Suppliers',
    'Thapa Tarkari Pasal', 'Suresh Kirana', 'Laxmi Departmental Store',
    'Dev Wholesale', 'Puja Provision', 'Anita General Store', 'Basnet Kirana Pasal',
    'New Everest Grocery', 'Milan Provision Store', 'Walk-in Customer',
    null, null, // anonymous
  ]

  // Stats accumulated for downstream, data-derived notifications (no fabricated numbers).
  let totalRevenueAll = 0, revenueLast30 = 0, revenuePrev30 = 0
  let dailyRevenueSum = 0, activeSaleDays = 0
  const productRevenue = {}
  let peakFestival = null

  for (let d = START_DAY; d >= 1; d--) {
    const date = new Date(TODAY)
    date.setDate(TODAY.getDate() - d)
    const { total: mult, festival } = dayMultiplier(date)

    // ── Purchases on delivery days, grouped by each product's real supplier ──
    if (deliveryDays.has(d) && purchSeq < 900) {
      const needRestock = allSkus
        .filter(sku => prodMap[sku] && stock[sku] <= (prodMap[sku].reorderLevel || 30))
        .sort(() => 0.5 - Math.random())
        .slice(0, rand(3, 7))
      const topPick = topWeighted
        .filter(s => prodMap[s] && !needRestock.includes(s))
        .slice(0, rand(1, 3))
      const restockSkus = [...new Set([...needRestock, ...topPick])]
      if (restockSkus.length === 0) restockSkus.push(pick(topWeighted))

      const bySupplier = {}
      for (const sku of restockSkus) {
        const p = prodMap[sku]
        if (!p || !p.supplier) continue
        const key = String(p.supplier)
        if (!bySupplier[key]) bySupplier[key] = []
        bySupplier[key].push(sku)
      }

      for (const [supId, supSkus] of Object.entries(bySupplier)) {
        if (purchSeq >= 900) break
        const supplier = supplierById[supId]
        const leadTime = (supplier && supplier.leadTimeDays) || 5
        // Real lead time drives delivery date, with natural variance (occasionally late).
        const deliverDays = Math.max(1, Math.round(leadTime * (0.6 + Math.random() * 0.9)))
        const delDate = new Date(date)
        delDate.setDate(delDate.getDate() + deliverDays)
        const received = delDate <= TODAY

        const purchaseId = new mongoose.Types.ObjectId()
        const items = []
        const localMovements = []
        let subtotal = 0

        for (const sku of supSkus) {
          const p = prodMap[sku]
          const maxS = p.maxStock || 200
          const curS = stock[sku]
          const qty  = Math.max(rand(20, 60), maxS - curS)
          const price = p.buyingPrice

          items.push({ product: p._id, productName: p.name, sku, quantity: qty, buyingPrice: price, total: qty * price })
          subtotal += qty * price

          if (received) {
            const before = stock[sku]
            stock[sku] += qty
            if (stock[sku] > 0) delete openAlert[`${sku}::out_of_stock`]
            if (stock[sku] > (p.reorderLevel || 20)) delete openAlert[`${sku}::low_stock`]
            localMovements.push({
              product: p._id, productName: p.name, type: 'purchase',
              quantity: qty, stockBefore: before, stockAfter: stock[sku],
              referenceType: 'Purchase', referenceId: purchaseId,
              notes: 'Purchase received', recordedBy: managerId, date: new Date(date),
            })
          }
        }
        if (items.length === 0) continue

        purchSeq++
        localMovements.forEach(m => { m.reference = po(purchSeq) })
        movementDocs.push(...localMovements)

        const discount = (subtotal > 20000 && Math.random() < 0.3) ? Math.round(subtotal * rand(2, 6) / 100) : 0
        const grandTotal = subtotal - discount

        purchaseDocs.push({
          _id: purchaseId,
          purchaseNumber: po(purchSeq),
          supplier: supId,
          items, subtotal, discount, grandTotal,
          paymentStatus: received ? pick(['paid', 'paid', 'partial', 'pending']) : pick(['pending', 'pending', 'partial']),
          paymentMethod: pick(['bank_transfer', 'cash', 'cheque', 'credit']),
          purchaseDate: new Date(date),
          deliveryDate: delDate,
          status: received ? 'received' : 'ordered',
          notes: received ? undefined : 'In transit from supplier',
          recordedBy: managerId,
          createdAt: new Date(date),
          updatedAt: new Date(date),
        })
      }
    }

    // ── Sales for the day ───────────────────────────────────────────────────
    const numInv = Math.max(2, Math.round(rand(9, 16) * Math.min(mult, 4)))
    let dayRevenue = 0

    for (let s = 0; s < numInv && saleSeq < 20000; s++) {
      const numItems = rand(1, 6)
      const candidates = weightedPool.filter(sku => prodMap[sku] && stock[sku] > 0)
      if (candidates.length === 0) continue

      const chosen = [...new Set(candidates.sort(() => 0.5 - Math.random()).slice(0, numItems * 3))].slice(0, numItems)
      const saleId = new mongoose.Types.ObjectId()
      const items  = []
      let subtotal = 0

      for (const sku of chosen) {
        const p = prodMap[sku]
        if (!p) continue
        const avail = stock[sku]
        if (avail <= 0) continue

        const unitCap    = (p.unit === 'bag' || p.unit === 'ctn') ? 6 : (p.unit === 'kg' || p.unit === 'L') ? 10 : 15
        const festBoost  = mult > 1.5 ? rand(2, 4) : 1
        const qty        = Math.min(avail, rand(1, unitCap) * festBoost)
        const price      = p.sellingPrice
        const bulkOff    = qty >= 10 ? Math.round(price * 0.05) : 0
        const unitPrice  = price - bulkOff

        items.push({
          product: p._id, productName: p.name, sku,
          quantity: qty, unitPrice, buyingPrice: p.buyingPrice, total: qty * unitPrice,
        })
        subtotal += qty * unitPrice
        productRevenue[sku] = (productRevenue[sku] || 0) + qty * unitPrice

        const before = stock[sku]
        stock[sku]  -= qty

        movementDocs.push({
          product: p._id, productName: p.name, type: 'sale',
          quantity: -qty, stockBefore: before, stockAfter: stock[sku],
          referenceType: 'Sale', referenceId: saleId,
          reference: inv(saleSeq + 1), notes: 'Sale', recordedBy: s % 5 === 0 ? managerId : (s % 3 === 0 ? staffId : adminId),
          date: new Date(date),
        })

        const reorder = p.reorderLevel || 20
        if (stock[sku] <= 0) {
          const key = `${sku}::out_of_stock`
          if (!openAlert[key]) {
            openAlert[key] = true
            alertDocs.push({
              type: 'out_of_stock', priority: 'critical',
              title: `Out of Stock: ${p.name}`,
              message: `${p.name} (${sku}) ran out of stock on ${date.toDateString()}.`,
              product: p._id, productName: p.name,
              isRead: d > 3, isAcknowledged: d > 7,
              metadata: { currentStock: 0, reorderLevel: reorder },
              createdAt: new Date(date),
            })
          }
        } else if (stock[sku] <= reorder) {
          const key = `${sku}::low_stock`
          if (!openAlert[key]) {
            openAlert[key] = true
            alertDocs.push({
              type: 'low_stock',
              priority: stock[sku] <= reorder * 0.5 ? 'high' : 'medium',
              title: `Low Stock: ${p.name}`,
              message: `${p.name} has ${stock[sku]} units left. Reorder level: ${reorder}.`,
              product: p._id, productName: p.name,
              isRead: d > 5, isAcknowledged: d > 10,
              metadata: { currentStock: stock[sku], reorderLevel: reorder },
              createdAt: new Date(date),
            })
          }
        }
      }

      if (items.length === 0) continue

      saleSeq++
      const hour = rand(8, 18)
      const saleDate = new Date(date); saleDate.setHours(hour, rand(0, 59), 0, 0)
      const customer = pick(customers)
      const loyaltyDiscount = (subtotal > 5000 && Math.random() < 0.25) ? Math.round(subtotal * rand(1, 4) / 100) : 0
      const grandTotal = subtotal - loyaltyDiscount

      saleDocs.push({
        _id: saleId,
        invoiceNumber: inv(saleSeq),
        items,
        subtotal, discount: loyaltyDiscount, tax: 0, grandTotal,
        paymentMethod: pick(['cash', 'cash', 'cash', 'qr', 'card', 'credit']),
        customerName: customer,
        status: 'completed',
        saleDate,
        recordedBy: s % 5 === 0 ? managerId : (s % 3 === 0 ? staffId : adminId),
        createdAt: saleDate,
        updatedAt: saleDate,
      })
      dayRevenue += grandTotal

      auditDocs.push({
        userEmail: s % 3 === 0 ? 'sita@himalayan.np' : 'admin@himalayan.np',
        action: 'CREATE_SALE',
        resource: 'Sale',
        resourceId: inv(saleSeq),
        details: { invoiceNumber: inv(saleSeq), grandTotal, itemCount: items.length },
        status: 'success',
        createdAt: saleDate,
      })
    }

    totalRevenueAll += dayRevenue
    if (dayRevenue > 0) { dailyRevenueSum += dayRevenue; activeSaleDays++ }
    if (d <= 30) revenueLast30 += dayRevenue
    else if (d <= 60) revenuePrev30 += dayRevenue
    if (festival && (!peakFestival || mult > peakFestival.mult)) {
      peakFestival = { name: festival.name, label: festival.label, mult, dayRevenue }
    }
  }

  // Trailing supplier-delayed purchase orders — realistic "still waiting" state.
  const pendingSkus = topWeighted.slice(0, 4)
  const samplePendingPO = []
  for (const sku of pendingSkus) {
    const p = prodMap[sku]
    if (!p || !p.supplier) continue
    purchSeq++
    const qty = rand(50, 100)
    const supplier = supplierById[String(p.supplier)]
    const poNumber = po(purchSeq)
    purchaseDocs.push({
      purchaseNumber: poNumber,
      supplier: p.supplier,
      items: [{ product: p._id, productName: p.name, sku, quantity: qty, buyingPrice: p.buyingPrice, total: qty * p.buyingPrice }],
      subtotal: qty * p.buyingPrice,
      discount: 0,
      grandTotal: qty * p.buyingPrice,
      paymentStatus: 'pending',
      paymentMethod: 'credit',
      purchaseDate: daysAgo(rand(2, 5)),
      deliveryDate: daysFromNow(rand(2, 7)),
      status: 'ordered',
      notes: 'Supplier delayed — follow up required',
      recordedBy: managerId,
    })
    alertDocs.push({
      type: 'supplier_delay',
      priority: 'medium',
      title: `Supplier Delay: ${p.name}`,
      message: `PO ${poNumber} from ${supplier ? supplier.name : 'supplier'} is overdue. Contact supplier.`,
      product: p._id,
      productName: p.name,
      isRead: false,
      isAcknowledged: false,
      metadata: { purchaseNumber: poNumber, supplierName: supplier ? supplier.name : null },
    })
    samplePendingPO.push({ number: poNumber, supplierName: supplier ? supplier.name : 'Supplier' })
  }

  // Bulk-insert everything
  await bulkInsert(Sale, saleDocs, 'sales')
  await bulkInsert(Purchase, purchaseDocs, 'purchases')
  await bulkInsert(StockMovement, movementDocs, 'stock movements')
  await bulkInsert(Alert, alertDocs, 'alerts')
  await bulkInsert(AuditLog, auditDocs, 'audit logs')

  // Sync the shared Counter collection to these manually-numbered docs.
  // Sale/Purchase.pre('save') calls Counter.next('invoice'/'purchase') to
  // number any doc created through the real API — without this sync that
  // counter stays at 0 while invoiceNumber/purchaseNumber here already run
  // up into the thousands, so the very next real sale/purchase collides with
  // a seeded number and fails with a duplicate-key error. $max (not $set) so
  // this is safe to run against a counter a live server has already advanced.
  const Counter = require('../models/Counter')
  await Counter.updateOne({ _id: 'invoice' },  { $max: { seq: saleSeq } },  { upsert: true })
  await Counter.updateOne({ _id: 'purchase' }, { $max: { seq: purchSeq } }, { upsert: true })

  // Reconcile Product.currentStock with the simulated ledger.
  console.log('  Updating product stock levels...')
  const productBulkOps = Object.entries(stock).map(([sku, qty]) => {
    if (!prodMap[sku]) return null
    return { updateOne: { filter: { _id: prodMap[sku]._id }, update: { $set: { currentStock: Math.max(0, qty) } } } }
  }).filter(Boolean)
  if (productBulkOps.length > 0) await Product.bulkWrite(productBulkOps)

  // Reconcile Supplier.totalPurchases / lastOrderDate against the purchases just created —
  // these are denormalized fields the schema says should track the real ledger.
  console.log('  Updating supplier totals...')
  const supplierTotals = {}
  for (const pdoc of purchaseDocs) {
    const key = String(pdoc.supplier)
    if (!supplierTotals[key]) supplierTotals[key] = { total: 0, lastDate: pdoc.purchaseDate }
    supplierTotals[key].total += pdoc.grandTotal
    if (pdoc.purchaseDate > supplierTotals[key].lastDate) supplierTotals[key].lastDate = pdoc.purchaseDate
  }
  const supplierBulkOps = Object.entries(supplierTotals).map(([supId, agg]) => ({
    updateOne: { filter: { _id: supId }, update: { $set: { totalPurchases: Math.round(agg.total), lastOrderDate: agg.lastDate } } },
  }))
  if (supplierBulkOps.length > 0) await Supplier.bulkWrite(supplierBulkOps)

  console.log(`  ✓ ${saleDocs.length} sales, ${purchaseDocs.length} purchases, ${movementDocs.length} movements, ${alertDocs.length} alerts`)

  const topEntry = Object.entries(productRevenue).sort((a, b) => b[1] - a[1])[0]
  return {
    totalRevenue: Math.round(totalRevenueAll),
    revenueLast30: Math.round(revenueLast30),
    revenuePrev30: Math.round(revenuePrev30),
    totalPurchaseSpend: Math.round(purchaseDocs.reduce((s, p) => s + p.grandTotal, 0)),
    purchaseOrderCount: purchaseDocs.length,
    saleCount: saleDocs.length,
    topProductName: topEntry ? (prodMap[topEntry[0]]?.name || topEntry[0]) : null,
    avgDailyRevenue: activeSaleDays ? Math.round(dailyRevenueSum / activeSaleDays) : 0,
    peakFestival,
    samplePendingPO: samplePendingPO[0] || null,
  }
}

// ─── 8. FINAL ALERTS FOR CURRENT STATE ────────────────────────────────────────
async function seedCurrentAlerts() {
  const alertBatch = []

  // Low stock / out of stock — products currently at or below reorder level.
  const lowProds = await Product.find({ isActive: true, $expr: { $lt: ['$currentStock', '$reorderLevel'] } })
  for (const p of lowProds) {
    const type = p.currentStock <= 0 ? 'out_of_stock' : 'low_stock'
    const exists = await Alert.findOne({ product: p._id, type, isAcknowledged: false })
    if (exists) continue
    alertBatch.push({
      type,
      priority: p.currentStock <= 0 ? 'critical' : p.currentStock <= p.reorderLevel * 0.5 ? 'high' : 'medium',
      title: p.currentStock <= 0 ? `Out of Stock: ${p.name}` : `Low Stock: ${p.name}`,
      message: p.currentStock <= 0
        ? `${p.name} (${p.sku}) is out of stock. Immediate restocking required.`
        : `${p.name} has ${p.currentStock} units left (reorder at ${p.reorderLevel}).`,
      product: p._id, productName: p.name,
      isRead: false, isAcknowledged: false,
      metadata: { currentStock: p.currentStock, reorderLevel: p.reorderLevel },
    })
  }

  // Overstock — mirrors the Product.stockStatus virtual's own definition (>= 90% of maxStock).
  const overstocked = await Product.find({
    isActive: true, maxStock: { $gt: 0 },
    $expr: { $gte: ['$currentStock', { $multiply: ['$maxStock', 0.9] }] },
  })
  for (const p of overstocked) {
    const exists = await Alert.findOne({ product: p._id, type: 'overstock', isAcknowledged: false })
    if (exists) continue
    alertBatch.push({
      type: 'overstock',
      priority: 'low',
      title: `Overstock: ${p.name}`,
      message: `${p.name} has ${p.currentStock} units on hand, close to its ${p.maxStock}-unit max. Consider pausing reorders or running a promotion.`,
      product: p._id, productName: p.name,
      isRead: false, isAcknowledged: false,
      metadata: { currentStock: p.currentStock, maxStock: p.maxStock },
    })
  }

  // Expiry — perishables within 21 days of their expiry date.
  const expiring = await Product.find({
    isActive: true, isPerishable: true, expiryDate: { $exists: true, $lte: daysFromNow(21) },
  })
  for (const p of expiring) {
    const exists = await Alert.findOne({ product: p._id, type: 'expiry', isAcknowledged: false })
    if (exists) continue
    const daysLeft = Math.max(0, Math.ceil((p.expiryDate - new Date()) / 86400000))
    alertBatch.push({
      type: 'expiry',
      priority: daysLeft <= 7 ? 'critical' : daysLeft <= 14 ? 'high' : 'medium',
      title: `Expiring Soon: ${p.name}`,
      message: `${p.name} (${p.sku}) expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Prioritize selling remaining stock.`,
      product: p._id, productName: p.name,
      isRead: false, isAcknowledged: false,
      metadata: { expiryDate: p.expiryDate, daysLeft },
    })
  }

  if (alertBatch.length > 0) {
    await Alert.insertMany(alertBatch, { ordered: false })
    console.log(`  ✓ ${alertBatch.length} current-state alerts`)
  }
}

// ─── 9. NOTIFICATIONS FOR ADMIN ───────────────────────────────────────────────
async function seedNotifications(userIds, stats) {
  const adminId = userIds['admin']
  const existing = await Notification.countDocuments({ user: adminId })
  if (existing > 5) {
    console.log(`  - Notifications exist (${existing}), skipping`)
    return
  }

  const lowCount = await Product.countDocuments({ isActive: true, $expr: { $lt: ['$currentStock', '$reorderLevel'] }, currentStock: { $gt: 0 } })
  const oosCount = await Product.countDocuments({ isActive: true, currentStock: { $lte: 0 } })

  const msgs = [
    { title: 'Welcome to StockWise!', message: `Your ${COMPANY_NAME} account is ready. Start by reviewing your inventory.`, type: 'success', isRead: true },
    { title: 'Daily Stock Report', message: `Today's stock summary: ${lowCount} low-stock items, ${oosCount} out of stock. Review alerts.`, type: 'warning', isRead: true },
  ]

  if (stats) {
    const momPct = stats.revenuePrev30 > 0 ? Math.round((stats.revenueLast30 / stats.revenuePrev30 - 1) * 100) : null
    if (stats.revenueLast30 > 0) {
      msgs.push({
        title: 'Revenue Update — Last 30 Days',
        message: `Revenue over the last 30 days was NPR ${fmt(stats.revenueLast30)}${momPct != null ? ` (${momPct >= 0 ? '+' : ''}${momPct}% vs the prior 30 days)` : ''}.`,
        type: 'success', isRead: true,
      })
    }
    if (stats.purchaseOrderCount > 0) {
      msgs.push({
        title: 'Purchase Orders This Year',
        message: `${stats.purchaseOrderCount} purchase orders placed over the past year, totaling NPR ${fmt(stats.totalPurchaseSpend)}.`,
        type: 'info', isRead: false,
      })
    }
    if (stats.samplePendingPO) {
      msgs.push({
        title: 'Supplier Delay Alert',
        message: `${stats.samplePendingPO.supplierName} delivery for ${stats.samplePendingPO.number} is overdue.`,
        type: 'warning', isRead: false,
      })
    }
    if (stats.peakFestival && stats.avgDailyRevenue > 0) {
      const pct = Math.round((stats.peakFestival.dayRevenue / stats.avgDailyRevenue) * 100)
      msgs.push({
        title: `${stats.peakFestival.label} Sales Boost`,
        message: `${stats.peakFestival.label} sales reached NPR ${fmt(stats.peakFestival.dayRevenue)} in a single day — about ${pct}% of the average daily figure.${stats.topProductName ? ` Top seller: ${stats.topProductName}.` : ''}`,
        type: 'info', isRead: true,
      })
    }
  }

  msgs.push(
    { title: 'System Backup Complete',    message: 'Nightly database backup completed successfully.', type: 'success', isRead: false },
    { title: 'New Staff Account Created', message: 'Sita Maharjan has been added as staff. Review access permissions.', type: 'info', isRead: true },
  )

  await Notification.insertMany(msgs.map(m => ({ ...m, user: adminId })), { ordered: false })
  console.log(`  ✓ ${msgs.length} notifications`)
}

// ─── 10. AUDIT LOGS FOR SETUP ─────────────────────────────────────────────────
async function seedSetupAuditLogs() {
  const existing = await AuditLog.countDocuments()
  if (existing > 0) return  // history seeder already inserted plenty

  await AuditLog.insertMany([
    { userEmail:'admin@himalayan.np', action:'SETUP_COMPLETE', resource:'Setting', details:{ message:'Company setup wizard completed' }, status:'success', createdAt: daysAgo(DAYS + 2) },
    { userEmail:'admin@himalayan.np', action:'CREATE_USER',    resource:'User', details:{ email:'ram@himalayan.np', role:'inventory_manager' }, status:'success', createdAt: daysAgo(DAYS + 1) },
    { userEmail:'admin@himalayan.np', action:'CREATE_USER',    resource:'User', details:{ email:'sita@himalayan.np', role:'staff' }, status:'success', createdAt: daysAgo(DAYS + 1) },
    { userEmail:'admin@himalayan.np', action:'LOGIN',          resource:'Auth', details:{ ip:'192.168.1.10' }, status:'success', createdAt: daysAgo(1) },
    { userEmail:'ram@himalayan.np',   action:'LOGIN',          resource:'Auth', details:{ ip:'192.168.1.11' }, status:'success', createdAt: daysAgo(1) },
    { userEmail:'sita@himalayan.np',  action:'LOGIN',          resource:'Auth', details:{ ip:'192.168.1.12' }, status:'success', createdAt: daysAgo(1) },
  ], { ordered: false })
}

// ─── 0. CLEAR COLLECTIONS (fresh seed) ───────────────────────────────────────
async function clearAll() {
  const models = [Sale, Purchase, StockMovement, Alert, AuditLog, Notification,
                  Product, Supplier, Category, Unit, Setting]
  for (const M of models) {
    const name = M.modelName
    const res  = await M.deleteMany({})
    console.log(`  cleared ${name}: ${res.deletedCount}`)
  }
  // Keep Users so we can pass --keep-users
  if (!process.argv.includes('--keep-users')) {
    const res = await User.deleteMany({})
    console.log(`  cleared User: ${res.deletedCount}`)
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function seed() {
  await connectDB()

  if (process.argv.includes('--fresh') || process.argv.includes('-f')) {
    console.log('\n▸ Clearing existing data...')
    await clearAll()
  }

  console.log('\n▸ Users')
  const userIds = await seedUsers()

  console.log('\n▸ Settings')
  await seedSettings()

  console.log('\n▸ Categories')
  const cats = await seedCategories()

  console.log('\n▸ Units')
  await seedUnits()

  console.log('\n▸ Suppliers')
  const sups = await seedSuppliers()

  console.log('\n▸ Products')
  const prodMap = await seedProducts(cats, sups)

  console.log(`\n▸ ${DAYS}-Day Historical Simulation`)
  const stats = await seedHistory(prodMap, sups, userIds)

  console.log('\n▸ Current-State Alerts')
  await seedCurrentAlerts()

  console.log('\n▸ Notifications')
  await seedNotifications(userIds, stats)

  console.log('\n▸ Setup Audit Logs')
  await seedSetupAuditLogs()

  console.log('\n✅ Seed complete!\n')
  if (stats) {
    console.log(`   ${fmt(stats.saleCount)} sales · ${fmt(stats.purchaseOrderCount)} purchase orders · NPR ${fmt(stats.totalRevenue)} total revenue simulated over ${DAYS} days\n`)
  }
  console.log('┌─────────────────────────────────────────────┐')
  console.log('│  Himalayan Wholesale Suppliers — Login Creds │')
  console.log('├──────────────────────┬──────────────────────┤')
  console.log('│  admin@himalayan.np  │  Admin@1234          │')
  console.log('│  ram@himalayan.np    │  Manager@1234        │')
  console.log('│  sita@himalayan.np   │  Staff1234           │')
  console.log('└──────────────────────┴──────────────────────┘')

  process.exit(0)
}

seed().catch(err => { console.error(err); process.exit(1) })

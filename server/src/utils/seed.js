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

const DB_NAME = 'stockwise'

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

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }
function pick(arr)       { return arr[Math.floor(Math.random() * arr.length)] }
function inv(n)          { return `INV-${String(n).padStart(6, '0')}` }
function po(n)           { return `PO-${String(n).padStart(6, '0')}` }

// ── Nepal festival dates (in our 90-day window ending 2026-06-26) ─────────────
// 2026-03-28 → 2026-06-26
const festivalMultipliers = {
  '2026-03-29': 1.6,   // Ram Navami
  '2026-03-30': 1.8,   // Eid al-Fitr (approximate)
  '2026-04-02': 1.5,   // Chaite Dashain
  '2026-04-03': 1.8,   // Chaite Dashain eve (big shopping day)
  '2026-04-13': 2.5,   // Nepali New Year Eve (Ghode Jatra/Chaitra Purnima)
  '2026-04-14': 2.8,   // Nepali New Year (Baisakh 1)
  '2026-04-15': 1.6,   // Post-NY stockup
  '2026-05-22': 1.5,   // Buddha Purnima Eve
  '2026-05-23': 1.9,   // Buddha Purnima
  '2026-06-01': 1.4,   // Ganga Dussehra
}

// Saturday in Nepal = public holiday → very low wholesale traffic
// (day of week: 0=Sun, 1=Mon, ... 6=Sat)
function dayMultiplier(date) {
  const iso = date.toISOString().slice(0, 10)
  if (festivalMultipliers[iso]) return festivalMultipliers[iso]
  const dow = date.getDay()
  if (dow === 6) return 0.15    // Saturday (public holiday in Nepal)
  if (dow === 5) return 0.75    // Friday (half day before holiday)
  if (dow === 0) return 1.25    // Sunday (first working day after holiday, restock rush)
  return 1.0
}

// ─── 1. USERS ─────────────────────────────────────────────────────────────────
async function seedUsers() {
  const specs = [
    { fullName: 'Bikram Sharma',  email: 'admin@himalayan.np',   password: 'Admin1234',   role: 'admin',             phone: '9841234567' },
    { fullName: 'Ram Prasad KC',  email: 'ram@himalayan.np',     password: 'Manager1234', role: 'inventory_manager', phone: '9852345678' },
    { fullName: 'Sita Maharjan',  email: 'sita@himalayan.np',    password: 'Staff1234',   role: 'staff',             phone: '9863456789' },
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
    { key: 'company.name',     value: 'Himalayan Wholesale Suppliers', group: 'company', label: 'Company Name' },
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

// ─── 6. PRODUCTS (80) ─────────────────────────────────────────────────────────
async function seedProducts(cats, sups) {
  const C = cats
  const S = sups
  const NFC    = S['Nepal Food Corporation']
  const HIM    = S['Himalayan Traders Pvt']
  const EVR    = S['Everest Supplies Ltd']
  const BAG    = S['Bagmati Agro Products']
  const POK    = S['Pokhara Agro Mart']
  const JNK    = S['Janakpur Wholesale Hub']
  const BIR    = S['Biratnagar Trade Center']
  const CHI    = S['Chitwan Food Mart']
  const KSF    = S['Kathmandu Soap Factory']
  const TSC    = S['Terai Spice Company']
  const SUM    = S['Summit Beverages']
  const DAI    = S['Valley Dairy Co-op']

  const specs = [
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
    { sku:'CHICKPEA-1KG',      name:'White Chickpea 1kg',          category:C['Grains & Pulses'],   supplier:BAG,  unit:'kg',   buyingPrice:140,  sellingPrice:178,  currentStock:45,  minStock:10, maxStock:120, reorderLevel:20,  leadTimeDays:4  },

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
    { sku:'NAMKEEN-MIX-200G',  name:'Mixed Namkeen 200g',         category:C['Biscuits & Snacks'], supplier:BAG,  unit:'pk',   buyingPrice:52,   sellingPrice:78,   currentStock:80,  minStock:15, maxStock:200, reorderLevel:30,  leadTimeDays:4  },
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
    // ensure specs metadata is in map
    map[s.sku] = { ...s, _id: map[s.sku]._id }
  })
  console.log(`  ✓ ${Object.keys(map).length} products`)
  return map  // map[sku] = product doc
}

// ─── 7. SIMULATE 90-DAY HISTORY ──────────────────────────────────────────────
async function seedHistory(prodMap, supMap, userIds) {
  const salesExist    = await Sale.countDocuments()
  const purchExist    = await Purchase.countDocuments()
  if (salesExist > 0 && purchExist > 0) {
    console.log(`  - Sales (${salesExist}) and purchases (${purchExist}) already exist, skipping history`)
    return
  }

  const TODAY     = new Date(); TODAY.setHours(0, 0, 0, 0)
  const DAYS      = 90
  const START_DAY = DAYS  // we'll count down from DAYS to 1

  // Track in-memory stock levels for simulation
  const stock = {}
  const skus  = Object.keys(prodMap)
  skus.forEach(sku => { stock[sku] = prodMap[sku].currentStock || 0 })

  // Accumulators
  const saleDocs       = []
  const purchaseDocs   = []
  const movementDocs   = []
  const alertDocs      = []
  const notifDocs      = []
  const auditDocs      = []

  let saleSeq    = 0
  let purchSeq   = 0

  const adminId   = userIds['admin']
  const managerId = userIds['inventory_manager']
  const staffId   = userIds['staff']
  const supIds    = Object.values(supMap)

  // Choose which products to focus on (high-turnover ones)
  const highTurnover = ['RICE-BASMATI-5KG','RICE-IR36-25KG','WHEAT-ATTA-10KG',
    'DAAL-MUNG-1KG','DAAL-MASUR-1KG','OIL-MUSTARD-1L','OIL-SUNFLR-1L',
    'SUGAR-WHITE-1KG','SALT-IODIZED-1KG','TEA-ILAM-250G','TEA-CTC-500G',
    'NOODLE-WAIW-75G','NOODLE-MAGI-70G','BISCUIT-PRLG-800G','SOAP-LIVELY-75G',
    'SOAP-LIFEBUOY-75G','DETGNT-TIDE-1KG','TOOTHP-COLG-150G','FLOUR-MAIDA-5KG',
    'MILKPOW-FULL-500G']
  const allSkus = skus.filter(s => prodMap[s])

  // Pre-schedule purchase deliveries (180 total over 90 days → 2/day avg)
  // Some days get 0, some get 4–5. Cluster around 7-day cycles.
  const deliveryDays = new Set()
  for (let d = START_DAY; d >= 5; d--) {
    if (d % 7 === 0 || d % 7 === 1) deliveryDays.add(d)  // roughly twice a week
  }
  // Add 30 random extra days
  while (deliveryDays.size < 50) {
    deliveryDays.add(rand(5, START_DAY))
  }

  for (let d = START_DAY; d >= 1; d--) {
    const date = new Date(TODAY)
    date.setDate(TODAY.getDate() - d)

    const mult = dayMultiplier(date)

    // ── Purchases on delivery days ──────────────────────────────────────────
    if (deliveryDays.has(d) && purchSeq < 180) {
      // Find low-stock SKUs to restock
      const needRestock = allSkus
        .filter(sku => prodMap[sku] && stock[sku] <= (prodMap[sku].reorderLevel || 30))
        .slice(0, rand(2, 5))

      // Even on non-low days, buy top movers proactively
      const topPick = highTurnover
        .filter(s => prodMap[s] && !needRestock.includes(s))
        .slice(0, rand(1, 3))

      const restockSkus = [...new Set([...needRestock, ...topPick])].slice(0, rand(3, 7))
      if (restockSkus.length === 0) restockSkus.push(pick(highTurnover))

      const supId  = pick(supIds)
      const items  = []
      let subtotal = 0

      for (const sku of restockSkus) {
        if (!prodMap[sku]) continue
        const p     = prodMap[sku]
        const maxS  = p.maxStock || 200
        const curS  = stock[sku]
        const qty   = Math.max(rand(20, 60), maxS - curS)
        const price = p.buyingPrice

        items.push({
          product:     p._id,
          productName: p.name,
          sku,
          quantity:    qty,
          buyingPrice: price,
          total:       qty * price,
        })
        subtotal   += qty * price
        stock[sku] += qty

        movementDocs.push({
          product:     p._id,
          productName: p.name,
          type:        'purchase',
          quantity:    qty,
          stockBefore: stock[sku] - qty,
          stockAfter:  stock[sku],
          reference:   po(purchSeq + 1),
          notes:       'Purchase received',
          recordedBy:  managerId,
          date:        new Date(date),
        })
      }

      if (items.length > 0) {
        purchSeq++
        const delDate = new Date(date)
        delDate.setDate(delDate.getDate() + rand(1, 3))
        purchaseDocs.push({
          purchaseNumber: po(purchSeq),
          supplier:       supId,
          items,
          subtotal,
          discount:       0,
          grandTotal:     subtotal,
          paymentStatus:  pick(['paid', 'paid', 'partial', 'pending']),
          paymentMethod:  pick(['bank_transfer', 'cash', 'cheque', 'credit']),
          purchaseDate:   new Date(date),
          deliveryDate:   delDate,
          status:         'received',
          recordedBy:     managerId,
          createdAt:      new Date(date),
          updatedAt:      new Date(date),
        })
      }
    }

    // ── Sales for the day ───────────────────────────────────────────────────
    if (mult <= 0.20) continue  // Saturday — no sales

    const baseSalesPerDay = 7  // 600 over 90 days ≈ 6.7/day
    const salesCount = Math.max(1, Math.round(baseSalesPerDay * mult + rand(-2, 2)))

    const customers = [
      'Hari Grocery Store','Ram Kirana','Shrestha Mart','Bhanu Suppliers',
      'Thapa Tarkari Pasal','Suresh Kirana','Laxmi Departmental Store',
      'Dev Wholesale','Puja Provision','Anita General Store','Walk-in Customer',
      null, null,  // anonymous
    ]

    for (let s = 0; s < salesCount && saleSeq < 600; s++) {
      // How many items in this sale
      const numItems = rand(1, 6)
      const pool = [...highTurnover, ...allSkus.slice(0, 20)]
        .filter(sku => prodMap[sku] && stock[sku] > 0)
      if (pool.length === 0) continue

      const chosen = [...new Set(pool.sort(() => 0.5 - Math.random()).slice(0, numItems))]
      const items  = []
      let subtotal = 0

      for (const sku of chosen) {
        const p    = prodMap[sku]
        if (!p) continue
        const avail = stock[sku]
        if (avail <= 0) continue

        const festBoost = mult > 1.5 ? rand(2, 4) : 1
        const qty  = Math.min(avail, rand(1, 5) * festBoost)
        const price = p.sellingPrice
        const discount = qty >= 10 ? Math.round(price * 0.05) : 0  // wholesale bulk discount

        items.push({
          product:     p._id,
          productName: p.name,
          sku,
          quantity:    qty,
          unitPrice:   price - discount,
          total:       qty * (price - discount),
        })
        subtotal += qty * (price - discount)

        const before    = stock[sku]
        stock[sku]     -= qty

        movementDocs.push({
          product:     p._id,
          productName: p.name,
          type:        'sale',
          quantity:    -qty,
          stockBefore: before,
          stockAfter:  stock[sku],
          reference:   inv(saleSeq + 1),
          notes:       `Sale`,
          recordedBy:  s % 3 === 0 ? staffId : adminId,
          date:        new Date(date),
        })

        // Check alert thresholds
        const reorder = p.reorderLevel || 20
        if (stock[sku] <= 0) {
          alertDocs.push({
            type:        'out_of_stock',
            priority:    'critical',
            title:       `Out of Stock: ${p.name}`,
            message:     `${p.name} (${sku}) ran out of stock on ${date.toDateString()}.`,
            product:     p._id,
            productName: p.name,
            isRead:      d > 7,
            isAcknowledged: d > 14,
            createdAt:   new Date(date),
          })
          notifDocs.push({
            user:    managerId,
            title:   `Out of Stock: ${p.name}`,
            message: `${p.name} is out of stock. Immediate reorder needed.`,
            type:    'error',
            isRead:  d > 7,
            createdAt: new Date(date),
          })
        } else if (stock[sku] <= reorder) {
          if (rand(0, 1) === 0) {  // don't create duplicate alerts, sample ~50%
            alertDocs.push({
              type:     'low_stock',
              priority: stock[sku] <= reorder * 0.5 ? 'high' : 'medium',
              title:    `Low Stock: ${p.name}`,
              message:  `${p.name} has ${stock[sku]} units left. Reorder level: ${reorder}.`,
              product:  p._id,
              productName: p.name,
              isRead:   d > 3,
              isAcknowledged: d > 7,
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

      saleDocs.push({
        invoiceNumber: inv(saleSeq),
        items,
        subtotal,
        discount:      0,
        tax:           0,
        grandTotal:    subtotal,
        paymentMethod: pick(['cash','cash','cash','qr','card','credit']),
        customerName:  customer,
        status:        'completed',
        saleDate:      saleDate,
        recordedBy:    s % 3 === 0 ? staffId : adminId,
        createdAt:     saleDate,
        updatedAt:     saleDate,
      })

      auditDocs.push({
        userEmail:  s % 3 === 0 ? 'sita@himalayan.np' : 'admin@himalayan.np',
        action:     'CREATE_SALE',
        resource:   'Sale',
        resourceId: inv(saleSeq),
        details:    { invoiceNumber: inv(saleSeq), grandTotal: subtotal, itemCount: items.length },
        status:     'success',
        createdAt:  saleDate,
      })
    }
  }

  // Add some pending / supplier-delayed purchase orders at the end
  const pendingSupItems = highTurnover.slice(0, 4)
  for (const sku of pendingSupItems) {
    const p = prodMap[sku]
    if (!p) continue
    purchSeq++
    const qty = rand(50, 100)
    purchaseDocs.push({
      purchaseNumber: po(purchSeq),
      supplier:       pick(supIds),
      items: [{ product: p._id, productName: p.name, sku, quantity: qty, buyingPrice: p.buyingPrice, total: qty * p.buyingPrice }],
      subtotal:    qty * p.buyingPrice,
      discount:    0,
      grandTotal:  qty * p.buyingPrice,
      paymentStatus: 'pending',
      paymentMethod: 'credit',
      purchaseDate: daysAgo(rand(2, 5)),
      deliveryDate: daysAgo(-rand(2, 7)),  // future delivery
      status:       'ordered',
      notes:        'Supplier delayed — follow up required',
      recordedBy:   managerId,
    })
    alertDocs.push({
      type:     'supplier_delay',
      priority: 'medium',
      title:    `Supplier Delay: ${p.name}`,
      message:  `PO ${po(purchSeq)} delivery is pending. Contact supplier.`,
      productName: p.name,
      isRead:   false,
      isAcknowledged: false,
    })
  }

  // Bulk-insert everything
  console.log(`  Inserting ${saleDocs.length} sales...`)
  if (saleDocs.length > 0)    await Sale.insertMany(saleDocs, { ordered: false })

  console.log(`  Inserting ${purchaseDocs.length} purchases...`)
  if (purchaseDocs.length > 0) await Purchase.insertMany(purchaseDocs, { ordered: false })

  console.log(`  Inserting ${movementDocs.length} stock movements...`)
  if (movementDocs.length > 0) await StockMovement.insertMany(movementDocs, { ordered: false })

  console.log(`  Inserting ${alertDocs.length} alerts...`)
  if (alertDocs.length > 0)   await Alert.insertMany(alertDocs, { ordered: false })

  console.log(`  Inserting ${notifDocs.length} notifications...`)
  if (notifDocs.length > 0)   await Notification.insertMany(notifDocs, { ordered: false })

  console.log(`  Inserting ${auditDocs.length} audit logs...`)
  if (auditDocs.length > 0)   await AuditLog.insertMany(auditDocs, { ordered: false })

  // Update current stock on Product documents to match simulation
  console.log('  Updating product stock levels...')
  const bulkOps = Object.entries(stock).map(([sku, qty]) => {
    if (!prodMap[sku]) return null
    return {
      updateOne: {
        filter: { _id: prodMap[sku]._id },
        update: { $set: { currentStock: Math.max(0, qty) } },
      },
    }
  }).filter(Boolean)
  if (bulkOps.length > 0) await Product.bulkWrite(bulkOps)

  console.log(`  ✓ ${saleDocs.length} sales, ${purchaseDocs.length} purchases, ${movementDocs.length} movements, ${alertDocs.length} alerts`)
}

// ─── 8. FINAL ALERTS FOR CURRENT STATE ────────────────────────────────────────
async function seedCurrentAlerts() {
  // Create alerts for products currently below reorder level
  const lowProds = await Product.find({
    isActive: true,
    $expr: { $lt: ['$currentStock', '$reorderLevel'] }
  })

  const alertBatch = []
  for (const p of lowProds) {
    const exists = await Alert.findOne({ product: p._id, isAcknowledged: false })
    if (exists) continue

    alertBatch.push({
      type:     p.currentStock <= 0 ? 'out_of_stock' : 'low_stock',
      priority: p.currentStock <= 0 ? 'critical' : p.currentStock <= p.reorderLevel * 0.5 ? 'high' : 'medium',
      title:    p.currentStock <= 0 ? `Out of Stock: ${p.name}` : `Low Stock: ${p.name}`,
      message:  p.currentStock <= 0
        ? `${p.name} (${p.sku}) is out of stock. Immediate restocking required.`
        : `${p.name} has ${p.currentStock} units left (reorder at ${p.reorderLevel}).`,
      product:     p._id,
      productName: p.name,
      isRead:      false,
      isAcknowledged: false,
      metadata:    { currentStock: p.currentStock, reorderLevel: p.reorderLevel },
    })
  }

  if (alertBatch.length > 0) {
    await Alert.insertMany(alertBatch, { ordered: false })
    console.log(`  ✓ ${alertBatch.length} current-state alerts`)
  }
}

// ─── 9. NOTIFICATIONS FOR ADMIN ───────────────────────────────────────────────
async function seedNotifications(userIds) {
  const adminId = userIds['admin']
  const existing = await Notification.countDocuments({ user: adminId })
  if (existing > 5) {
    console.log(`  - Notifications exist (${existing}), skipping`)
    return
  }

  const msgs = [
    { title: 'Welcome to StockWise!',           message: 'Your Himalayan Wholesale Suppliers account is ready. Start by reviewing your inventory.', type: 'success', isRead: true  },
    { title: 'Daily Stock Report',               message: 'Today\'s stock summary: 12 low-stock items, 3 out of stock. Review alerts.', type: 'warning', isRead: true  },
    { title: 'Monthly Revenue Milestone',        message: 'Congratulations! This month revenue crossed NPR 5 Lakhs.', type: 'success', isRead: true  },
    { title: 'New Purchase Orders Created',      message: '4 purchase orders placed today totaling NPR 87,400.', type: 'info', isRead: false },
    { title: 'Supplier Delay Alert',             message: 'Nepal Food Corporation delivery for PO-000048 is 2 days overdue.', type: 'warning', isRead: false },
    { title: 'System Backup Complete',           message: 'Nightly database backup completed successfully.', type: 'success', isRead: false },
    { title: 'New Staff Account Created',        message: 'Sita Maharjan has been added as staff. Review access permissions.', type: 'info', isRead: true  },
    { title: 'Festival Sales Boost',            message: 'Nepali New Year sales were 180% of normal. Top seller: Rice 5kg.', type: 'info', isRead: true  },
  ]

  await Notification.insertMany(msgs.map(m => ({ ...m, user: adminId })), { ordered: false })
  console.log(`  ✓ ${msgs.length} notifications`)
}

// ─── 10. AUDIT LOGS FOR SETUP ─────────────────────────────────────────────────
async function seedSetupAuditLogs(userIds) {
  const adminId = userIds['admin']
  const existing = await AuditLog.countDocuments()
  if (existing > 0) return  // history seeder already inserted plenty

  await AuditLog.insertMany([
    { userEmail:'admin@himalayan.np', action:'SETUP_COMPLETE', resource:'Setting', details:{ message:'Company setup wizard completed' }, status:'success', createdAt: daysAgo(91) },
    { userEmail:'admin@himalayan.np', action:'CREATE_USER',    resource:'User', details:{ email:'ram@himalayan.np', role:'inventory_manager' }, status:'success', createdAt: daysAgo(90) },
    { userEmail:'admin@himalayan.np', action:'CREATE_USER',    resource:'User', details:{ email:'sita@himalayan.np', role:'staff' }, status:'success', createdAt: daysAgo(90) },
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

  console.log('\n▸ 90-Day Historical Simulation')
  await seedHistory(prodMap, sups, userIds)

  console.log('\n▸ Current-State Alerts')
  await seedCurrentAlerts()

  console.log('\n▸ Notifications')
  await seedNotifications(userIds)

  console.log('\n▸ Setup Audit Logs')
  await seedSetupAuditLogs(userIds)

  console.log('\n✅ Seed complete!\n')
  console.log('┌─────────────────────────────────────────────┐')
  console.log('│  Himalayan Wholesale Suppliers — Login Creds │')
  console.log('├──────────────────────┬──────────────────────┤')
  console.log('│  admin@himalayan.np  │  Admin1234           │')
  console.log('│  ram@himalayan.np    │  Manager1234         │')
  console.log('│  sita@himalayan.np   │  Staff1234           │')
  console.log('└──────────────────────┴──────────────────────┘')

  process.exit(0)
}

seed().catch(err => { console.error(err); process.exit(1) })

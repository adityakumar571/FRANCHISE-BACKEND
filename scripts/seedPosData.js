/**
 * POS Seed Script — Inserts complete pharmacy demo data
 * Run: node scripts/seedPosData.js
 *
 * Inserts into tenant DB (register.medicinedb):
 *   - 50 medicines with batches
 *   - 22 customers
 *   - 35 sale invoices (last 7 days)
 *   - 4 hold bills
 *   - Rack data
 *   - Staff
 */
import '../config/env.js';
import mongoose from 'mongoose';
import dotenv   from 'dotenv';

dotenv.config();

// ── Connect to tenant DB ─────────────────────────────────────────────────────
// Set TENANT_DB_URI in .env or pass as arg: node seedPosData.js mongodb+srv://...
const TENANT_DB_URI = process.argv[2] || process.env.TENANT_DB_URI;
const MAIN_DB_URI   = process.env.MAIN_DB_URI || process.env.BASE_DB_URI;

if (!TENANT_DB_URI && !MAIN_DB_URI) {
  console.error('❌  Pass tenant DB URI as arg: node scripts/seedPosData.js <mongodb-uri>');
  process.exit(1);
}

// ── Inline Schemas (avoid circular imports) ──────────────────────────────────
const MedicineSchema = new mongoose.Schema({
  name: String, salt: String, genericName: String, company: String,
  category: String, formulation: String, packSize: String,
  mrp: Number, purchasePrice: Number, gstPercent: Number,
  barcode: String, rackLabel: String,
  currentStock: { type: Number, default: 0 },
  reorderLevel:  { type: Number, default: 10 },
  isActive:      { type: Boolean, default: true },
}, { timestamps: true });

const MedicineBatchSchema = new mongoose.Schema({
  medicineId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
  batchNo:       String,
  expiryDate:    Date,
  qty:           Number,
  purchasePrice: Number,
  mrp:           Number,
  supplierId:    mongoose.Schema.Types.ObjectId,
  rackLabel:     String,
  isActive:      { type: Boolean, default: true },
}, { timestamps: true });

const CustomerSchema = new mongoose.Schema({
  customerId: String, name: String, phone: String, email: String,
  gender: String, dob: Date, address: String, tier: { type: String, default: 'Regular' },
  walletBalance: { type: Number, default: 0 }, loyaltyPoints: { type: Number, default: 0 },
  totalPurchase: { type: Number, default: 0 }, dueAmount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const SaleInvoiceSchema = new mongoose.Schema({
  invoiceNo: String, invoiceDate: Date, customerId: mongoose.Schema.Types.ObjectId,
  customerName: String, customerPhone: String,
  items: [{ medicineName: String, medicineId: mongoose.Schema.Types.ObjectId, qty: Number, mrp: Number, gstPct: Number, amount: Number }],
  subtotal: Number, discountAmt: Number, gstAmt: Number, totalAmt: Number,
  paymentMode: String, paidAmt: Number, dueAmt: Number,
  cashierName: String, status: String, isReturn: Boolean, notes: String,
}, { timestamps: true });

const HoldBillSchema = new mongoose.Schema({
  holdId: String, customerName: String, customerId: mongoose.Schema.Types.ObjectId,
  items: [{ medicineName: String, medicineId: mongoose.Schema.Types.ObjectId, qty: Number, mrp: Number, amount: Number }],
  subtotal: Number, totalAmt: Number, note: String,
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const RackSchema = new mongoose.Schema({
  code: String, area: String, shelf: String, description: String,
  capacity: Number, items: Number, isActive: { type: Boolean, default: true },
}, { timestamps: true });

// ── Medicine data ─────────────────────────────────────────────────────────────
const MEDICINES = [
  { name:'Dolo 650 Tablet',        salt:'Paracetamol',                   company:'Micro Labs',  category:'Pain Relief',   formulation:'Tablet',   packSize:'15 Tabs', mrp:32.50,  gstPercent:12, barcode:'MED001', rackLabel:'A-1', currentStock:150, reorderLevel:20 },
  { name:'Crocin 650 Tablet',      salt:'Paracetamol',                   company:'GSK',         category:'Pain Relief',   formulation:'Tablet',   packSize:'15 Tabs', mrp:28.00,  gstPercent:12, barcode:'MED002', rackLabel:'A-1', currentStock:200, reorderLevel:20 },
  { name:'Calpol 650 Tablet',      salt:'Paracetamol',                   company:'GSK',         category:'Pain Relief',   formulation:'Tablet',   packSize:'15 Tabs', mrp:30.00,  gstPercent:12, barcode:'MED003', rackLabel:'A-1', currentStock:180, reorderLevel:20 },
  { name:'Combiflam Tablet',       salt:'Ibuprofen+Paracetamol',         company:'Sanofi',      category:'Pain Relief',   formulation:'Tablet',   packSize:'20 Tabs', mrp:32.00,  gstPercent:12, barcode:'MED004', rackLabel:'A-2', currentStock:180, reorderLevel:20 },
  { name:'Ibuprofen 400mg',        salt:'Ibuprofen',                     company:'Abbott',      category:'Pain Relief',   formulation:'Tablet',   packSize:'10 Tabs', mrp:25.00,  gstPercent:12, barcode:'MED005', rackLabel:'A-2', currentStock:170, reorderLevel:25 },
  { name:'Azithral 500 Tablet',    salt:'Azithromycin',                  company:'Alembic',     category:'Antibiotic',    formulation:'Tablet',   packSize:'3 Tabs',  mrp:85.00,  gstPercent:12, barcode:'MED006', rackLabel:'B-1', currentStock:80,  reorderLevel:10 },
  { name:'Augmentin 625',          salt:'Amoxicillin+Clavulanic Acid',   company:'GSK',         category:'Antibiotic',    formulation:'Tablet',   packSize:'10 Tabs', mrp:225.00, gstPercent:12, barcode:'MED007', rackLabel:'B-1', currentStock:60,  reorderLevel:10 },
  { name:'Amoxicillin 500mg',      salt:'Amoxicillin',                   company:'Cipla',       category:'Antibiotic',    formulation:'Capsule',  packSize:'10 Caps', mrp:65.00,  gstPercent:12, barcode:'MED008', rackLabel:'B-2', currentStock:90,  reorderLevel:15 },
  { name:'Ciprofloxacin 500mg',    salt:'Ciprofloxacin',                 company:'Cipla',       category:'Antibiotic',    formulation:'Tablet',   packSize:'10 Tabs', mrp:38.00,  gstPercent:12, barcode:'MED009', rackLabel:'B-2', currentStock:120, reorderLevel:20 },
  { name:'Pantop DSR Capsule',     salt:'Pantoprazole+Domperidone',      company:'Aristo',      category:'Gastric',       formulation:'Capsule',  packSize:'10 Caps', mrp:92.00,  gstPercent:12, barcode:'MED010', rackLabel:'C-1', currentStock:120, reorderLevel:15 },
  { name:'Pan-D Tablet',           salt:'Pantoprazole+Domperidone',      company:'Alkem',       category:'Gastric',       formulation:'Tablet',   packSize:'10 Tabs', mrp:85.00,  gstPercent:12, barcode:'MED011', rackLabel:'C-1', currentStock:110, reorderLevel:15 },
  { name:'Omeprazole 20mg',        salt:'Omeprazole',                    company:'Dr Reddys',   category:'Gastric',       formulation:'Capsule',  packSize:'10 Caps', mrp:35.00,  gstPercent:12, barcode:'MED012', rackLabel:'C-1', currentStock:140, reorderLevel:20 },
  { name:'Pantoprazole 40mg',      salt:'Pantoprazole',                  company:'Sun Pharma',  category:'Gastric',       formulation:'Tablet',   packSize:'10 Tabs', mrp:55.00,  gstPercent:12, barcode:'MED013', rackLabel:'C-1', currentStock:130, reorderLevel:15 },
  { name:'Ranitidine 150mg',       salt:'Ranitidine',                    company:'GSK',         category:'Antacid',       formulation:'Tablet',   packSize:'10 Tabs', mrp:22.00,  gstPercent:12, barcode:'MED014', rackLabel:'C-2', currentStock:130, reorderLevel:20 },
  { name:'ENO Powder 5g',          salt:'Sodium Bicarbonate',            company:'GSK',         category:'Antacid',       formulation:'Powder',   packSize:'5g',      mrp:10.00,  gstPercent:18, barcode:'MED015', rackLabel:'C-2', currentStock:200, reorderLevel:40 },
  { name:'Metformin 500mg',        salt:'Metformin',                     company:'USV',         category:'Diabetic',      formulation:'Tablet',   packSize:'10 Tabs', mrp:22.00,  gstPercent:12, barcode:'MED016', rackLabel:'D-1', currentStock:250, reorderLevel:30 },
  { name:'Glimepiride 1mg',        salt:'Glimepiride',                   company:'Sun Pharma',  category:'Diabetic',      formulation:'Tablet',   packSize:'10 Tabs', mrp:38.00,  gstPercent:12, barcode:'MED017', rackLabel:'D-1', currentStock:180, reorderLevel:20 },
  { name:'Januvia 100mg',          salt:'Sitagliptin',                   company:'MSD',         category:'Diabetic',      formulation:'Tablet',   packSize:'14 Tabs', mrp:245.00, gstPercent:12, barcode:'MED018', rackLabel:'D-1', currentStock:45,  reorderLevel:10 },
  { name:'Atorvastatin 10mg',      salt:'Atorvastatin',                  company:'Cipla',       category:'Cardiac',       formulation:'Tablet',   packSize:'10 Tabs', mrp:45.00,  gstPercent:12, barcode:'MED019', rackLabel:'D-2', currentStock:200, reorderLevel:25 },
  { name:'Amlodipine 5mg',         salt:'Amlodipine',                    company:'Lupin',       category:'Cardiac',       formulation:'Tablet',   packSize:'10 Tabs', mrp:28.00,  gstPercent:12, barcode:'MED020', rackLabel:'D-2', currentStock:190, reorderLevel:25 },
  { name:'Telmisartan 40mg',       salt:'Telmisartan',                   company:'Glenmark',    category:'Cardiac',       formulation:'Tablet',   packSize:'10 Tabs', mrp:52.00,  gstPercent:12, barcode:'MED021', rackLabel:'D-2', currentStock:160, reorderLevel:20 },
  { name:'Aspirin 75mg',           salt:'Aspirin',                       company:'Bayer',       category:'Cardiac',       formulation:'Tablet',   packSize:'14 Tabs', mrp:15.00,  gstPercent:12, barcode:'MED022', rackLabel:'D-3', currentStock:220, reorderLevel:30 },
  { name:'Vitamin D3 60000 IU',    salt:'Cholecalciferol',               company:'Mankind',     category:'Vitamin',       formulation:'Capsule',  packSize:'4 Caps',  mrp:72.00,  gstPercent:5,  barcode:'MED023', rackLabel:'E-1', currentStock:100, reorderLevel:15 },
  { name:'Zincovit Tablet',        salt:'Multivitamin+Zinc',             company:'Apex',        category:'Vitamin',       formulation:'Tablet',   packSize:'15 Tabs', mrp:145.00, gstPercent:18, barcode:'MED024', rackLabel:'E-1', currentStock:70,  reorderLevel:10 },
  { name:'Becosules Capsule',      salt:'Vitamin B Complex',             company:'Pfizer',      category:'Vitamin',       formulation:'Capsule',  packSize:'20 Caps', mrp:35.00,  gstPercent:18, barcode:'MED025', rackLabel:'E-1', currentStock:120, reorderLevel:15 },
  { name:'Cetirizine 10mg',        salt:'Cetirizine',                    company:'Cipla',       category:'Antiallergic',  formulation:'Tablet',   packSize:'10 Tabs', mrp:18.00,  gstPercent:12, barcode:'MED026', rackLabel:'F-1', currentStock:150, reorderLevel:20 },
  { name:'Montelukast 10mg',       salt:'Montelukast',                   company:'Sun Pharma',  category:'Antiallergic',  formulation:'Tablet',   packSize:'10 Tabs', mrp:78.00,  gstPercent:12, barcode:'MED027', rackLabel:'F-1', currentStock:90,  reorderLevel:15 },
  { name:'Allegra 120mg',          salt:'Fexofenadine',                  company:'Sanofi',      category:'Antiallergic',  formulation:'Tablet',   packSize:'10 Tabs', mrp:135.00, gstPercent:12, barcode:'MED028', rackLabel:'F-1', currentStock:60,  reorderLevel:10 },
  { name:'Avil 25mg',              salt:'Pheniramine',                   company:'Sanofi',      category:'Antiallergic',  formulation:'Tablet',   packSize:'15 Tabs', mrp:25.00,  gstPercent:12, barcode:'MED029', rackLabel:'F-2', currentStock:140, reorderLevel:20 },
  { name:'Salbutamol Inhaler',     salt:'Salbutamol',                    company:'Cipla',       category:'Respiratory',   formulation:'Inhaler',  packSize:'200 Doses',mrp:125.00,gstPercent:12, barcode:'MED030', rackLabel:'G-1', currentStock:45,  reorderLevel:8  },
  { name:'Budecort Inhaler',       salt:'Budesonide',                    company:'Cipla',       category:'Respiratory',   formulation:'Inhaler',  packSize:'200 Doses',mrp:285.00,gstPercent:12, barcode:'MED031', rackLabel:'G-1', currentStock:30,  reorderLevel:5  },
  { name:'Deriphyllin Tablet',     salt:'Theophylline+Etofylline',       company:'Zydus',       category:'Respiratory',   formulation:'Tablet',   packSize:'10 Tabs', mrp:32.00,  gstPercent:12, barcode:'MED032', rackLabel:'G-1', currentStock:100, reorderLevel:20 },
  { name:'Cough Syrup 100ml',      salt:'Dextromethorphan',              company:'Sun Pharma',  category:'Cough & Cold',  formulation:'Syrup',    packSize:'100ml',   mrp:65.00,  gstPercent:18, barcode:'MED033', rackLabel:'H-1', currentStock:80,  reorderLevel:15 },
  { name:'Sinarest Tablet',        salt:'Chlorpheniramine+Paracetamol',  company:'Centaur',     category:'Cough & Cold',  formulation:'Tablet',   packSize:'15 Tabs', mrp:28.00,  gstPercent:12, barcode:'MED034', rackLabel:'H-1', currentStock:140, reorderLevel:20 },
  { name:'Vicks Vaporub 25g',      salt:'Camphor+Menthol',               company:'P&G',         category:'Cough & Cold',  formulation:'Ointment', packSize:'25g',     mrp:85.00,  gstPercent:18, barcode:'MED035', rackLabel:'H-1', currentStock:90,  reorderLevel:15 },
  { name:'Digene Gel 200ml',       salt:'Magnesium Hydroxide',           company:'Abbott',      category:'Antacid',       formulation:'Gel',      packSize:'200ml',   mrp:145.00, gstPercent:18, barcode:'MED036', rackLabel:'C-2', currentStock:60,  reorderLevel:10 },
  { name:'Norflox TZ Tablet',      salt:'Norfloxacin+Tinidazole',        company:'Cipla',       category:'Antidiarrheal', formulation:'Tablet',   packSize:'10 Tabs', mrp:42.00,  gstPercent:12, barcode:'MED037', rackLabel:'I-1', currentStock:95,  reorderLevel:15 },
  { name:'ORS Powder',             salt:'Oral Rehydration Salts',        company:'Cipla',       category:'Antidiarrheal', formulation:'Powder',   packSize:'21g',     mrp:8.50,   gstPercent:12, barcode:'MED038', rackLabel:'I-1', currentStock:200, reorderLevel:50 },
  { name:'Prednisolone 10mg',      salt:'Prednisolone',                  company:'Wyeth',       category:'Steroid',       formulation:'Tablet',   packSize:'10 Tabs', mrp:28.00,  gstPercent:12, barcode:'MED039', rackLabel:'J-1', currentStock:85,  reorderLevel:15 },
  { name:'Betadine Solution 100ml',salt:'Povidone Iodine',               company:'Win Medicare',category:'Antiseptic',    formulation:'Solution', packSize:'100ml',   mrp:112.00, gstPercent:18, barcode:'MED040', rackLabel:'K-1', currentStock:50,  reorderLevel:10 },
  { name:'Dettol Liquid 500ml',    salt:'Chloroxylenol',                 company:'Reckitt',     category:'Antiseptic',    formulation:'Liquid',   packSize:'500ml',   mrp:195.00, gstPercent:18, barcode:'MED041', rackLabel:'K-1', currentStock:45,  reorderLevel:8  },
  { name:'Gripe Water 130ml',      salt:'Dill Oil',                      company:'Woodwards',   category:'Infant Care',   formulation:'Liquid',   packSize:'130ml',   mrp:78.00,  gstPercent:18, barcode:'MED042', rackLabel:'L-1', currentStock:55,  reorderLevel:12 },
  { name:'Lactogen 1 (400g)',      salt:'Infant Formula',                company:'Nestle',      category:'Infant Care',   formulation:'Powder',   packSize:'400g',    mrp:550.00, gstPercent:0,  barcode:'MED043', rackLabel:'L-1', currentStock:25,  reorderLevel:5  },
  { name:'Cerelac (300g)',         salt:'Infant Cereal',                 company:'Nestle',      category:'Infant Care',   formulation:'Powder',   packSize:'300g',    mrp:190.00, gstPercent:0,  barcode:'MED044', rackLabel:'L-1', currentStock:40,  reorderLevel:8  },
  { name:'Rosuvastatin 10mg',      salt:'Rosuvastatin',                  company:'Sun Pharma',  category:'Cardiac',       formulation:'Tablet',   packSize:'10 Tabs', mrp:85.00,  gstPercent:12, barcode:'MED045', rackLabel:'D-3', currentStock:110, reorderLevel:15 },
  { name:'Lasix 40mg',             salt:'Furosemide',                    company:'Sanofi',      category:'Diuretic',      formulation:'Tablet',   packSize:'15 Tabs', mrp:22.00,  gstPercent:12, barcode:'MED046', rackLabel:'M-1', currentStock:130, reorderLevel:20 },
  { name:'Diclofenac 50mg',        salt:'Diclofenac',                    company:'Novartis',    category:'Pain Relief',   formulation:'Tablet',   packSize:'10 Tabs', mrp:18.00,  gstPercent:12, barcode:'MED047', rackLabel:'A-2', currentStock:160, reorderLevel:25 },
  { name:'Doxycycline 100mg',      salt:'Doxycycline',                   company:'Sun Pharma',  category:'Antibiotic',    formulation:'Capsule',  packSize:'10 Caps', mrp:42.00,  gstPercent:12, barcode:'MED048', rackLabel:'B-3', currentStock:95,  reorderLevel:15 },
  { name:'Loperamide 2mg',         salt:'Loperamide',                    company:'Sun Pharma',  category:'Antidiarrheal', formulation:'Capsule',  packSize:'10 Caps', mrp:28.00,  gstPercent:12, barcode:'MED049', rackLabel:'I-1', currentStock:80,  reorderLevel:15 },
  { name:'Clopidogrel 75mg',       salt:'Clopidogrel',                   company:'Sun Pharma',  category:'Cardiac',       formulation:'Tablet',   packSize:'10 Tabs', mrp:68.00,  gstPercent:12, barcode:'MED050', rackLabel:'D-3', currentStock:140, reorderLevel:20 },
];

const CUSTOMERS = [
  { customerId:'CUS001', name:'Amit Kumar',     phone:'9876543210', email:'amit.kumar@email.com',    gender:'Male',   tier:'Gold',     walletBalance:1200, loyaltyPoints:350, totalPurchase:45650, dueAmount:0,   isActive:true },
  { customerId:'CUS002', name:'Priya Sharma',   phone:'9876543211', email:'priya.sharma@email.com',  gender:'Female', tier:'Silver',   walletBalance:500,  loyaltyPoints:180, totalPurchase:28900, dueAmount:250, isActive:true },
  { customerId:'CUS003', name:'Rahul Verma',    phone:'9876543212', email:'rahul.verma@email.com',   gender:'Male',   tier:'Regular',  walletBalance:200,  loyaltyPoints:80,  totalPurchase:12400, dueAmount:0,   isActive:true },
  { customerId:'CUS004', name:'Sneha Patel',    phone:'9876543213', email:'sneha.patel@email.com',   gender:'Female', tier:'Gold',     walletBalance:850,  loyaltyPoints:420, totalPurchase:52000, dueAmount:0,   isActive:true },
  { customerId:'CUS005', name:'Rajesh Singh',   phone:'9876543214', email:'rajesh.singh@email.com',  gender:'Male',   tier:'Platinum', walletBalance:3500, loyaltyPoints:1200,totalPurchase:185000,dueAmount:0,   isActive:true },
  { customerId:'CUS006', name:'Anjali Gupta',   phone:'9876543215', email:'anjali.gupta@email.com',  gender:'Female', tier:'Regular',  walletBalance:100,  loyaltyPoints:50,  totalPurchase:8900,  dueAmount:0,   isActive:true },
  { customerId:'CUS007', name:'Vikram Reddy',   phone:'9876543216', email:'vikram.reddy@email.com',  gender:'Male',   tier:'Silver',   walletBalance:450,  loyaltyPoints:220, totalPurchase:35000, dueAmount:150, isActive:true },
  { customerId:'CUS008', name:'Pooja Mehta',    phone:'9876543217', email:'pooja.mehta@email.com',   gender:'Female', tier:'Regular',  walletBalance:0,    loyaltyPoints:30,  totalPurchase:5400,  dueAmount:0,   isActive:true },
  { customerId:'CUS009', name:'Suresh Rao',     phone:'9876543218', email:'suresh.rao@email.com',    gender:'Male',   tier:'Gold',     walletBalance:2100, loyaltyPoints:680, totalPurchase:92000, dueAmount:0,   isActive:true },
  { customerId:'CUS010', name:'Kavita Joshi',   phone:'9876543219', email:'kavita.joshi@email.com',  gender:'Female', tier:'Silver',   walletBalance:300,  loyaltyPoints:150, totalPurchase:24500, dueAmount:0,   isActive:true },
  { customerId:'CUS011', name:'Manoj Tiwari',   phone:'9876543220', email:'manoj.tiwari@email.com',  gender:'Male',   tier:'Regular',  walletBalance:50,   loyaltyPoints:25,  totalPurchase:4200,  dueAmount:0,   isActive:true },
  { customerId:'CUS012', name:'Deepa Nair',     phone:'9876543221', email:'deepa.nair@email.com',    gender:'Female', tier:'Diamond',  walletBalance:8000, loyaltyPoints:3500,totalPurchase:520000,dueAmount:0,   isActive:true },
  { customerId:'CUS013', name:'Arun Kapoor',    phone:'9876543222', email:'arun.kapoor@email.com',   gender:'Male',   tier:'Gold',     walletBalance:1500, loyaltyPoints:520, totalPurchase:68000, dueAmount:500, isActive:true },
  { customerId:'CUS014', name:'Meera Iyer',     phone:'9876543223', email:'meera.iyer@email.com',    gender:'Female', tier:'Regular',  walletBalance:0,    loyaltyPoints:10,  totalPurchase:1800,  dueAmount:0,   isActive:true },
  { customerId:'CUS015', name:'Sanjay Desai',   phone:'9876543224', email:'sanjay.desai@email.com',  gender:'Male',   tier:'Silver',   walletBalance:600,  loyaltyPoints:280, totalPurchase:42000, dueAmount:0,   isActive:true },
  { customerId:'CUS016', name:'Ritu Bansal',    phone:'9876543225', email:'ritu.bansal@email.com',   gender:'Female', tier:'Regular',  walletBalance:150,  loyaltyPoints:65,  totalPurchase:9800,  dueAmount:0,   isActive:true },
  { customerId:'CUS017', name:'Naveen Kumar',   phone:'9876543226', email:'naveen.kumar@email.com',  gender:'Male',   tier:'Gold',     walletBalance:1800, loyaltyPoints:580, totalPurchase:75000, dueAmount:0,   isActive:true },
  { customerId:'CUS018', name:'Divya Rao',      phone:'9876543227', email:'divya.rao@email.com',     gender:'Female', tier:'Platinum', walletBalance:4200, loyaltyPoints:1450,totalPurchase:210000,dueAmount:0,   isActive:true },
  { customerId:'CUS019', name:'Kiran Sethi',    phone:'9876543228', email:'kiran.sethi@email.com',   gender:'Male',   tier:'Silver',   walletBalance:400,  loyaltyPoints:195, totalPurchase:31000, dueAmount:0,   isActive:true },
  { customerId:'CUS020', name:'Nisha Agarwal',  phone:'9876543229', email:'nisha.agarwal@email.com', gender:'Female', tier:'Regular',  walletBalance:0,    loyaltyPoints:15,  totalPurchase:2600,  dueAmount:0,   isActive:true },
];

const RACK_DATA = [
  { code:'A-1', area:'Main Store', shelf:'Shelf 1', description:'Pain Relief - Paracetamol',  capacity:200, items:150 },
  { code:'A-2', area:'Main Store', shelf:'Shelf 1', description:'Pain Relief - Ibuprofen',    capacity:150, items:120 },
  { code:'B-1', area:'Main Store', shelf:'Shelf 2', description:'Antibiotics - Azithromycin', capacity:100, items:60  },
  { code:'B-2', area:'Main Store', shelf:'Shelf 2', description:'Antibiotics - Amoxicillin',  capacity:120, items:90  },
  { code:'B-3', area:'Main Store', shelf:'Shelf 2', description:'Antibiotics - Others',       capacity:100, items:70  },
  { code:'C-1', area:'Main Store', shelf:'Shelf 3', description:'Gastric / PPI',              capacity:150, items:110 },
  { code:'C-2', area:'Main Store', shelf:'Shelf 3', description:'Antacids',                   capacity:200, items:160 },
  { code:'D-1', area:'Main Store', shelf:'Shelf 4', description:'Diabetic Medicines',         capacity:180, items:140 },
  { code:'D-2', area:'Main Store', shelf:'Shelf 4', description:'Cardiac - BP / Statins',     capacity:160, items:120 },
  { code:'D-3', area:'Main Store', shelf:'Shelf 4', description:'Cardiac - Others',           capacity:140, items:100 },
  { code:'E-1', area:'Main Store', shelf:'Shelf 5', description:'Vitamins & Supplements',     capacity:120, items:85  },
  { code:'F-1', area:'Section B',  shelf:'Shelf 1', description:'Antiallergic',               capacity:100, items:75  },
  { code:'F-2', area:'Section B',  shelf:'Shelf 1', description:'Antiallergic - Others',      capacity:80,  items:55  },
  { code:'G-1', area:'Section B',  shelf:'Shelf 2', description:'Respiratory',                capacity:80,  items:55  },
  { code:'H-1', area:'Section B',  shelf:'Shelf 3', description:'Cough & Cold',               capacity:100, items:80  },
  { code:'I-1', area:'Section B',  shelf:'Shelf 4', description:'Antidiarrheal',              capacity:90,  items:65  },
  { code:'J-1', area:'Section B',  shelf:'Shelf 5', description:'Steroid / Hormones',         capacity:80,  items:50  },
  { code:'K-1', area:'Section C',  shelf:'Shelf 1', description:'Antiseptics',                capacity:80,  items:50  },
  { code:'L-1', area:'Section C',  shelf:'Shelf 2', description:'Infant Care',                capacity:60,  items:40  },
  { code:'M-1', area:'Section C',  shelf:'Shelf 3', description:'Diuretics / Others',         capacity:80,  items:60  },
];

async function seedAll(db) {
  const Medicine     = db.model('FranchiseMedicine',  MedicineSchema);
  const MedBatch     = db.model('FranchiseMedicineBatch', MedicineBatchSchema);
  const Customer     = db.model('FranchiseCustomer',  CustomerSchema);
  const SaleInvoice  = db.model('FranchiseSaleInvoice', SaleInvoiceSchema);
  const HoldBill     = db.model('FranchiseHoldBill',  HoldBillSchema);
  const Rack         = db.model('FranchiseRack',       RackSchema);

  // ── Medicines ──────────────────────────────────────────────────────────────
  const medCount = await Medicine.countDocuments();
  if (medCount === 0) {
    console.log('🌱 Seeding 50 medicines...');
    const insertedMeds = await Medicine.insertMany(MEDICINES.map(m => ({ ...m, isActive: true, purchasePrice: m.mrp * 0.65 })));
    
    // Batches — 2 per medicine
    const batches = [];
    insertedMeds.forEach((med, i) => {
      for (let b = 0; b < 2; b++) {
        batches.push({
          medicineId:    med._id,
          batchNo:       `B${String(250001 + i * 2 + b).padStart(6,'0')}`,
          expiryDate:    new Date(Date.now() + (365 + b * 120) * 86400000),
          qty:           Math.floor(med.currentStock / 2),
          purchasePrice: med.purchasePrice || med.mrp * 0.65,
          mrp:           med.mrp,
          rackLabel:     med.rackLabel,
          isActive:      true,
        });
      }
    });
    await MedBatch.insertMany(batches);
    console.log(`  ✅ ${insertedMeds.length} medicines + ${batches.length} batches`);
  } else {
    console.log(`  ⏭  Medicines already exist (${medCount})`);
  }

  // ── Customers ──────────────────────────────────────────────────────────────
  const custCount = await Customer.countDocuments();
  if (custCount === 0) {
    console.log('🌱 Seeding 20 customers...');
    await Customer.insertMany(CUSTOMERS);
    console.log(`  ✅ ${CUSTOMERS.length} customers`);
  } else {
    console.log(`  ⏭  Customers already exist (${custCount})`);
  }

  // ── Sale Invoices — 7 days of history ─────────────────────────────────────
  const invCount = await SaleInvoice.countDocuments();
  if (invCount === 0) {
    console.log('🌱 Seeding 35 sale invoices (last 7 days)...');
    const year = new Date().getFullYear();
    const cusNames = CUSTOMERS.slice(0, 10).map(c => c.name);
    const payModes = ['Cash', 'UPI', 'Card', 'Credit', 'Cash', 'UPI', 'Cash'];
    const medItems = [
      { name:'Dolo 650 Tablet', mrp:32.50, gst:12 },
      { name:'Pantop DSR Capsule', mrp:92.00, gst:12 },
      { name:'Augmentin 625', mrp:225.00, gst:12 },
      { name:'Metformin 500mg', mrp:22.00, gst:12 },
      { name:'Atorvastatin 10mg', mrp:45.00, gst:12 },
      { name:'Cetirizine 10mg', mrp:18.00, gst:12 },
      { name:'Vitamin D3 60000 IU', mrp:72.00, gst:5 },
      { name:'Zincovit Tablet', mrp:145.00, gst:18 },
      { name:'Omeprazole 20mg', mrp:35.00, gst:12 },
      { name:'Amoxicillin 500mg', mrp:65.00, gst:12 },
    ];

    const invoices = [];
    for (let i = 0; i < 35; i++) {
      const dayBack = Math.floor(i / 5);
      const invDate = new Date(Date.now() - dayBack * 86400000);
      invDate.setHours(8 + (i % 10), (i * 7) % 60, 0, 0);
      const itemCount = 2 + (i % 3);
      const items = [];
      let subtotal = 0;
      for (let j = 0; j < itemCount; j++) {
        const m = medItems[(i * 2 + j) % medItems.length];
        const qty = 1 + (j % 2);
        const amt = qty * m.mrp;
        subtotal += amt;
        items.push({ medicineName: m.name, qty, mrp: m.mrp, gstPct: m.gst, amount: amt });
      }
      const disc = i % 7 === 0 ? subtotal * 0.1 : 0;
      const gstAmt = (subtotal - disc) * 0.12;
      const total = subtotal - disc + gstAmt;
      const mode = payModes[i % payModes.length];
      invoices.push({
        invoiceNo:    `INV-${year}-${String(2001 + i).padStart(4,'0')}`,
        invoiceDate:  invDate,
        customerName: i % 5 === 0 ? 'Walk-In Customer' : cusNames[i % cusNames.length],
        items, subtotal, discountAmt: disc, gstAmt, totalAmt: total,
        paymentMode:  mode, paidAmt: mode === 'Credit' ? total * 0.5 : total,
        dueAmt:       mode === 'Credit' ? total * 0.5 : 0,
        cashierName: 'Admin', status: 'Completed', isReturn: false,
      });
    }
    await SaleInvoice.insertMany(invoices);
    console.log(`  ✅ ${invoices.length} invoices`);
  } else {
    console.log(`  ⏭  Invoices already exist (${invCount})`);
  }

  // ── Hold Bills ─────────────────────────────────────────────────────────────
  const holdCount = await HoldBill.countDocuments({ isActive: true });
  if (holdCount === 0) {
    console.log('🌱 Seeding 4 hold bills...');
    await HoldBill.insertMany([
      { holdId:'HB001', customerName:'Rahul Verma',  items:[{ medicineName:'Crocin 650 Tablet', qty:2, mrp:28, amount:56 },{ medicineName:'Pantoprazole 40mg', qty:1, mrp:55, amount:55 },{ medicineName:'Vitamin D3 60000 IU', qty:1, mrp:72, amount:72 }], subtotal:183, totalAmt:183, note:'Fever bill', isActive:true },
      { holdId:'HB002', customerName:'Priya Sharma', items:[{ medicineName:'Augmentin 625', qty:1, mrp:225, amount:225 },{ medicineName:'Calpol 650 Tablet', qty:2, mrp:30, amount:60 },{ medicineName:'Zincovit Tablet', qty:1, mrp:145, amount:145 }], subtotal:430, totalAmt:430, note:"Priya's prescription", isActive:true },
      { holdId:'HB003', customerName:'Walk-In',      items:[{ medicineName:'Dolo 650 Tablet', qty:3, mrp:32.5, amount:97.5 },{ medicineName:'Omeprazole 20mg', qty:2, mrp:35, amount:70 }], subtotal:167.5, totalAmt:167.5, note:'OPD patient', isActive:true },
      { holdId:'HB004', customerName:'Amit Kumar',   items:[{ medicineName:'Metformin 500mg', qty:3, mrp:22, amount:66 },{ medicineName:'Atorvastatin 10mg', qty:2, mrp:45, amount:90 },{ medicineName:'Aspirin 75mg', qty:2, mrp:15, amount:30 }], subtotal:186, totalAmt:186, note:'Diabetes monthly', isActive:true },
    ]);
    console.log('  ✅ 4 hold bills');
  } else {
    console.log(`  ⏭  Hold bills already exist (${holdCount})`);
  }

  // ── Racks ──────────────────────────────────────────────────────────────────
  const rackCount = await Rack.countDocuments();
  if (rackCount === 0) {
    console.log('🌱 Seeding 20 racks...');
    await Rack.insertMany(RACK_DATA.map(r => ({ ...r, isActive: true })));
    console.log('  ✅ 20 racks');
  } else {
    console.log(`  ⏭  Racks already exist (${rackCount})`);
  }
}

async function main() {
  const uri = TENANT_DB_URI || MAIN_DB_URI;
  console.log('\n🚀 Connecting to DB...');
  
  const db = mongoose.createConnection(uri, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 15000,
  });

  await new Promise((resolve, reject) => {
    db.once('connected', resolve);
    db.once('error', reject);
  });

  console.log('✅ Connected\n');
  console.log('═══════════════════════════════════');
  console.log(' POS Demo Data Seed');
  console.log('═══════════════════════════════════\n');

  await seedAll(db);

  console.log('\n═══════════════════════════════════');
  console.log(' ✅ Seed complete!');
  console.log('═══════════════════════════════════\n');
  console.log('Now open POS → /franchise/pos/billing');
  console.log('Search "dolo" or "paracetamol" to test\n');

  await db.close();
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});

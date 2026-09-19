/* eslint-disable */
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { apiResponse } from '../../../utils/apiResponse.js';
import { getMedicineModel } from '../../../models/tenant/franchise/Medicine.model.js';
import { getMedicineBatchModel } from '../../../models/tenant/franchise/MedicineBatch.model.js';
import { getCustomerModel } from '../../../models/tenant/franchise/Customer.model.js';
import { getSaleInvoiceModel } from '../../../models/tenant/franchise/SaleInvoice.model.js';
import { getHoldBillModel } from '../../../models/tenant/franchise/HoldBill.model.js';
import { getDayClosingModel } from '../../../models/tenant/franchise/DayClosing.model.js';

// ────────────────────────────────────────────────────────────────────────────
// Seed Medicine + MedicineBatch data (50+ medicines with batches)
// ────────────────────────────────────────────────────────────────────────────
const seedMedicineData = async (db) => {
  const Medicine = getMedicineModel(db);
  const MedicineBatch = getMedicineBatchModel(db);
  const count = await Medicine.countDocuments();
  if (count > 0) return;

  const medicines = [
    { name: 'Dolo 650 Tablet', salt: 'Paracetamol', company: 'Micro Labs', category: 'Pain Relief', formulation: 'Tablet', packSize: '15 Tablets', mrp: 32.50, gstPercent: 12, barcode: 'MED001', rackLabel: 'A-1', reorderLevel: 20, currentStock: 150 },
    { name: 'Crocin 650 Tablet', salt: 'Paracetamol', company: 'GSK', category: 'Pain Relief', formulation: 'Tablet', packSize: '15 Tablets', mrp: 28.00, gstPercent: 12, barcode: 'MED002', rackLabel: 'A-1', reorderLevel: 20, currentStock: 200 },
    { name: 'Calpol 650 Tablet', salt: 'Paracetamol', company: 'GSK', category: 'Pain Relief', formulation: 'Tablet', packSize: '15 Tablets', mrp: 30.00, gstPercent: 12, barcode: 'MED003', rackLabel: 'A-1', reorderLevel: 20, currentStock: 180 },
    { name: 'Azithral 500 Tablet', salt: 'Azithromycin', company: 'Alembic', category: 'Antibiotic', formulation: 'Tablet', packSize: '3 Tablets', mrp: 85.00, gstPercent: 12, barcode: 'MED004', rackLabel: 'B-2', reorderLevel: 10, currentStock: 80 },
    { name: 'Augmentin 625', salt: 'Amoxicillin+Clavulanic Acid', company: 'GSK', category: 'Antibiotic', formulation: 'Tablet', packSize: '10 Tablets', mrp: 225.00, gstPercent: 12, barcode: 'MED005', rackLabel: 'B-2', reorderLevel: 10, currentStock: 60 },
    { name: 'Amoxicillin 500mg', salt: 'Amoxicillin', company: 'Cipla', category: 'Antibiotic', formulation: 'Capsule', packSize: '10 Capsules', mrp: 65.00, gstPercent: 12, barcode: 'MED006', rackLabel: 'B-2', reorderLevel: 15, currentStock: 90 },
    { name: 'Pantop DSR Capsule', salt: 'Pantoprazole+Domperidone', company: 'Aristo', category: 'Gastric', formulation: 'Capsule', packSize: '10 Capsules', mrp: 92.00, gstPercent: 12, barcode: 'MED007', rackLabel: 'C-1', reorderLevel: 15, currentStock: 120 },
    { name: 'Pan-D Tablet', salt: 'Pantoprazole+Domperidone', company: 'Alkem', category: 'Gastric', formulation: 'Tablet', packSize: '10 Tablets', mrp: 85.00, gstPercent: 12, barcode: 'MED008', rackLabel: 'C-1', reorderLevel: 15, currentStock: 110 },
    { name: 'Omeprazole 20mg', salt: 'Omeprazole', company: 'Dr Reddy', category: 'Gastric', formulation: 'Capsule', packSize: '10 Capsules', mrp: 35.00, gstPercent: 12, barcode: 'MED009', rackLabel: 'C-1', reorderLevel: 20, currentStock: 140 },
    { name: 'Pantoprazole 40mg', salt: 'Pantoprazole', company: 'Sun Pharma', category: 'Gastric', formulation: 'Tablet', packSize: '10 Tablets', mrp: 55.00, gstPercent: 12, barcode: 'MED010', rackLabel: 'C-1', reorderLevel: 15, currentStock: 130 },
    { name: 'Metformin 500mg', salt: 'Metformin', company: 'USV', category: 'Diabetic', formulation: 'Tablet', packSize: '10 Tablets', mrp: 22.00, gstPercent: 12, barcode: 'MED011', rackLabel: 'D-1', reorderLevel: 30, currentStock: 250 },
    { name: 'Glimepiride 1mg', salt: 'Glimepiride', company: 'Sun Pharma', category: 'Diabetic', formulation: 'Tablet', packSize: '10 Tablets', mrp: 38.00, gstPercent: 12, barcode: 'MED012', rackLabel: 'D-1', reorderLevel: 20, currentStock: 180 },
    { name: 'Atorvastatin 10mg', salt: 'Atorvastatin', company: 'Cipla', category: 'Cardiac', formulation: 'Tablet', packSize: '10 Tablets', mrp: 45.00, gstPercent: 12, barcode: 'MED013', rackLabel: 'D-2', reorderLevel: 25, currentStock: 200 },
    { name: 'Amlodipine 5mg', salt: 'Amlodipine', company: 'Lupin', category: 'Cardiac', formulation: 'Tablet', packSize: '10 Tablets', mrp: 28.00, gstPercent: 12, barcode: 'MED014', rackLabel: 'D-2', reorderLevel: 25, currentStock: 190 },
    { name: 'Telmisartan 40mg', salt: 'Telmisartan', company: 'Glenmark', category: 'Cardiac', formulation: 'Tablet', packSize: '10 Tablets', mrp: 52.00, gstPercent: 12, barcode: 'MED015', rackLabel: 'D-2', reorderLevel: 20, currentStock: 160 },
    { name: 'Vitamin D3 60000 IU', salt: 'Cholecalciferol', company: 'Mankind', category: 'Vitamin', formulation: 'Capsule', packSize: '4 Capsules', mrp: 72.00, gstPercent: 5, barcode: 'MED016', rackLabel: 'E-1', reorderLevel: 15, currentStock: 100 },
    { name: 'Zincovit Tablet', salt: 'Multivitamin+Zinc', company: 'Apex', category: 'Vitamin', formulation: 'Tablet', packSize: '15 Tablets', mrp: 145.00, gstPercent: 18, barcode: 'MED017', rackLabel: 'E-1', reorderLevel: 10, currentStock: 70 },
    { name: 'Becosules Capsule', salt: 'Vitamin B Complex', company: 'Pfizer', category: 'Vitamin', formulation: 'Capsule', packSize: '20 Capsules', mrp: 35.00, gstPercent: 18, barcode: 'MED018', rackLabel: 'E-1', reorderLevel: 15, currentStock: 120 },
    { name: 'Cetirizine 10mg', salt: 'Cetirizine', company: 'Cipla', category: 'Antiallergic', formulation: 'Tablet', packSize: '10 Tablets', mrp: 18.00, gstPercent: 12, barcode: 'MED019', rackLabel: 'F-1', reorderLevel: 20, currentStock: 150 },
    { name: 'Montelukast 10mg', salt: 'Montelukast', company: 'Sun Pharma', category: 'Antiallergic', formulation: 'Tablet', packSize: '10 Tablets', mrp: 78.00, gstPercent: 12, barcode: 'MED020', rackLabel: 'F-1', reorderLevel: 15, currentStock: 90 },
    { name: 'Levocet M Tablet', salt: 'Levocetirizine+Montelukast', company: 'Sun Pharma', category: 'Antiallergic', formulation: 'Tablet', packSize: '10 Tablets', mrp: 95.00, gstPercent: 12, barcode: 'MED021', rackLabel: 'F-1', reorderLevel: 15, currentStock: 85 },
    { name: 'Allegra 120mg', salt: 'Fexofenadine', company: 'Sanofi', category: 'Antiallergic', formulation: 'Tablet', packSize: '10 Tablets', mrp: 135.00, gstPercent: 12, barcode: 'MED022', rackLabel: 'F-1', reorderLevel: 10, currentStock: 60 },
    { name: 'Avil 25mg', salt: 'Pheniramine', company: 'Sanofi', category: 'Antiallergic', formulation: 'Tablet', packSize: '15 Tablets', mrp: 25.00, gstPercent: 12, barcode: 'MED023', rackLabel: 'F-2', reorderLevel: 20, currentStock: 140 },
    { name: 'Loperamide 2mg', salt: 'Loperamide', company: 'Sun Pharma', category: 'Antidiarrheal', formulation: 'Capsule', packSize: '10 Capsules', mrp: 28.00, gstPercent: 12, barcode: 'MED024', rackLabel: 'G-1', reorderLevel: 15, currentStock: 80 },
    { name: 'ORS Powder', salt: 'Oral Rehydration Salts', company: 'Cipla', category: 'Antidiarrheal', formulation: 'Powder', packSize: '21g', mrp: 8.50, gstPercent: 12, barcode: 'MED025', rackLabel: 'G-1', reorderLevel: 50, currentStock: 200 },
    { name: 'Norflox TZ Tablet', salt: 'Norfloxacin+Tinidazole', company: 'Cipla', category: 'Antidiarrheal', formulation: 'Tablet', packSize: '10 Tablets', mrp: 42.00, gstPercent: 12, barcode: 'MED026', rackLabel: 'G-1', reorderLevel: 15, currentStock: 95 },
    { name: 'Ibuprofen 400mg', salt: 'Ibuprofen', company: 'Abbott', category: 'Pain Relief', formulation: 'Tablet', packSize: '10 Tablets', mrp: 25.00, gstPercent: 12, barcode: 'MED027', rackLabel: 'A-2', reorderLevel: 25, currentStock: 170 },
    { name: 'Diclofenac 50mg', salt: 'Diclofenac', company: 'Novartis', category: 'Pain Relief', formulation: 'Tablet', packSize: '10 Tablets', mrp: 18.00, gstPercent: 12, barcode: 'MED028', rackLabel: 'A-2', reorderLevel: 25, currentStock: 160 },
    { name: 'Combiflam Tablet', salt: 'Ibuprofen+Paracetamol', company: 'Sanofi', category: 'Pain Relief', formulation: 'Tablet', packSize: '20 Tablets', mrp: 32.00, gstPercent: 12, barcode: 'MED029', rackLabel: 'A-2', reorderLevel: 20, currentStock: 180 },
    { name: 'Aspirin 75mg', salt: 'Aspirin', company: 'Bayer', category: 'Cardiac', formulation: 'Tablet', packSize: '14 Tablets', mrp: 15.00, gstPercent: 12, barcode: 'MED030', rackLabel: 'D-3', reorderLevel: 30, currentStock: 220 },
    { name: 'Clopidogrel 75mg', salt: 'Clopidogrel', company: 'Sun Pharma', category: 'Cardiac', formulation: 'Tablet', packSize: '10 Tablets', mrp: 68.00, gstPercent: 12, barcode: 'MED031', rackLabel: 'D-3', reorderLevel: 20, currentStock: 140 },
    { name: 'Rosuvastatin 10mg', salt: 'Rosuvastatin', company: 'Sun Pharma', category: 'Cardiac', formulation: 'Tablet', packSize: '10 Tablets', mrp: 85.00, gstPercent: 12, barcode: 'MED032', rackLabel: 'D-3', reorderLevel: 15, currentStock: 110 },
    { name: 'Lasix 40mg', salt: 'Furosemide', company: 'Sanofi', category: 'Diuretic', formulation: 'Tablet', packSize: '15 Tablets', mrp: 22.00, gstPercent: 12, barcode: 'MED033', rackLabel: 'H-1', reorderLevel: 20, currentStock: 130 },
    { name: 'Ciprofloxacin 500mg', salt: 'Ciprofloxacin', company: 'Cipla', category: 'Antibiotic', formulation: 'Tablet', packSize: '10 Tablets', mrp: 38.00, gstPercent: 12, barcode: 'MED034', rackLabel: 'B-3', reorderLevel: 20, currentStock: 120 },
    { name: 'Doxycycline 100mg', salt: 'Doxycycline', company: 'Sun Pharma', category: 'Antibiotic', formulation: 'Capsule', packSize: '10 Capsules', mrp: 42.00, gstPercent: 12, barcode: 'MED035', rackLabel: 'B-3', reorderLevel: 15, currentStock: 95 },
    { name: 'Prednisolone 10mg', salt: 'Prednisolone', company: 'Wyeth', category: 'Steroid', formulation: 'Tablet', packSize: '10 Tablets', mrp: 28.00, gstPercent: 12, barcode: 'MED036', rackLabel: 'I-1', reorderLevel: 15, currentStock: 85 },
    { name: 'Deriphyllin Tablet', salt: 'Theophylline+Etofylline', company: 'Zydus', category: 'Respiratory', formulation: 'Tablet', packSize: '10 Tablets', mrp: 32.00, gstPercent: 12, barcode: 'MED037', rackLabel: 'J-1', reorderLevel: 20, currentStock: 100 },
    { name: 'Salbutamol Inhaler', salt: 'Salbutamol', company: 'Cipla', category: 'Respiratory', formulation: 'Inhaler', packSize: '200 Doses', mrp: 125.00, gstPercent: 12, barcode: 'MED038', rackLabel: 'J-1', reorderLevel: 10, currentStock: 45 },
    { name: 'Budecort Inhaler', salt: 'Budesonide', company: 'Cipla', category: 'Respiratory', formulation: 'Inhaler', packSize: '200 Doses', mrp: 285.00, gstPercent: 12, barcode: 'MED039', rackLabel: 'J-1', reorderLevel: 8, currentStock: 30 },
    { name: 'Cough Syrup 100ml', salt: 'Dextromethorphan', company: 'Sun Pharma', category: 'Cough & Cold', formulation: 'Syrup', packSize: '100ml', mrp: 65.00, gstPercent: 18, barcode: 'MED040', rackLabel: 'K-1', reorderLevel: 15, currentStock: 80 },
    { name: 'Sinarest Tablet', salt: 'Chlorpheniramine+Paracetamol', company: 'Centaur', category: 'Cough & Cold', formulation: 'Tablet', packSize: '15 Tablets', mrp: 28.00, gstPercent: 12, barcode: 'MED041', rackLabel: 'K-1', reorderLevel: 20, currentStock: 140 },
    { name: 'Vicks Vaporub 25g', salt: 'Camphor+Menthol', company: 'P&G', category: 'Cough & Cold', formulation: 'Ointment', packSize: '25g', mrp: 85.00, gstPercent: 18, barcode: 'MED042', rackLabel: 'K-1', reorderLevel: 15, currentStock: 90 },
    { name: 'Digene Gel 200ml', salt: 'Magnesium Hydroxide', company: 'Abbott', category: 'Antacid', formulation: 'Gel', packSize: '200ml', mrp: 145.00, gstPercent: 18, barcode: 'MED043', rackLabel: 'C-2', reorderLevel: 10, currentStock: 60 },
    { name: 'ENO Powder 5g', salt: 'Sodium Bicarbonate', company: 'GSK', category: 'Antacid', formulation: 'Powder', packSize: '5g', mrp: 10.00, gstPercent: 18, barcode: 'MED044', rackLabel: 'C-2', reorderLevel: 40, currentStock: 200 },
    { name: 'Ranitidine 150mg', salt: 'Ranitidine', company: 'GSK', category: 'Antacid', formulation: 'Tablet', packSize: '10 Tablets', mrp: 22.00, gstPercent: 12, barcode: 'MED045', rackLabel: 'C-2', reorderLevel: 20, currentStock: 130 },
    { name: 'Lactogen 1 (400g)', salt: 'Infant Formula', company: 'Nestle', category: 'Infant Care', formulation: 'Powder', packSize: '400g', mrp: 550.00, gstPercent: 0, barcode: 'MED046', rackLabel: 'L-1', reorderLevel: 5, currentStock: 25 },
    { name: 'Cerelac (300g)', salt: 'Infant Cereal', company: 'Nestle', category: 'Infant Care', formulation: 'Powder', packSize: '300g', mrp: 190.00, gstPercent: 0, barcode: 'MED047', rackLabel: 'L-1', reorderLevel: 8, currentStock: 40 },
    { name: 'Gripe Water 130ml', salt: 'Dill Oil', company: 'Woodwards', category: 'Infant Care', formulation: 'Liquid', packSize: '130ml', mrp: 78.00, gstPercent: 18, barcode: 'MED048', rackLabel: 'L-1', reorderLevel: 12, currentStock: 55 },
    { name: 'Betadine Solution 100ml', salt: 'Povidone Iodine', company: 'Win Medicare', category: 'Antiseptic', formulation: 'Solution', packSize: '100ml', mrp: 112.00, gstPercent: 18, barcode: 'MED049', rackLabel: 'M-1', reorderLevel: 10, currentStock: 50 },
    { name: 'Dettol Liquid 500ml', salt: 'Chloroxylenol', company: 'Reckitt', category: 'Antiseptic', formulation: 'Liquid', packSize: '500ml', mrp: 195.00, gstPercent: 18, barcode: 'MED050', rackLabel: 'M-1', reorderLevel: 8, currentStock: 45 },
  ];

  const insertedMeds = await Medicine.insertMany(medicines.map(m => ({ ...m, isActive: true })));

  // Create batches for each medicine (2-3 batches per medicine)
  const batches = [];
  insertedMeds.forEach((med, i) => {
    const batchCount = i % 3 === 0 ? 3 : 2;
    for (let b = 0; b < batchCount; b++) {
      batches.push({
        medicineId: med._id,
        batchNo: `B${String(240001 + i * 3 + b).padStart(6, '0')}`,
        expiryDate: new Date(Date.now() + (300 + b * 100) * 86400000),
        qty: Math.floor(med.currentStock / batchCount),
        purchasePrice: med.mrp * 0.65,
        mrp: med.mrp,
        rackLabel: med.rackLabel,
        isActive: true,
      });
    }
  });
  await MedicineBatch.insertMany(batches);
};

// ────────────────────────────────────────────────────────────────────────────
// Seed Customer data (20+ customers)
// ────────────────────────────────────────────────────────────────────────────
const seedCustomerData = async (db) => {
  const Customer = getCustomerModel(db);
  const count = await Customer.countDocuments();
  if (count > 0) return;

  const customers = [
    { customerId: 'CUS001', name: 'Amit Kumar', phone: '9876543210', email: 'amit.kumar@email.com', gender: 'Male', dob: new Date('1985-03-15'), address: '123 MG Road, Delhi', dueAmount: 0, totalPurchase: 0, isActive: true },
    { customerId: 'CUS002', name: 'Priya Sharma', phone: '9876543211', email: 'priya.sharma@email.com', gender: 'Female', dob: new Date('1990-07-22'), address: '456 Park Street, Mumbai', dueAmount: 0, totalPurchase: 0, isActive: true },
    { customerId: 'CUS003', name: 'Rahul Verma', phone: '9876543212', email: 'rahul.verma@email.com', gender: 'Male', dob: new Date('1988-11-30'), address: '789 Brigade Road, Bangalore', dueAmount: 0, totalPurchase: 0, isActive: true },
    { customerId: 'CUS004', name: 'Sneha Patel', phone: '9876543213', email: 'sneha.patel@email.com', gender: 'Female', dob: new Date('1992-05-18'), address: '321 CG Road, Ahmedabad', dueAmount: 0, totalPurchase: 0, isActive: true },
    { customerId: 'CUS005', name: 'Rajesh Singh', phone: '9876543214', email: 'rajesh.singh@email.com', gender: 'Male', dob: new Date('1980-09-10'), address: '654 Civil Lines, Jaipur', dueAmount: 0, totalPurchase: 0, isActive: true },
    { customerId: 'CUS006', name: 'Anjali Gupta', phone: '9876543215', email: 'anjali.gupta@email.com', gender: 'Female', dob: new Date('1995-01-25'), address: '987 Salt Lake, Kolkata', dueAmount: 0, totalPurchase: 0, isActive: true },
    { customerId: 'CUS007', name: 'Vikram Reddy', phone: '9876543216', email: 'vikram.reddy@email.com', gender: 'Male', dob: new Date('1987-12-05'), address: '147 Banjara Hills, Hyderabad', dueAmount: 0, totalPurchase: 0, isActive: true },
    { customerId: 'CUS008', name: 'Pooja Mehta', phone: '9876543217', email: 'pooja.mehta@email.com', gender: 'Female', dob: new Date('1993-08-14'), address: '258 Koramangala, Bangalore', dueAmount: 0, totalPurchase: 0, isActive: true },
    { customerId: 'CUS009', name: 'Suresh Rao', phone: '9876543218', email: 'suresh.rao@email.com', gender: 'Male', dob: new Date('1982-04-20'), address: '369 Anna Nagar, Chennai', dueAmount: 0, totalPurchase: 0, isActive: true },
    { customerId: 'CUS010', name: 'Kavita Joshi', phone: '9876543219', email: 'kavita.joshi@email.com', gender: 'Female', dob: new Date('1991-06-08'), address: '741 Shivaji Nagar, Pune', dueAmount: 0, totalPurchase: 0, isActive: true },
    { customerId: 'CUS011', name: 'Manoj Tiwari', phone: '9876543220', email: 'manoj.tiwari@email.com', gender: 'Male', dob: new Date('1986-10-12'), address: '852 Gomti Nagar, Lucknow', dueAmount: 0, totalPurchase: 0, isActive: true },
    { customerId: 'CUS012', name: 'Deepa Nair', phone: '9876543221', email: 'deepa.nair@email.com', gender: 'Female', dob: new Date('1994-02-28'), address: '963 MG Road, Kochi', dueAmount: 0, totalPurchase: 0, isActive: true },
    { customerId: 'CUS013', name: 'Arun Kapoor', phone: '9876543222', email: 'arun.kapoor@email.com', gender: 'Male', dob: new Date('1989-07-16'), address: '159 Mall Road, Shimla', dueAmount: 0, totalPurchase: 0, isActive: true },
    { customerId: 'CUS014', name: 'Meera Iyer', phone: '9876543223', email: 'meera.iyer@email.com', gender: 'Female', dob: new Date('1996-11-03'), address: '357 Jayanagar, Bangalore', dueAmount: 0, totalPurchase: 0, isActive: true },
    { customerId: 'CUS015', name: 'Sanjay Desai', phone: '9876543224', email: 'sanjay.desai@email.com', gender: 'Male', dob: new Date('1984-03-27'), address: '486 FC Road, Pune', dueAmount: 0, totalPurchase: 0, isActive: true },
    { customerId: 'CUS016', name: 'Ritu Bansal', phone: '9876543225', email: 'ritu.bansal@email.com', gender: 'Female', dob: new Date('1992-09-19'), address: '579 Connaught Place, Delhi', dueAmount: 0, totalPurchase: 0, isActive: true },
    { customerId: 'CUS017', name: 'Naveen Kumar', phone: '9876543226', email: 'naveen.kumar@email.com', gender: 'Male', dob: new Date('1990-05-11'), address: '680 Indiranagar, Bangalore', dueAmount: 0, totalPurchase: 0, isActive: true },
    { customerId: 'CUS018', name: 'Divya Rao', phone: '9876543227', email: 'divya.rao@email.com', gender: 'Female', dob: new Date('1988-12-24'), address: '791 Jubilee Hills, Hyderabad', dueAmount: 0, totalPurchase: 0, isActive: true },
    { customerId: 'CUS019', name: 'Kiran Sethi', phone: '9876543228', email: 'kiran.sethi@email.com', gender: 'Male', dob: new Date('1987-08-06'), address: '892 Safdarjung, Delhi', dueAmount: 0, totalPurchase: 0, isActive: true },
    { customerId: 'CUS020', name: 'Nisha Agarwal', phone: '9876543229', email: 'nisha.agarwal@email.com', gender: 'Female', dob: new Date('1995-04-15'), address: '903 Hazratganj, Lucknow', dueAmount: 0, totalPurchase: 0, isActive: true },
    { customerId: 'CUS021', name: 'Rohit Malhotra', phone: '9876543230', email: 'rohit.malhotra@email.com', gender: 'Male', dob: new Date('1991-10-29'), address: '124 Model Town, Chandigarh', dueAmount: 0, totalPurchase: 0, isActive: true },
    { customerId: 'CUS022', name: 'Swati Bhatt', phone: '9876543231', email: 'swati.bhatt@email.com', gender: 'Female', dob: new Date('1993-06-17'), address: '235 Aundh, Pune', dueAmount: 0, totalPurchase: 0, isActive: true },
  ];

  await Customer.insertMany(customers);
};

// ────────────────────────────────────────────────────────────────────────────
// Seed SaleInvoice data (30+ invoices for Sales reports)
// ────────────────────────────────────────────────────────────────────────────
const seedSaleInvoiceData = async (db) => {
  const SaleInvoice = getSaleInvoiceModel(db);
  const count = await SaleInvoice.countDocuments();
  if (count > 0) return;

  const customers = ['Amit Kumar', 'Priya Sharma', 'Rahul Verma', 'Sneha Patel', 'Rajesh Singh', 'Anjali Gupta', 'Walk-In Customer', 'Vikram Reddy', 'Pooja Mehta', 'Suresh Rao'];
  const paymentModes = ['Cash', 'UPI', 'Card', 'Credit'];
  const year = new Date().getFullYear();

  const invoices = [];
  for (let i = 0; i < 35; i++) {
    const dayOffset = Math.floor(i / 5); // 5 invoices per day for last 7 days
    const invoiceDate = new Date(Date.now() - dayOffset * 86400000);
    invoiceDate.setHours(9 + (i % 12), (i * 13) % 60, 0, 0);

    const itemCount = 2 + (i % 4); // 2-5 items per invoice
    const items = [];
    let subtotal = 0;

    const medicines = [
      { name: 'Dolo 650 Tablet', qty: 2, mrp: 32.50, gst: 12 },
      { name: 'Crocin 650 Tablet', qty: 1, mrp: 28.00, gst: 12 },
      { name: 'Azithral 500 Tablet', qty: 1, mrp: 85.00, gst: 12 },
      { name: 'Pantop DSR Capsule', qty: 1, mrp: 92.00, gst: 12 },
      { name: 'Augmentin 625', qty: 1, mrp: 225.00, gst: 12 },
      { name: 'Metformin 500mg', qty: 3, mrp: 22.00, gst: 12 },
      { name: 'Atorvastatin 10mg', qty: 2, mrp: 45.00, gst: 12 },
      { name: 'Omeprazole 20mg', qty: 1, mrp: 35.00, gst: 12 },
      { name: 'Cetirizine 10mg', qty: 2, mrp: 18.00, gst: 12 },
      { name: 'Vitamin D3 60000 IU', qty: 1, mrp: 72.00, gst: 5 },
      { name: 'Zincovit Tablet', qty: 1, mrp: 145.00, gst: 18 },
      { name: 'Calpol 650 Tablet', qty: 2, mrp: 30.00, gst: 12 },
      { name: 'Ibuprofen 400mg', qty: 2, mrp: 25.00, gst: 12 },
      { name: 'Amoxicillin 500mg', qty: 2, mrp: 65.00, gst: 12 },
      { name: 'Pan-D Tablet', qty: 1, mrp: 85.00, gst: 12 },
    ];

    for (let j = 0; j < itemCount; j++) {
      const med = medicines[(i * 3 + j) % medicines.length];
      const itemAmt = med.qty * med.mrp;
      subtotal += itemAmt;
      items.push({
        medicineName: med.name,
        qty: med.qty,
        mrp: med.mrp,
        gstPct: med.gst,
        amount: itemAmt,
      });
    }

    const discountPct = i % 5 === 0 ? 10 : i % 7 === 0 ? 5 : 0;
    const discountAmt = (subtotal * discountPct) / 100;
    const afterDiscount = subtotal - discountAmt;
    const gstAmt = afterDiscount * 0.12; // Average 12% GST
    const totalAmt = afterDiscount + gstAmt;

    const paymentMode = paymentModes[i % paymentModes.length];
    const isPaid = paymentMode !== 'Credit';

    invoices.push({
      invoiceNo: `INV-${year}-${String(1500 + i).padStart(4, '0')}`,
      invoiceDate,
      customerName: customers[i % customers.length],
      items,
      subtotal,
      discountAmt,
      gstAmt,
      totalAmt,
      paymentMode,
      paidAmt: isPaid ? totalAmt : totalAmt * 0.5,
      dueAmt: isPaid ? 0 : totalAmt * 0.5,
      status: 'Completed',
      isReturn: false,
      cashierName: 'Admin',
    });
  }

  // Add 3 return invoices
  for (let i = 0; i < 3; i++) {
    const returnDate = new Date(Date.now() - (i + 1) * 86400000);
    returnDate.setHours(14 + i, 30, 0, 0);
    
    invoices.push({
      invoiceNo: `INV-${year}-R${String(101 + i).padStart(3, '0')}`,
      invoiceDate: returnDate,
      customerName: customers[i],
      items: [
        { medicineName: 'Dolo 650 Tablet', qty: -1, mrp: 32.50, gstPct: 12, amount: -32.50 },
        { medicineName: 'Pantop DSR Capsule', qty: -1, mrp: 92.00, gstPct: 12, amount: -92.00 },
      ],
      subtotal: -124.50,
      discountAmt: 0,
      gstAmt: -14.94,
      totalAmt: -139.44,
      paymentMode: 'Cash',
      paidAmt: -139.44,
      dueAmt: 0,
      status: 'Completed',
      isReturn: true,
      cashierName: 'Admin',
    });
  }

  await SaleInvoice.insertMany(invoices);
};

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/pos/medicines/search?q=&category=&company=&page=
// Search medicines for POS billing (name/salt/barcode)
// ────────────────────────────────────────────────────────────────────────────
export const searchMedicines = asyncHandler(async (req, res) => {
  await seedMedicineData(req.db);
  const { q = '', category = '', company = '', page = 1, limit = 20 } = req.query;
  const Medicine = getMedicineModel(req.db);
  const MedicineBatch = getMedicineBatchModel(req.db);

  const filter = { isActive: true };
  if (q) filter.$or = [
    { name: new RegExp(q, 'i') },
    { salt: new RegExp(q, 'i') },
    { genericName: new RegExp(q, 'i') },
    { barcode: new RegExp(q, 'i') },
  ];
  if (category) filter.category = new RegExp(category, 'i');
  if (company)  filter.company  = new RegExp(company, 'i');

  const skip = (Number(page) - 1) * Number(limit);
  const [medicines, total] = await Promise.all([
    Medicine.find(filter).skip(skip).limit(Number(limit)).lean(),
    Medicine.countDocuments(filter),
  ]);

  // Attach first active batch info for each medicine
  const result = await Promise.all(medicines.map(async (m) => {
    const batch = await MedicineBatch.findOne({ medicineId: m._id, qty: { $gt: 0 }, isActive: true })
      .sort({ expiryDate: 1 }).lean();
    return {
      id:      m._id,
      name:    m.name,
      salt:    m.salt,
      company: m.company,
      formulation: m.formulation,
      category: m.category,
      packSize: m.packSize,
      mrp:     batch?.mrp   ?? m.mrp,
      stock:   m.currentStock,
      batch:   batch?.batchNo ?? '—',
      exp:     batch?.expiryDate ? new Date(batch.expiryDate).toLocaleDateString('en-IN', { month: '2-digit', year: 'numeric' }) : '—',
      gst:     m.gstPercent,
      barcode: m.barcode,
      rackLabel: m.rackLabel,
    };
  }));

  return res.status(200).json(new apiResponse(200, {
    medicines: result, total,
    totalPages: Math.ceil(total / Number(limit)),
    currentPage: Number(page),
  }, 'Medicines fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/pos/medicines/barcode/:barcode
// Get medicine by barcode/batch number
// ────────────────────────────────────────────────────────────────────────────
export const getMedicineByBarcode = asyncHandler(async (req, res) => {
  await seedMedicineData(req.db);
  const { barcode } = req.params;
  const Medicine = getMedicineModel(req.db);
  const MedicineBatch = getMedicineBatchModel(req.db);

  const medicine = await Medicine.findOne({ barcode, isActive: true }).lean();
  if (!medicine) {
    // Try batch number search
    const batch = await MedicineBatch.findOne({ batchNo: barcode }).populate('medicineId').lean();
    if (!batch || !batch.medicineId) {
      return res.status(404).json(new apiResponse(404, null, 'Medicine not found for this barcode'));
    }
    return res.status(200).json(new apiResponse(200, {
      id:      batch.medicineId._id,
      name:    batch.medicineId.name,
      salt:    batch.medicineId.salt,
      mrp:     batch.mrp,
      stock:   batch.medicineId.currentStock,
      batch:   batch.batchNo,
      exp:     new Date(batch.expiryDate).toLocaleDateString('en-IN', { month: '2-digit', year: 'numeric' }),
      gst:     batch.medicineId.gstPercent,
    }, 'Medicine found'));
  }

  const batch = await MedicineBatch.findOne({ medicineId: medicine._id, qty: { $gt: 0 }, isActive: true })
    .sort({ expiryDate: 1 }).lean();

  return res.status(200).json(new apiResponse(200, {
    id:      medicine._id,
    name:    medicine.name,
    salt:    medicine.salt,
    company: medicine.company,
    packSize: medicine.packSize,
    mrp:     batch?.mrp ?? medicine.mrp,
    stock:   medicine.currentStock,
    batch:   batch?.batchNo ?? '—',
    exp:     batch?.expiryDate ? new Date(batch.expiryDate).toLocaleDateString('en-IN', { month: '2-digit', year: 'numeric' }) : '—',
    gst:     medicine.gstPercent,
    rackLabel: medicine.rackLabel,
  }, 'Medicine found'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/pos/customers/search?q=&page=
// Search customers for POS
// ────────────────────────────────────────────────────────────────────────────
export const searchCustomers = asyncHandler(async (req, res) => {
  await seedCustomerData(req.db);
  const { q = '', page = 1, limit = 20 } = req.query;
  const Customer = getCustomerModel(req.db);

  const filter = { isActive: true };
  if (q) filter.$or = [
    { name: new RegExp(q, 'i') },
    { phone: new RegExp(q, 'i') },
    { customerId: new RegExp(q, 'i') },
  ];

  const skip = (Number(page) - 1) * Number(limit);
  const [customers, total] = await Promise.all([
    Customer.find(filter).sort({ totalPurchase: -1 }).skip(skip).limit(Number(limit)).lean(),
    Customer.countDocuments(filter),
  ]);

  const result = customers.map(c => ({
    id:            c._id,
    customerId:    c.customerId,
    name:          c.name,
    phone:         c.phone,
    email:         c.email,
    orders:        0,
    totalPurchase: `₹${(c.totalPurchase || 0).toLocaleString('en-IN')}`,
    due:           c.dueAmount > 0 ? `₹${c.dueAmount.toLocaleString('en-IN')}` : '₹0',
    credit:        c.walletBalance || 0,
    tier:          c.tier,
  }));

  return res.status(200).json(new apiResponse(200, {
    customers: result, total,
    totalPages: Math.ceil(total / Number(limit)),
    currentPage: Number(page),
  }, 'Customers fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/franchise/pos/customers
// Add new customer from POS
// ────────────────────────────────────────────────────────────────────────────
export const addCustomer = asyncHandler(async (req, res) => {
  const { name, phone, email, address, dob, gender } = req.body;
  if (!name || !phone) return res.status(400).json(new apiResponse(400, null, 'Name and phone are required'));

  const Customer = getCustomerModel(req.db);

  // Auto-generate customer ID
  const count = await Customer.countDocuments();
  const customerId = `CUS${String(count + 1).padStart(3, '0')}`;

  const customer = await Customer.create({ name, phone, email, address, dob, gender, customerId });

  return res.status(201).json(new apiResponse(201, {
    id:         customer._id,
    customerId: customer.customerId,
    name:       customer.name,
    phone:      customer.phone,
  }, 'Customer added successfully'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/pos/hold-bills
// List all active hold bills for today
// ────────────────────────────────────────────────────────────────────────────
export const getHoldBills = asyncHandler(async (req, res) => {
  const HoldBill = getHoldBillModel(req.db);

  // Seed dummy hold bills if empty
  const count = await HoldBill.countDocuments({ isActive: true });
  if (count === 0) {
    await HoldBill.insertMany([
      { holdId: 'HB001', customerName: 'Rahul Sharma', items: [{ medicineName: 'Crocin 650 Tablet', qty: 2, mrp: 16, amount: 32 }, { medicineName: 'Pantoprazole 40mg', qty: 1, mrp: 35, amount: 35 }, { medicineName: 'Vitamin D3 60000 IU', qty: 1, mrp: 72, amount: 72 }], subtotal: 139, totalAmt: 139, note: 'Fever Medicine Bill',    isActive: true },
      { holdId: 'HB002', customerName: 'Priya Verma',  items: [{ medicineName: 'Azithral 500 Tablet', qty: 1, mrp: 85, amount: 85 }, { medicineName: 'Calpol 650 Tablet', qty: 2, mrp: 30, amount: 60 }, { medicineName: 'Omeprazole 20mg', qty: 1, mrp: 35, amount: 35 }, { medicineName: 'Augmentin 625', qty: 1, mrp: 225, amount: 225 }, { medicineName: 'Zincovit Tablet', qty: 2, mrp: 145, amount: 290 }], subtotal: 695, totalAmt: 695, note: "Nid's Medicine Bill",   isActive: true },
      { holdId: 'HB003', customerName: 'Walk-In',      items: [{ medicineName: 'Dolo 650 Tablet', qty: 2, mrp: 32.5, amount: 65 }, { medicineName: 'Pan-D Tablet', qty: 1, mrp: 92, amount: 92 }], subtotal: 157, totalAmt: 157, note: 'Pain Relief Bill',      isActive: true },
      { holdId: 'HB004', customerName: 'Amit Kumar',   items: [{ medicineName: 'Metformin 500mg', qty: 3, mrp: 22, amount: 66 }, { medicineName: 'Atorvastatin 10mg', qty: 2, mrp: 45, amount: 90 }, { medicineName: 'Omeprazole 20mg', qty: 1, mrp: 35, amount: 35 }, { medicineName: 'Vitamin D3 60000 IU', qty: 1, mrp: 72, amount: 72 }, { medicineName: 'Amoxicillin 500mg', qty: 2, mrp: 65, amount: 130 }, { medicineName: 'Pantoprazole 40mg', qty: 1, mrp: 55, amount: 55 }], subtotal: 448, totalAmt: 448, note: 'Diabetes Medicine Bill', isActive: true },
    ]);
  }

  const bills = await HoldBill.find({ isActive: true }).sort({ createdAt: -1 }).lean();

  const result = bills.map(b => ({
    id:           b._id,
    holdId:       b.holdId || b._id.toString().slice(-6).toUpperCase(),
    name:         b.customerName,
    items:        b.items?.length || 0,
    amount:       b.totalAmt,
    time:         new Date(b.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
    note:         b.note,
  }));

  return res.status(200).json(new apiResponse(200, result, 'Hold bills fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/franchise/pos/hold-bills
// Save a new hold bill
// ────────────────────────────────────────────────────────────────────────────
export const createHoldBill = asyncHandler(async (req, res) => {
  const { customerName, customerId, items, subtotal, discountAmt, totalAmt, note } = req.body;
  const HoldBill = getHoldBillModel(req.db);

  const count = await HoldBill.countDocuments();
  const holdId = `HB${String(count + 1).padStart(3, '0')}`;

  const bill = await HoldBill.create({
    holdId, customerName: customerName || 'Walk-In Customer',
    customerId, items, subtotal, discountAmt, totalAmt, note, isActive: true,
  });

  return res.status(201).json(new apiResponse(201, {
    id:     bill._id,
    holdId: bill.holdId,
  }, 'Bill held successfully'));
});

// ────────────────────────────────────────────────────────────────────────────
// DELETE /api/franchise/pos/hold-bills/:id
// Delete/dismiss a held bill
// ────────────────────────────────────────────────────────────────────────────
export const deleteHoldBill = asyncHandler(async (req, res) => {
  const HoldBill = getHoldBillModel(req.db);
  await HoldBill.findByIdAndUpdate(req.params.id, { isActive: false });
  return res.status(200).json(new apiResponse(200, null, 'Hold bill deleted'));
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/franchise/pos/sales/invoice
// Create a new sale invoice (main POS checkout)
// ────────────────────────────────────────────────────────────────────────────
export const createSaleInvoice = asyncHandler(async (req, res) => {
  const {
    customerId, customerName, customerPhone,
    items, subtotal, discountAmt, gstAmt, roundOff, totalAmt,
    paymentMode, paidAmt, dueAmt, notes,
  } = req.body;

  if (!items?.length) return res.status(400).json(new apiResponse(400, null, 'Cart is empty'));

  const SaleInvoice = getSaleInvoiceModel(req.db);
  const Medicine    = getMedicineModel(req.db);
  const MedicineBatch = getMedicineBatchModel(req.db);
  const Customer    = getCustomerModel(req.db);

  // Generate invoice number
  const today     = new Date();
  const year      = today.getFullYear();
  const count     = await SaleInvoice.countDocuments();
  const invoiceNo = `INV-${year}-${String(count + 1).padStart(4, '0')}`;

  const invoice = await SaleInvoice.create({
    invoiceNo, invoiceDate: today,
    customerId, customerName: customerName || 'Walk-in Customer', customerPhone,
    items, subtotal, discountAmt, gstAmt, roundOff,
    totalAmt, paymentMode, paidAmt, dueAmt,
    cashierName: 'Admin', status: 'Completed', notes,
  });

  // Deduct stock from medicine and batch
  for (const item of items) {
    if (item.medicineId) {
      await Medicine.findByIdAndUpdate(item.medicineId, { $inc: { currentStock: -item.qty } });
      // Deduct from oldest batch first
      const batch = await MedicineBatch.findOne({ medicineId: item.medicineId, qty: { $gte: item.qty }, isActive: true })
        .sort({ expiryDate: 1 }).lean();
      if (batch) {
        await MedicineBatch.findByIdAndUpdate(batch._id, { $inc: { qty: -item.qty } });
      }
    }
  }

  // Update customer totals
  if (customerId) {
    await Customer.findByIdAndUpdate(customerId, {
      $inc: { totalPurchase: totalAmt, dueAmount: dueAmt || 0 },
    });
  }

  return res.status(201).json(new apiResponse(201, {
    invoiceId: invoice._id,
    invoiceNo: invoice.invoiceNo,
  }, 'Invoice created successfully'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/pos/sales/invoice/:id
// Get invoice by ID (for reprint / return)
// ────────────────────────────────────────────────────────────────────────────
export const getSaleInvoice = asyncHandler(async (req, res) => {
  const SaleInvoice = getSaleInvoiceModel(req.db);
  const invoice = await SaleInvoice.findById(req.params.id).lean();
  if (!invoice) return res.status(404).json(new apiResponse(404, null, 'Invoice not found'));
  return res.status(200).json(new apiResponse(200, invoice, 'Invoice fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/pos/sales/invoice-by-no/:invoiceNo
// Get invoice by invoice number (used by ReturnBill + ExchangeBill)
// ────────────────────────────────────────────────────────────────────────────
export const getSaleInvoiceByNo = asyncHandler(async (req, res) => {
  const SaleInvoice = getSaleInvoiceModel(req.db);
  const invoice = await SaleInvoice.findOne({
    invoiceNo: req.params.invoiceNo,
    isReturn:  false,
    status:    { $nin: ['Returned', 'Cancelled'] },
  }).lean();
  if (!invoice) return res.status(404).json(new apiResponse(404, null, 'Invoice not found'));
  return res.status(200).json(new apiResponse(200, invoice, 'Invoice fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/franchise/pos/sales/returns
// Process a return bill
// ────────────────────────────────────────────────────────────────────────────
export const createReturnBill = asyncHandler(async (req, res) => {
  const { originalInvoiceNo, items, totalReturnAmt, reason } = req.body;
  if (!items?.length) return res.status(400).json(new apiResponse(400, null, 'Return items are required'));

  const SaleInvoice = getSaleInvoiceModel(req.db);
  const Medicine    = getMedicineModel(req.db);

  const year  = new Date().getFullYear();
  const count = await SaleInvoice.countDocuments({ isReturn: true });
  const invoiceNo = `RTN-${year}-${String(count + 1).padStart(4, '0')}`;

  const returnInvoice = await SaleInvoice.create({
    invoiceNo, invoiceDate: new Date(),
    customerName: 'Return',
    items: items.map(i => ({ ...i, qty: -(i.retQty || i.qty), amount: -(i.retAmt || i.amount) })),
    totalAmt: -totalReturnAmt,
    paymentMode: 'Cash',
    isReturn: true, status: 'Returned',
    notes: `Return for ${originalInvoiceNo || '—'} — ${reason || ''}`,
  });

  // Re-add stock
  for (const item of items) {
    if (item.medicineId && item.retQty > 0) {
      await Medicine.findByIdAndUpdate(item.medicineId, { $inc: { currentStock: item.retQty } });
    }
  }

  return res.status(201).json(new apiResponse(201, {
    returnId:   returnInvoice._id,
    returnNo:   returnInvoice.invoiceNo,
    returnAmt:  totalReturnAmt,
  }, 'Return processed successfully'));
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/franchise/pos/sales/exchange
// Exchange bill — return old + create new sale
// ────────────────────────────────────────────────────────────────────────────
export const createExchangeBill = asyncHandler(async (req, res) => {
  const { returnItems, newItems, totalReturnAmt, totalNewAmt, paymentMode, originalInvoiceNo } = req.body;

  const SaleInvoice = getSaleInvoiceModel(req.db);
  const Medicine    = getMedicineModel(req.db);

  // Create return
  const year     = new Date().getFullYear();
  const retCount = await SaleInvoice.countDocuments({ isReturn: true });
  const returnNo = `EXC-RTN-${year}-${String(retCount + 1).padStart(4, '0')}`;

  await SaleInvoice.create({
    invoiceNo: returnNo, invoiceDate: new Date(),
    customerName: 'Exchange Return',
    items: returnItems.map(i => ({ ...i, qty: -(i.qty), amount: -(i.amount) })),
    totalAmt: -totalReturnAmt, isReturn: true, status: 'Returned',
    notes: `Exchange return for ${originalInvoiceNo || '—'}`,
  });

  // Re-add return stock
  for (const item of returnItems) {
    if (item.medicineId) {
      await Medicine.findByIdAndUpdate(item.medicineId, { $inc: { currentStock: item.qty } });
    }
  }

  // Create new sale
  const saleCount = await SaleInvoice.countDocuments();
  const saleNo    = `INV-${year}-${String(saleCount + 1).padStart(4, '0')}`;

  const newSale = await SaleInvoice.create({
    invoiceNo: saleNo, invoiceDate: new Date(),
    customerName: 'Walk-in Customer',
    items: newItems,
    totalAmt: totalNewAmt, paymentMode, status: 'Completed',
    notes: `Exchange for ${originalInvoiceNo || '—'}`,
  });

  // Deduct new sale stock
  for (const item of newItems) {
    if (item.medicineId) {
      await Medicine.findByIdAndUpdate(item.medicineId, { $inc: { currentStock: -item.qty } });
    }
  }

  const netPayable = totalNewAmt - totalReturnAmt;

  return res.status(201).json(new apiResponse(201, {
    newInvoiceId:  newSale._id,
    newInvoiceNo:  newSale.invoiceNo,
    netPayable,
  }, 'Exchange processed successfully'));
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/franchise/pos/sales/credit-sale
// Credit sale — create invoice with due amount
// ────────────────────────────────────────────────────────────────────────────
export const createCreditSale = asyncHandler(async (req, res) => {
  const { customerId, customerName, items, totalAmt, creditAmt, notes } = req.body;
  if (!customerId) return res.status(400).json(new apiResponse(400, null, 'Customer is required for credit sale'));

  const SaleInvoice = getSaleInvoiceModel(req.db);
  const Customer    = getCustomerModel(req.db);
  const Medicine    = getMedicineModel(req.db);

  const year  = new Date().getFullYear();
  const count = await SaleInvoice.countDocuments();
  const invoiceNo = `INV-${year}-${String(count + 1).padStart(4, '0')}`;

  const invoice = await SaleInvoice.create({
    invoiceNo, invoiceDate: new Date(),
    customerId, customerName,
    items,
    totalAmt, paymentMode: 'Credit',
    paidAmt: totalAmt - creditAmt,
    dueAmt: creditAmt,
    status: 'Completed', notes,
  });

  // Update customer due
  await Customer.findByIdAndUpdate(customerId, { $inc: { dueAmount: creditAmt, totalPurchase: totalAmt } });

  // Deduct stock
  for (const item of items) {
    if (item.medicineId) {
      await Medicine.findByIdAndUpdate(item.medicineId, { $inc: { currentStock: -item.qty } });
    }
  }

  return res.status(201).json(new apiResponse(201, {
    invoiceId: invoice._id,
    invoiceNo: invoice.invoiceNo,
    dueAmt:    creditAmt,
  }, 'Credit sale created'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/pos/day-closing/summary
// Today's day closing summary for cashier
// ────────────────────────────────────────────────────────────────────────────
export const getDayClosingSummary = asyncHandler(async (req, res) => {
  const SaleInvoice = getSaleInvoiceModel(req.db);

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);

  const [salesAgg, returnAgg] = await Promise.all([
    SaleInvoice.aggregate([
      { $match: { invoiceDate: { $gte: todayStart, $lte: todayEnd }, status: 'Completed', isReturn: false } },
      { $group: {
        _id: null,
        total: { $sum: '$totalAmt' },
        count: { $sum: 1 },
        cash:  { $sum: { $cond: [{ $eq: ['$paymentMode', 'Cash'] }, '$totalAmt', 0] } },
        upi:   { $sum: { $cond: [{ $eq: ['$paymentMode', 'UPI'] },  '$totalAmt', 0] } },
        card:  { $sum: { $cond: [{ $eq: ['$paymentMode', 'Card'] }, '$totalAmt', 0] } },
        credit:{ $sum: { $cond: [{ $eq: ['$paymentMode', 'Credit'] },'$totalAmt', 0] } },
      }},
    ]),
    SaleInvoice.aggregate([
      { $match: { invoiceDate: { $gte: todayStart, $lte: todayEnd }, isReturn: true } },
      { $group: { _id: null, total: { $sum: { $abs: '$totalAmt' } }, count: { $sum: 1 } } },
    ]),
  ]);

  const sales   = salesAgg[0]  || { total: 0, count: 0, cash: 0, upi: 0, card: 0, credit: 0 };
  const returns = returnAgg[0] || { total: 0, count: 0 };

  const openingCash = 5000; // Could come from previous day closing
  const expenses    = 0;
  const netSales    = sales.total - returns.total;
  const expectedCash = openingCash + sales.cash - expenses;

  const today = new Date();
  return res.status(200).json(new apiResponse(200, {
    date:           today.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    openingCash,
    transactions:   sales.count,
    totalSales:     sales.total,
    salesReturns:   returns.total,
    netSales,
    payments: {
      cash:   sales.cash,
      upi:    sales.upi,
      card:   sales.card,
      credit: sales.credit,
    },
    expenses,
    closingCash: expectedCash,
    previousClose: today.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ', 9:05 PM',
  }, 'Day closing summary fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/franchise/pos/day-closing
// Submit day closing
// ────────────────────────────────────────────────────────────────────────────
export const submitDayClosing = asyncHandler(async (req, res) => {
  const { physicalCash, closingNote } = req.body;
  const DayClosing  = getDayClosingModel(req.db);
  const SaleInvoice = getSaleInvoiceModel(req.db);

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const dateStr    = todayStart.toISOString().split('T')[0];

  // Check if already closed
  const existing = await DayClosing.findOne({ date: dateStr });
  if (existing) return res.status(400).json(new apiResponse(400, null, 'Day already closed'));

  const [salesAgg, returnAgg] = await Promise.all([
    SaleInvoice.aggregate([
      { $match: { invoiceDate: { $gte: todayStart, $lte: todayEnd }, status: 'Completed', isReturn: false } },
      { $group: { _id: null, total: { $sum: '$totalAmt' }, count: { $sum: 1 },
        cash:  { $sum: { $cond: [{ $eq: ['$paymentMode', 'Cash'] }, '$totalAmt', 0] } },
        upi:   { $sum: { $cond: [{ $eq: ['$paymentMode', 'UPI'] },  '$totalAmt', 0] } },
        card:  { $sum: { $cond: [{ $eq: ['$paymentMode', 'Card'] }, '$totalAmt', 0] } },
      }},
    ]),
    SaleInvoice.aggregate([
      { $match: { invoiceDate: { $gte: todayStart, $lte: todayEnd }, isReturn: true } },
      { $group: { _id: null, total: { $sum: { $abs: '$totalAmt' } } } },
    ]),
  ]);

  const sales   = salesAgg[0]  || { total: 0, count: 0, cash: 0, upi: 0, card: 0 };
  const returns = returnAgg[0] || { total: 0 };
  const openingCash   = 5000;
  const expenses      = 0;
  const expectedCash  = openingCash + sales.cash - expenses;
  const cashDiff      = (parseFloat(physicalCash) || 0) - expectedCash;

  const closing = await DayClosing.create({
    date: dateStr,
    openingCash,
    totalSales:   sales.total,
    salesReturns: returns.total,
    netSales:     sales.total - returns.total,
    transactions: sales.count,
    payments:     { cash: sales.cash, upi: sales.upi, card: sales.card },
    expenses,
    expectedCash,
    physicalCash: parseFloat(physicalCash) || 0,
    cashDifference: cashDiff,
    closingNote,
    closedAt: new Date(),
    closedByName: 'Admin',
    status: 'Closed',
  });

  return res.status(201).json(new apiResponse(201, {
    closingId:     closing._id,
    date:          dateStr,
    netSales:      closing.netSales,
    transactions:  closing.transactions,
    cashDifference: cashDiff,
  }, 'Day closed successfully'));
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/pos/invoices?page=&limit=&from=&to=&status=
// List all sale invoices with pagination (for Billing history page)
// ─────────────────────────────────────────────────────────────────────────────
export const getPosInvoices = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, from, to, status, search = '' } = req.query;
  const SaleInvoice = getSaleInvoiceModel(req.db);

  const filter = {};
  if (status && status !== 'All') filter.status = status;
  if (search) filter.$or = [
    { invoiceNo:    new RegExp(search, 'i') },
    { customerName: new RegExp(search, 'i') },
  ];
  if (from || to) {
    filter.invoiceDate = {};
    if (from) { const d = new Date(from); d.setHours(0,0,0,0);  filter.invoiceDate.$gte = d; }
    if (to)   { const d = new Date(to);   d.setHours(23,59,59,999); filter.invoiceDate.$lte = d; }
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [invoices, total] = await Promise.all([
    SaleInvoice.find(filter).sort({ invoiceDate: -1 }).skip(skip).limit(Number(limit)).lean(),
    SaleInvoice.countDocuments(filter),
  ]);

  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todaySales = await SaleInvoice.aggregate([
    { $match: { invoiceDate: { $gte: todayStart }, status: { $ne: 'Cancelled' } } },
    { $group: { _id: null, total: { $sum: '$totalAmt' }, count: { $sum: 1 } } },
  ]);

  return res.status(200).json(new apiResponse(200, {
    invoices: invoices.map(inv => ({
      _id:          inv._id,
      invoiceNo:    inv.invoiceNo,
      customerName: inv.customerName || 'Walk-in Customer',
      customerPhone:inv.customerPhone || '',
      invoiceDate:  inv.invoiceDate,
      totalAmt:     inv.totalAmt,
      discount:     inv.discount || 0,
      netAmt:       inv.netAmt   || inv.totalAmt,
      paymentMode:  inv.paymentMode || 'Cash',
      status:       inv.status || 'Completed',
      items:        inv.items?.length || 0,
    })),
    total,
    totalPages:  Math.ceil(total / Number(limit)),
    currentPage: Number(page),
    todaySales:  todaySales[0]?.total || 0,
    todayCount:  todaySales[0]?.count || 0,
  }, 'Invoices fetched'));
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/pos/orders?page=&limit=&status=
// List all orders (alias for invoices — used by Orders.jsx)
// ─────────────────────────────────────────────────────────────────────────────
export const getPosOrders = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, search = '' } = req.query;
  const SaleInvoice = getSaleInvoiceModel(req.db);

  const filter = {};
  if (status && status !== 'All') filter.status = status;
  if (search) filter.$or = [
    { invoiceNo:    new RegExp(search, 'i') },
    { customerName: new RegExp(search, 'i') },
  ];

  const skip = (Number(page) - 1) * Number(limit);
  const [orders, total] = await Promise.all([
    SaleInvoice.find(filter).sort({ invoiceDate: -1 }).skip(skip).limit(Number(limit)).lean(),
    SaleInvoice.countDocuments(filter),
  ]);

  return res.status(200).json(new apiResponse(200, {
    orders: orders.map(o => ({
      _id:          o._id,
      orderId:      o.invoiceNo,
      customerName: o.customerName || 'Walk-in Customer',
      date:         o.invoiceDate,
      amount:       o.netAmt || o.totalAmt,
      paymentMode:  o.paymentMode || 'Cash',
      status:       o.status || 'Completed',
      items:        o.items?.length || 0,
    })),
    total,
    totalPages: Math.ceil(total / Number(limit)),
  }, 'Orders fetched'));
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/pos/sales/invoice-by-no/:invoiceNo
// Look up invoice by invoice number string (for Return/Exchange)
// ─────────────────────────────────────────────────────────────────────────────
export const getSaleInvoiceByNumber = asyncHandler(async (req, res) => {
  const { invoiceNo } = req.params;
  const SaleInvoice = getSaleInvoiceModel(req.db);

  const invoice = await SaleInvoice.findOne({
    invoiceNo: { $regex: new RegExp(`^${invoiceNo}$`, 'i') },
  }).lean();

  if (!invoice) {
    return res.status(404).json(new apiResponse(404, null, `Invoice ${invoiceNo} not found`));
  }

  return res.status(200).json(new apiResponse(200, invoice, 'Invoice fetched'));
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/franchise/pos/sales/returns?page=&limit=&from=&to=
// List all return bills
// ─────────────────────────────────────────────────────────────────────────────
export const getSalesReturnsList = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, from, to, search = '' } = req.query;
  const SaleInvoice = getSaleInvoiceModel(req.db);

  const filter = { status: 'Returned' };
  if (search) filter.$or = [
    { invoiceNo:    new RegExp(search, 'i') },
    { customerName: new RegExp(search, 'i') },
  ];
  if (from || to) {
    filter.invoiceDate = {};
    if (from) { const d = new Date(from); d.setHours(0,0,0,0);  filter.invoiceDate.$gte = d; }
    if (to)   { const d = new Date(to);   d.setHours(23,59,59,999); filter.invoiceDate.$lte = d; }
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [returns, total] = await Promise.all([
    SaleInvoice.find(filter).sort({ invoiceDate: -1 }).skip(skip).limit(Number(limit)).lean(),
    SaleInvoice.countDocuments(filter),
  ]);

  return res.status(200).json(new apiResponse(200, {
    returns: returns.map(r => ({
      _id:         r._id,
      invoiceNo:   r.invoiceNo,
      returnDate:  r.updatedAt || r.invoiceDate,
      customerName:r.customerName || 'Walk-in',
      amount:      r.netAmt || r.totalAmt,
      items:       r.items?.length || 0,
      reason:      r.returnReason || '—',
    })),
    total,
    totalPages: Math.ceil(total / Number(limit)),
  }, 'Sales returns fetched'));
});

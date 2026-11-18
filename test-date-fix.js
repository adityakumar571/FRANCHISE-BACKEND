import { validateMedicineData } from './utils/medicineMatcher.js';

const testMedicines = [
  {
    name: 'Dolo 650',
    salt: 'Paracetamol',
    category: 'Tablet',
    medicalSystem: 'Allopathy',
    mrp: '45',
    quantity: '100',
    batchNo: 'B12345',
    expiryDate: '2027-12-31'
  },
  {
    name: 'Crocin 500',
    salt: 'Paracetamol',
    category: 'Tablet',
    medicalSystem: 'Allopathy',
    mrp: '35',
    quantity: '50',
    batchNo: 'B12346',
    expiryDate: '2027-11-30'
  },
  {
    name: 'Aspirin 75',
    salt: 'Acetylsalicylic Acid',
    category: 'Tablet',
    medicalSystem: 'Allopathy',
    mrp: '8',
    quantity: '200',
    batchNo: 'B12347',
    expiryDate: '2027-01-31'
  }
];

console.log('🧪 Testing date validation with fix:\n');

testMedicines.forEach((med, i) => {
  const result = validateMedicineData(med, i + 2);
  console.log(`${med.name} (${med.expiryDate}):`);
  if (result.valid) {
    console.log('  ✅ VALID');
  } else {
    console.log('  ❌ INVALID - Errors:');
    result.errors.forEach(err => console.log(`     - ${err}`));
  }
  console.log();
});

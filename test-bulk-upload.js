import { parseAndValidateExcel } from './utils/excelParser.js';
import { validateMedicineData } from './utils/medicineMatcher.js';

// Parse the test file
const result = parseAndValidateExcel('/Users/alishamsi/Harsh@/MD/test-medicines-bulk.xlsx');

if (!result.success) {
  console.error('❌ Parse failed:', result.error);
  process.exit(1);
}

console.log('✅ Parse successful');
console.log('📋 Medicines parsed:', result.count);
console.log('\n📊 Column mapping:');
Object.entries(result.columns).forEach(([field, col]) => {
  console.log(`  ${field}: "${col}"`);
});

console.log('\n🔍 Validating each row:');
result.medicines.forEach((med, i) => {
  console.log(`\nRow ${i + 2}:`);
  console.log('  Raw data:', med);
  
  const validation = validateMedicineData(med, i + 2);
  if (validation.valid) {
    console.log('  ✅ Valid');
  } else {
    console.log('  ❌ Invalid reasons:');
    validation.errors.forEach(err => console.log(`    - ${err}`));
  }
});

import { parseAndValidateExcel } from './utils/excelParser.js';

// Parse the test file
const result = parseAndValidateExcel('/Users/alishamsi/Harsh@/MD/test-medicines-bulk.xlsx');

if (!result.success) {
  console.error('❌ Parse failed:', result.error);
  process.exit(1);
}

console.log('📊 Parsed medicines:');
result.medicines.forEach((med, i) => {
  console.log(`\nRow ${i + 2}: ${med.name}`);
  console.log(`  expiryDate value: ${med.expiryDate}`);
  console.log(`  expiryDate type: ${typeof med.expiryDate}`);
  
  const parsed = new Date(med.expiryDate);
  console.log(`  Parsed as Date: ${parsed.toISOString()}`);
  console.log(`  Is past? ${parsed < new Date()}`);
  console.log(`  Today: ${new Date().toISOString().split('T')[0]}`);
});

import XLSX from 'xlsx';

const workbook = XLSX.readFile('/Users/alishamsi/Harsh@/MD/test-medicines-bulk.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet);

console.log('📋 Test file contents:');
data.forEach((row, i) => {
  console.log(`Row ${i + 2}: ${row['Medicine Name']} | Expiry: ${row['Expiry Date']}`);
});

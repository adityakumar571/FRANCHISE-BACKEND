import XLSX from 'xlsx';

// Create sample data with FUTURE dates (2026-2027)
const data = [
  ['Medicine Name', 'Generic Name', 'Brand', 'Category', 'Medical System', 'Strength', 'MRP', 'GST%', 'Quantity', 'Batch No', 'Expiry Date', 'Purchase Date'],
  ['Dolo 650', 'Paracetamol', 'Dolo', 'Tablet', 'Allopathy', '650mg', '45', '12', '100', 'B12345', '2027-12-31', '2024-01-15'],
  ['Crocin 500', 'Paracetamol', 'Crocin', 'Tablet', 'Allopathy', '500mg', '35', '12', '50', 'B12346', '2027-11-30', '2024-01-15'],
  ['Aspirin 75', 'Acetylsalicylic Acid', 'Aspirin', 'Tablet', 'Allopathy', '75mg', '8', '12', '200', 'B12347', '2027-01-31', '2024-01-15'],
];

// Create a new workbook
const ws = XLSX.utils.aoa_to_sheet(data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Medicines');

// Write to file
const outputPath = '/Users/alishamsi/Harsh@/MD/test-medicines-bulk.xlsx';
XLSX.writeFile(wb, outputPath);

console.log(`✅ Test Excel file updated with future dates (2027): ${outputPath}`);

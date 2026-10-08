# Supplier Data Seeder

This script populates the supplier database with:
- **500 Medicine/Dummy products** per supplier
- **500 Orders** distributed across all suppliers with realistic data

## Prerequisites

Make sure you have:
1. MongoDB connection working
2. At least one supplier created in the database
3. Node.js installed

## How to Run

```bash
# Navigate to backend folder
cd FRANCHISE-BACKEND

# Run the seeder
node scripts/seedSupplierData.js
```

## What It Does

### 1. Products (500 per supplier)
- Creates 500 medicine/dummy products
- Realistic medicine names (Indian pharma)
- Random stock levels (50-500 units)
- Purchase price: ₹10 - ₹2000
- MRP: 20-50% markup
- Categories: Medicine (400), Dummy (100)
- Batch numbers, expiry dates, GST, etc.

### 2. Orders (500 total)
- Distributed across all suppliers
- Random franchises (10 locations)
- 2-8 products per order
- Order statuses:
  - `pending` - New orders
  - `confirmed` - Accepted by supplier
  - `processing` - Being prepared
  - `dispatched` - Shipped with tracking
  - `delivered` - Completed
- Realistic amounts (₹5,000 - ₹50,000 per order)
- Last 90 days date range
- Includes tracking numbers, courier details, delivery addresses

## Data Structure

### Product Fields
```javascript
{
  productCode: 'MED00001',
  productName: 'Paracetamol 500mg',
  category: 'Medicine',
  manufacturer: 'Sun Pharma',
  stock: 250,
  purchasePrice: 120.50,
  sellingPrice: 150.00,
  mrp: 150.00,
  gst: 12,
  unit: 'Strip',
  packing: '10 Tab',
  batchNumber: 'BATCH5432',
  expiryDate: '2025-12-31',
  // ... more fields
}
```

### Order Fields
```javascript
{
  orderId: 'SO000001',
  franchiseName: 'Medico Pharmacy Delhi',
  franchiseCode: 'FR001',
  supplierName: 'Companywork',
  supplierCode: 'SUP008',
  products: [
    {
      productName: 'Amoxicillin 500mg',
      quantity: 50,
      pricePerUnit: 250.00,
      totalPrice: 12500.00
    }
  ],
  status: 'dispatched',
  subtotal: 45000.00,
  tax: 5400.00,
  shippingCharges: 150.00,
  totalAmount: 50550.00,
  trackingNumber: 'TRK567890',
  courierName: 'BlueDart',
  // ... more fields
}
```

## Output Example

```
🔌 Connecting to database...
✅ Connected to database

📦 Fetching suppliers...
✅ Found 2 suppliers

📦 Seeding products for suppliers...
  → Seeding products for: Companywork
    ✅ Seeded 500 products
  → Seeding products for: MediSupply Co
    ✅ Seeded 500 products

📦 Seeding supplier orders...
✅ Seeded 500 orders

═══════════════════════════════════════════════════════════════
🎉 SEEDING COMPLETED SUCCESSFULLY!
═══════════════════════════════════════════════════════════════
✅ Suppliers:         2
✅ Products:          1000
✅ Orders:            500

📊 Order Status Distribution:
   - pending         : 98
   - confirmed       : 102
   - processing      : 95
   - dispatched      : 103
   - delivered       : 102
═══════════════════════════════════════════════════════════════
```

## Notes

- Run this only once per environment
- Running multiple times will create duplicate data
- To reset, manually delete collections:
  - `supplier_products`
  - `supplierorders`
- Adjust `TENANT_DB_URI` in the script if needed

## Troubleshooting

**"No suppliers found"**
- Create at least one supplier first
- Check database connection

**"Duplicate key error"**
- Clear existing data or use different database
- Script doesn't handle existing data yet

**Connection timeout**
- Check MongoDB URI
- Verify network access
- Check MongoDB Atlas IP whitelist

## Next Steps

After seeding:
1. Login to supplier portal
2. Navigate to Dashboard - should show stats
3. Check Orders page - should see 500 orders
4. View Inventory - should see products
5. View Reports - should show analytics

## Support

If you encounter issues:
1. Check console output for errors
2. Verify database connection
3. Ensure suppliers exist before running
4. Check MongoDB logs

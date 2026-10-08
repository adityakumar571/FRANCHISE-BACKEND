/**
 * Seed Supplier Data - Creates medicines/dummy products and orders
 * Run: node scripts/seedSupplierData.js
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// ══════════════════════════════════════════════════════════════════════════════
// DATABASE CONFIG
// ══════════════════════════════════════════════════════════════════════════════
const TENANT_DB_URI = 'mongodb+srv://adityakumar33114:UCxu6G2uZG_83SM@cluster0.quxrn.mongodb.net/register';

// ══════════════════════════════════════════════════════════════════════════════
// SAMPLE DATA
// ══════════════════════════════════════════════════════════════════════════════

// 500 Medicine Names (Indian Pharma)
const MEDICINES = [
  // Antibiotics
  'Amoxicillin 500mg', 'Azithromycin 250mg', 'Ciprofloxacin 500mg', 'Doxycycline 100mg', 'Cefixime 200mg',
  'Levofloxacin 500mg', 'Ceftriaxone 1g', 'Metronidazole 400mg', 'Clindamycin 300mg', 'Erythromycin 250mg',
  
  // Pain & Fever
  'Paracetamol 500mg', 'Paracetamol 650mg', 'Ibuprofen 400mg', 'Diclofenac 50mg', 'Aspirin 75mg',
  'Naproxen 500mg', 'Tramadol 50mg', 'Ketorolac 10mg', 'Etoricoxib 90mg', 'Aceclofenac 100mg',
  
  // Diabetes
  'Metformin 500mg', 'Metformin 850mg', 'Glimepiride 1mg', 'Glimepiride 2mg', 'Glibenclamide 5mg',
  'Sitagliptin 50mg', 'Vildagliptin 50mg', 'Insulin Glargine', 'Insulin Aspart', 'Pioglitazone 15mg',
  
  // Hypertension
  'Amlodipine 5mg', 'Amlodipine 10mg', 'Atenolol 50mg', 'Losartan 50mg', 'Telmisartan 40mg',
  'Ramipril 5mg', 'Enalapril 10mg', 'Metoprolol 50mg', 'Hydrochlorothiazide 12.5mg', 'Carvedilol 6.25mg',
  
  // Gastro
  'Omeprazole 20mg', 'Pantoprazole 40mg', 'Esomeprazole 40mg', 'Ranitidine 150mg', 'Rabeprazole 20mg',
  'Domperidone 10mg', 'Ondansetron 4mg', 'Metoclopramide 10mg', 'Lactobacillus', 'Simethicone 40mg',
  
  // Respiratory
  'Salbutamol 4mg', 'Montelukast 10mg', 'Cetirizine 10mg', 'Loratadine 10mg', 'Fexofenadine 120mg',
  'Dextromethorphan', 'Guaifenesin', 'Ambroxol 30mg', 'Bromhexine 8mg', 'Theophylline 200mg',
  
  // Cardiac
  'Atorvastatin 10mg', 'Atorvastatin 20mg', 'Rosuvastatin 10mg', 'Clopidogrel 75mg', 'Aspirin 150mg',
  'Digoxin 0.25mg', 'Furosemide 40mg', 'Spironolactone 25mg', 'Isosorbide 5mg', 'Nitroglycerin',
  
  // Vitamins & Supplements
  'Vitamin D3 60000 IU', 'Calcium 500mg', 'Vitamin B12 1500mcg', 'Folic Acid 5mg', 'Iron 100mg',
  'Multivitamin', 'Omega-3', 'Zinc 50mg', 'Vitamin C 1000mg', 'Calcium + Vitamin D3',
  
  // Antidiabetic Combinations
  'Glimepiride + Metformin', 'Vildagliptin + Metformin', 'Teneligliptin + Metformin', 'Sitagliptin + Metformin',
  
  // Hypertension Combinations
  'Amlodipine + Atenolol', 'Telmisartan + Hydrochlorothiazide', 'Losartan + Hydrochlorothiazide',
  
  // Skin & Allergy
  'Betamethasone Cream', 'Hydrocortisone Cream', 'Clotrimazole Cream', 'Mupirocin Ointment', 'Fusidic Acid Cream',
  
  // Eye & Ear
  'Moxifloxacin Eye Drops', 'Timolol Eye Drops', 'Ciprofloxacin Ear Drops', 'Carboxymethylcellulose Eye Drops',
  
  // Thyroid
  'Levothyroxine 50mcg', 'Levothyroxine 100mcg', 'Carbimazole 5mg', 'Propylthiouracil 50mg',
  
  // Mental Health
  'Sertraline 50mg', 'Fluoxetine 20mg', 'Escitalopram 10mg', 'Alprazolam 0.5mg', 'Clonazepam 0.5mg',
  
  // Add more medicines to reach 500
  'Paracetamol Syrup 120mg/5ml', 'Amoxicillin Syrup 125mg/5ml', 'Ibuprofen Suspension 100mg/5ml',
  'ORS Powder', 'Zinc Sulphate Syrup', 'Albendazole 400mg', 'Mebendazole 100mg',
  'Loperamide 2mg', 'Activated Charcoal', 'Antibiotic Ointment', 'Povidone Iodine',
  'Dolo 650', 'Crocin 650', 'Combiflam', 'Disprin', 'Zifi 200', 'Augmentin 625',
  'Azee 500', 'Norflox TZ', 'Pan 40', 'Rablet 20', 'Dulcolax', 'Cremaffin',
  'Digene', 'Gelusil', 'Eno', 'Pudin Hara', 'Electral Powder', 'Glucon-D',
  'Burnol Cream', 'Moov Cream', 'Volini Gel', 'Iodex', 'Vicks VapoRub',
  'Vicks Inhaler', 'Otrivin Nasal Drops', 'Nasivion Drops', 'D-Cold Total',
  'Sinarest', 'Cheston Cold', 'Honitus Cough Syrup', 'Benadryl Cough Syrup',
  'Glycodin Cough Syrup', 'Alex Cough Syrup', 'Phensedyl Cough Syrup',
  'Dabur Honitus', 'Himalaya Koflet', 'Patanjali Divya Swasari Pravahi',
  'Chyawanprash', 'Ashwagandha Churna', 'Triphala Churna', 'Haridra Khanda',
  'Liv 52 Syrup', 'Liv 52 DS Tablet', 'Becosules Capsules', 'Neurobion Forte',
  'Shelcal 500', 'Calcirol Sachet', 'Uprise D3', 'Revital H Capsules',
  'Seven Seas Cod Liver Oil', 'HealthOK Tablet', 'Zincovit Tablet', 'A to Z NS Tablet',
  'Supradyn Tablet', 'Centrum Silver', 'Nature Made Multivitamin', 'GNC Multivitamin',
  'Protinex Powder', 'Ensure Powder', 'Boost Health Drink', 'Horlicks Protein Plus',
  'Complan Nutrition Drink', 'Pediasure', 'Glucerna', 'Diabetasol',
  'Dettol Liquid', 'Savlon Liquid', 'Betadine Solution', 'Hydrogen Peroxide',
  'Spirit IP', 'Cotton Wool', 'Gauze Bandage', 'Crepe Bandage', 'Adhesive Bandage',
  'Band-Aid', 'Hansaplast', 'Surgical Tape', 'Cotton Buds', 'Thermometer Digital',
  'BP Monitor Digital', 'Glucometer', 'Glucometer Strips', 'Lancets',
  'Insulin Syringes', 'Disposable Syringes', 'Nebulizer Mask', 'Steam Inhaler',
  'Hot Water Bag', 'Ice Pack', 'Heating Pad', 'Compression Stockings',
  'Knee Cap', 'Ankle Binder', 'Wrist Binder', 'Back Support Belt',
  'Cervical Collar', 'Walking Stick', 'Walker', 'Wheelchair', 'Hospital Bed',
  'Oxygen Cylinder', 'Pulse Oximeter', 'Stethoscope', 'Surgical Gloves',
  'N95 Mask', 'Surgical Mask', 'Face Shield', 'Hand Sanitizer 500ml',
  'Hand Sanitizer 100ml', 'Surgical Spirit', 'Methylated Spirit', 'Glycerin',
  'Castor Oil', 'Coconut Oil', 'Olive Oil', 'Almond Oil', 'Baby Oil',
  'Baby Powder', 'Baby Soap', 'Baby Shampoo', 'Baby Lotion', 'Diaper Rash Cream',
  'Diapers Small', 'Diapers Medium', 'Diapers Large', 'Diapers XL', 'Baby Wipes',
  'Nursing Pads', 'Breast Pump', 'Feeding Bottle', 'Nipple Shield', 'Pacifier',
  'Gripe Water', 'Teething Gel', 'Anti-Colic Drops', 'Lactose Free Formula',
  'Pregnancy Test Kit', 'Ovulation Test Kit', 'Folic Acid for Pregnancy',
  'Iron + Folic Acid', 'Calcium for Pregnancy', 'Prenatal Vitamins',
  'Postpartum Vitamins', 'Lactation Supplements', 'Breast Milk Storage Bags',
  'Sanitary Pads Regular', 'Sanitary Pads XL', 'Tampons', 'Menstrual Cup',
  'Panty Liners', 'Adult Diapers Medium', 'Adult Diapers Large', 'Adult Diapers XL',
  'Urinary Catheter', 'Urine Bag', 'Condom Regular', 'Condom Dotted', 'Condom Ultra Thin',
  'Emergency Contraceptive Pill', 'Oral Contraceptive Pills', 'Lubricant Gel',
  'Antiseptic Cream', 'Antifungal Powder', 'Anti-Itch Cream', 'Antiseptic Liquid',
  'Wound Healing Cream', 'Scar Removal Cream', 'Stretch Mark Cream', 'Anti-Aging Cream',
  'Sunscreen SPF 30', 'Sunscreen SPF 50', 'Moisturizer', 'Face Wash', 'Body Lotion',
  'Hair Oil', 'Anti-Dandruff Shampoo', 'Hair Growth Serum', 'Hair Conditioner',
  'Tooth Paste', 'Tooth Brush Soft', 'Tooth Brush Medium', 'Dental Floss', 'Mouthwash',
  'Denture Adhesive', 'Denture Cleanser', 'Tongue Cleaner', 'Whitening Strips',
  'Protein Powder Vanilla', 'Protein Powder Chocolate', 'Whey Protein Isolate',
  'Mass Gainer', 'BCAA Supplement', 'Creatine Monohydrate', 'Pre-Workout',
  'Post-Workout', 'L-Carnitine', 'CLA', 'Fat Burner', 'Testosterone Booster',
  'Joint Support', 'Glucosamine Chondroitin', 'Collagen Peptides', 'Biotin 10000mcg',
  'Keratin Supplement', 'Hair Skin Nails Vitamin', 'Hyaluronic Acid',
  'Coenzyme Q10', 'Resveratrol', 'Curcumin', 'Ashwagandha KSM-66', 'Rhodiola',
  'Ginseng', 'Maca Root', 'Tribulus Terrestris', 'Shilajit', 'Safed Musli',
  'Gokshura', 'Shatavari', 'Brahmi', 'Shankhpushpi', 'Jatamansi', 'Arjuna',
  'Punarnava', 'Giloy', 'Tulsi', 'Neem', 'Aloe Vera Juice', 'Amla Juice',
  'Karela Jamun Juice', 'Wheatgrass Juice', 'Apple Cider Vinegar', 'Green Tea Extract',
  'Garcinia Cambogia', 'Green Coffee Bean Extract', 'Raspberry Ketones',
  'Forskolin', 'Melatonin 3mg', 'Melatonin 5mg', 'Valerian Root', '5-HTP',
  'L-Theanine', 'Magnesium Glycinate', 'Magnesium Citrate', 'Potassium Citrate',
  'Sodium Bicarbonate', 'Apple Pectin', 'Psyllium Husk', 'Isabgol', 'Digestive Enzyme',
  'Probiotic 10 Billion CFU', 'Probiotic 50 Billion CFU', 'Prebiotic Fiber',
  'Liver Detox', 'Kidney Support', 'Lung Support', 'Heart Health Formula',
  'Brain Health Formula', 'Eye Health Formula', 'Bone Health Formula',
  'Immune Booster', 'Immunity Plus', 'Cold & Flu Relief', 'Allergy Relief',
  'Sinus Relief', 'Migraine Relief', 'Joint Pain Relief', 'Muscle Pain Relief',
  'Nerve Pain Relief', 'Period Pain Relief', 'Gas Relief', 'Constipation Relief',
  'Diarrhea Relief', 'Heartburn Relief', 'Nausea Relief', 'Motion Sickness',
  'Jet Lag Relief', 'Hangover Relief', 'Detox Tea', 'Slim Tea', 'Digestive Tea',
  'Stress Relief Tea', 'Sleep Tea', 'Energy Tea', 'Immunity Tea', 'Cold & Flu Tea',
  'Throat Lozenges', 'Cough Drops', 'Vitamin C Lozenges', 'Zinc Lozenges',
  'Echinacea', 'Elderberry', 'Propolis', 'Royal Jelly', 'Bee Pollen', 'Spirulina',
  'Chlorella', 'Moringa', 'Flaxseed Oil', 'Evening Primrose Oil', 'Borage Oil',
  'Black Seed Oil', 'MCT Oil', 'Avocado Oil', 'Grapeseed Oil', 'Sesame Oil',
  'Vitamin A 10000 IU', 'Vitamin E 400 IU', 'Vitamin K2', 'Thiamine B1', 'Riboflavin B2',
  'Niacin B3', 'Pantothenic Acid B5', 'Pyridoxine B6', 'Biotin B7', 'Folate B9',
  'Cobalamin B12', 'Choline', 'Inositol', 'PABA', 'Lycopene', 'Lutein', 'Zeaxanthin',
  'Beta Carotene', 'Astaxanthin', 'Quercetin', 'Rutin', 'Hesperidin', 'Citrus Bioflavonoids',
  'Pine Bark Extract', 'Grape Seed Extract', 'Pomegranate Extract', 'Acai Berry',
  'Goji Berry', 'Cranberry Extract', 'Blueberry Extract', 'Bilberry Extract',
  'Hawthorn Berry', 'Milk Thistle', 'Dandelion Root', 'Artichoke Extract',
  'Burdock Root', 'Yellow Dock', 'Red Clover', 'Nettle Leaf', 'Horsetail',
  'Dong Quai', 'Black Cohosh', 'Chasteberry', 'Red Raspberry Leaf', 'Fenugreek',
  'Saw Palmetto', 'Pygeum', 'Beta Sitosterol', 'Lycopene for Prostate',
  'Cranberry for UTI', 'D-Mannose', 'Uva Ursi', 'Goldenrod', 'Marshmallow Root',
  'Slippery Elm', 'Licorice Root', 'Ginger Root', 'Turmeric Root', 'Boswellia',
  'Devils Claw', 'White Willow Bark', 'Feverfew', 'Butterbur', 'Passionflower',
  'Lemon Balm', 'Chamomile', 'Lavender', 'Peppermint', 'Spearmint', 'Fennel',
  'Anise', 'Caraway', 'Coriander', 'Cumin', 'Cardamom', 'Cinnamon', 'Cloves',
  'Nutmeg', 'Black Pepper Extract', 'Cayenne', 'Paprika', 'Saffron Extract',
  'Vanilla Extract', 'Stevia', 'Monk Fruit', 'Xylitol', 'Erythritol', 'Sorbitol',
  'Mannitol', 'Maltitol', 'Isomalt', 'Sucralose', 'Acesulfame K', 'Aspartame',
  'Saccharin', 'Neotame', 'Advantame', 'Cyclamate', 'Allulose', 'Tagatose',
];

// Franchise list (dummy - will fetch real ones)
const FRANCHISES = [
  { name: 'Medico Pharmacy Delhi', code: 'FR001', city: 'Delhi' },
  { name: 'Care Plus Mumbai', code: 'FR002', city: 'Mumbai' },
  { name: 'Health Hub Bangalore', code: 'FR003', city: 'Bangalore' },
  { name: 'Wellness Point Chennai', code: 'FR004', city: 'Chennai' },
  { name: 'Apollo Medicals Kolkata', code: 'FR005', city: 'Kolkata' },
  { name: 'Life Line Pune', code: 'FR006', city: 'Pune' },
  { name: 'Medi Care Hyderabad', code: 'FR007', city: 'Hyderabad' },
  { name: 'Plus Point Ahmedabad', code: 'FR008', city: 'Ahmedabad' },
  { name: 'Sai Medicals Jaipur', code: 'FR009', city: 'Jaipur' },
  { name: 'Om Pharmacy Lucknow', code: 'FR010', city: 'Lucknow' },
];

// ══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomFloat = (min, max, decimals = 2) => parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
const randomElement = (arr) => arr[randomInt(0, arr.length - 1)];
const randomDate = (daysBack) => {
  const date = new Date();
  date.setDate(date.getDate() - randomInt(0, daysBack));
  return date;
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN SEED FUNCTION
// ══════════════════════════════════════════════════════════════════════════════

async function seedSupplierData() {
  try {
    console.log('🔌 Connecting to database...');
    await mongoose.connect(TENANT_DB_URI);
    console.log('✅ Connected to database\n');

    const db = mongoose.connection.db;

    // ────────────────────────────────────────────────────────────────────────
    // STEP 1: Get all suppliers
    // ────────────────────────────────────────────────────────────────────────
    console.log('📦 Fetching suppliers...');
    const suppliers = await db.collection('suppliers').find({ isActive: true }).toArray();
    
    if (suppliers.length === 0) {
      console.log('❌ No suppliers found. Please create suppliers first.');
      await mongoose.disconnect();
      return;
    }
    
    console.log(`✅ Found ${suppliers.length} suppliers\n`);

    // ────────────────────────────────────────────────────────────────────────
    // STEP 2: Seed 100 products for each supplier
    // ────────────────────────────────────────────────────────────────────────
    console.log('📦 Seeding products for suppliers...');
    
    for (const supplier of suppliers) {
      console.log(`\n  → Seeding products for: ${supplier.name}`);
      
      const products = [];
      const totalProducts = 100; // Changed from 500 to 100
      
      for (let i = 0; i < totalProducts; i++) {
        const medicineName = MEDICINES[i % MEDICINES.length];
        const basePrice = randomFloat(10, 2000, 2);
        const mrp = basePrice * randomFloat(1.2, 1.5, 2);
        
        products.push({
          productCode: `MED${String(i + 1).padStart(5, '0')}`,
          productName: medicineName,
          category: i < 80 ? 'Medicine' : 'Dummy', // 80 medicines, 20 dummy
          manufacturer: randomElement([
            'Sun Pharma', 'Cipla', 'Dr. Reddys', 'Lupin', 'Torrent Pharma',
            'Alkem Labs', 'Mankind Pharma', 'Zydus Cadila', 'Glenmark', 'Piramal'
          ]),
          supplierId: supplier._id,
          supplierName: supplier.name,
          supplierCode: supplier.supplierCode,
          batchNumber: `BATCH${randomInt(1000, 9999)}`,
          expiryDate: new Date(Date.now() + randomInt(180, 730) * 24 * 60 * 60 * 1000),
          stock: randomInt(50, 500),
          reorderLevel: 20,
          purchasePrice: basePrice,
          sellingPrice: mrp,
          mrp: mrp,
          gst: 12,
          unit: 'Strip',
          packing: randomElement(['10 Tab', '15 Tab', '20 Tab', '30 Tab', '100ml', '200ml']),
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      
      // Insert products in batches
      const batchSize = 100;
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);
        await db.collection('supplier_products').insertMany(batch);
      }
      
      console.log(`    ✅ Seeded ${totalProducts} products`);
    }

    // ────────────────────────────────────────────────────────────────────────
    // STEP 3: Seed orders (500 orders distributed across suppliers)
    // ────────────────────────────────────────────────────────────────────────
    console.log('\n📦 Seeding supplier orders...');
    
    const orderStatuses = ['pending', 'confirmed', 'processing', 'dispatched', 'delivered'];
    const orderTypes = ['Medicine', 'Dummy', 'Mixed'];
    const orders = [];
    
    for (let i = 0; i < 500; i++) {
      const supplier = randomElement(suppliers);
      const franchise = randomElement(FRANCHISES);
      const orderDate = randomDate(90); // Last 90 days
      const status = randomElement(orderStatuses);
      
      // Create 2-8 products per order
      const numProducts = randomInt(2, 8);
      const orderProducts = [];
      let subtotal = 0;
      
      for (let j = 0; j < numProducts; j++) {
        const medicine = randomElement(MEDICINES);
        const quantity = randomInt(10, 100);
        const pricePerUnit = randomFloat(50, 500, 2);
        const totalPrice = quantity * pricePerUnit;
        
        orderProducts.push({
          productName: medicine,
          productCode: `MED${randomInt(1, 100)}`, // Changed from 500 to 100
          category: randomElement(['Medicine', 'Dummy']),
          quantity: quantity,
          unit: 'Strip',
          pricePerUnit: pricePerUnit,
          totalPrice: totalPrice,
          discount: 0,
          tax: totalPrice * 0.12,
        });
        
        subtotal += totalPrice;
      }
      
      const tax = subtotal * 0.12;
      const shippingCharges = randomFloat(50, 200, 2);
      const totalAmount = subtotal + tax + shippingCharges;
      
      const order = {
        orderId: `SO${String(i + 1).padStart(6, '0')}`,
        franchiseId: franchise.code, // Using code as temp ID
        franchiseName: franchise.name,
        franchiseCode: franchise.code,
        supplierId: supplier._id,
        supplierName: supplier.name,
        supplierCode: supplier.supplierCode,
        products: orderProducts,
        orderType: randomElement(orderTypes),
        status: status,
        statusHistory: [
          {
            status: status,
            timestamp: orderDate,
            updatedBy: 'System',
            remarks: 'Initial order status',
          },
        ],
        subtotal: subtotal,
        discount: 0,
        tax: tax,
        shippingCharges: shippingCharges,
        totalAmount: totalAmount,
        paymentStatus: status === 'delivered' ? 'paid' : 'pending',
        paymentMethod: randomElement(['cash', 'card', 'upi', 'bank_transfer']),
        deliveryAddress: {
          address: `${randomInt(1, 999)} ${franchise.city} Street`,
          city: franchise.city,
          state: randomElement(['Delhi', 'Maharashtra', 'Karnataka', 'Tamil Nadu', 'West Bengal']),
          pincode: `${randomInt(100000, 999999)}`,
          contactPerson: 'Manager',
          contactNumber: `+91-${randomInt(7000000000, 9999999999)}`,
        },
        expectedDeliveryDate: new Date(orderDate.getTime() + randomInt(3, 10) * 24 * 60 * 60 * 1000),
        actualDeliveryDate: status === 'delivered' ? new Date(orderDate.getTime() + randomInt(3, 8) * 24 * 60 * 60 * 1000) : null,
        dispatchDate: ['dispatched', 'delivered'].includes(status) ? new Date(orderDate.getTime() + randomInt(1, 3) * 24 * 60 * 60 * 1000) : null,
        trackingNumber: ['dispatched', 'delivered'].includes(status) ? `TRK${randomInt(100000, 999999)}` : null,
        courierName: ['dispatched', 'delivered'].includes(status) ? randomElement(['BlueDart', 'DTDC', 'Delhivery', 'FedEx']) : null,
        notes: `Order for ${franchise.name}`,
        supplierRemarks: '',
        createdBy: 'System',
        updatedBy: 'System',
        createdAt: orderDate,
        updatedAt: orderDate,
      };
      
      orders.push(order);
    }
    
    // Insert orders in batches
    const batchSize = 100;
    for (let i = 0; i < orders.length; i += batchSize) {
      const batch = orders.slice(i, i + batchSize);
      await db.collection('supplierorders').insertMany(batch);
    }
    
    console.log(`✅ Seeded ${orders.length} orders\n`);

    // ────────────────────────────────────────────────────────────────────────
    // SUMMARY
    // ────────────────────────────────────────────────────────────────────────
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🎉 SEEDING COMPLETED SUCCESSFULLY!');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`✅ Suppliers:         ${suppliers.length}`);
    console.log(`✅ Products:          ${suppliers.length * 500}`);
    console.log(`✅ Orders:            ${orders.length}`);
    console.log('\n📊 Order Status Distribution:');
    const statusCount = orders.reduce((acc, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {});
    Object.entries(statusCount).forEach(([status, count]) => {
      console.log(`   - ${status.padEnd(15)}: ${count}`);
    });
    console.log('═══════════════════════════════════════════════════════════════\n');

    await mongoose.disconnect();
    console.log('🔌 Disconnected from database');
    console.log('✨ All done! Your supplier portal is ready with data.\n');
  } catch (error) {
    console.error('❌ Error seeding data:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the seeder
seedSupplierData();

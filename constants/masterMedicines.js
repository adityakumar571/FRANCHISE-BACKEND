/**
 * Master Medicine List - Standardized Generic Names
 * Used for autocomplete and comparison across suppliers
 */

export const MASTER_MEDICINES = [
  // Analgesics & Antipyretics
  { id: 'med_001', genericName: 'Paracetamol', category: 'Analgesics', commonBrands: ['Dolo', 'Crocin', 'Calpol', 'Metacin'], strengths: ['500mg', '650mg', '1000mg'] },
  { id: 'med_002', genericName: 'Ibuprofen', category: 'Analgesics', commonBrands: ['Brufen', 'Combiflam', 'Advil'], strengths: ['200mg', '400mg', '600mg'] },
  { id: 'med_003', genericName: 'Diclofenac', category: 'Analgesics', commonBrands: ['Voveran', 'Dynapar', 'Diclonac'], strengths: ['50mg', '75mg', '100mg'] },
  { id: 'med_004', genericName: 'Aspirin', category: 'Analgesics', commonBrands: ['Disprin', 'Ecosprin'], strengths: ['75mg', '150mg', '325mg'] },
  { id: 'med_005', genericName: 'Tramadol', category: 'Analgesics', commonBrands: ['Ultracet', 'Tramazac'], strengths: ['50mg', '100mg'] },

  // Antibiotics
  { id: 'med_006', genericName: 'Amoxicillin', category: 'Antibiotics', commonBrands: ['Novamox', 'Mox', 'Amoxil'], strengths: ['250mg', '500mg', '1000mg'] },
  { id: 'med_007', genericName: 'Azithromycin', category: 'Antibiotics', commonBrands: ['Azithral', 'Azee', 'Zithromax'], strengths: ['250mg', '500mg'] },
  { id: 'med_008', genericName: 'Ciprofloxacin', category: 'Antibiotics', commonBrands: ['Ciplox', 'Cifran'], strengths: ['250mg', '500mg', '750mg'] },
  { id: 'med_009', genericName: 'Cefixime', category: 'Antibiotics', commonBrands: ['Taxim', 'Ceftas', 'Mahacef'], strengths: ['100mg', '200mg', '400mg'] },
  { id: 'med_010', genericName: 'Doxycycline', category: 'Antibiotics', commonBrands: ['Doxy-1', 'Doxt'], strengths: ['100mg', '200mg'] },
  { id: 'med_011', genericName: 'Metronidazole', category: 'Antibiotics', commonBrands: ['Flagyl', 'Metrogyl'], strengths: ['200mg', '400mg', '500mg'] },
  { id: 'med_012', genericName: 'Amoxicillin + Clavulanic Acid', category: 'Antibiotics', commonBrands: ['Augmentin', 'Clavam', 'Moxclav'], strengths: ['375mg', '625mg', '1000mg'] },

  // Antacids & Digestive
  { id: 'med_013', genericName: 'Omeprazole', category: 'Antacids', commonBrands: ['Omez', 'Ocid', 'Omesec'], strengths: ['10mg', '20mg', '40mg'] },
  { id: 'med_014', genericName: 'Pantoprazole', category: 'Antacids', commonBrands: ['Pan', 'Pantop', 'Panto'], strengths: ['20mg', '40mg'] },
  { id: 'med_015', genericName: 'Ranitidine', category: 'Antacids', commonBrands: ['Aciloc', 'Rantac', 'Zinetac'], strengths: ['150mg', '300mg'] },
  { id: 'med_016', genericName: 'Domperidone', category: 'Digestive', commonBrands: ['Domstal', 'Vomistop'], strengths: ['10mg', '20mg'] },
  { id: 'med_017', genericName: 'Ondansetron', category: 'Antiemetic', commonBrands: ['Emeset', 'Ondem'], strengths: ['4mg', '8mg'] },

  // Antidiabetic
  { id: 'med_018', genericName: 'Metformin', category: 'Antidiabetic', commonBrands: ['Glycomet', 'Glucophage'], strengths: ['500mg', '850mg', '1000mg'] },
  { id: 'med_019', genericName: 'Glimepiride', category: 'Antidiabetic', commonBrands: ['Amaryl', 'Glemer'], strengths: ['1mg', '2mg', '4mg'] },
  { id: 'med_020', genericName: 'Sitagliptin', category: 'Antidiabetic', commonBrands: ['Januvia', 'Janumet'], strengths: ['50mg', '100mg'] },
  { id: 'med_021', genericName: 'Insulin Glargine', category: 'Antidiabetic', commonBrands: ['Lantus', 'Basalog'], strengths: ['100 IU/ml'] },

  // Antihypertensives
  { id: 'med_022', genericName: 'Amlodipine', category: 'Antihypertensive', commonBrands: ['Amlong', 'Norvasc'], strengths: ['2.5mg', '5mg', '10mg'] },
  { id: 'med_023', genericName: 'Atenolol', category: 'Antihypertensive', commonBrands: ['Aten', 'Tenormin'], strengths: ['25mg', '50mg', '100mg'] },
  { id: 'med_024', genericName: 'Losartan', category: 'Antihypertensive', commonBrands: ['Losar', 'Cozaar'], strengths: ['25mg', '50mg', '100mg'] },
  { id: 'med_025', genericName: 'Telmisartan', category: 'Antihypertensive', commonBrands: ['Telma', 'Micardis'], strengths: ['20mg', '40mg', '80mg'] },
  { id: 'med_026', genericName: 'Ramipril', category: 'Antihypertensive', commonBrands: ['Cardace', 'Altace'], strengths: ['2.5mg', '5mg', '10mg'] },

  // Antiallergic & Respiratory
  { id: 'med_027', genericName: 'Cetirizine', category: 'Antiallergic', commonBrands: ['Zyrtec', 'Okacet', 'Cetrizet'], strengths: ['5mg', '10mg'] },
  { id: 'med_028', genericName: 'Loratadine', category: 'Antiallergic', commonBrands: ['Lorfast', 'Claritin'], strengths: ['5mg', '10mg'] },
  { id: 'med_029', genericName: 'Montelukast', category: 'Respiratory', commonBrands: ['Montair', 'Singulair'], strengths: ['4mg', '5mg', '10mg'] },
  { id: 'med_030', genericName: 'Salbutamol', category: 'Respiratory', commonBrands: ['Asthalin', 'Ventolin'], strengths: ['2mg', '4mg', '100mcg'] },
  { id: 'med_031', genericName: 'Levocetirizine', category: 'Antiallergic', commonBrands: ['Levocet', 'Xyzal'], strengths: ['5mg', '10mg'] },

  // Vitamins & Supplements
  { id: 'med_032', genericName: 'Vitamin D3', category: 'Vitamins', commonBrands: ['Calcirol', 'D-Rise', 'Uprise'], strengths: ['1000 IU', '2000 IU', '60000 IU'] },
  { id: 'med_033', genericName: 'Calcium + Vitamin D3', category: 'Supplements', commonBrands: ['Shelcal', 'Calcimax'], strengths: ['500mg + 250 IU'] },
  { id: 'med_034', genericName: 'Iron + Folic Acid', category: 'Supplements', commonBrands: ['Autrin', 'Fefol'], strengths: ['100mg + 1.5mg'] },
  { id: 'med_035', genericName: 'Multivitamin', category: 'Supplements', commonBrands: ['Becosules', 'Supradyn', 'Revital'], strengths: ['Various'] },
  { id: 'med_036', genericName: 'Vitamin B12', category: 'Vitamins', commonBrands: ['Neurobion', 'Methylcobal'], strengths: ['500mcg', '1000mcg', '1500mcg'] },

  // Antidepressants & Anxiolytics
  { id: 'med_037', genericName: 'Escitalopram', category: 'Antidepressant', commonBrands: ['Feliz', 'Nexito', 'Cipralex'], strengths: ['5mg', '10mg', '20mg'] },
  { id: 'med_038', genericName: 'Sertraline', category: 'Antidepressant', commonBrands: ['Daxid', 'Sertaconazole'], strengths: ['25mg', '50mg', '100mg'] },
  { id: 'med_039', genericName: 'Alprazolam', category: 'Anxiolytic', commonBrands: ['Alprax', 'Restyl', 'Trika'], strengths: ['0.25mg', '0.5mg', '1mg'] },
  { id: 'med_040', genericName: 'Clonazepam', category: 'Anxiolytic', commonBrands: ['Lonazep', 'Clonotril'], strengths: ['0.25mg', '0.5mg', '1mg', '2mg'] },

  // Cholesterol & Lipid
  { id: 'med_041', genericName: 'Atorvastatin', category: 'Lipid Lowering', commonBrands: ['Atorva', 'Lipitor', 'Storvas'], strengths: ['10mg', '20mg', '40mg', '80mg'] },
  { id: 'med_042', genericName: 'Rosuvastatin', category: 'Lipid Lowering', commonBrands: ['Rosuvas', 'Crestor'], strengths: ['5mg', '10mg', '20mg', '40mg'] },
  { id: 'med_043', genericName: 'Fenofibrate', category: 'Lipid Lowering', commonBrands: ['Fenostat', 'Lipanthyl'], strengths: ['145mg', '160mg'] },

  // Anticoagulants
  { id: 'med_044', genericName: 'Clopidogrel', category: 'Anticoagulant', commonBrands: ['Clopivas', 'Plavix'], strengths: ['75mg', '150mg'] },
  { id: 'med_045', genericName: 'Warfarin', category: 'Anticoagulant', commonBrands: ['Warf', 'Coumadin'], strengths: ['1mg', '2mg', '5mg'] },

  // Thyroid
  { id: 'med_046', genericName: 'Levothyroxine', category: 'Thyroid', commonBrands: ['Thyronorm', 'Eltroxin'], strengths: ['25mcg', '50mcg', '75mcg', '100mcg'] },

  // Antimalarial & Antiparasitic
  { id: 'med_047', genericName: 'Chloroquine', category: 'Antimalarial', commonBrands: ['Lariago'], strengths: ['250mg', '500mg'] },
  { id: 'med_048', genericName: 'Artemether + Lumefantrine', category: 'Antimalarial', commonBrands: ['Coartem'], strengths: ['20mg + 120mg'] },
  { id: 'med_049', genericName: 'Albendazole', category: 'Antiparasitic', commonBrands: ['Zentel', 'Albenda'], strengths: ['200mg', '400mg'] },

  // Steroids
  { id: 'med_050', genericName: 'Prednisolone', category: 'Corticosteroid', commonBrands: ['Wysolone', 'Omnacortil'], strengths: ['5mg', '10mg', '20mg', '40mg'] },
  { id: 'med_051', genericName: 'Dexamethasone', category: 'Corticosteroid', commonBrands: ['Dexona', 'Decdan'], strengths: ['0.5mg', '4mg', '8mg'] },

  // Antifungal
  { id: 'med_052', genericName: 'Fluconazole', category: 'Antifungal', commonBrands: ['Forcan', 'Diflucan'], strengths: ['50mg', '150mg', '200mg'] },
  { id: 'med_053', genericName: 'Itraconazole', category: 'Antifungal', commonBrands: ['Itaspor', 'Sporanox'], strengths: ['100mg', '200mg'] },

  // Antiviral
  { id: 'med_054', genericName: 'Acyclovir', category: 'Antiviral', commonBrands: ['Acivir', 'Zovirax'], strengths: ['200mg', '400mg', '800mg'] },
  { id: 'med_055', genericName: 'Oseltamivir', category: 'Antiviral', commonBrands: ['Tamiflu', 'Antiflu'], strengths: ['30mg', '45mg', '75mg'] },

  // Muscle Relaxants
  { id: 'med_056', genericName: 'Chlorzoxazone', category: 'Muscle Relaxant', commonBrands: ['Myoril', 'Relaxyl'], strengths: ['250mg', '500mg'] },
  { id: 'med_057', genericName: 'Tizanidine', category: 'Muscle Relaxant', commonBrands: ['Sirdalud', 'Myoril'], strengths: ['2mg', '4mg'] },

  // Cough & Cold
  { id: 'med_058', genericName: 'Dextromethorphan', category: 'Antitussive', commonBrands: ['Benylin', 'Kofarest'], strengths: ['10mg', '15mg', '20mg'] },
  { id: 'med_059', genericName: 'Ambroxol', category: 'Mucolytic', commonBrands: ['Mucolite', 'Ambrodil'], strengths: ['30mg', '75mg'] },
  { id: 'med_060', genericName: 'Phenylephrine', category: 'Decongestant', commonBrands: ['Nasivion', 'Otrivin'], strengths: ['5mg', '10mg'] },

  // Pain & Inflammation Combinations
  { id: 'med_061', genericName: 'Diclofenac + Paracetamol', category: 'Analgesics', commonBrands: ['Voveran Plus', 'Dynapar'], strengths: ['50mg + 325mg'] },
  { id: 'med_062', genericName: 'Aceclofenac + Paracetamol', category: 'Analgesics', commonBrands: ['Zerodol-P', 'Hifenac'], strengths: ['100mg + 325mg'] },
  { id: 'med_063', genericName: 'Ibuprofen + Paracetamol', category: 'Analgesics', commonBrands: ['Combiflam', 'Ibugesic Plus'], strengths: ['400mg + 325mg'] },

  // Eye & Ear
  { id: 'med_064', genericName: 'Moxifloxacin Eye Drops', category: 'Ophthalmic', commonBrands: ['Vigamox', 'Moxiflox'], strengths: ['0.5%'] },
  { id: 'med_065', genericName: 'Timolol Eye Drops', category: 'Ophthalmic', commonBrands: ['Timol', 'Iobet'], strengths: ['0.25%', '0.5%'] },

  // Emergency & ICU
  { id: 'med_066', genericName: 'Adrenaline', category: 'Emergency', commonBrands: ['Adrenalin'], strengths: ['1mg/ml'] },
  { id: 'med_067', genericName: 'Atropine', category: 'Emergency', commonBrands: ['Atropin'], strengths: ['0.6mg/ml'] },

  // Anticonvulsants
  { id: 'med_068', genericName: 'Levetiracetam', category: 'Anticonvulsant', commonBrands: ['Levera', 'Keppra'], strengths: ['250mg', '500mg', '1000mg'] },
  { id: 'med_069', genericName: 'Sodium Valproate', category: 'Anticonvulsant', commonBrands: ['Valproate', 'Epilex'], strengths: ['200mg', '300mg', '500mg'] },
  { id: 'med_070', genericName: 'Carbamazepine', category: 'Anticonvulsant', commonBrands: ['Tegretol', 'Mazetol'], strengths: ['200mg', '400mg'] },

  // Add more as needed...
]

// Helper functions
export const getMedicineByGenericName = (genericName) => {
  return MASTER_MEDICINES.find(
    (med) => med.genericName.toLowerCase() === genericName.toLowerCase()
  )
}

export const searchMedicines = (searchTerm) => {
  const term = searchTerm.toLowerCase()
  return MASTER_MEDICINES.filter(
    (med) =>
      med.genericName.toLowerCase().includes(term) ||
      med.category.toLowerCase().includes(term) ||
      med.commonBrands.some((brand) => brand.toLowerCase().includes(term))
  )
}

export const getMedicinesByCategory = (category) => {
  return MASTER_MEDICINES.filter(
    (med) => med.category.toLowerCase() === category.toLowerCase()
  )
}

export const getAllCategories = () => {
  return [...new Set(MASTER_MEDICINES.map((med) => med.category))].sort()
}

export default MASTER_MEDICINES

/* eslint-disable */
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { apiResponse }   from '../../../utils/apiResponse.js';
import mongoose          from 'mongoose';

// ── Inline Branch Schema (no separate model file needed)
const BranchSchema = new mongoose.Schema({
  branchCode:   { type: String, required: true, unique: true },
  name:         { type: String, required: true, trim: true },
  address:      { type: String, trim: true },
  city:         { type: String, trim: true },
  state:        { type: String, trim: true },
  pincode:      { type: String, trim: true },
  phone:        { type: String, trim: true },
  email:        { type: String, trim: true, lowercase: true },
  manager:      { type: String, trim: true },
  openingDate:  { type: Date },
  isActive:     { type: Boolean, default: true },
  type:         { type: String, enum: ['Main', 'Branch', 'Franchise'], default: 'Branch' },
  description:  { type: String, trim: true },
}, { timestamps: true });

const getBranchModel = (db) =>
  db.models.FranchiseBranch || db.model('FranchiseBranch', BranchSchema);

// Seed demo branches
const seedBranches = async (db) => {
  const Branch = getBranchModel(db);
  if (await Branch.countDocuments() > 0) return;
  await Branch.insertMany([
    { branchCode: 'BR001', name: 'Main Branch',   address: '123 MG Road',    city: 'Delhi',     state: 'Delhi',         pincode: '110001', phone: '9800001001', email: 'main@pharmacy.com',   manager: 'Rajesh Kumar',  type: 'Main',     isActive: true  },
    { branchCode: 'BR002', name: 'East Branch',   address: '45 Laxmi Nagar', city: 'Delhi',     state: 'Delhi',         pincode: '110092', phone: '9800001002', email: 'east@pharmacy.com',   manager: 'Priya Sharma',  type: 'Branch',   isActive: true  },
    { branchCode: 'BR003', name: 'West Branch',   address: '78 Dwarka Sec 7',city: 'Delhi',     state: 'Delhi',         pincode: '110075', phone: '9800001003', email: 'west@pharmacy.com',   manager: 'Amit Singh',    type: 'Branch',   isActive: true  },
    { branchCode: 'BR004', name: 'South Branch',  address: '12 Saket Road',  city: 'Delhi',     state: 'Delhi',         pincode: '110017', phone: '9800001004', email: 'south@pharmacy.com',  manager: 'Neha Verma',    type: 'Branch',   isActive: false },
    { branchCode: 'BR005', name: 'Noida Outlet',  address: '56 Sector 18',   city: 'Noida',     state: 'Uttar Pradesh', pincode: '201301', phone: '9800001005', email: 'noida@pharmacy.com',  manager: 'Vikram Patel',  type: 'Franchise',isActive: true  },
    { branchCode: 'BR006', name: 'Gurgaon Branch',address: '34 Cyber City',  city: 'Gurgaon',   state: 'Haryana',       pincode: '122002', phone: '9800001006', email: 'gurugram@pharmacy.com',manager:'Sunita Joshi', type: 'Branch',   isActive: true  },
  ]);
};

// ── GET /api/franchise/branches
export const getBranches = asyncHandler(async (req, res) => {
  await seedBranches(req.db);
  const { search = '', status = '', type = '', page = 1, limit = 20 } = req.query;
  const Branch = getBranchModel(req.db);

  const filter = {};
  if (search) filter.$or = [
    { name:        new RegExp(search, 'i') },
    { branchCode:  new RegExp(search, 'i') },
    { city:        new RegExp(search, 'i') },
    { manager:     new RegExp(search, 'i') },
  ];
  if (status === 'Active')   filter.isActive = true;
  if (status === 'Inactive') filter.isActive = false;
  if (type && type !== 'All') filter.type = type;

  const skip = (Number(page) - 1) * Number(limit);
  const [branches, total] = await Promise.all([
    Branch.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    Branch.countDocuments(filter),
  ]);

  const kpi = {
    total:     await Branch.countDocuments(),
    active:    await Branch.countDocuments({ isActive: true }),
    inactive:  await Branch.countDocuments({ isActive: false }),
    main:      await Branch.countDocuments({ type: 'Main' }),
    franchise: await Branch.countDocuments({ type: 'Franchise' }),
  };

  return res.status(200).json(new apiResponse(200, {
    branches: branches.map(b => ({
      _id:         b._id,
      branchCode:  b.branchCode,
      name:        b.name,
      address:     b.address,
      city:        b.city,
      state:       b.state,
      pincode:     b.pincode,
      phone:       b.phone,
      email:       b.email,
      manager:     b.manager,
      type:        b.type,
      status:      b.isActive ? 'Active' : 'Inactive',
      openingDate: b.openingDate,
      description: b.description,
    })),
    total,
    totalPages: Math.ceil(total / Number(limit)),
    kpi,
  }, 'Branches fetched'));
});

// ── GET /api/franchise/branches/:id
export const getBranchById = asyncHandler(async (req, res) => {
  const Branch = getBranchModel(req.db);
  const branch = await Branch.findById(req.params.id).lean();
  if (!branch) return res.status(404).json(new apiResponse(404, null, 'Branch not found'));
  return res.status(200).json(new apiResponse(200, branch, 'Branch fetched'));
});

// ── POST /api/franchise/branches
export const createBranch = asyncHandler(async (req, res) => {
  const Branch = getBranchModel(req.db);
  const count  = await Branch.countDocuments();
  const branchCode = req.body.branchCode || `BR${String(count + 1).padStart(3, '0')}`;
  const exists = await Branch.findOne({ branchCode });
  if (exists) return res.status(409).json(new apiResponse(409, null, 'Branch code already exists'));
  const branch = await Branch.create({ ...req.body, branchCode });
  return res.status(201).json(new apiResponse(201, branch, 'Branch created'));
});

// ── PUT /api/franchise/branches/:id
export const updateBranch = asyncHandler(async (req, res) => {
  const Branch  = getBranchModel(req.db);
  delete req.body.branchCode; // immutable
  const branch  = await Branch.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!branch) return res.status(404).json(new apiResponse(404, null, 'Branch not found'));
  return res.status(200).json(new apiResponse(200, branch, 'Branch updated'));
});

// ── PATCH /api/franchise/branches/:id/toggle
export const toggleBranchStatus = asyncHandler(async (req, res) => {
  const Branch = getBranchModel(req.db);
  const branch = await Branch.findById(req.params.id);
  if (!branch) return res.status(404).json(new apiResponse(404, null, 'Branch not found'));
  branch.isActive = !branch.isActive;
  await branch.save();
  return res.status(200).json(new apiResponse(200, { isActive: branch.isActive }, `Branch ${branch.isActive ? 'activated' : 'deactivated'}`));
});

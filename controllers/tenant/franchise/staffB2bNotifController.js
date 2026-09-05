/* eslint-disable */
/* Staff, B2B Orders, Notifications, AuditLogs, Settings, Support, Layout3D */
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { apiResponse } from '../../../utils/apiResponse.js';
import { getFranchiseStaffModel } from '../../../models/tenant/franchise/FranchiseStaff.model.js';
import { getB2BOrderModel } from '../../../models/tenant/franchise/B2BOrder.model.js';
import { getFranchiseSettingsModel } from '../../../models/tenant/franchise/FranchiseSettings.model.js';
import { getSupportTicketModel } from '../../../models/tenant/franchise/SupportTicket.model.js';
import { getFranchiseAuditLogModel } from '../../../models/tenant/franchise/FranchiseAuditLog.model.js';
import { getNotificationModel } from '../../../models/tenant/Notification.model.js';
import { getRackModel } from '../../../models/tenant/franchise/Rack.model.js';
import { getMedicineModel } from '../../../models/tenant/franchise/Medicine.model.js';

// ════ STAFF ════════════════════════════════════════════════════════════════════

const seedStaff = async (db) => {
  const Staff = getFranchiseStaffModel(db);
  if (await Staff.countDocuments() > 0) return;
  await Staff.insertMany([
    { name: 'Rajesh Kumar',  staffId: 'STF001', role: 'Franchise Owner', department: 'Management', phone: '9800001001', shift: 'Morning', salary: 0,     attendance: 'Present', todaySales: 0     },
    { name: 'Amit Singh',    staffId: 'STF002', role: 'Branch Manager',  department: 'Management', phone: '9800001002', shift: 'Morning', salary: 35000, attendance: 'Present', todaySales: 0     },
    { name: 'Priya Sharma',  staffId: 'STF003', role: 'Pharmacist',      department: 'Pharmacy',   phone: '9800001003', shift: 'Morning', salary: 28000, attendance: 'Present', todaySales: 12450 },
    { name: 'Deepak Verma',  staffId: 'STF004', role: 'Pharmacist',      department: 'Pharmacy',   phone: '9800001004', shift: 'Evening', salary: 28000, attendance: 'Late',    todaySales: 8760  },
    { name: 'Neha Gupta',    staffId: 'STF005', role: 'Cashier',         department: 'Sales',      phone: '9800001005', shift: 'Morning', salary: 18000, attendance: 'Present', todaySales: 21300 },
    { name: 'Suresh Patel',  staffId: 'STF006', role: 'Cashier',         department: 'Sales',      phone: '9800001006', shift: 'Evening', salary: 18000, attendance: 'Absent',  todaySales: 0     },
    { name: 'Kavita Joshi',  staffId: 'STF007', role: 'Pharmacist',      department: 'Pharmacy',   phone: '9800001007', shift: 'Night',   salary: 30000, attendance: 'Present', todaySales: 9870, isActive: false },
  ]);
};

export const getStaff = asyncHandler(async (req, res) => {
  await seedStaff(req.db);
  const { search = '', dept = '', status = '', page = 1, limit = 20 } = req.query;
  const Staff = getFranchiseStaffModel(req.db);
  const filter = {};
  if (search) filter.$or = [{ name: new RegExp(search, 'i') }, { staffId: new RegExp(search, 'i') }, { role: new RegExp(search, 'i') }];
  if (dept)   filter.department = new RegExp(dept, 'i');
  if (status === 'Active')   filter.isActive = true;
  if (status === 'Inactive') filter.isActive = false;
  const skip = (Number(page) - 1) * Number(limit);
  const [staff, total] = await Promise.all([
    Staff.find(filter).skip(skip).limit(Number(limit)).lean(),
    Staff.countDocuments(filter),
  ]);
  const todayAgg = await Staff.aggregate([
    { $group: { _id: '$attendance', count: { $sum: 1 } } },
  ]);
  const attMap = {};
  todayAgg.forEach(a => { attMap[a._id] = a.count; });
  return res.status(200).json(new apiResponse(200, {
    staff: staff.map(s => ({
      _id: s._id, staffId: s.staffId, name: s.name, role: s.role,
      department: s.department, phone: s.phone, shift: s.shift,
      salary: s.salary, attendance: s.attendance, todaySales: s.todaySales,
      status: s.isActive !== false ? 'Active' : 'Inactive',
    })),
    total, totalPages: Math.ceil(total / Number(limit)),
    kpi: {
      total: await Staff.countDocuments(),
      present: attMap['Present'] || 0,
      absent:  attMap['Absent']  || 0,
      late:    attMap['Late']    || 0,
    },
  }, 'Staff fetched'));
});

export const createStaff = asyncHandler(async (req, res) => {
  const Staff = getFranchiseStaffModel(req.db);
  const count = await Staff.countDocuments();
  const s = await Staff.create({ ...req.body, staffId: `STF${String(count + 1).padStart(3, '0')}` });
  return res.status(201).json(new apiResponse(201, s, 'Staff created'));
});

export const updateStaff = asyncHandler(async (req, res) => {
  const Staff = getFranchiseStaffModel(req.db);
  const s = await Staff.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!s) return res.status(404).json(new apiResponse(404, null, 'Not found'));
  return res.status(200).json(new apiResponse(200, s, 'Staff updated'));
});

export const deleteStaff = asyncHandler(async (req, res) => {
  const Staff = getFranchiseStaffModel(req.db);
  await Staff.findByIdAndDelete(req.params.id);
  return res.status(200).json(new apiResponse(200, null, 'Staff deleted'));
});

export const getTodayAttendance = asyncHandler(async (req, res) => {
  await seedStaff(req.db);
  const Staff = getFranchiseStaffModel(req.db);
  const staff = await Staff.find({ isActive: { $ne: false } }).lean();
  return res.status(200).json(new apiResponse(200, staff.map(s => ({
    _id: s._id, name: s.name, role: s.role, attendance: s.attendance, shift: s.shift,
  })), 'Attendance fetched'));
});

export const markAttendance = asyncHandler(async (req, res) => {
  const { attendance } = req.body;
  const Staff = getFranchiseStaffModel(req.db);
  const s = await Staff.findByIdAndUpdate(req.params.id, { attendance }, { new: true });
  if (!s) return res.status(404).json(new apiResponse(404, null, 'Not found'));
  return res.status(200).json(new apiResponse(200, { attendance: s.attendance }, 'Attendance marked'));
});

// ════ B2B ORDERS ═══════════════════════════════════════════════════════════════

const seedB2BOrders = async (db) => {
  const B2B = getB2BOrderModel(db);
  if (await B2B.countDocuments() > 0) return;
  const sups = [
    { name: 'Gupta Pharma',       items: [{ medicineName: 'Paracetamol 650mg', qty: 100, unit: 'Strip', rate: 8.5, amount: 850 }, { medicineName: 'Azithral 500 Tablet', qty: 50, unit: 'Strip', rate: 45, amount: 2250 }] },
    { name: 'R.K. Distributors',  items: [{ medicineName: 'Calpol 650 Tablet', qty: 80, unit: 'Strip', rate: 16, amount: 1280 }] },
    { name: 'MedPlus Pharma',     items: [{ medicineName: 'Metformin 500mg', qty: 200, unit: 'Strip', rate: 8, amount: 1600 }, { medicineName: 'Atorvastatin 10mg', qty: 100, unit: 'Strip', rate: 15, amount: 1500 }] },
    { name: 'Medico Agency',      items: [{ medicineName: 'Pantop DSR Capsule', qty: 60, unit: 'Strip', rate: 42, amount: 2520 }] },
  ];
  const statuses = ['Delivered', 'Shipped', 'Confirmed', 'Pending', 'Cancelled', 'Delivered', 'Shipped', 'Delivered', 'Pending', 'Delivered', 'Delivered', 'Delivered', 'Confirmed'];
  const payStatuses = ['Paid', 'Paid', 'Pending', 'Pending', 'Paid', 'Paid', 'Partial', 'Paid', 'Overdue', 'Paid', 'Paid', 'Paid', 'Pending'];
  for (let i = 0; i < 13; i++) {
    const s = sups[i % sups.length];
    const amt = s.items.reduce((sum, it) => sum + it.amount, 0) * (1 + Math.random() * 0.5);
    await B2B.create({
      orderId:       `B2B-2025-${String(1001 + i).padStart(4, '0')}`,
      supplierName:  s.name,
      items:         s.items,
      totalQty:      s.items.reduce((sum, it) => sum + it.qty, 0),
      amount:        +amt.toFixed(2),
      orderStatus:   statuses[i],
      paymentStatus: payStatuses[i],
      orderDate:     new Date(Date.now() - i * 86400000 * 2),
    });
  }
};

export const getB2BOrders = asyncHandler(async (req, res) => {
  await seedB2BOrders(req.db);
  const { status = '', page = 1, limit = 20 } = req.query;
  const B2B = getB2BOrderModel(req.db);
  const filter = {};
  if (status) filter.orderStatus = status;
  const skip = (Number(page) - 1) * Number(limit);
  const [orders, total] = await Promise.all([
    B2B.find(filter).sort({ orderDate: -1 }).skip(skip).limit(Number(limit)).lean(),
    B2B.countDocuments(filter),
  ]);
  const kpi = {
    total:     await B2B.countDocuments(),
    delivered: await B2B.countDocuments({ orderStatus: 'Delivered' }),
    inTransit: await B2B.countDocuments({ orderStatus: 'Shipped' }),
    pending:   await B2B.countDocuments({ orderStatus: 'Pending' }),
  };
  return res.status(200).json(new apiResponse(200, {
    orders: orders.map(o => ({
      _id: o._id, orderId: o.orderId, supplier: o.supplierName,
      date:    new Date(o.orderDate).toLocaleDateString('en-IN'),
      items:   o.items?.length || 0,
      totalQty: o.totalQty, amount: o.amount,
      orderStatus: o.orderStatus, paymentStatus: o.paymentStatus,
    })),
    total, totalPages: Math.ceil(total / Number(limit)), kpi,
  }, 'B2B orders fetched'));
});

export const getB2BOrderById = asyncHandler(async (req, res) => {
  const B2B = getB2BOrderModel(req.db);
  const order = await B2B.findById(req.params.id).lean();
  if (!order) return res.status(404).json(new apiResponse(404, null, 'Not found'));
  return res.status(200).json(new apiResponse(200, order, 'B2B order fetched'));
});

export const updateB2BOrderStatus = asyncHandler(async (req, res) => {
  const { orderStatus, paymentStatus } = req.body;
  const B2B = getB2BOrderModel(req.db);
  const upd = {};
  if (orderStatus)   upd.orderStatus   = orderStatus;
  if (paymentStatus) upd.paymentStatus = paymentStatus;
  const order = await B2B.findByIdAndUpdate(req.params.id, upd, { new: true });
  if (!order) return res.status(404).json(new apiResponse(404, null, 'Not found'));
  return res.status(200).json(new apiResponse(200, { orderStatus: order.orderStatus }, 'Status updated'));
});

// ════ NOTIFICATIONS ════════════════════════════════════════════════════════════

const NOTIF_SEED = [
  { title: 'Low Stock Alert',       message: 'Dolo 650 Tablet is running low (12 strips left)', category: 'Stock',        isRead: false },
  { title: 'Expiry Alert',          message: 'Augmentin 625 expires in 25 days (120 strips)',   category: 'Expiry',       isRead: false },
  { title: 'Order Delivered',       message: 'B2B Order #B2B-2025-1001 has been delivered',     category: 'Order',        isRead: false },
  { title: 'Subscription Reminder', message: 'Your subscription expires in 30 days',            category: 'Subscription', isRead: true  },
  { title: 'Day Closing Due',       message: 'Today\'s day closing is pending',                  category: 'Staff',        isRead: true  },
  { title: 'New Order Placed',      message: 'Purchase order PO-2401 has been confirmed',       category: 'Order',        isRead: false },
  { title: 'Stock Adjustment',      message: 'ADJ-302 submitted and awaiting approval',         category: 'Stock',        isRead: false },
  { title: 'System Update',         message: 'PharmaNexus has been updated to v2.1.0',          category: 'System',       isRead: true  },
];

export const getNotifications = asyncHandler(async (req, res) => {
  // Use the existing Notification model from tenant
  const Notification = getNotificationModel(req.db);
  const { category = '', read = '', page = 1, limit = 20 } = req.query;

  // Seed some if empty
  const cnt = await Notification.countDocuments({});
  if (cnt === 0) {
    const dummyUserId = null;
    for (const n of NOTIF_SEED) {
      await Notification.create({ ...n, userId: dummyUserId, type: n.category.toLowerCase(), message: n.message, title: n.title });
    }
  }

  const filter = {};
  if (category && category !== 'All') filter.type = category.toLowerCase();
  if (read === 'unread') filter.isRead = false;
  if (read === 'read')   filter.isRead = true;

  const skip = (Number(page) - 1) * Number(limit);
  const [notifs, total] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    Notification.countDocuments(filter),
  ]);

  const unread = await Notification.countDocuments({ isRead: false });

  return res.status(200).json(new apiResponse(200, {
    notifications: notifs.map(n => ({
      _id: n._id, title: n.title, message: n.message,
      category: n.type || 'System',
      isRead: n.isRead || false,
      time: new Date(n.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      date: new Date(n.createdAt).toLocaleDateString('en-IN'),
    })),
    total, unread, totalPages: Math.ceil(total / Number(limit)),
  }, 'Notifications fetched'));
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  const Notification = getNotificationModel(req.db);
  await Notification.findByIdAndUpdate(req.params.id, { isRead: true });
  return res.status(200).json(new apiResponse(200, null, 'Marked as read'));
});

export const markAllNotificationsRead = asyncHandler(async (req, res) => {
  const Notification = getNotificationModel(req.db);
  await Notification.updateMany({ isRead: false }, { isRead: true });
  return res.status(200).json(new apiResponse(200, null, 'All marked as read'));
});

export const deleteNotification = asyncHandler(async (req, res) => {
  const Notification = getNotificationModel(req.db);
  await Notification.findByIdAndDelete(req.params.id);
  return res.status(200).json(new apiResponse(200, null, 'Notification deleted'));
});

// ════ AUDIT LOGS ═══════════════════════════════════════════════════════════════

const seedAuditLogs = async (db) => {
  const AuditLog = getFranchiseAuditLogModel(db);
  if (await AuditLog.countDocuments() > 0) return;
  const LOGS = [
    { action: 'LOGIN',  module: 'Auth',      description: 'User logged in',              userName: 'Admin',    userRole: 'Franchise Owner', ipAddress: '192.168.1.1',  result: 'Success' },
    { action: 'CREATE', module: 'POS',       description: 'Created invoice INV-2025-1524',userName: 'Neha Gupta',userRole: 'Cashier',       ipAddress: '192.168.1.5',  result: 'Success' },
    { action: 'UPDATE', module: 'Medicine',  description: 'Updated Dolo 650 Tablet',     userName: 'Priya Sharma',userRole: 'Pharmacist',  ipAddress: '192.168.1.3',  result: 'Success' },
    { action: 'DELETE', module: 'Customer',  description: 'Deleted customer CUS009',     userName: 'Admin',    userRole: 'Franchise Owner', ipAddress: '192.168.1.1',  result: 'Success' },
    { action: 'LOGIN',  module: 'Auth',      description: 'Failed login attempt',        userName: 'Unknown',  userRole: '—',              ipAddress: '203.45.12.8',  result: 'Failed'  },
    { action: 'EXPORT', module: 'Reports',   description: 'Exported Sales Report',       userName: 'Admin',    userRole: 'Franchise Owner', ipAddress: '192.168.1.1',  result: 'Success' },
    { action: 'CREATE', module: 'Purchase',  description: 'Created GRN GRN-1051',        userName: 'Amit Singh',userRole: 'Branch Manager',ipAddress: '192.168.1.2',  result: 'Success' },
    { action: 'UPDATE', module: 'Staff',     description: 'Updated staff STF006',        userName: 'Amit Singh',userRole: 'Branch Manager',ipAddress: '192.168.1.2',  result: 'Success' },
    { action: 'VIEW',   module: 'Settings',  description: 'Viewed settings page',        userName: 'Admin',    userRole: 'Franchise Owner', ipAddress: '192.168.1.1',  result: 'Success' },
    { action: 'CREATE', module: 'Inventory', description: 'Stock adjustment ADJ-302 submitted',userName: 'Priya Sharma',userRole:'Pharmacist',ipAddress:'192.168.1.3', result:'Success' },
    { action: 'LOGIN',  module: 'Auth',      description: 'User logged in',              userName: 'Deepak Verma',userRole:'Pharmacist',   ipAddress: '192.168.1.4',  result: 'Success' },
    { action: 'UPDATE', module: 'POS',       description: 'Day closing completed',       userName: 'Neha Gupta',userRole: 'Cashier',       ipAddress: '192.168.1.5',  result: 'Success' },
  ];
  for (let i = 0; i < LOGS.length; i++) {
    await AuditLog.create({ ...LOGS[i], createdAt: new Date(Date.now() - i * 2 * 3600000) });
  }
};

export const getAuditLogs = asyncHandler(async (req, res) => {
  await seedAuditLogs(req.db);
  const { action = '', module = '', from = '', to = '', search = '', page = 1, limit = 20 } = req.query;
  const AuditLog = getFranchiseAuditLogModel(req.db);

  const filter = {};
  if (action) filter.action  = action;
  if (module) filter.module  = new RegExp(module, 'i');
  if (search) filter.$or = [{ description: new RegExp(search, 'i') }, { userName: new RegExp(search, 'i') }];
  if (from || to) {
    filter.createdAt = {};
    if (from) { const s = new Date(from); s.setHours(0,0,0,0); filter.createdAt.$gte = s; }
    if (to)   { const e = new Date(to);   e.setHours(23,59,59,999); filter.createdAt.$lte = e; }
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [logs, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    AuditLog.countDocuments(filter),
  ]);

  const counts = await AuditLog.aggregate([{ $group: { _id: '$action', count: { $sum: 1 } } }]);
  const countMap = {};
  counts.forEach(c => { countMap[c._id] = c.count; });

  return res.status(200).json(new apiResponse(200, {
    logs: logs.map(l => ({
      _id: l._id, action: l.action, module: l.module, description: l.description,
      userName: l.userName, userRole: l.userRole, ipAddress: l.ipAddress,
      result: l.result,
      timestamp: new Date(l.createdAt).toLocaleString('en-IN'),
    })),
    total, totalPages: Math.ceil(total / Number(limit)), countMap,
  }, 'Audit logs fetched'));
});

// ════ SETTINGS ════════════════════════════════════════════════════════════════

export const getSettings = asyncHandler(async (req, res) => {
  const Settings = getFranchiseSettingsModel(req.db);
  let settings = await Settings.findOne({ tenantId: req.tenant._id }).lean();
  if (!settings) {
    settings = await Settings.create({
      tenantId: req.tenant._id,
      businessProfile: {
        storeName: req.tenant.schoolName, storeCode: req.tenant.franchiseCode || req.tenant.schoolCode,
        phone: req.tenant.schoolContact, email: req.tenant.schoolEmail,
        address: req.tenant.schoolAddress, gstin: req.tenant.gstNo || '',
        drugLicense: req.tenant.dlNo || '',
      },
    });
  }
  return res.status(200).json(new apiResponse(200, settings, 'Settings fetched'));
});

export const updateBusinessProfile = asyncHandler(async (req, res) => {
  const Settings = getFranchiseSettingsModel(req.db);
  const s = await Settings.findOneAndUpdate(
    { tenantId: req.tenant._id },
    { $set: { businessProfile: req.body } },
    { new: true, upsert: true }
  );
  return res.status(200).json(new apiResponse(200, s.businessProfile, 'Business profile updated'));
});

export const updateNotificationPreferences = asyncHandler(async (req, res) => {
  const Settings = getFranchiseSettingsModel(req.db);
  const s = await Settings.findOneAndUpdate(
    { tenantId: req.tenant._id },
    { $set: { notifications: req.body } },
    { new: true, upsert: true }
  );
  return res.status(200).json(new apiResponse(200, s.notifications, 'Notification preferences updated'));
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPwd, newPwd } = req.body;
  if (!currentPwd || !newPwd) return res.status(400).json(new apiResponse(400, null, 'Both passwords required'));
  const { getUserModel } = await import('../../../models/tenant/user.model.js');
  const User = getUserModel(req.db);
  // In this system passwords are stored as plain text (legacy pattern)
  const user = await User.findOne({ password: currentPwd });
  if (!user) return res.status(401).json(new apiResponse(401, null, 'Current password incorrect'));
  user.password = newPwd;
  await user.save();
  return res.status(200).json(new apiResponse(200, null, 'Password changed successfully'));
});

export const updatePrintingSettings = asyncHandler(async (req, res) => {
  const Settings = getFranchiseSettingsModel(req.db);
  const s = await Settings.findOneAndUpdate(
    { tenantId: req.tenant._id },
    { $set: { printing: req.body } },
    { new: true, upsert: true }
  );
  return res.status(200).json(new apiResponse(200, s.printing, 'Printing settings updated'));
});

export const updatePreferences = asyncHandler(async (req, res) => {
  const Settings = getFranchiseSettingsModel(req.db);
  const s = await Settings.findOneAndUpdate(
    { tenantId: req.tenant._id },
    { $set: { preferences: req.body } },
    { new: true, upsert: true }
  );
  return res.status(200).json(new apiResponse(200, s.preferences, 'Preferences updated'));
});

// ════ SUPPORT ═════════════════════════════════════════════════════════════════

const seedTickets = async (db) => {
  const Ticket = getSupportTicketModel(db);
  if (await Ticket.countDocuments() > 0) return;
  await Ticket.insertMany([
    { ticketId: 'TKT-001', subject: 'Barcode scanner not working', category: 'Technical', priority: 'High',   status: 'In Progress', createdBy: 'Admin', messages: [{ sender: 'Admin', text: 'Scanner not scanning barcodes since morning' }, { sender: 'Support', text: 'Our team is looking into this' }] },
    { ticketId: 'TKT-002', subject: 'Invoice printing issue',      category: 'Technical', priority: 'Medium', status: 'Open',        createdBy: 'Admin', messages: [{ sender: 'Admin', text: 'Invoice PDF not generating correctly' }] },
    { ticketId: 'TKT-003', subject: 'Stock report discrepancy',    category: 'Inventory', priority: 'Low',    status: 'Resolved',    createdBy: 'Admin', messages: [] },
    { ticketId: 'TKT-004', subject: 'Billing query',               category: 'Billing',   priority: 'Medium', status: 'Closed',      createdBy: 'Admin', messages: [] },
  ]);
};

export const getSupportTickets = asyncHandler(async (req, res) => {
  await seedTickets(req.db);
  const { search = '', page = 1, limit = 20 } = req.query;
  const Ticket = getSupportTicketModel(req.db);
  const filter = {};
  if (search) filter.$or = [{ subject: new RegExp(search, 'i') }, { ticketId: new RegExp(search, 'i') }];
  const skip = (Number(page) - 1) * Number(limit);
  const [tickets, total] = await Promise.all([
    Ticket.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    Ticket.countDocuments(filter),
  ]);
  return res.status(200).json(new apiResponse(200, {
    tickets: tickets.map(t => ({
      _id: t._id, ticketId: t.ticketId, subject: t.subject, category: t.category,
      priority: t.priority, status: t.status, updatedAt: new Date(t.updatedAt).toLocaleDateString('en-IN'),
    })),
    total, totalPages: Math.ceil(total / Number(limit)),
  }, 'Tickets fetched'));
});

export const createSupportTicket = asyncHandler(async (req, res) => {
  const Ticket = getSupportTicketModel(req.db);
  const count  = await Ticket.countDocuments();
  const t = await Ticket.create({ ...req.body, ticketId: `TKT-${String(count + 1).padStart(3, '0')}` });
  return res.status(201).json(new apiResponse(201, t, 'Ticket created'));
});

export const getSupportTicketById = asyncHandler(async (req, res) => {
  const Ticket = getSupportTicketModel(req.db);
  const t = await Ticket.findById(req.params.id).lean();
  if (!t) return res.status(404).json(new apiResponse(404, null, 'Not found'));
  return res.status(200).json(new apiResponse(200, t, 'Ticket fetched'));
});

export const getSupportFAQs = asyncHandler(async (req, res) => {
  const FAQS = [
    { q: 'How to add a new medicine?', a: 'Go to Medicine Master > Add Medicine and fill in the details.' },
    { q: 'How to do day closing?',      a: 'Go to POS Billing > Day Closing, enter physical cash count and click Close Day.' },
    { q: 'How to process a return?',    a: 'Go to POS Billing > Return Bill, enter the invoice number and select items to return.' },
    { q: 'How to add a supplier?',      a: 'Go to Suppliers > Add Supplier and fill in the supplier details.' },
    { q: 'How to generate reports?',    a: 'Go to Reports section and select the report type, date range, and click Generate.' },
    { q: 'How to setup rack management?', a: 'Go to Inventory > Rack & Warehouse to add and manage storage locations.' },
    { q: 'How to check low stock items?', a: 'Go to Inventory Dashboard or Inventory > Current Stock and filter by Low Stock status.' },
  ];
  return res.status(200).json(new apiResponse(200, FAQS, 'FAQs fetched'));
});

// ════ LAYOUT 3D ═══════════════════════════════════════════════════════════════

const COUNTERS_DATA = [
  { id: 'CTR-A', label: 'Counter A', type: 'main',   x: 10, y: 10, status: 'active',   medicines: 45 },
  { id: 'CTR-B', label: 'Counter B', type: 'main',   x: 50, y: 10, status: 'active',   medicines: 38 },
  { id: 'CTR-C', label: 'Counter C', type: 'billing',x: 90, y: 10, status: 'active',   medicines: 22 },
  { id: 'CTR-D', label: 'Counter D', type: 'main',   x: 10, y: 60, status: 'inactive', medicines: 0  },
  { id: 'CTR-E', label: 'Counter E', type: 'billing',x: 50, y: 60, status: 'active',   medicines: 31 },
  { id: 'CTR-F', label: 'Counter F', type: 'main',   x: 90, y: 60, status: 'active',   medicines: 28 },
];

export const getLayoutCounters = asyncHandler(async (req, res) => {
  return res.status(200).json(new apiResponse(200, COUNTERS_DATA, 'Counters fetched'));
});

export const getLayoutRacks = asyncHandler(async (req, res) => {
  const Rack = getRackModel(req.db);
  const racks = await Rack.find({ isActive: true }).lean();
  if (racks.length === 0) {
    return res.status(200).json(new apiResponse(200, [
      { id: 'A-1', code: 'A-1', description: 'Analgesics', shelf: 'Shelf 1', items: 12, capacity: 20, status: 'available', counter: 'CTR-A' },
      { id: 'A-2', code: 'A-2', description: 'Antibiotics', shelf: 'Shelf 2', items: 8, capacity: 15, status: 'low', counter: 'CTR-A' },
      { id: 'B-1', code: 'B-1', description: 'Cardiac', shelf: 'Shelf 1', items: 6, capacity: 12, status: 'available', counter: 'CTR-B' },
      { id: 'B-2', code: 'B-2', description: 'Antidiabetics', shelf: 'Shelf 2', items: 10, capacity: 15, status: 'available', counter: 'CTR-B' },
      { id: 'C-1', code: 'C-1', description: 'Cold & Cough', shelf: 'Shelf 1', items: 15, capacity: 20, status: 'available', counter: 'CTR-C' },
      { id: 'C-2', code: 'C-2', description: 'Vitamins', shelf: 'Shelf 2', items: 20, capacity: 25, status: 'full', counter: 'CTR-C' },
      { id: 'C-3', code: 'C-3', description: 'Syrups', shelf: 'Shelf 3', items: 0, capacity: 10, status: 'empty', counter: 'CTR-C' },
      { id: 'C-4', code: 'C-4', description: 'Injections', shelf: 'Shelf 4', items: 4, capacity: 8, status: 'available', counter: 'CTR-E' },
      { id: 'REF', code: 'REF', description: 'Cold Storage', shelf: 'Fridge', items: 3, capacity: 8, status: 'available', counter: 'CTR-F' },
    ], 'Racks fetched'));
  }
  const result = racks.map(r => {
    const pct = r.capacity > 0 ? (r.items || 0) / r.capacity : 0;
    return { ...r, status: pct >= 1 ? 'full' : pct >= 0.8 ? 'low' : (r.items || 0) === 0 ? 'empty' : 'available' };
  });
  return res.status(200).json(new apiResponse(200, result, 'Racks fetched'));
});

export const getMedicineLocation = asyncHandler(async (req, res) => {
  const { q = '' } = req.query;
  const Medicine = getMedicineModel(req.db);
  const meds = await Medicine.find({ name: new RegExp(q, 'i'), isActive: true }).limit(5).lean();
  const result = meds.map(m => ({
    _id: m._id, name: m.name, rackLabel: m.rackLabel || 'Unknown',
    stock: m.currentStock, status: m.currentStock <= 0 ? 'out' : m.currentStock <= m.reorderLevel ? 'low' : 'available',
  }));
  return res.status(200).json(new apiResponse(200, result, 'Medicine locations fetched'));
});

export const addCounter = asyncHandler(async (req, res) => {
  // counters stored statically for now
  return res.status(201).json(new apiResponse(201, { ...req.body, id: `CTR-${Date.now()}` }, 'Counter added'));
});

export const addLayoutRack = asyncHandler(async (req, res) => {
  const Rack = getRackModel(req.db);
  const rack = await Rack.create({ code: req.body.code, area: req.body.area || 'Main Store', shelf: req.body.shelf, description: req.body.description, capacity: req.body.capacity || 20 });
  return res.status(201).json(new apiResponse(201, rack, 'Rack added to layout'));
});

export const updateLayoutRack = asyncHandler(async (req, res) => {
  const Rack = getRackModel(req.db);
  const rack = await Rack.findByIdAndUpdate(req.params.id, req.body, { new: true });
  return res.status(200).json(new apiResponse(200, rack, 'Rack updated'));
});

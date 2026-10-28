/* All remaining franchise routes in one file for simplicity */
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
// ── Rack Management Routes ────────────────────────────────────────────────────
import { createRack as createRackInv, updateRack as updateRackInv, deleteRack as deleteRackInv } from '../../../controllers/tenant/franchise/inventoryController.js';

// Existing medicine controller imports
import {
  getMedicines, createMedicine, updateMedicine, getMedicineById, toggleMedicineStatus,
  getMedicineBatches, getAlternatives, getMedicineBarcode, getGenericMapping,
  getRackManagement, assignMedicineRack,
  // New medicine routes
  getMedicineMeta, getMedicineGenericMapping, deleteGenericMapping, deleteAlternative,
  getMedicineImages, uploadMedicineImage, deleteMedicineImage, setPrimaryMedicineImage,
  getOccupiedSlots,
  // NEW: Rack Location & Batch Management
  getMedicinesByRack, searchByLocation, updateMedicineLocation,
  addBatchToMedicine, getExpiringSoon, getExpiredMedicines,
  generateBarcode, getRackSummary,
} from '../../../controllers/tenant/franchise/medicineController.js';

// ── Supplier Masters (shared Category / Unit / Company) ──
import { getMasters, getAllMasters, createMaster, updateMaster, deleteMaster } from '../../../controllers/SupplierMasterController.js';

import {
  getCustomers, createCustomer, updateCustomer, getCustomerById, deleteCustomer,
  getCustomerPurchases, getCustomerWallet, walletTopup, getLoyalty, redeemLoyalty,
  getMembership, enrollMembership, getReminders, addReminder, updateReminder, getCareCoin,
  // New customer route
  redeemCareCoin,
} from '../../../controllers/tenant/franchise/customerController.js';

import {
  getDayBook, getCashBook, getBankBook, getReceipts, createReceipt,
  getPayments, createPayment, getExpenses, createExpense, getIncome, createIncome,
  getJournal, createJournalEntry, getLedger, getTrialBalance, getProfitLoss, getBalanceSheet,
} from '../../../controllers/tenant/franchise/accountsController.js';

import {
  getSalesReport, getPurchaseReport, getStockReport, getExpiryReport, getFinancialReport,
} from '../../../controllers/tenant/franchise/reportsController.js';

import {
  getStaff, createStaff, updateStaff, deleteStaff, getTodayAttendance, markAttendance,
  getStaffAttendanceByDate,
  getB2BOrders, getB2BOrderById, updateB2BOrderStatus,
  getNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification,
  getAuditLogs,
  getSettings, updateBusinessProfile, updateNotificationPreferences, changePassword, updatePrintingSettings, updatePreferences,
  getSupportTickets, createSupportTicket, getSupportTicketById, getSupportFAQs,
  getLayoutCounters, getLayoutRacks, getMedicineLocation, addCounter, addLayoutRack, updateLayoutRack,
} from '../../../controllers/tenant/franchise/staffB2bNotifController.js';

import {
  getBranches, getBranchById, createBranch, updateBranch, toggleBranchStatus,
} from '../../../controllers/tenant/franchise/branchController.js';

const router = express.Router();

// ── Multer Configuration for Image Uploads ───────────────────────────────────
const uploadDir = 'uploads/medicines';
if (!fs.existsSync(uploadDir)){
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'medicine-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: fileFilter
});

// ── Medicines ─────────────────────────────────────────────────────────────────
router.get('/medicines/meta',               getMedicineMeta);
router.get('/medicines/occupied-slots',     getOccupiedSlots);   // ← occupied positions per rack

// ── Medicine Masters (Category / Unit / Company) — shared with Supplier Portal ──
router.get('/medicines/masters/all',        getAllMasters);
router.get('/medicines/masters',            getMasters);
router.post('/medicines/masters',           createMaster);
router.put('/medicines/masters/:id',        updateMaster);
router.delete('/medicines/masters/:id',     deleteMaster);

// ── NEW: Rack & Batch Management (placed before :id routes to avoid conflicts) ──
router.get('/medicines/search-by-location', searchByLocation);        // ← NEW: search by position
router.get('/medicines/expiring-soon',      getExpiringSoon);         // ← NEW: expiring batches
router.get('/medicines/expired',            getExpiredMedicines);     // ← NEW: expired batches
router.post('/medicines/barcode/generate',  generateBarcode);         // ← NEW: generate barcode
router.get('/medicines/rack-summary',       getRackSummary);          // ← NEW: rack summary
router.get('/medicines/racks/:rackId',      getMedicinesByRack);      // ← NEW: medicines in rack

router.get('/medicines',                    getMedicines);
router.post('/medicines',                   createMedicine);
router.put('/medicines/:id',                updateMedicine);
router.get('/medicines/:id',                getMedicineById);
router.patch('/medicines/:id/status',       toggleMedicineStatus);
router.put('/medicines/:id/location',       updateMedicineLocation);  // ← NEW: update location
router.post('/medicines/:id/batch',         addBatchToMedicine);      // ← NEW: add batch
router.get('/medicines/:id/batches',        getMedicineBatches);
router.get('/medicines/:id/alternatives',   getAlternatives);
router.delete('/medicines/:id/alternatives/:altId', deleteAlternative);  // ← NEW
router.get('/medicines/:id/barcode',        getMedicineBarcode);
router.get('/medicines/:id/generic',        getMedicineGenericMapping);  // ← NEW
router.delete('/medicines/:id/generic/:brandId', deleteGenericMapping);  // ← NEW
router.get('/medicines/:id/images',         getMedicineImages);           // ← NEW
router.post('/medicines/:id/images',        upload.single('image'), uploadMedicineImage);         // ← NEW with multer
router.delete('/medicines/:id/images/:imageId', deleteMedicineImage);    // ← NEW
router.post('/medicines/:id/images/:imageId/set-primary', setPrimaryMedicineImage); // ← NEW
router.get('/generic-mapping',              getGenericMapping);

// ── Rack Management CRUD ──────────────────────────────────────────────────────
router.get('/rack-management',              getRackManagement);        // List all racks
router.post('/rack-management',             createRackInv);            // Create new rack
router.put('/rack-management/:id',          updateRackInv);            // Update rack
router.delete('/rack-management/:id',       deleteRackInv);            // Delete rack
router.put('/rack-management/:rackId/assign', assignMedicineRack);    // Assign medicine to rack

// ❌ REMOVED: Tenant Supplier Routes
// Suppliers are now global - managed through /api/suppliers
// Franchises can only VIEW global suppliers, not create/manage locally

// ── Customers ─────────────────────────────────────────────────────────────────
router.get('/customers',                         getCustomers);
router.post('/customers',                        createCustomer);
router.put('/customers/:id',                     updateCustomer);
router.get('/customers/:id',                     getCustomerById);
router.delete('/customers/:id',                  deleteCustomer);
router.get('/customers/:id/purchases',           getCustomerPurchases);
router.get('/customers/:id/wallet',              getCustomerWallet);
router.post('/customers/:id/wallet/topup',       walletTopup);
router.get('/customers/:id/loyalty',             getLoyalty);
router.post('/customers/:id/loyalty/redeem',     redeemLoyalty);
router.get('/customers/:id/membership',          getMembership);
router.post('/customers/:id/membership',         enrollMembership);
router.get('/customers/:id/reminders',           getReminders);
router.post('/customers/:id/reminders',          addReminder);
router.put('/customers/:id/reminders/:rid',      updateReminder);
router.get('/customers/:id/carecoin',            getCareCoin);
router.post('/customers/:id/carecoin/redeem',    redeemCareCoin);      // ← NEW

// ── Accounts ─────────────────────────────────────────────────────────────────
router.get('/accounts/day-book',            getDayBook);
router.get('/accounts/cash-book',           getCashBook);
router.get('/accounts/bank-book',           getBankBook);
router.get('/accounts/receipts',            getReceipts);
router.post('/accounts/receipts',           createReceipt);
router.get('/accounts/payments',            getPayments);
router.post('/accounts/payments',           createPayment);
router.get('/accounts/expenses',            getExpenses);
router.post('/accounts/expenses',           createExpense);
router.get('/accounts/income',              getIncome);
router.post('/accounts/income',             createIncome);
router.get('/accounts/journal',             getJournal);
router.post('/accounts/journal',            createJournalEntry);
router.get('/accounts/ledger',              getLedger);
router.get('/accounts/trial-balance',       getTrialBalance);
router.get('/accounts/profit-loss',         getProfitLoss);
router.get('/accounts/balance-sheet',       getBalanceSheet);

// ── Reports ───────────────────────────────────────────────────────────────────
router.get('/reports/sales',                getSalesReport);
router.get('/reports/purchase',             getPurchaseReport);
router.get('/reports/stock',                getStockReport);
router.get('/reports/expiry',               getExpiryReport);
router.get('/reports/financial',            getFinancialReport);

// ── Staff ─────────────────────────────────────────────────────────────────────
router.get('/staff/attendance/today',       getTodayAttendance);   // static before /:id
router.get('/staff/attendance',             getStaffAttendanceByDate); // ← NEW: by date
router.get('/staff',                        getStaff);
router.post('/staff',                       createStaff);
router.put('/staff/:id',                    updateStaff);
router.delete('/staff/:id',                 deleteStaff);
router.put('/staff/:id/attendance',         markAttendance);

// ── Branches ──────────────────────────────────────────────────────────────────
router.get('/branches',                     getBranches);            // ← NEW
router.post('/branches',                    createBranch);           // ← NEW
router.get('/branches/:id',                 getBranchById);          // ← NEW
router.put('/branches/:id',                 updateBranch);           // ← NEW
router.patch('/branches/:id/toggle',        toggleBranchStatus);     // ← NEW

// ── B2B Orders ────────────────────────────────────────────────────────────────
router.get('/b2b-orders',                   getB2BOrders);
router.get('/b2b-orders/:id',               getB2BOrderById);
router.put('/b2b-orders/:id/status',        updateB2BOrderStatus);

// ── Notifications ─────────────────────────────────────────────────────────────
router.get('/notifications',                    getNotifications);
router.put('/notifications/read-all',           markAllNotificationsRead);
router.put('/notifications/:id/read',           markNotificationRead);
router.delete('/notifications/:id',             deleteNotification);

// ── Audit Logs ────────────────────────────────────────────────────────────────
router.get('/audit-logs',                   getAuditLogs);

// ── Settings ─────────────────────────────────────────────────────────────────
router.get('/settings',                          getSettings);
router.put('/settings/business-profile',         updateBusinessProfile);
router.put('/settings/notification-preferences', updateNotificationPreferences);
router.put('/settings/security/password',        changePassword);
router.put('/settings/printing',                 updatePrintingSettings);
router.put('/settings/preferences',              updatePreferences);

// ── Support ───────────────────────────────────────────────────────────────────
router.get('/support/tickets',              getSupportTickets);
router.post('/support/tickets',             createSupportTicket);
router.get('/support/tickets/:id',          getSupportTicketById);
router.get('/support/faqs',                 getSupportFAQs);

// ── Layout 3D ─────────────────────────────────────────────────────────────────
router.get('/layout/counters',              getLayoutCounters);
router.get('/layout/racks',                 getLayoutRacks);
router.get('/layout/medicine-location',     getMedicineLocation);
router.post('/layout/counters',             addCounter);
router.post('/layout/racks',               addLayoutRack);
router.put('/layout/racks/:id',             updateLayoutRack);

export default router;

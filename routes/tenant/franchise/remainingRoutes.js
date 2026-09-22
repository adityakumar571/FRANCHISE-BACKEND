/* All remaining franchise routes in one file for simplicity */
import express from 'express';
import {
  getMedicines, createMedicine, updateMedicine, getMedicineById, toggleMedicineStatus,
  getMedicineBatches, getAlternatives, getMedicineBarcode, getGenericMapping,
  getRackManagement, assignMedicineRack,
  // New medicine routes
  getMedicineMeta, getMedicineGenericMapping, deleteGenericMapping, deleteAlternative,
  getMedicineImages, uploadMedicineImage, deleteMedicineImage, setPrimaryMedicineImage,
} from '../../../controllers/tenant/franchise/medicineController.js';

import {
  getSuppliers, createSupplier, updateSupplier, getSupplierById,
  getSupplierLedger, getSupplierOutstanding, getPaymentHistory, recordPayment,
  // New supplier routes (path-alias fix)
  getSupplierPayments, recordSupplierPayment,
} from '../../../controllers/tenant/franchise/supplierController.js';

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

// ── Medicines ─────────────────────────────────────────────────────────────────
router.get('/medicines/meta',               getMedicineMeta);         // ← NEW: dropdown data
router.get('/medicines',                    getMedicines);
router.post('/medicines',                   createMedicine);
router.put('/medicines/:id',                updateMedicine);
router.get('/medicines/:id',                getMedicineById);
router.patch('/medicines/:id/status',       toggleMedicineStatus);
router.get('/medicines/:id/batches',        getMedicineBatches);
router.get('/medicines/:id/alternatives',   getAlternatives);
router.delete('/medicines/:id/alternatives/:altId', deleteAlternative);  // ← NEW
router.get('/medicines/:id/barcode',        getMedicineBarcode);
router.get('/medicines/:id/generic',        getMedicineGenericMapping);  // ← NEW
router.delete('/medicines/:id/generic/:brandId', deleteGenericMapping);  // ← NEW
router.get('/medicines/:id/images',         getMedicineImages);           // ← NEW
router.post('/medicines/:id/images',        uploadMedicineImage);         // ← NEW
router.delete('/medicines/:id/images/:imageId', deleteMedicineImage);    // ← NEW
router.post('/medicines/:id/images/:imageId/set-primary', setPrimaryMedicineImage); // ← NEW
router.get('/generic-mapping',              getGenericMapping);
router.get('/rack-management',              getRackManagement);
router.put('/rack-management/:rackId',      assignMedicineRack);

// ── Suppliers ─────────────────────────────────────────────────────────────────
router.get('/suppliers',                    getSuppliers);
router.post('/suppliers',                   createSupplier);
router.put('/suppliers/:id',                updateSupplier);
router.get('/suppliers/:id',                getSupplierById);
router.get('/suppliers/:id/ledger',         getSupplierLedger);
router.get('/suppliers/:id/outstanding',    getSupplierOutstanding);
router.get('/suppliers/:id/payment-history',getPaymentHistory);
router.post('/suppliers/:id/payment',       recordPayment);
router.get('/suppliers/:id/payments',       getSupplierPayments);     // ← NEW: path alias
router.post('/suppliers/:id/payments',      recordSupplierPayment);   // ← NEW: path alias

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

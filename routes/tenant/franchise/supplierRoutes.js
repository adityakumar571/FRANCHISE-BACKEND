/* eslint-disable */
import express from 'express';
import * as supplierController from '../../../controllers/tenant/franchise/supplierController.js';

const router = express.Router();

// GET /api/franchise/suppliers - Get all suppliers with pagination and filters
router.get('/', supplierController.getSuppliers);

// POST /api/franchise/suppliers - Create new supplier
router.post('/', supplierController.createSupplier);

// GET /api/franchise/suppliers/:id - Get supplier details
router.get('/:id', supplierController.getSupplierById);

// PUT /api/franchise/suppliers/:id - Update supplier
router.put('/:id', supplierController.updateSupplier);

// GET /api/franchise/suppliers/:id/ledger - Get supplier ledger
router.get('/:id/ledger', supplierController.getSupplierLedger);

// GET /api/franchise/suppliers/:id/outstanding - Get supplier outstanding balance
router.get('/:id/outstanding', supplierController.getSupplierOutstanding);

// GET /api/franchise/suppliers/:id/payments - Get supplier payment history
router.get('/:id/payments', supplierController.getSupplierPayments);

// POST /api/franchise/suppliers/:id/payments - Record supplier payment
router.post('/:id/payments', supplierController.recordSupplierPayment);

// POST /api/franchise/suppliers/:id/login-as - Direct login to supplier portal
router.post('/:id/login-as', supplierController.supplierDirectLogin);

// POST /api/franchise/suppliers/login - Supplier password-based login
router.post('/login', supplierController.supplierLogin);

// ═══════════════════════════════════════════════════════════════════════════
// SUPPLIER ORDER MANAGEMENT ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/franchise/suppliers/orders - Get all orders for supplier
router.get('/orders', supplierController.getSupplierOrders);

// GET /api/franchise/suppliers/orders/analytics - Get order analytics
router.get('/orders/analytics', supplierController.getSupplierOrderAnalytics);

// POST /api/franchise/suppliers/orders - Create new order
router.post('/orders', supplierController.createSupplierOrder);

// GET /api/franchise/suppliers/orders/:id - Get order details
router.get('/orders/:id', supplierController.getSupplierOrderById);

// PUT /api/franchise/suppliers/orders/:id/status - Update order status
router.put('/orders/:id/status', supplierController.updateOrderStatus);

// GET /api/franchise/suppliers/dashboard/stats - Dashboard statistics
router.get('/dashboard/stats', supplierController.getSupplierDashboardStats);

export default router;

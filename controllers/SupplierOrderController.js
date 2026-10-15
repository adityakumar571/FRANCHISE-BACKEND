/* eslint-disable */
import { asyncHandler } from '../utils/asyncHandler.js';
import { apiResponse } from '../utils/apiResponse.js';
import mongoose from 'mongoose';
import { getTenantDB } from '../utils/dbManager.js';
import Tenant from '../models/Tenant.model.js';

// Suppliers are global and POs are in tenant DBs - we query across all tenant databases

// ────────────────────────────────────────────────────────────────────────────
// GET /api/suppliers/orders - Get all orders for logged-in supplier (cross-database)
// ────────────────────────────────────────────────────────────────────────────
export const getSupplierOrders = asyncHandler(async (req, res) => {
  const supplierId = req.supplier?._id?.toString();
  
  if (!supplierId) {
    console.error('❌ No supplier ID found in request');
    return res.status(401).json(new apiResponse(401, null, 'Supplier not authenticated'));
  }

  const { status = '', search = '', page = 1, limit = 20, fromDate, toDate } = req.query;

  console.log('📦 Fetching orders for supplier:', supplierId);
  console.log('📦 Supplier details:', {
    id: supplierId,
    idType: typeof supplierId,
    name: req.supplier?.companyName,
    email: req.supplier?.email
  });
  console.log('📦 Filters:', {
    status,
    search,
    fromDate,
    toDate,
    page,
    limit
  });

  try {
    // Get all active tenants
    const tenants = await Tenant.find({ 
      isActive: true,
      dbUri: { $exists: true, $ne: null }
    }).select('subdomain dbUri franchiseDetails schoolName').lean();

    console.log(`🔍 Searching ${tenants.length} tenant databases for supplier orders...`);

    // Query each tenant database for purchase orders
    const allOrders = [];
    
    for (const tenant of tenants) {
      try {
        const tenantDb = await getTenantDB(tenant.dbUri);
        
        if (!tenantDb) {
          console.log(`⚠️ Could not connect to tenant DB: ${tenant.subdomain}`);
          continue;
        }

        // Dynamic model for this tenant's DB
        const PurchaseOrder = tenantDb.model(
          'PurchaseOrder',
          new mongoose.Schema({}, { strict: false }),
          'purchaseorders'
        );

        // Build query - supplierId can be either string or ObjectId in DB
        const filter = { 
          $or: [
            { supplierId: supplierId },
            { supplierId: new mongoose.Types.ObjectId(supplierId) }
          ]
        };
        
        // Status filter
        if (status) filter.status = status;
        
        // Date range filter
        if (fromDate || toDate) {
          filter.createdAt = {};
          if (fromDate) {
            const startDate = new Date(fromDate);
            startDate.setHours(0, 0, 0, 0);
            filter.createdAt.$gte = startDate;
          }
          if (toDate) {
            const endDate = new Date(toDate);
            endDate.setHours(23, 59, 59, 999);
            filter.createdAt.$lte = endDate;
          }
        }
        
        // Search filter
        if (search) {
          filter.$and = [
            { $or: filter.$or },
            {
              $or: [
                { poNo: new RegExp(search, 'i') },
                { supplier: new RegExp(search, 'i') }
              ]
            }
          ];
          delete filter.$or;
        }

        const orders = await PurchaseOrder.find(filter).sort({ createdAt: -1 }).lean();

        // DEBUG: Log first order's supplierId type
        if (orders.length > 0) {
          console.log(`  📋 Sample order in ${tenant.subdomain}:`, {
            poNo: orders[0].poNo,
            supplierIdInDB: orders[0].supplierId,
            supplierIdType: typeof orders[0].supplierId,
            supplierName: orders[0].supplier,
            createdAt: orders[0].createdAt,
            createdAtType: typeof orders[0].createdAt,
            expectedDate: orders[0].expectedDate,
          });
        }

        // Add franchise context to each order
        orders.forEach(order => {
          order.franchiseSubdomain = tenant.subdomain;
          order.franchiseName = tenant.franchiseDetails?.name || tenant.subdomain;
          order.franchiseId = tenant._id;
        });

        allOrders.push(...orders);
        console.log(`  ✓ Found ${orders.length} orders in ${tenant.subdomain}`);
      } catch (dbError) {
        console.error(`⚠️ Error querying tenant ${tenant.subdomain}:`, dbError.message);
        // Continue to next tenant even if one fails
      }
    }

    console.log(`✅ Total orders found: ${allOrders.length}`);

    // Sort all orders by date (most recent first) - handle invalid dates
    allOrders.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      // If invalid date, treat as 0 (oldest)
      return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
    });

    // Apply pagination
    const skip = (Number(page) - 1) * Number(limit);
    const paginatedOrders = allOrders.slice(skip, skip + Number(limit));

    // Format orders for response
    const result = paginatedOrders.map(o => {
      // Safe date formatting - handle invalid dates
      const formatDate = (date) => {
        if (!date) return null;
        try {
          const d = new Date(date);
          if (isNaN(d.getTime())) return null; // Invalid date
          return d.toISOString().split('T')[0];
        } catch (e) {
          return null;
        }
      };

      return {
        _id: o._id,
        poNo: o.poNo,
        franchiseName: o.franchiseName,
        franchiseSubdomain: o.franchiseSubdomain,
        items: o.items?.length || 0,
        totalAmount: o.totalAmount || 0,
        status: o.status || 'pending',
        expectedDate: formatDate(o.expectedDate),
        createdAt: formatDate(o.createdAt),
        notes: o.notes || '',
      };
    });

    return res.status(200).json(new apiResponse(200, {
      orders: result,
      total: allOrders.length,
      totalPages: Math.ceil(allOrders.length / Number(limit)),
      currentPage: Number(page),
    }, 'Orders fetched successfully'));
  } catch (err) {
    console.error('❌ Error fetching supplier orders:', err);
    return res.status(500).json(new apiResponse(500, null, err.message));
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/suppliers/orders/:id - Get single order details (cross-database)
// ────────────────────────────────────────────────────────────────────────────
export const getOrderById = asyncHandler(async (req, res) => {
  const supplierId = req.supplier?._id?.toString();
  const orderId = req.params.id;

  if (!supplierId) {
    return res.status(401).json(new apiResponse(401, null, 'Not authenticated'));
  }

  try {
    // Get all active tenants
    const tenants = await Tenant.find({ 
      isActive: true,
      dbUri: { $exists: true, $ne: null }
    }).select('subdomain dbUri franchiseDetails schoolName').lean();

    // Search for the order across all tenant databases
    for (const tenant of tenants) {
      try {
        const tenantDb = await getTenantDB(tenant.dbUri);
        if (!tenantDb) continue;

        const PurchaseOrder = tenantDb.model(
          'PurchaseOrder',
          new mongoose.Schema({}, { strict: false }),
          'purchaseorders'
        );
        
        const order = await PurchaseOrder.findOne({ 
          _id: orderId, 
          $or: [
            { supplierId: supplierId },
            { supplierId: new mongoose.Types.ObjectId(supplierId) }
          ]
        }).lean();

        if (order) {
          // Add franchise context
          order.franchiseSubdomain = tenant.subdomain;
          order.franchiseName = tenant.franchiseDetails?.name || tenant.subdomain;
          order.franchiseId = tenant._id;

          console.log('✅ Order details found:', order.poNo);
          return res.status(200).json(new apiResponse(200, order, 'Order details fetched'));
        }
      } catch (dbError) {
        console.error(`⚠️ Error in tenant ${tenant.subdomain}:`, dbError.message);
      }
    }

    return res.status(404).json(new apiResponse(404, null, 'Order not found'));
  } catch (err) {
    console.error('❌ Error fetching order details:', err);
    return res.status(500).json(new apiResponse(500, null, err.message));
  }
});

// ────────────────────────────────────────────────────────────────────────────
// PUT /api/suppliers/orders/:id/status - Update order status (Accept/Reject) (cross-database)
// ────────────────────────────────────────────────────────────────────────────
export const updateOrderStatus = asyncHandler(async (req, res) => {
  const supplierId = req.supplier?._id?.toString();
  const orderId = req.params.id;
  const { status, rejectionReason } = req.body;

  if (!supplierId) {
    return res.status(401).json(new apiResponse(401, null, 'Not authenticated'));
  }

  console.log('📝 Updating order status:', { orderId, status, rejectionReason, supplierId });

  // Validate status - allow more transitions
  const validStatuses = ['pending', 'accepted', 'rejected', 'processing', 'dispatched', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json(new apiResponse(400, null, `Invalid status. Must be one of: ${validStatuses.join(', ')}`));
  }

  try {
    // Get all active tenants
    const tenants = await Tenant.find({ 
      accountStatus: 'Active',  // ✅ FIXED: Use accountStatus
      dbUri: { $exists: true, $ne: null }
    }).select('subdomain dbUri').lean();

    const updateData = { 
      status,
      updatedAt: new Date()
    };

    if (status === 'rejected' && rejectionReason) {
      updateData.rejectionReason = rejectionReason;
    }

    if (status === 'accepted') {
      updateData.acceptedAt = new Date();
    }

    // Search for the order across all tenant databases
    for (const tenant of tenants) {
      try {
        const tenantDb = await getTenantDB(tenant.dbUri);
        if (!tenantDb) continue;

        const PurchaseOrder = tenantDb.model(
          'PurchaseOrder',
          new mongoose.Schema({}, { strict: false }),
          'purchaseorders'
        );

        const order = await PurchaseOrder.findOneAndUpdate(
          { 
            _id: orderId, 
            $or: [
              { supplierId: supplierId },
              { supplierId: new mongoose.Types.ObjectId(supplierId) }
            ]
            // ✅ REMOVED: status: 'pending' restriction - allow updating any status
          },
          updateData,
          { new: true }
        );

        if (order) {
          console.log('✅ Order status updated:', order.poNo, 'from', order.status, 'to', status);
          return res.status(200).json(new apiResponse(200, {
            _id: order._id,
            poNo: order.poNo,
            status: order.status,
            updatedAt: order.updatedAt
          }, `Order ${status} successfully`));
        }
      } catch (dbError) {
        console.error(`⚠️ Error in tenant ${tenant.subdomain}:`, dbError.message);
      }
    }

    console.log('❌ Order not found with ID:', orderId, 'for supplier:', supplierId);
    return res.status(404).json(new apiResponse(404, null, 'Order not found or you do not have permission to update this order'));
  } catch (err) {
    console.error('❌ Error updating order status:', err);
    return res.status(500).json(new apiResponse(500, null, err.message));
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/suppliers/orders/:id/dispatch - Mark order as dispatched (cross-database)
// ────────────────────────────────────────────────────────────────────────────
export const dispatchOrder = asyncHandler(async (req, res) => {
  const supplierId = req.supplier?._id?.toString();
  const orderId = req.params.id;
  const { trackingNumber, courierName, expectedDelivery, notes } = req.body;

  if (!supplierId) {
    return res.status(401).json(new apiResponse(401, null, 'Not authenticated'));
  }

  console.log('📦 Dispatching order:', { orderId, trackingNumber, courierName });

  try {
    // Get all active tenants
    const tenants = await Tenant.find({ 
      accountStatus: 'Active',  // ✅ FIXED: Use accountStatus
      dbUri: { $exists: true, $ne: null }
    }).select('subdomain dbUri').lean();

    // Search for the order across all tenant databases
    for (const tenant of tenants) {
      try {
        const tenantDb = await getTenantDB(tenant.dbUri);
        if (!tenantDb) continue;

        const PurchaseOrder = tenantDb.model(
          'PurchaseOrder',
          new mongoose.Schema({}, { strict: false }),
          'purchaseorders'
        );

        const order = await PurchaseOrder.findOneAndUpdate(
          { 
            _id: orderId, 
            $or: [
              { supplierId: supplierId },
              { supplierId: new mongoose.Types.ObjectId(supplierId) }
            ],
            status: 'accepted'
          },
          {
            status: 'dispatched',
            dispatchedAt: new Date(),
            trackingNumber,
            courierName,
            expectedDeliveryDate: expectedDelivery ? new Date(expectedDelivery) : undefined,
            dispatchNotes: notes,
            updatedAt: new Date()
          },
          { new: true }
        );

        if (order) {
          console.log('✅ Order dispatched:', order.poNo);
          return res.status(200).json(new apiResponse(200, {
            _id: order._id,
            poNo: order.poNo,
            status: order.status,
            trackingNumber: order.trackingNumber
          }, 'Order dispatched successfully'));
        }
      } catch (dbError) {
        console.error(`⚠️ Error in tenant ${tenant.subdomain}:`, dbError.message);
      }
    }

    return res.status(404).json(new apiResponse(404, null, 'Order not found or not in accepted status'));
  } catch (err) {
    console.error('❌ Error dispatching order:', err);
    return res.status(500).json(new apiResponse(500, null, err.message));
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/suppliers/dashboard/stats - Supplier dashboard statistics (cross-database)
// ────────────────────────────────────────────────────────────────────────────
export const getSupplierDashboardStats = asyncHandler(async (req, res) => {
  const supplierId = req.supplier?._id?.toString();

  if (!supplierId) {
    return res.status(401).json(new apiResponse(401, null, 'Not authenticated'));
  }

  console.log('📊 Fetching dashboard stats for supplier:', supplierId);

  try {
    // Get all active tenants
    const tenants = await Tenant.find({ 
      accountStatus: 'Active',
      dbUri: { $exists: true, $ne: null }
    }).select('subdomain dbUri franchiseDetails').lean();

    let pendingOrders = 0;
    let acceptedOrders = 0;
    let dispatchedOrders = 0;
    let completedOrders = 0;
    let totalRevenue = 0;
    let currentMonthOrders = 0;
    let currentMonthRevenue = 0;
    let lastMonthOrders = 0;
    let lastMonthRevenue = 0;
    const recentOrders = [];

    // Get current month date range
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    // Aggregate stats from all tenant databases
    for (const tenant of tenants) {
      try {
        const tenantDb = await getTenantDB(tenant.dbUri);
        if (!tenantDb) continue;

        const PurchaseOrder = tenantDb.model(
          'PurchaseOrder',
          new mongoose.Schema({}, { strict: false }),
          'purchaseorders'
        );

        const supplierFilter = {
          $or: [
            { supplierId: supplierId },
            { supplierId: new mongoose.Types.ObjectId(supplierId) }
          ]
        };

        // Count by status
        const [pending, accepted, dispatched, completed] = await Promise.all([
          PurchaseOrder.countDocuments({ ...supplierFilter, status: 'pending' }),
          PurchaseOrder.countDocuments({ ...supplierFilter, status: 'accepted' }),
          PurchaseOrder.countDocuments({ ...supplierFilter, status: 'dispatched' }),
          PurchaseOrder.countDocuments({ ...supplierFilter, status: { $in: ['completed', 'delivered'] } })
        ]);

        pendingOrders += pending;
        acceptedOrders += accepted;
        dispatchedOrders += dispatched;
        completedOrders += completed;

        // Current month stats
        const currentMonthData = await PurchaseOrder.aggregate([
          { 
            $match: { 
              ...supplierFilter,
              createdAt: { $gte: currentMonthStart },
              status: { $in: ['accepted', 'dispatched', 'completed', 'delivered'] }
            } 
          },
          { 
            $group: { 
              _id: null, 
              count: { $sum: 1 },
              total: { $sum: '$totalAmount' } 
            } 
          }
        ]);

        if (currentMonthData.length > 0) {
          currentMonthOrders += currentMonthData[0].count || 0;
          currentMonthRevenue += currentMonthData[0].total || 0;
        }

        // Last month stats for growth calculation
        const lastMonthData = await PurchaseOrder.aggregate([
          { 
            $match: { 
              ...supplierFilter,
              createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
              status: { $in: ['accepted', 'dispatched', 'completed', 'delivered'] }
            } 
          },
          { 
            $group: { 
              _id: null, 
              count: { $sum: 1 },
              total: { $sum: '$totalAmount' } 
            } 
          }
        ]);

        if (lastMonthData.length > 0) {
          lastMonthOrders += lastMonthData[0].count || 0;
          lastMonthRevenue += lastMonthData[0].total || 0;
        }

        // Total revenue (all time)
        const revenue = await PurchaseOrder.aggregate([
          { 
            $match: { 
              ...supplierFilter,
              status: { $in: ['accepted', 'dispatched', 'completed', 'delivered'] } 
            } 
          },
          { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]);

        totalRevenue += revenue[0]?.total || 0;

        // Recent orders (top 5 from this tenant)
        const recent = await PurchaseOrder.find(supplierFilter)
          .sort({ createdAt: -1 })
          .limit(5)
          .lean();

        recent.forEach(order => {
          recentOrders.push({
            _id: order._id,
            orderId: order.poNo,
            franchiseName: tenant.franchiseDetails?.name || tenant.subdomain,
            franchiseCode: tenant.subdomain,
            createdAt: order.createdAt,
            products: order.items || [],
            totalAmount: order.totalAmount || 0,
            status: order.status || 'pending'
          });
        });

      } catch (dbError) {
        console.error(`⚠️ Error in tenant ${tenant.subdomain}:`, dbError.message);
      }
    }

    // Calculate growth percentages
    const orderGrowth = lastMonthOrders > 0 
      ? Math.round(((currentMonthOrders - lastMonthOrders) / lastMonthOrders) * 100)
      : currentMonthOrders > 0 ? 100 : 0;

    const revenueGrowth = lastMonthRevenue > 0
      ? Math.round(((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
      : currentMonthRevenue > 0 ? 100 : 0;

    // Sort recent orders by date and take top 10
    recentOrders.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });

    const stats = {
      pendingOrders,
      acceptedOrders,
      dispatchedOrders,
      completedOrders,
      totalRevenue,
      currentMonth: {
        orders: currentMonthOrders,
        revenue: currentMonthRevenue
      },
      growth: {
        orders: orderGrowth,
        revenue: revenueGrowth
      },
      recentOrders: recentOrders.slice(0, 10)
    };

    console.log('✅ Dashboard stats calculated:', {
      pending: pendingOrders,
      accepted: acceptedOrders,
      dispatched: dispatchedOrders,
      currentMonthOrders,
      currentMonthRevenue,
      recentOrdersCount: stats.recentOrders.length
    });

    return res.status(200).json(new apiResponse(200, stats, 'Dashboard stats fetched'));
  } catch (err) {
    console.error('❌ Error fetching dashboard stats:', err);
    return res.status(500).json(new apiResponse(500, null, err.message));
  }
});

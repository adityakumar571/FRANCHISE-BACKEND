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

  const { status = '', search = '', page = 1, limit = 20 } = req.query;

  console.log('📦 Fetching orders for supplier:', supplierId);
  console.log('📦 Supplier details:', {
    id: supplierId,
    name: req.supplier?.companyName,
    email: req.supplier?.email
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
        if (status) filter.status = status;
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

    // Sort all orders by date (most recent first)
    allOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Apply pagination
    const skip = (Number(page) - 1) * Number(limit);
    const paginatedOrders = allOrders.slice(skip, skip + Number(limit));

    // Format orders for response
    const result = paginatedOrders.map(o => ({
      _id: o._id,
      poNo: o.poNo,
      franchiseName: o.franchiseName,
      franchiseSubdomain: o.franchiseSubdomain,
      items: o.items?.length || 0,
      totalAmount: o.totalAmount,
      status: o.status,
      expectedDate: o.expectedDate ? new Date(o.expectedDate).toISOString().split('T')[0] : null,
      createdAt: new Date(o.createdAt).toISOString().split('T')[0],
      notes: o.notes,
    }));

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

  console.log('📝 Updating order status:', { orderId, status, rejectionReason });

  // Validate status
  const validStatuses = ['accepted', 'rejected'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json(new apiResponse(400, null, 'Invalid status. Must be accepted or rejected'));
  }

  try {
    // Get all active tenants
    const tenants = await Tenant.find({ 
      status: 'Active',
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
            ],
            status: 'pending'
          },
          updateData,
          { new: true }
        );

        if (order) {
          console.log('✅ Order status updated:', order.poNo, status);
          return res.status(200).json(new apiResponse(200, {
            _id: order._id,
            poNo: order.poNo,
            status: order.status
          }, `Order ${status} successfully`));
        }
      } catch (dbError) {
        console.error(`⚠️ Error in tenant ${tenant.subdomain}:`, dbError.message);
      }
    }

    return res.status(404).json(new apiResponse(404, null, 'Order not found or already processed'));
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
      status: 'Active',
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

  try {
    // Get all active tenants
    const tenants = await Tenant.find({ 
      status: 'Active',
      dbUri: { $exists: true, $ne: null }
    }).select('subdomain dbUri').lean();

    let totalPending = 0;
    let totalAccepted = 0;
    let totalDispatched = 0;
    let totalRevenue = 0;

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

        const [pending, accepted, dispatched, revenue] = await Promise.all([
          PurchaseOrder.countDocuments({ 
            $or: [
              { supplierId: supplierId },
              { supplierId: new mongoose.Types.ObjectId(supplierId) }
            ],
            status: 'pending' 
          }),
          PurchaseOrder.countDocuments({ 
            $or: [
              { supplierId: supplierId },
              { supplierId: new mongoose.Types.ObjectId(supplierId) }
            ],
            status: 'accepted' 
          }),
          PurchaseOrder.countDocuments({ 
            $or: [
              { supplierId: supplierId },
              { supplierId: new mongoose.Types.ObjectId(supplierId) }
            ],
            status: 'dispatched' 
          }),
          PurchaseOrder.aggregate([
            { 
              $match: { 
                $or: [
                  { supplierId: supplierId },
                  { supplierId: new mongoose.Types.ObjectId(supplierId) }
                ],
                status: { $in: ['accepted', 'dispatched', 'completed'] } 
              } 
            },
            { $group: { _id: null, total: { $sum: '$totalAmount' } } }
          ])
        ]);

        totalPending += pending;
        totalAccepted += accepted;
        totalDispatched += dispatched;
        totalRevenue += revenue[0]?.total || 0;
      } catch (dbError) {
        console.error(`⚠️ Error in tenant ${tenant.subdomain}:`, dbError.message);
      }
    }

    return res.status(200).json(new apiResponse(200, {
      pendingOrders: totalPending,
      acceptedOrders: totalAccepted,
      dispatchedOrders: totalDispatched,
      totalRevenue
    }, 'Dashboard stats fetched'));
  } catch (err) {
    console.error('❌ Error fetching dashboard stats:', err);
    return res.status(500).json(new apiResponse(500, null, err.message));
  }
});

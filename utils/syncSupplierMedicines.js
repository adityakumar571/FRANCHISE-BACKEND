/* eslint-disable */
/**
 * Auto-sync Supplier Medicines to ALL Franchises
 * When supplier adds/updates medicine, it propagates to all tenant DBs
 */

import Tenant from '../models/tenant.model.js'
import mongoose from 'mongoose'
import { getLiveWholesaleRateModel } from '../models/tenant/franchise/LiveWholesaleRate.model.js'

/**
 * Sync a single medicine to all active franchises
 * @param {Object} supplier - Supplier object with _id and companyName
 * @param {Object} medicine - Medicine object from supplier.medicines array
 */
export async function syncMedicineToAllFranchises(supplier, medicine) {
  try {
    // Get all active franchises
    const franchises = await Tenant.find({ status: 'Active' })
    
    console.log(`[SYNC] Starting sync for medicine: ${medicine.name}`)
    console.log(`[SYNC] Target franchises: ${franchises.length}`)
    
    const syncPromises = franchises.map(async (franchise) => {
      try {
        // Connect to franchise DB
        const tenantDbName = `tenant_${franchise.subdomain}`
        const tenantConn = mongoose.createConnection(
          process.env.MONGO_URI.replace(/\/[^/]*$/, `/${tenantDbName}`),
          {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
          }
        )

        await new Promise((resolve, reject) => {
          tenantConn.once('open', resolve)
          tenantConn.once('error', reject)
          setTimeout(() => reject(new Error('Connection timeout')), 5000)
        })
        
        const LWR = getLiveWholesaleRateModel(tenantConn)
        
        // Calculate effective rate with GST
        const gstPercent = medicine.gstPercent || 12
        const gstAmount = (medicine.supplierPrice * gstPercent) / 100
        const effectiveRate = medicine.supplierPrice + gstAmount
        
        // Prepare medicine data for LiveWholesaleRate
        const liveRateData = {
          medicineId: medicine._id,
          medicineName: medicine.name,
          strength: medicine.strength || '',
          packSize: medicine.packSize || '',
          supplierId: supplier._id,
          supplierName: supplier.companyName,
          basicRate: medicine.supplierPrice,
          mrp: medicine.mrp,
          discountPct: medicine.discount || 0,
          scheme: medicine.scheme || 'No Scheme',
          gstPct: gstPercent,
          effectiveRate: Number(effectiveRate.toFixed(2)),
          stock: medicine.stock,
          deliveryDays: 2, // Default delivery time
          isActive: medicine.isAvailable,
          updatedAt: new Date()
        }
        
        // Upsert into LiveWholesaleRate
        await LWR.findOneAndUpdate(
          { 
            supplierId: supplier._id,
            medicineName: medicine.name,
            strength: medicine.strength || ''
          },
          liveRateData,
          { upsert: true, new: true }
        )
        
        await tenantConn.close()
        console.log(`[SYNC] ✓ Synced to ${franchise.subdomain}`)
        return { franchise: franchise.subdomain, success: true }
      } catch (err) {
        console.error(`[SYNC] ✗ Failed to sync to ${franchise.subdomain}:`, err.message)
        return { franchise: franchise.subdomain, success: false, error: err.message }
      }
    })
    
    const results = await Promise.allSettled(syncPromises)
    
    const summary = {
      total: franchises.length,
      successful: results.filter(r => r.status === 'fulfilled' && r.value.success).length,
      failed: results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length
    }
    
    console.log(`[SYNC] Complete! Success: ${summary.successful}/${summary.total}`)
    
    return summary
  } catch (error) {
    console.error('[SYNC] Error in syncMedicineToAllFranchises:', error)
    throw error
  }
}

/**
 * Sync all medicines from a supplier to all franchises
 * @param {Object} supplier - Full supplier object with medicines array
 */
export async function syncAllSupplierMedicines(supplier) {
  console.log(`[SYNC] Syncing all ${supplier.medicines.length} medicines from ${supplier.companyName}`)
  
  const results = []
  
  for (const medicine of supplier.medicines) {
    if (medicine.isAvailable) {
      const result = await syncMedicineToAllFranchises(supplier, medicine)
      results.push({ medicineName: medicine.name, ...result })
    }
  }
  
  console.log(`[SYNC] All medicines synced for supplier: ${supplier.companyName}`)
  return results
}

/**
 * Remove medicine from all franchises when supplier deletes it
 * @param {String} supplierId - Supplier ObjectId
 * @param {String} medicineName - Medicine name to remove
 */
export async function removeMedicineFromAllFranchises(supplierId, medicineName) {
  try {
    const franchises = await Tenant.find({ status: 'Active' })
    
    console.log(`[SYNC] Removing medicine: ${medicineName} from all franchises`)
    
    const removePromises = franchises.map(async (franchise) => {
      try {
        const tenantDbName = `tenant_${franchise.subdomain}`
        const tenantConn = mongoose.createConnection(
          process.env.MONGO_URI.replace(/\/[^/]*$/, `/${tenantDbName}`)
        )

        await new Promise((resolve, reject) => {
          tenantConn.once('open', resolve)
          tenantConn.once('error', reject)
          setTimeout(() => reject(new Error('Connection timeout')), 5000)
        })
        
        const LWR = getLiveWholesaleRateModel(tenantConn)
        
        // Mark as inactive instead of deleting (for historical data)
        await LWR.updateMany(
          { supplierId, medicineName },
          { isActive: false, updatedAt: new Date() }
        )
        
        await tenantConn.close()
        console.log(`[SYNC] ✓ Removed from ${franchise.subdomain}`)
      } catch (err) {
        console.error(`[SYNC] ✗ Failed to remove from ${franchise.subdomain}:`, err.message)
      }
    })
    
    await Promise.allSettled(removePromises)
    console.log(`[SYNC] Medicine removal complete`)
  } catch (error) {
    console.error('[SYNC] Error removing medicine:', error)
  }
}

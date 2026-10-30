/**
 * Setup Routes - One-time setup endpoints
 * Run once to create Super Admin in production
 */
import express from 'express';
import bcrypt from 'bcrypt';
import User from '../models/user.modal.js';

const router = express.Router();

/**
 * POST /api/setup/create-superadmin
 * One-time endpoint to create Super Admin
 * Protect with a secret key
 */
router.post('/create-superadmin', async (req, res) => {
  try {
    const { secret } = req.body;
    
    // Verify secret key (change this in production!)
    const SETUP_SECRET = process.env.SETUP_SECRET || 'change-me-in-production-2024';
    
    if (secret !== SETUP_SECRET) {
      return res.status(403).json({ 
        success: false, 
        message: 'Invalid setup secret' 
      });
    }

    // Check if Super Admin already exists
    const existing = await User.findOne({ userId: 'superadmin' });
    
    if (existing) {
      // Update password if exists
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('SuperAdmin@123', salt);
      
      await User.updateOne(
        { userId: 'superadmin' },
        { $set: { password: hashedPassword, isActive: true } }
      );
      
      return res.status(200).json({
        success: true,
        message: 'Super Admin password updated',
        userId: 'superadmin'
      });
    }

    // Create new Super Admin
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('SuperAdmin@123', salt);
    
    const superAdmin = await User.create({
      userId: 'superadmin',
      password: hashedPassword,
      name: 'Super Admin',
      email: 'superadmin@cloudxsupport.com',
      phone: '+919999999999',
      gender: 'Male',
      role: 'SuperAdmin',
      isActive: true
    });

    return res.status(201).json({
      success: true,
      message: 'Super Admin created successfully!',
      user: {
        userId: superAdmin.userId,
        role: superAdmin.role,
        email: superAdmin.email
      },
      credentials: {
        userId: 'superadmin',
        password: 'SuperAdmin@123'
      }
    });

  } catch (error) {
    console.error('Setup error:', error);
    return res.status(500).json({
      success: false,
      message: 'Setup failed: ' + error.message
    });
  }
});

export default router;

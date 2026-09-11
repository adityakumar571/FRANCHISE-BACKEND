import mongoose from 'mongoose';

const FranchiseSettingsSchema = new mongoose.Schema({
  tenantId:    { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  businessProfile: {
    storeName:    { type: String, trim: true },
    storeCode:    { type: String, trim: true },
    phone:        { type: String, trim: true },
    email:        { type: String, trim: true },
    address:      { type: String, trim: true },
    gstin:        { type: String, trim: true },
    drugLicense:  { type: String, trim: true },
    logo:         { type: String, trim: true },
  },
  notifications: {
    lowStock:      { type: Boolean, default: true },
    expiry:        { type: Boolean, default: true },
    orderStatus:   { type: Boolean, default: true },
    subscription:  { type: Boolean, default: true },
    dayClose:      { type: Boolean, default: false },
    staffLogin:    { type: Boolean, default: false },
  },
  printing: {
    invoiceHeader: { type: String, trim: true },
    invoiceFooter: { type: String, trim: true },
    paperSize:     { type: String, enum: ['A4', 'A5', 'Thermal 80mm'], default: 'A4' },
    showLogo:      { type: Boolean, default: true },
    showGSTIN:     { type: Boolean, default: true },
    showDrugLicense:{ type: Boolean, default: true },
    autoPrint:     { type: Boolean, default: false },
  },
  preferences: {
    currency:    { type: String, default: 'INR' },
    dateFormat:  { type: String, default: 'DD/MM/YYYY' },
    timezone:    { type: String, default: 'Asia/Kolkata' },
    language:    { type: String, default: 'English' },
    theme:       { type: String, enum: ['Light', 'Dark', 'Auto'], default: 'Light' },
  },
}, { timestamps: true });

export const getFranchiseSettingsModel = (connection) => {
  try { return connection.model('FranchiseSettings'); }
  catch { return connection.model('FranchiseSettings', FranchiseSettingsSchema); }
};

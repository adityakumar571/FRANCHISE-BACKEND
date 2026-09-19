import mongoose from "mongoose";

const siteSettingsSchema = new mongoose.Schema(
    {
        // ── General ───────────────────────────────────────────
        platformName:  { type: String, default: "FranchizeAll" },
        adminEmail:    { type: String, default: "admin@franchizeall.com" },
        supportEmail:  { type: String, default: "cloudxsupport@gmail.com" },
        phone:         { type: String, default: "9838075493" },
        address:       { type: String, default: "Shaligram Building New, 167/101, Jiamau Rd, Chauraha, Hazratganj, Lucknow, Uttar Pradesh 226001" },
        timezone:      { type: String, default: "Asia/Kolkata" },
        currency:      { type: String, default: "INR (₹)" },

        // ── Web ───────────────────────────────────────────────
        siteUrl:           { type: String, default: "" },
        logoUrl:           { type: String, default: "" },
        faviconUrl:        { type: String, default: "" },
        maintenanceMode:   { type: Boolean, default: false },
        googleAnalytics:   { type: String, default: "" },

        // ── Email / SMTP ──────────────────────────────────────
        smtpHost:    { type: String, default: "smtp.gmail.com" },
        smtpPort:    { type: String, default: "587" },
        smtpUser:    { type: String, default: "" },
        smtpPass:    { type: String, default: "" },
        fromName:    { type: String, default: "FranchizeAll" },
        fromEmail:   { type: String, default: "noreply@franchizeall.com" },

        // ── Security ──────────────────────────────────────────
        sessionTimeout:    { type: Number, default: 30 },
        maxLoginAttempts:  { type: Number, default: 5 },
        minPasswordLength: { type: Number, default: 8 },
        auditRetentionDays:{ type: Number, default: 90 },
        force2FA:          { type: Boolean, default: false },
        ipWhitelist:       { type: String, default: "" },

        // ── Notifications ─────────────────────────────────────
        notifyEmail:            { type: String, default: "" },
        expiryAlertDays:        { type: Number, default: 7 },
        notifyExpiryEmail:      { type: Boolean, default: true },
        notifyExpirySms:        { type: Boolean, default: true },
        notifyNewFranchise:     { type: Boolean, default: true },
        notifySupplierOnboard:  { type: Boolean, default: false },
        notifyLowStock:         { type: Boolean, default: true },
        notifyAuditAlert:       { type: Boolean, default: false },

        // ── Inventory Policy ──────────────────────────────────
        nearExpiryDays:  { type: Number,  default: 30 },
        lowStockThreshold:{ type: Number, default: 20 },
        fefo:            { type: Boolean, default: true },
        batchMandatory:  { type: Boolean, default: true },
        expiryMandatory: { type: Boolean, default: true },

        // ── Support ───────────────────────────────────────────
        whatsappNo:    { type: String, default: "" },
        ticketAutoClose:{ type: Number, default: 7 },
        slaHours:      { type: Number, default: 24 },

        // Singleton guard — only one document should ever exist
        _singleton: { type: Boolean, default: true, unique: true },
    },
    { timestamps: true }
);

const SiteSettings = mongoose.model("SiteSettings", siteSettingsSchema);
export default SiteSettings;

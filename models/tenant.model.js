
import mongoose from "mongoose";
import bcrypt from "bcrypt";

const tenantSchema = new mongoose.Schema(
    {
        schoolName: String,

        subdomain: {
            type: String,
            unique: true,
        },

        dbUri: String,

        // ── Franchise Fields ─────────────────────────────────────
        franchiseCode: {
            type: String,
            unique: true,
            sparse: true,
        },
        businessType: {
            type: String,
            enum: ["Pharmacy", "Medical Store", "Clinic", "Hospital", "Other"],
        },
        gstNo: {
            type: String,
        },

        // Franchise Admin Info (stored for display in Super Admin)
        franchiseAdminName: {
            type: String,
        },
        franchiseAdminEmail: {
            type: String,
            trim: true,
            lowercase: true,
        },
        franchiseAdminPhone: {
            type: String,
        },

        // Account status (extended)
        accountStatus: {
            type: String,
            enum: ["Active", "Inactive", "Suspended", "Pending"],
            default: "Active",
        },

        // ── Portal Login ─────────────────────────────────────────
        portalPassword: {
            type: String,   // bcrypt hashed
            select: false,  // never returned by default
        },
        portalOtp: String,
        portalOtpExpiry: Date,

        // ================= OLD FIELDS =================
        logo: String,

        description: String,

        // Contact
        schoolContact: {
            type: String,
        },
        schoolContactAlt: {
            type: String,
        },
        schoolEmail: {
            type: String,
        },

        // Codes & IDs
        schoolCode: {
            type: String,
        },
        affiliationNo: {
            type: String,
        },
        estNo: {
            type: String,
        },
        estd: {
            type: String,   // Establishment year e.g. "1983"
        },

        // Address
        schoolAddress: {
            type: String,
        },
        schoolAddressLine1: {
            type: String,
        },
        schoolAddressLine2: {
            type: String,
        },
        schoolAddressLine3: {
            type: String,
        },

        // Address fields (from Edit School form)
        addressLine1: {
            type: String,
        },
        city: {
            type: String,
        },
        state: {
            type: String,
        },
        country: {
            type: String,
        },
        pincode: {
            type: String,
        },

        // Contact Persons
        contactPerson1: {
            name:        { type: String },
            designation: { type: String },
            contactNo:   { type: String },
            email:       { type: String },
        },
        contactPerson2: {
            name:        { type: String },
            designation: { type: String },
            contactNo:   { type: String },
            email:       { type: String },
        },

        // School details for certificates
        schoolSubtitle: {
            type: String,   // e.g. "Under the aegis of..."
        },
        schoolInfo: {
            type: String,   // e.g. "Affiliated to CBSE/ICSE/UP Board"
        },
        statusOfSchool: {
            type: String,
            default: "Secondary/Sr. Secondary",
        },

        // Payment gateway
        razorpayKey: {
            type: String,
        },

        razorpaySecret: {
            type: String,
        },

        isActive: {
            type: Boolean,
            default: true,
        },


        affiliationLine: {
            type: String,
        },

        schoolMedium: {
            type: String,
        },

        msmeRegNo: {
            type: String,
        },

        isoRegNo: {
            type: String,
        },

        regInfo: {
            type: String,
        },

        registrationNo: {
            type: String,   // School's Board/CBSE registration number
        },

        nitiAayog: {
            type: String,
        },

        managedBy: {
            type: String,
        },
    },
    { timestamps: true }
);

// Hash password before save — sirf tab jab portalPassword actually change hua ho
tenantSchema.pre("save", async function (next) {
    if (!this.isModified("portalPassword")) return next();
    if (!this.portalPassword) return next();
    try {
        this.portalPassword = await bcrypt.hash(this.portalPassword, 10);
    } catch (err) {
        return next(err);
    }
    next();
});

tenantSchema.methods.isPasswordCorrect = async function (password) {
    if (!this.portalPassword) return false;
    return bcrypt.compare(password, this.portalPassword);
};

export default mongoose.model("Tenant", tenantSchema);
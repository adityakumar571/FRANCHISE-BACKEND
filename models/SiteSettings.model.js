import mongoose from "mongoose";

const siteSettingsSchema = new mongoose.Schema(
    {
        phone:    { type: String, default: "9838075493" },
        email:    { type: String, default: "cloudxsupport@gmail.com" },
        address:  { type: String, default: "Shaligram Building New, 167/101, Jiamau Rd, Chauraha, Hazratganj, Lucknow, Uttar Pradesh 226001" },
        // Only one settings document should exist (singleton)
        _singleton: { type: Boolean, default: true, unique: true },
    },
    { timestamps: true }
);

const SiteSettings = mongoose.model("SiteSettings", siteSettingsSchema);
export default SiteSettings;

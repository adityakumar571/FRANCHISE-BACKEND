import { getInstallmentTypeModel } from "../models/tenant/master/InstallmentType.model.js";

const INSTALLMENT_TYPES = ["MONTHLY", "QUARTERLY", "CUSTOM_10"];

export const runTenantSeeders = async (db) => {
    try {
        const InstallmentType = getInstallmentTypeModel(db);

        for (const name of INSTALLMENT_TYPES) {
            const exists = await InstallmentType.findOne({ name });
            if (!exists) {
                // All types created as inactive by default — admin activates from UI
                await InstallmentType.create({ name, isActive: false });
            }
        }

        console.log(`✅ Tenant seeders done`);
    } catch (err) {
        console.error("❌ Tenant seeder error:", err.message);
    }
};

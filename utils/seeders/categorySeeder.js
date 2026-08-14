import { getCategoryMasterModel } from "../../models/tenant/master/categoryMaster.model.js";


export const seedCategories =
async (tenantDB) => {

    try {

        const Category =
        getCategoryMasterModel(
            tenantDB
        );

        // =========================
        // CHECK EXISTING
        // =========================

        const exists =
        await Category.countDocuments();

        if (exists > 0) {

            console.log(
                "⚠️ Categories Already Exist"
            );

            return;
        }

        // =========================
        // DEFAULT CATEGORIES
        // =========================

        const defaultCategories = [
            {
                name: "General",
                description:
                    "General Category",
                status: true,
            },
            {
                name: "OBC",
                description:
                    "Other Backward Class",
                status: true,
            },
            {
                name: "SC",
                description:
                    "Scheduled Caste",
                status: true,
            },
            {
                name: "ST",
                description:
                    "Scheduled Tribe",
                status: true,
            },
        ];

        // =========================
        // INSERT
        // =========================

        await Category.insertMany(
            defaultCategories
        );

        console.log(
            "✅ Categories Seeded Successfully"
        );

    } catch (error) {

        console.log(
            "❌ Category Seeder Error",
            error
        );

        throw error;
    }
};
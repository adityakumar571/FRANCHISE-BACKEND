import { seedCategories }
    from "./seeders/categorySeeder.js";

import { seedClasses }
    from "./seeders/classSeeder.js";

import { seedSections }
    from "./seeders/sectionSeeder.js";

import { seedStreams }
    from "./seeders/streamSeeder.js";

import { seedSubjects }
    from "./seeders/subjectSeeder.js";

import { seedDocuments }
    from "./seeders/documentSeeder.js";

import { seedExams }
    from "./seeders/examSeeder.js";

import { seedFeeStructures }
    from "./seeders/feeStructureSeeder.js";

import { seedAdditionalFees }
    from "./seeders/additionalFeeSeeder.js";

import { seedLateFeeSettings }
    from "./seeders/lateFeeSettingSeeder.js";
import { seedInstallmentTypes }
    from "./seeders/installmentTypeSeeder.js";


export const setupDefaultMasters =
    async (tenantDB) => {

        try {

            console.log(
                "🚀 Starting Default Masters Setup..."
            );

            // =========================
            // SESSION
            // =========================



            // =========================
            // CATEGORY
            // =========================

            await seedCategories(
                tenantDB
            );

            // =========================
            // CLASS
            // =========================

            await seedClasses(
                tenantDB
            );

            // =========================
            // SECTION
            // =========================

            await seedSections(
                tenantDB
            );

            // =========================
            // STREAM
            // =========================

            await seedStreams(
                tenantDB
            );

            // =========================
            // SUBJECT
            // =========================

            await seedSubjects(
                tenantDB
            );

            // =========================
            // DOCUMENT
            // =========================

            await seedDocuments(
                tenantDB
            );

            // =========================
            // EXAM
            // =========================

            await seedExams(
                tenantDB
            );

            // =========================
            // FEE STRUCTURE
            // =========================

            await seedInstallmentTypes(
                tenantDB
            );

            // ✅ AFTER INSTALLMENT TYPES
            await seedFeeStructures(
                tenantDB
            );
            // =========================
            // ADDITIONAL FEES
            // =========================

            await seedAdditionalFees(
                tenantDB
            );

            // =========================
            // LATE FEE SETTINGS
            // =========================

            await seedLateFeeSettings(
                tenantDB
            );

            console.log(
                "✅ All Masters Seeded Successfully"
            );

        } catch (error) {

            console.log(
                "❌ Seeder Setup Error",
                error
            );

            throw error;
        }
    };
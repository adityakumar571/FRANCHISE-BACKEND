import { getLateFeeSettingModel } from "../../models/tenant/master/LateFeeSetting.model.js";

import { getSessionModel } from "../../models/tenant/master/Session.model.js";

export const seedLateFeeSettings =
    async (tenantDB) => {

        try {

            const LateFeeSetting =
                getLateFeeSettingModel(tenantDB);

            const Session =
                getSessionModel(tenantDB);

            // =========================
            // CHECK EXISTING
            // =========================

            const exists =
                await LateFeeSetting.countDocuments();

            if (exists > 0) {

                console.log(
                    "⚠️ Late Fee Settings Already Exist"
                );

                return;
            }

            // =========================
            // CURRENT SESSION
            // =========================

            const currentSession =
                await Session.findOne({
                    isCurrent: true
                });

            if (!currentSession) {

                console.log(
                    "❌ Current Session Not Found"
                );

                return;
            }

            // =========================
            // DEFAULT SETTING
            // =========================

            const defaultSetting = {

                sessionId:
                    currentSession._id,

                // =====================
                // LATE FEE CONFIG
                // =====================

                graceDays: 1,

                fineType: "PER_DAY",

                fineAmount: 100,

                maxFine: 500,

                isActive: true,

            };

            // =========================
            // INSERT
            // =========================

            await LateFeeSetting.create(
                defaultSetting
            );

            console.log(
                "✅ Late Fee Setting Seeded Successfully"
            );

        } catch (error) {

            console.log(
                "❌ Late Fee Seeder Error",
                error
            );

            throw error;
        }
    };
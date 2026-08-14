import { getAdditionalFeeModel } from "../../models/tenant/master/AdditionalFee.model.js";

import { getSessionModel } from "../../models/tenant/master/Session.model.js";

export const seedAdditionalFees =
    async (tenantDB) => {

        try {

            const AdditionalFee =
                getAdditionalFeeModel(tenantDB);

            const Session =
                getSessionModel(tenantDB);

            // =========================
            // CHECK EXISTING
            // =========================

            const exists =
                await AdditionalFee.countDocuments();

            if (exists > 0) {

                console.log(
                    "⚠️ Additional Fees Already Exist"
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
            // DEFAULT FEES
            // =========================

            const defaultFees = [

                {
                    feeName: "Admission Fee",

                    feeType: "ONE_TIME",

                    period: "APRIL",

                    amount: 5000,

                    dueDate: "2026-04-15",

                    isActive: true,
                },

                {
                    feeName: "Smart Class Fee",

                    feeType: "MONTH",

                    period: "APRIL",

                    amount: 500,

                    dueDate: "2026-04-15",

                    isActive: true,
                },

                {
                    feeName: "Tour Fee",

                    feeType: "ONE_TIME",

                    period: "NOVEMBER",

                    amount: 1000,

                    dueDate: "2026-11-15",

                    isActive: true,
                },

            ];
            // =========================
            // FINAL DATA
            // =========================

            const feeData =
                defaultFees.map((fee) => ({

                    sessionId:
                        currentSession._id,

                    classId: null,

                    streamId: null,

                    feeName:
                        fee.feeName,

                    feeType:
                        fee.feeType,

                    period:
                        fee.period,

                    amount:
                        fee.amount,

                    dueDate:
                        fee.dueDate,

                    isActive:
                        fee.isActive,

                }));

            // =========================
            // INSERT
            // =========================

            await AdditionalFee.insertMany(
                feeData
            );

            console.log(
                "✅ Additional Fees Seeded Successfully"
            );

        } catch (error) {

            console.log(
                "❌ Additional Fee Seeder Error",
                error
            );

            throw error;
        }
    };
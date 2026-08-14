import { getDocumentModel } from "../../models/tenant/master/documents.modal.js";

import { getSessionModel } from "../../models/tenant/master/Session.model.js";

export const seedDocuments = async (tenantDB) => {

    try {

        const Document =
            getDocumentModel(tenantDB);

        const Session =
            getSessionModel(tenantDB);

        // =========================
        // CHECK EXISTING
        // =========================

        const exists =
            await Document.countDocuments();

        if (exists > 0) {

            console.log(
                "⚠️ Documents Already Exist"
            );

            return;
        }

        // =========================
        // GET CURRENT SESSION
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
        // DEFAULT DOCUMENTS
        // =========================

        const defaultDocuments = [

            // =====================================
            // STUDENT DOCUMENTS
            // =====================================

            {
                name: "Aadhar Card",
                category: "Student",
                order: 1,
            },

            {
                name: "Birth Certificate",
                category: "Student",
                order: 2,
            },

            {
                name: "Transfer Certificate",
                category: "Student",
                order: 3,
            },

            {
                name: "Previous Marksheet",
                category: "Student",
                order: 4,
            },

            {
                name: "Passport Photo",
                category: "Student",
                order: 5,
            },

            {
                name: "Income Certificate",
                category: "Student",
                order: 6,
            },

            {
                name: "Caste Certificate",
                category: "Student",
                order: 7,
            },

            // =====================================
            // TEACHER DOCUMENTS
            // =====================================

            {
                name: "Aadhar Card",
                category: "Teacher",
                order: 8,
            },

            {
                name: "PAN Card",
                category: "Teacher",
                order: 9,
            },

            {
                name: "Resume",
                category: "Teacher",
                order: 10,
            },

            {
                name: "Qualification Certificate",
                category: "Teacher",
                order: 11,
            },

            {
                name: "Experience Certificate",
                category: "Teacher",
                order: 12,
            },

            {
                name: "Passport Photo",
                category: "Teacher",
                order: 13,
            },

            {
                name: "Joining Letter",
                category: "Teacher",
                order: 14,
            },


        ];

        // =========================
        // FINAL DATA
        // =========================

        const documentData =
            defaultDocuments.map((doc) => ({

                name: doc.name,

                category: doc.category,

                session: currentSession._id,

                order: doc.order,

                isActive: true,

            }));

        // =========================
        // INSERT DOCUMENTS
        // =========================

        await Document.insertMany(
            documentData
        );

        console.log(
            "✅ Documents Seeded Successfully"
        );

    } catch (error) {

        console.log(
            "❌ Document Seeder Error",
            error
        );

        throw error;
    }
};
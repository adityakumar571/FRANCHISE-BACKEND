import { getExamModel } from "../../models/tenant/master/Exam.model.js";
import { getSessionModel } from "../../models/tenant/master/Session.model.js";


export const seedExams =
async (tenantDB) => {

    try {

        const Exam =
        getExamModel(tenantDB);

        const Session =
        getSessionModel(tenantDB);

        // =========================
        // CHECK EXISTING
        // =========================

        const exists =
        await Exam.countDocuments();

        if (exists > 0) {

            console.log(
                "⚠️ Exams Already Exist"
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
        // DEFAULT EXAMS
        // =========================

        const defaultExams = [

            {
                examName: "Unit Test 1",
                category: "TEST",
                order: 1,
            },

            {
                examName: "Unit Test 2",
                category: "TEST",
                order: 2,
            },


            {
                examName: "Half Yearly Exam",
                category: "EXAM",
                order: 3,
            },
                 {
                examName: "Unit Test 3",
                category: "TEST",
                order: 4,
            },

            {
                examName: "Unit Test 4",
                category: "TEST",
                order: 5,
            },

      
            {
                examName: "Final Exam",
                category: "EXAM",
                order: 6,
            },
        ];

        // =========================
        // FINAL DATA
        // =========================

        const examData =
        defaultExams.map((exam) => ({
            examName: exam.examName,
            session: currentSession._id,
            category: exam.category,
            isActive: true,
            order: exam.order,
        }));

        // =========================
        // INSERT
        // =========================

        await Exam.insertMany(
            examData
        );

        console.log(
            "✅ Exams Seeded Successfully"
        );

    } catch (error) {

        console.log(
            "❌ Exam Seeder Error",
            error
        );

        throw error;
    }
};
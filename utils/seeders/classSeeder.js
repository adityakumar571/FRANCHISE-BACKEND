import { getClassModel } from "../../models/tenant/master/Class.modal.js";
import { getSessionModel } from "../../models/tenant/master/Session.model.js";

export const seedClasses =
async (tenantDB) => {

    try {

        const Class =
        getClassModel(tenantDB);

        const Session =
        getSessionModel(tenantDB);

        // =========================
        // CHECK EXISTING
        // =========================

        const exists =
        await Class.countDocuments();

        if (exists > 0) {

            console.log(
                "⚠️ Classes Already Exist"
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
        // DEFAULT CLASSES
        // =========================

     const defaultClasses = [

  // PRE PRIMARY

  {
    name: "Nursery",
    isSenior: false,
    order: 1,
  },

  {
    name: "LKG",
    isSenior: false,
    order: 2,
  },

  {
    name: "UKG",
    isSenior: false,
    order: 3,
  },

  // PRIMARY

  {
    name: "1st",
    isSenior: false,
    order: 4,
  },

  {
    name: "2nd",
    isSenior: false,
    order: 5,
  },

  {
    name: "3rd",
    isSenior: false,
    order: 6,
  },

  {
    name: "4th",
    isSenior: false,
    order: 7,
  },

  {
    name: "5th",
    isSenior: false,
    order: 8,
  },

  // MIDDLE

  {
    name: "6th",
    isSenior: false,
    order: 9,
  },

  {
    name: "7th",
    isSenior: false,
    order: 10,
  },

  {
    name: "8th",
    isSenior: false,
    order: 11,
  },

  // HIGH SCHOOL

  {
    name: "9th",
    isSenior: false,
    order: 12,
  },

  {
    name: "10th",
    isSenior: false,
    order: 13,
  },

  // INTERMEDIATE

  {
    name: "11th",
    isSenior: true,
    order: 14,
  },

  {
    name: "12th",
    isSenior: true,
    order: 15,
  },

];

        // =========================
        // FINAL DATA
        // =========================

        const classData =
        defaultClasses.map((cls) => ({
            name: cls.name,
            session: currentSession._id,
            isSenior: cls.isSenior,
            isActive: true,
            order: cls.order,
        }));

        // =========================
        // INSERT
        // =========================

        await Class.insertMany(
            classData
        );

        console.log(
            "✅ Classes Seeded Successfully"
        );

    } catch (error) {

        console.log(
            "❌ Class Seeder Error",
            error
        );

        throw error;
    }
};
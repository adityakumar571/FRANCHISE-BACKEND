
// import { getClassModel } from "../../models/tenant/master/Class.modal.js";

// import { getFeeStructureModel } from "../../models/tenant/master/FeeStructure.model.js";

// import { getFeeInstallmentModel } from "../../models/tenant/master/FeeInstallment.model.js";

// import { getInstallmentTypeModel } from "../../models/tenant/master/InstallmentType.model.js";

// import { getSessionModel } from "../../models/tenant/master/Session.model.js";

// import { getStreamModel } from "../../models/tenant/master/Stream.model.js";

// import { INSTALLMENT_PERIODS } from "../../utils/feeInstallmentPeriods.js";

// export const seedFeeStructures = async (tenantDB) => {

//   try {

//     const FeeStructure =
//       getFeeStructureModel(tenantDB);

//     const FeeInstallment =
//       getFeeInstallmentModel(tenantDB);

//     const Class =
//       getClassModel(tenantDB);

//     const Stream =
//       getStreamModel(tenantDB);

//     const Session =
//       getSessionModel(tenantDB);

//     const InstallmentType =
//       getInstallmentTypeModel(tenantDB);

//     // =========================
//     // CHECK EXISTING
//     // =========================

//     const exists =
//       await FeeStructure.countDocuments();

//     if (exists > 0) {

//       console.log(
//         "⚠️ Fee Structures Already Exist"
//       );

//       return;
//     }

//     // =========================
//     // CURRENT SESSION
//     // =========================

//     const currentSession =
//       await Session.findOne({
//         isCurrent: true
//       });

//     if (!currentSession) {

//       console.log(
//         "❌ Current Session Not Found"
//       );

//       return;
//     }

//     // =========================
//     // INSTALLMENT TYPE
//     // =========================

//     const installmentType =
//       await InstallmentType.findOne({
//         name: "MONTHLY"
//       });

//     if (!installmentType) {

//       console.log(
//         "❌ Monthly Installment Type Not Found"
//       );

//       return;
//     }

//     // =========================
//     // GET CLASSES
//     // =========================

//     const classes = await Class.find({
//       session: currentSession._id,
//     }).sort({ order: 1 });

//     // =========================
//     // FINAL DATA
//     // =========================

//     const feeData = [];

//     for (const cls of classes) {

//       // =====================
//       // JUNIOR CLASSES
//       // =====================

//       if (!cls.isSenior) {

//         feeData.push({

//           sessionId:
//             currentSession._id,

//           classId:
//             cls._id,

//           order:
//             cls.order,

//           streamId: null,

//           feeHeadName:
//             "Tuition Fees",

//           installmentType:
//             installmentType._id,

//           totalInstallments: 12,

//           totalAmount: 9000,

//           remark: "",

//           isActive: true,

//         });

//       }

//       // =====================
//       // SENIOR CLASSES
//       // =====================

//       else {

//         const streams = await Stream.find({
//           classId: cls._id,
//           session: currentSession._id,
//         }).sort({ order: 1 });

//         for (const stream of streams) {

//           feeData.push({

//             sessionId:
//               currentSession._id,

//             classId:
//               cls._id,

//             order:
//               cls.order,

//             streamId:
//               stream._id,

//             feeHeadName:
//               "Tuition Fees",

//             installmentType:
//               installmentType._id,

//             totalInstallments: 12,

//             totalAmount: 12000,

//             remark: "",

//             isActive: true,

//           });

//         }

//       }

//     }

//     // =========================
//     // CREATE FEE STRUCTURE
//     // + INSTALLMENTS
//     // =========================

//     for (const fee of feeData) {

//       // ✅ CREATE FEE STRUCTURE

//       const createdFee =
//         await FeeStructure.create(fee);

//       // ✅ GET PERIODS

//       const periods =
//         INSTALLMENT_PERIODS["MONTHLY"];

//       // ✅ AMOUNT DIVISION

//       const total =
//         fee.totalAmount;

//       const baseAmount =
//         Math.floor((total / periods.length) * 100) / 100;

//       let remaining = total;

//       // ✅ CREATE INSTALLMENTS

//       const installments =
//         periods.map((period, index) => {

//           const amount =
//             index === periods.length - 1
//               ? Number(remaining.toFixed(2))
//               : baseAmount;

//           remaining -= amount;

//           return {

//             feeStructureId:
//               createdFee._id,

//             installmentNo:
//               index + 1,

//             period,

//             amount,

//             dueDate:
//               new Date(),

//             remark: "",

//             isActive: true,

//           };

//         });

//       // ✅ INSERT INSTALLMENTS

//       await FeeInstallment.insertMany(
//         installments
//       );

//     }

//     console.log(
//       "✅ Fee Structures Seeded Successfully"
//     );

//   } catch (error) {

//     console.log(
//       "❌ Fee Structure Seeder Error",
//       error
//     );

//     throw error;
//   }
// };

import { getClassModel } from "../../models/tenant/master/Class.modal.js";
import { getFeeStructureModel } from "../../models/tenant/master/FeeStructure.model.js";
import { getFeeInstallmentModel } from "../../models/tenant/master/FeeInstallment.model.js";
import { getInstallmentTypeModel } from "../../models/tenant/master/InstallmentType.model.js";
import { getSessionModel } from "../../models/tenant/master/Session.model.js";
import { getStreamModel } from "../../models/tenant/master/Stream.model.js";

import { INSTALLMENT_PERIODS } from "../../utils/feeInstallmentPeriods.js";

export const seedFeeStructures = async (tenantDB) => {

  try {

    const FeeStructure =
      getFeeStructureModel(tenantDB);

    const FeeInstallment =
      getFeeInstallmentModel(tenantDB);

    const Class =
      getClassModel(tenantDB);

    const Stream =
      getStreamModel(tenantDB);

    const Session =
      getSessionModel(tenantDB);

    const InstallmentType =
      getInstallmentTypeModel(tenantDB);

    // =========================
    // CHECK EXISTING
    // =========================

    const exists =
      await FeeStructure.countDocuments();

    if (exists > 0) {

      console.log(
        "⚠️ Fee Structures Already Exist"
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
    // INSTALLMENT TYPE
    // =========================

    const installmentType =
      await InstallmentType.findOne({
        name: "MONTHLY"
      });

    if (!installmentType) {

      console.log(
        "❌ Monthly Installment Type Not Found"
      );

      return;
    }

    // =========================
    // GET CLASSES
    // =========================

    const classes = await Class.find({
      session: currentSession._id,
    }).sort({ order: 1 });

    // =========================
    // MONTH MAP
    // =========================

    const monthMap = {
      APRIL: 3,
      MAY: 4,
      JUNE: 5,
      JULY: 6,
      AUGUST: 7,
      SEPTEMBER: 8,
      OCTOBER: 9,
      NOVEMBER: 10,
      DECEMBER: 11,
      JANUARY: 0,
      FEBRUARY: 1,
      MARCH: 2,
    };

    // =========================
    // STATIC SESSION YEAR
    // =========================

    const sessionStartYear = 2026;

    // =========================
    // FINAL DATA
    // =========================

    const feeData = [];

    for (const cls of classes) {

      // =====================
      // JUNIOR CLASSES
      // =====================

      if (!cls.isSenior) {

        feeData.push({

          sessionId:
            currentSession._id,

          classId:
            cls._id,

          order:
            cls.order,

          streamId:
            null,

          feeHeadName:
            "Tuition Fees",

          installmentType:
            installmentType._id,

          totalInstallments:
            12,

          totalAmount:
            9000,

          remark:
            "",

          isActive:
            true,

        });

      }

      // =====================
      // SENIOR CLASSES
      // =====================

      else {

        const streams = await Stream.find({
          classId: cls._id,
          session: currentSession._id,
        }).sort({ order: 1 });

        for (const stream of streams) {

          feeData.push({

            sessionId:
              currentSession._id,

            classId:
              cls._id,

            order:
              cls.order,

            streamId:
              stream._id,

            feeHeadName:
              "Tuition Fees",

            installmentType:
              installmentType._id,

            totalInstallments:
              12,

            totalAmount:
              12000,

            remark:
              "",

            isActive:
              true,

          });

        }

      }

    }

    // =========================
    // CREATE FEE STRUCTURES
    // =========================

    for (const fee of feeData) {

      // =====================
      // CREATE FEE STRUCTURE
      // =====================

      const createdFee =
        await FeeStructure.create(fee);

      // =====================
      // GET PERIODS
      // =====================

      const periods =
        INSTALLMENT_PERIODS["MONTHLY"];

      // =====================
      // AMOUNT DIVISION
      // =====================

      const total =
        fee.totalAmount;

      const baseAmount =
        Math.floor((total / periods.length) * 100) / 100;

      let remaining =
        total;

      // =====================
      // CREATE INSTALLMENTS
      // =====================

      const installments =
        periods.map((period, index) => {

          const amount =
            index === periods.length - 1
              ? Number(remaining.toFixed(2))
              : baseAmount;

          remaining -= amount;

          // =====================
          // YEAR LOGIC
          // =====================

          const year =
            ["JANUARY", "FEBRUARY", "MARCH"].includes(period)
              ? sessionStartYear + 1
              : sessionStartYear;

          // =====================
          // SAFE MONTH INDEX
          // =====================

          const monthIndex =
            monthMap[period];

          // =====================
          // DUE DATE
          // =====================

          const dueDate =
            new Date(
              year,
              monthIndex,
              10
            );

          return {

            feeStructureId:
              createdFee._id,

            installmentNo:
              index + 1,

            period,

            amount,

            dueDate,

            remark:
              "",

            isActive:
              true,

          };

        });

      // =====================
      // INSERT INSTALLMENTS
      // =====================

      await FeeInstallment.insertMany(
        installments
      );

    }

    console.log(
      "✅ Fee Structures Seeded Successfully"
    );

  } catch (error) {

    console.log(
      "❌ Fee Structure Seeder Error",
      error
    );

    throw error;
  }

};


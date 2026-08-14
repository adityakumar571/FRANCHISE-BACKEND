import { getClassModel } from "../../models/tenant/master/Class.modal.js";

import { getSessionModel } from "../../models/tenant/master/Session.model.js";

import { getStreamModel } from "../../models/tenant/master/Stream.model.js";

export const seedStreams =
async (tenantDB) => {

  try {

    const Stream =
      getStreamModel(tenantDB);

    const Class =
      getClassModel(tenantDB);

    const Session =
      getSessionModel(tenantDB);

    // =========================
    // CHECK EXISTING
    // =========================

    const exists =
      await Stream.countDocuments();

    if (exists > 0) {

      console.log(
        "⚠️ Streams Already Exist"
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
    // GET 11th & 12th CLASSES
    // =========================

    const seniorClasses =
      await Class.find({

        session:
          currentSession._id,

        name: {
          $in: ["11th", "12th"]
        },

      });

    if (seniorClasses.length === 0) {

      console.log(
        "❌ 11th & 12th Classes Not Found"
      );

      return;
    }

    // =========================
    // DEFAULT STREAMS
    // =========================

    const defaultStreams = [

      "PCM",

      "PCB",

      "Commerce",

      "Arts",

    ];

    // =========================
    // FINAL DATA
    // =========================

    const streamData = [];

    seniorClasses.forEach((cls) => {

      defaultStreams.forEach(
        (stream, index) => {

          streamData.push({

            name: stream,

            classId:
              cls._id,

            session:
              currentSession._id,

            isActive: true,

            order: index + 1,

          });

        }
      );

    });

    // =========================
    // INSERT
    // =========================

    await Stream.insertMany(
      streamData
    );

    console.log(
      "✅ Streams Seeded Successfully"
    );

  } catch (error) {

    console.log(
      "❌ Stream Seeder Error",
      error
    );

    throw error;
  }
};
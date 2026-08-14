import { getClassModel } from "../../models/tenant/master/Class.modal.js";
import { getSectionModel } from "../../models/tenant/master/Section.modal.js";
import { getSessionModel } from "../../models/tenant/master/Session.model.js";


export const seedSections =
    async (tenantDB) => {

        try {

            const Section =
                getSectionModel(tenantDB);

            const Class =
                getClassModel(tenantDB);

            const Session =
                getSessionModel(tenantDB);

            // =========================
            // CHECK EXISTING
            // =========================

            const exists =
                await Section.countDocuments();

            if (exists > 0) {

                console.log(
                    "⚠️ Sections Already Exist"
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
            // GET CLASSES
            // =========================

            const classes =
                await Class.find({
                    session: currentSession._id
                });

            if (classes.length === 0) {

                console.log(
                    "❌ No Classes Found"
                );

                return;
            }

            // =========================
            // DEFAULT SECTIONS
            // =========================

            const defaultSections = [
                "A",

            ];

            // =========================
            // FINAL DATA
            // =========================

            const sectionData = [];

            classes.forEach((cls) => {

                defaultSections.forEach(
                    (sec, index) => {

                        sectionData.push({

                            name: sec,

                            classes: cls._id,

                            session:
                                currentSession._id,

                            order: index + 1,

                            isActive: true,

                        });

                    }
                );

            });

            // =========================
            // INSERT
            // =========================

            await Section.insertMany(
                sectionData
            );

            console.log(
                "✅ Sections Seeded Successfully"
            );

        } catch (error) {

            console.log(
                "❌ Section Seeder Error",
                error
            );

            throw error;
        }
    };
import { getClassModel } from "../../models/tenant/master/Class.modal.js";
import { getSessionModel } from "../../models/tenant/master/Session.model.js";
import { getStreamModel } from "../../models/tenant/master/Stream.model.js";
import { getSubjectModel } from "../../models/tenant/master/Subject.model.js";


export const seedSubjects =
    async (tenantDB) => {

        try {

            const Subject =
                getSubjectModel(tenantDB);

            const Class =
                getClassModel(tenantDB);

            const Stream =
                getStreamModel(tenantDB);

            const Session =
                getSessionModel(tenantDB);

            // =========================
            // CHECK EXISTING
            // =========================

            const exists =
                await Subject.countDocuments();

            if (exists > 0) {

                console.log(
                    "⚠️ Subjects Already Exist"
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
            // COMMON SUBJECTS
            // =========================

            const commonSubjects = [
                "English",
                "Hindi",
                "Mathematics",
                "Science",
                "Social Science",
                "Computer",
                "GK",
            ];

            // =========================
            // STREAM SUBJECTS
            // =========================

            const streamSubjects = {

                PCM: [
                    "Physics",
                    "Chemistry",
                    "Mathematics",
                    "English",
                    "Hindi"
                ],

                PCB: [
                    "Physics",
                    "Chemistry",
                    "Biology",
                    "English",
                    "Hindi"
                ],
                Commerce: [
                    "Accountancy",
                    "Business Studies",
                    "Economics",
                    "English",
                ],

                Arts: [
                    "History",
                    "Political Science",
                    "Geography",
                    "English",
                ],
            };

            // =========================
            // FINAL DATA
            // =========================

            const subjectData = [];

            for (const cls of classes) {

                // =====================
                // JUNIOR CLASSES
                // =====================

                if (!cls.isSenior) {

                    commonSubjects.forEach(
                        (subject, index) => {

                            subjectData.push({

                                name: subject,

                                classes: cls._id,

                                streamId: null,

                                session:
                                    currentSession._id,

                                isActive: true,

                                order: index + 1,

                            });

                        }
                    );

                }

                // =====================
                // SENIOR CLASSES
                // =====================

                else {

                    const streams =
                        await Stream.find({
                            classId: cls._id,
                            session:
                                currentSession._id
                        });

                    for (const stream of streams) {

                        const subjects =
                            streamSubjects[
                            stream.name
                            ] || [];

                        subjects.forEach(
                            (subject, index) => {

                                subjectData.push({

                                    name: subject,

                                    classes: cls._id,

                                    streamId:
                                        stream._id,

                                    session:
                                        currentSession._id,

                                    isActive: true,

                                    order: index + 1,

                                });

                            }
                        );

                    }

                }

            }

            // =========================
            // INSERT
            // =========================

            await Subject.insertMany(
                subjectData
            );

            console.log(
                "✅ Subjects Seeded Successfully"
            );

        } catch (error) {

            console.log(
                "❌ Subject Seeder Error",
                error
            );

            throw error;
        }
    };
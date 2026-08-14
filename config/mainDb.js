import mongoose from "mongoose";

const connectMainDB = async () => {
    try {
        await mongoose.connect(process.env.MAIN_DB_URI);
        console.log("✅ Central DB Connected");
    } catch (error) {
        console.error("❌ Main DB Error", error);
        process.exit(1);
    }
};

export default connectMainDB;
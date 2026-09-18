import mongoose from "mongoose";

const connectMainDB = async () => {
    try {
        await mongoose.connect(process.env.MAIN_DB_URI, {
            serverSelectionTimeoutMS: 5000,   // 5s mein connect na ho toh fail fast
            connectTimeoutMS: 10000,           // 10s connection timeout
            maxPoolSize: 10,                   // connection pool
            minPoolSize: 2,                    // min connections ready
            socketTimeoutMS: 45000,
        });
        console.log("✅ Central DB Connected");
    } catch (error) {
        console.error("❌ Main DB Error", error);
        process.exit(1);
    }
};

export default connectMainDB;
import mongoose from "mongoose";
import dns from "dns";

// Force IPv4 + Google DNS to resolve MongoDB Atlas SRV records
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

const connectMainDB = async () => {
    try {
        await mongoose.connect(process.env.MAIN_DB_URI, {
            family: 4,
            serverSelectionTimeoutMS: 15000,
            connectTimeoutMS: 15000,
            maxPoolSize: 10,
            minPoolSize: 2,
            socketTimeoutMS: 45000,
        });
        console.log("✅ Central DB Connected");
    } catch (error) {
        console.error("❌ Main DB Error", error.message || error);
        process.exit(1);
    }
};

export default connectMainDB;
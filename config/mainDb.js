import mongoose from "mongoose";
import dns from "dns";

// Force IPv4 + Google DNS to resolve MongoDB Atlas SRV records
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

const connectMainDB = async () => {
    try {
        // Prevent unhandled promise rejections
        mongoose.connection.on('error', (err) => {
            console.warn('⚠️  MongoDB Main Connection Error:', err.message);
        });

        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️  MongoDB Main DB Disconnected - will reconnect automatically');
        });

        mongoose.connection.on('reconnected', () => {
            console.log('✅ MongoDB Main DB Reconnected');
        });

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
        console.error("❌ Main DB Connection Failed:", error.message);
        // Don't exit process - let it retry on next request
        console.warn("⚠️  Server will continue without main DB - some features may not work");
    }
};

export default connectMainDB;
import mongoose from "mongoose";
import dns from "dns";

// Force IPv4 + Google DNS — fixes MongoDB Atlas SRV resolution on restrictive networks
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

// Cache promises (not connections) to eliminate the race condition where
// two simultaneous requests for the same tenant both find an empty cache
// and each create their own connection.
const connectionPromises = {};

export const getTenantDB = async (dbUri) => {
    if (!dbUri) {
        throw new Error("getTenantDB: dbUri is required");
    }

    // Return cached promise if one is already in-flight or resolved
    if (connectionPromises[dbUri]) {
        return connectionPromises[dbUri];
    }

    // Create and cache the promise immediately so concurrent callers
    // all await the same connection attempt instead of creating duplicates.
    connectionPromises[dbUri] = (async () => {
        try {
            const conn = mongoose.createConnection(dbUri, {
                family: 4,
                serverSelectionTimeoutMS: 15000,
                connectTimeoutMS: 15000,
                maxPoolSize: 10,
                minPoolSize: 2,
                socketTimeoutMS: 45000,
            });

            await new Promise((resolve, reject) => {
                conn.once("connected", () => {
                    console.log(`✅ Tenant DB Connected: ${dbUri}`);
                    resolve();
                });

                conn.once("error", (err) => {
                    console.error(`❌ DB Error: ${dbUri}`, err);
                    // Remove from cache so next request retries the connection
                    delete connectionPromises[dbUri];
                    reject(err);
                });
            });

            return conn;
        } catch (error) {
            // Remove from cache on failure so the next request retries
            delete connectionPromises[dbUri];
            console.error("❌ getTenantDB Error:", error);
            throw error;
        }
    })();

    return connectionPromises[dbUri];
};

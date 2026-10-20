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
        let conn;
        try {
            conn = mongoose.createConnection(dbUri, {
                family: 4,
                serverSelectionTimeoutMS: 15000,
                connectTimeoutMS: 15000,
                maxPoolSize: 10,
                minPoolSize: 2,
                socketTimeoutMS: 45000,
            });

            // Prevent unhandled promise rejections by attaching error handler immediately
            conn.on("error", (err) => {
                console.error(`❌ Tenant DB Connection Error: ${dbUri.split('@')[1]?.split('/')[0] || 'unknown'}`, err.message);
                // Don't remove from cache here - let the connection retry logic handle it
            });

            // Prevent unhandled disconnection errors
            conn.on("disconnected", () => {
                console.warn(`⚠️  Tenant DB Disconnected: ${dbUri.split('@')[1]?.split('/')[0] || 'unknown'}`);
            });

            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error("Connection timeout"));
                }, 20000); // 20 second timeout

                conn.once("connected", () => {
                    clearTimeout(timeout);
                    console.log(`✅ Tenant DB Connected: ${dbUri.split('@')[1]?.split('/')[1] || 'unknown'}`);
                    resolve();
                });

                conn.once("error", (err) => {
                    clearTimeout(timeout);
                    console.error(`❌ Tenant DB Initial Connection Error: ${dbUri.split('@')[1]?.split('/')[0] || 'unknown'}`, err.message);
                    // Remove from cache so next request retries the connection
                    delete connectionPromises[dbUri];
                    reject(err);
                });
            });

            return conn;
        } catch (error) {
            // Remove from cache on failure so the next request retries
            delete connectionPromises[dbUri];
            
            // Close the connection if it was created
            if (conn) {
                try {
                    await conn.close();
                } catch (closeErr) {
                    // Ignore close errors
                }
            }
            
            console.error("❌ getTenantDB Failed:", error.message);
            throw error;
        }
    })();

    return connectionPromises[dbUri];
};

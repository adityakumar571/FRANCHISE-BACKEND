import mongoose from "mongoose";

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
            // mongoose v8 mein useNewUrlParser/useUnifiedTopology deprecated hain — removed
            const conn = mongoose.createConnection(dbUri, {
                serverSelectionTimeoutMS: 5000,
                connectTimeoutMS: 10000,
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

import { createClient } from "redis";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.warn("⚠️  REDIS_URL not set — Redis client will not connect.");
}

const redisClient = createClient({
  url: redisUrl,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 5) {
        console.error("❌ Redis: max reconnect attempts reached, giving up.");
        return false; // stop retrying
      }
      return Math.min(retries * 500, 3000); // back-off
    },
  },
});

redisClient.on("error", (err) => {
  // Log once per error type, not on every retry cycle
  console.error("Redis Error:", err.message || err);
});

redisClient.on("connect", () => {
  console.log("✅ Redis connected");
});

redisClient.on("reconnecting", () => {
  console.log("🔄 Redis reconnecting…");
});

// Connect asynchronously — do NOT block module load with top-level await
redisClient.connect().catch((err) => {
  console.error("❌ Redis initial connect failed:", err.message);
});

export default redisClient;

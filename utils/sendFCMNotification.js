import { getFirebaseAdmin } from "../config/firebase.js";

/**
 * Single device ko FCM push notification bhejo
 * @param {string} fcmToken  - User ka FCM token
 * @param {string} title     - Notification title
 * @param {string} body      - Notification message
 * @param {object} data      - Optional extra payload (key-value strings)
 */
export const sendFCMNotification = async (fcmToken, title, body, data = {}) => {
    if (!fcmToken) return { success: false, reason: "No FCM token" };

    try {
        const admin = getFirebaseAdmin();

        // data object mein sab values string honi chahiye
        const stringData = {};
        for (const key in data) {
            stringData[key] = String(data[key]);
        }

        const message = {
            token: fcmToken,
            notification: { title, body },
            data: stringData,
            android: {
                priority: "high",
                notification: { sound: "default" },
            },
            apns: {
                payload: {
                    aps: { sound: "default" },
                },
            },
        };

        const response = await admin.messaging().send(message);
        console.log(`✅ FCM sent: ${response}`);
        return { success: true, messageId: response };
    } catch (error) {
        console.error(`❌ FCM error: ${error.message}`);
        return { success: false, reason: error.message };
    }
};

/**
 * Multiple devices ko ek saath FCM push bhejo
 * @param {string[]} fcmTokens - Array of FCM tokens
 * @param {string} title
 * @param {string} body
 * @param {object} data
 */
export const sendFCMToMultiple = async (fcmTokens, title, body, data = {}) => {
    if (!fcmTokens || fcmTokens.length === 0) return { success: false, reason: "No FCM tokens" };

    try {
        const admin = getFirebaseAdmin();

        const stringData = {};
        for (const key in data) {
            stringData[key] = String(data[key]);
        }

        const message = {
            tokens: fcmTokens,
            notification: { title, body },
            data: stringData,
            android: {
                priority: "high",
                notification: { sound: "default" },
            },
            apns: {
                payload: {
                    aps: { sound: "default" },
                },
            },
        };

        const response = await admin.messaging().sendEachForMulticast(message);
        console.log(`✅ FCM multicast: ${response.successCount} success, ${response.failureCount} failed`);
        return { success: true, successCount: response.successCount, failureCount: response.failureCount };
    } catch (error) {
        console.error(`❌ FCM multicast error: ${error.message}`);
        return { success: false, reason: error.message };
    }
};

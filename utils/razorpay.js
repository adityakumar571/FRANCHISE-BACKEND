import Razorpay from "razorpay";

export const getRazorpayInstance = (tenant) => {
    return new Razorpay({
        key_id: tenant.razorpayKey,
        key_secret: tenant.razorpaySecret,
    });
};
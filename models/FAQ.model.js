import mongoose from "mongoose";

const faqSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: true,
      trim: true,
    },
    question: {
      type: String,
      required: true,
      trim: true,
    },
    answer: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Text index for search
faqSchema.index({ question: "text", answer: "text", category: "text" });

const FAQ = mongoose.model("FAQ", faqSchema);
export default FAQ;

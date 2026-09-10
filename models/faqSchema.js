const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const faqItemSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
    trim: true,
  },
  answer: {
    type: String,
    required: true,
  },
  order: {
    type: Number,
    default: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
});

const helpSectionSchema = new mongoose.Schema(
  {
    sectionKey: {
      type: String, // e.g. account, posts, referral
      required: true,
      unique: true,
      lowercase: true,
    },
    title: {
      type: String, // e.g. "Account & Profile"
      required: true,
    },
    description: {
      type: String,
    },
    faqs: [faqItemSchema],
    order: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

helpSectionSchema.index({
  title: 'text',
  description: 'text',
  'faqs.question': 'text',
  'faqs.answer': 'text'
}, {
  weights: {
    title: 10,
    'faqs.question': 8,
    description: 5,
    'faqs.answer': 5
  },
  name: 'faq_text_search'
});

module.exports = prithuDB.model("HelpFAQ", helpSectionSchema, "HelpFAQ");

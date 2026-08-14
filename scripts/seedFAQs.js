/**
 * FAQ Seed Script
 * Run: node scripts/seedFAQs.js
 * 
 * Seeds the database with common FAQs for School LMS SaaS platform.
 * Skips duplicates — safe to run multiple times.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.development' });

// ── FAQ Model (inline — no import path issues) ────────────────────────────────
const faqSchema = new mongoose.Schema(
  {
    category: { type: String, required: true, trim: true },
    question: { type: String, required: true, trim: true },
    answer:   { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    order:    { type: Number, default: 0 },
  },
  { timestamps: true }
);
faqSchema.index({ question: 'text', answer: 'text', category: 'text' });
const FAQ = mongoose.models.FAQ || mongoose.model('FAQ', faqSchema);

// ── FAQ Data ──────────────────────────────────────────────────────────────────
const faqs = [

  /* ─── Getting Started ─── */
  {
    category: 'Getting Started',
    order: 1,
    question: 'What is CloudX School Management System?',
    answer: 'CloudX is a cloud-based School Management SaaS platform that helps schools manage students, teachers, fees, attendance, timetables, and more — all from a single dashboard. Each school gets its own secure subdomain and isolated database.',
  },
  {
    category: 'Getting Started',
    order: 2,
    question: 'How do I register my school on CloudX?',
    answer: 'Visit our website and click on "Get Started". Fill in your school details, choose a subscription plan, complete payment, and your school portal will be set up within minutes. You will receive login credentials on your registered email.',
  },
  {
    category: 'Getting Started',
    order: 3,
    question: 'What is a subdomain and how does it work?',
    answer: 'Each school on CloudX gets a unique subdomain (e.g., yourschool.schoolcloudx.com). This is your school\'s dedicated URL for accessing the LMS. All your data is isolated and accessible only through your subdomain.',
  },
  {
    category: 'Getting Started',
    order: 4,
    question: 'Can I try CloudX before subscribing?',
    answer: 'Yes! We offer a free demo session. Contact our support team to schedule a walkthrough of all features. You can also request a trial account to explore the platform before making a commitment.',
  },

  /* ─── Subscription & Billing ─── */
  {
    category: 'Subscription & Billing',
    order: 10,
    question: 'What subscription plans are available?',
    answer: 'CloudX offers multiple plans based on student count and features — Basic, Standard, and Premium. Each plan includes different student limits, storage, and access to advanced features. Visit our Pricing page for detailed plan comparison.',
  },
  {
    category: 'Subscription & Billing',
    order: 11,
    question: 'How is billing calculated?',
    answer: 'Billing is based on your selected plan and billing cycle (monthly or yearly). Yearly plans come with a discount. Additional students beyond your plan limit require an upgrade or add-on purchase.',
  },
  {
    category: 'Subscription & Billing',
    order: 12,
    question: 'What payment methods are accepted?',
    answer: 'We accept all major credit/debit cards, UPI, net banking, and wallets through our secure Razorpay payment gateway. All transactions are encrypted and safe.',
  },
  {
    category: 'Subscription & Billing',
    order: 13,
    question: 'Can I upgrade or downgrade my plan?',
    answer: 'Yes, you can upgrade your plan at any time from the school portal under Subscription settings. Downgrading is available at the end of your current billing cycle. Contact support for assistance.',
  },
  {
    category: 'Subscription & Billing',
    order: 14,
    question: 'What happens if my subscription expires?',
    answer: 'If your subscription expires, access to the school portal will be restricted. Your data is safely retained for 30 days after expiry. Renew your subscription within this period to restore full access without any data loss.',
  },
  {
    category: 'Subscription & Billing',
    order: 15,
    question: 'Is there a refund policy?',
    answer: 'We offer a 7-day refund policy for new subscriptions if you are not satisfied. Refunds are not applicable for renewals or after the 7-day window. Please contact support@schoolcloudx.com for refund requests.',
  },

  /* ─── Student Management ─── */
  {
    category: 'Student Management',
    order: 20,
    question: 'How do I add a new student?',
    answer: 'Go to Student Management → Add Student. Fill in the student\'s personal details, class, section, and upload required documents. The system will auto-generate a unique student ID. You can also bulk import students via Excel.',
  },
  {
    category: 'Student Management',
    order: 21,
    question: 'Can I import students in bulk?',
    answer: 'Yes, CloudX supports bulk student import via Excel/CSV file. Download the template from Student Management → Import Students, fill in the data, and upload. The system will validate and import all valid records.',
  },
  {
    category: 'Student Management',
    order: 22,
    question: 'How does student enrollment work?',
    answer: 'After registration, students are enrolled into a specific class and section for the active academic session. Enrollment assigns fee structures, roll numbers, and grants access to the student portal.',
  },
  {
    category: 'Student Management',
    order: 23,
    question: 'Can a student be transferred to another school on CloudX?',
    answer: 'Yes, CloudX has a Student Transfer module. The current school issues a Transfer Certificate (TC), and the student\'s records can be marked as transferred. The receiving school can onboard the student as a new admission.',
  },

  /* ─── Fee Management ─── */
  {
    category: 'Fee Management',
    order: 30,
    question: 'How do I set up fee structures?',
    answer: 'Go to Fee Management → Fee Structures. Create fee heads (Tuition, Transport, etc.), define amounts per class, and assign installment schedules. Once set up, fees are automatically mapped to enrolled students.',
  },
  {
    category: 'Fee Management',
    order: 31,
    question: 'Can parents pay fees online?',
    answer: 'Yes, online fee payment is supported through Razorpay. Parents can log in to the student portal and pay dues using credit/debit cards, UPI, or net banking. Payment receipts are generated automatically.',
  },
  {
    category: 'Fee Management',
    order: 32,
    question: 'How do late fees work?',
    answer: 'You can configure late fee rules in Fee Management → Late Fee Settings. Define a grace period and a fixed or percentage-based late fee charge. The system automatically applies late fees after the due date.',
  },
  {
    category: 'Fee Management',
    order: 33,
    question: 'Can I give fee concessions to specific students?',
    answer: 'Yes, fee concessions can be applied at the student level from the Fee Management section. You can set a fixed amount or percentage discount on specific fee heads for individual students.',
  },

  /* ─── Attendance ─── */
  {
    category: 'Attendance',
    order: 40,
    question: 'How is attendance marked?',
    answer: 'Teachers can mark attendance class-wise from the Attendance module. Select the class, section, and date — then mark each student as Present, Absent, or Late. Attendance can also be marked subject-wise if enabled.',
  },
  {
    category: 'Attendance',
    order: 41,
    question: 'Can parents view their child\'s attendance?',
    answer: 'Yes, parents can view attendance records through the parent portal or mobile app. Notifications are also sent for absences if the notification module is configured.',
  },
  {
    category: 'Attendance',
    order: 42,
    question: 'Can I generate attendance reports?',
    answer: 'Yes, detailed attendance reports are available in the Reports section. You can filter by class, section, student, date range, and export to PDF or Excel.',
  },

  /* ─── Teacher Management ─── */
  {
    category: 'Teacher Management',
    order: 50,
    question: 'How do I add a teacher to the system?',
    answer: 'Go to Teachers → Add Teacher. Fill in personal details, assign subjects and classes, and set their role (Teacher/Class Teacher). Login credentials will be sent to their registered email automatically.',
  },
  {
    category: 'Teacher Management',
    order: 51,
    question: 'What can teachers access on the portal?',
    answer: 'Teachers can access their assigned classes, mark attendance, upload homework, enter marks, view student profiles, and communicate through the notice board — all from their dedicated teacher dashboard.',
  },

  /* ─── Technical & Security ─── */
  {
    category: 'Technical & Security',
    order: 60,
    question: 'Is my school\'s data secure?',
    answer: 'Absolutely. Each school\'s data is stored in an isolated database with no cross-tenant access. All data is encrypted at rest and in transit using SSL/TLS. We follow industry best practices for data security and GDPR compliance.',
  },
  {
    category: 'Technical & Security',
    order: 61,
    question: 'What browsers and devices are supported?',
    answer: 'CloudX works on all modern browsers — Chrome, Firefox, Edge, and Safari. It is fully responsive and works on desktops, tablets, and mobile phones. No app installation is required.',
  },
  {
    category: 'Technical & Security',
    order: 62,
    question: 'Is CloudX available 24/7?',
    answer: 'Yes, CloudX is hosted on reliable cloud infrastructure with 99.9% uptime SLA. Scheduled maintenance windows are announced in advance. Real-time system status is available on our status page.',
  },
  {
    category: 'Technical & Security',
    order: 63,
    question: 'How do I reset my password?',
    answer: 'Click on "Forgot Password" on the login page and enter your registered email or User ID. A password reset link will be sent to your email. If you face issues, contact your school admin or our support team.',
  },
  {
    category: 'Technical & Security',
    order: 64,
    question: 'Can multiple admins manage the school account?',
    answer: 'Yes, you can create multiple admin accounts with different roles and permissions — Super Admin, Admin, Teacher, etc. Each role has controlled access to specific modules as per your configuration.',
  },

  /* ─── Support ─── */
  {
    category: 'Support',
    order: 70,
    question: 'How do I contact support?',
    answer: 'You can reach our support team via the Help & Support section in your admin dashboard, by emailing cloudxsupport@gmail.com, or through the live chat on our website. We typically respond within 24 business hours.',
  },
  {
    category: 'Support',
    order: 71,
    question: 'Do you provide onboarding assistance?',
    answer: 'Yes, we provide dedicated onboarding support for new schools. Our team will help you set up your school profile, import data, configure fee structures, and train your staff. Contact us after registration to schedule your onboarding session.',
  },
  {
    category: 'Support',
    order: 72,
    question: 'Is training available for staff?',
    answer: 'Yes, we offer online training sessions, video tutorials, and detailed documentation for all user roles — Admin, Teacher, Student, and Parent. Training materials are available in the Help section of your dashboard.',
  },
];

// ── Seed Function ─────────────────────────────────────────────────────────────
const seed = async () => {
  try {
    const uri = process.env.MAIN_DB_URI;
    if (!uri) throw new Error('MAIN_DB_URI not found in .env.development');

    console.log('Connecting to database...');
    await mongoose.connect(uri);
    console.log('Connected!\n');

    let inserted = 0;
    let skipped  = 0;

    for (const faq of faqs) {
      const exists = await FAQ.findOne({ question: faq.question.trim() });
      if (exists) {
        console.log(`  SKIP  "${faq.question.substring(0, 60)}..."`);
        skipped++;
      } else {
        await FAQ.create(faq);
        console.log(`  ADD   [${faq.category}] "${faq.question.substring(0, 55)}..."`);
        inserted++;
      }
    }

    console.log(`\nDone! Inserted: ${inserted} | Skipped (already exist): ${skipped}`);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
};

seed();

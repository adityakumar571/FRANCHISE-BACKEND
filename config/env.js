import dotenv from 'dotenv';

// Load .env.{NODE_ENV} first, then fall back to .env
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config({ path: '.env' }); // fallback — won't override already-set vars

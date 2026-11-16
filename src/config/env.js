require('dotenv').config();

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 3000,
  APP_NAME: process.env.APP_NAME || 'Bank Sampah Digital',
  APP_URL: process.env.APP_URL || 'http://localhost:3000',

  DB_CONNECTION: process.env.DB_CONNECTION || 'sqlite',
  DB_SQLITE_FILENAME: process.env.DB_SQLITE_FILENAME || './data/banksampah.sqlite',
  DB_HOST: process.env.DB_HOST || '127.0.0.1',
  DB_PORT: parseInt(process.env.DB_PORT, 10) || 3306,
  DB_DATABASE: process.env.DB_DATABASE || 'bank_sampah_digital',
  DB_USERNAME: process.env.DB_USERNAME || 'root',
  DB_PASSWORD: process.env.DB_PASSWORD || '',

  JWT_SECRET: process.env.JWT_SECRET || 'default_jwt_secret_banksampah_dev_2026',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  BCRYPT_SALT_ROUNDS: parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 10,

  DEFAULT_BRANCH_CODE: process.env.DEFAULT_BRANCH_CODE || 'BS-PUSAT-01',
  DEFAULT_BRANCH_NAME: process.env.DEFAULT_BRANCH_NAME || 'Bank Sampah Digital Pusat',

  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // AI Integration Configuration (Provider Abstraction)
  AI_PROVIDER: process.env.AI_PROVIDER || 'none', // 'openai' | 'gemini' | 'custom' | 'none'
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_VISION_MODEL: process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_VISION_MODEL: process.env.GEMINI_VISION_MODEL || 'gemini-1.5-flash',
  CUSTOM_AI_ENDPOINT: process.env.CUSTOM_AI_ENDPOINT || '',
  CUSTOM_AI_API_KEY: process.env.CUSTOM_AI_API_KEY || '',

  // WhatsApp Notification Configuration (Provider Abstraction)
  // 'meta' (WhatsApp Business Platform resmi) | 'twilio' | 'fonnte' | 'wablas' | 'none' | 'mock'
  WHATSAPP_PROVIDER: process.env.WHATSAPP_PROVIDER || 'none',
  WHATSAPP_API_KEY: process.env.WHATSAPP_API_KEY || '',
  WHATSAPP_API_SECRET: process.env.WHATSAPP_API_SECRET || '',
  WHATSAPP_SENDER_NUMBER: process.env.WHATSAPP_SENDER_NUMBER || '',
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  WHATSAPP_BUSINESS_ACCOUNT_ID: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
  WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN || '',
  WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET || '',
  WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN || '',
  WHATSAPP_API_VERSION: process.env.WHATSAPP_API_VERSION || 'v21.0',
  WHATSAPP_REQUIRE_TEMPLATE: process.env.WHATSAPP_REQUIRE_TEMPLATE || 'false',
  WHATSAPP_TWILIO_ACCOUNT_SID: process.env.WHATSAPP_TWILIO_ACCOUNT_SID || '',
  WHATSAPP_TWILIO_AUTH_TOKEN: process.env.WHATSAPP_TWILIO_AUTH_TOKEN || '',

  // Nous Research AI Configuration
  NOUS_API_KEY: process.env.NOUS_API_KEY || '',
  NOUS_KEY_ID: process.env.NOUS_KEY_ID || '',
  NOUS_API_BASE_URL: process.env.NOUS_API_BASE_URL || 'https://inference-api.nousresearch.com/v1',
  NOUS_MODEL: process.env.NOUS_MODEL || 'meituan/longcat-2.5-preview:free',
  NOUS_TIMEOUT_MS: parseInt(process.env.NOUS_TIMEOUT_MS, 10) || 20000,
};

module.exports = env;

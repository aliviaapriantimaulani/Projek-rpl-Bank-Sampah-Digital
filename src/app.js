const express = require('express');
const cors = require('cors');
const path = require('path');
const morgan = require('morgan');

const env = require('./config/env');
const db = require('./config/database');
const { errorHandler, notFoundHandler } = require('./middlewares/error.middleware');

const { securityHeaders } = require('./middlewares/security_headers.middleware');

// Routes
const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const customersRoutes = require('./modules/customers/customers.routes');
const wasteRoutes = require('./modules/waste/waste.routes');
const transactionsRoutes = require('./modules/transactions/transactions.routes');
const financeRoutes = require('./modules/finance/finance.routes');
const inventoryRoutes = require('./modules/inventory/inventory.routes');
const auditRoutes = require('./modules/audit/audit.routes');
const nasabahRoutes = require('./modules/nasabah/nasabah.routes');
const buyersRoutes = require('./modules/sales/buyers.routes');
const salesRoutes = require('./modules/sales/sales.routes');
const aiRoutes = require('./modules/ai/ai.routes');
const ownerAnalyticsRoutes = require('./modules/owner/owner_analytics.routes');
const gamificationRoutes = require('./modules/gamification/gamification.routes');
const chatbotRoutes = require('./modules/chatbot/chatbot.routes');
const notificationRoutes = require('./modules/notifications/notification.routes');

const app = express();

// Middlewares
app.use(securityHeaders);
app.use(cors());
// Capture raw body for WhatsApp webhook signature verification (X-Hub-Signature-256)
app.use(
  express.json({
    verify: (req, res, buf) => {
      if (buf && buf.length) req.rawBody = Buffer.from(buf);
    },
  })
);
app.use(express.urlencoded({ extended: true }));

if (env.NODE_ENV !== 'test') {
  app.use(morgan('short'));
}

// Serve public static assets (PWA manifest, icons, service worker)
app.use(express.static(path.join(__dirname, '../public')));

// Serve client frontend application
app.use(express.static(path.join(__dirname, '../client')));

// Health check API
app.get('/api/v1/health', async (req, res) => {
  let dbStatus = 'ok';
  try {
    await db.raw('SELECT 1');
  } catch (err) {
    dbStatus = 'error: ' + err.message;
  }

  res.status(200).json({
    status: 'online',
    app: env.APP_NAME,
    environment: env.NODE_ENV,
    database: {
      type: env.DB_CONNECTION,
      status: dbStatus,
    },
    timestamp: new Date().toISOString(),
  });
});

// API Routes (v1)
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/customers', customersRoutes);
app.use('/api/v1/waste', wasteRoutes);
app.use('/api/v1/transactions', transactionsRoutes);
app.use('/api/v1/finance', financeRoutes);
app.use('/api/v1/inventory', inventoryRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/nasabah', nasabahRoutes);
app.use('/api/v1/buyers', buyersRoutes);
app.use('/api/v1/sales', salesRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/owner/analytics', ownerAnalyticsRoutes);
app.use('/api/v1/owner', ownerAnalyticsRoutes);
app.use('/api/v1/gamification', gamificationRoutes);
app.use('/api/v1/chatbot', chatbotRoutes);
app.use('/api/v1/notifications', notificationRoutes);

// Fallback for Single-Page Application (SPA) HTML5 History Mode
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    return res.sendFile(path.join(__dirname, '../client/index.html'));
  }
  next();
});

// Centralized Error Handlers
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

const authRoutes      = require('./routes/auth');
const deliveryRoutes  = require('./routes/deliveries');
const userRoutes      = require('./routes/users');
const auditRoutes     = require('./routes/audit');
const selectlineRoutes = require('./routes/selectline');
const dashboardRoutes = require('./routes/dashboard');
const pushRoutes      = require('./routes/push');
const toursRoutes     = require('./routes/tours');
const geocodeRoutes   = require('./routes/geocode');
const cronRoutes      = require('./routes/cron');
const brandRoutes     = require('./routes/brand');
const lagerRoutes     = require('./routes/lager');
const debugRoutes     = require('./routes/debug');
const vehicleRoutes   = require('./routes/vehicles');
const driverRoutes    = require('./routes/drivers');
const adminRoutes     = require('./routes/admin');

const { initCronFromDB } = require('./services/cronService');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));
app.use('/api/geocode/', rateLimit({ windowMs: 60 * 1000, max: 30 }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('combined'));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

app.use('/api/auth',       authRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/users',      userRoutes);
app.use('/api/audit',      auditRoutes);
app.use('/api/selectline', selectlineRoutes);
app.use('/api/dashboard',  dashboardRoutes);
app.use('/api/push',       pushRoutes);
app.use('/api/tours',      toursRoutes);
app.use('/api/geocode',    geocodeRoutes);
app.use('/api/cron',       cronRoutes);
app.use('/api/brand',      brandRoutes);
app.use('/api/lager',      lagerRoutes);
app.use('/api/debug',      debugRoutes);
app.use('/api/fahrzeuge',  vehicleRoutes);
app.use('/api/fahrer',    driverRoutes);
app.use('/api/admin',     adminRoutes);

app.get('/api/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.use((req, res) => res.status(404).json({ message: 'Route nicht gefunden' }));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Interner Serverfehler' });
});

const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/gasdispo')
  .then(async () => {
    console.log('✅ MongoDB verbunden');
    app.listen(PORT, () => console.log(`🚀 Server läuft auf Port ${PORT}`));
    await initCronFromDB();
  })
  .catch(err => { console.error('❌ MongoDB:', err.message); process.exit(1); });

module.exports = app;

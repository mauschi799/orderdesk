require('dotenv').config();
const mongoose = require('mongoose');
const Delivery = require('../models/Delivery');
const AuditLog = require('../models/AuditLog');
const Tour = require('../models/Tour');

const clear = async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/orderdesk');
  console.log('Verbunden mit MongoDB');

  const d = await Delivery.deleteMany({});
  const t = await Tour.deleteMany({});
  const a = await AuditLog.deleteMany({});

  console.log(`Gelöscht: ${d.deletedCount} Lieferscheine, ${t.deletedCount} Touren, ${a.deletedCount} Audit-Einträge`);
  console.log('Benutzer & Einstellungen wurden NICHT gelöscht.');

  await mongoose.disconnect();
  process.exit(0);
};

clear().catch(err => { console.error(err); process.exit(1); });

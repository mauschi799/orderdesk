const mongoose = require('mongoose');

const pushSubscriptionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  subscription: {
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true }
    }
  },
  userAgent: String,
  isActive: { type: Boolean, default: true },
  // Which events this subscriber wants
  preferences: {
    statusGeaendert: { type: Boolean, default: true },
    lagerZugewiesen: { type: Boolean, default: true },
    importAbgeschlossen: { type: Boolean, default: true },
    auslieferungGestartet: { type: Boolean, default: true }
  }
}, { timestamps: true });

// Unique per user+endpoint
pushSubscriptionSchema.index({ user: 1, 'subscription.endpoint': 1 }, { unique: true });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);

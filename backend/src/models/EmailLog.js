const mongoose = require('mongoose');

const emailLogSchema = new mongoose.Schema({
  incident: { type: mongoose.Schema.Types.ObjectId, ref: 'Incident', required: true },
  service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
  emailType: { type: String, required: true },
  sentAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('EmailLog', emailLogSchema);

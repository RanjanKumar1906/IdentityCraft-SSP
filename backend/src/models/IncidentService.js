const mongoose = require('mongoose');

const incidentServiceSchema = new mongoose.Schema({
  incident: { type: mongoose.Schema.Types.ObjectId, ref: 'Incident', required: true },
  service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
  isAffected: { type: Boolean, default: true }
});

incidentServiceSchema.index({ incident: 1, service: 1 }, { unique: true });

module.exports = mongoose.model('IncidentService', incidentServiceSchema);

const mongoose = require('mongoose');

const incidentServerSchema = new mongoose.Schema({
  incident: { type: mongoose.Schema.Types.ObjectId, ref: 'Incident', required: true },
  server: { type: mongoose.Schema.Types.ObjectId, ref: 'Server', required: true }
});

incidentServerSchema.index({ incident: 1, server: 1 }, { unique: true });

module.exports = mongoose.model('IncidentServer', incidentServerSchema);

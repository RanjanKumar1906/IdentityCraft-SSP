const mongoose = require('mongoose');

const serverSchema = new mongoose.Schema({
  serverName: { type: String, required: true },
  serverCode: { type: String, required: true, unique: true, trim: true },
  ipAddress: { type: String, required: true },
  location: { type: String, required: true },
  status: { type: String, required: true },
  description: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Server', serverSchema);

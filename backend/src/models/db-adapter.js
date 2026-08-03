const mongoose = require('mongoose');

const useMongo = !!process.env.MONGODB_URI;

// We declare models early
let Admin, Server, Client, Incident;

if (useMongo) {
  console.log('[DB] Connecting to MongoDB via Mongoose...');
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('[DB] Connected to MongoDB.'))
    .catch(err => console.error('[DB] MongoDB connection error:', err));

  // Define Mongoose schemas
  const AdminSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password_hash: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    secret_code: { type: String, default: 'StatusSecret99!' },
    reset_token: { type: String },
    reset_token_expires: { type: Date }
  }, { timestamps: true });

  const ServerSchema = new mongoose.Schema({
    server_name: { type: String, required: true },
    server_code: { type: String, unique: true, required: true },
    ip_address: { type: String, required: true },
    location: { type: String, required: true },
    status: { type: String, default: 'Operational' },
    description: { type: String }
  }, { timestamps: true });

  const ClientSchema = new mongoose.Schema({
    client_name: { type: String, required: true },
    company_name: { type: String, required: true },
    contact_person: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true }
  }, { timestamps: true });

  const ServiceSchema = new mongoose.Schema({
    service_id: { type: String, unique: true, required: true },
    client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    server_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Server', required: true },
    active_status: { type: Number, default: 1 }
  }, { timestamps: true });

  const IncidentSchema = new mongoose.Schema({
    title: { type: String, required: true },
    type: { type: String, required: true },
    severity: { type: String, required: true },
    status: { type: String, required: true },
    start_time: { type: Date, required: true },
    end_time: { type: Date, required: true },
    description: { type: String },
    public_message: { type: String },
    internal_notes: { type: String },
    root_cause: { type: String },
    expected_resolution: { type: String },
    maintenance_window: { type: String },
    created_by: { type: String },
    servers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Server' }],
    services: [{ type: String }], // Array of service_id strings
    reminder_sent: { type: Boolean, default: false }
  }, { timestamps: true });

  const EmailLogSchema = new mongoose.Schema({
    incident_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Incident', required: true },
    service_id: { type: String, required: true },
    email_type: { type: String, required: true }
  }, { timestamps: true });

  const MongoAdmin = mongoose.models.Admin || mongoose.model('Admin', AdminSchema);
  const MongoServer = mongoose.models.Server || mongoose.model('Server', ServerSchema);
  const MongoClient = mongoose.models.Client || mongoose.model('Client', ClientSchema);
  const MongoService = mongoose.models.Service || mongoose.model('Service', ServiceSchema);
  const MongoIncident = mongoose.models.Incident || mongoose.model('Incident', IncidentSchema);
  const MongoEmailLog = mongoose.models.EmailLog || mongoose.model('EmailLog', EmailLogSchema);

  // Mappings to Unified Interface
  Admin = {
    async findByEmail(email) { return MongoAdmin.findOne({ email }).lean(); },
    async findByUsername(username) { return MongoAdmin.findOne({ username }).lean(); },
    async findById(id) { return MongoAdmin.findById(id).lean(); },
    async findByResetToken(token) { return MongoAdmin.findOne({ reset_token: token }).lean(); },
    async create(data) {
      const res = new MongoAdmin(data);
      await res.save();
      return res.toObject();
    },
    async update(id, data) { return MongoAdmin.findByIdAndUpdate(id, data, { new: true }).lean(); },
    async updatePassword(id, hash) { return MongoAdmin.findByIdAndUpdate(id, { password_hash: hash, reset_token: null, reset_token_expires: null }, { new: true }).lean(); }
  };

  Server = {
    async all() { return MongoServer.find({}).lean(); },
    async findById(id) { return MongoServer.findById(id).lean(); },
    async findByCode(code) { return MongoServer.findOne({ server_code: code }).lean(); },
    async create(data) {
      const res = new MongoServer(data);
      await res.save();
      return res.toObject();
    },
    async update(id, data) { return MongoServer.findByIdAndUpdate(id, data, { new: true }).lean(); },
    async delete(id) {
      const refCount = await MongoService.countDocuments({ server_id: id });
      if (refCount > 0) throw new Error('Cannot delete server node containing active domains.');
      return MongoServer.findByIdAndDelete(id);
    }
  };

  Client = {
    async all() {
      const services = await MongoService.find({}).populate('client_id').populate('server_id').lean();
      return services.map(s => ({
        id: s.client_id?._id,
        client_name: s.client_id?.client_name,
        company_name: s.client_id?.company_name,
        contact_person: s.client_id?.contact_person,
        email: s.client_id?.email,
        phone: s.client_id?.phone,
        service_id: s.service_id,
        server_id: s.server_id?._id,
        server_name: s.server_id?.server_name,
        server_code: s.server_id?.server_code,
        server_status: s.server_id?.status,
        active_status: s.active_status
      }));
    },
    async getServiceByDomain(domain) {
      const s = await MongoService.findOne({ service_id: domain }).populate('client_id').populate('server_id').lean();
      if (!s) return null;
      return {
        service_id: s.service_id,
        client_name: s.client_id?.client_name,
        company_name: s.client_id?.company_name,
        server_name: s.server_id?.server_name,
        server_code: s.server_id?.server_code,
        server_status: s.server_id?.status,
        active_status: s.active_status
      };
    },
    async create(data) {
      const newCli = new MongoClient({
        client_name: data.client_name,
        company_name: data.company_name,
        contact_person: data.contact_person,
        email: data.email,
        phone: data.phone
      });
      await newCli.save();

      const newSrv = new MongoService({
        service_id: data.service_id,
        client_id: newCli._id,
        server_id: data.server_id,
        active_status: 1
      });
      await newSrv.save();

      return { id: newCli._id, ...data };
    },
    async update(id, data) {
      await MongoClient.findByIdAndUpdate(id, {
        client_name: data.client_name,
        company_name: data.company_name,
        contact_person: data.contact_person,
        email: data.email,
        phone: data.phone
      });
      await MongoService.findOneAndUpdate({ client_id: id }, {
        service_id: data.service_id,
        server_id: data.server_id
      });
      return { id, ...data };
    },
    async delete(id) {
      await MongoService.deleteMany({ client_id: id });
      return MongoClient.findByIdAndDelete(id);
    },
    async getServicesByServer(serverIds) {
      const ids = Array.isArray(serverIds) ? serverIds : [serverIds];
      const services = await MongoService.find({ server_id: { $in: ids } }).populate('client_id').lean();
      return services.map(s => ({
        service_id: s.service_id,
        client_name: s.client_id?.client_name
      }));
    }
  };

  Incident = {
    async all() { return MongoIncident.find({}).sort({ start_time: -1 }).lean(); },
    async findById(id) { return MongoIncident.findById(id).lean(); },
    async create(data) {
      const inc = new MongoIncident({
        title: data.title,
        type: data.type,
        severity: data.severity,
        status: data.status,
        start_time: new Date(data.start_time),
        end_time: new Date(data.end_time),
        description: data.description,
        public_message: data.public_message || '',
        internal_notes: data.internal_notes || '',
        root_cause: data.root_cause || '',
        expected_resolution: data.expected_resolution || '',
        maintenance_window: data.maintenance_window || '',
        created_by: data.created_by,
        servers: data.servers || [],
        services: data.services || [],
        reminder_sent: false
      });
      await inc.save();
      return inc.toObject();
    },
    async update(id, data) {
      return MongoIncident.findByIdAndUpdate(id, {
        title: data.title,
        type: data.type,
        severity: data.severity,
        status: data.status,
        start_time: new Date(data.start_time),
        end_time: new Date(data.end_time),
        description: data.description,
        public_message: data.public_message,
        internal_notes: data.internal_notes,
        root_cause: data.root_cause,
        expected_resolution: data.expected_resolution,
        maintenance_window: data.maintenance_window,
        servers: data.servers || [],
        services: data.services || []
      }, { new: true }).lean();
    },
    async delete(id) {
      await MongoEmailLog.deleteMany({ incident_id: id });
      return MongoIncident.findByIdAndDelete(id);
    },
    async getRelations(id) {
      const inc = await MongoIncident.findById(id).lean();
      return {
        serverIds: inc ? inc.servers.map(s => s.toString()) : [],
        affectedServices: inc ? inc.services : []
      };
    },
    async getActiveSummary() {
      const activeInc = await MongoIncident.findOne({ status: 'Active' }).sort({ start_time: -1 }).lean();
      if (!activeInc) {
        return {
          statusClass: 'operational',
          bannerTitle: 'All Services Operational',
          bannerText: 'System status is normal. No active outages reported.'
        };
      }
      if (activeInc.type === 'Maintenance') {
        return {
          statusClass: 'maintenance',
          bannerTitle: 'Scheduled System Maintenance',
          bannerText: activeInc.public_message || activeInc.description || 'System upgrades are currently in progress.'
        };
      }
      return {
        statusClass: 'outage',
        bannerTitle: activeInc.title || 'System Disruption Detected',
        bannerText: activeInc.public_message || activeInc.description || 'We are experiencing active network problems.'
      };
    },
    async getPublicLists(page = 1, limit = 5) {
      const offset = (page - 1) * limit;
      const active = await MongoIncident.find({ status: 'Active' }).sort({ start_time: -1 }).lean();
      const upcoming = await MongoIncident.find({ status: 'Scheduled' }).sort({ start_time: 1 }).lean();
      const pastCount = await MongoIncident.countDocuments({ status: 'Resolved' });
      const past = await MongoIncident.find({ status: 'Resolved' })
        .sort({ updated_at: -1 })
        .skip(offset)
        .limit(limit)
        .lean();
      return { active, upcoming, past, pages: Math.ceil(pastCount / limit) || 1 };
    },
    async resolveOtherActive(incidentId, timestamp) {
      const query = { status: 'Active' };
      if (incidentId) query._id = { $ne: incidentId };
      const active = await MongoIncident.find(query);
      const list = [];
      for (const inc of active) {
        inc.status = 'Resolved';
        inc.updated_at = new Date(timestamp);
        await inc.save();
        list.push(inc.toObject());
      }
      return list;
    },
    async getDueScheduled(timestamp) {
      return MongoIncident.find({ status: 'Scheduled', start_time: { $lte: new Date(timestamp) } }).lean();
    },
    async getDueActive(timestamp) {
      return MongoIncident.find({ status: 'Active', end_time: { $lte: new Date(timestamp) } }).lean();
    },
    async getDueReminders(timestamp) {
      const tNow = new Date(timestamp);
      const tLimit = new Date(tNow.getTime() + 60 * 60 * 1000);
      return MongoIncident.find({
        status: 'Scheduled',
        reminder_sent: { $ne: true },
        start_time: { $lte: tLimit, $gt: tNow }
      }).lean();
    },
    async markReminderSent(id) {
      return MongoIncident.findByIdAndUpdate(id, { reminder_sent: true }, { new: true }).lean();
    },
    async isEmailLogged(incidentId, serviceId, emailType) {
      const log = await MongoEmailLog.findOne({ incident_id: incidentId, service_id: serviceId, email_type: emailType }).lean();
      return !!log;
    },
    async logEmail(incidentId, serviceId, emailType) {
      const log = new MongoEmailLog({ incident_id: incidentId, service_id: serviceId, email_type: emailType });
      return log.save();
    },
    async getAffectedClients(incidentId) {
      const inc = await MongoIncident.findById(incidentId).lean();
      if (!inc || !inc.services || inc.services.length === 0) return [];
      const services = await MongoService.find({ service_id: { $in: inc.services } }).populate('client_id').lean();
      return services.map(s => ({
        service_id: s.service_id,
        email: s.client_id?.email
      }));
    }
  };

} else {
  // Use pure JS JSON database fallback
  console.log('[DB] MONGODB_URI is not set. Loading pure JS JSON database repo fallback...');
  const jsonRepo = require('./json-repo');
  Admin = jsonRepo.Admin;
  Server = jsonRepo.Server;
  Client = jsonRepo.Client;
  Incident = jsonRepo.Incident;
}

module.exports = {
  useMongo,
  Admin,
  Server,
  Client,
  Incident
};

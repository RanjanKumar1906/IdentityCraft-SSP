const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, '..', '..', 'data', 'db.json');

// Ensure data folder exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Load db
let db = {
  admins: [],
  servers: [],
  clients: [],
  services: [],
  incidents: [],
  incident_servers: [],
  incident_services: [],
  email_logs: []
};

if (fs.existsSync(dbPath)) {
  try {
    db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  } catch (e) {
    console.error('[JSON DB] Error loading db.json, resetting to empty', e);
  }
}

function saveDb() {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
}

// Helper to generate unique IDs
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const Admin = {
  async findByEmail(email) {
    return db.admins.find(a => a.email.toLowerCase() === email.toLowerCase()) || null;
  },
  async findByUsername(username) {
    return db.admins.find(a => a.username === username) || null;
  },
  async findById(id) {
    return db.admins.find(a => String(a.id) === String(id)) || null;
  },
  async findByResetToken(token) {
    return db.admins.find(a => a.reset_token === token) || null;
  },
  async create(data) {
    const id = genId();
    const newAdmin = { id, ...data, secret_code: data.secret_code || 'StatusSecret99!', created_at: new Date().toISOString() };
    db.admins.push(newAdmin);
    saveDb();
    return newAdmin;
  },
  async update(id, data) {
    const admin = db.admins.find(a => String(a.id) === String(id));
    if (admin) {
      if (data.username !== undefined) admin.username = data.username;
      if (data.email !== undefined) admin.email = data.email;
      if (data.secret_code !== undefined) admin.secret_code = data.secret_code;
      if (data.password_hash !== undefined) admin.password_hash = data.password_hash;
      if (data.reset_token !== undefined) admin.reset_token = data.reset_token;
      if (data.reset_token_expires !== undefined) admin.reset_token_expires = data.reset_token_expires;
      admin.updated_at = new Date().toISOString();
      saveDb();
    }
    return admin;
  },
  async updatePassword(id, hash) {
    const admin = db.admins.find(a => String(a.id) === String(id));
    if (admin) {
      admin.password_hash = hash;
      admin.reset_token = null;
      admin.reset_token_expires = null;
      admin.updated_at = new Date().toISOString();
      saveDb();
    }
    return admin;
  }
};

const Server = {
  async all() {
    return [...db.servers].sort((a, b) => a.server_name.localeCompare(b.server_name));
  },
  async findById(id) {
    return db.servers.find(s => String(s.id) === String(id)) || null;
  },
  async findByCode(code) {
    return db.servers.find(s => s.server_code === code) || null;
  },
  async create(data) {
    const id = genId();
    const srv = { id, ...data, status: data.status || 'Operational', description: data.description || '', created_at: new Date().toISOString() };
    db.servers.push(srv);
    saveDb();
    return srv;
  },
  async update(id, data) {
    const srv = db.servers.find(s => String(s.id) === String(id));
    if (srv) {
      srv.server_name = data.server_name;
      srv.server_code = data.server_code;
      srv.ip_address = data.ip_address;
      srv.location = data.location;
      srv.status = data.status;
      srv.description = data.description;
      srv.updated_at = new Date().toISOString();
      saveDb();
    }
    return srv;
  },
  async delete(id) {
    const hasService = db.services.some(s => String(s.server_id) === String(id));
    if (hasService) throw new Error('Cannot delete server node containing active domains.');
    db.servers = db.servers.filter(s => String(s.id) !== String(id));
    saveDb();
  }
};

const Client = {
  async all() {
    return db.services.map(s => {
      const c = db.clients.find(cli => String(cli.id) === String(s.client_id));
      const sv = db.servers.find(srv => String(srv.id) === String(s.server_id));
      return {
        id: c ? c.id : null,
        client_name: c ? c.client_name : '',
        company_name: c ? c.company_name : '',
        contact_person: c ? c.contact_person : '',
        email: c ? c.email : '',
        phone: c ? c.phone : '',
        service_id: s.service_id,
        server_id: s.server_id,
        server_name: sv ? sv.server_name : '',
        server_code: sv ? sv.server_code : '',
        server_status: sv ? sv.status : 'Operational',
        active_status: s.active_status
      };
    });
  },
  async getServiceByDomain(domain) {
    const s = db.services.find(srv => srv.service_id.toLowerCase() === domain.toLowerCase());
    if (!s) return null;
    const c = db.clients.find(cli => String(cli.id) === String(s.client_id));
    const sv = db.servers.find(srv => String(srv.id) === String(s.server_id));
    return {
      service_id: s.service_id,
      client_name: c ? c.client_name : '',
      company_name: c ? c.company_name : '',
      server_name: sv ? sv.server_name : '',
      server_code: sv ? sv.server_code : '',
      server_status: sv ? sv.status : 'Operational',
      active_status: s.active_status
    };
  },
  async create(data) {
    const clientId = genId();
    const client = {
      id: clientId,
      client_name: data.client_name,
      company_name: data.company_name,
      contact_person: data.contact_person,
      email: data.email,
      phone: data.phone,
      created_at: new Date().toISOString()
    };
    db.clients.push(client);

    const service = {
      service_id: data.service_id,
      client_id: clientId,
      server_id: data.server_id,
      active_status: 1,
      created_at: new Date().toISOString()
    };
    db.services.push(service);

    saveDb();
    return { id: clientId, ...data };
  },
  async update(id, data) {
    const client = db.clients.find(c => String(c.id) === String(id));
    if (client) {
      client.client_name = data.client_name;
      client.company_name = data.company_name;
      client.contact_person = data.contact_person;
      client.email = data.email;
      client.phone = data.phone;
      client.updated_at = new Date().toISOString();
    }
    const s = db.services.find(srv => String(srv.client_id) === String(id));
    if (s) {
      s.service_id = data.service_id;
      s.server_id = data.server_id;
      s.updated_at = new Date().toISOString();
    }
    saveDb();
    return { id, ...data };
  },
  async delete(id) {
    db.clients = db.clients.filter(c => String(c.id) !== String(id));
    db.services = db.services.filter(s => String(s.client_id) !== String(id));
    saveDb();
  },
  async getServicesByServer(serverIds) {
    const ids = Array.isArray(serverIds) ? serverIds.map(String) : [String(serverIds)];
    const filtered = db.services.filter(s => ids.includes(String(s.server_id)));
    return filtered.map(s => {
      const c = db.clients.find(cli => String(cli.id) === String(s.client_id));
      return {
        service_id: s.service_id,
        client_name: c ? c.client_name : ''
      };
    });
  }
};

const Incident = {
  async all() {
    return [...db.incidents].sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
  },
  async findById(id) {
    return db.incidents.find(i => String(i.id) === String(id)) || null;
  },
  async create(data) {
    const id = genId();
    const inc = {
      id,
      title: data.title,
      type: data.type,
      severity: data.severity,
      status: data.status,
      start_time: data.start_time,
      end_time: data.end_time,
      description: data.description,
      public_message: data.public_message || '',
      internal_notes: data.internal_notes || '',
      root_cause: data.root_cause || '',
      expected_resolution: data.expected_resolution || '',
      maintenance_window: data.maintenance_window || '',
      created_by: data.created_by,
      reminder_sent: false,
      created_at: new Date().toISOString()
    };
    db.incidents.push(inc);

    // map relations
    (data.servers || []).forEach(srvId => {
      db.incident_servers.push({ incident_id: id, server_id: srvId });
    });

    if (data.servers && data.servers.length > 0) {
      const srvIds = data.servers.map(String);
      const serverServices = db.services.filter(s => srvIds.includes(String(s.server_id)));
      serverServices.forEach(s => {
        const isAffected = (data.services || []).includes(s.service_id);
        db.incident_services.push({ incident_id: id, service_id: s.service_id, is_affected: isAffected ? 1 : 0 });
      });
    }

    saveDb();
    return inc;
  },
  async update(id, data) {
    const inc = db.incidents.find(i => String(i.id) === String(id));
    if (inc) {
      inc.title = data.title;
      inc.type = data.type;
      inc.severity = data.severity;
      inc.status = data.status;
      inc.start_time = data.start_time;
      inc.end_time = data.end_time;
      inc.description = data.description;
      inc.public_message = data.public_message;
      inc.internal_notes = data.internal_notes;
      inc.root_cause = data.root_cause;
      inc.expected_resolution = data.expected_resolution;
      inc.maintenance_window = data.maintenance_window;
      inc.updated_at = new Date().toISOString();

      // update relations
      db.incident_servers = db.incident_servers.filter(rel => String(rel.incident_id) !== String(id));
      (data.servers || []).forEach(srvId => {
        db.incident_servers.push({ incident_id: id, server_id: srvId });
      });

      db.incident_services = db.incident_services.filter(rel => String(rel.incident_id) !== String(id));
      if (data.servers && data.servers.length > 0) {
        const srvIds = data.servers.map(String);
        const serverServices = db.services.filter(s => srvIds.includes(String(s.server_id)));
        serverServices.forEach(s => {
          const isAffected = (data.services || []).includes(s.service_id);
          db.incident_services.push({ incident_id: id, service_id: s.service_id, is_affected: isAffected ? 1 : 0 });
        });
      }
      saveDb();
    }
    return inc;
  },
  async delete(id) {
    db.incidents = db.incidents.filter(i => String(i.id) !== String(id));
    db.incident_servers = db.incident_servers.filter(rel => String(rel.incident_id) !== String(id));
    db.incident_services = db.incident_services.filter(rel => String(rel.incident_id) !== String(id));
    db.email_logs = db.email_logs.filter(el => String(el.incident_id) !== String(id));
    saveDb();
  },
  async getRelations(id) {
    const servers = db.incident_servers.filter(rel => String(rel.incident_id) === String(id));
    const services = db.incident_services.filter(rel => String(rel.incident_id) === String(id) && rel.is_affected === 1);
    return {
      serverIds: servers.map(rel => rel.server_id),
      affectedServices: services.map(rel => rel.service_id)
    };
  },
  async getActiveSummary() {
    const activeInc = [...db.incidents]
      .filter(i => i.status === 'Active')
      .sort((a, b) => new Date(b.start_time) - new Date(a.start_time))[0];
    
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
    const active = db.incidents.filter(i => i.status === 'Active').sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
    const upcoming = db.incidents.filter(i => i.status === 'Scheduled').sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    
    const resolved = db.incidents.filter(i => i.status === 'Resolved').sort((a, b) => new Date(b.updated_at || b.end_time) - new Date(a.updated_at || a.end_time));
    const pastCount = resolved.length;
    const past = resolved.slice(offset, offset + limit);

    return {
      active,
      upcoming,
      past,
      pages: Math.ceil(pastCount / limit) || 1
    };
  },
  async resolveOtherActive(incidentId, timestamp) {
    const active = db.incidents.filter(i => i.status === 'Active' && String(i.id) !== String(incidentId));
    active.forEach(inc => {
      inc.status = 'Resolved';
      inc.updated_at = timestamp;
    });
    if (active.length > 0) saveDb();
    return active;
  },
  async getDueScheduled(timestamp) {
    const t = new Date(timestamp);
    return db.incidents.filter(i => i.status === 'Scheduled' && new Date(i.start_time) <= t);
  },
  async getDueActive(timestamp) {
    const t = new Date(timestamp);
    return db.incidents.filter(i => i.status === 'Active' && new Date(i.end_time) <= t);
  },
  async getDueReminders(timestamp) {
    const tNow = new Date(timestamp);
    const tLimit = new Date(tNow.getTime() + 60 * 60 * 1000);
    return db.incidents.filter(i => {
      if (i.status !== 'Scheduled') return false;
      if (i.reminder_sent === true || i.reminder_sent === 1) return false;
      const startTime = new Date(i.start_time);
      return startTime <= tLimit && startTime > tNow;
    });
  },
  async markReminderSent(id) {
    const inc = db.incidents.find(i => String(i.id) === String(id));
    if (inc) {
      inc.reminder_sent = true;
      saveDb();
    }
    return inc;
  },
  async isEmailLogged(incidentId, serviceId, emailType) {
    return db.email_logs.some(el => String(el.incident_id) === String(incidentId) && el.service_id === serviceId && el.email_type === emailType);
  },
  async logEmail(incidentId, serviceId, emailType) {
    db.email_logs.push({ incident_id: incidentId, service_id: serviceId, email_type: emailType, created_at: new Date().toISOString() });
    saveDb();
  },
  async getAffectedClients(incidentId) {
    const affectedRels = db.incident_services.filter(rel => String(rel.incident_id) === String(incidentId) && rel.is_affected === 1);
    const affectedServiceIds = affectedRels.map(rel => rel.service_id);
    
    const matchedServices = db.services.filter(s => affectedServiceIds.includes(s.service_id));
    return matchedServices.map(s => {
      const c = db.clients.find(cli => String(cli.id) === String(s.client_id));
      return {
        service_id: s.service_id,
        email: c ? c.email : ''
      };
    });
  }
};

module.exports = {
  Admin,
  Server,
  Client,
  Incident
};

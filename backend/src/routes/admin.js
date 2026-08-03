const express = require('express');
const Server = require('../models/Server');
const Client = require('../models/Client');
const Service = require('../models/Service');
const Incident = require('../models/Incident');
const IncidentServer = require('../models/IncidentServer');
const IncidentService = require('../models/IncidentService');
const EmailLog = require('../models/EmailLog');
const { requireAuth } = require('../middleware/auth');
const { serverRules, clientRules, incidentRules, validate } = require('../validation');
const { activateIncident, resolveIncident, sendManualReminders } = require('../job-crons');

const router = express.Router();
router.use(requireAuth);

router.get('/stats', async (req, res) => {
  try {
    const [serversCount, servicesCount, activeIncidentsCount] = await Promise.all([
      Server.countDocuments(),
      Service.countDocuments(),
      Incident.countDocuments({ status: 'Active' })
    ]);

    return res.json({ serversCount, servicesCount, activeIncidentsCount });
  } catch (err) {
    console.error('Stats lookup failed:', err);
    res.status(500).json({ error: 'Failed to load dashboard stats.' });
  }
});

router.get('/servers', async (req, res) => {
  try {
    const servers = await Server.find().sort({ createdAt: -1 }).lean();
    return res.json(servers);
  } catch (err) {
    console.error('Failed to fetch servers:', err);
    res.status(500).json({ error: 'Failed to fetch servers.' });
  }
});

router.post('/servers', serverRules, validate, async (req, res) => {
  try {
    const server = await Server.create({
      serverName: req.body.server_name,
      serverCode: req.body.server_code,
      ipAddress: req.body.ip_address,
      location: req.body.location,
      status: req.body.status,
      description: req.body.description
    });
    return res.status(201).json(server);
  } catch (err) {
    console.error('Create server failed:', err);
    res.status(500).json({ error: 'Database insert error. Please try again.' });
  }
});

router.put('/servers/:id', serverRules, validate, async (req, res) => {
  try {
    const server = await Server.findByIdAndUpdate(
      req.params.id,
      {
        serverName: req.body.server_name,
        serverCode: req.body.server_code,
        ipAddress: req.body.ip_address,
        location: req.body.location,
        status: req.body.status,
        description: req.body.description,
        updatedAt: new Date()
      },
      { new: true }
    );
    if (!server) {
      return res.status(404).json({ error: 'Server not found.' });
    }
    return res.json(server);
  } catch (err) {
    console.error('Update server failed:', err);
    res.status(500).json({ error: 'Failed to update server.' });
  }
});

router.delete('/servers/:id', async (req, res) => {
  try {
    const serviceCount = await Service.countDocuments({ server: req.params.id });
    if (serviceCount > 0) {
      return res.status(400).json({ error: 'Cannot delete server because it has active client services assigned to it.' });
    }
    await Server.findByIdAndDelete(req.params.id);
    return res.json({ message: 'Server deleted successfully.' });
  } catch (err) {
    console.error('Delete server failed:', err);
    res.status(500).json({ error: 'Failed to delete server.' });
  }
});

router.get('/clients', async (req, res) => {
  try {
    const clients = await Client.find().sort({ createdAt: -1 }).lean();
    return res.json(clients);
  } catch (err) {
    console.error('Fetch clients failed:', err);
    res.status(500).json({ error: 'Failed to fetch clients.' });
  }
});

router.post('/clients', clientRules, validate, async (req, res) => {
  try {
    const client = await Client.create({
      clientName: req.body.client_name,
      companyName: req.body.company_name,
      contactPerson: req.body.contact_person,
      email: req.body.email,
      phone: req.body.phone
    });

    const service = await Service.create({
      serviceId: req.body.service_id,
      client: client._id,
      server: req.body.server_id,
      activeStatus: true
    });

    if (req.body.notify_client === '1') {
      const serverIncidents = await IncidentServer.find({ server: req.body.server_id })
        .populate({ path: 'incident', match: { status: { $ne: 'Resolved' } } })
        .lean();

      const affectedIncidents = serverIncidents.filter((link) => link.incident);
      for (const link of affectedIncidents) {
        await IncidentService.create({ incident: link.incident._id, service: service._id, isAffected: true });
        if (link.incident.type !== 'Maintenance') {
          await require('../mail').sendIncidentEmail(link.incident, service.serviceId, client.email, 'Initial');
          await EmailLog.create({ incident: link.incident._id, service: service._id, emailType: 'Initial' });
        }
      }
    }

    return res.status(201).json({ client, service });
  } catch (err) {
    console.error('Create client failed:', err);
    res.status(500).json({ error: 'An error occurred while creating client service.' });
  }
});

router.put('/clients/:id', clientRules, validate, async (req, res) => {
  try {
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      {
        clientName: req.body.client_name,
        companyName: req.body.company_name,
        contactPerson: req.body.contact_person,
        email: req.body.email,
        phone: req.body.phone,
        updatedAt: new Date()
      },
      { new: true }
    );
    if (!client) {
      return res.status(404).json({ error: 'Client not found.' });
    }

    const service = await Service.findOneAndUpdate(
      { client: client._id, serviceId: req.body.original_service_id },
      { serviceId: req.body.service_id, server: req.body.server_id, updatedAt: new Date() },
      { new: true }
    );

    return res.json({ client, service });
  } catch (err) {
    console.error('Update client failed:', err);
    res.status(500).json({ error: 'Failed to update client details.' });
  }
});

router.delete('/clients/:id', async (req, res) => {
  try {
    await Client.findByIdAndDelete(req.params.id);
    return res.json({ message: 'Client service deleted successfully.' });
  } catch (err) {
    console.error('Delete client failed:', err);
    res.status(500).json({ error: 'Failed to delete client service.' });
  }
});

router.get('/incidents', async (req, res) => {
  try {
    const incidents = await Incident.find().sort({ createdAt: -1 }).lean();
    return res.json(incidents);
  } catch (err) {
    console.error('Fetch incidents failed:', err);
    res.status(500).json({ error: 'Failed to fetch incidents.' });
  }
});

router.post('/incidents', incidentRules, validate, async (req, res) => {
  try {
    const servers = Array.isArray(req.body.servers) ? req.body.servers : [req.body.servers];
    const checkedServices = req.body.services ? (Array.isArray(req.body.services) ? req.body.services : [req.body.services]) : [];
    const startTime = new Date(req.body.start_time);
    const endTime = new Date(req.body.end_time);
    const status = startTime <= new Date() ? 'Active' : 'Scheduled';

    const incident = await Incident.create({
      title: req.body.title,
      type: req.body.type,
      severity: req.body.severity,
      status,
      startTime,
      endTime,
      description: req.body.description,
      publicMessage: req.body.public_message,
      internalNotes: req.body.internal_notes,
      rootCause: req.body.root_cause,
      expectedResolution: req.body.expected_resolution,
      maintenanceWindow: req.body.maintenance_window,
      createdBy: req.user.username
    });

    await Promise.all(servers.map((serverId) => IncidentServer.create({ incident: incident._id, server: serverId })));

    const allServices = await Service.find({ server: { $in: servers } }).lean();
    await Promise.all(
      allServices.map((service) =>
        IncidentService.create({
          incident: incident._id,
          service: service._id,
          isAffected: checkedServices.includes(service.serviceId)
        })
      )
    );

    if (status === 'Active') {
      await activateIncident(incident._id);
    }

    return res.status(201).json(incident);
  } catch (err) {
    console.error('Create incident failed:', err);
    res.status(500).json({ error: 'An error occurred while declaring the incident.' });
  }
});

router.put('/incidents/:id', incidentRules, validate, async (req, res) => {
  try {
    const servers = Array.isArray(req.body.servers) ? req.body.servers : [req.body.servers];
    const checkedServices = req.body.services ? (Array.isArray(req.body.services) ? req.body.services : [req.body.services]) : [];
    const startTime = new Date(req.body.start_time);
    const endTime = new Date(req.body.end_time);

    const incident = await Incident.findByIdAndUpdate(
      req.params.id,
      {
        title: req.body.title,
        type: req.body.type,
        severity: req.body.severity,
        status: req.body.status,
        startTime,
        endTime,
        description: req.body.description,
        publicMessage: req.body.public_message,
        internalNotes: req.body.internal_notes,
        rootCause: req.body.root_cause,
        expectedResolution: req.body.expected_resolution,
        maintenanceWindow: req.body.maintenance_window,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!incident) {
      return res.status(404).json({ error: 'Incident not found.' });
    }

    await IncidentServer.deleteMany({ incident: incident._id });
    await Promise.all(servers.map((serverId) => IncidentServer.create({ incident: incident._id, server: serverId })));

    await IncidentService.deleteMany({ incident: incident._id });
    const allServices = await Service.find({ server: { $in: servers } }).lean();

    await Promise.all(
      allServices.map((service) =>
        IncidentService.create({
          incident: incident._id,
          service: service._id,
          isAffected: checkedServices.includes(service.serviceId)
        })
      )
    );

    if (req.body.status === 'Active') {
      await activateIncident(incident._id);
    } else if (req.body.status === 'Resolved') {
      await resolveIncident(incident._id);
    }

    return res.json(incident);
  } catch (err) {
    console.error('Update incident failed:', err);
    res.status(500).json({ error: 'An error occurred while updating the incident.' });
  }
});

router.delete('/incidents/:id', async (req, res) => {
  try {
    await Incident.findByIdAndDelete(req.params.id);
    await IncidentServer.deleteMany({ incident: req.params.id });
    await IncidentService.deleteMany({ incident: req.params.id });
    return res.json({ message: 'Incident deleted successfully.' });
  } catch (err) {
    console.error('Delete incident failed:', err);
    res.status(500).json({ error: 'Failed to delete incident.' });
  }
});

router.post('/incidents/:id/notify', async (req, res) => {
  try {
    const count = await sendManualReminders(req.params.id);
    return res.json({ message: `Manual reminder alerts sent to ${count} service client(s) successfully.` });
  } catch (err) {
    console.error('Manual notify failed:', err);
    res.status(500).json({ error: 'Failed to send manual reminder alerts.' });
  }
});

module.exports = router;

const express = require('express');
const Service = require('../models/Service');
const Incident = require('../models/Incident');
const IncidentServer = require('../models/IncidentServer');
const IncidentService = require('../models/IncidentService');
const Server = require('../models/Server');

const router = express.Router();

function parseIds(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

router.get('/status-summary', async (req, res) => {
  try {
    const activeIncidents = await Incident.find({ status: 'Active' }).lean();
    const activeIncidentIds = activeIncidents.map((item) => item._id);

    const activeIncidentsCount = await IncidentService.countDocuments({
      incident: { $in: activeIncidentIds },
      isAffected: true
    });

    const outageCount = await Incident.countDocuments({
      _id: { $in: activeIncidentIds },
      type: { $in: ['Down', 'Major Outage', 'Partial Outage'] }
    });

    let statusClass = 'operational';
    let bannerTitle = 'All Systems Operational';
    let bannerText = 'Everything is working as expected.';

    if (activeIncidentsCount > 0) {
      if (outageCount > 0) {
        statusClass = 'outage';
        bannerTitle = 'System Outages Reported';
        bannerText = 'We are currently experiencing service interruptions.';
      } else {
        statusClass = 'maintenance';
        bannerTitle = 'System Maintenance / Performance Issues';
        bannerText = 'Some services are undergoing scheduled maintenance or experiencing degraded performance.';
      }
    }

    const activeServersDocs = await IncidentServer.find({
      incident: { $in: activeIncidentIds }
    })
      .populate('server')
      .populate({ path: 'incident', select: 'title type startTime endTime publicMessage description' })
      .lean();

    const activeServers = [];
    const seen = new Set();
    activeServersDocs.forEach((doc) => {
      if (!doc.server || !doc.incident) return;
      const key = String(doc.server._id);
      if (seen.has(key)) return;
      seen.add(key);
      activeServers.push({
        server_name: doc.server.serverName,
        server_code: doc.server.serverCode,
        location: doc.server.location,
        incident_title: doc.incident.title,
        incident_type: doc.incident.type,
        start_time: doc.incident.startTime,
        end_time: doc.incident.endTime,
        public_message: doc.incident.publicMessage,
        description: doc.incident.description
      });
    });

    const limit = 5;
    const currentPage = Math.max(1, parseInt(req.query.current_page, 10) || 1);
    const scheduledPage = Math.max(1, parseInt(req.query.scheduled_page, 10) || 1);
    const pastPage = Math.max(1, parseInt(req.query.past_page, 10) || 1);

    const [currentTotal, scheduledTotal, pastTotal] = await Promise.all([
      Incident.countDocuments({ status: 'Active' }),
      Incident.countDocuments({ status: 'Scheduled' }),
      Incident.countDocuments({ status: 'Resolved' })
    ]);

    const currentIncidents = await Incident.find({ status: 'Active' })
      .sort({ startTime: -1 })
      .skip((currentPage - 1) * limit)
      .limit(limit)
      .lean();

    const scheduledIncidents = await Incident.find({ status: 'Scheduled' })
      .sort({ startTime: 1 })
      .skip((scheduledPage - 1) * limit)
      .limit(limit)
      .lean();

    const pastIncidents = await Incident.find({ status: 'Resolved' })
      .sort({ endTime: -1 })
      .skip((pastPage - 1) * limit)
      .limit(limit)
      .lean();

    const pastIncidentsWithServers = await Promise.all(
      pastIncidents.map(async (incident) => {
        const serverLinks = await IncidentServer.find({ incident: incident._id }).populate('server', 'serverName').lean();
        return {
          ...incident,
          server_names: serverLinks.map((link) => link.server?.serverName).filter(Boolean).join(', ')
        };
      })
    );

    return res.json({
      statusClass,
      bannerTitle,
      bannerText,
      activeIncidentsCount,
      activeServers,
      currentIncidents,
      currentPage,
      currentTotalPages: Math.ceil(currentTotal / limit),
      scheduledIncidents,
      scheduledPage,
      scheduledTotalPages: Math.ceil(scheduledTotal / limit),
      pastIncidents: pastIncidentsWithServers,
      pastPage,
      pastTotalPages: Math.ceil(pastTotal / limit)
    });
  } catch (err) {
    console.error('Error loading status summary:', err);
    res.status(500).json({ error: 'Failed to load status summary.' });
  }
});

router.get('/search', async (req, res) => {
  const domain = (req.query.domain || '').trim();
  if (!domain) {
    return res.status(400).json({ error: 'Service ID / Domain is required.' });
  }

  try {
    const service = await Service.findOne({ serviceId: domain })
      .populate('client')
      .populate('server')
      .lean();

    if (!service) {
      return res.status(404).json({ error: 'Service ID not found. Verify domain and try again.' });
    }

    const incidentLink = await IncidentService.findOne({
      service: service._id,
      isAffected: true
    })
      .populate({ path: 'incident', match: { status: 'Active' } })
      .sort({ _id: -1 })
      .lean();

    return res.json({
      service_id: service.serviceId,
      client_name: service.client?.clientName,
      company_name: service.client?.companyName,
      active_status: service.activeStatus,
      incident: incidentLink?.incident || null
    });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed due to internal error.' });
  }
});

router.get('/servers/:serverId/active-incidents', async (req, res) => {
  const { serverId } = req.params;
  try {
    const server = await Server.findById(serverId).lean();
    if (!server) {
      return res.status(404).json({ error: 'Server not found.' });
    }

    const incidentLinks = await IncidentServer.find({ server: server._id })
      .populate({ path: 'incident', match: { status: { $ne: 'Resolved' } }, select: '_id' })
      .lean();

    const hasIncident = incidentLinks.some((link) => link.incident);
    return res.json({ hasIncident });
  } catch (err) {
    console.error('Active incidents lookup failed:', err);
    res.status(500).json({ error: 'Failed to inspect server incidents.' });
  }
});

router.get('/servers/services', async (req, res) => {
  const ids = parseIds(req.query.serverIds);
  if (ids.length === 0) {
    return res.json([]);
  }

  try {
    const services = await Service.find({ server: { $in: ids } })
      .populate('client', 'clientName')
      .lean();

    return res.json(
      services.map((service) => ({
        service_id: service.serviceId,
        client_name: service.client?.clientName || 'Unknown'
      }))
    );
  } catch (err) {
    console.error('Fetch services failed:', err);
    res.status(500).json({ error: 'Failed to fetch services.' });
  }
});

router.get('/incidents/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const incident = await Incident.findById(id).lean();
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found.' });
    }

    const servers = await IncidentServer.find({ incident: incident._id }).lean();
    const services = await IncidentService.find({ incident: incident._id, isAffected: true }).lean();

    return res.json({
      incident,
      serverIds: servers.map((item) => String(item.server)),
      affectedServices: services.map((item) => String(item.service))
    });
  } catch (err) {
    console.error('Failed to fetch incident details:', err);
    res.status(500).json({ error: 'Failed to fetch incident details.' });
  }
});

module.exports = router;

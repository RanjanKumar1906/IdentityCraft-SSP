const { query } = require('./db');
const { sendIncidentEmail } = require('./mail');

async function sendTransitionEmails(incident, state) {
  try {
    const affectedServices = await query.all(`
      SELECT s.service_id, c.email
      FROM incident_services ins
      JOIN services s ON ins.service_id = s.service_id
      JOIN clients c ON s.client_id = c.id
      WHERE ins.incident_id = ? AND ins.is_affected = 1
    `, [incident.id]);

    console.log(`[Jobs] Preparing to send [${state}] emails for incident ${incident.id} to ${affectedServices.length} client(s)...`);

    for (const service of affectedServices) {
      const alreadySent = await query.get(`
        SELECT id FROM email_logs
        WHERE incident_id = ? AND service_id = ? AND email_type = ?
      `, [incident.id, service.service_id, state]);

      if (!alreadySent) {
        console.log(`[Jobs] Dispatching ${state} email to ${service.email} (Domain: ${service.service_id})`);
        await sendIncidentEmail(incident, service.service_id, service.email, state);
        await query.run(`
          INSERT INTO email_logs (incident_id, service_id, email_type)
          VALUES (?, ?, ?)
        `, [incident.id, service.service_id, state]);
      }
    }
  } catch (err) {
    console.error(`[Jobs] Error dispatching transition emails for incident ${incident.id}:`, err);
  }
}

async function activateIncident(incidentId, timestamp) {
  console.log(`[Jobs] Activating incident ID: ${incidentId}...`);

  const activeIncidents = await query.all("SELECT id FROM incidents WHERE status = 'Active' AND id != ?", [incidentId]);
  for (const activeInc of activeIncidents) {
    console.log(`[Jobs] Enforcing single-active rule: Resolving previously active incident ID: ${activeInc.id}`);
    await resolveIncident(activeInc.id, timestamp);
  }

  await query.run(`
    UPDATE incidents
    SET status = 'Active', updated_at = ?
    WHERE id = ?
  `, [timestamp, incidentId]);

  const incident = await query.get('SELECT * FROM incidents WHERE id = ?', [incidentId]);
  if (incident && incident.type !== 'Maintenance') {
    await sendTransitionEmails(incident, 'Active');
  } else {
    console.log(`[Jobs] Suppression: Incident ${incidentId} is of type 'Maintenance'. No emails dispatched.`);
  }
}

async function resolveIncident(incidentId, timestamp) {
  console.log(`[Jobs] Resolving incident ID: ${incidentId}...`);

  await query.run(`
    UPDATE incidents
    SET status = 'Resolved', updated_at = ?
    WHERE id = ?
  `, [timestamp, incidentId]);

  const incident = await query.get('SELECT * FROM incidents WHERE id = ?', [incidentId]);
  if (incident && incident.type !== 'Maintenance') {
    await sendTransitionEmails(incident, 'Resolved');
  } else {
    console.log(`[Jobs] Suppression: Incident ${incidentId} is of type 'Maintenance'. No emails dispatched.`);
  }
}

async function runIncidentJobs() {
  console.log('[Jobs] Executing incident status flow checks...');
  const now = new Date().toISOString();

  try {
    const dueScheduled = await query.all(`
      SELECT * FROM incidents
      WHERE status = 'Scheduled' AND start_time <= ?
      ORDER BY start_time ASC
    `, [now]);

    if (dueScheduled.length > 0) {
      console.log(`[Jobs] Found ${dueScheduled.length} scheduled incident(s) due to start.`);
      for (const incident of dueScheduled) {
        await activateIncident(incident.id, now);
      }
    }

    const dueActive = await query.all(`
      SELECT * FROM incidents
      WHERE status = 'Active' AND end_time <= ?
      ORDER BY end_time ASC
    `, [now]);

    if (dueActive.length > 0) {
      console.log(`[Jobs] Found ${dueActive.length} active incident(s) due to end.`);
      for (const incident of dueActive) {
        await resolveIncident(incident.id, now);
      }
    }
  } catch (err) {
    console.error('[Jobs] Error executing background transitions:', err);
  }
}

module.exports = {
  runIncidentJobs,
  activateIncident,
  resolveIncident,
  sendTransitionEmails
};

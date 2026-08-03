const { Incident } = require('./models/db-adapter');
const { sendIncidentEmail } = require('./mail');

async function sendTransitionEmails(incident, state) {
  try {
    const affectedServices = await Incident.getAffectedClients(incident.id || incident._id);

    console.log(`[Jobs] Preparing to send [${state}] emails for incident ${incident.id || incident._id} to ${affectedServices.length} client(s)...`);

    for (const service of affectedServices) {
      const alreadySent = await Incident.isEmailLogged(incident.id || incident._id, service.service_id, state);

      if (!alreadySent) {
        console.log(`[Jobs] Dispatching ${state} email to ${service.email} (Domain: ${service.service_id})`);
        await sendIncidentEmail(incident, service.service_id, service.email, state);
        await Incident.logEmail(incident.id || incident._id, service.service_id, state);
      }
    }
  } catch (err) {
    console.error(`[Jobs] Error dispatching transition emails for incident ${incident.id || incident._id}:`, err);
  }
}

async function activateIncident(incidentId, timestamp) {
  console.log(`[Jobs] Activating incident ID: ${incidentId}...`);

  // Enforce single active rule: Resolve other active incidents first
  const resolvedList = await Incident.resolveOtherActive(incidentId, timestamp);
  for (const activeInc of resolvedList) {
    console.log(`[Jobs] Enforcing single-active rule: Resolving previously active incident ID: ${activeInc.id || activeInc._id}`);
    if (activeInc.type !== 'Maintenance') {
      await sendTransitionEmails(activeInc, 'Resolved');
    }
  }

  await Incident.update(incidentId, { status: 'Active', updated_at: timestamp });

  const incident = await Incident.findById(incidentId);
  if (incident && incident.type !== 'Maintenance') {
    await sendTransitionEmails(incident, 'Active');
  } else {
    console.log(`[Jobs] Suppression: Incident ${incidentId} is of type 'Maintenance'. No emails dispatched.`);
  }
}

async function resolveIncident(incidentId, timestamp) {
  console.log(`[Jobs] Resolving incident ID: ${incidentId}...`);

  await Incident.update(incidentId, { status: 'Resolved', updated_at: timestamp });

  const incident = await Incident.findById(incidentId);
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
    const dueScheduled = await Incident.getDueScheduled(now);

    if (dueScheduled.length > 0) {
      console.log(`[Jobs] Found ${dueScheduled.length} scheduled incident(s) due to start.`);
      for (const incident of dueScheduled) {
        await activateIncident(incident.id || incident._id, now);
      }
    }

    const dueActive = await Incident.getDueActive(now);

    if (dueActive.length > 0) {
      console.log(`[Jobs] Found ${dueActive.length} active incident(s) due to end.`);
      for (const incident of dueActive) {
        await resolveIncident(incident.id || incident._id, now);
      }
    }

    // 1-hour pre-outage reminder notification check
    const dueReminders = await Incident.getDueReminders(now);
    if (dueReminders.length > 0) {
      console.log(`[Jobs] Found ${dueReminders.length} scheduled incident(s) due for 1-hour reminder.`);
      for (const incident of dueReminders) {
        console.log(`[Jobs] Dispatching 1-hour reminders for incident ID: ${incident.id || incident._id}...`);
        const affectedServices = await Incident.getAffectedClients(incident.id || incident._id);
        
        for (const service of affectedServices) {
          await sendIncidentEmail(incident, service.service_id, service.email, 'Reminder');
          await Incident.logEmail(incident.id || incident._id, service.service_id, 'Reminder');
        }
        
        await Incident.markReminderSent(incident.id || incident._id);
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

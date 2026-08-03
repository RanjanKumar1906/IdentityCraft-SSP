const cron = require('node-cron');
const { Incident } = require('./models/db-adapter');
const { sendIncidentEmail } = require('./mail');
const { runIncidentJobs } = require('./job-crons');

/**
 * Scan database and trigger status lifecycle updates.
 */
async function runReminderCron() {
  console.log('[Cron] Scanning timelines for status lifecycle transitions...');
  await runIncidentJobs();
}

/**
 * Triggers status notifications manually for a specific incident.
 * Sends 'Active' (Initial) or 'Resolved' alerts based on current status.
 * Bypasses email notification if the incident type is 'Maintenance'.
 * @param {number|string} incidentId 
 */
async function sendManualReminders(incidentId) {
  try {
    const incident = await Incident.findById(incidentId);
    if (!incident) {
      throw new Error(`Incident not found: ${incidentId}`);
    }

    if (incident.type === 'Maintenance') {
      console.log(`[Manual Notify] Suppression: Incident ${incidentId} is of type 'Maintenance'. Skipping manual notification.`);
      return 0;
    }

    const emailType = incident.status === 'Resolved' ? 'Resolved' : 'Active';

    const affectedServices = await Incident.getAffectedClients(incidentId);

    console.log(`[Manual Notify] Manually sending [${emailType}] notifications for incident ${incidentId} to ${affectedServices.length} client(s)...`);

    for (const service of affectedServices) {
      await sendIncidentEmail(incident, service.service_id, service.email, emailType);
      
      // Log it
      await Incident.logEmail(incidentId, service.service_id, emailType);
    }
    
    return affectedServices.length;
  } catch (err) {
    console.error('[Manual Notify] Error sending manual notifications:', err);
    throw err;
  }
}

/**
 * Start the cron runner
 */
function startCron() {
  // Run status checks every minute so automated transitions occur in real time
  cron.schedule('* * * * *', runReminderCron);
  console.log('[Cron] Background status check cron scheduler registered.');
  
  // Run once immediately on startup
  runReminderCron();
}

module.exports = {
  startCron,
  runReminderCron,
  sendManualReminders
};

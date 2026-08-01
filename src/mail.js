const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const emailLogDir = path.join(__dirname, '..', 'data', 'sent_emails');
if (!fs.existsSync(emailLogDir)) {
  fs.mkdirSync(emailLogDir, { recursive: true });
}

// Setup transporter based on environment variables
let transporter = null;
const useSMTP = process.env.SMTP_HOST ? true : false;

if (useSMTP) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

/**
 * Sends or logs an incident notification email.
 * @param {Object} incident Incident row object
 * @param {String} domain Affected service domain (e.g. acme.com)
 * @param {String} clientEmail Destination email address
 * @param {String} emailType 'Initial' or 'Reminder'
 */
async function sendIncidentEmail(incident, domain, clientEmail, emailType = 'Initial') {
  const subject = `[${emailType.toUpperCase()}] Incident Alert: ${incident.title} affecting ${domain}`;
  
  const expectedDowntime = incident.maintenance_window || 'To be determined';
  const startStr = new Date(incident.start_time).toLocaleString();
  const endStr = new Date(incident.end_time).toLocaleString();
  const publicMsg = incident.public_message || incident.description || 'No additional details provided.';
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f4f7f6; color: #333333; line-height: 1.6; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden; border: 1px solid #e1e8ed; }
        .header { background: ${incident.type === 'Maintenance' ? '#0f52ba' : '#c0392b'}; color: #ffffff; padding: 20px; text-align: center; }
        .header h2 { margin: 0; font-size: 20px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
        .content { padding: 30px; }
        .field { margin-bottom: 20px; }
        .label { font-weight: bold; text-transform: uppercase; font-size: 11px; color: #7f8c8d; letter-spacing: 0.5px; margin-bottom: 5px; }
        .value { font-size: 15px; color: #2c3e50; }
        .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; color: #fff; background-color: #e67e22; }
        .footer { background: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #7f8c8d; border-top: 1px solid #e1e8ed; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>${emailType} Incident Notification</h2>
        </div>
        <div class="content">
          <div class="field">
            <div class="label">Incident Title</div>
            <div class="value"><strong>${incident.title}</strong></div>
          </div>
          <div class="field">
            <div class="label">Incident Type</div>
            <div class="value"><span class="badge" style="background-color: ${incident.type === 'Maintenance' ? '#2980b9' : '#e74c3c'}">${incident.type}</span></div>
          </div>
          <div class="field">
            <div class="label">Affected Service (Domain)</div>
            <div class="value"><code>${domain}</code></div>
          </div>
          <div class="field">
            <div class="label">Time Window</div>
            <div class="value">${startStr} &mdash; ${endStr}</div>
          </div>
          <div class="field">
            <div class="label">Expected Downtime / Impact</div>
            <div class="value">${expectedDowntime}</div>
          </div>
          <div class="field">
            <div class="label">Details & Notes</div>
            <div class="value">${publicMsg}</div>
          </div>
        </div>
        <div class="footer">
          This is an automated notification from the Service Status Web Portal.<br>
          &copy; ${new Date().getFullYear()} Operations Team.
        </div>
      </div>
    </body>
    </html>
  `;

  // Always save locally to data/sent_emails for testing audit
  const filename = `${emailType.toLowerCase()}_inc_${incident.id}_service_${domain.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.html`;
  const filepath = path.join(emailLogDir, filename);
  fs.writeFileSync(filepath, htmlContent);
  console.log(`Saved email copy locally: data/sent_emails/${filename}`);

  if (useSMTP && transporter) {
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@statusportal.local',
        to: clientEmail,
        subject: subject,
        html: htmlContent
      });
      console.log(`Email successfully sent via SMTP to ${clientEmail} for service ${domain}`);
    } catch (err) {
      console.error(`SMTP transmission failed to ${clientEmail}:`, err.message);
    }
  } else {
    console.log(`[Mock Mode] Email to ${clientEmail} (Service: ${domain}) logged locally.`);
  }
}

/**
 * Sends a password reset instruction email.
 * @param {String} adminEmail Target email
 * @param {String} resetLink Reset link containing token
 */
async function sendAdminPasswordEmail(adminEmail, tempPassword) {
  const subject = 'Admin Temporary Password';
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f4f7f6; color: #333333; line-height: 1.6; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden; border: 1px solid #e1e8ed; }
        .header { background: #2c3e50; color: #ffffff; padding: 20px; text-align: center; }
        .header h2 { margin: 0; font-size: 20px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
        .content { padding: 30px; text-align: center; }
        .password { display: inline-block; padding: 12px 24px; margin: 20px 0; background-color: #f39c12; color: #ffffff; font-size: 18px; font-weight: bold; border-radius: 4px; letter-spacing: 1px; }
        .footer { background: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #7f8c8d; border-top: 1px solid #e1e8ed; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>Temporary Password</h2>
        </div>
        <div class="content">
          <p>Your administrator password has been reset. Use the temporary password below to sign in.</p>
          <div class="password">${tempPassword}</div>
          <p>After signing in, update your password from the admin profile screen.</p>
        </div>
        <div class="footer">
          This is an automated security notice from the Service Status Web Portal.<br>
          &copy; ${new Date().getFullYear()} Operations Team.
        </div>
      </div>
    </body>
    </html>
  `;

  const filename = `admin_password_${adminEmail.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.html`;
  const filepath = path.join(emailLogDir, filename);
  fs.writeFileSync(filepath, htmlContent);
  console.log(`Saved admin password email locally: data/sent_emails/${filename}`);

  if (useSMTP && transporter) {
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@statusportal.local',
        to: adminEmail,
        subject,
        html: htmlContent
      });
      console.log(`Admin password email sent via SMTP to ${adminEmail}`);
    } catch (err) {
      console.error(`SMTP transmission failed to ${adminEmail}:`, err.message);
    }
  } else {
    console.log(`[Mock Mode] Admin password email to ${adminEmail} logged locally.`);
  }
}

async function sendPasswordResetEmail(adminEmail, resetLink) {
  const subject = 'Admin Password Reset Request';
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f4f7f6; color: #333333; line-height: 1.6; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden; border: 1px solid #e1e8ed; }
        .header { background: #34495e; color: #ffffff; padding: 20px; text-align: center; }
        .header h2 { margin: 0; font-size: 20px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
        .content { padding: 30px; text-align: center; }
        .btn { display: inline-block; padding: 12px 24px; margin: 20px 0; background-color: #2ecc71; color: #ffffff !important; text-decoration: none; border-radius: 4px; font-weight: bold; }
        .footer { background: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #7f8c8d; border-top: 1px solid #e1e8ed; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>Password Reset Request</h2>
        </div>
        <div class="content">
          <p>We received a request to reset your administrator password. This password reset token is only valid for <strong>15 minutes</strong>.</p>
          <a href="${resetLink}" class="btn">Reset Password</a>
          <p>If you did not request this reset, you can safely ignore this email.</p>
          <p>Or copy and paste this link in your browser:<br><code>${resetLink}</code></p>
        </div>
        <div class="footer">
          This is an automated security notice from the Service Status Web Portal.<br>
          &copy; ${new Date().getFullYear()} Operations Team.
        </div>
      </div>
    </body>
    </html>
  `;

  // Always save locally to data/sent_emails for testing audit
  const filename = `reset_email_${adminEmail.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.html`;
  const filepath = path.join(emailLogDir, filename);
  fs.writeFileSync(filepath, htmlContent);
  console.log(`Saved password reset email locally: data/sent_emails/${filename}`);

  if (useSMTP && transporter) {
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@statusportal.local',
        to: adminEmail,
        subject: subject,
        html: htmlContent
      });
      console.log(`Password reset email sent via SMTP to ${adminEmail}`);
    } catch (err) {
      console.error(`SMTP transmission failed to ${adminEmail}:`, err.message);
    }
  } else {
    console.log(`[Mock Mode] Password reset email to ${adminEmail} logged locally.`);
  }
}

module.exports = {
  sendIncidentEmail,
  sendAdminPasswordEmail,
  sendPasswordResetEmail
};

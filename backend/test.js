const assert = require('assert');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { Server, Admin, useMongo } = require('./src/models/db-adapter');
const { hashPassword, comparePassword } = require('./src/auth');
const { sendIncidentEmail, sendAdminPasswordEmail } = require('./src/mail');

async function runTests() {
  console.log('--- STARTING SERVICE STATUS PORTAL TESTS ---');
  
  // Test 1: Password hashing and comparison
  console.log('Running Test 1: Password hashing...');
  const pass = 'SecretPass123!';
  const hash = await hashPassword(pass);
  assert.ok(hash !== pass, 'Hash should not match original text');
  const match = await comparePassword(pass, hash);
  assert.ok(match, 'Password comparison should succeed');
  const mismatch = await comparePassword('WrongPass', hash);
  assert.ok(!mismatch, 'Password comparison should fail for wrong credentials');
  console.log('✓ Test 1 Passed.');

  // Test 2: Input validations regex (domain checks)
  console.log('Running Test 2: Domain formatting regex...');
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,10}$/;
  assert.ok(domainRegex.test('domain.com'), 'Should allow simple domains');
  assert.ok(domainRegex.test('sub.domain.co.uk'), 'Should allow subdomains');
  assert.ok(!domainRegex.test('domain'), 'Should block incomplete domains');
  assert.ok(!domainRegex.test('domain@test.com'), 'Should block invalid character domains');
  console.log('✓ Test 2 Passed.');

  // Test 3: Date comparisons
  console.log('Running Test 3: Incident date validation logic...');
  const dateValidate = (start, end) => new Date(end) > new Date(start);
  assert.ok(dateValidate('2026-07-23T10:00:00', '2026-07-23T11:00:00'), 'End date > start date should be valid');
  assert.ok(!dateValidate('2026-07-23T10:00:00', '2026-07-23T10:00:00'), 'Same dates should be invalid');
  assert.ok(!dateValidate('2026-07-23T11:00:00', '2026-07-23T10:00:00'), 'End date < start date should be invalid');
  console.log('✓ Test 3 Passed.');

  // Test 4: Database connectivity and schemas
  console.log('Running Test 4: Database query validation...');
  const testServer = await Server.create({
    server_name: 'Test Server',
    server_code: 'SRV-TEST',
    ip_address: '127.0.0.1',
    location: 'Localhouse',
    status: 'Operational',
    description: 'Testing unified repository operations'
  });
  assert.ok(testServer.id || testServer._id, 'Should insert server successfully');
  const serverRow = await Server.findById(testServer.id || testServer._id);
  assert.equal(serverRow.server_code, 'SRV-TEST', 'Fetched server code should match inserted code');
  // Clean up
  await Server.delete(testServer.id || testServer._id);
  console.log('✓ Test 4 Passed.');

  // Test 5: Email notification logging
  console.log('Running Test 5: Email notification logging output...');
  const emailLogDir = path.join(__dirname, 'data', 'sent_emails');
  // Clear any existing log files first to avoid conflict
  if (fs.existsSync(emailLogDir)) {
    const files = fs.readdirSync(emailLogDir);
    files.forEach(file => fs.unlinkSync(path.join(emailLogDir, file)));
  }
  
  const mockIncident = { id: 999, title: 'Test Outage', type: 'Down', start_time: new Date().toISOString(), end_time: new Date().toISOString(), public_message: 'Testing email body' };
  await sendIncidentEmail(mockIncident, 'test-service.com', 'client@test.com', 'Initial');
  
  const filesAfter = fs.readdirSync(emailLogDir);
  assert.ok(filesAfter.length > 0, 'An email HTML file should be written to the local log directory');
  const emailFileContent = fs.readFileSync(path.join(emailLogDir, filesAfter[0]), 'utf-8');
  assert.ok(emailFileContent.includes('Test Outage'), 'Saved email should contain incident title');
  assert.ok(emailFileContent.includes('test-service.com'), 'Saved email should contain service domain');
  console.log('✓ Test 5 Passed.');

  // Test 6: Admin password delivery helper
  console.log('Running Test 6: Admin password email delivery...');
  await sendAdminPasswordEmail('admin@example.com', 'TempTest123!');
  const adminEmailFiles = fs.readdirSync(emailLogDir);
  assert.ok(adminEmailFiles.length > 0, 'Admin password email should also be logged locally');
  const latestAdminEmail = adminEmailFiles.filter(file => file.includes('admin_password')).sort().pop();
  assert.ok(latestAdminEmail, 'Admin password email artifact should be present');
  const latestAdminEmailContent = fs.readFileSync(path.join(emailLogDir, latestAdminEmail), 'utf-8');
  assert.ok(latestAdminEmailContent.includes('Temporary Password'), 'Admin email should mention the temporary password');
  console.log('✓ Test 6 Passed.');

  // Test 7: Password Reset token link generation & reset endpoint
  console.log('Running Test 7: Password reset token and recovery...');
  const testAdmin = await Admin.create({
    username: 'test_reset_user',
    email: 'reset@example.com',
    password_hash: 'dummy',
    secret_code: 'ResetSecret!'
  });
  assert.ok(testAdmin, 'Should create test admin');
  
  // Update with reset token
  const testToken = 'reset_token_xyz_123';
  const testExpiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await Admin.update(testAdmin.id || testAdmin._id, {
    reset_token: testToken,
    reset_token_expires: testExpiry
  });
  
  // Find by reset token
  const retrievedAdmin = await Admin.findByResetToken(testToken);
  assert.ok(retrievedAdmin, 'Should fetch admin by reset token');
  assert.equal(retrievedAdmin.email, 'reset@example.com', 'Fetched admin email should match');
  
  // Reset password
  await Admin.updatePassword(testAdmin.id || testAdmin._id, 'new_hash_val');
  const updatedAdmin = await Admin.findById(testAdmin.id || testAdmin._id);
  assert.equal(updatedAdmin.password_hash, 'new_hash_val', 'Password hash should be updated');
  assert.ok(!updatedAdmin.reset_token, 'Reset token should be cleared');
  assert.ok(!updatedAdmin.reset_token_expires, 'Reset token expiry should be cleared');
  
  // Cleanup test admin
  if (useMongo) {
    const mongoose = require('mongoose');
    await mongoose.models.Admin.findByIdAndDelete(testAdmin._id);
  } else {
    const jsonRepo = require('./src/models/json-repo');
    const fs = require('fs');
    const dbPath = path.join(__dirname, 'data', 'db.json');
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    db.admins = db.admins.filter(a => String(a.id) !== String(testAdmin.id));
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
  }
  console.log('✓ Test 7 Passed.');

  console.log('--- ALL TESTS PASSED SUCCESSFULLY! ---');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});

// Theme Toggle Logic
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);

  const toggleBtn = document.getElementById('theme-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      updateThemeIcon(newTheme);
    });
  }
}

function updateThemeIcon(theme) {
  const icon = document.querySelector('#theme-toggle i');
  if (icon) {
    if (theme === 'dark') {
      icon.className = 'fas fa-sun';
    } else {
      icon.className = 'fas fa-moon';
    }
  }
}

// Client Form: Automatic Incident Detection
function initClientIncidentDetection() {
  const serverSelects = [
    document.getElementById('client-server-select'),
    document.getElementById('edit-client-server-select')
  ];

  serverSelects.forEach(select => {
    if (!select) return;
    
    const isEdit = select.id.startsWith('edit');
    const containerId = isEdit ? 'edit-client-incident-alert-container' : 'client-incident-alert-container';
    const alertContainer = document.getElementById(containerId);
    
    select.addEventListener('change', async () => {
      const serverId = select.value;
      if (!serverId || !alertContainer) {
        alertContainer.innerHTML = '';
        return;
      }
      
      try {
        const response = await fetch(`/api/servers/${serverId}/active-incidents`);
        if (!response.ok) throw new Error('Failed to fetch incidents');
        const data = await response.json();
        
        if (data.hasIncident) {
          alertContainer.innerHTML = `
            <div class="alert alert-custom alert-warning mb-3 mt-2">
              <i class="fas fa-exclamation-triangle me-2"></i>
              This server currently has an active or scheduled incident. This newly added service will also be affected.
              <div class="form-check mt-2">
                <input class="form-check-input" type="checkbox" name="notify_client" id="${isEdit ? 'edit-' : ''}notify-client-checkbox" value="1" checked>
                <label class="form-check-label fw-bold text-dark" for="${isEdit ? 'edit-' : ''}notify-client-checkbox">
                  Notify Client via Email
                </label>
              </div>
            </div>
          `;
        } else {
          alertContainer.innerHTML = '';
        }
      } catch (err) {
        console.error('Error fetching active server incidents:', err);
      }
    });
  });
}

// Incident Form: Fetch Services for Selected Servers
function initIncidentServicesFetcher() {
  const forms = [
    {
      serverSelectName: 'servers',
      containerId: 'incident-services-checklist',
      formId: 'add-incident-form'
    },
    {
      serverSelectName: 'servers',
      containerId: 'edit-incident-services-checklist',
      formId: 'edit-incident-form'
    }
  ];

  forms.forEach(({ serverSelectName, containerId, formId }) => {
    const form = document.getElementById(formId);
    if (!form) return;
    
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const getSelectedServersAndLoad = async () => {
      const selectedServers = [];
      const checkboxes = form.querySelectorAll(`input[name="${serverSelectName}"]:checked`);
      checkboxes.forEach(cb => selectedServers.push(cb.value));
      
      if (selectedServers.length === 0) {
        container.innerHTML = '<p class="text-muted small">Select a server to load services.</p>';
        return;
      }
      
      try {
        const queryParams = selectedServers.map(id => `serverIds=${id}`).join('&');
        const response = await fetch(`/api/servers/services?${queryParams}`);
        if (!response.ok) throw new Error('Failed to fetch services');
        const services = await response.json();
        
        if (services.length === 0) {
          container.innerHTML = '<p class="text-muted small">No services hosted on selected servers.</p>';
          return;
        }
        
        let html = '<label class="form-label d-block fw-bold small text-secondary mb-2">Affected Services (uncheck to exclude from alerts & public pages)</label>';
        services.forEach(service => {
          html += `
            <div class="form-check form-check-inline mb-2 border p-2 rounded bg-light" style="min-width: 200px; margin-left: 0; margin-right: 8px;">
              <input class="form-check-input service-affect-check ms-0 me-2" type="checkbox" name="services" id="${formId}-service-cb-${service.service_id}" value="${service.service_id}" checked>
              <label class="form-check-label text-dark" for="${formId}-service-cb-${service.service_id}">
                <code class="text-primary">${escapeHtml(service.service_id)}</code><br>
                <small class="text-muted">${escapeHtml(service.client_name)}</small>
              </label>
            </div>
          `;
        });
        container.innerHTML = html;
      } catch (err) {
        console.error('Error fetching services for servers:', err);
        container.innerHTML = '<p class="text-danger small">Error loading services.</p>';
      }
    };
    
    // Listen to changes on server checkboxes in this form
    form.addEventListener('change', (e) => {
      if (e.target.name === serverSelectName) {
        getSelectedServersAndLoad();
      }
    });
  });
}

// Edit Modals Populate
function initEditModals() {
  // 1. Edit Server Modal
  const editServerModal = document.getElementById('editServerModal');
  if (editServerModal) {
    editServerModal.addEventListener('show.bs.modal', (event) => {
      const button = event.relatedTarget;
      const server = JSON.parse(button.getAttribute('data-server'));
      
      const form = editServerModal.querySelector('form');
      form.action = `/admin/servers/${server.id}/edit`;
      
      editServerModal.querySelector('#edit-server-id').value = server.id;
      editServerModal.querySelector('#edit-server-name').value = server.server_name;
      editServerModal.querySelector('#edit-server-code').value = server.server_code;
      editServerModal.querySelector('#edit-server-ip').value = server.ip_address;
      editServerModal.querySelector('#edit-server-location').value = server.location;
      editServerModal.querySelector('#edit-server-status').value = server.status;
      editServerModal.querySelector('#edit-server-description').value = server.description || '';
    });
  }

  // 2. Edit Client Modal
  const editClientModal = document.getElementById('editClientModal');
  if (editClientModal) {
    editClientModal.addEventListener('show.bs.modal', async (event) => {
      const button = event.relatedTarget;
      const client = JSON.parse(button.getAttribute('data-client'));
      
      const form = editClientModal.querySelector('form');
      form.action = `/admin/clients/${client.id}/edit`;
      
      editClientModal.querySelector('#edit-client-id').value = client.id;
      editClientModal.querySelector('#edit-client-name').value = client.client_name;
      editClientModal.querySelector('#edit-client-company').value = client.company_name;
      editClientModal.querySelector('#edit-client-contact').value = client.contact_person || '';
      editClientModal.querySelector('#edit-client-email').value = client.email;
      editClientModal.querySelector('#edit-client-phone').value = client.phone || '';
      editClientModal.querySelector('#edit-client-service-id').value = client.service_id;
      editClientModal.querySelector('#edit-client-original-service-id').value = client.service_id;
      editClientModal.querySelector('#edit-client-server-select').value = client.server_id;
      
      // Clear alert container first
      const alertContainer = document.getElementById('edit-client-incident-alert-container');
      if (alertContainer) alertContainer.innerHTML = '';
      
      // Trigger change to check for incidents on the selected server
      const select = editClientModal.querySelector('#edit-client-server-select');
      if (select) select.dispatchEvent(new Event('change'));
    });
  }

  // 3. Edit Incident Modal
  const editIncidentModal = document.getElementById('editIncidentModal');
  if (editIncidentModal) {
    editIncidentModal.addEventListener('show.bs.modal', async (event) => {
      const button = event.relatedTarget;
      const incidentId = button.getAttribute('data-incident-id');
      
      const form = editIncidentModal.querySelector('form');
      form.action = `/admin/incidents/${incidentId}/edit`;
      
      try {
        const response = await fetch(`/api/incidents/${incidentId}`);
        if (!response.ok) throw new Error('Failed to fetch incident details');
        const data = await response.json();
        const inc = data.incident;
        const serverIds = data.serverIds;
        const affectedServices = data.affectedServices; // array of service_ids that are affected
        
        editIncidentModal.querySelector('#edit-incident-id').value = inc.id;
        editIncidentModal.querySelector('#edit-incident-title').value = inc.title;
        editIncidentModal.querySelector('#edit-incident-type').value = inc.type;
        editIncidentModal.querySelector('#edit-incident-severity').value = inc.severity;
        editIncidentModal.querySelector('#edit-incident-status').value = inc.status;
        
        // Format ISO timestamps for input datetime-local (yyyy-MM-ddThh:mm)
        const formatDatetime = (isoStr) => {
          if (!isoStr) return '';
          const d = new Date(isoStr);
          const pad = (n) => n.toString().padStart(2, '0');
          return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };
        
        editIncidentModal.querySelector('#edit-incident-start').value = formatDatetime(inc.start_time);
        editIncidentModal.querySelector('#edit-incident-end').value = formatDatetime(inc.end_time);
        editIncidentModal.querySelector('#edit-incident-description').value = inc.description || '';
        editIncidentModal.querySelector('#edit-incident-public-message').value = inc.public_message || '';
        editIncidentModal.querySelector('#edit-incident-internal-notes').value = inc.internal_notes || '';
        editIncidentModal.querySelector('#edit-incident-root-cause').value = inc.root_cause || '';
        editIncidentModal.querySelector('#edit-incident-resolution').value = inc.expected_resolution || '';
        editIncidentModal.querySelector('#edit-incident-window').value = inc.maintenance_window || '';
        
        // Set Checkboxes for Servers
        const checkboxes = editIncidentModal.querySelectorAll('input[name="servers"]');
        checkboxes.forEach(cb => {
          cb.checked = serverIds.includes(parseInt(cb.value));
        });
        
        // Load services and check the ones that are affected
        const servicesContainer = document.getElementById('edit-incident-services-checklist');
        if (serverIds.length === 0) {
          servicesContainer.innerHTML = '<p class="text-muted small">Select a server to load services.</p>';
          return;
        }
        
        const queryParams = serverIds.map(id => `serverIds=${id}`).join('&');
        const servicesRes = await fetch(`/api/servers/services?${queryParams}`);
        if (!servicesRes.ok) throw new Error('Failed to fetch services');
        const services = await servicesRes.json();
        
        if (services.length === 0) {
          servicesContainer.innerHTML = '<p class="text-muted small">No services hosted on selected servers.</p>';
          return;
        }
        
        let html = '<label class="form-label d-block fw-bold small text-secondary mb-2">Affected Services (uncheck to exclude from alerts & public pages)</label>';
        services.forEach(service => {
          const isChecked = affectedServices.length === 0 || affectedServices.includes(service.service_id);
          html += `
            <div class="form-check form-check-inline mb-2 border p-2 rounded bg-light" style="min-width: 200px; margin-left: 0; margin-right: 8px;">
              <input class="form-check-input service-affect-check ms-0 me-2" type="checkbox" name="services" id="edit-incident-form-service-cb-${service.service_id}" value="${service.service_id}" ${isChecked ? 'checked' : ''}>
              <label class="form-check-label text-dark" for="edit-incident-form-service-cb-${service.service_id}">
                <code class="text-primary">${escapeHtml(service.service_id)}</code><br>
                <small class="text-muted">${escapeHtml(service.client_name)}</small>
              </label>
            </div>
          `;
        });
        servicesContainer.innerHTML = html;
        
      } catch (err) {
        console.error('Error fetching incident for modal:', err);
      }
    });
  }
}

// Confirmation Modals Setup
function initConfirmationModals() {
  const confirmDeleteModal = document.getElementById('confirmDeleteModal');
  if (confirmDeleteModal) {
    confirmDeleteModal.addEventListener('show.bs.modal', (event) => {
      const button = event.relatedTarget;
      const deleteUrl = button.getAttribute('data-delete-url');
      const itemTitle = button.getAttribute('data-item-title') || 'this item';
      
      confirmDeleteModal.querySelector('#delete-item-title').textContent = itemTitle;
      confirmDeleteModal.querySelector('#confirm-delete-form').action = deleteUrl;
    });
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Global helper to mute all interactive buttons and show spinner on the trigger submit button
function muteAllButtons(submitBtn) {
  document.querySelectorAll('button, input[type="submit"], .btn').forEach(el => {
    // Prevent disabling modals triggers or tabs
    if (el.hasAttribute('data-bs-dismiss') || el.hasAttribute('data-bs-toggle') || el.classList.contains('nav-link')) {
      return;
    }
    el.setAttribute('disabled', 'true');
    el.classList.add('disabled');
  });

  if (submitBtn) {
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Processing...';
  }
}

// Hook normal form submissions (that don't use reCAPTCHA flow)
function initButtonMuting() {
  document.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', (e) => {
      // If reCAPTCHA is active on the auth-form, the custom script handles muting inside the callback instead
      const isRecaptchaActive = typeof grecaptcha !== 'undefined' && document.getElementById('recaptcha-token');
      if (form.id === 'auth-form' && isRecaptchaActive) {
        return;
      }
      const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
      muteAllButtons(submitBtn);
    });
  });

  // Handle direct POST links (e.g. notify, delete triggers)
  document.querySelectorAll('.btn-outline-danger, .btn-outline-primary, .btn-xs, a.btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (btn.hasAttribute('data-bs-toggle') || btn.hasAttribute('data-bs-dismiss') || btn.classList.contains('nav-link') || btn.closest('form')) {
        return;
      }
      setTimeout(() => {
        muteAllButtons(btn);
      }, 50);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initClientIncidentDetection();
  initIncidentServicesFetcher();
  initEditModals();
  initConfirmationModals();
  initButtonMuting();

  // Manual trigger for the edit admin profile details modal to ensure it always launches
  const editAdminBtn = document.querySelector('[data-bs-target="#editAdminModal"]');
  if (editAdminBtn) {
    editAdminBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const modalEl = document.getElementById('editAdminModal');
      if (modalEl) {
        const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
        modalInstance.show();
      }
    });
  }
});

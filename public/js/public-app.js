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

// AJAX Status Polling (every 5 seconds)
let isSearching = false;

async function pollSystemStatus() {
  if (isSearching) return; // Pause polling visual updates while user is searching
  
  try {
    const response = await fetch('/api/status-summary');
    if (!response.ok) throw new Error('Status summary fetch failed');
    
    const data = await response.json();
    
    // Update Banner
    const banner = document.getElementById('operational-banner');
    if (banner) {
      banner.className = 'status-banner ' + data.statusClass;
      
      const bannerContent = `
        <div class="status-banner-title">
          <span class="pulse-dot"></span>
          ${data.bannerTitle}
        </div>
        <p class="mb-0 opacity-75">${data.bannerText}</p>
        <small class="text-muted d-block mt-2">Last checked: ${new Date().toLocaleTimeString()}</small>
      `;
      banner.innerHTML = bannerContent;
    }
    
    // Update Helper Text
    const helperText = document.getElementById('search-helper-text');
    if (helperText) {
      if (data.activeIncidentsCount > 0) {
        helperText.textContent = 'Some services are affected. Search your service to check whether it is impacted.';
      } else {
        helperText.textContent = 'Everything is working as expected. Search your service to verify its current status.';
      }
    }

    // Update Affected Servers Container
    updateActiveServers(data.activeServers);
    
  } catch (error) {
    console.error('Error polling status:', error);
  }
}

function updateActiveServers(servers) {
  const container = document.getElementById('active-servers-container');
  if (!container) return;
  
  if (!servers || servers.length === 0) {
    container.innerHTML = '';
    return;
  }
  
  let html = '<h4 class="mb-3"><i class="fas fa-exclamation-circle text-danger me-2"></i>Affected Servers</h4>';
  servers.forEach(server => {
    const startStr = new Date(server.start_time).toLocaleString();
    const endStr = new Date(server.end_time).toLocaleString();
    const incidentBadgeClass = getBadgeClass(server.incident_type);
    
    html += `
      <div class="card glass-panel mb-3 border-danger shadow-sm">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
            <h5 class="card-title mb-1 text-danger fw-bold">
              <i class="fas fa-server me-2"></i>${escapeHtml(server.server_name)} (${escapeHtml(server.server_code)})
            </h5>
            <span class="status-badge ${incidentBadgeClass}">${escapeHtml(server.incident_type)}</span>
          </div>
          <p class="card-text mt-2 mb-1"><strong>Incident:</strong> ${escapeHtml(server.incident_title)}</p>
          <p class="card-text text-muted mb-2"><small><i class="fas fa-calendar-alt me-1"></i>Duration: ${startStr} &mdash; ${endStr} | <i class="fas fa-map-marker-alt me-1"></i>Location: ${escapeHtml(server.location)}</small></p>
          <p class="card-text mt-2 mb-0">${escapeHtml(server.public_message || server.description)}</p>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

function getBadgeClass(type) {
  const t = type.toLowerCase();
  if (t.includes('maintenance')) return 'maintenance';
  if (t.includes('degraded')) return 'degraded';
  if (t.includes('outage') || t.includes('down')) return 'outage';
  if (t.includes('security')) return 'security';
  return 'outage';
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

// Service Search Handler
function initSearch() {
  const searchForm = document.getElementById('service-search-form');
  const searchInput = document.getElementById('service-search-input');
  const resultDiv = document.getElementById('search-result-container');
  
  if (!searchForm || !searchInput || !resultDiv) return;
  
  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = searchInput.value.trim();
    if (!query) {
      resultDiv.innerHTML = '';
      isSearching = false;
      return;
    }
    
    isSearching = true;
    resultDiv.innerHTML = `
      <div class="text-center py-4">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
      </div>
    `;
    
    try {
      const response = await fetch(`/api/search?domain=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();
      
      if (data.error) {
        resultDiv.innerHTML = `
          <div class="alert alert-custom alert-danger d-flex align-items-center mt-3" role="alert">
            <i class="fas fa-exclamation-circle me-3 fa-lg"></i>
            <div>
              <strong>Search Result:</strong> ${escapeHtml(data.error)}
            </div>
          </div>
        `;
      } else {
        const isAffected = data.incident;
        const statusBadge = isAffected 
          ? `<span class="status-badge ${getBadgeClass(data.incident.type)}">${escapeHtml(data.incident.type)}</span>`
          : `<span class="status-badge operational">Operational</span>`;
          
        const incidentInfo = isAffected 
          ? `
            <div class="mt-3 p-3 bg-light text-dark rounded border-start border-danger border-4">
              <h6 class="text-danger fw-bold"><i class="fas fa-exclamation-triangle me-2"></i>Active Incident: ${escapeHtml(data.incident.title)}</h6>
              <p class="mb-1 text-secondary">${escapeHtml(data.incident.public_message || data.incident.description)}</p>
              <small class="text-muted"><strong>Est. Resolution:</strong> ${escapeHtml(data.incident.expected_resolution || 'Under investigation')}</small>
            </div>
            `
          : `
            <div class="mt-3 p-3 bg-light text-dark rounded border-start border-success border-4">
              <h6 class="text-success fw-bold"><i class="fas fa-check-circle me-2"></i>No Active Outages</h6>
              <p class="mb-0 text-muted">All systems on this hosting server are performing as expected.</p>
            </div>
            `;

        resultDiv.innerHTML = `
          <div class="card glass-panel shadow-sm mt-3 border-primary">
            <div class="card-body text-start">
              <h5 class="card-title fw-bold border-bottom pb-2 mb-3 text-primary">
                <i class="fas fa-globe me-2"></i>Service Details: ${escapeHtml(data.service_id)}
              </h5>
              <div class="row g-3">
                <div class="col-sm-6">
                  <span class="text-muted d-block small">Client Name</span>
                  <strong>${escapeHtml(data.client_name)}</strong>
                </div>
                <div class="col-sm-6">
                  <span class="text-muted d-block small">Company Name</span>
                  <strong>${escapeHtml(data.company_name)}</strong>
                </div>

                <div class="col-sm-6">
                  <span class="text-muted d-block small">Current Service Status</span>
                  ${statusBadge}
                </div>
              </div>
              ${incidentInfo}
            </div>
          </div>
        `;
      }
    } catch (error) {
      resultDiv.innerHTML = `<div class="alert alert-danger mt-3">An error occurred during search. Please try again.</div>`;
      console.error(error);
    }
  });

  searchInput.addEventListener('input', () => {
    if (!searchInput.value.trim()) {
      resultDiv.innerHTML = '';
      isSearching = false;
    }
  });
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

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initSearch();
  initButtonMuting();
  // Poll every 5 seconds
  setInterval(pollSystemStatus, 5000);
});

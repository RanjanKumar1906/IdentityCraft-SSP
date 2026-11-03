import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

export default function PublicDashboard() {
  const [summary, setSummary] = useState({
    statusClass: 'operational',
    bannerTitle: 'All Services Operational',
    bannerText: 'System status is normal. No active outages reported.',
    lastChecked: new Date().toLocaleTimeString()
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const [activeIncidents, setActiveIncidents] = useState([]);
  const [upcomingMaintenances, setUpcomingMaintenances] = useState([]);
  const [pastIncidents, setPastIncidents] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Poll status and active lists
  useEffect(() => {
    fetchStatusSummary();
    fetchIncidents();
    const interval = setInterval(() => {
      if (!searchQuery) {
        fetchStatusSummary();
        fetchIncidents();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [currentPage, searchQuery]);

  const fetchStatusSummary = async () => {
    try {
      const res = await axios.get('/api/status-summary');
      setSummary({
        ...res.data,
        lastChecked: new Date().toLocaleTimeString()
      });
    } catch (err) {
      console.error('Error fetching status summary:', err);
    }
  };

  const fetchIncidents = async () => {
    try {
      const res = await axios.get(`/api/public-incidents?page=${currentPage}&limit=5`);
      setActiveIncidents(res.data.active || []);
      setUpcomingMaintenances(res.data.upcoming || []);
      setPastIncidents(res.data.past || []);
      setTotalPages(res.data.pages || 1);
    } catch (err) {
      console.error('Error fetching incidents:', err);
    }
  };

  const handleSearchSubmit = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchError('');
    setSearchResult(null);
    try {
      const res = await axios.get(`/api/services/search?domain=${encodeURIComponent(searchQuery.trim())}`);
      setSearchResult(res.data);
    } catch (err) {
      setSearchError(err.response?.data?.error || 'No matching active service found.');
    } finally {
      setIsSearching(false);
    }
  };

  const getSeverityBadge = (sev) => {
    const classes = {
      'Low': 'bg-success text-white',
      'Medium': 'bg-warning text-dark',
      'High': 'bg-danger text-white',
      'Critical': 'bg-dark text-white'
    };
    return <span className={`badge ${classes[sev] || 'bg-secondary'}`}>{sev}</span>;
  };

  const getStatusBadge = (status) => {
    const classes = {
      'Active': 'bg-danger text-white',
      'Scheduled': 'bg-primary text-white',
      'Resolved': 'bg-success text-white'
    };
    return <span className={`badge ${classes[status] || 'bg-secondary'}`}>{status}</span>;
  };

  return (
    <div className="container py-4">
      {/* 1. Status Summary Banner */}
      <div id="operational-banner" className={`status-banner ${summary.statusClass}`}>
        <div className="status-banner-title">
          <span className="pulse-dot"></span>
          {summary.bannerTitle}
        </div>
        <p className="mb-0 opacity-75">{summary.bannerText}</p>
        <small className="text-muted d-block mt-2">Last checked: {summary.lastChecked}</small>
      </div>

      {/* 2. Service Domain Search Tool */}
      <div className="card glass-panel shadow-sm mb-4 border-0">
        <div className="card-body p-4 text-center">
          <h4 className="fw-bold mb-3"><i className="fas fa-search me-2 text-primary"></i>Check Your Service Status</h4>
          <p className="text-secondary small mb-4">Enter your hosted domain/service ID to search active server outages and schedules.</p>
          <form onSubmit={handleSearchSubmit} className="max-w-md mx-auto d-flex gap-2 justify-content-center">
            <div className="search-wrapper w-75 m-0" style={{ position: 'relative' }}>
              <i className="fas fa-globe" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}></i>
              <input 
                type="text" 
                className="form-control" 
                placeholder="domain.com" 
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (!e.target.value.trim()) {
                    setSearchResult(null);
                    setSearchError('');
                  }
                }}
                style={{ paddingLeft: '36px' }}
                required 
              />
            </div>
            <button type="submit" className="btn btn-primary px-4 fw-bold" disabled={isSearching}>
              {isSearching ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="fas fa-search me-2"></i>}
              Search
            </button>
          </form>

          {/* Search Error */}
          {searchError && (
            <div className="alert alert-danger mt-3 text-start max-w-md mx-auto py-2 small">
              <i className="fas fa-times-circle me-1"></i> {searchError}
            </div>
          )}

          {/* Search Result Details Card */}
          {searchResult && (
            <div className="card glass-panel shadow-sm mt-4 border-primary max-w-md mx-auto text-start">
              <div className="card-body">
                <h5 className="card-title fw-bold border-bottom pb-2 mb-3 text-primary">
                  <i className="fas fa-globe me-2"></i>Service: {searchResult.service_id}
                </h5>
                <div className="row g-3">
                  <div className="col-sm-6">
                    <span className="text-muted d-block small">Client Name</span>
                    <strong>{searchResult.client_name}</strong>
                  </div>
                  <div className="col-sm-6">
                    <span className="text-muted d-block small">Company Name</span>
                    <strong>{searchResult.company_name}</strong>
                  </div>
                  <div className="col-sm-6">
                    <span className="text-muted d-block small">Current Service Status</span>
                    {searchResult.server_status === 'Operational' && searchResult.active_status === 1 ? (
                      <span className="badge bg-success text-white"><i className="fas fa-check-circle me-1"></i>Operational</span>
                    ) : (
                      <span className="badge bg-danger text-white"><i className="fas fa-exclamation-triangle me-1"></i>Outage</span>
                    )}
                  </div>
                </div>

                {/* Attached Incident Details */}
                {searchResult.incident ? (
                  <div className="mt-3 pt-3 border-top bg-light p-3 rounded border border-warning">
                    <h6 className="fw-bold text-warning mb-2"><i className="fas fa-exclamation-triangle me-1"></i>Active Outage Detected</h6>
                    <div className="mb-2"><strong>{searchResult.incident.title}</strong></div>
                    <div className="small text-secondary mb-2">{searchResult.incident.public_message || searchResult.incident.description}</div>
                    <div className="small"><strong>Severity:</strong> {getSeverityBadge(searchResult.incident.severity)}</div>
                    {searchResult.incident.expected_resolution && (
                      <div className="small mt-1"><strong>Expected Resolution:</strong> <code className="text-dark bg-white border px-1 rounded">{searchResult.incident.expected_resolution}</code></div>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 pt-3 border-top text-success small">
                    <i className="fas fa-check-circle me-1"></i>No active outages or incidents reported on this service's server.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Incidents Overview Section */}
      <h3 className="fw-bold mb-3"><i className="fas fa-activity text-primary me-2"></i>Incident Log</h3>

      {/* Current Active Incidents */}
      <div className="card glass-panel shadow-sm mb-4 border-0">
        <div className="card-header bg-transparent border-0 pt-4 px-4">
          <h5 className="fw-bold mb-0 text-danger"><span className="pulse-dot bg-danger"></span>Active Incidents</h5>
        </div>
        <div className="card-body px-4 pb-4">
          {activeIncidents.length === 0 ? (
            <p className="text-secondary text-muted mb-0 small">No active incidents reported. All services running normal.</p>
          ) : (
            <div className="accordion" id="activeIncidentsAccordion">
              {activeIncidents.map((inc, i) => (
                <div className="accordion-item bg-transparent border-color mb-2 rounded overflow-hidden" key={inc.id}>
                  <h2 className="accordion-header">
                    <button className="accordion-button collapsed bg-light border-0 fw-bold d-flex align-items-center justify-content-between" type="button" data-bs-toggle="collapse" data-bs-target={`#activeCollapse-${inc.id}`}>
                      <span>
                        <span className="badge bg-danger text-white me-2">{inc.type}</span>
                        {inc.title}
                      </span>
                    </button>
                  </h2>
                  <div id={`activeCollapse-${inc.id}`} className="accordion-collapse collapse" data-bs-parent="#activeIncidentsAccordion">
                    <div className="accordion-body bg-white text-start">
                      <div className="mb-2"><strong>Declared:</strong> {new Date(inc.start_time).toLocaleString()}</div>
                      <div className="mb-2"><strong>Severity:</strong> {getSeverityBadge(inc.severity)}</div>
                      <div className="mb-2">{inc.description}</div>
                      {inc.public_message && (
                        <div className="alert alert-info py-2 small mb-2"><i className="fas fa-bullhorn me-1"></i>{inc.public_message}</div>
                      )}
                      {inc.expected_resolution && (
                        <div className="small mt-2"><strong>Estimated Resolution:</strong> <code className="bg-light border px-1 rounded">{inc.expected_resolution}</code></div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Scheduled Maintenances */}
      <div className="card glass-panel shadow-sm mb-4 border-0">
        <div className="card-header bg-transparent border-0 pt-4 px-4">
          <h5 className="fw-bold mb-0 text-primary"><i className="fas fa-tools me-2 text-primary"></i>Scheduled Maintenance</h5>
        </div>
        <div className="card-body px-4 pb-4">
          {upcomingMaintenances.length === 0 ? (
            <p className="text-secondary text-muted mb-0 small">No scheduled system maintenance windows at this time.</p>
          ) : (
            <div className="accordion" id="maintenanceAccordion">
              {upcomingMaintenances.map((inc) => (
                <div className="accordion-item bg-transparent border-color mb-2 rounded overflow-hidden" key={inc.id}>
                  <h2 className="accordion-header">
                    <button className="accordion-button collapsed bg-light border-0 fw-bold d-flex align-items-center justify-content-between" type="button" data-bs-toggle="collapse" data-bs-target={`#maintCollapse-${inc.id}`}>
                      <span>
                        <span className="badge bg-primary text-white me-2">Maintenance</span>
                        {inc.title}
                      </span>
                    </button>
                  </h2>
                  <div id={`maintCollapse-${inc.id}`} className="accordion-collapse collapse" data-bs-parent="#maintenanceAccordion">
                    <div className="accordion-body bg-white text-start">
                      <div className="mb-2"><strong>Planned Start:</strong> {new Date(inc.start_time).toLocaleString()}</div>
                      <div className="mb-2"><strong>Planned End:</strong> {new Date(inc.end_time).toLocaleString()}</div>
                      {inc.maintenance_window && (
                        <div className="mb-2"><strong>Duration:</strong> {inc.maintenance_window}</div>
                      )}
                      <div className="mb-2">{inc.description}</div>
                      {inc.public_message && (
                        <div className="alert alert-info py-2 small mb-0"><i className="fas fa-bullhorn me-1"></i>{inc.public_message}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Past Resolved Incidents (Paginated) */}
      <div className="card glass-panel shadow-sm mb-4 border-0">
        <div className="card-header bg-transparent border-0 pt-4 px-4">
          <h5 className="fw-bold mb-0 text-success"><i className="fas fa-check-circle me-2 text-success"></i>Past Incidents (Resolved)</h5>
        </div>
        <div className="card-body px-4 pb-4">
          {pastIncidents.length === 0 ? (
            <p className="text-secondary text-muted mb-0 small">No past incidents logged.</p>
          ) : (
            <>
              <div className="accordion" id="pastAccordion">
                {pastIncidents.map((inc) => (
                  <div className="accordion-item bg-transparent border-color mb-2 rounded overflow-hidden" key={inc.id}>
                    <h2 className="accordion-header">
                      <button className="accordion-button collapsed bg-light border-0 fw-bold d-flex align-items-center justify-content-between" type="button" data-bs-toggle="collapse" data-bs-target={`#pastCollapse-${inc.id}`}>
                        <span>
                          <span className="badge bg-success text-white me-2">Resolved</span>
                          {inc.title}
                        </span>
                      </button>
                    </h2>
                    <div id={`pastCollapse-${inc.id}`} className="accordion-collapse collapse" data-bs-parent="#pastAccordion">
                      <div className="accordion-body bg-white text-start">
                        <div className="mb-2"><strong>Started:</strong> {new Date(inc.start_time).toLocaleString()}</div>
                        <div className="mb-2"><strong>Resolved:</strong> {new Date(inc.updated_at).toLocaleString()}</div>
                        <div className="mb-2">{inc.description}</div>
                        {inc.root_cause && (
                          <div className="mb-2"><strong>Root Cause:</strong> {inc.root_cause}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination controls */}
              {totalPages > 1 && (
                <nav className="mt-4">
                  <ul className="pagination pagination-sm justify-content-center m-0">
                    <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                      <button className="page-link" onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}>Previous</button>
                    </li>
                    {Array.from({ length: totalPages }).map((_, idx) => (
                      <li className={`page-item ${currentPage === idx + 1 ? 'active' : ''}`} key={idx}>
                        <button className="page-link" onClick={() => setCurrentPage(idx + 1)}>{idx + 1}</button>
                      </li>
                    ))}
                    <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                      <button className="page-link" onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}>Next</button>
                    </li>
                  </ul>
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

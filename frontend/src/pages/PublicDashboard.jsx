import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

export default function AdminDashboard({ admin, onLogout }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('servers');

  // Stats
  const [stats, setStats] = useState({ servers: 0, clients: 0, incidents: 0 });

  // Lists
  const [servers, setServers] = useState([]);
  const [clients, setClients] = useState([]);
  const [incidents, setIncidents] = useState([]);

  // Loaders
  const [loading, setLoading] = useState(false);
  const [msgSuccess, setMsgSuccess] = useState('');
  const [msgErrors, setMsgErrors] = useState([]);

  // Modals & Forms State
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileForm, setProfileForm] = useState({ username: '', email: '', secret_code: '', password: '' });

  // Server Form
  const [showServerModal, setShowServerModal] = useState(false);
  const [serverForm, setServerForm] = useState({ id: null, server_name: '', server_code: '', ip_address: '', location: '', status: 'Operational', description: '' });

  // Client Form
  const [showClientModal, setShowClientModal] = useState(false);
  const [clientForm, setClientForm] = useState({ id: null, client_name: '', company_name: '', contact_person: '', email: '', phone: '', service_id: '', server_id: '', notify_client: false });
  const [serverWarning, setServerWarning] = useState(false);

  // Incident Form
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [incidentForm, setIncidentForm] = useState({
    id: null, title: '', type: 'Down', severity: 'High', status: 'Active',
    start_time: '', end_time: '', description: '', public_message: '',
    internal_notes: '', root_cause: '', expected_resolution: '', maintenance_window: '',
    selectedServers: [], selectedServices: [],
    scope: 'server', selectedClientService: ''
  });
  const [availableServices, setAvailableServices] = useState([]);

  useEffect(() => {
    // If not logged in, redirect
    if (!admin) {
      navigate('/login');
      return;
    }
    // Load initial stats & current tab data
    fetchStats();
    loadTabData();
    setProfileForm({ username: admin.username, email: admin.email, secret_code: admin.secret_code || '', password: '' });
  }, [admin, activeTab]);

  // Load checklists on server select change in Incident Form
  useEffect(() => {
    if (showIncidentModal && incidentForm.selectedServers.length > 0) {
      fetchIncidentServices(incidentForm.selectedServers);
    } else {
      setAvailableServices([]);
    }
  }, [incidentForm.selectedServers, showIncidentModal]);

  const fetchStats = async () => {
    try {
      const res = await axios.get('/api/admin/stats');
      setStats(res.data);
    } catch (e) {
      console.error('Error fetching stats:', e);
    }
  };

  const loadTabData = async () => {
    setLoading(true);
    setMsgErrors([]);
    try {
      if (activeTab === 'servers') {
        const res = await axios.get('/api/admin/servers');
        setServers(res.data);
      } else if (activeTab === 'clients') {
        const res = await axios.get('/api/admin/clients');
        setClients(res.data);
      } else if (activeTab === 'incidents') {
        const res = await axios.get('/api/admin/incidents');
        setIncidents(res.data);
      }
    } catch (err) {
      setMsgErrors(['Failed to fetch tab data.']);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoutClick = async () => {
    setLoading(true);
    try {
      await axios.post('/api/auth/logout');
      onLogout();
      navigate('/login');
    } catch (e) {
      console.error(e);
      setMsgErrors(['Logout failed.']);
      setLoading(false);
    }
  };

  // Profile Save
  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setMsgErrors([]);
    setMsgSuccess('');
    setLoading(true);
    try {
      const res = await axios.post('/api/auth/edit-profile', profileForm);
      setMsgSuccess('Profile updated successfully!');
      setShowProfileModal(false);
      // Reload admin metadata
      window.location.reload();
    } catch (err) {
      setMsgErrors(err.response?.data?.errors || [err.response?.data?.error || 'Profile update failed.']);
    } finally {
      setLoading(false);
    }
  };

  // Server CRUD
  const openAddServer = () => {
    setServerForm({ id: null, server_name: '', server_code: '', ip_address: '', location: '', status: 'Operational', description: '' });
    setShowServerModal(true);
  };

  const openEditServer = (srv) => {
    setServerForm({ ...srv });
    setShowServerModal(true);
  };

  const handleServerSubmit = async (e) => {
    e.preventDefault();
    setMsgErrors([]);
    setMsgSuccess('');
    setLoading(true);
    try {
      if (serverForm.id) {
        await axios.put(`/api/admin/servers/${serverForm.id}`, serverForm);
        setMsgSuccess(`Server "${serverForm.server_name}" updated.`);
      } else {
        await axios.post('/api/admin/servers', serverForm);
        setMsgSuccess(`Server "${serverForm.server_name}" created.`);
      }
      setShowServerModal(false);
      loadTabData();
      fetchStats();
    } catch (err) {
      setMsgErrors(err.response?.data?.errors || [err.response?.data?.error || 'Server save failed.']);
    } finally {
      setLoading(false);
    }
  };

  const handleServerDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete server "${name}"?`)) return;
    setMsgErrors([]);
    setMsgSuccess('');
    setLoading(true);
    try {
      await axios.delete(`/api/admin/servers/${id}`);
      setMsgSuccess(`Server "${name}" deleted.`);
      loadTabData();
      fetchStats();
    } catch (err) {
      setMsgErrors([err.response?.data?.error || 'Failed to delete server. Please ensure no hosted services are assigned to this server.']);
    } finally {
      setLoading(false);
    }
  };

  // Client CRUD
  const openAddClient = () => {
    setClientForm({ id: null, client_name: '', company_name: '', contact_person: '', email: '', phone: '', service_id: '', server_id: '', notify_client: false });
    setServerWarning(false);
    setShowClientModal(true);
  };

  const openEditClient = (cli) => {
    setClientForm({
      id: cli.id, client_name: cli.client_name, company_name: cli.company_name,
      contact_person: cli.contact_person, email: cli.email, phone: cli.phone,
      service_id: cli.service_id, server_id: cli.server_id, notify_client: false
    });
    setServerWarning(false);
    setShowClientModal(true);
  };

  const handleClientServerChange = async (serverId) => {
    setClientForm(prev => ({ ...prev, server_id: serverId }));
    if (!serverId) {
      setServerWarning(false);
      return;
    }
    try {
      const res = await axios.get(`/api/servers/${serverId}/active-incidents`);
      setServerWarning(res.data.hasIncident);
    } catch (e) {
      console.error(e);
    }
  };

  const handleClientSubmit = async (e) => {
    e.preventDefault();
    setMsgErrors([]);
    setMsgSuccess('');
    setLoading(true);
    try {
      if (clientForm.id) {
        await axios.put(`/api/admin/clients/${clientForm.id}`, clientForm);
        setMsgSuccess(`Client service "${clientForm.service_id}" updated.`);
      } else {
        await axios.post('/api/admin/clients', clientForm);
        setMsgSuccess(`Client service "${clientForm.service_id}" registered.`);
      }
      setShowClientModal(false);
      loadTabData();
      fetchStats();
    } catch (err) {
      setMsgErrors(err.response?.data?.errors || [err.response?.data?.error || 'Client save failed.']);
    } finally {
      setLoading(false);
    }
  };

  const handleClientDelete = async (id, serviceId) => {
    if (!window.confirm(`Are you sure you want to delete client service "${serviceId}"?`)) return;
    setMsgErrors([]);
    setMsgSuccess('');
    setLoading(true);
    try {
      await axios.delete(`/api/admin/clients/${id}`);
      setMsgSuccess(`Client service "${serviceId}" deleted.`);
      loadTabData();
      fetchStats();
    } catch (err) {
      setMsgErrors([err.response?.data?.error || 'Failed to delete client.']);
    } finally {
      setLoading(false);
    }
  };

  // Incident CRUD
  const formatDatetimeLocal = (d) => {
    const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const openDeclareIncident = () => {
    const now = new Date();
    const oneHr = new Date(now.getTime() + 60 * 60 * 1000);
    setIncidentForm({
      id: null, title: '', type: 'Down', severity: 'High', status: 'Active',
      start_time: formatDatetimeLocal(now), end_time: formatDatetimeLocal(oneHr),
      description: '', public_message: '', internal_notes: '', root_cause: '',
      expected_resolution: '', maintenance_window: '',
      selectedServers: [], selectedServices: [],
      scope: 'server', selectedClientService: ''
    });
    setAvailableServices([]);
    setShowIncidentModal(true);
  };

  const openEditIncident = async (inc) => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/admin/incidents/${inc.id}`);
      const data = res.data;
      
      const formatIsoStr = (iso) => {
        if (!iso) return '';
        return formatDatetimeLocal(new Date(iso));
      };

      const isClientOutage = data.affectedServices && data.affectedServices.length === 1;
      const isCustomOutage = (!data.serverIds || data.serverIds.length === 0) && (!data.affectedServices || data.affectedServices.length === 0);

      setIncidentForm({
        id: data.incident.id, title: data.incident.title, type: data.incident.type,
        severity: data.incident.severity, status: data.incident.status,
        start_time: formatIsoStr(data.incident.start_time), end_time: formatIsoStr(data.incident.end_time),
        description: data.incident.description || '', public_message: data.incident.public_message || '',
        internal_notes: data.incident.internal_notes || '', root_cause: data.incident.root_cause || '',
        expected_resolution: data.incident.expected_resolution || '', maintenance_window: data.incident.maintenance_window || '',
        selectedServers: data.serverIds || [],
        selectedServices: data.affectedServices || [],
        scope: isCustomOutage ? 'custom' : (isClientOutage ? 'client' : 'server'),
        selectedClientService: isClientOutage ? data.affectedServices[0] : ''
      });
      setShowIncidentModal(true);
    } catch (e) {
      console.error(e);
      setMsgErrors(['Failed to load incident details.']);
    } finally {
      setLoading(false);
    }
  };

  const fetchIncidentServices = async (serverIds) => {
    try {
      const queryParams = serverIds.map(id => `serverIds=${id}`).join('&');
      const res = await axios.get(`/api/servers/services?${queryParams}`);
      setAvailableServices(res.data);
      // Auto-select all by default on new incident
      if (!incidentForm.id) {
        setIncidentForm(prev => ({ ...prev, selectedServices: res.data.map(s => s.service_id) }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleIncidentServerCheck = (serverId, checked) => {
    setIncidentForm(prev => {
      const list = checked 
        ? [...prev.selectedServers, serverId]
        : prev.selectedServers.filter(id => id !== serverId);
      return { ...prev, selectedServers: list };
    });
  };

  const handleIncidentServiceCheck = (serviceId, checked) => {
    setIncidentForm(prev => {
      const list = checked 
        ? [...prev.selectedServices, serviceId]
        : prev.selectedServices.filter(id => id !== serviceId);
      return { ...prev, selectedServices: list };
    });
  };

  const handleIncidentSubmit = async (e) => {
    e.preventDefault();
    
    let serversList = [];
    let servicesList = [];
    
    if (incidentForm.scope === 'client') {
      if (!incidentForm.selectedClientService) {
        alert('Please select the affected client service.');
        return;
      }
      const matchedClient = clients.find(c => c.service_id === incidentForm.selectedClientService);
      if (!matchedClient) {
        alert('Selected client service is invalid.');
        return;
      }
      serversList = [matchedClient.server_id];
      servicesList = [matchedClient.service_id];
    } else if (incidentForm.scope === 'custom') {
      serversList = [];
      servicesList = [];
    } else {
      if (incidentForm.selectedServers.length === 0) {
        alert('Please check at least one server hosting the outage.');
        return;
      }
      serversList = incidentForm.selectedServers;
      servicesList = incidentForm.selectedServices;
    }

    setMsgErrors([]);
    setMsgSuccess('');
    setLoading(true);
    try {
      const payload = {
        ...incidentForm,
        servers: serversList,
        services: servicesList
      };

      if (incidentForm.id) {
        await axios.put(`/api/admin/incidents/${incidentForm.id}`, payload);
        setMsgSuccess(`Incident "${incidentForm.title}" updated.`);
      } else {
        await axios.post('/api/admin/incidents', payload);
        setMsgSuccess(`Incident "${incidentForm.title}" declared.`);
      }
      setShowIncidentModal(false);
      loadTabData();
      fetchStats();
    } catch (err) {
      setMsgErrors(err.response?.data?.errors || [err.response?.data?.error || 'Incident save failed.']);
    } finally {
      setLoading(false);
    }
  };

  const handleIncidentDelete = async (id, title) => {
    if (!window.confirm(`Are you sure you want to delete incident "${title}"?`)) return;
    setMsgErrors([]);
    setMsgSuccess('');
    setLoading(true);
    try {
      await axios.delete(`/api/admin/incidents/${id}`);
      setMsgSuccess(`Incident "${title}" deleted.`);
      loadTabData();
      fetchStats();
    } catch (err) {
      setMsgErrors([err.response?.data?.error || 'Failed to delete incident.']);
    } finally {
      setLoading(false);
    }
  };

  const handleIncidentNotify = async (id) => {
    setMsgErrors([]);
    setMsgSuccess('');
    setLoading(true);
    try {
      const res = await axios.post(`/api/admin/incidents/${id}/notify`);
      setMsgSuccess(res.data.message || 'Notification emails dispatched successfully.');
    } catch (err) {
      setMsgErrors([err.response?.data?.error || 'Email dispatch failed.']);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-4 text-start animate-fade-in">
      {/* Admin Dashboard header */}
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-4">
        <div>
          <h1 className="fw-bold mb-1">Admin Dashboard</h1>
          <p style={{ color: 'var(--text-muted)' }} className="mb-0">System controls, customer services, and incident management.</p>
        </div>
        <div className="small d-flex align-items-center p-2 rounded" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
          <i className="fas fa-user-circle me-1" style={{ color: 'var(--accent-primary)' }}></i> 
          Logged in as: <strong className="me-2" style={{ color: 'var(--text-primary)' }}>{admin.username}</strong>
          <button 
            type="button" 
            className="btn btn-sm btn-outline-primary border-0 p-0 d-inline-flex align-items-center justify-content-center me-3" 
            onClick={() => setShowProfileModal(true)}
            title="Edit Admin Details" 
            style={{ width: '28px', height: '28px', borderRadius: '50%' }}
          >
            <i className="fas fa-pen" style={{ color: 'var(--accent-primary)' }}></i>
          </button>
          <button type="button" className="btn btn-sm btn-outline-danger fw-bold py-1" onClick={handleLogoutClick} disabled={loading}>
            <i className="fas fa-sign-out-alt me-1"></i>Logout
          </button>
        </div>
      </div>

      {/* Counters Panel */}
      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <div className="card glass-panel shadow-sm border-0">
            <div className="card-body p-4 d-flex align-items-center gap-3">
              <div className="bg-primary bg-opacity-10 p-3 rounded-circle text-primary"><i className="fas fa-server fa-2x"></i></div>
              <div>
                <span className="text-muted small d-block">Monitored Servers</span>
                <h3 className="fw-bold mb-0">{stats.servers}</h3>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card glass-panel shadow-sm border-0">
            <div className="card-body p-4 d-flex align-items-center gap-3">
              <div className="bg-danger bg-opacity-10 p-3 rounded-circle text-danger"><i className="fas fa-exclamation-triangle fa-2x"></i></div>
              <div>
                <span className="text-muted small d-block">Active Outages</span>
                <h3 className="fw-bold mb-0 text-danger">{stats.incidents}</h3>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card glass-panel shadow-sm border-0">
            <div className="card-body p-4 d-flex align-items-center gap-3">
              <div className="bg-success bg-opacity-10 p-3 rounded-circle text-success"><i className="fas fa-globe fa-2x"></i></div>
              <div>
                <span className="text-muted small d-block">Client Domains</span>
                <h3 className="fw-bold mb-0">{stats.clients}</h3>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Success/Error Alerts */}
      {msgSuccess && (
        <div className="alert alert-success alert-dismissible fade show" role="alert">
          <i className="fas fa-check-circle me-1"></i> {msgSuccess}
          <button type="button" className="btn-close" onClick={() => setMsgSuccess('')}></button>
        </div>
      )}
      {msgErrors.length > 0 && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          <h6 className="alert-heading fw-bold"><i className="fas fa-exclamation-circle me-1"></i>Operation Failures</h6>
          <ul className="mb-0 small">
            {msgErrors.map((err, idx) => <li key={idx}>{err}</li>)}
          </ul>
          <button type="button" className="btn-close" onClick={() => setMsgErrors([])}></button>
        </div>
      )}

      {/* Navigation tabs */}
      <ul className="nav nav-tabs border-bottom mb-4">
        <li className="nav-item">
          <button className={`nav-link fw-bold border-0 px-4 py-2 ${activeTab === 'servers' ? 'active border-bottom border-primary border-3' : 'text-secondary'}`} onClick={() => setActiveTab('servers')}>
            <i className="fas fa-server me-2"></i>Servers
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link fw-bold border-0 px-4 py-2 ${activeTab === 'clients' ? 'active border-bottom border-primary border-3' : 'text-secondary'}`} onClick={() => setActiveTab('clients')}>
            <i className="fas fa-globe me-2"></i>Client Services
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link fw-bold border-0 px-4 py-2 ${activeTab === 'incidents' ? 'active border-bottom border-primary border-3' : 'text-secondary'}`} onClick={() => setActiveTab('incidents')}>
            <i className="fas fa-activity me-2"></i>Incidents Log
          </button>
        </li>
      </ul>

      {/* Dynamic Tab Body content */}
      <div className="tab-content">
        {loading && (
          <div className="mb-4">
            <div className="skeleton skeleton-card"></div>
          </div>
        )}
        {!loading && activeTab === 'servers' && (
          <div className="card glass-panel shadow-sm border-0 animate-fade-in-up">
            <div className="card-header bg-transparent border-0 pt-4 px-4 d-flex justify-content-between align-items-center">
              <h5 className="fw-bold mb-0">Monitored Infrastructure Nodes</h5>
              <button className="btn btn-sm btn-primary fw-bold" onClick={openAddServer} disabled={loading}><i className="fas fa-plus me-1"></i>Add Server</button>
            </div>
            <div className="card-body px-4 pb-4">
              {servers.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }} className="mb-0 small">No servers registered. Click 'Add Server' to get started.</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover align-middle text-start">
                    <thead>
                      <tr>
                        <th>Server Name</th>
                        <th>Code</th>
                        <th>IP Address</th>
                        <th>Location</th>
                        <th>Status</th>
                        <th className="text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {servers.map(srv => (
                        <tr key={srv.id}>
                          <td><strong>{srv.server_name}</strong></td>
                          <td><code>{srv.server_code}</code></td>
                          <td>{srv.ip_address}</td>
                          <td>{srv.location}</td>
                          <td>
                            <span className={`status-badge ${srv.status === 'Operational' ? 'operational' : 'outage'}`}>{srv.status}</span>
                          </td>
                          <td className="text-end">
                            <button className="btn btn-xs btn-outline-primary me-2" onClick={() => openEditServer(srv)}><i className="fas fa-edit"></i></button>
                            <button className="btn btn-xs btn-outline-danger" onClick={() => handleServerDelete(srv.id, srv.server_name)}><i className="fas fa-trash"></i></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {!loading && activeTab === 'clients' && (
          <div className="card glass-panel shadow-sm border-0 animate-fade-in-up">
            <div className="card-header bg-transparent border-0 pt-4 px-4 d-flex justify-content-between align-items-center">
              <h5 className="fw-bold mb-0">Registered Customer Domains</h5>
              <button className="btn btn-sm btn-primary fw-bold" onClick={openAddClient} disabled={loading}><i className="fas fa-plus me-1"></i>Add Client</button>
            </div>
            <div className="card-body px-4 pb-4">
              {clients.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }} className="mb-0 small">No client services registered. Click 'Add Client' to start.</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover align-middle text-start">
                    <thead>
                      <tr>
                        <th>Hosted Service ID</th>
                        <th>Company Name</th>
                        <th>Client Contact</th>
                        <th>Hosting Node</th>
                        <th className="text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clients.map(cli => (
                        <tr key={cli.id}>
                          <td><strong>{cli.service_id}</strong></td>
                          <td>{cli.company_name}</td>
                          <td>
                            {cli.client_name}<br />
                            <small style={{ color: 'var(--text-muted)' }}>{cli.email}</small>
                          </td>
                          <td>{cli.server_name} (<code>{cli.server_code}</code>)</td>
                          <td className="text-end">
                            <button className="btn btn-xs btn-outline-primary me-2" onClick={() => openEditClient(cli)}><i className="fas fa-edit"></i></button>
                            <button className="btn btn-xs btn-outline-danger" onClick={() => handleClientDelete(cli.id, cli.service_id)}><i className="fas fa-trash"></i></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {!loading && activeTab === 'incidents' && (
          <div className="card glass-panel shadow-sm border-0 animate-fade-in-up">
            <div className="card-header bg-transparent border-0 pt-4 px-4 d-flex justify-content-between align-items-center">
              <h5 className="fw-bold mb-0">Active / Scheduled System Outage Logs</h5>
              <button className="btn btn-sm btn-primary fw-bold" onClick={openDeclareIncident} disabled={loading}><i className="fas fa-bullhorn me-1"></i>Declare Incident</button>
            </div>
            <div className="card-body px-4 pb-4">
              {incidents.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }} className="mb-0 small">No incidents logged. All services healthy.</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover align-middle text-start">
                    <thead>
                      <tr>
                        <th>Outage Title</th>
                        <th>Type / Severity</th>
                        <th>Timeline window</th>
                        <th>Status</th>
                        <th className="text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incidents.map(inc => (
                        <tr key={inc.id}>
                          <td><strong>{inc.title}</strong></td>
                          <td>
                            <span className="status-badge type-badge me-2">{inc.type}</span>
                            <span className={`status-badge ${inc.severity === 'Low' ? 'operational' : inc.severity === 'Medium' ? 'degraded' : 'outage'}`}>{inc.severity}</span>
                          </td>
                          <td>
                            <small style={{ color: 'var(--text-muted)' }}><strong>Start:</strong> {new Date(inc.start_time).toLocaleString()}</small><br />
                            <small style={{ color: 'var(--text-muted)' }}><strong>End:</strong> {new Date(inc.end_time).toLocaleString()}</small>
                          </td>
                          <td>
                            <span className={`status-badge ${inc.status === 'Active' ? 'active' : inc.status === 'Scheduled' ? 'scheduled' : 'resolved'}`}>{inc.status}</span>
                          </td>
                          <td className="text-end">
                            {inc.type !== 'Maintenance' && (
                              <button className="btn btn-xs btn-outline-warning me-2" onClick={() => handleIncidentNotify(inc.id)} title="Notify Clients Manually" disabled={loading}><i className="fas fa-envelope"></i></button>
                            )}
                            <button className="btn btn-xs btn-outline-primary me-2" onClick={() => openEditIncident(inc)} disabled={loading}><i className="fas fa-edit"></i></button>
                            <button className="btn btn-xs btn-outline-danger" onClick={() => handleIncidentDelete(inc.id, inc.title)} disabled={loading}><i className="fas fa-trash"></i></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* ============================== MODALS LIST ============================== */}
      {/* ========================================================================= */}

      {/* Profile Modal */}
      {showProfileModal && (
        <div className="modal fade show animate-fade" style={{ display: 'block', background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content glass-panel border-0 text-start">
              <div className="modal-header border-0 pb-0">
                <h5 className="modal-title fw-bold"><i className="fas fa-user-cog me-2"></i>Edit Admin Profile</h5>
                <button type="button" className="btn-close" onClick={() => setShowProfileModal(false)}></button>
              </div>
              <form onSubmit={handleProfileSubmit}>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-secondary">Username</label>
                    <input type="text" className="form-control" value={profileForm.username} onChange={(e) => setProfileForm(prev => ({ ...prev, username: e.target.value }))} required disabled={loading} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-secondary">Email Address</label>
                    <input type="email" className="form-control" value={profileForm.email} onChange={(e) => setProfileForm(prev => ({ ...prev, email: e.target.value }))} required disabled={loading} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-secondary">Security Secret Code</label>
                    <input type="text" className="form-control" value={profileForm.secret_code} onChange={(e) => setProfileForm(prev => ({ ...prev, secret_code: e.target.value }))} required disabled={loading} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-secondary">New Password (Mandatory to save changes)</label>
                    <input type="password" className="form-control" placeholder="Enter new password" value={profileForm.password} onChange={(e) => setProfileForm(prev => ({ ...prev, password: e.target.value }))} required disabled={loading} />
                  </div>
                </div>
                <div className="modal-footer border-0">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowProfileModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
                    {loading ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="fas fa-save me-1"></i>}
                    Save Profile
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Server Form Modal */}
      {showServerModal && (
        <div className="modal fade show animate-fade" style={{ display: 'block', background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content glass-panel border-0 text-start">
              <div className="modal-header border-0 pb-0">
                <h5 className="modal-title fw-bold"><i className="fas fa-server me-2"></i>{serverForm.id ? 'Edit Server Node' : 'Add Server Node'}</h5>
                <button type="button" className="btn-close" onClick={() => setShowServerModal(false)}></button>
              </div>
              <form onSubmit={handleServerSubmit}>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-secondary">Server Name</label>
                    <input type="text" className="form-control" placeholder="Web Host India 01" value={serverForm.server_name} onChange={(e) => setServerForm(prev => ({ ...prev, server_name: e.target.value }))} required disabled={loading} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-secondary">Server Code</label>
                    <input type="text" className="form-control" placeholder="SRV-IND-01" value={serverForm.server_code} onChange={(e) => setServerForm(prev => ({ ...prev, server_code: e.target.value }))} required disabled={serverForm.id !== null || loading} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-secondary">IP Address</label>
                    <input type="text" className="form-control" placeholder="192.168.1.10" value={serverForm.ip_address} onChange={(e) => setServerForm(prev => ({ ...prev, ip_address: e.target.value }))} required disabled={loading} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-secondary">Location</label>
                    <input type="text" className="form-control" placeholder="Mumbai, India" value={serverForm.location} onChange={(e) => setServerForm(prev => ({ ...prev, location: e.target.value }))} required disabled={loading} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-secondary">Current Status</label>
                    <select className="form-select" value={serverForm.status} onChange={(e) => setServerForm(prev => ({ ...prev, status: e.target.value }))} disabled={loading}>
                      <option value="Operational">Operational</option>
                      <option value="Outage">Outage</option>
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-secondary">Description</label>
                    <textarea className="form-control" rows="2" value={serverForm.description} onChange={(e) => setServerForm(prev => ({ ...prev, description: e.target.value }))} disabled={loading}></textarea>
                  </div>
                </div>
                <div className="modal-footer border-0">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowServerModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
                    {loading ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="fas fa-save me-1"></i>}
                    Save Server
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Client Form Modal */}
      {showClientModal && (
        <div className="modal fade show animate-fade" style={{ display: 'block', background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content glass-panel border-0 text-start">
              <div className="modal-header border-0 pb-0">
                <h5 className="modal-title fw-bold"><i className="fas fa-user-circle me-2"></i>{clientForm.id ? 'Edit Client Service' : 'Add Client Service'}</h5>
                <button type="button" className="btn-close" onClick={() => setShowClientModal(false)}></button>
              </div>
              <form onSubmit={handleClientSubmit}>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-secondary">Client / Owner Name</label>
                    <input type="text" className="form-control" placeholder="John Doe" value={clientForm.client_name} onChange={(e) => setClientForm(prev => ({ ...prev, client_name: e.target.value }))} required disabled={loading} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-secondary">Company Name</label>
                    <input type="text" className="form-control" placeholder="Acme Inc." value={clientForm.company_name} onChange={(e) => setClientForm(prev => ({ ...prev, company_name: e.target.value }))} required disabled={loading} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-secondary">Contact Person</label>
                    <input type="text" className="form-control" placeholder="Manager Name" value={clientForm.contact_person} onChange={(e) => setClientForm(prev => ({ ...prev, contact_person: e.target.value }))} required disabled={loading} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-secondary">Client Email Address</label>
                    <input type="email" className="form-control" placeholder="client@company.com" value={clientForm.email} onChange={(e) => setClientForm(prev => ({ ...prev, email: e.target.value }))} required disabled={loading} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-secondary">Client Phone</label>
                    <input type="text" className="form-control" placeholder="+123456789" value={clientForm.phone} onChange={(e) => setClientForm(prev => ({ ...prev, phone: e.target.value }))} required disabled={loading} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-secondary">Service ID / Domain Name</label>
                    <input type="text" className="form-control" placeholder="mysite.com" value={clientForm.service_id} onChange={(e) => setClientForm(prev => ({ ...prev, service_id: e.target.value }))} required disabled={clientForm.id !== null || loading} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-secondary">Hosting Server Node</label>
                    <select className="form-select" value={clientForm.server_id} onChange={(e) => handleClientServerChange(e.target.value)} required disabled={loading}>
                      <option value="">-- Select Server --</option>
                      {servers.map(s => <option key={s.id} value={s.id}>{s.server_name} ({s.server_code})</option>)}
                    </select>
                  </div>

                  {serverWarning && (
                    <div className="alert alert-warning py-2 mb-3 small border-warning">
                      <i className="fas fa-exclamation-triangle me-1"></i>
                      <strong>Attention:</strong> The selected server node has active outages. Registering this service will flag it in an outage state immediately.
                    </div>
                  )}

                  {!clientForm.id && (
                    <div className="form-check mb-3">
                      <input type="checkbox" className="form-check-input" id="notify-cli" checked={clientForm.notify_client} onChange={(e) => setClientForm(prev => ({ ...prev, notify_client: e.target.checked }))} disabled={loading} />
                      <label className="form-check-label small text-secondary" htmlFor="notify-cli">
                        Send active incident alert notification to client email immediately
                      </label>
                    </div>
                  )}
                </div>
                <div className="modal-footer border-0">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowClientModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
                    {loading ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="fas fa-save me-1"></i>}
                    Save Client
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Incident Declaration Modal */}
      {showIncidentModal && (
        <div className="modal fade show animate-fade" style={{ display: 'block', background: 'rgba(0,0,0,0.5)', overflowY: 'auto' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content glass-panel border-0 text-start">
              <div className="modal-header border-0 pb-0">
                <h5 className="modal-title fw-bold"><i className="fas fa-bullhorn me-2 text-danger"></i>{incidentForm.id ? 'Edit Incident details' : 'Declare Outage Incident'}</h5>
                <button type="button" className="btn-close" onClick={() => setShowIncidentModal(false)}></button>
              </div>
              <form onSubmit={handleIncidentSubmit}>
                <div className="modal-body">
                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label className="form-label fw-bold small text-secondary">Incident Title</label>
                      <input type="text" className="form-control" placeholder="Server IND-01 Outage" value={incidentForm.title} onChange={(e) => setIncidentForm(prev => ({ ...prev, title: e.target.value }))} required disabled={loading} />
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-label fw-bold small text-secondary">Incident Type</label>
                      <select className="form-select" value={incidentForm.type} onChange={(e) => setIncidentForm(prev => ({ ...prev, type: e.target.value }))} disabled={loading}>
                        <option value="Down">Down (Full Outage)</option>
                        <option value="Degraded Performance">Degraded Performance</option>
                        <option value="Partial Outage">Partial Outage</option>
                        <option value="Maintenance">Scheduled Maintenance</option>
                        <option value="Security Notice">Security Notice</option>
                      </select>
                    </div>
                  </div>

                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label className="form-label fw-bold small text-secondary">Severity Rating</label>
                      <select className="form-select" value={incidentForm.severity} onChange={(e) => setIncidentForm(prev => ({ ...prev, severity: e.target.value }))} disabled={loading}>
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Critical">Critical</option>
                      </select>
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-label fw-bold small text-secondary">Incident Status</label>
                      <select className="form-select" value={incidentForm.status} onChange={(e) => setIncidentForm(prev => ({ ...prev, status: e.target.value }))} disabled={loading}>
                        <option value="Active">Active</option>
                        <option value="Scheduled">Scheduled</option>
                        <option value="Resolved">Resolved</option>
                      </select>
                    </div>
                  </div>

                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label className="form-label fw-bold small text-secondary">Start Time (Local)</label>
                      <input type="datetime-local" className="form-control" value={incidentForm.start_time} onChange={(e) => setIncidentForm(prev => ({ ...prev, start_time: e.target.value }))} required disabled={loading} />
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-label fw-bold small text-secondary">End Time (Local)</label>
                      <input type="datetime-local" className="form-control" value={incidentForm.end_time} onChange={(e) => setIncidentForm(prev => ({ ...prev, end_time: e.target.value }))} required disabled={loading} />
                    </div>
                  </div>

                  <div className="row">
                    <div className="col-md-12 mb-3">
                      <label className="form-label fw-bold small text-secondary">Incident Scope</label>
                      <select 
                        className="form-select" 
                        value={incidentForm.scope} 
                        onChange={(e) => setIncidentForm(prev => ({ ...prev, scope: e.target.value }))}
                        disabled={loading}
                      >
                        <option value="server">Server-wide Outage (Affects all or selected hosted clients)</option>
                        <option value="client">Single Client Outage (Affects one specific client service)</option>
                        <option value="custom">General / Custom Outage (No server or client association)</option>
                      </select>
                    </div>
                  </div>

                  {/* Conditional Scope Render */}
                  {incidentForm.scope === 'client' ? (
                    <div className="mb-3">
                      <label className="form-label fw-bold small text-secondary">Affected Client Service / Domain</label>
                      <select 
                        className="form-select" 
                        value={incidentForm.selectedClientService} 
                        onChange={(e) => setIncidentForm(prev => ({ ...prev, selectedClientService: e.target.value }))}
                        required
                        disabled={loading}
                      >
                        <option value="">-- Select Client Service --</option>
                        {clients.map(c => (
                          <option key={c.id} value={c.service_id}>
                            {c.service_id} ({c.company_name} - {c.client_name})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : incidentForm.scope === 'custom' ? (
                    <div className="alert alert-info py-2 mb-3 small border-info">
                      <i className="fas fa-info-circle me-1"></i>
                      <strong>General Outage Scope:</strong> This incident will be created independently and won't affect any specific servers or client accounts directly.
                    </div>
                  ) : (
                    <>
                      <div className="mb-3">
                        <label className="form-label fw-bold small text-secondary">Checked Infrastructure Servers (Select at least one)</label>
                        <div className="border p-2 rounded" style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border-color)' }}>
                          {servers.map(s => (
                            <div className="form-check form-check-inline" key={s.id}>
                              <input 
                                type="checkbox" 
                                className="form-check-input" 
                                id={`server-cb-${s.id}`} 
                                value={s.id} 
                                checked={incidentForm.selectedServers.includes(s.id)}
                                onChange={(e) => handleIncidentServerCheck(s.id, e.target.checked)}
                                disabled={loading}
                              />
                              <label className="form-check-label" htmlFor={`server-cb-${s.id}`}>{s.server_name} ({s.server_code})</label>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Checklist of services */}
                      {incidentForm.selectedServers.length > 0 && (
                        <div className="mb-3">
                          <label className="form-label fw-bold small text-secondary">Selective Affected Hosted Services (Excludes unchecked from alerts)</label>
                          <div className="border p-2 rounded" style={{ maxHeight: '150px', overflowY: 'auto', background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                            {availableServices.length === 0 ? (
                              <p className="text-secondary small mb-0">No hosted services detected on selected server node(s).</p>
                            ) : (
                              availableServices.map(s => (
                                <div className="form-check form-check-inline mb-1" key={s.service_id}>
                                  <input 
                                    type="checkbox" 
                                    className="form-check-input" 
                                    id={`service-cb-${s.service_id}`} 
                                    value={s.service_id} 
                                    checked={incidentForm.selectedServices.includes(s.service_id)}
                                    onChange={(e) => handleIncidentServiceCheck(s.service_id, e.target.checked)}
                                    disabled={loading}
                                  />
                                  <label className="form-check-label small" htmlFor={`service-cb-${s.service_id}`}>
                                    <code>{s.service_id}</code> <span className="text-muted">({s.client_name})</span>
                                  </label>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  <div className="mb-3">
                    <label className="form-label fw-bold small text-secondary">Technical Description (Internal Notes)</label>
                    <textarea className="form-control" rows="2" value={incidentForm.description} onChange={(e) => setIncidentForm(prev => ({ ...prev, description: e.target.value }))} required disabled={loading}></textarea>
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-bold small text-secondary">Public Outage Banner Message (Exposed to Clients)</label>
                    <input type="text" className="form-control" placeholder="A network routing disturbance is currently affecting domains on SRV-IND-01." value={incidentForm.public_message} onChange={(e) => setIncidentForm(prev => ({ ...prev, public_message: e.target.value }))} disabled={loading} />
                  </div>

                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label className="form-label fw-bold small text-secondary">Estimated Resolution time</label>
                      <input type="text" className="form-control" placeholder="1-2 hours" value={incidentForm.expected_resolution} onChange={(e) => setIncidentForm(prev => ({ ...prev, expected_resolution: e.target.value }))} disabled={loading} />
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-label fw-bold small text-secondary">Maintenance Window duration</label>
                      <input type="text" className="form-control" placeholder="12:00 PM - 02:00 PM EST" value={incidentForm.maintenance_window} onChange={(e) => setIncidentForm(prev => ({ ...prev, maintenance_window: e.target.value }))} disabled={loading} />
                    </div>
                  </div>

                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label className="form-label fw-bold small text-secondary">Internal notes</label>
                      <input type="text" className="form-control" value={incidentForm.internal_notes} onChange={(e) => setIncidentForm(prev => ({ ...prev, internal_notes: e.target.value }))} disabled={loading} />
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-label fw-bold small text-secondary">Root Cause explanation</label>
                      <input type="text" className="form-control" placeholder="Fibre cut" value={incidentForm.root_cause} onChange={(e) => setIncidentForm(prev => ({ ...prev, root_cause: e.target.value }))} disabled={loading} />
                    </div>
                  </div>
                </div>
                <div className="modal-footer border-0">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowIncidentModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
                    {loading ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="fas fa-save me-1"></i>}
                    Save Incident
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

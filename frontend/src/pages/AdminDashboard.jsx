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

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import axios from 'axios';
import PublicDashboard from './pages/PublicDashboard';
import Login from './pages/Login';
import Forgot from './pages/Forgot';
import ResetPassword from './pages/ResetPassword';
import AdminDashboard from './pages/AdminDashboard';

export default function App() {
  const [admin, setAdmin] = useState(null);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [authChecking, setAuthChecking] = useState(true);

  // Expose anti-CSRF token fetcher (set cookie / headers for axios globally)
  useEffect(() => {
    axios.defaults.withCredentials = true;
    
    // Fetch CSRF configuration token globally
    axios.get('/api/config')
      .then(res => {
        if (res.data.csrfToken) {
          axios.defaults.headers.common['x-csrf-token'] = res.data.csrfToken;
        }
        checkAuthSession();
      })
      .catch(err => {
        console.error('Failed to pre-fetch CSRF config:', err);
        checkAuthSession();
      });
  }, []);

  // Sync theme to root html element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const checkAuthSession = async () => {
    try {
      const res = await axios.get('/api/auth/me');
      if (res.data.authenticated) {
        setAdmin(res.data.admin);
      }
    } catch (e) {
      console.log('Session authentication check bypassed or expired.');
    } finally {
      setAuthChecking(false);
    }
  };

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  if (authChecking) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className="d-flex flex-column min-vh-100" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        {/* Navigation Header */}
        <nav className="navbar navbar-expand-lg navbar-custom sticky-top">
          <div className="container">
            <Link className="navbar-brand-custom" to="/">
              <img src="/iD.png" alt="IdentityCraft SSP logo" className="brand-mark" style={{ borderRadius: '8px' }} />
              <div className="brand-text">
                <span className="brand-title">IdentityCraft SSP</span>
                <span className="brand-subtitle">Service Status Portal</span>
              </div>
            </Link>
            
            <div className="d-flex align-items-center gap-3">
              {admin ? (
                <Link to="/admin" className="btn btn-outline-primary btn-sm fw-bold">
                  <i className="fas fa-chart-line me-1"></i>Dashboard
                </Link>
              ) : null}
              <button 
                type="button" 
                className="theme-toggle-btn d-flex align-items-center justify-content-center border-0 bg-transparent text-primary" 
                onClick={toggleTheme}
                title="Toggle Theme" 
                style={{ fontSize: '1.2rem', width: '36px', height: '36px', cursor: 'pointer' }}
              >
                <i className={theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon'}></i>
              </button>
            </div>
          </div>
        </nav>

        {/* Main Body view routes container */}
        <main className="container flex-grow-1 my-4">
          <Routes>
            <Route path="/" element={<PublicDashboard />} />
            <Route 
              path="/login" 
              element={admin ? <Navigate to="/admin" /> : <Login onLoginSuccess={setAdmin} />} 
            />
            <Route path="/forgot-password" element={<Forgot />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route 
              path="/admin" 
              element={admin ? <AdminDashboard admin={admin} onLogout={() => setAdmin(null)} /> : <Navigate to="/login" />} 
            />
            {/* Redirect /admin.html to /login */}
            <Route path="/admin.html" element={<Navigate to="/login" />} />
            {/* Catch-all fallback redirecting to public landing */}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="border-top py-4 bg-tertiary mt-auto" style={{ backgroundColor: 'var(--bg-tertiary)', borderTopColor: 'var(--border-color)' }}>
          <div className="container text-center">
            <p className="footer-text mb-0">&copy; {new Date().getFullYear()} IdentityCraft SSP. All rights reserved.</p>
            <p className="footer-text mt-1 text-muted small">Trusted service monitoring for secure operations.</p>
          </div>
        </footer>
      </div>
    </Router>
  );
}

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [siteKey, setSiteKey] = useState('');
  const [errors, setErrors] = useState([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Load recaptcha dynamically if key exists
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await axios.get('/api/config');
        if (res.data.recaptchaSiteKey) {
          setSiteKey(res.data.recaptchaSiteKey);
          const script = document.createElement('script');
          script.src = `https://www.google.com/recaptcha/api.js?render=${res.data.recaptchaSiteKey}`;
          script.async = true;
          script.id = 'recaptcha-script';
          document.body.appendChild(script);
        }
      } catch (err) {
        console.error('Failed to load portal configuration:', err);
      }
    };
    fetchConfig();

    return () => {
      const script = document.getElementById('recaptcha-script');
      if (script) document.body.removeChild(script);
      // Remove any leftover recaptcha badges from DOM
      const badges = document.querySelectorAll('.grecaptcha-badge');
      badges.forEach(b => b.remove());
    };
  }, []);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrors([]);
    setStatusMessage('Verifying...');
    setLoading(true);

    const submitLoginPayload = async (recaptchaToken = '') => {
      try {
        const response = await axios.post('/api/auth/login', {
          email,
          password,
          grecaptcha_token: recaptchaToken
        });
        setStatusMessage('Success! Loading dashboard...');
        onLoginSuccess(response.data.admin);
        setTimeout(() => {
          navigate('/admin');
        }, 800);
      } catch (err) {
        setErrors(err.response?.data?.errors || [err.response?.data?.error || 'Sign in failed.']);
        setStatusMessage('');
        setLoading(false);
      }
    };

    if (siteKey && window.grecaptcha) {
      window.grecaptcha.ready(() => {
        window.grecaptcha.execute(siteKey, { action: 'login' })
          .then((token) => {
            setStatusMessage('Processing...');
            submitLoginPayload(token);
          })
          .catch((err) => {
            console.error('reCAPTCHA execution failed:', err);
            setErrors(['reCAPTCHA token extraction failed. Please try again.']);
            setStatusMessage('');
            setLoading(false);
          });
      });
    } else {
      // Mock Bypass Mode
      setStatusMessage('Processing...');
      submitLoginPayload();
    }
  };

  return (
    <div className="row justify-content-center align-items-center" style={{ minHeight: '70vh' }}>
      <div className="col-md-5">
        <div className="card glass-panel shadow-lg border-0">
          <div className="card-body p-4 p-md-5 text-center">
            <div className="mb-4">
              <img src="/identityCraft-full-logo.jpg.jpeg" alt="IdentityCraft SSP logo" style={{ maxHeight: '60px', width: 'auto', objectFit: 'contain', marginBottom: '16px' }} />
              <p className="text-secondary text-muted">Secure admin access for service monitoring and incident response.</p>
            </div>

            {/* Error alerts */}
            {errors.length > 0 && (
              <div className="alert alert-danger alert-dismissible fade show text-start" role="alert">
                {errors.map((err, idx) => (
                  <div className="small" key={idx}><i className="fas fa-times-circle me-1"></i>{err}</div>
                ))}
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="text-start">
              <div className="mb-3">
                <label htmlFor="email" class="form-label fw-bold text-secondary small">Admin Email</label>
                <div className="search-wrapper" style={{ position: 'relative' }}>
                  <i className="fas fa-envelope" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}></i>
                  <input 
                    type="email" 
                    className="form-control text-start" 
                    id="email" 
                    placeholder="Enter admin email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ paddingLeft: '36px' }}
                    required 
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="mb-3">
                <div className="d-flex justify-content-between">
                  <label htmlFor="password" class="form-label fw-bold text-secondary small">Password</label>
                  <Link to="/forgot-password" className="small text-decoration-none">Forgot Password?</Link>
                </div>
                <div className="search-wrapper" style={{ position: 'relative' }}>
                  <i className="fas fa-lock" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}></i>
                  <input 
                    type="password" 
                    className="form-control text-start" 
                    id="password" 
                    placeholder="Enter password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ paddingLeft: '36px' }}
                    autoComplete="current-password"
                    required 
                    disabled={loading}
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-primary w-100 mt-2 py-2 fw-bold" disabled={loading}>
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                    {statusMessage || 'Processing...'}
                  </>
                ) : (
                  <>
                    <i className="fas fa-sign-in-alt me-2"></i>Sign In
                  </>
                )}
              </button>
            </form>
            
            <div className="mt-4">
              <Link to="/" className="text-decoration-none small"><i className="fas fa-arrow-left me-1"></i>Back to Status</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

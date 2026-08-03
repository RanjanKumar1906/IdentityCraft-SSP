import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [secretCode, setSecretCode] = useState('');
  const [siteKey, setSiteKey] = useState('');
  const [errors, setErrors] = useState([]);
  const [successMsg, setSuccessMsg] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

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
        console.error('Failed to load configuration:', err);
      }
    };
    fetchConfig();

    return () => {
      const script = document.getElementById('recaptcha-script');
      if (script) document.body.removeChild(script);
      const badges = document.querySelectorAll('.grecaptcha-badge');
      badges.forEach(b => b.remove());
    };
  }, []);

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setErrors([]);
    setSuccessMsg('');
    setStatusMessage('Verifying...');
    setLoading(true);

    const submitForgotPayload = async (recaptchaToken = '') => {
      try {
        const res = await axios.post('/api/auth/forgot-password', {
          email,
          secret_code: secretCode,
          grecaptcha_token: recaptchaToken
        });
        setSuccessMsg(res.data.message || 'Identity verified! A new password has been sent to your email.');
        setEmail('');
        setSecretCode('');
      } catch (err) {
        setErrors(err.response?.data?.errors || [err.response?.data?.error || 'Verification failed.']);
      } finally {
        setStatusMessage('');
        setLoading(false);
      }
    };

    if (siteKey && window.grecaptcha) {
      window.grecaptcha.ready(() => {
        window.grecaptcha.execute(siteKey, { action: 'forgot' })
          .then((token) => {
            setStatusMessage('Processing...');
            submitForgotPayload(token);
          })
          .catch((err) => {
            console.error('reCAPTCHA execution failed:', err);
            setErrors(['reCAPTCHA token extraction failed. Please try again.']);
            setStatusMessage('');
            setLoading(false);
          });
      });
    } else {
      setStatusMessage('Processing...');
      submitForgotPayload();
    }
  };

  return (
    <div className="row justify-content-center align-items-center" style={{ minHeight: '70vh' }}>
      <div className="col-md-5">
        <div className="card glass-panel shadow-lg border-0">
          <div className="card-body p-4 p-md-5 text-center">
            <div className="mb-4">
              <img src="/identityCraft-full-logo.jpg.jpeg" alt="IdentityCraft SSP logo" style={{ maxHeight: '50px', width: 'auto', objectFit: 'contain', marginBottom: '16px' }} />
              <h3 className="fw-bold mb-1"><i className="fas fa-key text-warning me-2"></i>Recover Password</h3>
              <p className="text-secondary text-muted">Enter your admin email and secret security code to recover your account.</p>
            </div>

            {/* Error alerts */}
            {errors.length > 0 && (
              <div className="alert alert-danger alert-dismissible fade show text-start" role="alert">
                {errors.map((err, idx) => (
                  <div className="small" key={idx}><i className="fas fa-times-circle me-1"></i>{err}</div>
                ))}
              </div>
            )}

            {/* Success alert */}
            {successMsg && (
              <div className="alert alert-success alert-dismissible fade show text-start" role="alert">
                <div className="small"><i className="fas fa-check-circle me-1"></i>{successMsg}</div>
              </div>
            )}

            <form onSubmit={handleForgotSubmit} className="text-start">
              <div className="mb-3">
                <label htmlFor="email" class="form-label fw-bold text-secondary small">Admin Email Address</label>
                <div className="search-wrapper" style={{ position: 'relative' }}>
                  <i className="fas fa-envelope" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}></i>
                  <input 
                    type="email" 
                    className="form-control text-start" 
                    id="email" 
                    placeholder="Enter admin email address" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ paddingLeft: '36px' }}
                    required 
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="mb-3">
                <label htmlFor="secret_code" class="form-label fw-bold text-secondary small">Secret Security Code</label>
                <div className="search-wrapper" style={{ position: 'relative' }}>
                  <i className="fas fa-lock" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}></i>
                  <input 
                    type="password" 
                    className="form-control text-start" 
                    id="secret_code" 
                    placeholder="Enter administrative secret code" 
                    value={secretCode}
                    onChange={(e) => setSecretCode(e.target.value)}
                    style={{ paddingLeft: '36px' }}
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
                    <i className="fas fa-paper-plane me-2"></i>Recover Password
                  </>
                )}
              </button>
            </form>
            
            <div className="mt-4">
              <Link to="/login" className="text-decoration-none small"><i className="fas fa-arrow-left me-1"></i>Back to Sign In</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import axios from 'axios';
import { useSearchParams, Link } from 'react-router-dom';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errors, setErrors] = useState([]);

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setErrors([]);
    setSuccessMsg('');

    if (!token) {
      setErrors(['Password reset token is missing from the URL link address.']);
      return;
    }

    if (password.length < 8) {
      setErrors(['Password must be at least 8 characters long.']);
      return;
    }

    if (password !== confirmPassword) {
      setErrors(['Passwords do not match. Please verify your entries.']);
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post('/api/auth/reset-password', {
        token,
        password
      });
      setSuccessMsg(response.data.message || 'Password updated successfully!');
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.error(err);
      setErrors(err.response?.data?.errors || [err.response?.data?.error || 'Password reset failed.']);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="row justify-content-center align-items-center" style={{ minHeight: '70vh' }}>
      <div className="col-md-5">
        <div className="card glass-panel shadow-lg border-0">
          <div className="card-body p-4 p-md-5 text-center">
            <div className="mb-4">
              <img src="/identityCraft-full-logo.jpg.jpeg" alt="IdentityCraft SSP logo" style={{ maxHeight: '50px', width: 'auto', objectFit: 'contain', marginBottom: '16px' }} />
              <h3 className="fw-bold mb-1"><i className="fas fa-user-shield text-success me-2"></i>Reset Password</h3>
              <p className="text-secondary text-muted">Enter a new secure password for your administrator account.</p>
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
              <div className="alert alert-success alert-dismissible show text-start mb-4" role="alert">
                <div className="small mb-3"><i className="fas fa-check-circle me-1"></i>{successMsg}</div>
                <Link to="/login" className="btn btn-success btn-sm w-100 fw-bold">
                  <i className="fas fa-sign-in-alt me-1"></i>Go to Sign In
                </Link>
              </div>
            )}

            {!successMsg && (
              <form onSubmit={handleResetSubmit} className="text-start">
                <div className="mb-3">
                  <label htmlFor="pass" className="form-label fw-bold text-secondary small">New Password</label>
                  <div className="search-wrapper" style={{ position: 'relative' }}>
                    <i className="fas fa-key" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}></i>
                    <input 
                      type="password" 
                      className="form-control text-start" 
                      id="pass" 
                      placeholder="Minimum 8 characters" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      style={{ paddingLeft: '36px' }}
                      required 
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label htmlFor="confirm_pass" className="form-label fw-bold text-secondary small">Confirm New Password</label>
                  <div className="search-wrapper" style={{ position: 'relative' }}>
                    <i className="fas fa-lock" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}></i>
                    <input 
                      type="password" 
                      className="form-control text-start" 
                      id="confirm_pass" 
                      placeholder="Confirm your entry" 
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      style={{ paddingLeft: '36px' }}
                      required 
                      disabled={loading}
                    />
                  </div>
                </div>

                <button 
                  type="submit" 
                  className="btn btn-primary w-100 fw-bold py-2 mb-3" 
                  disabled={loading || !token}
                >
                  {loading ? (
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  ) : (
                    <i className="fas fa-save me-2"></i>
                  )}
                  Save New Password
                </button>

                {!token && (
                  <div className="alert alert-warning py-2 mb-0 small text-center border-warning">
                    <i className="fas fa-exclamation-triangle me-1"></i>
                    Reset token is missing. Please click the full link in your recovery email.
                  </div>
                )}
              </form>
            )}

            <div className="mt-4 text-center">
              <Link to="/login" className="text-decoration-none small text-primary fw-bold">
                <i className="fas fa-arrow-left me-1"></i>Back to Login
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

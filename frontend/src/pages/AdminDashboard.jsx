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

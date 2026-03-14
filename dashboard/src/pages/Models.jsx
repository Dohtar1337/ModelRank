import React, { useState, useEffect } from 'react';
import { Pencil, Trash2, Zap, Plus, ChevronDown } from 'lucide-react';
import * as api from '../lib/api';

function costColor(c) {
  if (!c || c === 0) return '#00ff88';
  if (c < 0.05) return '#00ddff';
  if (c < 0.50) return '#ffaa00';
  return '#ff4444';
}

function slugify(str) {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
}

const emptyForm = { key: '', name: '', provider: '', model_id: '', role: '', cost_per_1m_in: '', cost_per_1m_out: '', context_window: '' };

export default function Models() {
  const [modelsMap, setModelsMap] = useState({});
  const [providersMap, setProvidersMap] = useState({});
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(null); // null = hidden, object = form data
  const [editingKey, setEditingKey] = useState(null); // null = adding, string = editing
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [testingKey, setTestingKey] = useState(null);
  const [testResult, setTestResult] = useState({});
  const [openRouterModels, setOpenRouterModels] = useState([]);
  const [openRouterSearch, setOpenRouterSearch] = useState('');
  const [loadingOR, setLoadingOR] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      const [m, p, s] = await Promise.all([api.getModels(), api.getProviders(), api.getSettings()]);
      setModelsMap(m.models || m || {});
      setProvidersMap(p.providers || p || {});
      setSettings(s || {});
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const avgIn = settings.avg_input_tokens || 1200;
  const avgOut = settings.avg_output_tokens || 1500;
  const estCost = (m) => (avgIn * (m.cost_per_1m_in || 0) / 1e6) + (avgOut * (m.cost_per_1m_out || 0) / 1e6);

  const providerKeys = Object.keys(providersMap);
  const modelEntries = Object.entries(modelsMap);

  const openAdd = () => {
    setEditingKey(null);
    setForm({ ...emptyForm });
    setOpenRouterSearch('');
  };

  const openEdit = (key, m) => {
    setEditingKey(key);
    setForm({ key, name: m.label || '', provider: m.provider || '', model_id: m.model_id || '', role: m.role || '', cost_per_1m_in: m.cost_per_1m_in ?? '', cost_per_1m_out: m.cost_per_1m_out ?? '', context_window: m.context_window ?? '' });
  };

  const loadOpenRouterModels = async () => {
    setLoadingOR(true);
    try {
      const models = await api.getOpenRouterModels();
      setOpenRouterModels(models || []);
    } catch (e) {
      setError('Failed to load OpenRouter models: ' + e.message);
    } finally {
      setLoadingOR(false);
    }
  };

  const addFromOpenRouter = (orModel) => {
    setForm({
      key: '',
      name: orModel.name,
      provider: 'openrouter',
      model_id: orModel.id,
      role: '',
      cost_per_1m_in: orModel.pricing?.prompt ? (orModel.pricing.prompt * 1e6).toFixed(4) : '',
      cost_per_1m_out: orModel.pricing?.completion ? (orModel.pricing.completion * 1e6).toFixed(4) : '',
      context_window: orModel.context_length || '',
    });
    setOpenRouterModels([]);
    setOpenRouterSearch('');
  };

  const saveForm = async () => {
    if (!form.name || !form.model_id) { setError('Name and Model ID required'); return; }
    const updated = { ...modelsMap };
    const key = editingKey || slugify(form.name);
    updated[key] = {
      label: form.name, provider: form.provider, model_id: form.model_id,
      role: form.role, cost_per_1m_in: parseFloat(form.cost_per_1m_in) || 0,
      cost_per_1m_out: parseFloat(form.cost_per_1m_out) || 0,
      context_window: parseInt(form.context_window) || 0,
    };
    // If editing and key changed, remove old
    if (editingKey && editingKey !== key) delete updated[editingKey];
    try {
      await api.saveModels({ models: updated });
      setModelsMap(updated);
      setForm(null);
      setEditingKey(null);
      setError(null);
    } catch (e) { setError(e.message); }
  };

  const deleteModel = async (key) => {
    const updated = { ...modelsMap };
    delete updated[key];
    try {
      await api.saveModels({ models: updated });
      setModelsMap(updated);
      setDeleteConfirm(null);
    } catch (e) { setError(e.message); }
  };

  const testModel = async (key) => {
    setTestingKey(key);
    setTestResult(prev => ({ ...prev, [key]: null }));
    const m = modelsMap[key];
    const prov = providersMap[m.provider];
    if (!prov) { setTestResult(prev => ({ ...prev, [key]: { success: false, error: 'Provider not found' } })); setTestingKey(null); return; }
    try {
      const res = await api.testProvider({ base_url: prov.base_url, api_key_env: prov.api_key_env, model_id: m.model_id, headers: prov.headers });
      setTestResult(prev => ({ ...prev, [key]: res }));
    } catch (e) {
      setTestResult(prev => ({ ...prev, [key]: { success: false, error: e.message } }));
    } finally { setTestingKey(null); }
  };

  if (loading) return <div style={{ padding: 24, color: '#666' }}>Loading...</div>;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ color: '#00ff88', fontSize: 20, fontWeight: 700, letterSpacing: 2 }}>MODELS</h1>
        <button className="btn-primary" onClick={openAdd}><Plus size={14} /> Add Model</button>
      </div>

      {error && <div style={{ color: '#ff4444', padding: 12, border: '1px solid #ff4444', marginBottom: 16 }}>{error}</div>}

      {providerKeys.length === 0 && (
        <div style={{ color: '#ffaa00', padding: 16, border: '1px solid #ffaa00', marginBottom: 16 }}>
          No providers configured. <a href="/settings" style={{ color: '#00ff88' }}>Configure providers first →</a>
        </div>
      )}

      {/* OpenRouter Quick Add */}
      {!form && (
        <div style={{ background: '#141414', border: '1px solid #252525', padding: 20, marginBottom: 20 }}>
          <h3 style={{ color: '#00ddff', marginBottom: 12 }}>QUICK ADD FROM OPENROUTER</h3>
          {openRouterModels.length === 0 ? (
            <button onClick={loadOpenRouterModels} disabled={loadingOR} style={{ marginBottom: 12 }}>
              {loadingOR ? 'Loading...' : 'Load OpenRouter Models'}
            </button>
          ) : (
            <>
              <input
                type="text"
                placeholder="Search models..."
                value={openRouterSearch}
                onChange={e => setOpenRouterSearch(e.target.value)}
                style={{ width: '100%', marginBottom: 12 }}
              />
              <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #252525', marginBottom: 12 }}>
                {openRouterModels
                  .filter(m =>
                    m.name.toLowerCase().includes(openRouterSearch.toLowerCase()) ||
                    m.id.toLowerCase().includes(openRouterSearch.toLowerCase())
                  )
                  .slice(0, 20)
                  .map((m, i) => (
                    <div key={i} style={{ padding: 12, borderBottom: '1px solid #252525', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ color: '#e0e0e0', fontSize: 13 }}>{m.name}</div>
                        <div style={{ color: '#666', fontSize: 11 }}>
                          {m.pricing?.prompt && m.pricing?.completion && `$${(m.pricing.prompt * 1e6).toFixed(2)}/$${(m.pricing.completion * 1e6).toFixed(2)}`}
                          {m.context_length && ` · ${m.context_length.toLocaleString()} ctx`}
                        </div>
                      </div>
                      <button onClick={() => addFromOpenRouter(m)} style={{ fontSize: 12 }}>Add</button>
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Add/Edit Form */}
      {form && (
        <div style={{ background: '#141414', border: '1px solid #00ff88', padding: 20, marginBottom: 20 }}>
          <h3 style={{ color: '#00ff88', marginBottom: 12 }}>{editingKey ? 'EDIT MODEL' : 'ADD MODEL'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ color: '#888', fontSize: 11, display: 'block', marginBottom: 4 }}>NAME</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="GPT-4o" style={{ width: '100%' }} />
              {form.name && !editingKey && <div style={{ color: '#666', fontSize: 10, marginTop: 2 }}>Key: {slugify(form.name)}</div>}
            </div>
            <div>
              <label style={{ color: '#888', fontSize: 11, display: 'block', marginBottom: 4 }}>PROVIDER</label>
              <select value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })} style={{ width: '100%' }}>
                <option value="">Select...</option>
                {providerKeys.map(k => <option key={k} value={k}>{providersMap[k].name || k}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color: '#888', fontSize: 11, display: 'block', marginBottom: 4 }} title="The model identifier sent to the API (e.g., openai/gpt-4o)">MODEL ID</label>
              <input value={form.model_id} onChange={e => setForm({ ...form, model_id: e.target.value })} placeholder="openai/gpt-4o" style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ color: '#888', fontSize: 11, display: 'block', marginBottom: 4 }} title="Optional label like 'Sr. Dev' or 'QA' — helps organize models by purpose">ROLE (optional)</label>
              <input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="Sr. Dev" style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ color: '#888', fontSize: 11, display: 'block', marginBottom: 4 }} title="Maximum tokens the model can process. Auto-filled for OpenRouter models.">CONTEXT WINDOW</label>
              <input type="number" value={form.context_window} onChange={e => setForm({ ...form, context_window: e.target.value })} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ color: '#888', fontSize: 11, display: 'block', marginBottom: 4 }}>$/1M INPUT</label>
              <input type="number" step="0.01" value={form.cost_per_1m_in} onChange={e => setForm({ ...form, cost_per_1m_in: e.target.value })} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ color: '#888', fontSize: 11, display: 'block', marginBottom: 4 }}>$/1M OUTPUT</label>
              <input type="number" step="0.01" value={form.cost_per_1m_out} onChange={e => setForm({ ...form, cost_per_1m_out: e.target.value })} style={{ width: '100%' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn-primary" onClick={saveForm}>Save</button>
            <button onClick={() => { setForm(null); setEditingKey(null); setOpenRouterModels([]); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Models Table */}
      {modelEntries.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Provider</th>
              <th>Model ID</th>
              <th>Role</th>
              <th>$/1M In</th>
              <th>$/1M Out</th>
              <th>Speed</th>
              <th>Context</th>
              <th title="Based on avg token counts from Settings. Actual cost depends on model responses.">Est/Prompt</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {modelEntries.map(([key, m]) => {
              const ec = estCost(m);
              const tr = testResult[key];
              return (
                <tr key={key}>
                  <td style={{ color: '#e0e0e0' }}>{m.label || key}</td>
                  <td>{m.provider}</td>
                  <td><code style={{ fontSize: 11 }} title="The model identifier sent to the API (e.g., openai/gpt-4o)">{m.model_id}</code></td>
                  <td style={{ color: '#ffaa00' }} title="Optional label like 'Sr. Dev' or 'QA' — helps organize models by purpose">{m.role || '—'}</td>
                  <td>${(m.cost_per_1m_in || 0).toFixed(2)}</td>
                  <td>${(m.cost_per_1m_out || 0).toFixed(2)}</td>
                  <td style={{ color: '#888' }}>Calculated</td>
                  <td title="Maximum tokens the model can process. Auto-filled for OpenRouter models.">{(m.context_window || 0).toLocaleString()}</td>
                  <td style={{ color: costColor(ec) }} title="Based on avg token counts from Settings. Actual cost depends on model responses.">${ec.toFixed(4)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => openEdit(key, m)} title="Edit"><Pencil size={14} /></button>
                      <button onClick={() => setDeleteConfirm(key)} title="Delete" className="btn-danger"><Trash2 size={14} /></button>
                      <button onClick={() => testModel(key)} title="Test" disabled={testingKey === key}>
                        <Zap size={14} />
                      </button>
                    </div>
                    {tr && (
                      <div style={{ fontSize: 11, marginTop: 4, color: tr.success ? '#00ff88' : '#ff4444' }}>
                        {tr.success ? `✓ ${tr.latency_ms}ms` : `✗ ${tr.error}`}
                      </div>
                    )}
                    {testingKey === key && (
                      <div style={{ fontSize: 11, marginTop: 4, color: '#00ddff' }}>Testing...</div>
                    )}
                    {deleteConfirm === key && (
                      <div style={{ marginTop: 6, fontSize: 12 }}>
                        <span style={{ color: '#ff4444' }}>Delete? </span>
                        <button onClick={() => deleteModel(key)} style={{ color: '#ff4444', fontSize: 12 }}>Yes</button>
                        <button onClick={() => setDeleteConfirm(null)} style={{ fontSize: 12, marginLeft: 4 }}>No</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div style={{ textAlign: 'center', padding: 40, border: '1px dashed #252525', color: '#666' }}>
          No models configured yet. Click "Add Model" to get started.
        </div>
      )}
    </div>
  );
}

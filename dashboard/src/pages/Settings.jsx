import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Zap, Download, Upload, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import * as api from '../lib/api';

const styles = {
  container: {
    padding: '2rem',
    maxWidth: '1400px',
    margin: '0 auto',
    fontFamily: 'monospace',
  },
  title: {
    fontSize: '2rem',
    fontWeight: 'bold',
    color: '#e0e0e0',
    marginBottom: '2rem',
    borderBottom: '2px solid #252525',
    paddingBottom: '1rem',
  },
  section: {
    marginBottom: '3rem',
    padding: '1.5rem',
    backgroundColor: '#141414',
    border: '1px solid #252525',
  },
  sectionTitle: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: '#e0e0e0',
    marginBottom: '1.5rem',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  card: {
    backgroundColor: '#0c0c0c',
    border: '1px solid #252525',
    padding: '1rem',
    color: '#a0a0a0',
  },
  cardTitle: {
    fontSize: '1.1rem',
    fontWeight: 'bold',
    color: '#e0e0e0',
    marginBottom: '0.5rem',
  },
  cardBody: {
    fontSize: '0.9rem',
    marginBottom: '1rem',
    lineHeight: '1.6',
    wordBreak: 'break-all',
    overflow: 'hidden',
  },
  cardBodyLine: {
    marginBottom: '0.5rem',
    wordBreak: 'break-all',
    overflow: 'hidden',
  },
  cardActions: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  button: {
    padding: '0.5rem 1rem',
    backgroundColor: '#252525',
    color: '#e0e0e0',
    border: '1px solid #252525',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontFamily: 'monospace',
    transition: 'all 0.2s',
  },
  buttonSmall: {
    padding: '0.4rem 0.6rem',
    fontSize: '0.8rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.3rem',
  },
  buttonSuccess: {
    backgroundColor: '#00ff88',
    color: '#0c0c0c',
  },
  buttonDanger: {
    backgroundColor: '#ff4444',
    color: '#fff',
  },
  buttonPrimary: {
    backgroundColor: '#00ddff',
    color: '#0c0c0c',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '1rem',
  },
  formCard: {
    backgroundColor: '#0c0c0c',
    border: '1px solid #252525',
    padding: '1.5rem',
    marginBottom: '1.5rem',
  },
  formActions: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  label: {
    color: '#e0e0e0',
    fontWeight: 'bold',
    fontSize: '0.9rem',
  },
  input: {
    padding: '0.75rem',
    backgroundColor: '#0c0c0c',
    border: '1px solid #252525',
    color: '#e0e0e0',
    fontFamily: 'monospace',
    fontSize: '0.9rem',
  },
  textarea: {
    padding: '0.75rem',
    backgroundColor: '#0c0c0c',
    border: '1px solid #252525',
    color: '#e0e0e0',
    fontFamily: 'monospace',
    fontSize: '0.9rem',
    minHeight: '100px',
    resize: 'vertical',
  },
  categoryBlock: {
    marginBottom: '1rem',
    border: '1px solid #252525',
    backgroundColor: '#0c0c0c',
  },
  categoryHeader: {
    padding: '1rem',
    backgroundColor: '#141414',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #252525',
    color: '#e0e0e0',
    transition: 'background-color 0.2s',
  },
  categoryHeaderText: {
    fontSize: '1.1rem',
    fontWeight: 'bold',
  },
  categoryContent: {
    padding: '1rem',
  },
  promptItem: {
    marginBottom: '1rem',
    padding: '0.75rem',
    backgroundColor: '#0c0c0c',
    border: '1px solid #252525',
  },
  promptHeader: {
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.5rem',
    color: '#a0a0a0',
    transition: 'color 0.2s',
  },
  tierBadgeContainer: {
    display: 'flex',
    gap: '0.3rem',
    marginLeft: '0.5rem',
  },
  tierBadge: {
    padding: '0.2rem 0.5rem',
    fontSize: '0.75rem',
    fontWeight: 'bold',
    borderRadius: '0px',
  },
  tierQuick: {
    backgroundColor: '#00ff88',
    color: '#0c0c0c',
  },
  tierStandard: {
    backgroundColor: '#ffaa00',
    color: '#0c0c0c',
  },
  tierDeep: {
    backgroundColor: '#00ddff',
    color: '#0c0c0c',
  },
  promptDetail: {
    marginTop: '1rem',
    padding: '1rem',
    backgroundColor: '#141414',
    borderTop: '1px solid #252525',
  },
  promptText: {
    marginBottom: '1rem',
    fontSize: '0.9rem',
    color: '#a0a0a0',
    lineHeight: '1.6',
  },
  promptMeta: {
    fontSize: '0.9rem',
    marginBottom: '0.5rem',
    color: '#888',
  },
  testResult: {
    marginBottom: '1rem',
    padding: '0.5rem',
    backgroundColor: '#141414',
    border: '1px solid #252525',
    fontSize: '0.85rem',
  },
  statusSuccess: {
    color: '#00ff88',
  },
  statusError: {
    color: '#ff4444',
  },
  messageBox: {
    padding: '1rem',
    marginBottom: '1.5rem',
    backgroundColor: '#141414',
    border: '1px solid #252525',
    fontSize: '0.9rem',
  },
  messageSuccess: {
    borderColor: '#00ff88',
    color: '#00ff88',
  },
  messageError: {
    borderColor: '#ff4444',
    color: '#ff4444',
  },
  keyCard: {
    backgroundColor: '#0c0c0c',
    border: '1px solid #252525',
    padding: '1rem',
    marginBottom: '1rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '1rem',
  },
  keyInfo: {
    flex: 1,
  },
  keyLabel: {
    fontSize: '0.9rem',
    color: '#a0a0a0',
    marginBottom: '0.25rem',
  },
  keyValue: {
    fontSize: '0.85rem',
    color: '#00ff88',
    fontFamily: 'monospace',
    wordBreak: 'break-all',
  },
  modelBrowserTable: {
    width: '100%',
    borderCollapse: 'collapse',
    marginBottom: '1.5rem',
  },
  modelBrowserTableHeader: {
    backgroundColor: '#141414',
    borderBottom: '2px solid #252525',
    color: '#e0e0e0',
    fontSize: '0.9rem',
    fontWeight: 'bold',
  },
  modelBrowserTableCell: {
    padding: '0.75rem',
    borderBottom: '1px solid #252525',
    fontSize: '0.85rem',
    color: '#a0a0a0',
  },
  modelBrowserTableRow: {
    backgroundColor: '#0c0c0c',
  },
  modelBrowserTableRowHover: {
    backgroundColor: '#141414',
  },
  searchInput: {
    padding: '0.75rem',
    backgroundColor: '#0c0c0c',
    border: '1px solid #252525',
    color: '#e0e0e0',
    fontFamily: 'monospace',
    fontSize: '0.9rem',
    marginBottom: '1rem',
    width: '100%',
    maxWidth: '400px',
  },
  maskedValue: {
    fontFamily: 'monospace',
    color: '#00ff88',
  },
};

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [publicMode, setPublicMode] = useState(false);

  // API Keys state
  const [apiKeys, setApiKeys] = useState({});
  const [editingKeyName, setEditingKeyName] = useState(null);
  const [keyFormName, setKeyFormName] = useState('');
  const [keyFormValue, setKeyFormValue] = useState('');
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState({});

  // Providers state
  const [providers, setProviders] = useState({});
  const [models, setModels] = useState([]);
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [editingProviderKey, setEditingProviderKey] = useState(null);
  const [providerFormKey, setProviderFormKey] = useState('');
  const [providerForm, setProviderForm] = useState({ name: '', base_url: '', api_key_env: '', headers: {} });
  const [providerHeadersJson, setProviderHeadersJson] = useState('{}');
  const [testingProviderId, setTestingProviderId] = useState(null);
  const [testResults, setTestResults] = useState({});

  // OpenRouter Model Browser state
  const [openRouterModels, setOpenRouterModels] = useState([]);
  const [showModelBrowser, setShowModelBrowser] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);

  // Battery state
  const [battery, setBattery] = useState({});

  // General settings state
  const [settings, setSettings] = useState({ avg_input_tokens: 0, avg_output_tokens: 0 });

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetText, setResetText] = useState('');

  useEffect(() => {
    fetch('/api/config/mode')
      .then(r => r.json())
      .then(d => setPublicMode(d.publicMode))
      .catch(err => console.error('Failed to fetch mode:', err));
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [keysData, providersData, modelsData, batteryData, settingsData] = await Promise.all([
        api.getKeys(),
        api.getProviders(),
        api.getModels(),
        api.getBattery(),
        api.getSettings(),
      ]);
      setApiKeys(keysData || {});
      setProviders(providersData || {});
      setModels(modelsData || []);
      setBattery(batteryData || {});
      setSettings(settingsData || {});
    } catch (err) {
      showMessage(err.message || 'Failed to load data', true);
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (message, isError = false) => {
    if (isError) {
      setError(message);
      setSuccess('');
    } else {
      setSuccess(message);
      setError('');
    }
    setTimeout(() => {
      setError('');
      setSuccess('');
    }, 4000);
  };

  // API Keys handlers
  const handleAddApiKey = () => {
    setShowKeyForm(true);
    setEditingKeyName(null);
    setKeyFormName('');
    setKeyFormValue('');
  };

  const handleEditApiKey = (keyName) => {
    setEditingKeyName(keyName);
    setKeyFormName(keyName);
    setKeyFormValue(apiKeys[keyName] || '');
    setShowKeyForm(true);
  };

  const handleSaveApiKey = async () => {
    if (!keyFormName.trim()) {
      showMessage('Key name is required', true);
      return;
    }
    if (!keyFormValue.trim()) {
      showMessage('Key value is required', true);
      return;
    }

    try {
      const updated = { ...apiKeys };
      if (editingKeyName && editingKeyName !== keyFormName) {
        delete updated[editingKeyName];
      }
      updated[keyFormName] = keyFormValue;
      await api.saveKeys(updated);
      setApiKeys(updated);
      setShowKeyForm(false);
      showMessage('API key saved successfully');
    } catch (err) {
      showMessage(err.message || 'Failed to save API key', true);
    }
  };

  const handleDeleteApiKey = async (keyName) => {
    if (!window.confirm(`Delete API key "${keyName}"?`)) return;
    try {
      const updated = { ...apiKeys };
      delete updated[keyName];
      await api.saveKeys(updated);
      setApiKeys(updated);
      showMessage('API key deleted successfully');
    } catch (err) {
      showMessage(err.message || 'Failed to delete API key', true);
    }
  };

  const maskValue = (value) => {
    if (!value || value.length < 4) return '****';
    return '*'.repeat(value.length - 4) + value.slice(-4);
  };

  const toggleKeyVisibility = (keyName) => {
    setVisibleKeys((prev) => ({
      ...prev,
      [keyName]: !prev[keyName],
    }));
  };

  // Provider handlers
  const handleAddProvider = () => {
    setEditingProviderKey(null);
    setProviderFormKey('');
    setProviderForm({ name: '', base_url: '', api_key_env: '', headers: {} });
    setProviderHeadersJson('{}');
    setShowProviderForm(true);
  };

  const handleEditProvider = (key, provider) => {
    setEditingProviderKey(key);
    setProviderFormKey(key);
    setProviderForm(provider);
    setProviderHeadersJson(JSON.stringify(provider.headers || {}, null, 2));
    setShowProviderForm(true);
  };

  const handleSaveProvider = async () => {
    if (!providerFormKey.trim() || !providerForm.name.trim() || !providerForm.base_url.trim()) {
      showMessage('Key, Name, and Base URL are required', true);
      return;
    }

    try {
      let headers = {};
      if (providerHeadersJson.trim()) {
        headers = JSON.parse(providerHeadersJson);
      }
      const updated = { ...providers };
      if (editingProviderKey && editingProviderKey !== providerFormKey) {
        delete updated[editingProviderKey];
      }
      updated[providerFormKey] = { ...providerForm, headers };
      await api.saveProviders(updated);
      setProviders(updated);
      setShowProviderForm(false);
      showMessage('Provider saved successfully');
    } catch (err) {
      showMessage(err.message || 'Failed to save provider', true);
    }
  };

  const handleDeleteProvider = async (key) => {
    if (!window.confirm(`Delete provider "${providers[key].name}"?`)) return;
    try {
      const updated = { ...providers };
      delete updated[key];
      await api.saveProviders(updated);
      setProviders(updated);
      showMessage('Provider deleted successfully');
    } catch (err) {
      showMessage(err.message || 'Failed to delete provider', true);
    }
  };

  const handleTestProvider = async (key, provider) => {
    setTestingProviderId(key);
    try {
      const result = await api.testProvider(key, provider);
      setTestResults((prev) => ({ ...prev, [key]: result }));
      if (result.success) {
        showMessage(`Provider test passed (${result.latency_ms}ms)`);
      } else {
        showMessage(`Provider test failed: ${result.error}`, true);
      }
    } catch (err) {
      showMessage(err.message || 'Test failed', true);
    } finally {
      setTestingProviderId(null);
    }
  };

  // OpenRouter Model Browser handlers
  const handleBrowseOpenRouter = async () => {
    setShowModelBrowser(true);
    setLoadingModels(true);
    try {
      const models = await api.getOpenRouterModels();
      setOpenRouterModels(models || []);
    } catch (err) {
      showMessage(err.message || 'Failed to fetch OpenRouter models', true);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleAddOpenRouterModel = async (model) => {
    try {
      // models could be {models: {...}} or just {...}
      const currentModels = models?.models || models || {};
      const key = (model.name || model.id).toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
      const updated = { ...currentModels, [key]: {
        label: model.name || model.id,
        provider: 'openrouter',
        model_id: model.id,
        role: '',
        cost_per_1m_in: model.pricing?.prompt ? model.pricing.prompt * 1e6 : 0,
        cost_per_1m_out: model.pricing?.completion ? model.pricing.completion * 1e6 : 0,
        context_window: model.context_length || 0,
      }};
      await api.saveModels({ models: updated });
      setModels(updated);
      showMessage(`Model "${model.name || model.id}" added successfully`);
    } catch (err) {
      showMessage(err.message || 'Failed to add model', true);
    }
  };

  const filteredOpenRouterModels = openRouterModels.filter((model) =>
    model.id.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
    (model.name && model.name.toLowerCase().includes(modelSearchQuery.toLowerCase()))
  );

  // General settings handler
  const handleSaveGeneralSettings = async () => {
    try {
      await api.saveSettings(settings);
      showMessage('Settings saved successfully');
    } catch (err) {
      showMessage(err.message || 'Failed to save settings', true);
    }
  };

  // Export/Import handlers
  const handleExportConfig = async () => {
    try {
      const config = await api.exportConfig();
      const dataStr = JSON.stringify(config, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `eval-config-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showMessage('Configuration exported');
    } catch (err) {
      showMessage(err.message || 'Failed to export', true);
    }
  };

  const handleImportConfig = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      try {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        const config = JSON.parse(text);
        await api.importConfig(config);
        await fetchData();
        showMessage('Configuration imported successfully');
      } catch (err) {
        showMessage(err.message || 'Failed to import', true);
      }
    };
    input.click();
  };

  const handleResetAll = async () => {
    if (resetText !== 'DELETE ALL DATA') {
      showMessage('Type "DELETE ALL DATA" to confirm', true);
      return;
    }

    try {
      const emptyConfig = {
        providers: {},
        models: [],
        battery: {},
        settings: { avg_input_tokens: 0, avg_output_tokens: 0 },
      };
      await api.importConfig(emptyConfig);
      await fetchData();
      setResetConfirm(false);
      setResetText('');
      showMessage('All data reset successfully');
    } catch (err) {
      showMessage(err.message || 'Failed to reset data', true);
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>SETTINGS</h1>
        <p style={{ color: '#a0a0a0' }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ ...styles.container, backgroundColor: '#0c0c0c', color: '#a0a0a0' }}>
      <h1 style={styles.title}>SETTINGS</h1>

      {publicMode && (
        <div style={{
          padding: '12px',
          backgroundColor: 'rgba(0, 221, 255, 0.1)',
          border: '1px solid #00ddff',
          color: '#00ddff',
          fontSize: '0.85rem',
          marginBottom: '1.5rem',
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
        }}>
          Public mode — API key stored in your browser. Only OpenRouter is available. Self-host for full access.
        </div>
      )}

      {error && (
        <div style={{ ...styles.messageBox, ...styles.messageError }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ ...styles.messageBox, ...styles.messageSuccess }}>
          {success}
        </div>
      )}

      {/* SECTION 1: API KEYS */}
      {!publicMode && <section style={styles.section}>
        <h2 style={styles.sectionTitle}>API KEYS</h2>
        <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '1rem' }}>
          API keys are stored in keys.json and loaded into environment variables on server startup. Changes take effect on next eval run.
        </p>

        <div style={{ marginBottom: '1.5rem' }}>
          {Object.entries(apiKeys).map(([keyName, keyValue]) => (
            <div key={keyName} style={styles.keyCard}>
              <div style={styles.keyInfo}>
                <div style={styles.keyLabel}>
                  <strong>Environment Variable:</strong> {keyName}
                </div>
                <div style={styles.keyValue}>
                  {visibleKeys[keyName] ? keyValue : maskValue(keyValue)}
                </div>
              </div>
              <div style={styles.cardActions}>
                <button
                  style={{ ...styles.button, ...styles.buttonSmall }}
                  onClick={() => toggleKeyVisibility(keyName)}
                  title="Toggle visibility"
                >
                  {visibleKeys[keyName] ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  style={{ ...styles.button, ...styles.buttonSmall }}
                  onClick={() => handleEditApiKey(keyName)}
                  title="Edit"
                >
                  <Pencil size={14} /> Edit
                </button>
                <button
                  style={{ ...styles.button, ...styles.buttonSmall, ...styles.buttonDanger }}
                  onClick={() => handleDeleteApiKey(keyName)}
                  title="Delete"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        {showKeyForm && (
          <div style={styles.formCard}>
            <h3 style={{ color: '#e0e0e0', marginBottom: '1rem' }}>
              {editingKeyName ? 'Edit API Key' : 'Add API Key'}
            </h3>
            <form style={styles.form} onSubmit={(e) => { e.preventDefault(); handleSaveApiKey(); }}>
              <div style={styles.formGrid}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Key Name (env var)</label>
                  <input
                    style={styles.input}
                    type="text"
                    value={keyFormName}
                    onChange={(e) => setKeyFormName(e.target.value)}
                    placeholder="e.g., OPENROUTER_API_KEY"
                    disabled={!!editingKeyName}
                  />
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Key Value</label>
                <input
                  style={styles.input}
                  type="password"
                  value={keyFormValue}
                  onChange={(e) => setKeyFormValue(e.target.value)}
                  placeholder="Paste your API key"
                />
              </div>

              <div style={styles.formActions}>
                <button
                  style={{ ...styles.button, ...styles.buttonSuccess }}
                  type="submit"
                >
                  Save Key
                </button>
                <button
                  style={styles.button}
                  type="button"
                  onClick={() => setShowKeyForm(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {!showKeyForm && (
          <button
            style={{ ...styles.button, ...styles.buttonPrimary }}
            onClick={handleAddApiKey}
          >
            <Plus size={18} style={{ marginRight: '0.5rem' }} /> Add API Key
          </button>
        )}
      </section>}

      {/* SECTION 2: API PROVIDERS */}
      {!publicMode && <section style={styles.section}>
        <h2 style={styles.sectionTitle}>API PROVIDERS</h2>

        {/* Quick Add Presets */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {[
              { key: 'openrouter', name: 'OpenRouter', base_url: 'https://openrouter.ai/api/v1', api_key_env: 'OPENROUTER_API_KEY' },
              { key: 'llamacpp', name: 'llama.cpp', base_url: 'http://host.docker.internal:8080/v1', api_key_env: '' },
              { key: 'ollama', name: 'Ollama', base_url: 'http://host.docker.internal:11434/v1', api_key_env: '' },
              { key: 'openai', name: 'OpenAI', base_url: 'https://api.openai.com/v1', api_key_env: 'OPENAI_API_KEY' },
              { key: 'anthropic', name: 'Anthropic', base_url: 'https://api.anthropic.com/v1', api_key_env: 'ANTHROPIC_API_KEY' },
            ].filter(p => !providers[p.key]).map(preset => (
              <button
                key={preset.key}
                style={{ ...styles.button, ...styles.buttonSuccess, ...styles.buttonSmall }}
                onClick={async () => {
                  const updated = { ...providers, [preset.key]: { name: preset.name, base_url: preset.base_url, api_key_env: preset.api_key_env, headers: {} } };
                  try {
                    await api.saveProviders(updated);
                    setProviders(updated);
                    showMessage(`${preset.name} provider added`);
                  } catch (err) { showMessage(err.message, true); }
                }}
              >
                <Plus size={14} /> {preset.name}
              </button>
            ))}
          </div>
        </div>

        <div style={styles.grid}>
          {Object.entries(providers).map(([key, provider]) => (
            <div key={key} style={styles.card}>
              <div style={styles.cardTitle}>{provider.name}</div>
              <div style={styles.cardBody}>
                <div style={styles.cardBodyLine}>
                  <strong>Key:</strong> {key}
                </div>
                <div style={styles.cardBodyLine}>
                  <strong>Base URL:</strong> {provider.base_url}
                </div>
                <div style={styles.cardBodyLine} title="Environment variable name that holds the API key (e.g., OPENROUTER_API_KEY)">
                  <strong>API Key Env:</strong> {provider.api_key_env}
                </div>
                {Object.keys(provider.headers || {}).length > 0 && (
                  <div style={styles.cardBodyLine}>
                    <strong>Headers:</strong> {Object.keys(provider.headers).length} custom
                  </div>
                )}
              </div>

              {testResults[key] && (
                <div style={styles.testResult}>
                  {testResults[key].success ? (
                    <span style={styles.statusSuccess}>
                      ✓ OK ({testResults[key].latency_ms}ms)
                    </span>
                  ) : (
                    <span style={styles.statusError}>✗ Failed: {testResults[key].error}</span>
                  )}
                </div>
              )}

              <div style={styles.cardActions}>
                <button
                  style={{ ...styles.button, ...styles.buttonSmall }}
                  onClick={() => handleEditProvider(key, provider)}
                  title="Edit"
                >
                  <Pencil size={14} /> Edit
                </button>
                <button
                  style={{ ...styles.button, ...styles.buttonSmall, ...styles.buttonPrimary }}
                  onClick={() => handleTestProvider(key, provider)}
                  disabled={testingProviderId === key}
                  title="Test Connection"
                >
                  <Zap size={14} /> {testingProviderId === key ? 'Testing...' : 'Test'}
                </button>
                <button
                  style={{ ...styles.button, ...styles.buttonSmall, ...styles.buttonDanger }}
                  onClick={() => setDeleteConfirm({ type: 'provider', key })}
                  title="Delete"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        {Object.keys(providers).length === 0 && !showProviderForm && (
          <p style={{ color: '#666', fontStyle: 'italic' }}>No providers configured yet</p>
        )}

        {showProviderForm && (
          <div style={styles.formCard}>
            <h3 style={{ color: '#e0e0e0', marginBottom: '1rem' }}>
              {editingProviderKey ? 'Edit Provider' : 'Add Provider'}
            </h3>
            <form style={styles.form} onSubmit={(e) => { e.preventDefault(); handleSaveProvider(); }}>
              <div style={styles.formGrid}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Key (slug)</label>
                  <input
                    style={styles.input}
                    type="text"
                    value={providerFormKey}
                    onChange={(e) => setProviderFormKey(e.target.value)}
                    placeholder="e.g., openai, anthropic"
                    disabled={!!editingProviderKey}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Name</label>
                  <input
                    style={styles.input}
                    type="text"
                    value={providerForm.name}
                    onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })}
                    placeholder="e.g., OpenAI"
                  />
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label} title="Provider's OpenAI-compatible API endpoint URL">Base URL</label>
                <input
                  style={styles.input}
                  type="text"
                  value={providerForm.base_url}
                  onChange={(e) => setProviderForm({ ...providerForm, base_url: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label} title="Environment variable name that holds the API key (e.g., OPENROUTER_API_KEY)">API Key Environment Variable</label>
                <input
                  style={styles.input}
                  type="text"
                  value={providerForm.api_key_env}
                  onChange={(e) => setProviderForm({ ...providerForm, api_key_env: e.target.value })}
                  placeholder="OPENAI_API_KEY"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label} title="Additional HTTP headers sent with every request (JSON format)">Custom Headers (JSON)</label>
                <textarea
                  style={styles.textarea}
                  value={providerHeadersJson}
                  onChange={(e) => setProviderHeadersJson(e.target.value)}
                  placeholder="{}"
                  rows={4}
                />
              </div>

              <div style={styles.formActions}>
                <button
                  style={{ ...styles.button, ...styles.buttonSuccess }}
                  type="submit"
                >
                  Save Provider
                </button>
                <button
                  style={styles.button}
                  type="button"
                  onClick={() => setShowProviderForm(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {!showProviderForm && (
          <button
            style={{ ...styles.button, ...styles.buttonPrimary }}
            onClick={handleAddProvider}
          >
            <Plus size={18} style={{ marginRight: '0.5rem' }} /> Add Provider
          </button>
        )}
      </section>}

      {/* SECTION 3: OPENROUTER MODEL BROWSER */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>OPENROUTER MODEL BROWSER</h2>
        <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Browse and add models from OpenRouter's catalog. Pricing and context window are auto-populated.
        </p>

        {!showModelBrowser && (
          <button
            style={{ ...styles.button, ...styles.buttonPrimary }}
            onClick={handleBrowseOpenRouter}
          >
            <Plus size={18} style={{ marginRight: '0.5rem' }} /> Browse OpenRouter Models
          </button>
        )}

        {showModelBrowser && (
          <div>
            <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
              <input
                style={styles.searchInput}
                type="text"
                placeholder="Search models..."
                value={modelSearchQuery}
                onChange={(e) => setModelSearchQuery(e.target.value)}
              />
              <button
                style={{ ...styles.button }}
                onClick={() => setShowModelBrowser(false)}
              >
                Close
              </button>
            </div>

            {loadingModels ? (
              <p style={{ color: '#a0a0a0' }}>Loading models...</p>
            ) : filteredOpenRouterModels.length > 0 ? (
              <table style={styles.modelBrowserTable}>
                <thead>
                  <tr style={styles.modelBrowserTableHeader}>
                    <th style={styles.modelBrowserTableCell}>Model ID</th>
                    <th style={styles.modelBrowserTableCell}>Name</th>
                    <th style={styles.modelBrowserTableCell}>Pricing (per 1M)</th>
                    <th style={styles.modelBrowserTableCell}>Context</th>
                    <th style={styles.modelBrowserTableCell}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOpenRouterModels.map((model) => (
                    <tr key={model.id} style={styles.modelBrowserTableRow}>
                      <td style={styles.modelBrowserTableCell}>
                        <code>{model.id}</code>
                      </td>
                      <td style={styles.modelBrowserTableCell}>{model.name || '-'}</td>
                      <td style={styles.modelBrowserTableCell}>
                        {model.pricing ? (
                          <span>${(model.pricing.prompt * 1e6).toFixed(2)} / ${(model.pricing.completion * 1e6).toFixed(2)}</span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td style={styles.modelBrowserTableCell}>
                        {model.context_length ? `${(model.context_length / 1000).toFixed(0)}K` : '-'}
                      </td>
                      <td style={styles.modelBrowserTableCell}>
                        <button
                          style={{ ...styles.button, ...styles.buttonSmall, ...styles.buttonSuccess }}
                          onClick={() => handleAddOpenRouterModel(model)}
                          title="Add this model"
                        >
                          <Plus size={14} /> Add
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ color: '#888' }}>No models found matching "{modelSearchQuery}"</p>
            )}
          </div>
        )}
      </section>

      {/* SECTION 6: GENERAL SETTINGS */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>GENERAL SETTINGS</h2>

        <div style={styles.formCard}>
          <form style={styles.form} onSubmit={(e) => { e.preventDefault(); handleSaveGeneralSettings(); }}>
            <div style={styles.formGrid}>
              <div style={styles.formGroup}>
                <label style={styles.label} title="Average input tokens per prompt. Used to estimate evaluation costs on the New Run page. Auto-calculated from your battery prompts if available.">Avg Input Tokens</label>
                <input
                  style={styles.input}
                  type="number"
                  value={settings.avg_input_tokens || 0}
                  onChange={(e) => setSettings({ ...settings, avg_input_tokens: parseFloat(e.target.value) || 0 })}
                />
                {settings.calculated_avg_input_tokens && (
                  <div style={{ fontSize: '0.85rem', color: '#00ddff', marginTop: '0.5rem' }}>
                    Calculated from battery: ~{settings.calculated_avg_input_tokens} tokens
                  </div>
                )}
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label} title="Average output tokens per model response. Used to estimate evaluation costs. Typical values: 500-2000 for short responses, 2000-4000 for detailed responses.">Avg Output Tokens</label>
                <input
                  style={styles.input}
                  type="number"
                  value={settings.avg_output_tokens || 0}
                  onChange={(e) => setSettings({ ...settings, avg_output_tokens: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div style={styles.formActions}>
              <button
                style={{ ...styles.button, ...styles.buttonSuccess }}
                type="submit"
              >
                Save Settings
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* SECTION 7: EXPORT/IMPORT */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>EXPORT / IMPORT</h2>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button
            style={{ ...styles.button, ...styles.buttonPrimary }}
            onClick={handleExportConfig}
            title="Download all configuration (providers, models, battery, settings) as a single JSON file for backup or sharing"
          >
            <Download size={18} style={{ marginRight: '0.5rem' }} /> Export Configuration
          </button>
          <button
            style={{ ...styles.button, ...styles.buttonPrimary }}
            onClick={handleImportConfig}
            title="Upload a previously exported configuration JSON file to restore settings"
          >
            <Upload size={18} style={{ marginRight: '0.5rem' }} /> Import Configuration
          </button>
        </div>
      </section>

      {/* SECTION 8: DANGER ZONE */}
      <section style={{ ...styles.section, borderColor: '#ff4444', backgroundColor: 'rgba(255, 68, 68, 0.05)' }}>
        <h2 style={{ ...styles.sectionTitle, color: '#ff4444' }}>DANGER ZONE</h2>

        {!resetConfirm ? (
          <button
            style={{ ...styles.button, ...styles.buttonDanger }}
            onClick={() => setResetConfirm(true)}
          >
            <AlertTriangle size={18} style={{ marginRight: '0.5rem' }} /> Reset All Data
          </button>
        ) : (
          <div style={styles.formCard}>
            <p style={{ color: '#ff4444', marginBottom: '1rem', fontWeight: 'bold' }}>
              Are you sure? This will delete all providers, models, battery, and settings. This action cannot be undone.
            </p>
            <input
              style={styles.input}
              type="text"
              value={resetText}
              onChange={(e) => setResetText(e.target.value)}
              placeholder='Type "DELETE ALL DATA" to confirm'
            />
            <div style={{ ...styles.formActions, marginTop: '1rem' }}>
              <button
                style={{ ...styles.button, ...styles.buttonDanger }}
                onClick={handleResetAll}
              >
                CONFIRM RESET
              </button>
              <button
                style={styles.button}
                onClick={() => {
                  setResetConfirm(false);
                  setResetText('');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: '#141414',
            border: '2px solid #ff4444',
            padding: '2rem',
            borderRadius: '4px',
            maxWidth: '400px',
          }}>
            <h3 style={{ color: '#ff4444', marginBottom: '1rem' }}>Confirm Deletion</h3>
            <p style={{ color: '#a0a0a0', marginBottom: '1.5rem' }}>
              {deleteConfirm.type === 'provider' ? `Delete provider "${providers[deleteConfirm.key]?.name}"?` : 'Are you sure?'}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                style={{ ...styles.button, ...styles.buttonDanger, flex: 1 }}
                onClick={async () => {
                  await handleDeleteProvider(deleteConfirm.key);
                  setDeleteConfirm(null);
                }}
              >
                Delete
              </button>
              <button
                style={{ ...styles.button, flex: 1 }}
                onClick={() => setDeleteConfirm(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

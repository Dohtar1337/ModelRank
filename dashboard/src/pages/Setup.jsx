import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Zap, Check, X, ChevronRight, Settings } from 'lucide-react';
import * as api from '../lib/api';

const PROVIDERS = [
  {
    key: 'openrouter',
    name: 'OpenRouter',
    description: 'Access 200+ models through a single API. Free tier available.',
    color: '#00ff88',
    base_url: 'https://openrouter.ai/api/v1',
    api_key_env: 'OPENROUTER_API_KEY',
    api_key_placeholder: 'sk-or-...',
    api_key_link: 'https://openrouter.ai/keys',
    api_key_link_label: 'openrouter.ai/keys',
    headers: { 'HTTP-Referer': 'http://localhost:3008', 'X-Title': 'ModelRank by Dohtar' },
    needsApiKey: true,
    canBrowseModels: true,
  },
  {
    key: 'ollama',
    name: 'Ollama',
    description: 'Run open-source models locally. No API key needed.',
    color: '#00ddff',
    base_url: 'http://localhost:11434/v1',
    api_key_env: '',
    api_key_placeholder: '',
    headers: {},
    needsApiKey: false,
    canBrowseModels: false,
    showBaseUrl: true,
  },
  {
    key: 'lmstudio',
    name: 'LM Studio',
    description: 'Local model server with OpenAI-compatible API.',
    color: '#ffaa00',
    base_url: 'http://localhost:1234/v1',
    api_key_env: '',
    api_key_placeholder: '',
    headers: {},
    needsApiKey: false,
    canBrowseModels: false,
    showBaseUrl: true,
  },
  {
    key: 'llamacpp',
    name: 'llama.cpp',
    description: 'Run GGUF models locally with llama.cpp server.',
    color: '#ff6b6b',
    base_url: 'http://localhost:8080/v1',
    api_key_env: '',
    api_key_placeholder: '',
    headers: {},
    needsApiKey: false,
    canBrowseModels: false,
    showBaseUrl: true,
  },
  {
    key: 'custom',
    name: 'Custom',
    description: 'Any OpenAI-compatible API endpoint.',
    color: '#a0a0a0',
    base_url: '',
    api_key_env: 'CUSTOM_API_KEY',
    api_key_placeholder: 'sk-...',
    headers: {},
    needsApiKey: true,
    canBrowseModels: false,
    showBaseUrl: true,
  },
];

const TOTAL_STEPS = 5;

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0c0c0c',
    padding: '2rem',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
  },
  card: {
    width: '100%',
    maxWidth: '640px',
    maxHeight: '90vh',
    backgroundColor: '#141414',
    border: '1px solid #252525',
    borderRadius: '0px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: '2rem',
    borderBottom: '1px solid #252525',
    textAlign: 'center',
    flexShrink: 0,
  },
  logo: {
    marginBottom: '1rem',
  },
  modelText: {
    color: '#00ff88',
    fontSize: '1.8rem',
    fontWeight: 'bold',
    display: 'inline',
  },
  rankText: {
    color: '#ffaa00',
    fontSize: '1.8rem',
    fontWeight: 'bold',
    display: 'inline',
    marginLeft: '0.25rem',
  },
  stepIndicator: {
    marginTop: '1rem',
    fontSize: '0.9rem',
    color: '#888',
  },
  body: {
    padding: '2rem',
    flex: 1,
    overflowY: 'auto',
  },
  stepTitle: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: '#e0e0e0',
    marginBottom: '1rem',
  },
  stepDescription: {
    fontSize: '0.95rem',
    color: '#a0a0a0',
    marginBottom: '1.5rem',
    lineHeight: '1.6',
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
  label: {
    fontSize: '0.9rem',
    fontWeight: 'bold',
    color: '#e0e0e0',
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    paddingRight: '2.5rem',
    backgroundColor: '#0c0c0c',
    border: '1px solid #252525',
    color: '#e0e0e0',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
    fontSize: '0.9rem',
    boxSizing: 'border-box',
  },
  inputIcon: {
    position: 'absolute',
    right: '0.75rem',
    cursor: 'pointer',
    color: '#00ff88',
  },
  button: {
    padding: '0.75rem 1.5rem',
    backgroundColor: '#00ff88',
    color: '#0c0c0c',
    border: 'none',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
    fontSize: '0.95rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    justifyContent: 'center',
  },
  buttonSecondary: {
    backgroundColor: '#252525',
    color: '#e0e0e0',
  },
  buttonLoading: {
    opacity: 0.7,
    cursor: 'not-allowed',
  },
  message: {
    padding: '0.75rem 1rem',
    borderRadius: '0px',
    fontSize: '0.9rem',
    marginBottom: '1rem',
  },
  messageSuccess: {
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
    border: '1px solid #00ff88',
    color: '#00ff88',
  },
  messageError: {
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    border: '1px solid #ff4444',
    color: '#ff4444',
  },
  spinner: {
    display: 'inline-block',
    width: '1rem',
    height: '1rem',
    border: '2px solid #00ff8844',
    borderTop: '2px solid #00ff88',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  modelGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  modelCard: {
    padding: '1rem',
    backgroundColor: '#0c0c0c',
    border: '1px solid #252525',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  modelCardSelected: {
    borderColor: '#00ff88',
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
  },
  modelName: {
    fontSize: '0.9rem',
    fontWeight: 'bold',
    color: '#e0e0e0',
    wordBreak: 'break-word',
  },
  modelMeta: {
    fontSize: '0.75rem',
    color: '#888',
  },
  checkbox: {
    width: '1rem',
    height: '1rem',
    cursor: 'pointer',
    accentColor: '#00ff88',
  },
  successScreen: {
    textAlign: 'center',
  },
  successIcon: {
    fontSize: '3rem',
    color: '#00ff88',
    marginBottom: '1rem',
  },
  footer: {
    padding: '1.5rem',
    borderTop: '1px solid #252525',
    display: 'flex',
    gap: '1rem',
    flexShrink: 0,
  },
  providerCard: {
    padding: '1.25rem',
    backgroundColor: '#0c0c0c',
    border: '2px solid #252525',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginBottom: '0.75rem',
  },
  providerCardSelected: {
    backgroundColor: 'rgba(0, 255, 136, 0.05)',
  },
  providerName: {
    fontSize: '1.1rem',
    fontWeight: 'bold',
    marginBottom: '0.25rem',
  },
  providerDescription: {
    fontSize: '0.85rem',
    color: '#888',
  },
  hint: {
    fontSize: '0.8rem',
    color: '#666',
    marginTop: '1rem',
    padding: '0.75rem',
    border: '1px solid #252525',
    backgroundColor: '#0c0c0c',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
};

export default function Setup() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [publicMode, setPublicMode] = useState(false);

  // Step 2: Provider
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [customBaseUrl, setCustomBaseUrl] = useState('');

  // Step 3: API Key / Connection
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [keyTestResult, setKeyTestResult] = useState(null);

  // Step 4: Models
  const [models, setModels] = useState([]);
  const [selectedModels, setSelectedModels] = useState(new Set());
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelNameInput, setModelNameInput] = useState('');
  const [manualModels, setManualModels] = useState([]);

  const provider = PROVIDERS.find(p => p.key === selectedProvider);

  useEffect(() => {
    fetch('/api/config/mode')
      .then(r => r.json())
      .then(d => setPublicMode(d.publicMode))
      .catch(err => console.error('Failed to fetch mode:', err));
  }, []);

  const showMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 4000);
  };

  const getProviderBaseUrl = () => {
    if (!provider) return '';
    if (provider.key === 'custom') return customBaseUrl;
    if (provider.showBaseUrl) return customBaseUrl || provider.base_url;
    return provider.base_url;
  };

  const handleSelectProvider = (key) => {
    setSelectedProvider(key);
    const p = PROVIDERS.find(pr => pr.key === key);
    if (p) {
      setCustomBaseUrl(p.base_url);
    }
    // Reset downstream state
    setApiKey('');
    setKeyTestResult(null);
    setModels([]);
    setSelectedModels(new Set());
    setManualModels([]);
  };

  const handleTestApiKey = async () => {
    if (provider?.needsApiKey && !apiKey.trim()) {
      showMessage('Please enter an API key', 'error');
      return;
    }

    setTestingKey(true);
    setKeyTestResult(null);

    try {
      if (provider?.key === 'openrouter') {
        const result = await api.testApiKey(apiKey);
        if (result.valid) {
          setKeyTestResult({ valid: true });
          showMessage('API key is valid!', 'success');
        } else {
          setKeyTestResult({ valid: false, error: result.error || 'Invalid key' });
          showMessage(result.error || 'API key test failed', 'error');
        }
      } else {
        // For local providers, test the base URL connectivity
        const baseUrl = getProviderBaseUrl();
        if (!baseUrl.trim()) {
          showMessage('Please enter a base URL', 'error');
          setTestingKey(false);
          return;
        }
        const result = await api.testProvider({
          base_url: baseUrl,
          api_key_env: '',
          headers: provider.headers || {},
        });
        if (result.success) {
          setKeyTestResult({ valid: true });
          showMessage(`Connected to ${provider.name}!`, 'success');
        } else {
          setKeyTestResult({ valid: false, error: result.error || 'Connection failed' });
          showMessage(result.error || 'Connection failed', 'error');
        }
      }
    } catch (err) {
      setKeyTestResult({ valid: false, error: err.message });
      showMessage(err.message || 'Test failed', 'error');
    } finally {
      setTestingKey(false);
    }
  };

  const handleFetchModels = async () => {
    setLoadingModels(true);
    try {
      if (provider?.canBrowseModels) {
        const modelsList = await api.getOpenRouterModels();
        const popularModels = new Set();
        const freeModels = modelsList.filter(m => {
          const prompt = m.pricing?.prompt || 0;
          const completion = m.pricing?.completion || 0;
          return prompt === 0 && completion === 0;
        }).slice(0, 5);
        freeModels.forEach(m => popularModels.add(m.id));
        setModels(modelsList);
        setSelectedModels(popularModels);
      }
    } catch (err) {
      showMessage(err.message || 'Failed to fetch models', 'error');
    } finally {
      setLoadingModels(false);
    }
  };

  const handleToggleModel = (modelId) => {
    const updated = new Set(selectedModels);
    if (updated.has(modelId)) {
      updated.delete(modelId);
    } else {
      updated.add(modelId);
    }
    setSelectedModels(updated);
  };

  const handleAddManualModel = () => {
    const name = modelNameInput.trim();
    if (!name) return;
    if (manualModels.includes(name)) {
      showMessage('Model already added', 'error');
      return;
    }
    setManualModels([...manualModels, name]);
    setModelNameInput('');
  };

  const handleRemoveManualModel = (name) => {
    setManualModels(manualModels.filter(m => m !== name));
  };

  const handleNextStep = () => {
    if (currentStep === 2) {
      if (!selectedProvider) {
        showMessage('Please select a provider', 'error');
        return;
      }
    }
    if (currentStep === 3) {
      if (provider?.needsApiKey && !keyTestResult?.valid) {
        showMessage('Please test your connection first', 'error');
        return;
      }
      if (!provider?.needsApiKey && !keyTestResult?.valid) {
        showMessage('Please test your connection first', 'error');
        return;
      }
    }
    if (currentStep === 4) {
      const totalModels = selectedModels.size + manualModels.length;
      if (totalModels === 0) {
        showMessage('Please add at least one model', 'error');
        return;
      }
    }
    setCurrentStep(currentStep + 1);
  };

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCompleteSetup = async () => {
    setLoading(true);
    try {
      const baseUrl = getProviderBaseUrl();

      // 1. Save API key (only on server if not in public mode)
      if (provider?.needsApiKey && apiKey.trim()) {
        if (publicMode) {
          // In public mode, store key in localStorage instead
          localStorage.setItem('modelrank_api_key', apiKey);
        } else {
          // In self-hosted mode, save to server
          const keyEnv = provider.api_key_env || `${provider.key.toUpperCase()}_API_KEY`;
          const keysToSave = { [keyEnv]: apiKey };
          await api.saveKeys(keysToSave);
        }
      }

      // 2. Create provider config
      const providerConfig = {
        name: provider.name,
        base_url: baseUrl,
        api_key_env: provider?.needsApiKey ? (provider.api_key_env || `${provider.key.toUpperCase()}_API_KEY`) : '',
        headers: provider.headers || {},
      };
      const providersData = {
        providers: {
          [provider.key]: providerConfig,
        }
      };
      await api.saveProviders(providersData);

      // 3. Save selected models
      const modelsData = {};

      // OpenRouter browsed models
      selectedModels.forEach(modelId => {
        const model = models.find(m => m.id === modelId);
        if (model) {
          const key = modelId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
          modelsData[key] = {
            label: model.name || modelId,
            provider: provider.key,
            model_id: modelId,
            role: '',
            cost_per_1m_in: (model.pricing?.prompt || 0) * 1e6,
            cost_per_1m_out: (model.pricing?.completion || 0) * 1e6,
            context_window: model.context_length || 0,
          };
        }
      });

      // Manually entered models (for local providers)
      manualModels.forEach(modelName => {
        const key = modelName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        modelsData[key] = {
          label: modelName,
          provider: provider.key,
          model_id: modelName,
          role: '',
          cost_per_1m_in: 0,
          cost_per_1m_out: 0,
          context_window: 0,
        };
      });

      if (Object.keys(modelsData).length > 0) {
        await api.saveModels({ models: modelsData });
      }

      await api.markSetupComplete();

      showMessage('Setup complete!', 'success');
      setTimeout(() => {
        navigate('/new-run');
      }, 1000);
    } catch (err) {
      showMessage(err.message || 'Failed to complete setup', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .setup-step { animation: fadeIn 0.3s ease-out; }
      `}</style>

      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.logo}>
            <div>
              <span style={styles.modelText}>MODEL</span>
              <span style={styles.rankText}>RANK</span>
            </div>
          </div>
          <div style={styles.stepIndicator}>
            Step {currentStep} of {TOTAL_STEPS}
          </div>
        </div>

        {/* Body */}
        <div style={styles.body} className="setup-step">
          {message.text && (
            <div style={{
              ...styles.message,
              ...(message.type === 'success' ? styles.messageSuccess : styles.messageError)
            }}>
              {message.text}
            </div>
          )}

          {/* Step 1: Welcome */}
          {currentStep === 1 && (
            <>
              <h1 style={styles.stepTitle}>Welcome to ModelRank</h1>
              <p style={styles.stepDescription}>
                ModelRank is a powerful LLM evaluation suite that lets you benchmark and compare language models side-by-side.
              </p>
              <p style={styles.stepDescription}>
                Let's get you set up in just a few steps:
              </p>
              <ol style={{ color: '#a0a0a0', marginBottom: '1.5rem', paddingLeft: '1.5rem', lineHeight: '1.8' }}>
                <li>Choose a model provider</li>
                <li>Configure your connection</li>
                <li>Select models to evaluate</li>
                <li>Start running evaluations!</li>
              </ol>
            </>
          )}

          {/* Step 2: Choose Provider */}
          {currentStep === 2 && (
            <>
              <h1 style={styles.stepTitle}>Choose Provider</h1>
              <p style={styles.stepDescription}>
                Select how you want to access LLM models.
              </p>

              {publicMode ? (
                <>
                  {PROVIDERS.filter(p => p.key === 'openrouter').map(p => (
                    <div
                      key={p.key}
                      style={{
                        ...styles.providerCard,
                        borderColor: selectedProvider === p.key ? p.color : '#252525',
                        ...(selectedProvider === p.key && styles.providerCardSelected),
                      }}
                      onClick={() => handleSelectProvider(p.key)}
                    >
                      <div style={{ ...styles.providerName, color: p.color }}>
                        {p.name}
                      </div>
                      <div style={styles.providerDescription}>
                        {p.description}
                      </div>
                    </div>
                  ))}
                  <div style={styles.hint}>
                    <Settings size={14} style={{ color: '#00ddff', flexShrink: 0 }} />
                    <span>Public instance — only OpenRouter is available. Self-host ModelRank for local provider support.</span>
                  </div>
                </>
              ) : (
                <>
                  {PROVIDERS.map(p => (
                    <div
                      key={p.key}
                      style={{
                        ...styles.providerCard,
                        borderColor: selectedProvider === p.key ? p.color : '#252525',
                        ...(selectedProvider === p.key && styles.providerCardSelected),
                      }}
                      onClick={() => handleSelectProvider(p.key)}
                    >
                      <div style={{ ...styles.providerName, color: p.color }}>
                        {p.name}
                      </div>
                      <div style={styles.providerDescription}>
                        {p.description}
                      </div>
                    </div>
                  ))}
                  <div style={styles.hint}>
                    <Settings size={14} style={{ color: '#ffaa00', flexShrink: 0 }} />
                    <span>You can add more providers later in Settings.</span>
                  </div>
                </>
              )}
            </>
          )}

          {/* Step 3: Configure Connection */}
          {currentStep === 3 && provider && (
            <>
              <h1 style={styles.stepTitle}>Configure {provider.name}</h1>

              <div style={styles.form}>
                {/* Base URL field for local providers and custom */}
                {provider.showBaseUrl && (
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Base URL</label>
                    <input
                      style={{ ...styles.input, paddingRight: '0.75rem' }}
                      type="text"
                      value={customBaseUrl}
                      onChange={(e) => setCustomBaseUrl(e.target.value)}
                      placeholder={provider.base_url || 'https://api.example.com/v1'}
                    />
                    {provider.key !== 'custom' && (
                      <p style={{ color: '#666', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                        Default: {provider.base_url}
                      </p>
                    )}
                  </div>
                )}

                {/* API Key field for providers that need it */}
                {provider.needsApiKey && (
                  <div style={styles.formGroup}>
                    <label style={styles.label}>API Key</label>
                    <div style={styles.inputWrapper}>
                      <input
                        style={styles.input}
                        type={showApiKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={provider.api_key_placeholder}
                      />
                      <div
                        style={styles.inputIcon}
                        onClick={() => setShowApiKey(!showApiKey)}
                      >
                        {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                      </div>
                    </div>
                    {provider.api_key_link && (
                      <p style={{ color: '#666', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                        Get a key at <a href={provider.api_key_link} target="_blank" rel="noopener noreferrer" style={{ color: '#00ddff', textDecoration: 'none' }}>{provider.api_key_link_label}</a>
                      </p>
                    )}
                  </div>
                )}

                {!provider.needsApiKey && !provider.showBaseUrl && (
                  <p style={styles.stepDescription}>
                    {provider.name} doesn't require additional configuration.
                  </p>
                )}

                {keyTestResult && (
                  <div style={{
                    ...styles.message,
                    ...(keyTestResult.valid ? styles.messageSuccess : styles.messageError)
                  }}>
                    {keyTestResult.valid ? (
                      <>
                        <Check size={16} style={{ display: 'inline', marginRight: '0.5rem' }} />
                        Connection successful!
                      </>
                    ) : (
                      <>
                        <X size={16} style={{ display: 'inline', marginRight: '0.5rem' }} />
                        {keyTestResult.error}
                      </>
                    )}
                  </div>
                )}

                {publicMode && provider?.needsApiKey && keyTestResult?.valid && (
                  <div style={{ ...styles.message, ...styles.messageSuccess, fontSize: '0.85rem' }}>
                    API key will be stored in your browser's local storage (not on server).
                  </div>
                )}

                <button
                  style={{
                    ...styles.button,
                    ...(testingKey && styles.buttonLoading)
                  }}
                  onClick={handleTestApiKey}
                  disabled={testingKey || (provider.needsApiKey && !apiKey.trim()) || (provider.showBaseUrl && !getProviderBaseUrl().trim())}
                >
                  {testingKey ? (
                    <>
                      <div style={styles.spinner} /> Testing...
                    </>
                  ) : (
                    <>
                      <Zap size={18} /> Test Connection
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {/* Step 4: Models */}
          {currentStep === 4 && (
            <>
              <h1 style={styles.stepTitle}>Select Models</h1>
              <p style={styles.stepDescription}>
                {provider?.canBrowseModels
                  ? 'Choose which models you want to evaluate. Popular free models are pre-selected.'
                  : `Enter the model names available on your ${provider?.name || ''} instance.`}
              </p>

              {/* OpenRouter: browsable model grid */}
              {provider?.canBrowseModels && (
                <>
                  {models.length === 0 ? (
                    <button
                      style={{
                        ...styles.button,
                        width: '100%',
                        justifyContent: 'center',
                        ...(loadingModels && styles.buttonLoading)
                      }}
                      onClick={handleFetchModels}
                      disabled={loadingModels}
                    >
                      {loadingModels ? 'Loading Models...' : 'Load Available Models'}
                    </button>
                  ) : (
                    <>
                      <div style={styles.modelGrid}>
                        {models.map(model => (
                          <div
                            key={model.id}
                            style={{
                              ...styles.modelCard,
                              ...(selectedModels.has(model.id) && styles.modelCardSelected)
                            }}
                            onClick={() => handleToggleModel(model.id)}
                          >
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                              <input
                                type="checkbox"
                                style={styles.checkbox}
                                checked={selectedModels.has(model.id)}
                                onChange={() => { }}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div style={{ flex: 1 }}>
                                <div style={styles.modelName}>{model.name || model.id}</div>
                                <div style={styles.modelMeta}>
                                  {model.pricing?.prompt === 0 && model.pricing?.completion === 0
                                    ? 'Free'
                                    : `$${((model.pricing?.prompt || 0) * 1e6).toFixed(4)} / $${((model.pricing?.completion || 0) * 1e6).toFixed(4)}`}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p style={{ color: '#888', fontSize: '0.85rem' }}>
                        Selected: {selectedModels.size} model{selectedModels.size !== 1 ? 's' : ''}
                      </p>
                    </>
                  )}
                </>
              )}

              {/* Local providers: manual model entry */}
              {!provider?.canBrowseModels && (
                <>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                    <input
                      style={{ ...styles.input, flex: 1, paddingRight: '0.75rem' }}
                      type="text"
                      value={modelNameInput}
                      onChange={(e) => setModelNameInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddManualModel(); } }}
                      placeholder={provider?.key === 'ollama' ? 'e.g. llama3, mistral, codellama' : 'e.g. model-name'}
                    />
                    <button
                      style={{ ...styles.button, flexShrink: 0 }}
                      onClick={handleAddManualModel}
                      disabled={!modelNameInput.trim()}
                    >
                      Add
                    </button>
                  </div>

                  {manualModels.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                      {manualModels.map(name => (
                        <div key={name} style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.75rem',
                          backgroundColor: '#0c0c0c',
                          border: '1px solid #00ff88',
                        }}>
                          <span style={{ color: '#e0e0e0', fontSize: '0.9rem' }}>{name}</span>
                          <button
                            style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', padding: '0.25rem' }}
                            onClick={() => handleRemoveManualModel(name)}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <p style={{ color: '#888', fontSize: '0.85rem' }}>
                    {manualModels.length} model{manualModels.length !== 1 ? 's' : ''} added
                  </p>
                </>
              )}
            </>
          )}

          {/* Step 5: Complete */}
          {currentStep === 5 && (
            <>
              <div style={styles.successScreen}>
                <div style={styles.successIcon}>&#10003;</div>
                <h1 style={styles.stepTitle}>Setup Complete!</h1>
                <p style={styles.stepDescription}>
                  Your ModelRank evaluation suite is ready to use.
                </p>
                <div style={{ color: '#a0a0a0', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                  <p>You're all set with:</p>
                  <ul style={{ textAlign: 'left', display: 'inline-block', lineHeight: '1.8' }}>
                    <li style={{ color: '#00ff88' }}>&#10003; {provider?.name} provider configured</li>
                    <li style={{ color: '#00ff88' }}>&#10003; {selectedModels.size + manualModels.length} model{(selectedModels.size + manualModels.length) !== 1 ? 's' : ''} selected</li>
                    <li style={{ color: '#00ff88' }}>&#10003; Ready to start evaluations</li>
                  </ul>
                </div>
                <div style={styles.hint}>
                  <Settings size={14} style={{ color: '#ffaa00', flexShrink: 0 }} />
                  <span>You can add more providers and models in Settings at any time.</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button
            style={{ ...styles.button, ...styles.buttonSecondary, flex: 1 }}
            onClick={handlePreviousStep}
            disabled={currentStep === 1 || loading}
          >
            Back
          </button>

          {currentStep < TOTAL_STEPS ? (
            <button
              style={{ ...styles.button, flex: 1, ...(loading && styles.buttonLoading) }}
              onClick={handleNextStep}
              disabled={loading}
            >
              Next <ChevronRight size={18} />
            </button>
          ) : (
            <button
              style={{ ...styles.button, flex: 1, ...(loading && styles.buttonLoading) }}
              onClick={handleCompleteSetup}
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Go to Dashboard'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

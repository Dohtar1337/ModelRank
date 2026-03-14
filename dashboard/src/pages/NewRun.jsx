import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../lib/api';

const tierColors = { quick: '#00ff88', standard: '#ffaa00', deep: '#ff4444', manual: '#00ddff' };
const tierDesc = { quick: 'Fast, basic evaluation', standard: 'Balanced coverage', deep: 'Comprehensive, all prompts', manual: 'Custom prompts defined in Settings' };

function costColor(c) {
  if (!c || c === 0) return '#00ff88';
  if (c < 0.05) return '#00ddff';
  if (c < 0.50) return '#ffaa00';
  return '#ff4444';
}

const copyToClipboard = async (text) => {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  } catch (e) {
    // Final fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
};

export default function NewRun() {
  const nav = useNavigate();
  const [tier, setTier] = useState('standard');
  const [modelsMap, setModelsMap] = useState({});
  const [battery, setBattery] = useState(null);
  const [settings, setSettings] = useState(null);
  const [selectedModels, setSelectedModels] = useState(new Set());
  const [selectedCategories, setSelectedCategories] = useState(new Set());
  const [execMode, setExecMode] = useState(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [completedRunId, setCompletedRunId] = useState(null);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [promptMode, setPromptMode] = useState('ai');
  const [aiModel, setAiModel] = useState('');
  const [aiCount, setAiCount] = useState(5);
  const [aiDescription, setAiDescription] = useState('');
  const [aiCategories, setAiCategories] = useState(new Set());
  const [manualDescription, setManualDescription] = useState('');
  const [manualCount, setManualCount] = useState(5);
  const [pasteBack, setPasteBack] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const [genSuccess, setGenSuccess] = useState(null);
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [generatedPreview, setGeneratedPreview] = useState(null);
  const [editingPromptId, setEditingPromptId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', category: '', prompt: '', expected_traits: '' });

  // Helper function to convert category ID to display name (e.g., "01_orchestration" -> "Orchestration")
  const formatCategoryDisplay = (catId) => {
    if (!catId) return '';
    return catId
      .split('_')
      .slice(1)
      .join(' ')
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  // Helper function to normalize user input category names to battery.json IDs
  const normalizeCategoryName = (displayName) => {
    if (!battery?.categories) return null;
    // Try exact match first (case-insensitive)
    const lower = displayName.toLowerCase();
    for (const [id, display] of Object.entries(battery.categories)) {
      if (display.toLowerCase() === lower) return id;
    }
    // Try matching against formatted ID (e.g., "orchestration" -> "01_orchestration")
    for (const id of Object.keys(battery.categories)) {
      if (id.toLowerCase().includes(lower.replace(/\s+/g, '_'))) return id;
    }
    return null;
  };

  useEffect(() => {
    (async () => {
      try {
        const [m, b, s, evalStatus] = await Promise.all([
          api.getModels(), api.getBattery(), api.getSettings(), api.getEvalStatus()
        ]);
        const models = m.models || m || {};
        setModelsMap(models);
        setSelectedModels(new Set(Object.keys(models)));
        setBattery(b);
        setSettings(s);
        // default all categories selected
        const cats = new Set();
        (b.prompts || []).forEach(p => { if (p.category) cats.add(p.category); });
        setSelectedCategories(cats);

        // Initialize AI prompt generator categories from battery.json
        // Use all available category IDs from battery
        const aiCats = new Set();
        if (b.categories) {
          Object.keys(b.categories).forEach(catId => aiCats.add(catId));
        }
        setAiCategories(aiCats);

        // Resume showing progress if an eval is already running
        if (evalStatus.running) {
          setRunning(true);
          setProgress(evalStatus.progress || { current: 0, total: 0, current_model: '', current_prompt: '' });
        }
      } catch (e) {
        setError(e.message);
      }
    })();
  }, []);

  // Poll status while running
  useEffect(() => {
    if (!running) return;
    pollRef.current = setInterval(async () => {
      try {
        const status = await api.getEvalStatus();
        if (!status.running) {
          clearInterval(pollRef.current);
          setRunning(false);
          const finalRunId = status.runId || progress?.runId;
          setCompletedRunId(finalRunId);
          setProgress(prev => ({ ...prev, current: prev?.total || 0 }));
          // Auto-navigate to run detail
          if (finalRunId) {
            setTimeout(() => nav(`/runs/${finalRunId}`), 4000);
          }
        } else {
          // Only update progress if server has meaningful data (total > 0)
          if (status.progress && status.progress.total > 0) {
            setProgress(status.progress);
          }
        }
      } catch (e) { /* ignore poll errors */ }
    }, 2000);
    return () => clearInterval(pollRef.current);
  }, [running, nav]);

  const modelEntries = Object.entries(modelsMap);

  const perPromptCost = (model) => {
    if (!settings) return 0;
    // Prefer calculated avg from battery, fall back to manual setting
    const avgIn = settings.calculated_avg_input_tokens || settings.avg_input_tokens || 1200;
    const avgOut = settings.avg_output_tokens || 1500;
    return (avgIn * (model.cost_per_1m_in || 0) / 1e6) + (avgOut * (model.cost_per_1m_out || 0) / 1e6);
  };

  // Count prompts for selected tier & categories
  const getPromptCount = () => {
    if (!battery?.prompts) return 0;
    return battery.prompts.filter(p =>
      p.tiers?.includes(tier) &&
      selectedCategories.has(p.category)
    ).length;
  };

  const estimatedCost = () => {
    const pc = getPromptCount();
    let total = 0;
    selectedModels.forEach(k => {
      if (modelsMap[k]) total += perPromptCost(modelsMap[k]) * pc;
    });
    return total;
  };

  // Get per-tier prompt counts
  const tierPromptCounts = {};
  ['quick', 'standard', 'deep'].forEach(t => {
    tierPromptCounts[t] = battery?.prompts?.filter(p => p.tiers?.includes(t)).length || 0;
  });
  // Manual tier count
  tierPromptCounts.manual = battery?.tiers?.manual?.length || 0;

  // Categories from battery
  const allCategories = [...new Set((battery?.prompts || []).map(p => p.category).filter(Boolean))];

  const toggleModel = (k) => {
    const s = new Set(selectedModels);
    s.has(k) ? s.delete(k) : s.add(k);
    setSelectedModels(s);
  };

  const toggleCategory = (c) => {
    const s = new Set(selectedCategories);
    s.has(c) ? s.delete(c) : s.add(c);
    setSelectedCategories(s);
  };

  const toggleAiCategory = (c) => {
    const s = new Set(aiCategories);
    s.has(c) ? s.delete(c) : s.add(c);
    setAiCategories(s);
  };

  const handleGeneratePrompts = async () => {
    if (!aiModel || !aiDescription.trim()) {
      setGenError('Model and description are required');
      return;
    }
    setGenerating(true);
    setGenError(null);
    setGenSuccess(null);
    try {
      const result = await api.generatePrompts({
        model: aiModel,
        count: aiCount,
        description: aiDescription,
        categories: [...aiCategories]
      });
      // Bug Fix 1: Parse response correctly - extract prompts array from response object
      setGeneratedPreview(result.prompts || result);
    } catch (e) {
      const errMsg = e.message || 'Unknown error';
      setGenError(errMsg.length > 200 ? errMsg.substring(0, 200) + '...' : errMsg);
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveGeneratedPrompts = async () => {
    if (!generatedPreview) return;
    setGenerating(true);
    setGenError(null);
    try {
      await api.saveGeneratedPrompts(generatedPreview);
      const freshBattery = await api.getBattery();
      setBattery(freshBattery);
      setGenSuccess(`Successfully saved ${generatedPreview.length} prompts!`);
      setTimeout(() => {
        setGeneratedPreview(null);
        setShowPromptModal(false);
        setAiDescription('');
        setAiCount(5);
        setGenSuccess(null);
      }, 2000);
    } catch (e) {
      setGenError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleRegeneratePrompts = async () => {
    setGeneratedPreview(null);
    await handleGeneratePrompts();
  };

  const handleCopyManualInstructions = async () => {
    const categoryDisplays = [...aiCategories].map(catId => battery?.categories?.[catId] || catId).join(', ');
    const instructionText = `Generate ${manualCount} unique test prompts for evaluating AI language models. Format the output as a JSON array.

Context/Description: ${manualDescription}

Focus on these categories: ${categoryDisplays}

Each prompt object must have:
- "id": starting with "custom-" followed by a number (e.g. "custom-01")
- "name": short descriptive name
- "category": must be one of: ${[...aiCategories].map(catId => battery?.categories?.[catId] || catId).join(', ')}
- "prompt": the actual test prompt text
- "expected_traits": array of traits to evaluate (e.g. ["accuracy", "creativity"])

Return ONLY the JSON array, no other text.`;

    try {
      await copyToClipboard(instructionText);
      setGenSuccess('Instructions copied to clipboard!');
      setTimeout(() => setGenSuccess(null), 3000);
    } catch (e) {
      setGenError('Failed to copy: ' + e.message);
    }
  };

  const handlePasteBack = async () => {
    if (!pasteBack.trim()) {
      setGenError('Paste the JSON array here');
      return;
    }
    try {
      let prompts = JSON.parse(pasteBack);
      if (!Array.isArray(prompts)) throw new Error('Input must be a JSON array');
      // Normalize category names to battery.json IDs
      prompts = prompts.map(p => ({
        ...p,
        category: normalizeCategoryName(p.category) || p.category
      }));
      // Store preview without saving
      setGeneratedPreview(prompts);
      setPasteBack('');
    } catch (e) {
      setGenError('Invalid JSON: ' + e.message);
    }
  };

  const handleSaveManualPrompts = async () => {
    if (!generatedPreview) return;
    setGenerating(true);
    setGenError(null);
    try {
      await api.saveCustomPrompts(generatedPreview);
      const freshBattery = await api.getBattery();
      setBattery(freshBattery);
      setGenSuccess(`Successfully saved ${generatedPreview.length} prompts!`);
      setTimeout(() => {
        setGeneratedPreview(null);
        setShowPromptModal(false);
        setManualDescription('');
        setGenSuccess(null);
      }, 2000);
    } catch (e) {
      setGenError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleEditPrompt = (prompt) => {
    setEditingPromptId(prompt.id);
    setEditForm({
      name: prompt.name || '',
      category: prompt.category || '',
      prompt: prompt.prompt || '',
      expected_traits: Array.isArray(prompt.expected_traits) ? prompt.expected_traits.join(', ') : (prompt.expected_traits || '')
    });
  };

  const handleSaveEdit = async () => {
    if (!editingPromptId) return;
    setGenerating(true);
    setGenError(null);
    try {
      const updatedPrompt = {
        id: editingPromptId,
        name: editForm.name,
        category: editForm.category,
        prompt: editForm.prompt,
        expected_traits: editForm.expected_traits.split(',').map(t => t.trim()).filter(Boolean)
      };
      await api.updatePrompt(updatedPrompt);
      const freshBattery = await api.getBattery();
      setBattery(freshBattery);
      setEditingPromptId(null);
      setEditForm({ name: '', category: '', prompt: '', expected_traits: '' });
    } catch (e) {
      setGenError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleDeletePrompt = async (id) => {
    setGenerating(true);
    setGenError(null);
    try {
      await api.deletePrompt(id);
      const freshBattery = await api.getBattery();
      setBattery(freshBattery);
    } catch (e) {
      setGenError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleRun = async () => {
    if (selectedModels.size === 0) return setError('Select at least one model');
    if (selectedCategories.size === 0) return setError('Select at least one category');
    if (execMode === null) return setError('Select an execution mode');
    setError(null);
    setRunning(true);
    setCompletedRunId(null);
    setProgress({ current: 0, total: getPromptCount() * selectedModels.size, current_model: '', current_prompt: '' });
    try {
      const res = await api.startEval({ tier, models: [...selectedModels], categories: [...selectedCategories], execMode });
      setProgress(prev => ({ ...prev, runId: res.runId }));
    } catch (e) {
      setError(e.message);
      setRunning(false);
    }
  };

  const s = { section: { marginBottom: 24, padding: 20, background: '#141414', border: '1px solid #252525' } };
  const promptCount = getPromptCount();
  const est = estimatedCost();

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ color: '#00ff88', fontSize: 20, fontWeight: 700, letterSpacing: 2, marginBottom: 24 }}>NEW EVAL RUN</h1>

      {error && (
        <div style={{ color: '#ff4444', padding: 12, border: '1px solid #ff4444', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          {error.toLowerCase().includes('already running') && (
            <button onClick={async () => {
              try {
                await api.resetEval();
                setError(null);
                setRunning(false);
                setProgress(null);
              } catch (e) { setError('Reset failed: ' + e.message); }
            }} style={{ padding: '6px 12px', background: '#ff4444', color: '#0c0c0c', border: 'none', cursor: 'pointer', fontWeight: 700, fontFamily: 'monospace', fontSize: 12 }}>
              FORCE RESET
            </button>
          )}
        </div>
      )}

      {/* Running Progress */}
      {running && progress && (
        <div style={{ ...s.section, borderColor: '#00ddff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={{ color: '#00ddff', margin: 0 }}>RUNNING EVALUATION...</p>
            <button onClick={async () => {
              try {
                await api.resetEval();
                clearInterval(pollRef.current);
                setRunning(false);
                setProgress(null);
                setError('Evaluation stopped by user');
              } catch (e) { setError('Failed to stop: ' + e.message); }
            }} style={{
              padding: '6px 16px',
              background: '#ff4444',
              color: '#0c0c0c',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontFamily: 'monospace',
              fontSize: 12
            }}>
              ■ STOP
            </button>
          </div>
          <div style={{ background: '#0a0a0a', height: 20, border: '1px solid #252525', marginBottom: 8 }}>
            <div style={{ height: '100%', background: '#00ff88', width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%`, transition: 'width 0.3s' }} />
          </div>
          <p style={{ color: '#888', fontSize: 13 }}>
            {progress.total > 0
              ? `${progress.current}/${progress.total} — ${progress.current_model || ''} ${progress.current_model && progress.current_prompt ? '/' : ''} ${progress.current_prompt || ''}`
              : 'Starting evaluation...'
            }
          </p>
        </div>
      )}

      {/* Completed */}
      {!running && completedRunId && (
        <div style={{ ...s.section, borderColor: '#00ff88', background: 'rgba(0, 255, 136, 0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ color: '#00ff88', marginBottom: 4, fontSize: 16, fontWeight: 700 }}>✓ EVALUATION COMPLETE</p>
              <p style={{ color: '#888', fontSize: 12, margin: 0 }}>Redirecting to results in a moment...</p>
            </div>
            <button className="btn-primary" onClick={() => nav(`/runs/${completedRunId}`)} style={{ padding: '12px 24px', fontSize: 14 }}>
              View Results →
            </button>
          </div>
        </div>
      )}

      {/* Tier Selector */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ color: '#e0e0e0', fontSize: 14, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Tier</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {(() => {
            const availableTiers = ['quick', 'standard', 'deep'];
            if (battery?.tiers?.manual?.length > 0) availableTiers.push('manual');
            const tierTitles = {
              quick: 'Quick: 4 core prompts for fast checks',
              standard: 'Standard: balanced coverage across categories',
              deep: 'Deep: all prompts, comprehensive evaluation',
              manual: 'Manual: custom prompts defined in Settings'
            };
            return availableTiers.map(t => (
              <div key={t} style={{ flex: 1, minWidth: 150, position: 'relative' }}>
                <div onClick={() => {
                  setTier(t);
                  if (t === 'manual' && battery?.tiers?.manual?.length > 0) {
                    // Auto-select only categories that exist in manual prompts
                    // tiers.manual contains ID strings — resolve categories from prompts array
                    const manualIds = new Set(battery.tiers.manual.map(id => typeof id === 'string' ? id : id?.id).filter(Boolean));
                    const manualCats = new Set(
                      (battery.prompts || []).filter(p => manualIds.has(p.id)).map(p => p.category).filter(Boolean)
                    );
                    setSelectedCategories(manualCats);
                  } else if (t !== 'manual') {
                    // For non-manual tiers, select all battery categories
                    const allCats = new Set((battery?.prompts || []).map(p => p.category).filter(Boolean));
                    setSelectedCategories(allCats);
                  }
                }} title={tierTitles[t]} style={{
                  padding: 16, background: tier === t ? '#1a1a1a' : '#141414',
                  border: `1px solid ${tier === t ? tierColors[t] : '#252525'}`, cursor: 'pointer'
                }}>
                  <div style={{ color: tierColors[t], fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{t}</div>
                  <div style={{ color: '#e0e0e0', fontSize: 24, marginBottom: 4 }}>{tierPromptCounts[t]}</div>
                  <div style={{ color: '#666', fontSize: 12 }}>prompts — {tierDesc[t]}</div>
                </div>
                {t === 'manual' && battery?.tiers?.manual?.length > 0 && (
                  <button onClick={() => setShowEditorModal(true)} style={{
                    position: 'absolute', top: 8, right: 8, background: 'none', border: 'none',
                    color: '#00ddff', fontSize: 16, cursor: 'pointer', padding: 4,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    ✎
                  </button>
                )}
              </div>
            ));
          })()}
          <div onClick={() => setShowPromptModal(true)} style={{
            minWidth: 120, padding: 16, background: '#0c0c0c',
            border: '1px dashed #00ddff', cursor: 'pointer', display: 'flex',
            flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8
          }}>
            <div style={{ color: '#00ddff', fontSize: 28, fontWeight: 700 }}>+</div>
            <div style={{ color: '#00ddff', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Add Prompt</div>
          </div>
        </div>
      </div>

      {/* Model Selection */}
      <div style={s.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ color: '#e0e0e0', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 }} title="Select which configured models to include in this evaluation run">Models</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setSelectedModels(new Set(Object.keys(modelsMap)))} style={{ fontSize: 12 }}>Select All</button>
            <button onClick={() => setSelectedModels(new Set())} style={{ fontSize: 12 }}>Deselect All</button>
          </div>
        </div>
        {modelEntries.length === 0 && <p style={{ color: '#666' }}>No models configured. <span onClick={() => nav('/models')} style={{ color: '#00ff88', cursor: 'pointer' }}>Add models →</span></p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 8 }}>
          {modelEntries.map(([key, m]) => (
            <label key={key} style={{ display: 'flex', gap: 10, padding: 12, background: selectedModels.has(key) ? '#1a1a1a' : '#0a0a0a', border: `1px solid ${selectedModels.has(key) ? '#00ff88' : '#1a1a1a'}`, cursor: 'pointer', alignItems: 'center' }}>
              <input type="checkbox" checked={selectedModels.has(key)} onChange={() => toggleModel(key)} style={{ accentColor: '#00ff88' }} />
              <div>
                <div style={{ color: '#e0e0e0', fontSize: 13 }}>{m.label || key}</div>
                <div style={{ color: '#666', fontSize: 11 }}>{m.provider} {m.role ? `· ${m.role}` : ''}</div>
                <div style={{ color: costColor(perPromptCost(m)), fontSize: 11 }}>${perPromptCost(m).toFixed(4)}/prompt</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Category Filter */}
      <div style={s.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ color: '#e0e0e0', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 }}>Categories</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setSelectedCategories(new Set(allCategories))} style={{ fontSize: 12 }}>Select All</button>
            <button onClick={() => setSelectedCategories(new Set())} style={{ fontSize: 12 }}>Deselect All</button>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {allCategories.map(c => (
            <label key={c} style={{ display: 'flex', gap: 6, padding: '8px 14px', background: selectedCategories.has(c) ? '#1a1a1a' : '#0a0a0a', border: `1px solid ${selectedCategories.has(c) ? '#00ff88' : '#1a1a1a'}`, cursor: 'pointer', alignItems: 'center' }}>
              <input type="checkbox" checked={selectedCategories.has(c)} onChange={() => toggleCategory(c)} style={{ accentColor: '#00ff88' }} />
              <span style={{ color: '#e0e0e0', fontSize: 13, textTransform: 'capitalize' }}>{c}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Cost Estimate + Run Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 20, background: '#141414', border: '1px solid #252525' }}>
        <div>
          <div style={{ color: '#888', fontSize: 12, marginBottom: 4 }} title="Based on avg token counts from Settings. Actual cost depends on model responses.">ESTIMATED COST</div>
          <div style={{ color: costColor(est), fontSize: 28, fontWeight: 700 }} title="Based on avg token counts from Settings. Actual cost depends on model responses.">${est.toFixed(4)}</div>
          <div style={{ color: '#666', fontSize: 12 }}>
            {selectedModels.size} models × {promptCount} prompts = ~{((settings?.calculated_avg_input_tokens || settings?.avg_input_tokens || 1200) * selectedModels.size * promptCount).toLocaleString()} input + ~{((settings?.avg_output_tokens || 1500) * selectedModels.size * promptCount).toLocaleString()} output tokens
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setExecMode('sequential')}
              title="Runs one model at a time. Recommended for local providers like Ollama or LM Studio."
              style={{
                padding: '10px 16px',
                borderRadius: 20,
                border: execMode === 'sequential' ? '2px solid #00ff88' : '2px solid #252525',
                background: execMode === 'sequential' ? 'rgba(0, 255, 136, 0.1)' : '#252525',
                color: execMode === 'sequential' ? '#00ff88' : '#888',
                cursor: 'pointer',
                fontWeight: 700,
                fontFamily: 'monospace',
                fontSize: 12,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                transition: 'all 0.2s ease'
              }}>
              SEQUENTIAL
            </button>
            <button
              onClick={() => setExecMode('parallel')}
              title="Runs all models simultaneously. Faster for cloud providers like OpenRouter. Uses batched concurrency."
              style={{
                padding: '10px 16px',
                borderRadius: 20,
                border: execMode === 'parallel' ? '2px solid #00ff88' : '2px solid #252525',
                background: execMode === 'parallel' ? 'rgba(0, 255, 136, 0.1)' : '#252525',
                color: execMode === 'parallel' ? '#00ff88' : '#888',
                cursor: 'pointer',
                fontWeight: 700,
                fontFamily: 'monospace',
                fontSize: 12,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                transition: 'all 0.2s ease'
              }}>
              PARALLEL
            </button>
          </div>
          <button className="btn-primary" onClick={handleRun}
            disabled={running || selectedModels.size === 0 || selectedCategories.size === 0 || execMode === null}
            style={{ padding: '14px 32px', fontSize: 16, opacity: (running || selectedModels.size === 0 || execMode === null) ? 0.4 : 1 }}>
            ▶ RUN EVALUATION
          </button>
        </div>
      </div>

      {/* Add Custom Prompts Modal */}
      {showPromptModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)', display: 'flex',
          justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div style={{
            background: '#141414', border: '1px solid #252525',
            maxWidth: 640, width: '90%', maxHeight: '90vh', overflow: 'auto',
            padding: 24, position: 'relative'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ color: '#00ff88', fontSize: 16, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>
                ADD CUSTOM PROMPTS
              </h2>
              <button onClick={() => {
                setShowPromptModal(false);
                setGeneratedPreview(null);
                setAiDescription('');
                setPasteBack('');
              }} style={{
                background: 'none', border: 'none', color: '#888',
                cursor: 'pointer', fontSize: 24, padding: 0, width: 32, height: 32,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>×</button>
            </div>

            {/* Preview Mode - Show when generatedPreview is set */}
            {generatedPreview && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ color: '#00ddff', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>PREVIEW</div>
                <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid #252525', padding: 12 }}>
                  {generatedPreview.map((p, idx) => (
                    <div key={idx} style={{ padding: 12, borderBottom: idx < generatedPreview.length - 1 ? '1px solid #252525' : 'none', marginBottom: idx < generatedPreview.length - 1 ? 12 : 0 }}>
                      <div style={{ color: '#e0e0e0', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{p.name || `Prompt ${idx + 1}`}</div>
                      <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>{p.category || 'uncategorized'}</div>
                      <div style={{ color: '#666', fontSize: 11 }}>{(p.prompt || '').substring(0, 80)}...</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button onClick={promptMode === 'ai' ? handleSaveGeneratedPrompts : handleSaveManualPrompts} disabled={generating} style={{
                    flex: 1, padding: '10px 16px', background: generating ? '#666' : '#00ff88', color: '#0c0c0c',
                    border: 'none', cursor: generating ? 'default' : 'pointer', fontWeight: 700,
                    fontFamily: 'monospace', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1
                  }}>
                    {generating ? '⏳ SAVING...' : 'SAVE TO BATTERY'}
                  </button>
                  <button onClick={promptMode === 'ai' ? handleRegeneratePrompts : () => {
                    setGeneratedPreview(null);
                    setPasteBack('');
                  }} disabled={generating} style={{
                    flex: 1, padding: '10px 16px', background: '#00ddff', color: '#0c0c0c',
                    border: 'none', cursor: 'pointer', fontWeight: 700,
                    fontFamily: 'monospace', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1
                  }}>
                    {promptMode === 'ai' ? 'REGENERATE' : 'BACK'}
                  </button>
                </div>
                {genError && <div style={{ color: '#ff4444', fontSize: 12, padding: 8, background: 'rgba(255, 68, 68, 0.1)', border: '1px solid #ff4444' }}>{genError}</div>}
              </div>
            )}

            {/* Normal Mode Tabs - Show when not previewing */}
            {!generatedPreview && (
              <>
                <div style={{ display: 'flex', gap: 12, marginBottom: 24, borderBottom: '1px solid #252525', paddingBottom: 12 }}>
                  <button onClick={() => { setPromptMode('ai'); setGenError(null); setGenSuccess(null); }} style={{
                    background: 'none', border: 'none', color: promptMode === 'ai' ? '#00ff88' : '#666',
                    cursor: 'pointer', fontSize: 12, textTransform: 'uppercase', fontWeight: 700,
                    letterSpacing: 1, paddingBottom: 8, borderBottom: promptMode === 'ai' ? '2px solid #00ff88' : 'none'
                  }}>
                    AI-ASSISTED
                  </button>
                  <button onClick={() => { setPromptMode('manual'); setGenError(null); setGenSuccess(null); }} style={{
                    background: 'none', border: 'none', color: promptMode === 'manual' ? '#00ff88' : '#666',
                    cursor: 'pointer', fontSize: 12, textTransform: 'uppercase', fontWeight: 700,
                    letterSpacing: 1, paddingBottom: 8, borderBottom: promptMode === 'manual' ? '2px solid #00ff88' : 'none'
                  }}>
                    MANUAL
                  </button>
                </div>

                {/* AI-ASSISTED MODE */}
                {promptMode === 'ai' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Model Selector */}
                    <div>
                      <label style={{ display: 'block', color: '#e0e0e0', fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
                        MODEL
                      </label>
                      <select value={aiModel} onChange={(e) => setAiModel(e.target.value)} style={{
                        width: '100%', padding: '10px 12px', background: '#0c0c0c',
                        border: '1px solid #252525', color: '#e0e0e0', fontFamily: 'monospace',
                        fontSize: 12, cursor: 'pointer'
                      }}>
                        <option value="">Select a model...</option>
                        {modelEntries.map(([key, m]) => (
                          <option key={key} value={key}>{m.label || key}</option>
                        ))}
                      </select>
                    </div>

                    {/* Prompt Count */}
                    <div>
                      <label style={{ display: 'block', color: '#e0e0e0', fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
                        NUMBER OF PROMPTS
                      </label>
                      <input type="number" min="1" max="100" value={aiCount} onChange={(e) => setAiCount(parseInt(e.target.value) || 5)} style={{
                        width: '100%', padding: '10px 12px', background: '#0c0c0c',
                        border: '1px solid #252525', color: '#e0e0e0', fontFamily: 'monospace',
                        fontSize: 12, boxSizing: 'border-box'
                      }} />
                    </div>

                    {/* Category Multi-Select */}
                    <div>
                      <label style={{ display: 'block', color: '#e0e0e0', fontSize: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                        CATEGORIES
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {battery?.categories && Object.entries(battery.categories).map(([catId, catDisplay]) => (
                          <button
                            key={catId}
                            onClick={() => toggleAiCategory(catId)}
                            style={{
                              padding: '6px 12px',
                              background: aiCategories.has(catId) ? '#00ff88' : '#0a0a0a',
                              color: aiCategories.has(catId) ? '#0c0c0c' : '#e0e0e0',
                              border: `1px solid ${aiCategories.has(catId) ? '#00ff88' : '#252525'}`,
                              cursor: 'pointer',
                              fontWeight: 700,
                              fontFamily: 'monospace',
                              fontSize: 11,
                              textTransform: 'capitalize',
                              letterSpacing: 0.5
                            }}
                          >
                            {catDisplay}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Description */}
                    <div>
                      <label style={{ display: 'block', color: '#e0e0e0', fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
                        DESCRIPTION
                      </label>
                      <textarea value={aiDescription} onChange={(e) => setAiDescription(e.target.value)} placeholder="Describe what you want to test. The AI will generate prompts for each selected category above. Example: Test model capabilities on real-world tasks including API integrations, creative storytelling, and logical deduction." style={{
                        width: '100%', minHeight: 120, padding: '10px 12px', background: '#0c0c0c',
                        border: '1px solid #252525', color: '#e0e0e0', fontFamily: 'monospace',
                        fontSize: 12, boxSizing: 'border-box', resize: 'vertical'
                      }} />
                    </div>

                    {/* Generate Button */}
                    <button onClick={handleGeneratePrompts} disabled={generating} style={{
                      padding: '10px 16px', background: generating ? '#666' : '#00ff88', color: '#0c0c0c',
                      border: 'none', cursor: generating ? 'default' : 'pointer', fontWeight: 700,
                      fontFamily: 'monospace', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1,
                      opacity: generating ? 0.6 : 1
                    }}>
                      {generating ? '⏳ GENERATING...' : 'GENERATE'}
                    </button>

                    {/* Loading State Feedback */}
                    {generating && (
                      <div style={{ color: '#00ddff', fontSize: 12, padding: 12, background: '#0a0a0a', border: '1px solid #252525', textAlign: 'center' }}>
                        <div style={{ marginBottom: 8 }}>⏳ Generating {aiCount * aiCategories.size} prompts ({aiCount} × {aiCategories.size} categories) with {modelsMap[aiModel]?.label || aiModel}...</div>
                        <div style={{ color: '#666', fontSize: 11 }}>This may take 30-180 seconds depending on the model. Check Docker logs for progress.</div>
                      </div>
                    )}

                    {/* Messages */}
                    {genError && (
                      <div style={{ color: '#ff4444', fontSize: 12, padding: 8, background: 'rgba(255, 68, 68, 0.1)', border: '1px solid #ff4444', maxHeight: 120, overflow: 'auto' }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>Error:</div>
                        {genError}
                      </div>
                    )}
                    {genSuccess && <div style={{ color: '#00ff88', fontSize: 12, padding: 8, background: 'rgba(0, 255, 136, 0.1)', border: '1px solid #00ff88' }}>✓ {genSuccess}</div>}
                  </div>
                )}

                {/* MANUAL MODE */}
                {promptMode === 'manual' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Description */}
                    <div>
                      <label style={{ display: 'block', color: '#e0e0e0', fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
                        DESCRIPTION
                      </label>
                      <textarea value={manualDescription} onChange={(e) => setManualDescription(e.target.value)} placeholder="Describe the test prompts you need, e.g.: Prepare prompts for testing code generation, instruction following, creative writing, and multi-step reasoning. Focus on real-world tasks that differentiate model quality." style={{
                        width: '100%', minHeight: 100, padding: '10px 12px', background: '#0c0c0c',
                        border: '1px solid #252525', color: '#e0e0e0', fontFamily: 'monospace',
                        fontSize: 12, boxSizing: 'border-box', resize: 'vertical'
                      }} />
                    </div>

                    {/* Category Multi-Select */}
                    <div>
                      <label style={{ display: 'block', color: '#e0e0e0', fontSize: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                        CATEGORIES
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {battery?.categories && Object.entries(battery.categories).map(([catId, catDisplay]) => (
                          <button
                            key={catId}
                            onClick={() => toggleAiCategory(catId)}
                            style={{
                              padding: '6px 12px',
                              background: aiCategories.has(catId) ? '#00ff88' : '#0a0a0a',
                              color: aiCategories.has(catId) ? '#0c0c0c' : '#e0e0e0',
                              border: `1px solid ${aiCategories.has(catId) ? '#00ff88' : '#252525'}`,
                              cursor: 'pointer',
                              fontWeight: 700,
                              fontFamily: 'monospace',
                              fontSize: 11,
                              textTransform: 'capitalize',
                              letterSpacing: 0.5
                            }}
                          >
                            {catDisplay}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Prompt Count */}
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', color: '#e0e0e0', fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
                          NUMBER OF PROMPTS
                        </label>
                        <input type="number" min="1" max="100" value={manualCount} onChange={(e) => setManualCount(parseInt(e.target.value) || 5)} style={{
                          width: '100%', padding: '10px 12px', background: '#0c0c0c',
                          border: '1px solid #252525', color: '#e0e0e0', fontFamily: 'monospace',
                          fontSize: 12, boxSizing: 'border-box'
                        }} />
                      </div>
                      <button onClick={handleCopyManualInstructions} style={{
                        padding: '10px 16px', background: '#00ddff', color: '#0c0c0c',
                        border: 'none', cursor: 'pointer', fontWeight: 700,
                        fontFamily: 'monospace', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1
                      }}>
                        COPY INSTRUCTIONS
                      </button>
                    </div>

                    {/* Divider */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0' }}>
                      <div style={{ flex: 1, height: '1px', background: '#252525' }}></div>
                      <div style={{ color: '#666', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>After getting results from your AI, paste them below:</div>
                      <div style={{ flex: 1, height: '1px', background: '#252525' }}></div>
                    </div>

                    {/* Paste Back */}
                    <div>
                      <label style={{ display: 'block', color: '#e0e0e0', fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
                        JSON RESPONSE
                      </label>
                      <textarea value={pasteBack} onChange={(e) => setPasteBack(e.target.value)} placeholder="Paste the JSON array of prompts here..." style={{
                        width: '100%', minHeight: 120, padding: '10px 12px', background: '#0c0c0c',
                        border: '1px solid #252525', color: '#e0e0e0', fontFamily: 'monospace',
                        fontSize: 12, boxSizing: 'border-box', resize: 'vertical'
                      }} />
                    </div>

                    {/* Save Button */}
                    <button onClick={handlePasteBack} style={{
                      padding: '10px 16px', background: '#00ff88', color: '#0c0c0c',
                      border: 'none', cursor: 'pointer', fontWeight: 700,
                      fontFamily: 'monospace', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1
                    }}>
                      VALIDATE & PREVIEW
                    </button>

                    {/* Messages */}
                    {genError && <div style={{ color: '#ff4444', fontSize: 12, padding: 8, background: 'rgba(255, 68, 68, 0.1)', border: '1px solid #ff4444' }}>{genError}</div>}
                    {genSuccess && <div style={{ color: '#00ff88', fontSize: 12, padding: 8, background: 'rgba(0, 255, 136, 0.1)', border: '1px solid #00ff88' }}>✓ {genSuccess}</div>}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Prompt Editor Modal */}
      {showEditorModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)', display: 'flex',
          justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div style={{
            background: '#141414', border: '1px solid #252525',
            maxWidth: 700, width: '90%', maxHeight: '90vh', overflow: 'auto',
            padding: 24, position: 'relative'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ color: '#00ff88', fontSize: 16, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>
                MANAGE CUSTOM PROMPTS
              </h2>
              <button onClick={() => setShowEditorModal(false)} style={{
                background: 'none', border: 'none', color: '#888',
                cursor: 'pointer', fontSize: 24, padding: 0, width: 32, height: 32,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>×</button>
            </div>

            {/* Prompts List */}
            <div style={{ marginBottom: 20, maxHeight: 400, overflow: 'auto' }}>
              {(battery?.tiers?.manual || []).map((idOrObj) => {
                // Resolve: tiers.manual may contain ID strings (new) or legacy objects
                const prompt = typeof idOrObj === 'string'
                  ? (battery.prompts || []).find(p => p.id === idOrObj)
                  : idOrObj;
                if (!prompt) return null;
                return (
                <div key={prompt.id} style={{ padding: 16, marginBottom: 12, background: '#0c0c0c', border: '1px solid #252525' }}>
                  {editingPromptId === prompt.id ? (
                    // Edit Mode
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div>
                        <label style={{ display: 'block', color: '#e0e0e0', fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>NAME</label>
                        <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} style={{
                          width: '100%', padding: '8px 10px', background: '#141414',
                          border: '1px solid #252525', color: '#e0e0e0', fontFamily: 'monospace',
                          fontSize: 12, boxSizing: 'border-box'
                        }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: '#e0e0e0', fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>CATEGORY</label>
                        <input type="text" value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} style={{
                          width: '100%', padding: '8px 10px', background: '#141414',
                          border: '1px solid #252525', color: '#e0e0e0', fontFamily: 'monospace',
                          fontSize: 12, boxSizing: 'border-box'
                        }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: '#e0e0e0', fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>PROMPT</label>
                        <textarea value={editForm.prompt} onChange={(e) => setEditForm({ ...editForm, prompt: e.target.value })} style={{
                          width: '100%', minHeight: 80, padding: '8px 10px', background: '#141414',
                          border: '1px solid #252525', color: '#e0e0e0', fontFamily: 'monospace',
                          fontSize: 12, boxSizing: 'border-box', resize: 'vertical'
                        }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: '#e0e0e0', fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>EXPECTED TRAITS (comma-separated)</label>
                        <input type="text" value={editForm.expected_traits} onChange={(e) => setEditForm({ ...editForm, expected_traits: e.target.value })} style={{
                          width: '100%', padding: '8px 10px', background: '#141414',
                          border: '1px solid #252525', color: '#e0e0e0', fontFamily: 'monospace',
                          fontSize: 12, boxSizing: 'border-box'
                        }} />
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={handleSaveEdit} disabled={generating} style={{
                          flex: 1, padding: '8px 12px', background: generating ? '#666' : '#00ff88', color: '#0c0c0c',
                          border: 'none', cursor: generating ? 'default' : 'pointer', fontWeight: 700,
                          fontFamily: 'monospace', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1
                        }}>
                          {generating ? '⏳ SAVING...' : 'SAVE'}
                        </button>
                        <button onClick={() => {
                          setEditingPromptId(null);
                          setEditForm({ name: '', category: '', prompt: '', expected_traits: '' });
                        }} style={{
                          flex: 1, padding: '8px 12px', background: '#666', color: '#e0e0e0',
                          border: 'none', cursor: 'pointer', fontWeight: 700,
                          fontFamily: 'monospace', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1
                        }}>
                          CANCEL
                        </button>
                      </div>
                    </div>
                  ) : (
                    // View Mode
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
                        <div>
                          <div style={{ color: '#e0e0e0', fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{prompt.name || 'Untitled'}</div>
                          <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>{prompt.category || 'uncategorized'}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => handleEditPrompt(prompt)} style={{
                            background: 'none', border: 'none', color: '#00ddff', fontSize: 14,
                            cursor: 'pointer', padding: 2, width: 24, height: 24,
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}>
                            ✎
                          </button>
                          <button onClick={() => handleDeletePrompt(prompt.id)} style={{
                            background: 'none', border: 'none', color: '#ff4444', fontSize: 14,
                            cursor: 'pointer', padding: 2, width: 24, height: 24,
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}>
                            🗑
                          </button>
                        </div>
                      </div>
                      <div style={{ color: '#666', fontSize: 11 }}>{(prompt.prompt || '').substring(0, 80)}...</div>
                    </div>
                  )}
                </div>
              );
              })}
            </div>

            {genError && <div style={{ color: '#ff4444', fontSize: 12, padding: 8, background: 'rgba(255, 68, 68, 0.1)', border: '1px solid #ff4444', marginBottom: 12 }}>{genError}</div>}

            {/* Bottom Buttons */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => {
                setShowEditorModal(false);
                setShowPromptModal(true);
              }} style={{
                flex: 1, padding: '10px 16px', background: '#00ddff', color: '#0c0c0c',
                border: 'none', cursor: 'pointer', fontWeight: 700,
                fontFamily: 'monospace', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1
              }}>
                RE-GENERATE
              </button>
              <button onClick={() => setShowEditorModal(false)} style={{
                flex: 1, padding: '10px 16px', background: '#666', color: '#e0e0e0',
                border: 'none', cursor: 'pointer', fontWeight: 700,
                fontFamily: 'monospace', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1
              }}>
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

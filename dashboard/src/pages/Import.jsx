import React, { useState, useEffect } from 'react';
import * as api from '../lib/api';

export default function Import() {
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState('');
  const [category, setCategory] = useState('');
  const [jsonInput, setJsonInput] = useState('');
  const [validationResult, setValidationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showFormat, setShowFormat] = useState(false);

  useEffect(() => { fetchRuns(); }, []);

  const fetchRuns = async () => {
    try {
      const data = await api.getRuns();
      setRuns(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load runs');
    }
  };

  const tryAutoDetect = (json) => {
    try {
      const parsed = JSON.parse(json);
      if (parsed.eval_id && !selectedRun) {
        const matchedRun = runs.find(r => r.runId === parsed.eval_id);
        if (matchedRun) setSelectedRun(matchedRun.runId);
      }
      if (parsed.category && !category) setCategory(parsed.category);
      return parsed;
    } catch { return null; }
  };

  const validateJSON = () => {
    setValidationResult(null);
    setError(null);
    try {
      const parsed = JSON.parse(jsonInput);
      const errors = [];
      if (!parsed.judgments) errors.push('Missing "judgments" field');
      if (errors.length > 0) return setValidationResult({ valid: false, errors });

      let promptCount = 0;
      let modelCount = 0;

      if (Array.isArray(parsed.judgments)) {
        // Array format: [{ prompt_id, model_id, score, reasoning }]
        promptCount = new Set(parsed.judgments.map(j => j.prompt_id)).size;
        modelCount = new Set(parsed.judgments.map(j => j.model_id)).size;
      } else if (typeof parsed.judgments === 'object') {
        // Object format (from auto-judge / judge prompt): { "<prompt_id>": { model_scores: { ... }, winner, reasoning } }
        promptCount = Object.keys(parsed.judgments).length;
        const modelSet = new Set();
        Object.values(parsed.judgments).forEach(pj => {
          if (pj.model_scores) Object.keys(pj.model_scores).forEach(k => modelSet.add(k));
        });
        modelCount = modelSet.size;
      } else {
        return setValidationResult({ valid: false, errors: ['"judgments" must be an object or array'] });
      }

      // Auto-fill from JSON if not set
      if (parsed.eval_id && !selectedRun) {
        const matchedRun = runs.find(r => r.runId === parsed.eval_id);
        if (matchedRun) setSelectedRun(matchedRun.runId);
      }
      if (parsed.category && !category) setCategory(parsed.category);

      setValidationResult({ valid: true, promptCount, modelCount, category: parsed.category || category });
    } catch (err) {
      setValidationResult({ valid: false, errors: [`Invalid JSON: ${err.message}`] });
    }
  };

  const handleApply = async () => {
    if (!selectedRun) return setError('Please select a run');
    if (!category) return setError('Please enter a category name');
    if (!validationResult?.valid) return setError('Please validate the JSON first');

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);
      const parsed = JSON.parse(jsonInput);
      await api.saveJudgment(selectedRun, category, parsed);
      setSuccess({ message: 'Judgments imported successfully!', runId: selectedRun });
      setJsonInput('');
      setCategory('');
      setSelectedRun('');
      setValidationResult(null);
    } catch (err) {
      setError(err.message || 'Failed to import judgments');
    } finally {
      setLoading(false);
    }
  };

  const handleJsonChange = (e) => {
    const value = e.target.value;
    setJsonInput(value);
    setValidationResult(null);
    if (value.trim()) tryAutoDetect(value);
  };

  const s = {
    page: { padding: 24, maxWidth: 900, margin: '0 auto' },
    section: { marginBottom: 20, padding: 20, background: '#141414', border: '1px solid #252525' },
    label: { display: 'block', color: '#a0a0a0', fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 },
    input: { width: '100%', padding: '10px 12px', background: '#0c0c0c', color: '#e0e0e0', border: '1px solid #252525', fontFamily: 'monospace', fontSize: 13, boxSizing: 'border-box' },
    textarea: { width: '100%', padding: 12, background: '#0c0c0c', color: '#e0e0e0', border: '1px solid #252525', fontFamily: 'monospace', fontSize: 12, minHeight: 200, resize: 'vertical', boxSizing: 'border-box' },
    btn: { padding: '10px 20px', fontFamily: 'monospace', fontSize: 13, cursor: 'pointer', border: '1px solid #252525', background: '#141414', color: '#e0e0e0' },
    stepNum: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, background: '#00ff88', color: '#0c0c0c', fontWeight: 700, fontSize: 12, marginRight: 10, flexShrink: 0 },
    stepTitle: { color: '#e0e0e0', fontSize: 14, fontWeight: 600 },
  };

  return (
    <div style={s.page}>
      <h1 style={{ color: '#00ff88', fontSize: 20, fontWeight: 700, letterSpacing: 2, marginBottom: 8 }}>IMPORT JUDGMENTS</h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 24 }}>
        Import judgment scores from an external LLM (e.g. ChatGPT, Claude). Use "Copy Judge Prompt" on the Run Detail page to get the prompt, paste it into any LLM, then paste the JSON response here.
      </p>

      {error && (
        <div style={{ color: '#ff4444', padding: 12, border: '1px solid #ff4444', marginBottom: 16, fontSize: 13 }}>{error}</div>
      )}
      {success && (
        <div style={{ padding: 12, border: '1px solid #00ff88', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#00ff88', fontSize: 13 }}>✓ {success.message}</span>
          <a href={`/runs/${success.runId}`} style={{ color: '#00ddff', fontSize: 13, textDecoration: 'none' }}>View Run →</a>
        </div>
      )}

      {/* Step 1: Select Run */}
      <div style={s.section}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <span style={s.stepNum}>1</span>
          <span style={s.stepTitle}>Select the evaluation run</span>
        </div>
        <select value={selectedRun} onChange={(e) => setSelectedRun(e.target.value)} style={s.input}>
          <option value="">— Choose a run —</option>
          {runs.map(run => (
            <option key={run.runId} value={run.runId}>
              {run.runId} — {run.tier} — {run.modelCount || '?'} models
            </option>
          ))}
        </select>
      </div>

      {/* Step 2: Category */}
      <div style={s.section}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <span style={s.stepNum}>2</span>
          <span style={s.stepTitle}>Name the judgment category</span>
        </div>
        <p style={{ color: '#666', fontSize: 12, marginBottom: 8 }}>
          This groups the scores (e.g., "helpfulness", "code_quality", "accuracy"). You can import multiple categories per run.
        </p>
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g., helpfulness, code_quality, accuracy"
          style={s.input}
        />
      </div>

      {/* Step 3: Paste JSON */}
      <div style={s.section}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <span style={s.stepNum}>3</span>
          <span style={s.stepTitle}>Paste the judgment JSON</span>
        </div>
        <p style={{ color: '#666', fontSize: 12, marginBottom: 8 }}>
          Paste the JSON output from the LLM. If the JSON contains "eval_id" and "category" fields, they will be auto-detected.
        </p>
        <textarea
          value={jsonInput}
          onChange={handleJsonChange}
          placeholder={'{\n  "eval_id": "run-id-here",\n  "category": "helpfulness",\n  "judgments": [\n    { "prompt_id": "p1", "model_id": "model-a", "score": 8, "reasoning": "..." }\n  ],\n  "category_ranking": [\n    { "rank": 1, "model_id": "model-a", "score": 8.5 }\n  ]\n}'}
          style={s.textarea}
        />

        {/* Validate + Apply row */}
        <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center' }}>
          <button onClick={validateJSON} disabled={!jsonInput.trim()} style={{ ...s.btn, color: jsonInput.trim() ? '#00ddff' : '#666', borderColor: jsonInput.trim() ? '#00ddff' : '#252525' }}>
            Validate JSON
          </button>
          <button onClick={handleApply} disabled={!validationResult?.valid || !selectedRun || !category || loading}
            style={{ ...s.btn, color: validationResult?.valid ? '#00ff88' : '#666', borderColor: validationResult?.valid ? '#00ff88' : '#252525', fontWeight: 700 }}>
            {loading ? 'Importing...' : '⬆ Import Judgments'}
          </button>

          {validationResult && (
            <span style={{ fontSize: 12, marginLeft: 8 }}>
              {validationResult.valid ? (
                <span style={{ color: '#00ff88' }}>✓ Valid — {validationResult.promptCount} prompts, {validationResult.modelCount} models</span>
              ) : (
                <span style={{ color: '#ff4444' }}>✗ {validationResult.errors[0]}</span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* How it works */}
      <div style={{ ...s.section, borderColor: '#1a1a1a' }}>
        <div onClick={() => setShowFormat(!showFormat)} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#a0a0a0', fontSize: 13, fontWeight: 600 }}>How to use this</span>
          <span style={{ color: '#666' }}>{showFormat ? '▲' : '▼'}</span>
        </div>
        {showFormat && (
          <div style={{ marginTop: 12, color: '#888', fontSize: 12, lineHeight: 1.8 }}>
            <p style={{ marginBottom: 8 }}><strong style={{ color: '#e0e0e0' }}>Quick workflow:</strong></p>
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              <li>Go to a <strong>Run Detail</strong> page and click <strong>"Copy Judge Prompt"</strong> on any category tab</li>
              <li>Paste that prompt into ChatGPT, Claude, or any LLM</li>
              <li>Copy the JSON response from the LLM</li>
              <li>Come back here, select the run, name the category, paste the JSON, and click Import</li>
            </ol>
            <p style={{ marginTop: 12, marginBottom: 8 }}><strong style={{ color: '#e0e0e0' }}>Alternative: Auto-Judge</strong></p>
            <p>You can also use the <strong>⚖ Auto-Judge</strong> button on the Run Detail page to have one of your configured models judge automatically — no copy-pasting needed.</p>
            <p style={{ marginTop: 12, marginBottom: 4 }}><strong style={{ color: '#e0e0e0' }}>Expected JSON format:</strong></p>
            <pre style={{ background: '#0c0c0c', border: '1px solid #252525', padding: 12, fontSize: 11, color: '#a0a0a0', overflow: 'auto' }}>
{`{
  "eval_id": "string (run ID)",
  "category": "string (e.g., helpfulness)",
  "judgments": [
    {
      "prompt_id": "string",
      "model_id": "string",
      "score": "number (0-10)",
      "reasoning": "string (optional)"
    }
  ],
  "category_ranking": [
    { "rank": 1, "model_id": "string", "score": 8.5 }
  ]
}`}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

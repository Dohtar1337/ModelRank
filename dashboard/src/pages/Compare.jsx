import React, { useState, useEffect } from 'react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, Legend, ResponsiveContainer,
} from 'recharts';
import * as api from '../lib/api';

const colors = ['#00ff88', '#00ddff', '#ffaa00', '#ff4444'];

export default function Compare() {
  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [runData, setRunData] = useState(null);
  const [judgments, setJudgments] = useState({});
  const [selectedModels, setSelectedModels] = useState(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.getRuns().then(setRuns).catch(() => {}); }, []);

  useEffect(() => {
    if (!selectedRunId) { setRunData(null); setJudgments({}); setSelectedModels(new Set()); return; }
    setLoading(true);
    api.getRun(selectedRunId).then(d => {
      setRunData(d.run_data);
      setJudgments(d.judgments || {});
      setSelectedModels(new Set());
    }).catch(() => {}).finally(() => setLoading(false));
  }, [selectedRunId]);

  const modelEntries = runData?.models ? Object.entries(runData.models) : [];

  const toggleModel = (k) => {
    const s = new Set(selectedModels);
    if (s.has(k)) s.delete(k);
    else if (s.size < 4) s.add(k);
    setSelectedModels(s);
  };

  // Calculate run cost per model
  const modelRunCost = (modelKey) => {
    if (!runData?.results) return 0;
    const model = runData.models?.[modelKey];
    // If model has zero cost rates, it's a free/local model
    if (model && !model.cost_per_1m_in && !model.cost_per_1m_out) return 0;
    let total = 0;
    Object.values(runData.results).forEach(promptResults => {
      const cost = promptResults[modelKey]?.cost || 0;
      if (isFinite(cost)) total += cost;
    });
    return total;
  };

  // Calculate avg latency per model
  const modelAvgLatency = (modelKey) => {
    if (!runData?.results) return 0;
    let sum = 0, count = 0;
    Object.values(runData.results).forEach(pr => {
      if (pr[modelKey]?.latency_ms) { sum += pr[modelKey].latency_ms; count++; }
    });
    return count ? sum / count : 0;
  };

  // Get avg judgment scores per model across all categories
  const modelAvgScores = (modelKey) => {
    const dims = ['correctness', 'completeness', 'efficiency', 'instruction_adherence', 'quality'];
    const totals = {};
    dims.forEach(d => totals[d] = { sum: 0, count: 0 });

    Object.values(judgments).forEach(catJudg => {
      if (!catJudg?.judgments) return;
      Object.values(catJudg.judgments).forEach(pj => {
        const ms = pj.model_scores?.[modelKey];
        if (!ms) return;
        dims.forEach(d => { if (ms[d] != null) { totals[d].sum += ms[d]; totals[d].count++; } });
      });
    });

    const result = {};
    dims.forEach(d => result[d] = totals[d].count ? totals[d].sum / totals[d].count : 0);
    return result;
  };

  const hasJudgments = Object.keys(judgments).length > 0;
  const selArr = [...selectedModels];

  // Radar chart data
  const radarData = hasJudgments && selArr.length >= 2 ? (() => {
    const dims = ['correctness', 'completeness', 'efficiency', 'instruction_adherence', 'quality'];
    return dims.map(d => {
      const entry = { dimension: d.replace('_', ' ') };
      selArr.forEach(k => { entry[k] = modelAvgScores(k)[d]; });
      return entry;
    });
  })() : null;

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ color: '#00ff88', fontSize: 20, fontWeight: 700, letterSpacing: 2, marginBottom: 24 }}>COMPARE MODELS</h1>

      {/* Run Selector */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 6 }}>SELECT RUN</label>
        <select value={selectedRunId} onChange={e => setSelectedRunId(e.target.value)}
          style={{ width: '100%', maxWidth: 500 }}>
          <option value="">— Choose a run —</option>
          {runs.map(r => (
            <option key={r.runId} value={r.runId}>{r.runId} — {r.tier} — {r.model_count} models</option>
          ))}
        </select>
      </div>

      {loading && <p style={{ color: '#666' }}>Loading...</p>}

      {/* Model Toggles */}
      {runData && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 6 }}>PICK 2-4 MODELS</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {modelEntries.map(([key, m]) => (
              <button key={key} onClick={() => toggleModel(key)}
                style={{
                  padding: '8px 16px', border: `1px solid ${selectedModels.has(key) ? '#00ff88' : '#252525'}`,
                  background: selectedModels.has(key) ? 'rgba(0,255,136,0.1)' : 'transparent',
                  color: selectedModels.has(key) ? '#00ff88' : '#a0a0a0', cursor: 'pointer'
                }}>
                {m.label || key}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cost/Performance Table */}
      {selArr.length >= 2 && runData && (
        <div style={{ marginBottom: 24, background: '#141414', border: '1px solid #252525', padding: 16 }}>
          <h2 style={{ color: '#e0e0e0', fontSize: 14, marginBottom: 12, textTransform: 'uppercase' }}>Cost & Performance</h2>
          <table>
            <thead>
              <tr>
                <th>Metric</th>
                {selArr.map(k => <th key={k}>{runData.models[k]?.label || k}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr><td style={{ color: '#888' }}>$/1M In</td>{selArr.map(k => <td key={k}>${(runData.models[k]?.cost_per_1m_in || 0).toFixed(2)}</td>)}</tr>
              <tr><td style={{ color: '#888' }}>$/1M Out</td>{selArr.map(k => <td key={k}>${(runData.models[k]?.cost_per_1m_out || 0).toFixed(2)}</td>)}</tr>
              <tr><td style={{ color: '#888' }}>Speed (tps)</td>{selArr.map(k => <td key={k}>{runData.models[k]?.speed_tps || '—'}</td>)}</tr>
              <tr><td style={{ color: '#888' }}>Context</td>{selArr.map(k => <td key={k}>{(runData.models[k]?.context_window || 0).toLocaleString()}</td>)}</tr>
              <tr><td style={{ color: '#888' }}>Run Cost</td>{selArr.map(k => <td key={k} style={{ color: '#00ddff' }}>${modelRunCost(k).toFixed(4)}</td>)}</tr>
              <tr><td style={{ color: '#888' }}>Avg Latency</td>{selArr.map(k => <td key={k}>{Math.round(modelAvgLatency(k))}ms</td>)}</tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Radar Chart */}
      {radarData && (
        <div style={{ marginBottom: 24, background: '#141414', border: '1px solid #252525', padding: 16 }}>
          <h2 style={{ color: '#e0e0e0', fontSize: 14, marginBottom: 12, textTransform: 'uppercase' }}>Quality Dimensions</h2>
          <ResponsiveContainer width="100%" height={400}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#252525" />
              <PolarAngleAxis dataKey="dimension" stroke="#888" tick={{ fontSize: 12 }} />
              <PolarRadiusAxis angle={90} domain={[0, 10]} stroke="#333" tick={{ fontSize: 10 }} />
              {selArr.map((k, i) => (
                <Radar key={k} name={runData.models[k]?.label || k} dataKey={k}
                  stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={0.15} />
              ))}
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      {selArr.length >= 2 && !hasJudgments && (
        <div style={{ textAlign: 'center', padding: 40, border: '1px dashed #252525' }}>
          <p style={{ color: '#666', marginBottom: 8 }}>Import judgments to see comparison charts</p>
          <a href="/import" style={{ color: '#00ff88' }}>Import Judgments →</a>
        </div>
      )}
    </div>
  );
}

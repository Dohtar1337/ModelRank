import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../lib/api';

const tierColor = { quick: '#00ff88', standard: '#ffaa00', deep: '#ff4444' };
const medals = ['🥇', '🥈', '🥉'];

function costColor(c) {
  if (!c || c === 0) return '#00ff88';
  if (c < 0.05) return '#00ddff';
  if (c < 0.50) return '#ffaa00';
  return '#ff4444';
}

function scoreColor(s) {
  if (s >= 8) return '#00ff88';
  if (s >= 6) return '#00ddff';
  if (s >= 4) return '#ffaa00';
  return '#ff4444';
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDateShort(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Overview() {
  const [runs, setRuns] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const nav = useNavigate();

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const [runsData, lbData] = await Promise.all([
        api.getRuns(),
        api.getLeaderboard().catch(() => [])
      ]);
      setRuns(Array.isArray(runsData) ? runsData : []);
      setLeaderboard(Array.isArray(lbData) ? lbData : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteRun(runId) {
    if (!confirm(`Delete run ${runId}? This cannot be undone.`)) return;
    try {
      await api.deleteRun(runId);
      setRuns(runs.filter(r => r.runId !== runId));
    } catch (e) {
      setError(`Failed to delete run: ${e.message}`);
    }
  }

  const latestRun = runs[0];
  const judgedRuns = runs.filter(r => r.has_judgments);
  const totalEvals = runs.length;
  const totalCost = runs.reduce((sum, r) => sum + (r.total_cost || 0), 0);

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ color: '#00ff88', fontSize: 20, fontWeight: 700, letterSpacing: 2 }}>DASHBOARD</h1>
        <button className="btn-primary" onClick={() => nav('/new-run')}>+ NEW RUN</button>
      </div>

      {loading && <p style={{ color: '#666' }}>Loading...</p>}
      {error && <p style={{ color: '#ff4444' }}>{error} <button onClick={load} style={{ marginLeft: 8 }}>Retry</button></p>}

      {/* Empty State */}
      {!loading && !error && runs.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, border: '1px dashed #252525' }}>
          <p style={{ color: '#666', fontSize: 48, marginBottom: 12 }}>∅</p>
          <p style={{ color: '#666', marginBottom: 16 }}>No evaluation runs yet</p>
          <button className="btn-primary" onClick={() => nav('/new-run')}>Start Your First Eval</button>
        </div>
      )}

      {!loading && runs.length > 0 && (
        <>
          {/* Stats Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'TOTAL RUNS', value: totalEvals, color: '#e0e0e0', title: 'Total number of evaluation runs completed' },
              { label: 'JUDGED RUNS', value: `${judgedRuns.length}/${totalEvals}`, color: judgedRuns.length > 0 ? '#00ff88' : '#666', title: 'Runs that have been scored by a judge model vs total runs' },
              { label: 'MODELS RANKED', value: leaderboard.length, color: '#00ddff', title: 'Number of unique models that appear in the leaderboard (from judged runs)' },
              { label: 'TOTAL COST', value: `$${totalCost.toFixed(4)}`, color: costColor(totalCost), title: 'Sum of all API costs across all evaluation runs' },
            ].map((stat, i) => (
              <div key={i} style={{ padding: 16, background: '#141414', border: '1px solid #252525' }} title={stat.title}>
                <div style={{ color: '#666', fontSize: 11, letterSpacing: 1, marginBottom: 6 }}>{stat.label}</div>
                <div style={{ color: stat.color, fontSize: 22, fontWeight: 700 }}>{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Model Leaderboard */}
          {leaderboard.length > 0 && (
            <div style={{ marginBottom: 24, background: '#141414', border: '1px solid #252525', padding: 20 }}>
              <h2 style={{ color: '#e0e0e0', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>
                Model Leaderboard
                <span style={{ color: '#666', fontWeight: 400, fontSize: 11, marginLeft: 8 }}>aggregated across all judged runs</span>
              </h2>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>Model</th>
                    <th style={{ textAlign: 'center' }} title="Average judgment score across all dimensions and runs (1-10 scale)">Avg Score</th>
                    <th style={{ textAlign: 'center' }} title="Number of categories where this model was ranked #1">Wins</th>
                    <th style={{ textAlign: 'center' }} title="Number of evaluation runs this model participated in">Runs</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((m, i) => (
                    <tr key={m.key}>
                      <td style={{ fontSize: 18, textAlign: 'center' }}>{medals[i] || <span style={{ color: '#666' }}>{i + 1}</span>}</td>
                      <td style={{ color: i === 0 ? '#00ff88' : '#e0e0e0', fontWeight: i < 3 ? 700 : 400 }}>{m.label}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 10px',
                          background: `${scoreColor(m.avgScore)}15`,
                          border: `1px solid ${scoreColor(m.avgScore)}40`,
                          color: scoreColor(m.avgScore),
                          fontWeight: 700, fontSize: 14
                        }}>
                          {m.avgScore.toFixed(1)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', color: m.wins > 0 ? '#ffaa00' : '#666' }}>{m.wins}</td>
                      <td style={{ textAlign: 'center', color: '#888' }}>{m.runCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Latest Run Highlight */}
          {latestRun && (
            <div style={{
              marginBottom: 24, padding: 20,
              background: '#141414',
              border: `1px solid ${latestRun.has_judgments ? '#00ff88' : '#252525'}`,
              cursor: 'pointer'
            }} onClick={() => nav(`/runs/${latestRun.runId}`)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ color: '#666', fontSize: 11, letterSpacing: 1, marginBottom: 4 }}>LATEST RUN</div>
                  <div style={{ color: '#e0e0e0', fontSize: 16, fontWeight: 600 }}>
                    <code>{latestRun.runId}</code>
                  </div>
                </div>
                <span style={{
                  color: tierColor[latestRun.tier] || '#aaa',
                  border: `1px solid ${tierColor[latestRun.tier] || '#333'}`,
                  padding: '2px 10px', fontSize: 12, textTransform: 'uppercase'
                }}>
                  {latestRun.tier}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <div><span style={{ color: '#666', fontSize: 12 }}>Models: </span><span style={{ color: '#e0e0e0' }}>{latestRun.model_count}</span></div>
                <div><span style={{ color: '#666', fontSize: 12 }}>Prompts: </span><span style={{ color: '#e0e0e0' }}>{latestRun.prompt_count}</span></div>
                <div><span style={{ color: '#666', fontSize: 12 }}>Cost: </span><span style={{ color: costColor(latestRun.total_cost) }}>${(latestRun.total_cost || 0).toFixed(4)}</span></div>
                <div><span style={{ color: '#666', fontSize: 12 }}>Date: </span><span style={{ color: '#888' }}>{fmtDateShort(latestRun.date)}</span></div>
                {latestRun.has_judgments && latestRun.top_model && (
                  <div><span style={{ color: '#666', fontSize: 12 }}>Top Model: </span><span style={{ color: '#00ff88', fontWeight: 700 }}>{latestRun.top_model} ({latestRun.top_model_score})</span></div>
                )}
                {!latestRun.has_judgments && (
                  <div><span style={{ color: '#ffaa00', fontSize: 12 }}>Judgments pending</span></div>
                )}
              </div>
              <div style={{ marginTop: 8, color: '#00ddff', fontSize: 12 }}>View details →</div>
            </div>
          )}

          {/* Runs Table */}
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ color: '#e0e0e0', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>All Runs</h2>
            <table>
              <thead>
                <tr>
                  <th>Run ID</th>
                  <th>Tier</th>
                  <th>Models</th>
                  <th>Prompts</th>
                  <th>Cost</th>
                  <th title="Highest-scoring model in this run (requires judgments)">Top Model</th>
                  <th title="Average judgment score of the top model (1-10 scale)">Score</th>
                  <th>Date</th>
                  <th title="Number of categories judged vs total categories">Judgments</th>
                  <th style={{ textAlign: 'center' }}>Delete</th>
                </tr>
              </thead>
              <tbody>
                {runs.map(r => (
                  <tr key={r.runId} style={{ cursor: 'pointer' }} onClick={() => nav(`/runs/${r.runId}`)}>
                    <td><code style={{ color: '#e0e0e0' }}>{r.runId}</code></td>
                    <td>
                      <span style={{ color: tierColor[r.tier] || '#aaa', border: `1px solid ${tierColor[r.tier] || '#333'}`, padding: '2px 8px', fontSize: 12, textTransform: 'uppercase' }}>
                        {r.tier}
                      </span>
                    </td>
                    <td>{r.model_count}</td>
                    <td>{r.prompt_count}</td>
                    <td style={{ color: costColor(r.total_cost) }}>${(r.total_cost || 0).toFixed(4)}</td>
                    <td style={{ color: r.top_model ? '#00ff88' : '#666', fontWeight: r.top_model ? 600 : 400 }}>
                      {r.top_model || '—'}
                    </td>
                    <td style={{ color: r.top_model_score ? scoreColor(r.top_model_score) : '#666', fontWeight: 700 }}>
                      {r.top_model_score ? r.top_model_score.toFixed(1) : '—'}
                    </td>
                    <td style={{ color: '#888' }}>{fmtDate(r.date)}</td>
                    <td>
                      {r.has_judgments
                        ? <span style={{ color: '#00ff88' }}>✓ {r.judgment_count}/{r.total_categories}</span>
                        : <span style={{ color: '#666' }}>Pending</span>
                      }
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        style={{
                          background: '#ff4444',
                          color: '#fff',
                          border: 'none',
                          padding: '4px 8px',
                          fontSize: '14px',
                          cursor: 'pointer',
                          borderRadius: '3px'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteRun(r.runId);
                        }}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

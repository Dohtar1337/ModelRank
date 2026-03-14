import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as api from '../lib/api';

export default function RunDetail() {
  const { runId } = useParams();
  const navigate = useNavigate();

  const [runData, setRunData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [expandedCards, setExpandedCards] = useState({});
  const [copyFeedback, setCopyFeedback] = useState(null);
  const [autoJudgeModal, setAutoJudgeModal] = useState(false);
  const [judgeModel, setJudgeModel] = useState('');
  const [compareToReference, setCompareToReference] = useState(true);
  const [customInstructions, setCustomInstructions] = useState('');
  const [judging, setJudging] = useState(false);
  const [judgeProgress, setJudgeProgress] = useState('');
  const [judgingAll, setJudgingAll] = useState(false);
  const [judgingAllProgress, setJudgingAllProgress] = useState('');
  const [toastMessage, setToastMessage] = useState(null);
  const [allModels, setAllModels] = useState({});
  const [pasteModal, setPasteModal] = useState(false);
  const [pasteInput, setPasteInput] = useState('');
  const [pasteError, setPasteError] = useState(null);
  const [pasteSuccess, setPasteSuccess] = useState(false);

  useEffect(() => {
    fetchRun();
  }, [runId]);

  const fetchRun = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getRun(runId);
      setRunData(data);

      // Set first category as active
      if (data.run_data?.prompts) {
        const firstCategory = Object.values(data.run_data.prompts)[0]?.category;
        if (firstCategory) {
          setActiveCategory(firstCategory);
        }
      }

      // Load all available models for judge dropdown
      api.getModels().then(m => setAllModels(m.models || m || {})).catch(() => {});
    } catch (err) {
      setError(err.message || 'Failed to fetch run details');
      console.error('Error fetching run:', err);
    } finally {
      setLoading(false);
    }
  };

  const getTierBadgeColor = (tier) => {
    switch (tier?.toLowerCase()) {
      case 'quick': return '#00ff88';
      case 'standard': return '#ffaa00';
      case 'deep': return '#ff4444';
      default: return '#00ff88';
    }
  };

  const getCostStatColor = (cost) => {
    if (cost === 0) return '#00ff88';
    if (cost < 0.05) return '#00ddff';
    if (cost < 0.50) return '#ffaa00';
    return '#ff4444';
  };

  const getScoreGradientColor = (score) => {
    const normalized = Math.max(0, Math.min(10, score)) / 10;
    const r = Math.round(255 * (1 - normalized));
    const g = Math.round(255 * normalized);
    return `rgb(${r}, ${g}, 0)`;
  };

  const getQualityColor = (score) => {
    if (score > 8) return '#00ff88';
    if (score > 6) return '#00ddff';
    if (score > 4) return '#ffaa00';
    return '#ff4444';
  };

  const calculateRunCost = (modelId) => {
    if (!runData?.run_data?.results || !runData?.run_data?.models?.[modelId]) return 0;
    const model = runData.run_data.models[modelId];
    // If model has zero cost rates, it's a free/local model — skip calculation
    if (!model.cost_per_1m_in && !model.cost_per_1m_out) return 0;
    let total = 0;
    Object.values(runData.run_data.results).forEach((promptResults) => {
      const result = promptResults[modelId];
      if (result?.cost !== undefined && isFinite(result.cost)) {
        total += result.cost;
      }
    });
    return total;
  };

  const calculateAvgScore = (modelId) => {
    if (!runData?.judgments) return null;
    const scores = [];
    Object.values(runData.judgments).forEach((categoryJudgment) => {
      if (!categoryJudgment.judgments) return;
      Object.values(categoryJudgment.judgments).forEach((promptJudgment) => {
        const modelScores = promptJudgment.model_scores?.[modelId];
        if (modelScores) {
          const values = Object.values(modelScores).filter(v => typeof v === 'number');
          if (values.length > 0) {
            scores.push(values.reduce((a, b) => a + b, 0) / values.length);
          }
        }
      });
    });
    return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  };

  const calculateModelSpeed = (modelId) => {
    if (!runData?.run_data?.results) return 0;
    const speeds = [];
    Object.values(runData.run_data.results).forEach((promptResults) => {
      const result = promptResults[modelId];
      if (result?.speed_tps !== undefined && result.speed_tps !== null) {
        speeds.push(result.speed_tps);
      }
    });
    if (speeds.length === 0) return 0;
    return speeds.reduce((a, b) => a + b, 0) / speeds.length;
  };

  const calculateModelTokens = (modelId) => {
    if (!runData?.run_data?.results) return { input: 0, output: 0, total: 0 };
    let input = 0, output = 0;
    Object.values(runData.run_data.results).forEach((promptResults) => {
      const result = promptResults[modelId];
      if (result) {
        input += (result.prompt_tokens || 0);
        output += (result.completion_tokens || 0);
      }
    });
    return { input, output, total: input + output };
  };

  const getSpeedColor = (speed) => {
    if (speed > 50) return '#00ff88';
    if (speed > 20) return '#00ddff';
    if (speed > 10) return '#ffaa00';
    return '#ff4444';
  };

  const getCategories = () => {
    if (!runData?.run_data?.prompts) return [];
    const cats = new Set();
    Object.values(runData.run_data.prompts).forEach(p => {
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats);
  };

  const getPromptsInCategory = (category) => {
    if (!runData?.run_data?.prompts) return [];
    return Object.entries(runData.run_data.prompts)
      .filter(([_, p]) => p.category === category)
      .map(([id, p]) => ({ id, ...p }));
  };

  const getWinnerForPrompt = (promptId) => {
    for (const categoryJudgment of Object.values(runData?.judgments || {})) {
      const promptJudgment = categoryJudgment.judgments?.[promptId];
      if (promptJudgment?.winner) {
        return promptJudgment.winner;
      }
    }
    return null;
  };

  const getPromptJudgment = (promptId) => {
    for (const categoryJudgment of Object.values(runData?.judgments || {})) {
      if (categoryJudgment.judgments?.[promptId]) {
        return categoryJudgment.judgments[promptId];
      }
    }
    return null;
  };

  const calculateMedals = () => {
    if (!runData?.run_data?.models) return {};

    const modelIds = Object.keys(runData.run_data.models);
    // Only award medals if there are 2+ models (competition)
    if (modelIds.length < 2) return {};

    const medals = {};
    modelIds.forEach(id => { medals[id] = []; });

    // --- FASTEST: Highest average speed_tps ---
    const speedData = {};
    modelIds.forEach(modelId => {
      const speed = calculateModelSpeed(modelId);
      if (speed > 0) speedData[modelId] = speed;
    });
    if (Object.keys(speedData).length > 0) {
      const speeds = Object.values(speedData);
      const maxSpeed = Math.max(...speeds);
      const fastestModels = Object.entries(speedData)
        .filter(([_, speed]) => speed === maxSpeed)
        .map(([id]) => id);
      // Only award if not all models tied
      if (fastestModels.length < modelIds.length) {
        fastestModels.forEach(id => {
          medals[id].push({ label: 'Fastest', emoji: '⚡', color: '#00ddff' });
        });
      }
    }

    // --- CHEAPEST: Lowest total run cost ---
    const costData = {};
    let hasCosts = false;
    let anyNonZero = false;
    modelIds.forEach(modelId => {
      const cost = calculateRunCost(modelId);
      costData[modelId] = cost;
      if (cost !== undefined && isFinite(cost)) {
        hasCosts = true;
        if (cost > 0) anyNonZero = true;
      }
    });
    // Only award if we have cost data and not all costs are $0
    if (hasCosts && anyNonZero) {
      const costs = Object.values(costData).filter(c => isFinite(c));
      const minCost = Math.min(...costs);
      const cheapestModels = Object.entries(costData)
        .filter(([_, cost]) => isFinite(cost) && cost === minCost)
        .map(([id]) => id);
      // Only award if not all models tied
      if (cheapestModels.length < modelIds.length) {
        cheapestModels.forEach(id => {
          medals[id].push({ label: 'Cheapest', emoji: '💰', color: '#00ff88' });
        });
      }
    }

    // --- MOST EFFICIENT: Lowest total tokens (prompt_tokens + completion_tokens) ---
    const tokenData = {};
    modelIds.forEach(modelId => {
      const tokens = calculateModelTokens(modelId);
      tokenData[modelId] = tokens.total;
    });
    const tokenTotals = Object.values(tokenData);
    if (tokenTotals.some(t => t > 0)) {
      const minTokens = Math.min(...tokenTotals);
      const efficientModels = Object.entries(tokenData)
        .filter(([_, total]) => total === minTokens)
        .map(([id]) => id);
      // Only award if not all models tied
      if (efficientModels.length < modelIds.length) {
        efficientModels.forEach(id => {
          medals[id].push({ label: 'Most Efficient', emoji: '🎯', color: '#ffaa00' });
        });
      }
    }

    // --- BEST OVERALL: Combined ranking system ---
    // Rank each metric (1-N), sum ranks, lowest sum wins
    const rankings = {}; // modelId -> sumOfRanks
    modelIds.forEach(id => { rankings[id] = 0; });

    // Quality score ranking (higher is better, so reverse: lowest rank = highest score)
    const qualityData = {};
    let hasQuality = false;
    modelIds.forEach(modelId => {
      const score = calculateAvgScore(modelId);
      if (score !== null) {
        qualityData[modelId] = score;
        hasQuality = true;
      }
    });
    if (hasQuality) {
      const sortedByQuality = Object.entries(qualityData)
        .sort((a, b) => b[1] - a[1]); // descending (higher is better)
      sortedByQuality.forEach(([modelId, _], index) => {
        rankings[modelId] += (index + 1);
      });
    }

    // Speed ranking (higher is better)
    const sortedBySpeed = Object.entries(speedData)
      .sort((a, b) => b[1] - a[1]); // descending
    sortedBySpeed.forEach(([modelId, _], index) => {
      rankings[modelId] += (index + 1);
    });

    // Cost ranking (lower is better)
    const sortedByCost = Object.entries(costData)
      .filter(([_, cost]) => isFinite(cost))
      .sort((a, b) => a[1] - b[1]); // ascending
    sortedByCost.forEach(([modelId, _], index) => {
      rankings[modelId] += (index + 1);
    });

    // Tokens ranking (lower is better)
    const sortedByTokens = Object.entries(tokenData)
      .sort((a, b) => a[1] - b[1]); // ascending
    sortedByTokens.forEach(([modelId, _], index) => {
      rankings[modelId] += (index + 1);
    });

    // Find winner(s)
    const minRanking = Math.min(...Object.values(rankings));
    const bestModels = Object.entries(rankings)
      .filter(([_, rank]) => rank === minRanking)
      .map(([id]) => id);

    // Only award if not all models tied
    if (bestModels.length < modelIds.length) {
      bestModels.forEach(id => {
        medals[id].push({ label: 'Best Overall', emoji: '🏆', color: '#ffffff' });
      });
    }

    return medals;
  };

  const toggleCardExpanded = (cardKey) => {
    setExpandedCards((prev) => ({
      ...prev,
      [cardKey]: !prev[cardKey],
    }));
  };

  const copyToClipboard = async (text) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (err) {
      console.log('Clipboard API failed, using fallback');
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch (err) {
      console.error('Fallback copy failed:', err);
      return false;
    }
  };

  const handleCopyJudgePrompt = useCallback(async () => {
    if (!activeCategory || !runData) return;

    try {
      const response = await api.getJudgePrompt(runId, activeCategory);
      const promptText = response.prompt;
      const success = await copyToClipboard(promptText);
      if (success) {
        showToast('Copied!');
      } else {
        setError('Failed to copy judge prompt');
      }
    } catch (err) {
      setError('Failed to copy judge prompt: ' + (err.message || ''));
    }
  }, [runId, activeCategory, runData]);

  const showToast = (message) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2000);
  };

  const pollJudgeStatus = async () => {
    try {
      const status = await api.getJudgeStatus();
      if (!status.running) {
        setJudging(false);
        if (status.error) {
          setError('Judging failed: ' + status.error);
          setAutoJudgeModal(false);
        } else {
          setAutoJudgeModal(false);
          await fetchRun();
          showToast('Judging complete!');
        }
      } else {
        setJudgeProgress(`Judging ${status.current || 0}/${status.total || '?'} prompts...`);
        setTimeout(pollJudgeStatus, 2000);
      }
    } catch (err) {
      console.error('Status poll failed:', err);
      setTimeout(pollJudgeStatus, 2000);
    }
  };

  const handleStartJudging = async () => {
    if (!judgeModel || !activeCategory) {
      setError('Please select a judge model');
      return;
    }

    setJudging(true);
    try {
      await api.startAutoJudge(runId, activeCategory, {
        judge_model_key: judgeModel,
        compare_to_reference: compareToReference,
        custom_instructions: customInstructions,
      });

      setJudgeProgress('Judging started...');
      pollJudgeStatus();
    } catch (err) {
      setError('Failed to start judging: ' + (err.message || ''));
      setJudging(false);
    }
  };

  const handleJudgeAll = async () => {
    if (!judgeModel) {
      setAutoJudgeModal(true);
      return;
    }
    const categories = getCategories();
    if (categories.length === 0) return;

    setJudgingAll(true);
    for (let i = 0; i < categories.length; i++) {
      const cat = categories[i];
      setJudgingAllProgress(`Judging ${cat} (${i + 1}/${categories.length})...`);
      try {
        await api.startAutoJudge(runId, cat, {
          judge_model_key: judgeModel,
          compare_to_reference: compareToReference,
          custom_instructions: customInstructions,
        });
        // Poll until this category is done
        let done = false;
        while (!done) {
          await new Promise(r => setTimeout(r, 2000));
          const status = await api.getJudgeStatus();
          if (!status.running) {
            if (status.error) {
              setError(`Judging failed for ${cat}: ${status.error}`);
            }
            done = true;
          }
        }
      } catch (err) {
        setError(`Failed to judge ${cat}: ${err.message}`);
        break;
      }
    }
    setJudgingAll(false);
    setJudgingAllProgress('');
    await fetchRun();
    showToast('All categories judged!');
  };

  const calculateStats = () => {
    if (!runData?.run_data) return { cost: 0, calls: 0, passRate: 'N/A', avgLatency: 0, judgments: '0/0' };

    const run = runData.run_data;
    const cost = run.total_cost || 0;
    const calls = run.total_calls || 0;

    let passCount = 0, totalTests = 0;
    Object.values(run.results || {}).forEach((promptResults) => {
      Object.values(promptResults).forEach((result) => {
        if (result.test_result !== null && result.test_result !== undefined) {
          const [passed, total] = result.test_result.split('/').map(Number);
          if (!isNaN(passed) && !isNaN(total)) {
            passCount += passed;
            totalTests += total;
          }
        }
      });
    });

    let latencies = [];
    Object.values(run.results || {}).forEach((promptResults) => {
      Object.values(promptResults).forEach((result) => {
        if (result.latency_ms) {
          latencies.push(result.latency_ms);
        }
      });
    });
    const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

    const totalCategories = getCategories().length;
    const judgmentCategories = Object.keys(runData.judgments || {}).length;

    return {
      cost,
      calls,
      passRate: totalTests > 0 ? `${passCount}/${totalTests}` : 'N/A',
      avgLatency: Math.round(avgLatency),
      judgments: `${judgmentCategories}/${totalCategories}`,
    };
  };

  const formatLatency = (ms) => {
    if (ms > 1000) {
      return (ms / 1000).toFixed(1) + 's';
    }
    return ms + 'ms';
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', backgroundColor: '#0c0c0c', color: '#a0a0a0', minHeight: '100vh' }}>
        Loading run details...
      </div>
    );
  }

  if (error || !runData?.run_data) {
    return (
      <div style={{ padding: '40px', backgroundColor: '#0c0c0c', color: '#a0a0a0', minHeight: '100vh' }}>
        <div style={{ color: '#ff4444', marginBottom: '20px' }}>
          {error || 'Failed to load run'}
        </div>
        <button
          onClick={() => navigate('/')}
          style={{
            padding: '8px 16px',
            backgroundColor: '#141414',
            color: '#e0e0e0',
            border: '1px solid #252525',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: '12px',
          }}
        >
          ← Back to Runs
        </button>
      </div>
    );
  }

  const categories = getCategories();
  const stats = calculateStats();
  const activeCategory_ = activeCategory || categories[0];
  const run = runData.run_data;

  return (
    <div style={{ backgroundColor: '#0c0c0c', minHeight: '100vh', color: '#a0a0a0', fontFamily: 'monospace' }}>
      {/* Error Banner */}
      {error && (
        <div style={{ padding: '12px 40px', background: '#1a0000', borderBottom: '1px solid #ff4444', color: '#ff4444', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontFamily: 'monospace' }}>✕</button>
        </div>
      )}
      {/* Header */}
      <div style={{ padding: '20px 40px', borderBottom: '1px solid #252525', backgroundColor: '#0c0c0c' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <h1 style={{ margin: '0 0 12px 0', fontSize: '24px', color: '#e0e0e0' }}>Run {run.run_id}</h1>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '12px' }}>
              <span
                style={{
                  padding: '4px 8px',
                  backgroundColor: getTierBadgeColor(run.tier),
                  color: '#0c0c0c',
                  fontWeight: 'bold',
                }}
              >
                {run.tier?.toUpperCase()}
              </span>
              <span style={{ color: '#a0a0a0' }}>
                {new Date(run.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
              <span style={{ color: '#a0a0a0' }}>
                Total: ${(stats.cost).toFixed(4)}
              </span>
            </div>
          </div>
          <button
            onClick={() => navigate(`/new-run?extend=${runId}`)}
            title="Add more categories or models to this run"
            style={{
              padding: '6px 14px',
              background: '#141414',
              color: '#00ddff',
              border: '1px solid #00ddff',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: '12px',
            }}
          >
            + Extend Run
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div style={{ padding: '20px 40px', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', borderBottom: '1px solid #252525' }}>
        <div style={{ backgroundColor: '#141414', border: '1px solid #252525', padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#a0a0a0', marginBottom: '6px' }} title="Sum of all API call costs based on token usage and model pricing">Total Cost</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: getCostStatColor(stats.cost) }}>
            ${stats.cost.toFixed(4)}
          </div>
        </div>
        <div style={{ backgroundColor: '#141414', border: '1px solid #252525', padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#a0a0a0', marginBottom: '6px' }} title="Total number of API calls made during this evaluation run">API Calls</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#e0e0e0' }}>{stats.calls}</div>
        </div>
        <div style={{ backgroundColor: '#141414', border: '1px solid #252525', padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#a0a0a0', marginBottom: '6px' }} title="Pass rate from automated test scripts (bash) attached to prompts. Only applies to prompts with test_script defined in the battery. N/A = no test scripts configured.">Test Pass Rate</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#e0e0e0' }}>{stats.passRate}</div>
        </div>
        <div style={{ backgroundColor: '#141414', border: '1px solid #252525', padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#a0a0a0', marginBottom: '6px' }} title="Average time for model to respond, across all prompts">Avg Latency</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#e0e0e0' }}>{formatLatency(stats.avgLatency)}</div>
        </div>
        <div style={{ backgroundColor: '#141414', border: '1px solid #252525', padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#a0a0a0', marginBottom: '6px' }} title="Number of categories judged vs total categories. Use Auto-Judge to score model responses.">Judgments</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#e0e0e0' }}>{stats.judgments}</div>
        </div>
      </div>

      {/* Models Table */}
      {run.models && Object.keys(run.models).length > 0 && (
        <div style={{ padding: '20px 40px', borderBottom: '1px solid #252525' }}>
          <h2 style={{ fontSize: '16px', color: '#e0e0e0', marginTop: 0, marginBottom: '12px' }}>Models</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #252525' }}>
                  <th style={{ textAlign: 'left', padding: '8px', color: '#a0a0a0' }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '8px', color: '#a0a0a0' }}>Role</th>
                  <th style={{ textAlign: 'right', padding: '8px', color: '#a0a0a0' }}>$/1M In</th>
                  <th style={{ textAlign: 'right', padding: '8px', color: '#a0a0a0' }}>$/1M Out</th>
                  <th style={{ textAlign: 'right', padding: '8px', color: '#a0a0a0' }} title="Tokens per second — calculated from completion_tokens / latency">Speed (tps)</th>
                  <th style={{ textAlign: 'right', padding: '8px', color: '#a0a0a0' }} title="Total tokens used: input + output tokens across all prompts">Tokens</th>
                  <th style={{ textAlign: 'right', padding: '8px', color: '#a0a0a0' }}>Context</th>
                  <th style={{ textAlign: 'right', padding: '8px', color: '#a0a0a0' }}>Run Cost</th>
                  <th style={{ textAlign: 'center', padding: '8px', color: '#a0a0a0' }} title="Average judgment score across all dimensions (1-10)">Quality</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(run.models).map(([modelId, model]) => {
                  const runCost = calculateRunCost(modelId);
                  const avgScore = calculateAvgScore(modelId);
                  const speed = calculateModelSpeed(modelId);
                  const tokens = calculateModelTokens(modelId);
                  const medalMap = calculateMedals();
                  const modelMedals = medalMap[modelId] || [];
                  return (
                    <tr key={modelId} style={{ borderBottom: '1px solid #252525' }}>
                      <td style={{ padding: '8px', color: '#e0e0e0', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span>{model.label}</span>
                        {modelMedals.map((medal, idx) => {
                          const medalColorMap = {
                            '#00ddff': { rgb: '0, 221, 255', text: '#00ddff' },
                            '#00ff88': { rgb: '0, 255, 136', text: '#00ff88' },
                            '#ffaa00': { rgb: '255, 170, 0', text: '#ffaa00' },
                            '#ffffff': { rgb: '255, 255, 255', text: '#ffff00' }
                          };
                          const colorConfig = medalColorMap[medal.color] || medalColorMap['#ffffff'];
                          return (
                            <span
                              key={idx}
                              style={{
                                background: `rgba(${colorConfig.rgb}, 0.15)`,
                                color: colorConfig.text,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: '500',
                                whiteSpace: 'nowrap',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                            >
                              <span>{medal.emoji}</span>
                              <span>{medal.label}</span>
                            </span>
                          );
                        })}
                      </td>
                      <td style={{ padding: '8px', color: '#a0a0a0' }}>{model.role || '—'}</td>
                      <td style={{ textAlign: 'right', padding: '8px', color: '#a0a0a0' }}>
                        ${(model.cost_per_1m_in || 0).toFixed(3)}
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px', color: '#a0a0a0' }}>
                        ${(model.cost_per_1m_out || 0).toFixed(3)}
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px', color: getSpeedColor(speed), fontWeight: 'bold' }}>
                        {speed > 0 ? speed.toFixed(1) + ' tps' : '—'}
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px', color: '#a0a0a0', fontSize: '12px' }}>
                        {(() => {
                          if (tokens.total === 0) return '—';
                          return (
                            <span title={`Input: ${tokens.input.toLocaleString()} / Output: ${tokens.output.toLocaleString()}`}>
                              {tokens.total > 1000 ? (tokens.total / 1000).toFixed(1) + 'K' : tokens.total}
                            </span>
                          );
                        })()}
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px', color: '#a0a0a0' }}>
                        {model.context_window ? (model.context_window / 1000).toFixed(0) + 'K' : '—'}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          padding: '8px',
                          color: getCostStatColor(runCost),
                          fontWeight: 'bold',
                        }}
                      >
                        {runCost === 0 && !model.cost_per_1m_in && !model.cost_per_1m_out ? 'FREE' : `$${runCost.toFixed(4)}`}
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px', color: getQualityColor(avgScore || 0), fontWeight: 'bold' }}>
                        {avgScore !== null ? avgScore.toFixed(1) : <span style={{ color: '#555', fontSize: '10px' }}>Not judged</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Executive Judgment Summary — between Models table and Category tabs */}
      {Object.keys(runData.judgments || {}).length > 0 && (() => {
        // Gather all notes per model across all categories and prompts
        const modelNotes = {};
        const modelCategoryScores = {};
        const categoryWinners = {};
        const allModelKeys = Object.keys(run.models || {});

        Object.entries(runData.judgments).forEach(([catName, catJ]) => {
          if (!catJ?.judgments) return;
          // Track category winner
          if (catJ.category_ranking?.length > 0) {
            categoryWinners[catName] = catJ.category_ranking[0];
          }
          // Gather per-model notes and scores per category
          Object.entries(catJ.judgments).forEach(([promptId, pj]) => {
            if (!pj?.model_scores) return;
            Object.entries(pj.model_scores).forEach(([mk, scores]) => {
              if (!modelNotes[mk]) modelNotes[mk] = [];
              if (!modelCategoryScores[mk]) modelCategoryScores[mk] = {};
              if (!modelCategoryScores[mk][catName]) modelCategoryScores[mk][catName] = { total: 0, count: 0 };
              if (scores.notes) modelNotes[mk].push({ category: catName, prompt: promptId, notes: scores.notes });
              const dims = ['correctness', 'completeness', 'efficiency', 'instruction_adherence', 'quality'];
              dims.forEach(d => {
                if (typeof scores[d] === 'number') {
                  modelCategoryScores[mk][catName].total += scores[d];
                  modelCategoryScores[mk][catName].count++;
                }
              });
            });
          });
        });

        // Build overall ranking
        const modelOverall = allModelKeys.map(mk => {
          let totalScore = 0, totalCount = 0;
          Object.values(modelCategoryScores[mk] || {}).forEach(cs => {
            totalScore += cs.total;
            totalCount += cs.count;
          });
          return { mk, avg: totalCount > 0 ? totalScore / totalCount : 0 };
        }).sort((a, b) => b.avg - a.avg);

        // Collect global summaries and reasoning
        const categorySummaries = Object.entries(runData.judgments).map(([catName, catJ]) => ({
          category: catName,
          summary: catJ.summary || '',
          winner: catJ.category_ranking?.[0],
          winnerLabel: run.models?.[catJ.category_ranking?.[0]]?.label || catJ.category_ranking?.[0]
        })).filter(c => c.summary);

        return (
          <div style={{ padding: '20px 40px', borderBottom: '1px solid #252525' }}>
            <h2 style={{ fontSize: '16px', color: '#ffaa00', marginTop: 0, marginBottom: '16px' }}>⚖ Judgment Analysis</h2>

            {/* Category summaries */}
            {categorySummaries.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                {categorySummaries.map(cs => (
                  <p key={cs.category} style={{ color: '#a0a0a0', fontSize: '12px', lineHeight: 1.6, margin: '0 0 8px 0' }}>
                    <span style={{ color: '#e0e0e0', fontWeight: 'bold' }}>{cs.category}:</span> {cs.summary}
                  </p>
                ))}
              </div>
            )}

            {/* Per-model analysis cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {modelOverall.map(({ mk, avg }, idx) => {
                const model = run.models?.[mk];
                const medals = ['🥇', '🥈', '🥉'];
                const notes = modelNotes[mk] || [];
                const catScores = modelCategoryScores[mk] || {};
                const winsCount = Object.values(categoryWinners).filter(w => w === mk).length;

                return (
                  <div key={mk} style={{
                    padding: '14px 16px',
                    background: idx === 0 ? '#0f1a0f' : '#141414',
                    border: `1px solid ${idx === 0 ? '#00ff88' : '#252525'}`,
                  }}>
                    {/* Model header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: notes.length > 0 ? '10px' : 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '18px' }}>{medals[idx] || `#${idx + 1}`}</span>
                        <span style={{ color: '#e0e0e0', fontWeight: 'bold', fontSize: '14px' }}>{model?.label || mk}</span>
                        {winsCount > 0 && (
                          <span style={{ color: '#ffaa00', fontSize: '11px' }}>★ {winsCount} win{winsCount > 1 ? 's' : ''}</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        {/* Per-category mini scores */}
                        {Object.entries(catScores).map(([catName, cs]) => {
                          const catAvg = cs.count > 0 ? cs.total / cs.count : 0;
                          return (
                            <span key={catName} style={{ fontSize: '11px' }}>
                              <span style={{ color: '#666' }}>{catName}: </span>
                              <span style={{ color: getQualityColor(catAvg), fontWeight: 'bold' }}>{catAvg.toFixed(1)}</span>
                            </span>
                          );
                        })}
                        <span style={{
                          padding: '4px 10px',
                          background: getQualityColor(avg),
                          color: '#0c0c0c',
                          fontWeight: 'bold',
                          fontSize: '13px',
                        }}>
                          {avg.toFixed(1)}
                        </span>
                      </div>
                    </div>

                    {/* Notes from judges */}
                    {notes.length > 0 && (
                      <div style={{ paddingLeft: '34px' }}>
                        {notes.map((n, ni) => (
                          <p key={ni} style={{ color: '#888', fontSize: '12px', lineHeight: 1.6, margin: '0 0 4px 0', fontStyle: 'italic' }}>
                            {notes.length > 1 && <span style={{ color: '#555', fontStyle: 'normal' }}>[{n.prompt}] </span>}
                            {n.notes}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Category Tabs */}
      {categories.length > 0 && (
        <div style={{ padding: '20px 40px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid #252525', paddingBottom: '12px' }}>
            {categories.map((category) => {
              const hasJudgments = !!runData.judgments?.[category];
              return (
                <button
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: activeCategory_ === category ? '#141414' : 'transparent',
                    color: activeCategory_ === category ? '#e0e0e0' : '#a0a0a0',
                    border: activeCategory_ === category ? '1px solid #252525' : 'none',
                    borderBottom: activeCategory_ === category ? '2px solid #00ff88' : '1px solid transparent',
                    cursor: 'pointer',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    position: 'relative',
                  }}
                >
                  {category}
                  {hasJudgments && <span style={{ color: '#00ff88', marginLeft: 4, fontSize: '10px' }}>✓</span>}
                </button>
              );
            })}
          </div>

          {/* Judgment Summary for active category */}
          {activeCategory_ && runData.judgments?.[activeCategory_] && (() => {
            const catJ = runData.judgments[activeCategory_];
            const ranking = catJ.category_ranking || [];
            const modelKeys = Object.keys(run.models || {});
            return (
              <div style={{ marginBottom: '20px', padding: '16px', background: '#141414', border: '1px solid #252525' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '14px', color: '#ffaa00' }}>⚖ Judgment Results — {activeCategory_}</h3>
                  <span style={{ color: '#666', fontSize: '11px' }}>
                    Judge: {catJ.judge_model_label || catJ.judge_model || '?'} · {catJ.judged_at ? new Date(catJ.judged_at).toLocaleString() : ''}
                  </span>
                </div>
                {catJ.summary && <p style={{ color: '#a0a0a0', fontSize: '12px', marginBottom: '12px' }}>{catJ.summary}</p>}
                {ranking.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {ranking.map((modelKey, idx) => {
                      const model = run.models?.[modelKey];
                      const avgScore = calculateAvgScore(modelKey);
                      const medals = ['🥇', '🥈', '🥉'];
                      return (
                        <div key={modelKey} style={{
                          padding: '8px 14px', background: idx === 0 ? '#1a2a1a' : '#0c0c0c',
                          border: `1px solid ${idx === 0 ? '#00ff88' : '#252525'}`,
                          display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px'
                        }}>
                          <span style={{ fontSize: '16px' }}>{medals[idx] || `#${idx + 1}`}</span>
                          <span style={{ color: '#e0e0e0', fontWeight: idx === 0 ? 'bold' : 'normal' }}>{model?.label || modelKey}</span>
                          {avgScore !== null && (
                            <span style={{ color: getQualityColor(avgScore), fontWeight: 'bold' }}>{avgScore.toFixed(1)}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Per-Category Content */}
          {activeCategory_ && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '16px', color: '#e0e0e0', margin: 0 }}>{activeCategory_}</h2>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
                  <button
                    onClick={handleCopyJudgePrompt}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#141414',
                      color: toastMessage ? '#00ff88' : '#e0e0e0',
                      border: '1px solid #252525',
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      fontSize: '11px',
                    }}
                  >
                    {toastMessage || 'Copy Judge Prompt'}
                  </button>
                  <button
                    onClick={() => { setPasteModal(true); setPasteInput(''); setPasteError(null); setPasteSuccess(false); }}
                    style={{
                      padding: '6px 12px',
                      background: '#141414',
                      color: '#00ddff',
                      border: '1px solid #252525',
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      fontSize: '11px',
                    }}
                  >
                    📋 Paste Judge Response
                  </button>
                  <button
                    onClick={() => setAutoJudgeModal(true)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#141414',
                      color: '#ffaa00',
                      border: '1px solid #ffaa00',
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      fontWeight: 'bold',
                    }}
                  >
                    ⚖ Auto-Judge
                  </button>
                  <button
                    onClick={handleJudgeAll}
                    disabled={judging || judgingAll || !judgeModel}
                    title={!judgeModel ? 'Select a judge model first (open Auto-Judge)' : 'Judge all categories sequentially'}
                    style={{
                      padding: '6px 12px',
                      background: judgingAll ? '#1a1a0f' : '#141414',
                      color: judgingAll ? '#ffaa00' : (judgeModel ? '#e0e0e0' : '#666'),
                      border: `1px solid ${judgingAll ? '#ffaa00' : '#252525'}`,
                      cursor: judgeModel ? 'pointer' : 'not-allowed',
                      fontFamily: 'monospace',
                      fontSize: '11px',
                    }}
                  >
                    {judgingAll ? judgingAllProgress : '⚖ Judge All'}
                  </button>
                </div>
              </div>

              {getPromptsInCategory(activeCategory_).length > 0 ? (
                <div>
                  {getPromptsInCategory(activeCategory_).map((prompt) => {
                    const promptJudgment = getPromptJudgment(prompt.id);
                    const winner = getWinnerForPrompt(prompt.id);

                    return (
                      <div
                        key={prompt.id}
                        style={{
                          marginBottom: '20px',
                          backgroundColor: '#0c0c0c',
                          border: '1px solid #252525',
                          padding: '16px',
                        }}
                      >
                        {/* Prompt Block */}
                        <div style={{ marginBottom: '12px' }}>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                            <span
                              style={{
                                padding: '2px 6px',
                                backgroundColor: '#00ff88',
                                color: '#0c0c0c',
                                fontWeight: 'bold',
                                fontSize: '10px',
                              }}
                            >
                              {prompt.id}
                            </span>
                            <span style={{ fontSize: '14px', color: '#e0e0e0', fontWeight: 'bold' }}>
                              {prompt.name}
                            </span>
                          </div>

                          <pre
                            style={{
                              backgroundColor: '#141414',
                              border: '1px solid #252525',
                              padding: '12px',
                              overflow: 'auto',
                              maxHeight: '200px',
                              margin: '8px 0',
                              fontSize: '11px',
                              color: '#a0a0a0',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                            }}
                          >
                            {prompt.prompt}
                          </pre>

                          {prompt.expected_traits && prompt.expected_traits.length > 0 && (
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                              {prompt.expected_traits.map((trait) => (
                                <span
                                  key={trait}
                                  style={{
                                    padding: '2px 6px',
                                    backgroundColor: 'transparent',
                                    border: '1px solid #252525',
                                    fontSize: '10px',
                                    color: '#a0a0a0',
                                  }}
                                >
                                  {trait}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Per-Prompt Judgment Reasoning */}
                        {promptJudgment && (
                          <div style={{ margin: '12px 0', padding: '12px', background: '#111', border: '1px solid #1a1a1a', borderLeft: '3px solid #ffaa00' }}>
                            {promptJudgment.reasoning && (
                              <p style={{ color: '#a0a0a0', fontSize: '12px', lineHeight: 1.6, margin: '0 0 8px 0' }}>
                                <span style={{ color: '#ffaa00', fontWeight: 'bold' }}>Verdict: </span>
                                {promptJudgment.reasoning}
                              </p>
                            )}
                            {promptJudgment.winner && (
                              <span style={{ fontSize: '11px', color: '#00ff88' }}>
                                Winner: {run.models?.[promptJudgment.winner]?.label || promptJudgment.winner}
                              </span>
                            )}
                            {/* Per-model notes for this prompt */}
                            {promptJudgment.model_scores && Object.entries(promptJudgment.model_scores).some(([, s]) => s.notes) && (
                              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {Object.entries(promptJudgment.model_scores).filter(([, s]) => s.notes).map(([mk, scores]) => {
                                  const dims = ['correctness', 'completeness', 'efficiency', 'instruction_adherence', 'quality'];
                                  const dimAvg = dims.reduce((sum, d) => sum + (scores[d] || 0), 0) / dims.length;
                                  return (
                                    <div key={mk} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '11px' }}>
                                      <span style={{ color: getQualityColor(dimAvg), fontWeight: 'bold', minWidth: '24px', textAlign: 'center', flexShrink: 0, marginTop: '1px' }}>{dimAvg.toFixed(1)}</span>
                                      <span style={{ color: '#e0e0e0', minWidth: '140px', flexShrink: 0, fontWeight: 'bold' }}>{run.models?.[mk]?.label || mk}</span>
                                      <span style={{ color: '#777', fontStyle: 'italic', lineHeight: 1.5 }}>{scores.notes}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Response Cards */}
                        {run.results?.[prompt.id] && (
                          <div>
                            {Object.entries(run.results[prompt.id]).map(([modelId, result]) => {
                              const cardKey = `${prompt.id}-${modelId}`;
                              const isExpanded = expandedCards[cardKey];
                              const model = run.models[modelId];
                              const isWinner = winner === modelId;
                              const modelScores = promptJudgment?.model_scores?.[modelId];
                              const scoreDimensions = ['correctness', 'completeness', 'efficiency', 'instruction_adherence', 'quality', 'similarity_to_reference'];

                              return (
                                <div
                                  key={cardKey}
                                  style={{
                                    marginTop: '12px',
                                    backgroundColor: '#0c0c0c',
                                    border: '1px solid #252525',
                                  }}
                                >
                                  {/* Response Header */}
                                  <div
                                    onClick={() => toggleCardExpanded(cardKey)}
                                    style={{
                                      padding: '12px',
                                      backgroundColor: '#141414',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      gap: '12px',
                                      alignItems: 'center',
                                      flexWrap: 'wrap',
                                      fontSize: '12px',
                                    }}
                                  >
                                    <span style={{ color: '#a0a0a0' }}>
                                      {isExpanded ? '[-]' : '[+]'}
                                    </span>
                                    <span style={{ color: '#e0e0e0', fontWeight: 'bold', minWidth: '150px' }}>
                                      {model?.label || modelId}
                                    </span>

                                    {isWinner && (
                                      <span style={{ color: '#ffaa00', fontWeight: 'bold' }}>
                                        ★ WINNER
                                      </span>
                                    )}

                                    {modelScores && (
                                      <div style={{ display: 'flex', gap: '4px' }}>
                                        {scoreDimensions.map((key) => {
                                          const score = modelScores[key];
                                          if (typeof score !== 'number') return null;
                                          return (
                                            <div
                                              key={key}
                                              style={{
                                                padding: '2px 4px',
                                                backgroundColor: getScoreGradientColor(score),
                                                color: '#000',
                                                fontSize: '10px',
                                                fontWeight: 'bold',
                                                minWidth: '20px',
                                                textAlign: 'center',
                                              }}
                                              title={key}
                                            >
                                              {Math.round(score)}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px', fontSize: '11px' }}>
                                      <span style={{ color: '#a0a0a0' }}>
                                        {result.prompt_tokens || 0} → {result.completion_tokens || 0}
                                      </span>
                                      <span style={{ color: '#a0a0a0' }}>
                                        {formatLatency(result.latency_ms || 0)}
                                      </span>
                                      <span style={{ color: '#a0a0a0' }}>
                                        {result.speed_tps ? result.speed_tps.toFixed(1) + ' tps' : '—'}
                                      </span>
                                      <span style={{ color: getCostStatColor(result.cost || 0), fontWeight: 'bold' }}>
                                        ${(result.cost || 0).toFixed(4)}
                                      </span>
                                      {result.test_result !== null && result.test_result !== undefined && (
                                        <span
                                          style={{
                                            padding: '2px 4px',
                                            backgroundColor: result.test_result === '0/0' || result.test_result.startsWith('0/') ? '#ff4444' : (result.test_result.includes('/') && result.test_result.split('/')[0] === result.test_result.split('/')[1] ? '#00ff88' : '#ffaa00'),
                                            color: '#0c0c0c',
                                            fontWeight: 'bold',
                                            fontSize: '10px',
                                          }}
                                        >
                                          {result.test_result}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Response Body */}
                                  {isExpanded && (
                                    <div style={{ padding: '12px', borderTop: '1px solid #252525' }}>
                                      <pre
                                        style={{
                                          backgroundColor: '#0c0c0c',
                                          border: '1px solid #252525',
                                          padding: '12px',
                                          overflow: 'auto',
                                          maxHeight: '400px',
                                          margin: '0 0 12px 0',
                                          fontSize: '11px',
                                          color: '#a0a0a0',
                                          whiteSpace: 'pre-wrap',
                                          wordBreak: 'break-word',
                                        }}
                                      >
                                        {result.response}
                                      </pre>

                                      {modelScores?.notes && (
                                        <div style={{ fontSize: '11px', color: '#a0a0a0', fontStyle: 'italic', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #252525' }}>
                                          {modelScores.notes}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ color: '#a0a0a0', padding: '20px', textAlign: 'center' }}>
                  No prompts in this category.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Auto-Judge Modal */}
      {autoJudgeModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: '#141414',
            border: '1px solid #252525',
            padding: '20px',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto',
          }}>
            <h2 style={{ color: '#e0e0e0', marginTop: 0, marginBottom: '16px' }}>Auto-Judge: <span style={{ color: '#00ff88' }}>{activeCategory}</span></h2>

            {judging ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#a0a0a0', marginBottom: '12px' }}>{judgeProgress || 'Starting judgment...'}</div>
                <div style={{
                  width: '100%',
                  height: '4px',
                  backgroundColor: '#252525',
                  overflow: 'hidden',
                  marginBottom: '16px',
                }}>
                  <div style={{
                    height: '100%',
                    width: '50%',
                    backgroundColor: '#00ff88',
                    animation: 'pulse 1s ease-in-out infinite',
                  }} />
                </div>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', color: '#a0a0a0', fontSize: '12px' }}>
                    Select Judge Model
                  </label>
                  <select
                    value={judgeModel}
                    onChange={(e) => setJudgeModel(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: '#0c0c0c',
                      color: '#e0e0e0',
                      border: '1px solid #252525',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                    }}
                  >
                    <option value="">— Choose a model —</option>
                    {Object.entries(allModels).length > 0
                      ? Object.entries(allModels).map(([modelId, model]) => (
                          <option key={modelId} value={modelId}>
                            {model.label || modelId}
                          </option>
                        ))
                      : Object.entries(run.models || {}).map(([modelId, model]) => (
                          <option key={modelId} value={modelId}>
                            {model.label}
                          </option>
                        ))
                    }
                  </select>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a0a0a0', fontSize: '12px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={compareToReference}
                      onChange={(e) => setCompareToReference(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span title="When enabled, the judge model answers each prompt first, then uses its own response as a baseline for comparison">
                      Compare to Reference
                    </span>
                  </label>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', color: '#a0a0a0', fontSize: '12px' }}>
                    Custom Instructions
                  </label>
                  <textarea
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    placeholder="e.g., Prioritize code correctness over style"
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: '#0c0c0c',
                      color: '#e0e0e0',
                      border: '1px solid #252525',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      minHeight: '80px',
                      resize: 'vertical',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleStartJudging}
                    disabled={!judgeModel}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      backgroundColor: judgeModel ? '#141414' : '#1a1a1a',
                      color: judgeModel ? '#e0e0e0' : '#666',
                      border: '1px solid #252525',
                      cursor: judgeModel ? 'pointer' : 'not-allowed',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                    }}
                  >
                    Start Judging
                  </button>
                  <button
                    onClick={() => setAutoJudgeModal(false)}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#141414',
                      color: '#e0e0e0',
                      border: '1px solid #252525',
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {pasteModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: '#141414', border: '1px solid #252525',
            padding: '20px', maxWidth: '700px', width: '90%', maxHeight: '90vh', overflow: 'auto',
          }}>
            <h2 style={{ color: '#e0e0e0', marginTop: 0, marginBottom: '8px' }}>
              Paste Judge Response: <span style={{ color: '#00ff88' }}>{activeCategory}</span>
            </h2>
            <p style={{ color: '#666', fontSize: '12px', marginBottom: '12px' }}>
              Paste the JSON response from the judge model. This will be saved as judgment data for run <code style={{ color: '#00ddff' }}>{runId}</code>, category <code style={{ color: '#00ddff' }}>{activeCategory}</code>.
            </p>

            <textarea
              value={pasteInput}
              onChange={(e) => { setPasteInput(e.target.value); setPasteError(null); setPasteSuccess(false); }}
              placeholder='Paste the full JSON response here...'
              style={{
                width: '100%', minHeight: '300px', padding: '12px',
                backgroundColor: '#0c0c0c', color: '#e0e0e0',
                border: `1px solid ${pasteError ? '#ff4444' : '#252525'}`,
                fontFamily: 'monospace', fontSize: '12px', resize: 'vertical',
              }}
            />

            {pasteError && (
              <div style={{ color: '#ff4444', fontSize: '12px', marginTop: '8px', padding: '8px', border: '1px solid #ff4444', background: '#1a0a0a' }}>
                {pasteError}
              </div>
            )}

            {pasteSuccess && (
              <div style={{ color: '#00ff88', fontSize: '12px', marginTop: '8px', padding: '8px', border: '1px solid #00ff88', background: '#0a1a0a' }}>
                ✓ Judgment saved successfully!
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button
                onClick={async () => {
                  try {
                    let text = pasteInput.trim();
                    // Strip markdown code fences if present
                    if (text.startsWith('```')) {
                      text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
                    }
                    const parsed = JSON.parse(text);
                    if (!parsed.judgments) {
                      setPasteError('Missing "judgments" field in JSON');
                      return;
                    }
                    await api.saveJudgment(runId, activeCategory, parsed);
                    setPasteSuccess(true);
                    setPasteError(null);
                    // Refresh run data
                    await fetchRun();
                    setTimeout(() => setPasteModal(false), 1000);
                  } catch (err) {
                    if (err instanceof SyntaxError) {
                      setPasteError('Invalid JSON: ' + err.message);
                    } else {
                      setPasteError('Failed to save: ' + err.message);
                    }
                  }
                }}
                disabled={!pasteInput.trim()}
                style={{
                  flex: 1, padding: '8px 12px',
                  backgroundColor: pasteInput.trim() ? '#0a1a0a' : '#1a1a1a',
                  color: pasteInput.trim() ? '#00ff88' : '#666',
                  border: `1px solid ${pasteInput.trim() ? '#00ff88' : '#252525'}`,
                  cursor: pasteInput.trim() ? 'pointer' : 'not-allowed',
                  fontFamily: 'monospace', fontSize: '12px', fontWeight: 'bold',
                }}
              >
                Save Judgment
              </button>
              <button
                onClick={() => setPasteModal(false)}
                style={{
                  padding: '8px 12px', backgroundColor: '#141414',
                  color: '#e0e0e0', border: '1px solid #252525',
                  cursor: 'pointer', fontFamily: 'monospace', fontSize: '12px',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ padding: '20px 40px', borderTop: '1px solid #252525' }}>
        <button
          onClick={() => navigate('/')}
          style={{
            padding: '8px 16px',
            backgroundColor: '#141414',
            color: '#e0e0e0',
            border: '1px solid #252525',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: '12px',
          }}
        >
          ← Back to Runs
        </button>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

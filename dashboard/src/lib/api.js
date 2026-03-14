/**
 * API client for ModelRank
 * All paths are relative — works with Vite proxy in dev and Express static in prod.
 */

const BASE = '/api';

async function request(path, options = {}) {
  const url = `${BASE}${path}`;
  const config = {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  };
  if (config.body && typeof config.body !== 'string') {
    config.body = JSON.stringify(config.body);
  }
  const res = await fetch(url, config);
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try { const j = await res.json(); if (j.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

// ── Config ──────────────────────────────────────────────
export const getSettings  = ()     => request('/config/settings');
export const saveSettings = (data) => request('/config/settings', { method: 'PUT', body: data });

export const getProviders  = ()     => request('/config/providers');
export const saveProviders = (data) => request('/config/providers', { method: 'PUT', body: data });
export const testProvider  = (data) => request('/config/providers/test', { method: 'POST', body: data });

export const getModels  = ()     => request('/config/models');
export const saveModels = (data) => request('/config/models', { method: 'PUT', body: data });

export const getBattery  = ()     => request('/config/battery');
export const saveBattery = (data) => request('/config/battery', { method: 'PUT', body: data });

export const getCustomPrompts = () => request('/config/custom-prompts');
export const saveCustomPrompts = (prompts) => request('/config/custom-prompts', { method: 'POST', body: { prompts } });
export const generatePrompts = (data) => request('/generate-prompts', { method: 'POST', body: data });
export const saveGeneratedPrompts = (prompts) => request('/generate-prompts/save', { method: 'POST', body: { prompts } });
export const updatePrompt = (prompt) => request('/generate-prompts/update', { method: 'PUT', body: { prompt } });
export const deletePrompt = (id) => request(`/generate-prompts/${id}`, { method: 'DELETE' });

export const getKeys  = ()     => request('/config/keys');
export const saveKeys = (data) => request('/config/keys', { method: 'PUT', body: { keys: data } });

export const getSetupStatus = () => request('/setup/status');
export const testApiKey = (key) => request('/setup/test-key', { method: 'POST', body: { key } });
export const markSetupComplete = () => request('/setup/complete', { method: 'POST' });

export const exportConfig = ()     => request('/config/export', { method: 'POST' });
export const importConfig = (data) => request('/config/import', { method: 'POST', body: data });

export const getOpenRouterModels = () => request('/openrouter/models');

// ── Runs ────────────────────────────────────────────────
export const getRuns   = ()       => request('/runs');
export const getRun    = (runId)  => request(`/runs/${runId}`);
export const deleteRun = (runId)  => request(`/runs/${runId}`, { method: 'DELETE' });

// ── Eval ────────────────────────────────────────────────
export const startEval     = (opts) => request('/eval/run', { method: 'POST', body: opts });
export const extendEval    = (opts) => request('/eval/extend', { method: 'POST', body: opts });
export const getEvalStatus = ()     => request('/eval/status');
export const resetEval     = ()     => request('/eval/reset', { method: 'POST' });

// ── Leaderboard ──────────────────────────────────────────
export const getLeaderboard = () => request('/leaderboard');

// ── Judgments ───────────────────────────────────────────
export const saveJudgment    = (runId, category, data) => request(`/runs/${runId}/judgments/${category}`, { method: 'POST', body: data });
export const getJudgePrompt  = (runId, category)       => request(`/runs/${runId}/judge-prompt/${category}`);
export const startAutoJudge  = (runId, category, data) => request(`/runs/${runId}/auto-judge/${category}`, { method: 'POST', body: data });
export const getJudgeStatus  = ()                       => request('/judge/status');

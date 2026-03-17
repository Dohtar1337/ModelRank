import express from 'express';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { runEvalParallel } from './eval-runner.js';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Environment setup
const PORT = process.env.PORT || 3008;
const EVAL_DIR = process.env.EVAL_DIR || '/app/data';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Server setup
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Current eval state
let currentEval = {
  running: false,
  runId: null,
  process: null,
  progress: { current: 0, total: 0, current_model: '', current_prompt: '' },
  output: []
};

// Current judge state
let currentJudge = {
  running: false,
  runId: null,
  category: null,
  current: 0,
  total: 0,
  error: null,
  completed: false
};

// OpenRouter models cache
let openRouterCache = {
  models: null,
  timestamp: null,
  CACHE_DURATION: 3600000 // 1 hour in ms
};

// ============================================================================
// Helper Functions
// ============================================================================

function readJSON(filepath) {
  try {
    if (!fs.existsSync(filepath)) return null;
    const data = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading JSON from ${filepath}:`, error.message);
    return null;
  }
}

function writeJSON(filepath, data) {
  try {
    ensureDir(path.dirname(filepath));
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error(`Error writing JSON to ${filepath}:`, error.message);
    return false;
  }
}

function ensureDir(dirpath) {
  if (!fs.existsSync(dirpath)) {
    fs.mkdirSync(dirpath, { recursive: true });
  }
}

function normalizeModelKeys(modelScores, labelToKey) {
  const normalized = {};
  Object.entries(modelScores).forEach(([key, value]) => {
    const resolvedKey = labelToKey[key.toLowerCase()] || key;
    normalized[resolvedKey] = value;
  });
  return normalized;
}

function listDirs(dirpath) {
  try {
    if (!fs.existsSync(dirpath)) return [];
    return fs.readdirSync(dirpath)
      .filter(file => fs.statSync(path.join(dirpath, file)).isDirectory());
  } catch (error) {
    console.error(`Error listing directories in ${dirpath}:`, error.message);
    return [];
  }
}

function extractJSON(text) {
  if (!text) return null;
  // Try direct parse first
  try { return JSON.parse(text); } catch {}
  // Strip markdown code fences
  let cleaned = text.replace(/^```(?:json)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  // Try to find JSON object in the text
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  // Try to find JSON array in the text
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try { return JSON.parse(arrayMatch[0]); } catch {}
  }
  return null;
}

function estimateTokens(text) {
  if (!text) return 0;
  // Rough estimate: ~3.5 chars per token for mixed English and code text
  return Math.ceil(text.length / 3.5);
}

function generateRunId(tier) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}_${hours}${minutes}${seconds}_${tier}`;
}

function getDefaultSettings() {
  return {
    avg_input_tokens: 1200,
    avg_output_tokens: 1500,
    version: '1.0.0'
  };
}

function getDefaultProviders() {
  return { providers: {} };
}

/**
 * Normalize a category name (from LLM or user input) to a valid battery.json category ID.
 * Examples: "Orchestration" -> "01_orchestration", "coding" -> "02_coding"
 * Returns the category ID if found, or null if no match.
 */
function normalizeCategoryToBatteryId(categoryName, batteryCategories) {
  if (!categoryName || !batteryCategories) return null;

  const lower = categoryName.toLowerCase().trim();

  // Try exact match against display names (case-insensitive)
  for (const [id, displayName] of Object.entries(batteryCategories)) {
    if (displayName.toLowerCase() === lower) {
      return id;
    }
  }

  // Try matching display name without number prefix
  // e.g., "orchestration" should match "01_orchestration"
  for (const [id, displayName] of Object.entries(batteryCategories)) {
    const idWithoutPrefix = id.split('_').slice(1).join('_');
    if (idWithoutPrefix.toLowerCase() === lower.replace(/\s+/g, '_')) {
      return id;
    }
  }

  // Try matching the ID directly (for cases where AI outputs the ID format)
  if (batteryCategories[categoryName]) {
    return categoryName;
  }

  // Fallback: try fuzzy matching on display name prefix
  for (const [id, displayName] of Object.entries(batteryCategories)) {
    if (displayName.toLowerCase().startsWith(lower)) {
      return id;
    }
  }

  return null;
}

function getDefaultModels() {
  return { models: {} };
}

function getDefaultBattery() {
  return {
    categories: {},
    tiers: {
      quick: [],
      standard: [],
      deep: []
    },
    prompts: []
  };
}

// ============================================================================
// API Key Management
// ============================================================================

function loadKeysOnStartup() {
  try {
    const keysPath = path.join(EVAL_DIR, 'config', 'keys.json');
    const keysData = readJSON(keysPath);
    if (keysData && keysData.keys) {
      Object.entries(keysData.keys).forEach(([key, value]) => {
        process.env[key] = value;
      });
      console.log(`Loaded ${Object.keys(keysData.keys).length} API keys from config`);
    }
  } catch (error) {
    console.error('Error loading API keys on startup:', error.message);
  }
}

// ============================================================================
// Config Routes
// ============================================================================

// GET /api/config/settings
app.get('/api/config/settings', (req, res) => {
  try {
    const settingsPath = path.join(EVAL_DIR, 'config', 'settings.json');
    let settings = readJSON(settingsPath);

    if (!settings) {
      settings = getDefaultSettings();
      writeJSON(settingsPath, settings);
    }

    // Auto-calculate avg input tokens from battery prompts
    const configDir = path.join(EVAL_DIR, 'config');
    const batteryPath = path.join(configDir, 'battery.json');
    const battery = readJSON(batteryPath);
    if (battery?.prompts?.length > 0) {
      const totalTokens = battery.prompts.reduce((sum, p) => sum + estimateTokens(p.prompt), 0);
      settings.calculated_avg_input_tokens = Math.round(totalTokens / battery.prompts.length);
    }

    res.json(settings);
  } catch (error) {
    console.error('Error in GET /api/config/settings:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/config/settings
app.put('/api/config/settings', (req, res) => {
  try {
    const settingsPath = path.join(EVAL_DIR, 'config', 'settings.json');
    const success = writeJSON(settingsPath, req.body);

    if (!success) {
      return res.status(500).json({ error: 'Failed to write settings' });
    }

    res.json({ success: true, data: req.body });
  } catch (error) {
    console.error('Error in PUT /api/config/settings:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/config/providers
// Always returns a flat object: { openrouter: {...}, llamacpp: {...} }
app.get('/api/config/providers', (req, res) => {
  try {
    const providersPath = path.join(EVAL_DIR, 'config', 'providers.json');
    let data = readJSON(providersPath);

    if (!data) {
      data = getDefaultProviders();
      writeJSON(providersPath, data);
    }

    // Unwrap if stored with { providers: { ... } } wrapper
    const providers = data.providers || data;
    res.json(providers);
  } catch (error) {
    console.error('Error in GET /api/config/providers:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/config/providers
// Accepts flat object from frontend, always stores with { providers: { ... } } wrapper
app.put('/api/config/providers', (req, res) => {
  try {
    const providersPath = path.join(EVAL_DIR, 'config', 'providers.json');
    // Normalize: if frontend sends flat object, wrap it; if already wrapped, use as-is
    const providers = req.body.providers || req.body;
    const toStore = { providers };
    const success = writeJSON(providersPath, toStore);

    if (!success) {
      return res.status(500).json({ error: 'Failed to write providers' });
    }

    res.json({ success: true, data: providers });
  } catch (error) {
    console.error('Error in PUT /api/config/providers:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/config/providers/test
app.post('/api/config/providers/test', async (req, res) => {
  try {
    const { base_url, api_key_env, model_id, headers } = req.body;

    if (!base_url) {
      return res.status(400).json({ error: 'base_url is required' });
    }

    const apiKey = api_key_env ? process.env[api_key_env] : '';
    const model = model_id || 'test';
    const startTime = Date.now();

    try {
      const fetchHeaders = {
        'Content-Type': 'application/json',
        ...(headers || {})
      };

      if (apiKey) {
        fetchHeaders['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(`${base_url}/chat/completions`, {
        method: 'POST',
        headers: fetchHeaders,
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: 'Say OK' }],
          max_tokens: 5
        })
      });

      const latency = Date.now() - startTime;

      if (!response.ok) {
        const errorData = await response.text();
        return res.json({ success: false, latency_ms: latency, error: `HTTP ${response.status}: ${errorData}` });
      }

      res.json({ success: true, latency_ms: latency });
    } catch (fetchError) {
      const latency = Date.now() - startTime;
      res.json({ success: false, latency_ms: latency, error: fetchError.message });
    }
  } catch (error) {
    console.error('Error in POST /api/config/providers/test:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/config/models
app.get('/api/config/models', (req, res) => {
  try {
    const modelsPath = path.join(EVAL_DIR, 'config', 'models.json');
    let models = readJSON(modelsPath);

    if (!models) {
      models = getDefaultModels();
      writeJSON(modelsPath, models);
    }

    res.json(models);
  } catch (error) {
    console.error('Error in GET /api/config/models:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/config/models
app.put('/api/config/models', (req, res) => {
  try {
    const modelsPath = path.join(EVAL_DIR, 'config', 'models.json');
    const success = writeJSON(modelsPath, req.body);

    if (!success) {
      return res.status(500).json({ error: 'Failed to write models' });
    }

    res.json({ success: true, data: req.body });
  } catch (error) {
    console.error('Error in PUT /api/config/models:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/config/battery
app.get('/api/config/battery', (req, res) => {
  try {
    const batteryPath = path.join(EVAL_DIR, 'config', 'battery.json');
    let battery = readJSON(batteryPath);

    if (!battery) {
      battery = getDefaultBattery();
      writeJSON(batteryPath, battery);
    }

    res.json(battery);
  } catch (error) {
    console.error('Error in GET /api/config/battery:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/config/battery
app.put('/api/config/battery', (req, res) => {
  try {
    const batteryPath = path.join(EVAL_DIR, 'config', 'battery.json');
    const success = writeJSON(batteryPath, req.body);

    if (!success) {
      return res.status(500).json({ error: 'Failed to write battery' });
    }

    res.json({ success: true, data: req.body });
  } catch (error) {
    console.error('Error in PUT /api/config/battery:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/config/custom-prompts
app.get('/api/config/custom-prompts', (req, res) => {
  try {
    const batteryPath = path.join(EVAL_DIR, 'config', 'battery.json');
    const battery = readJSON(batteryPath);

    if (!battery || !battery.prompts) {
      return res.json([]);
    }

    // Filter prompts that start with "custom-"
    const customPrompts = battery.prompts.filter(p => p.id && p.id.startsWith('custom-'));
    res.json(customPrompts);
  } catch (error) {
    console.error('Error in GET /api/config/custom-prompts:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/config/custom-prompts
app.post('/api/config/custom-prompts', (req, res) => {
  try {
    const { prompts } = req.body;

    if (!Array.isArray(prompts)) {
      return res.status(400).json({ error: 'Prompts must be an array' });
    }

    const batteryPath = path.join(EVAL_DIR, 'config', 'battery.json');
    const battery = readJSON(batteryPath) || { categories: {}, tiers: {}, prompts: [] };

    // Remove any previously added custom prompts (IDs starting with "custom-")
    battery.prompts = battery.prompts.filter(p => !p.id || !p.id.startsWith('custom-'));

    // Add new custom prompts
    const customPromptIds = [];
    prompts.forEach(prompt => {
      if (prompt.id && prompt.id.startsWith('custom-')) {
        battery.prompts.push(prompt);
        customPromptIds.push(prompt.id);
      }
    });

    // Create or update manual tier with custom prompt IDs
    if (customPromptIds.length > 0) {
      battery.tiers.manual = customPromptIds;
    } else {
      // Remove manual tier if no custom prompts
      delete battery.tiers.manual;
    }

    // Write updated battery
    const success = writeJSON(batteryPath, battery);
    if (!success) {
      return res.status(500).json({ error: 'Failed to write battery' });
    }

    res.json({ success: true, data: { prompts: customPromptIds.length, battery } });
  } catch (error) {
    console.error('Error in POST /api/config/custom-prompts:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/config/export
app.post('/api/config/export', (req, res) => {
  try {
    const configDir = path.join(EVAL_DIR, 'config');

    const settings = readJSON(path.join(configDir, 'settings.json')) || getDefaultSettings();
    const providers = readJSON(path.join(configDir, 'providers.json')) || getDefaultProviders();
    const models = readJSON(path.join(configDir, 'models.json')) || getDefaultModels();
    const battery = readJSON(path.join(configDir, 'battery.json')) || getDefaultBattery();

    const exportData = { settings, providers, models, battery };

    res.setHeader('Content-Disposition', 'attachment; filename="eval-config-export.json"');
    res.setHeader('Content-Type', 'application/json');
    res.json(exportData);
  } catch (error) {
    console.error('Error in POST /api/config/export:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/config/import
app.post('/api/config/import', (req, res) => {
  try {
    const { settings, providers, models, battery } = req.body;
    const configDir = path.join(EVAL_DIR, 'config');
    const results = {};

    if (settings) {
      results.settings = writeJSON(path.join(configDir, 'settings.json'), settings);
    }
    if (providers) {
      results.providers = writeJSON(path.join(configDir, 'providers.json'), providers);
    }
    if (models) {
      results.models = writeJSON(path.join(configDir, 'models.json'), models);
    }
    if (battery) {
      results.battery = writeJSON(path.join(configDir, 'battery.json'), battery);
    }

    res.json({ success: true, imported: results });
  } catch (error) {
    console.error('Error in POST /api/config/import:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/config/keys
app.get('/api/config/keys', (req, res) => {
  try {
    const keysPath = path.join(EVAL_DIR, 'config', 'keys.json');
    const keysData = readJSON(keysPath);

    if (!keysData || !keysData.keys) {
      return res.json({});
    }

    // Return the actual keys object so Settings can display/mask values
    res.json(keysData.keys);
  } catch (error) {
    console.error('Error in GET /api/config/keys:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/config/mode
app.get('/api/config/mode', (req, res) => {
  try {
    const publicMode = process.env.PUBLIC_MODE === 'true';
    res.json({ publicMode });
  } catch (error) {
    console.error('Error in GET /api/config/mode:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/config/keys
app.put('/api/config/keys', (req, res) => {
  try {
    const { keys } = req.body;
    const keysPath = path.join(EVAL_DIR, 'config', 'keys.json');
    const keysData = { keys: keys || {} };

    const success = writeJSON(keysPath, keysData);

    if (!success) {
      return res.status(500).json({ error: 'Failed to write keys' });
    }

    // Load keys into process.env immediately
    if (keys) {
      Object.entries(keys).forEach(([key, value]) => {
        process.env[key] = value;
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error in PUT /api/config/keys:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Setup Routes
// ============================================================================

// GET /api/setup/status
app.get('/api/setup/status', (req, res) => {
  try {
    const settingsPath = path.join(EVAL_DIR, 'config', 'settings.json');
    const settings = readJSON(settingsPath) || {};

    const keysPath = path.join(EVAL_DIR, 'config', 'keys.json');
    const keysData = readJSON(keysPath) || {};
    const keys = keysData.keys || {};

    // Setup is complete if there's at least one non-empty key and setup_complete flag is set
    const hasKeys = Object.values(keys).some(val => val && String(val).trim());
    const setupComplete = settings.setup_complete === true;

    res.json({ setupComplete: setupComplete && hasKeys });
  } catch (error) {
    console.error('Error in GET /api/setup/status:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/setup/test-key
app.post('/api/setup/test-key', async (req, res) => {
  try {
    const { key } = req.body;

    if (!key || !String(key).trim()) {
      return res.json({ valid: false, error: 'API key is empty' });
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        res.json({ valid: true });
      } else if (response.status === 401 || response.status === 403) {
        res.json({ valid: false, error: 'Invalid or expired API key' });
      } else {
        const errorData = await response.text();
        res.json({ valid: false, error: `API error: ${response.status}` });
      }
    } catch (fetchErr) {
      res.json({ valid: false, error: `Connection failed: ${fetchErr.message}` });
    }
  } catch (error) {
    console.error('Error in POST /api/setup/test-key:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/setup/complete
app.post('/api/setup/complete', (req, res) => {
  try {
    const settingsPath = path.join(EVAL_DIR, 'config', 'settings.json');
    let settings = readJSON(settingsPath) || getDefaultSettings();
    settings.setup_complete = true;

    const success = writeJSON(settingsPath, settings);

    if (!success) {
      return res.status(500).json({ error: 'Failed to mark setup complete' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error in POST /api/setup/complete:', error.message);
    res.status(500).json({ error: error.message });
  }
});
// Runs Routes
// ============================================================================

// GET /api/runs
app.get('/api/runs', (req, res) => {
  try {
    const resultsDir = path.join(EVAL_DIR, 'results');
    const runDirs = listDirs(resultsDir);

    const runs = runDirs.map(runId => {
      const rawDataPath = path.join(resultsDir, runId, 'raw_data.json');
      const rawData = readJSON(rawDataPath);

      if (!rawData) {
        return {
          runId,
          tier: 'unknown',
          date: new Date(0).toISOString(),
          model_count: 0,
          prompt_count: 0,
          total_cost: 0,
          total_calls: 0,
          has_judgments: false,
          judgment_count: 0,
          total_categories: 0
        };
      }

      const judgmentsDir = path.join(resultsDir, runId, 'judgments');
      const judgmentFiles = fs.existsSync(judgmentsDir) ? fs.readdirSync(judgmentsDir).filter(f => f.endsWith('.json')) : [];
      const has_judgments = judgmentFiles.length > 0;

      // Calculate model_count and prompt_count from objects
      const model_count = rawData.models ? Object.keys(rawData.models).length : 0;
      const prompt_count = rawData.prompts ? Object.keys(rawData.prompts).length : 0;

      // Calculate total categories
      const categories = new Set();
      if (rawData.prompts) {
        Object.values(rawData.prompts).forEach(prompt => {
          if (prompt.category) categories.add(prompt.category);
        });
      }

      // Extract top model and avg scores from judgments
      let topModel = null;
      let topModelScore = 0;
      const modelScores = {};

      if (has_judgments) {
        judgmentFiles.forEach(jf => {
          const jData = readJSON(path.join(judgmentsDir, jf));
          if (!jData?.judgments) return;
          Object.values(jData.judgments).forEach(pj => {
            if (!pj.model_scores) return;
            Object.entries(pj.model_scores).forEach(([mk, scores]) => {
              if (!modelScores[mk]) modelScores[mk] = { total: 0, count: 0 };
              const dims = ['correctness', 'completeness', 'efficiency', 'instruction_adherence', 'quality'];
              dims.forEach(d => {
                if (scores[d] != null) { modelScores[mk].total += scores[d]; modelScores[mk].count++; }
              });
            });
          });
        });

        Object.entries(modelScores).forEach(([mk, s]) => {
          const avg = s.count ? s.total / s.count : 0;
          if (avg > topModelScore) {
            topModelScore = avg;
            topModel = rawData.models?.[mk]?.label || mk;
          }
        });
      }

      return {
        runId,
        tier: rawData.tier || 'unknown',
        date: rawData.timestamp || new Date(0).toISOString(),
        model_count,
        prompt_count,
        total_cost: rawData.total_cost || 0,
        total_calls: rawData.total_calls || 0,
        has_judgments,
        judgment_count: judgmentFiles.length,
        total_categories: categories.size,
        top_model: topModel,
        top_model_score: topModelScore ? +topModelScore.toFixed(1) : null,
        models: rawData.models ? Object.entries(rawData.models).map(([k, m]) => ({ key: k, label: m.label || k })) : []
      };
    }).sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(runs);
  } catch (error) {
    console.error('Error in GET /api/runs:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/leaderboard - Aggregated model scores across all judged runs
app.get('/api/leaderboard', (req, res) => {
  try {
    const resultsDir = path.join(EVAL_DIR, 'results');
    if (!fs.existsSync(resultsDir)) return res.json([]);

    const runDirs = listDirs(resultsDir);
    const modelAgg = {}; // modelLabel -> { total, count, wins, runs }

    runDirs.forEach(runId => {
      const runDir = path.join(resultsDir, runId);
      const rawData = readJSON(path.join(runDir, 'raw_data.json'));
      const judgmentsDir = path.join(runDir, 'judgments');
      if (!rawData || !fs.existsSync(judgmentsDir)) return;

      const judgmentFiles = fs.readdirSync(judgmentsDir).filter(f => f.endsWith('.json'));
      if (judgmentFiles.length === 0) return;

      const modelLabels = {};
      if (rawData.models) {
        Object.entries(rawData.models).forEach(([k, m]) => { modelLabels[k] = m.label || k; });
      }

      judgmentFiles.forEach(jf => {
        const jData = readJSON(path.join(judgmentsDir, jf));
        if (!jData?.judgments) return;

        // Track wins per category
        const catWinCounts = {};

        Object.values(jData.judgments).forEach(pj => {
          if (!pj.model_scores) return;
          if (pj.winner) {
            catWinCounts[pj.winner] = (catWinCounts[pj.winner] || 0) + 1;
          }
          Object.entries(pj.model_scores).forEach(([mk, scores]) => {
            const label = modelLabels[mk] || mk;
            if (!modelAgg[label]) modelAgg[label] = { total: 0, count: 0, wins: 0, runs: new Set(), key: mk };
            const dims = ['correctness', 'completeness', 'efficiency', 'instruction_adherence', 'quality'];
            dims.forEach(d => {
              if (scores[d] != null) { modelAgg[label].total += scores[d]; modelAgg[label].count++; }
            });
            modelAgg[label].runs.add(runId);
          });
        });

        // Add wins
        Object.entries(catWinCounts).forEach(([mk, cnt]) => {
          const label = modelLabels[mk] || mk;
          if (modelAgg[label]) modelAgg[label].wins += cnt;
        });
      });
    });

    const leaderboard = Object.entries(modelAgg)
      .map(([label, data]) => ({
        label,
        key: data.key,
        avgScore: data.count ? +(data.total / data.count).toFixed(2) : 0,
        wins: data.wins,
        runCount: data.runs.size,
        evalCount: data.count
      }))
      .sort((a, b) => b.avgScore - a.avgScore);

    res.json(leaderboard);
  } catch (error) {
    console.error('Error in GET /api/leaderboard:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/runs/:runId
app.get('/api/runs/:runId', (req, res) => {
  try {
    const { runId } = req.params;
    const resultsDir = path.join(EVAL_DIR, 'results');
    const runDir = path.join(resultsDir, runId);

    if (!fs.existsSync(runDir)) {
      return res.status(404).json({ error: 'Run not found' });
    }

    const rawData = readJSON(path.join(runDir, 'raw_data.json'));

    const judgmentsDir = path.join(runDir, 'judgments');
    const judgments = {};

    if (fs.existsSync(judgmentsDir)) {
      const judgmentFiles = fs.readdirSync(judgmentsDir).filter(f => f.endsWith('.json'));
      judgmentFiles.forEach(file => {
        const category = file.replace('.json', '');
        judgments[category] = readJSON(path.join(judgmentsDir, file));
      });
    }

    res.json({ run_data: rawData, judgments });
  } catch (error) {
    console.error('Error in GET /api/runs/:runId:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/runs/:runId
app.delete('/api/runs/:runId', (req, res) => {
  try {
    const { runId } = req.params;
    const resultsDir = path.join(EVAL_DIR, 'results');
    const runDir = path.join(resultsDir, runId);

    if (!fs.existsSync(runDir)) {
      return res.status(404).json({ error: 'Run not found' });
    }

    fs.rmSync(runDir, { recursive: true, force: true });

    res.json({ success: true, deleted: runId });
  } catch (error) {
    console.error('Error in DELETE /api/runs/:runId:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Eval Execution Routes
// ============================================================================

// POST /api/eval/reset — force-reset stale eval state
app.post('/api/eval/reset', (req, res) => {
  try {
    // Kill running process if any
    if (currentEval.process && !currentEval.process.killed) {
      try { currentEval.process.kill('SIGTERM'); } catch (e) { /* ignore */ }
    }
    currentEval = {
      running: false, runId: null, process: null,
      progress: { current: 0, total: 0, current_model: '', current_prompt: '' },
      output: []
    };
    // Also clean up any stale status.json files
    const resultsDir = path.join(EVAL_DIR, 'results');
    const runDirs = listDirs(resultsDir);
    for (const runId of runDirs) {
      const statusPath = path.join(resultsDir, runId, 'status.json');
      const status = readJSON(statusPath);
      if (status && status.running === true) {
        status.running = false;
        status.error = 'Force reset by user';
        status.completed_at = new Date().toISOString();
        writeJSON(statusPath, status);
      }
    }
    res.json({ status: 'reset' });
  } catch (error) {
    console.error('Error in POST /api/eval/reset:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/eval/run
app.post('/api/eval/run', (req, res) => {
  try {
    // Check if process is actually still alive
    if (currentEval.running && currentEval.process) {
      // Check if process has already exited
      if (currentEval.process.exitCode !== null || currentEval.process.killed) {
        console.log('Detected stale eval state — process already exited. Resetting.');
        currentEval.running = false;
      }
    }

    if (currentEval.running) {
      return res.status(409).json({ error: 'Evaluation already running' });
    }

    const { tier, models = [], categories = [], execMode = 'sequential' } = req.body;

    if (!tier) {
      return res.status(400).json({ error: 'tier is required' });
    }

    const runId = generateRunId(tier);
    const resultsDir = path.join(EVAL_DIR, 'results');
    const configDir = path.join(EVAL_DIR, 'config');
    ensureDir(resultsDir);

    // Handle parallel execution mode
    if (execMode === 'parallel') {
      // Read config files
      const providersPath = path.join(configDir, 'providers.json');
      const modelsPath = path.join(configDir, 'models.json');
      const batteryPath = path.join(configDir, 'battery.json');
      const keysPath = path.join(configDir, 'keys.json');

      const providersData = readJSON(providersPath);
      const modelsData = readJSON(modelsPath);
      const batteryData = readJSON(batteryPath);
      const keysData = readJSON(keysPath);

      if (!providersData || !modelsData || !batteryData) {
        return res.status(400).json({ error: 'Missing required config files' });
      }

      // Build providers map
      const providers = providersData.providers || providersData || {};

      // Build models map
      const modelsConfig = modelsData.models || modelsData || {};

      // Determine which models to use
      let modelsList = models && models.length > 0 ? models : Object.keys(modelsConfig);

      // Filter by tier and categories to get prompt IDs
      let promptsList = [];
      const tierData = batteryData.tiers?.[tier];
      const batteryPrompts = batteryData.prompts || [];

      if (tierData && Array.isArray(tierData)) {
        // Tier contains prompt IDs (strings)
        promptsList = tierData;
      } else if (categories && categories.length > 0) {
        // Filter prompts by categories
        promptsList = batteryPrompts
          .filter(p => categories.includes(p.category))
          .map(p => p.id);
      } else {
        // Use all prompts
        promptsList = batteryPrompts.map(p => p.id);
      }

      if (promptsList.length === 0) {
        return res.status(400).json({ error: 'No prompts found for tier and categories' });
      }

      // Build prompts config map (by ID)
      const promptsConfig = {};
      batteryPrompts.forEach(p => {
        promptsConfig[p.id] = p;
      });

      // Load API keys
      let keysMap = {};
      if (keysData && keysData.keys) {
        keysMap = keysData.keys;
      }

      // Check for API key from X-API-Key header in public mode
      const publicMode = process.env.PUBLIC_MODE === 'true';
      if (publicMode && req.headers['x-api-key']) {
        const headerKey = req.headers['x-api-key'];
        // Try to determine which provider this key belongs to
        // For now, add it to all OpenRouter-like providers
        Object.values(providers).forEach(provider => {
          if (provider.api_key_env && !keysMap[provider.api_key_env]) {
            keysMap[provider.api_key_env] = headerKey;
          }
        });
      }

      // Set up state
      currentEval = {
        running: true,
        runId,
        process: null,
        progress: { current: 0, total: 0, current_model: '', current_prompt: '' },
        output: []
      };

      // Start parallel eval in background (don't await)
      runEvalParallel({
        runId,
        tier,
        models: modelsList,
        prompts: promptsList,
        providers,
        keys: keysMap,
        configDir,
        resultsDir,
        modelsConfig,
        promptsConfig,
        onProgress: (progressData) => {
          currentEval.progress = {
            current: progressData.current,
            total: progressData.total,
            current_model: progressData.currentModel,
            current_prompt: progressData.currentPrompt
          };
        }
      }).then(() => {
        currentEval.running = false;
        console.log(`Parallel eval completed: ${runId}`);
      }).catch(error => {
        currentEval.running = false;
        console.error(`Parallel eval failed: ${runId}`, error);
      });

      return res.json({ runId, status: 'started', mode: 'parallel' });
    }

    // Sequential mode (bash spawn) — existing logic
    const scriptPath = path.join(EVAL_DIR, 'scripts', 'run-eval.sh');

    if (!fs.existsSync(scriptPath)) {
      return res.status(400).json({ error: `Script not found: ${scriptPath}` });
    }

    const args = [scriptPath, tier];

    // Add models argument if provided
    if (models && models.length > 0) {
      args.push('--models', models.join(','));
    }

    // Add categories argument if provided
    if (categories && categories.length > 0) {
      args.push('--category', categories.join(','));
    }

    // Add config, results, and tests directories
    args.push('--config-dir', configDir);
    args.push('--results-dir', resultsDir);
    args.push('--tests-dir', path.join(EVAL_DIR, 'tests'));

    // Load API keys from keys.json into spawn env
    const keysPath = path.join(configDir, 'keys.json');
    const keysData = readJSON(keysPath);
    const extraEnv = {};
    if (keysData && keysData.keys) {
      Object.assign(extraEnv, keysData.keys);
    }

    // Check for API key from X-API-Key header in public mode
    const publicMode = process.env.PUBLIC_MODE === 'true';
    if (publicMode && req.headers['x-api-key']) {
      const headerKey = req.headers['x-api-key'];
      // Try to match with provider API key envs
      const providersPath = path.join(configDir, 'providers.json');
      const providersData = readJSON(providersPath);
      const providers = providersData?.providers || providersData || {};
      Object.values(providers).forEach(provider => {
        if (provider.api_key_env && !extraEnv[provider.api_key_env]) {
          extraEnv[provider.api_key_env] = headerKey;
        }
      });
    }

    const child = spawn('bash', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: EVAL_DIR,
      env: {
        ...process.env,
        ...extraEnv,
        RESULTS_DIR: resultsDir,
        CONFIG_DIR: configDir
      }
    });

    currentEval = {
      running: true,
      runId,
      process: child,
      progress: { current: 0, total: 0, current_model: '', current_prompt: '' },
      output: []
    };

    child.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          currentEval.output.push(line);

          // Parse PROGRESS lines: PROGRESS:3/12|ModelName|PromptName
          if (line.includes('PROGRESS:')) {
            try {
              const match = line.match(/PROGRESS:(\d+)\/(\d+)\|([^|]+)\|(.+)/);
              if (match) {
                currentEval.progress.current = parseInt(match[1]);
                currentEval.progress.total = parseInt(match[2]);
                currentEval.progress.current_model = match[3].trim();
                currentEval.progress.current_prompt = match[4].trim();
              }
            } catch (e) {
              // Silently ignore parse errors
            }
          }

          // Detect COMPLETE line
          if (line.includes('COMPLETE:')) {
            try {
              const match = line.match(/COMPLETE:(\S+)/);
              if (match) {
                currentEval.runId = match[1];
              }
            } catch (e) {
              // Silently ignore parse errors
            }
          }
        }
      });
    });

    child.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          currentEval.output.push(`[ERROR] ${line}`);
        }
      });
    });

    child.on('exit', (code) => {
      currentEval.running = false;
      console.log(`Eval process exited with code ${code}`);
    });

    res.json({ runId, status: 'started' });
  } catch (error) {
    console.error('Error in POST /api/eval/run:', error.message);
    currentEval.running = false;
    res.status(500).json({ error: error.message });
  }
});

// POST /api/eval/extend
app.post('/api/eval/extend', (req, res) => {
  try {
    // Check if process is actually still alive
    if (currentEval.running && currentEval.process) {
      // Check if process has already exited
      if (currentEval.process.exitCode !== null || currentEval.process.killed) {
        console.log('Detected stale eval state — process already exited. Resetting.');
        currentEval.running = false;
      }
    }

    if (currentEval.running) {
      return res.status(409).json({ error: 'An evaluation is already running' });
    }

    const { run_id, tier, categories, models, execMode = 'sequential' } = req.body;
    if (!run_id || !tier) {
      return res.status(400).json({ error: 'run_id and tier are required' });
    }

    // Verify run exists
    const runDir = path.join(EVAL_DIR, 'results', run_id);
    if (!fs.existsSync(runDir)) {
      return res.status(404).json({ error: 'Run not found' });
    }

    const configDir = path.join(EVAL_DIR, 'config');
    const resultsDir = path.join(EVAL_DIR, 'results');

    // Handle parallel execution mode for extend
    if (execMode === 'parallel') {
      // Read config files
      const providersPath = path.join(configDir, 'providers.json');
      const modelsPath = path.join(configDir, 'models.json');
      const batteryPath = path.join(configDir, 'battery.json');
      const keysPath = path.join(configDir, 'keys.json');

      const providersData = readJSON(providersPath);
      const modelsData = readJSON(modelsPath);
      const batteryData = readJSON(batteryPath);
      const keysData = readJSON(keysPath);

      if (!providersData || !modelsData || !batteryData) {
        return res.status(400).json({ error: 'Missing required config files' });
      }

      // Build providers map
      const providers = providersData.providers || providersData || {};

      // Build models map
      const modelsConfig = modelsData.models || modelsData || {};

      // Determine which models to use
      let modelsList = models && models.length > 0 ? models : Object.keys(modelsConfig);

      // Filter by tier and categories to get prompt IDs
      let promptsList = [];
      const tierData = batteryData.tiers?.[tier];
      const batteryPrompts = batteryData.prompts || [];

      if (tierData && Array.isArray(tierData)) {
        // Tier contains prompt IDs (strings)
        promptsList = tierData;
      } else if (categories && categories.length > 0) {
        // Filter prompts by categories
        promptsList = batteryPrompts
          .filter(p => categories.includes(p.category))
          .map(p => p.id);
      } else {
        // Use all prompts
        promptsList = batteryPrompts.map(p => p.id);
      }

      if (promptsList.length === 0) {
        return res.status(400).json({ error: 'No prompts found for tier and categories' });
      }

      // Build prompts config map (by ID)
      const promptsConfig = {};
      batteryPrompts.forEach(p => {
        promptsConfig[p.id] = p;
      });

      // Load API keys
      let keysMap = {};
      if (keysData && keysData.keys) {
        keysMap = keysData.keys;
      }

      // Check for API key from X-API-Key header in public mode
      const publicMode = process.env.PUBLIC_MODE === 'true';
      if (publicMode && req.headers['x-api-key']) {
        const headerKey = req.headers['x-api-key'];
        // Try to determine which provider this key belongs to
        Object.values(providers).forEach(provider => {
          if (provider.api_key_env && !keysMap[provider.api_key_env]) {
            keysMap[provider.api_key_env] = headerKey;
          }
        });
      }

      // Set up state
      currentEval = {
        running: true,
        runId: run_id,
        process: null,
        progress: { current: 0, total: 0, current_model: '', current_prompt: '' },
        output: []
      };

      // Start parallel eval in background (don't await)
      runEvalParallel({
        runId: run_id,
        tier,
        models: modelsList,
        prompts: promptsList,
        providers,
        keys: keysMap,
        configDir,
        resultsDir,
        modelsConfig,
        promptsConfig,
        onProgress: (progressData) => {
          currentEval.progress = {
            current: progressData.current,
            total: progressData.total,
            current_model: progressData.currentModel,
            current_prompt: progressData.currentPrompt
          };
        }
      }).then(() => {
        currentEval.running = false;
        console.log(`Parallel eval extend completed: ${run_id}`);
      }).catch(error => {
        currentEval.running = false;
        console.error(`Parallel eval extend failed: ${run_id}`, error);
      });

      return res.json({ runId: run_id, status: 'extending', mode: 'parallel' });
    }

    // Sequential mode (bash spawn) — existing logic
    const scriptPath = path.join(EVAL_DIR, 'scripts', 'run-eval.sh');
    const args = [scriptPath, tier, '--config-dir', configDir, '--results-dir', resultsDir, '--tests-dir', path.join(EVAL_DIR, 'tests'), '--run-id', run_id];

    if (models?.length > 0) args.push('--models', models.join(','));
    if (categories?.length > 0) args.push('--category', categories.join(','));

    // Load API keys from keys.json
    const keysPath = path.join(configDir, 'keys.json');
    const keysData = readJSON(keysPath);
    const extraEnv = {};
    if (keysData && keysData.keys) {
      Object.assign(extraEnv, keysData.keys);
    }

    // Check for API key from X-API-Key header in public mode
    const publicMode = process.env.PUBLIC_MODE === 'true';
    if (publicMode && req.headers['x-api-key']) {
      const headerKey = req.headers['x-api-key'];
      // Try to match with provider API key envs
      const providersPath = path.join(configDir, 'providers.json');
      const providersData = readJSON(providersPath);
      const providers = providersData?.providers || providersData || {};
      Object.values(providers).forEach(provider => {
        if (provider.api_key_env && !extraEnv[provider.api_key_env]) {
          extraEnv[provider.api_key_env] = headerKey;
        }
      });
    }

    currentEval = {
      running: true,
      runId: run_id,
      process: null,
      progress: { current: 0, total: 0, current_model: '', current_prompt: '' },
      output: []
    };

    const child = spawn('bash', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: EVAL_DIR,
      env: {
        ...process.env,
        ...extraEnv,
        RESULTS_DIR: resultsDir,
        CONFIG_DIR: configDir
      }
    });

    currentEval.process = child;

    child.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          currentEval.output.push(line);

          // Parse PROGRESS lines: PROGRESS:3/12|ModelName|PromptName
          if (line.includes('PROGRESS:')) {
            try {
              const match = line.match(/PROGRESS:(\d+)\/(\d+)\|([^|]+)\|(.+)/);
              if (match) {
                currentEval.progress.current = parseInt(match[1]);
                currentEval.progress.total = parseInt(match[2]);
                currentEval.progress.current_model = match[3].trim();
                currentEval.progress.current_prompt = match[4].trim();
              }
            } catch (e) {
              // Silently ignore parse errors
            }
          }

          // Detect COMPLETE line
          if (line.includes('COMPLETE:')) {
            try {
              const match = line.match(/COMPLETE:(\S+)/);
              if (match) {
                currentEval.runId = match[1];
              }
            } catch (e) {
              // Silently ignore parse errors
            }
          }
        }
      });
    });

    child.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          currentEval.output.push(`[ERROR] ${line}`);
        }
      });
    });

    child.on('exit', (code) => {
      currentEval.running = false;
      console.log(`Extend eval process exited with code ${code}`);
    });

    res.json({ runId: run_id, status: 'extending' });
  } catch (error) {
    console.error('Error in POST /api/eval/extend:', error.message);
    currentEval.running = false;
    res.status(500).json({ error: error.message });
  }
});

// GET /api/eval/status
app.get('/api/eval/status', (req, res) => {
  try {
    // Check if in-memory process is actually still alive
    if (currentEval.running && currentEval.process) {
      if (currentEval.process.exitCode !== null || currentEval.process.killed) {
        console.log('Eval status: detected exited process, resetting state');
        currentEval.running = false;
      }
    }

    // Return in-memory state if running
    if (currentEval.running) {
      return res.json({
        running: true,
        runId: currentEval.runId,
        progress: currentEval.progress,
        output_lines: currentEval.output.slice(-50)
      });
    }

    // Scan EVAL_DIR/results for any directory with status.json that has running:true
    const resultsDir = path.join(EVAL_DIR, 'results');
    const runDirs = listDirs(resultsDir);

    for (const runId of runDirs) {
      const statusPath = path.join(resultsDir, runId, 'status.json');
      const status = readJSON(statusPath);

      if (status && status.running === true) {
        // Check if status.json is stale (no update in 5 minutes = likely crashed)
        const statusStat = fs.statSync(statusPath);
        const ageMs = Date.now() - statusStat.mtimeMs;
        if (ageMs > 5 * 60 * 1000) {
          // Mark as crashed
          status.running = false;
          status.error = 'Process appears to have crashed (no update in 5+ minutes)';
          status.completed_at = new Date().toISOString();
          writeJSON(statusPath, status);
          continue;
        }

        return res.json({
          running: true,
          runId,
          progress: {
            current: status.current || 0,
            total: status.total || 0,
            current_model: status.current_model || '',
            current_prompt: status.current_prompt || ''
          },
          output_lines: status.output_lines || []
        });
      }
    }

    res.json({ running: false });
  } catch (error) {
    console.error('Error in GET /api/eval/status:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Judgment Routes
// ============================================================================

// POST /api/runs/:runId/judgments/:category
app.post('/api/runs/:runId/judgments/:category', (req, res) => {
  try {
    const { runId, category } = req.params;
    const resultsDir = path.join(EVAL_DIR, 'results');
    const judgmentsDir = path.join(resultsDir, runId, 'judgments');
    const rawData = readJSON(path.join(resultsDir, runId, 'raw_data.json'));

    ensureDir(judgmentsDir);

    let data = { ...req.body };

    // Build label-to-key mapping for fuzzy matching
    const labelToKey = {};
    if (rawData?.models) {
      Object.entries(rawData.models).forEach(([key, m]) => {
        labelToKey[(m.label || key).toLowerCase()] = key;
        labelToKey[key.toLowerCase()] = key;
      });
    }

    // Normalize: convert array-format judgments to object-format
    if (Array.isArray(data.judgments)) {
      const converted = {};
      data.judgments.forEach(item => {
        const pid = item.prompt_id;
        if (!pid) return;
        const entry = { ...item };
        delete entry.prompt_id;
        // Normalize model_scores keys
        if (entry.model_scores) {
          entry.model_scores = normalizeModelKeys(entry.model_scores, labelToKey);
        }
        converted[pid] = entry;
      });
      data.judgments = converted;
    } else if (data.judgments && typeof data.judgments === 'object') {
      // Object format — still normalize model_scores keys
      Object.keys(data.judgments).forEach(pid => {
        const pj = data.judgments[pid];
        if (pj?.model_scores) {
          pj.model_scores = normalizeModelKeys(pj.model_scores, labelToKey);
        }
        // Normalize winner key too
        if (pj?.winner && labelToKey[pj.winner.toLowerCase()]) {
          pj.winner = labelToKey[pj.winner.toLowerCase()];
        }
      });
    }

    // Normalize category_ranking keys
    if (Array.isArray(data.category_ranking)) {
      data.category_ranking = data.category_ranking.map(k => labelToKey[k.toLowerCase()] || k);
    }

    const judgmentPath = path.join(judgmentsDir, `${category}.json`);
    const success = writeJSON(judgmentPath, data);

    if (!success) {
      return res.status(500).json({ error: 'Failed to write judgment' });
    }

    res.json({ success: true, runId, category, data });
  } catch (error) {
    console.error('Error in POST /api/runs/:runId/judgments/:category:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/runs/:runId/judge-prompt/:category
app.get('/api/runs/:runId/judge-prompt/:category', (req, res) => {
  try {
    const { runId, category } = req.params;
    const resultsDir = path.join(EVAL_DIR, 'results');
    const rawDataPath = path.join(resultsDir, runId, 'raw_data.json');
    const modelsPath = path.join(EVAL_DIR, 'config', 'models.json');

    const rawData = readJSON(rawDataPath);
    const modelsConfig = readJSON(modelsPath) || { models: {} };

    if (!rawData) {
      return res.status(404).json({ error: 'Run data not found' });
    }

    // Filter prompts by category
    const categoryPrompts = [];
    if (rawData.prompts) {
      Object.entries(rawData.prompts).forEach(([promptId, promptData]) => {
        if (promptData.category === category) {
          categoryPrompts.push({ id: promptId, ...promptData });
        }
      });
    }

    if (categoryPrompts.length === 0) {
      return res.status(404).json({ error: 'No prompts found for this category' });
    }

    const tier = rawData.tier || 'unknown';
    const timestamp = rawData.timestamp || new Date().toISOString();

    // Only include models that have actual responses for this category
    const respondedModelKeys = new Set();
    categoryPrompts.forEach(prompt => {
      if (rawData.results && rawData.results[prompt.id]) {
        Object.entries(rawData.results[prompt.id]).forEach(([modelKey, result]) => {
          if (result.response && result.response.trim() !== '' && !result.error) {
            respondedModelKeys.add(modelKey);
          }
        });
      }
    });
    const modelKeysList = Array.from(respondedModelKeys);
    const modelCount = modelKeysList.length;
    const modelKeysRef = modelKeysList.map(k => {
      const label = rawData.models?.[k]?.label || k;
      return `- "${k}" (${label})`;
    }).join('\n');

    let judgePrompt = `# AI MODEL EVALUATION — JUDGE INSTRUCTIONS

You are an expert AI model evaluator. Your task is to analyze model responses and produce a structured JSON judgment.

## CRITICAL INSTRUCTIONS
1. Return ONLY valid JSON — no markdown fences, no explanations, no questions
2. Do NOT ask clarifying questions — judge based on what is provided
3. Only score the models listed below — these are the ONLY models that participated
4. If a model's response is empty or missing, score it 0 across all dimensions
5. Use the EXACT model key strings provided (not labels or display names)

## Evaluation Context
- Run ID: ${runId}
- Category: ${category}
- Tier: ${tier}
- Date: ${timestamp}
- Models evaluated: ${modelCount}

## Models to Score (use these EXACT keys in your JSON)
${modelKeysRef}

## Scoring Rubric (rate each 1-10)
- correctness: Did it solve the task accurately?
- completeness: Did it cover all aspects?
- efficiency: Was the approach optimal?
- instruction_adherence: Did it follow all constraints?
- quality: Overall code/text quality

## EXACT Output Format Required
Return this JSON structure. "judgments" is an OBJECT keyed by prompt_id, NOT an array.
"model_scores" is an OBJECT keyed by the exact model keys listed above.

{
  "eval_id": "${runId}",
  "category": "${category}",
  "judged_at": "<ISO timestamp>",
  "judgments": {
    "<prompt_id>": {
      "model_scores": {
${modelKeysList.map(k => `        "${k}": { "correctness": <1-10>, "completeness": <1-10>, "efficiency": <1-10>, "instruction_adherence": <1-10>, "quality": <1-10>, "notes": "<brief reasoning>" }`).join(',\n')}
      },
      "winner": "<model_key with highest overall score>",
      "reasoning": "<1-2 sentences explaining why>"
    }
  },
  "category_ranking": [${modelKeysList.map(k => `"${k}"`).join(', ')}],
  "summary": "<2-3 sentence overall analysis>"
}

## RESPONSES TO EVALUATE:
`;

    // Add each prompt with its model responses
    categoryPrompts.forEach((prompt) => {
      judgePrompt += `\n## Prompt: ${prompt.id} - ${prompt.name || 'Unnamed'}
> ${prompt.prompt || 'No prompt text'}
> Expected: ${(prompt.expected_traits || []).join(', ') || 'N/A'}

`;

      // Add results for each model
      if (rawData.results && rawData.results[prompt.id]) {
        Object.entries(rawData.results[prompt.id]).forEach(([modelKey, result]) => {
          // Skip models not in the responded set
          if (!respondedModelKeys.has(modelKey)) return;

          const modelLabel = (rawData.models && rawData.models[modelKey]) ? rawData.models[modelKey].label : modelKey;
          const modelRole = (rawData.models && rawData.models[modelKey]) ? rawData.models[modelKey].role : '';

          judgePrompt += `### Response: ${modelLabel} ${modelRole ? `(${modelRole})` : ''}
Tokens: ${result.prompt_tokens || 0}->${result.completion_tokens || 0} | Latency: ${result.latency_ms || 0}ms | Cost: $${(result.cost || 0).toFixed(6)} | Auto-test: ${result.test_result || 'N/A'}

\`\`\`
${result.response || 'No response'}
\`\`\`

`;
        });
      }
    });

    res.json({ prompt: judgePrompt });
  } catch (error) {
    console.error('Error in GET /api/runs/:runId/judge-prompt/:category:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// OpenRouter Model Proxy
// ============================================================================

// GET /api/openrouter/models
app.get('/api/openrouter/models', async (req, res) => {
  try {
    const now = Date.now();

    // Check cache
    if (openRouterCache.models && openRouterCache.timestamp &&
        (now - openRouterCache.timestamp) < openRouterCache.CACHE_DURATION) {
      return res.json(openRouterCache.models);
    }

    // Fetch from OpenRouter
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: 'OPENROUTER_API_KEY not configured' });
    }

    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.text();
      return res.status(response.status).json({
        error: `OpenRouter API error: ${response.status}`,
        details: errorData
      });
    }

    const data = await response.json();

    // Transform response
    let models = [];
    if (data.data && Array.isArray(data.data)) {
      models = data.data.map(model => ({
        id: model.id,
        name: model.name,
        context_length: model.context_length,
        pricing: {
          prompt: model.pricing?.prompt || 0,
          completion: model.pricing?.completion || 0
        },
        description: model.description || ''
      }));
    }

    // Cache the result
    openRouterCache.models = models;
    openRouterCache.timestamp = now;

    res.json(models);
  } catch (error) {
    console.error('Error in GET /api/openrouter/models:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Auto-Judge Endpoint
// ============================================================================

// POST /api/runs/:runId/auto-judge/:category
app.post('/api/runs/:runId/auto-judge/:category', async (req, res) => {
  try {
    const { runId, category } = req.params;
    const { judge_model_key, judge_model, compare_to_reference, custom_instructions } = req.body;
    const modelKey = judge_model_key || judge_model;

    if (!modelKey) {
      return res.status(400).json({ error: 'judge_model_key is required' });
    }

    if (currentJudge.running) {
      return res.status(409).json({ error: 'Judging already in progress' });
    }

    // Mark as started
    currentJudge = {
      running: true,
      runId,
      category,
      current: 0,
      total: 0,
      error: null,
      completed: false
    };

    // Start async judging process
    performAutoJudge(runId, category, modelKey, compare_to_reference || false, custom_instructions || '');

    res.json({ status: 'started', category });
  } catch (error) {
    console.error('Error in POST /api/runs/:runId/auto-judge/:category:', error.message);
    currentJudge.running = false;
    res.status(500).json({ error: error.message });
  }
});

async function performAutoJudge(runId, category, judge_model_key, compare_to_reference, custom_instructions) {
  try {
    const resultsDir = path.join(EVAL_DIR, 'results');
    const runDir = path.join(resultsDir, runId);
    const judgeStatusPath = path.join(runDir, 'judge_status.json');

    // Read required config files
    const rawData = readJSON(path.join(runDir, 'raw_data.json'));
    const modelsConfig = readJSON(path.join(EVAL_DIR, 'config', 'models.json')) || { models: {} };
    const providersConfig = readJSON(path.join(EVAL_DIR, 'config', 'providers.json')) || { providers: {} };
    const batteryConfig = readJSON(path.join(EVAL_DIR, 'config', 'battery.json')) || { categories: {} };

    if (!rawData) {
      throw new Error('Run data not found');
    }

    // Filter prompts by category
    const categoryPrompts = [];
    if (rawData.prompts) {
      Object.entries(rawData.prompts).forEach(([promptId, promptData]) => {
        if (promptData.category === category) {
          categoryPrompts.push({ id: promptId, ...promptData });
        }
      });
    }

    if (categoryPrompts.length === 0) {
      throw new Error('No prompts found for this category');
    }

    // Get judge model config
    const judgeModel = modelsConfig.models?.[judge_model_key];
    if (!judgeModel) {
      throw new Error(`Judge model not found: ${judge_model_key}`);
    }

    const judgeProvider = providersConfig.providers?.[judgeModel.provider];
    if (!judgeProvider) {
      throw new Error(`Judge provider not found: ${judgeModel.provider}`);
    }

    // Build list of model keys in this run
    const modelKeys = rawData.models ? Object.keys(rawData.models) : [];

    // Process each prompt
    const judgments = {
      eval_id: runId,
      category,
      judged_at: new Date().toISOString(),
      judge_model: judge_model_key,
      judge_model_label: judgeModel.label || judge_model_key,
      compare_to_reference: compare_to_reference,
      judgments: {},
      category_ranking: [],
      summary: ''
    };

    currentJudge.total = categoryPrompts.length;
    let overallScores = {};
    modelKeys.forEach(key => {
      overallScores[key] = { total: 0, count: 0 };
    });

    for (let i = 0; i < categoryPrompts.length; i++) {
      const prompt = categoryPrompts[i];
      currentJudge.current = i + 1;

      // Write progress
      writeJSON(judgeStatusPath, {
        judging: true,
        current: currentJudge.current,
        total: currentJudge.total,
        category
      });

      // Build judge request
      let judgeRequest = `You are an expert evaluator. Score these anonymous responses to the prompt below.
You must be objective and thorough. Models are labeled with letters to prevent bias.

## Prompt
${prompt.prompt || 'No prompt text'}

## Expected Traits
${(prompt.expected_traits || []).join(', ') || 'N/A'}
`;

      // Get reference response if needed
      let referenceResponse = null;
      if (compare_to_reference) {
        // Check if judge model already has results for this prompt in this run
        if (rawData.results?.[prompt.id]?.[judge_model_key]) {
          referenceResponse = rawData.results[prompt.id][judge_model_key].response;
        } else {
          // Try to find from other runs
          const otherRuns = listDirs(resultsDir);
          for (const otherRunId of otherRuns) {
            if (otherRunId === runId) continue;
            const otherData = readJSON(path.join(resultsDir, otherRunId, 'raw_data.json'));
            if (otherData?.results?.[prompt.id]?.[judge_model_key]) {
              referenceResponse = otherData.results[prompt.id][judge_model_key].response;
              break;
            }
          }
        }

        // If still no reference, query the judge model
        if (!referenceResponse) {
          referenceResponse = await queryJudgeModel(
            judgeProvider.base_url,
            judgeModel.model_id,
            `${prompt.prompt}\n\nProvide a thorough and objective response to this prompt.`,
            judgeProvider.api_key_env
          );
        }

        judgeRequest += `

## Reference Response (your own analysis)
${referenceResponse}`;
      }

      if (custom_instructions) {
        judgeRequest += `

## Additional Evaluation Rules
${custom_instructions}`;
      }

      // Build model responses section
      judgeRequest += '\n\n## Responses to Evaluate\n';
      const modelsList = [];
      modelKeys.forEach((modelKey, idx) => {
        const letter = String.fromCharCode(65 + idx); // A, B, C...
        const modelData = rawData.models?.[modelKey];
        const result = rawData.results?.[prompt.id]?.[modelKey];

        if (result) {
          judgeRequest += `\n### Response ${letter}
${result.response || 'No response'}
Tokens: ${result.prompt_tokens || 0}→${result.completion_tokens || 0} | Latency: ${result.latency_ms || 0}ms

`;
          modelsList.push({ letter, modelKey });
        }
      });

      // Add scoring instructions
      judgeRequest += `\nScore each response 1-10 on: correctness, completeness, efficiency, instruction_adherence, quality.`;
      if (compare_to_reference) {
        judgeRequest += ` Also score similarity_to_reference (how close the approach/solution is to your reference).`;
      }

      judgeRequest += `

Return ONLY valid JSON (no markdown, no preamble):
{
  "scores": {
    "Response A": {"correctness": 8, "completeness": 7, "efficiency": 8, "instruction_adherence": 9, "quality": 8${compare_to_reference ? ', "similarity_to_reference": 7' : ''}, "notes": "brief reasoning"},
    "Response B": {"correctness": 6, ...}
  },
  "winner": "Response A",
  "reasoning": "2-3 sentence explanation"
}`;

      // Send request to judge model
      const judgeResponse = await queryJudgeModel(
        judgeProvider.base_url,
        judgeModel.model_id,
        judgeRequest,
        judgeProvider.api_key_env
      );

      // Parse response
      let scoreData = null;
      scoreData = extractJSON(judgeResponse);
      if (!scoreData) {
        console.error(`Failed to parse judge response for prompt ${prompt.id}. Raw response:`, judgeResponse.substring(0, 200));
        continue;
      }

      // Map letter labels back to model keys
      const promptJudgments = {
        model_scores: {},
        winner: null,
        reasoning: scoreData.reasoning || ''
      };

      if (scoreData.scores) {
        modelsList.forEach(({ letter, modelKey }) => {
          const responseKey = `Response ${letter}`;
          if (scoreData.scores[responseKey]) {
            promptJudgments.model_scores[modelKey] = scoreData.scores[responseKey];

            // Track overall scores
            const scores = scoreData.scores[responseKey];
            let total = scores.correctness + scores.completeness + scores.efficiency + scores.instruction_adherence + scores.quality;
            overallScores[modelKey].total += total;
            overallScores[modelKey].count += 5;
          }
        });
      }

      // Map winner
      if (scoreData.winner) {
        const winnerLetter = scoreData.winner.replace('Response ', '');
        const winnerModel = modelsList.find(m => m.letter === winnerLetter);
        if (winnerModel) {
          promptJudgments.winner = winnerModel.modelKey;
        }
      }

      judgments.judgments[prompt.id] = promptJudgments;
    }

    // Calculate category ranking
    const ranking = Object.entries(overallScores)
      .filter(([, scores]) => scores.count > 0)
      .map(([modelKey, scores]) => ({
        modelKey,
        avgScore: scores.total / scores.count
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .map(item => item.modelKey);

    judgments.category_ranking = ranking;
    judgments.summary = `Evaluated ${categoryPrompts.length} prompts in category "${category}". ${ranking[0] ? `Best overall: ${modelsConfig.models?.[ranking[0]]?.label || ranking[0]}` : 'Unable to determine ranking.'} Judge model: ${judgeModel.label || judge_model_key}.`;

    // Save judgments
    const judgmentsDir = path.join(runDir, 'judgments');
    ensureDir(judgmentsDir);
    writeJSON(path.join(judgmentsDir, `${category}.json`), judgments);

    // Clear judge status
    writeJSON(judgeStatusPath, {
      judging: false,
      current: currentJudge.total,
      total: currentJudge.total,
      category,
      completed: true
    });

    currentJudge.running = false;
    currentJudge.completed = true;
    currentJudge.error = null;
    console.log(`Auto-judging completed for run ${runId}, category ${category}`);
  } catch (error) {
    console.error('Error in performAutoJudge:', error.message);
    currentJudge.running = false;
    currentJudge.completed = false;
    currentJudge.error = error.message;
    const runDir = path.join(EVAL_DIR, 'results', runId);
    writeJSON(path.join(runDir, 'judge_status.json'), {
      judging: false,
      error: error.message
    });
  }
}

async function queryJudgeModel(baseUrl, modelId, prompt, apiKeyEnv) {
  const apiKey = apiKeyEnv ? process.env[apiKeyEnv] : '';

  const headers = {
    'Content-Type': 'application/json'
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: 'user', content: prompt }],
      max_completion_tokens: 4096
    })
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Judge model API error: ${response.status} - ${errorData}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// POST /api/generate-prompts — generates prompts but does NOT save them
app.post('/api/generate-prompts', async (req, res) => {
  try {
    const { model, count = 3, description, categories } = req.body;

    // Validate required fields
    if (!model) {
      return res.status(400).json({ error: 'Model is required' });
    }
    if (!description) {
      return res.status(400).json({ error: 'Description is required' });
    }

    const configDir = path.join(EVAL_DIR, 'config');
    const modelsPath = path.join(configDir, 'models.json');
    const providersPath = path.join(configDir, 'providers.json');

    // Look up model to get provider key
    const modelsRaw = readJSON(modelsPath);
    const modelsMap = modelsRaw?.models || modelsRaw || {};
    if (!modelsMap[model]) {
      return res.status(400).json({ error: `Model "${model}" not found in configuration` });
    }

    const modelConfig = modelsMap[model];
    const provider = modelConfig.provider;
    if (!provider) {
      return res.status(400).json({ error: `Model "${model}" has no provider configured` });
    }

    // Look up provider to get base_url and api_key_env
    const providersRaw = readJSON(providersPath);
    const providersMap = providersRaw?.providers || providersRaw || {};
    if (!providersMap[provider]) {
      return res.status(400).json({ error: `Provider "${provider}" not found in configuration` });
    }

    const providerConfig = providersMap[provider];
    const baseUrl = providerConfig.base_url;
    const apiKeyEnv = providerConfig.api_key_env;

    if (!baseUrl) {
      return res.status(400).json({ error: `Provider "${provider}" has no base_url configured` });
    }

    // Build prompt for the model
    const categoryList = (categories && categories.length > 0) ? categories : ['general'];
    const totalPrompts = count * categoryList.length;

    const systemPrompt = `Generate test prompts for evaluating AI language models.

Context: ${description}

Generate exactly ${count} prompt(s) for EACH of these categories: ${categoryList.join(', ')}
That means ${totalPrompts} prompts total.

Return a JSON array where each element has:
- "id": string starting with "custom-" followed by a zero-padded number (e.g. "custom-01", "custom-02")
- "name": short descriptive name for the prompt
- "category": must be one of: ${categoryList.join(', ')}
- "prompt": the full test prompt text that will be sent to models being evaluated
- "expected_traits": array of 2-4 trait strings describing what a good response should have

Make prompts diverse, challenging, and representative of real-world tasks. Each prompt should test a distinct capability.

IMPORTANT: Return ONLY a valid JSON array. No markdown, no code fences, no explanation. Just the raw JSON array starting with [ and ending with ].`;

    // Call the model to generate prompts
    const modelId = modelConfig.model_id || model;
    let apiKey = apiKeyEnv ? process.env[apiKeyEnv] : '';

    // In public mode, also accept API key from X-API-Key header
    const publicMode = process.env.PUBLIC_MODE === 'true';
    if (publicMode && !apiKey && req.headers['x-api-key']) {
      apiKey = req.headers['x-api-key'];
    }

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    console.log(`[generate-prompts] Starting generation: model=${modelId}, provider=${provider}, count=${count}`);
    console.log(`[generate-prompts] Calling ${baseUrl}/chat/completions...`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: systemPrompt }],
        max_completion_tokens: 8192
      })
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Model API error: ${response.status} - ${errorData}`);
    }

    console.log(`[generate-prompts] Response received: status=${response.status}`);

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content || '';

    // Extract and parse JSON from response
    let parsedPrompts = extractJSON(responseText);

    console.log(`[generate-prompts] Parsed ${parsedPrompts?.length || 0} prompts successfully`);

    if (!parsedPrompts) {
      return res.status(500).json({
        error: 'Failed to parse generated prompts as JSON',
        rawResponse: responseText
      });
    }

    // Ensure we have an array
    if (!Array.isArray(parsedPrompts)) {
      return res.status(500).json({
        error: 'Generated prompts are not a JSON array',
        rawResponse: responseText
      });
    }

    // Load battery to access valid category IDs
    const batteryPath = path.join(EVAL_DIR, 'config', 'battery.json');
    const battery = readJSON(batteryPath) || { categories: {} };
    const batteryCategories = battery.categories || {};

    // Auto-fix and validate prompts, normalizing categories to battery.json IDs
    parsedPrompts = parsedPrompts.map((prompt, i) => {
      // Normalize the category to a valid battery.json ID
      let normalizedCategory = normalizeCategoryToBatteryId(prompt.category, batteryCategories);
      if (!normalizedCategory) {
        // If normalization fails, log a warning but use the AI-provided category
        console.warn(`[generate-prompts] Could not normalize category "${prompt.category}" - using as-is`);
        normalizedCategory = prompt.category || 'general';
      }

      return {
        id: prompt.id || `custom-${String(i + 1).padStart(2, '0')}`,
        name: prompt.name || `Generated Prompt ${i + 1}`,
        category: normalizedCategory,
        prompt: prompt.prompt || '',
        expected_traits: Array.isArray(prompt.expected_traits) ? prompt.expected_traits :
          (typeof prompt.expected_traits === 'string' ? prompt.expected_traits.split(',').map(t => t.trim()) : ['accuracy', 'completeness'])
      };
    });

    // Remove any prompts that have no actual prompt text
    parsedPrompts = parsedPrompts.filter(p => p.prompt && p.prompt.trim().length > 0);

    if (parsedPrompts.length === 0) {
      return res.status(500).json({ error: 'No valid prompts could be extracted from model response', rawResponse: responseText });
    }

    // Return prompts for preview (don't save)
    res.json({ success: true, prompts: parsedPrompts, count: parsedPrompts.length });
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('[generate-prompts] Error: Request timeout');
      return res.status(504).json({ error: 'Model took too long to respond (120s timeout). Try a faster model or fewer prompts.' });
    }
    console.error('[generate-prompts] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/generate-prompts/save — saves previewed prompts to battery
app.post('/api/generate-prompts/save', (req, res) => {
  try {
    const { prompts } = req.body;
    if (!Array.isArray(prompts) || prompts.length === 0) {
      return res.status(400).json({ error: 'Prompts array is required' });
    }
    const batteryPath = path.join(EVAL_DIR, 'config', 'battery.json');
    let battery = readJSON(batteryPath) || { categories: {}, tiers: {}, prompts: [] };
    if (!battery.tiers) battery.tiers = {};
    if (!battery.tiers.manual) battery.tiers.manual = [];

    const batteryCategories = battery.categories || {};

    // Validate and normalize categories before saving
    const validatedPrompts = prompts.map(prompt => {
      const normalizedCategory = normalizeCategoryToBatteryId(prompt.category, batteryCategories);
      if (!normalizedCategory) {
        console.warn(`[generate-prompts/save] Could not normalize category "${prompt.category}" for prompt "${prompt.name}"`);
        // Still allow save but log the issue
      }
      return {
        ...prompt,
        category: normalizedCategory || prompt.category
      };
    });

    // Add full prompt objects to prompts array (deduplicate by id)
    const existingIds = new Set((battery.prompts || []).map(p => p.id));
    const newPrompts = validatedPrompts.filter(p => !existingIds.has(p.id));
    if (Array.isArray(battery.prompts)) {
      battery.prompts = battery.prompts.concat(newPrompts);
    } else {
      battery.prompts = newPrompts;
    }
    // tiers.manual stores ONLY ID strings (not full objects)
    const existingManualIds = new Set(battery.tiers.manual.filter(id => typeof id === 'string'));
    newPrompts.forEach(p => existingManualIds.add(p.id));
    // Also add any validated prompts that already existed (in case they were missing from manual tier)
    validatedPrompts.forEach(p => existingManualIds.add(p.id));
    battery.tiers.manual = [...existingManualIds];
    const success = writeJSON(batteryPath, battery);
    if (!success) return res.status(500).json({ error: 'Failed to save' });
    res.json({ success: true, count: validatedPrompts.length });
  } catch (error) {
    console.error('Error in POST /api/generate-prompts/save:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/generate-prompts/update — update a single manual prompt by id
app.put('/api/generate-prompts/update', (req, res) => {
  try {
    const { prompt } = req.body; // the updated prompt object with id
    if (!prompt || !prompt.id) {
      return res.status(400).json({ error: 'Prompt with id is required' });
    }
    const batteryPath = path.join(EVAL_DIR, 'config', 'battery.json');
    let battery = readJSON(batteryPath) || { categories: {}, tiers: {}, prompts: [] };
    // tiers.manual only stores ID strings — no update needed there
    // Ensure the ID is in tiers.manual though
    if (battery.tiers?.manual && !battery.tiers.manual.includes(prompt.id)) {
      battery.tiers.manual.push(prompt.id);
    }
    // Update the full prompt object in prompts array
    if (Array.isArray(battery.prompts)) {
      battery.prompts = battery.prompts.map(p => p.id === prompt.id ? { ...p, ...prompt } : p);
    }
    writeJSON(batteryPath, battery);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating prompt:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/generate-prompts/:id — delete a manual prompt by id
app.delete('/api/generate-prompts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const batteryPath = path.join(EVAL_DIR, 'config', 'battery.json');
    let battery = readJSON(batteryPath) || { categories: {}, tiers: {}, prompts: [] };
    // tiers.manual stores ID strings — filter by string comparison
    if (battery.tiers?.manual) {
      battery.tiers.manual = battery.tiers.manual.filter(pid => {
        // Handle both string IDs (correct) and legacy objects (cleanup)
        if (typeof pid === 'string') return pid !== id;
        if (pid && pid.id) return pid.id !== id;
        return true;
      });
    }
    if (Array.isArray(battery.prompts)) {
      battery.prompts = battery.prompts.filter(p => p.id !== id);
    }
    writeJSON(batteryPath, battery);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting prompt:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/judge/status
app.get('/api/judge/status', (req, res) => {
  try {
    if (currentJudge.running) {
      return res.json({
        running: true,
        runId: currentJudge.runId,
        category: currentJudge.category,
        current: currentJudge.current,
        total: currentJudge.total
      });
    }

    // If judge just finished (success or error), return that info
    if (currentJudge.completed || currentJudge.error) {
      const result = {
        running: false,
        completed: currentJudge.completed || false,
        error: currentJudge.error || null,
        runId: currentJudge.runId,
        category: currentJudge.category
      };
      return res.json(result);
    }

    // Scan for judge_status.json files
    const resultsDir = path.join(EVAL_DIR, 'results');
    const runDirs = listDirs(resultsDir);

    for (const runId of runDirs) {
      const statusPath = path.join(resultsDir, runId, 'judge_status.json');
      const status = readJSON(statusPath);

      if (status && status.judging === true) {
        return res.json({
          running: true,
          runId,
          category: status.category,
          current: status.current || 0,
          total: status.total || 0
        });
      }

      // Check for completed or errored status on disk
      if (status && status.error) {
        return res.json({
          running: false,
          completed: false,
          error: status.error
        });
      }
    }

    res.json({ running: false });
  } catch (error) {
    console.error('Error in GET /api/judge/status:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Static File Serving (Production)
// ============================================================================

const distDir = path.join(__dirname, '..', 'dist');
const distExists = fs.existsSync(distDir);

if (NODE_ENV === 'production' || distExists) {
  app.use(express.static(distDir));

  // SPA fallback: serve index.html for non-API routes
  app.get('*', (req, res) => {
    const indexPath = path.join(distDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });
}

// ============================================================================
// Error Handling & Server Startup
// ============================================================================

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message });
});

// Load API keys on startup
loadKeysOnStartup();

// Migrate battery.json: fix tiers.manual to store IDs not objects, and deduplicate
(function migrateBattery() {
  try {
    const batteryPath = path.join(EVAL_DIR, 'config', 'battery.json');
    const battery = readJSON(batteryPath);
    if (!battery || !battery.tiers?.manual) return;

    let changed = false;
    const manual = battery.tiers.manual;

    // Check if tiers.manual has objects instead of strings
    const hasObjects = manual.some(item => typeof item === 'object' && item !== null);
    if (hasObjects) {
      console.log('[migrate] Fixing tiers.manual: converting objects to ID strings');
      const idSet = new Set();
      manual.forEach(item => {
        if (typeof item === 'string') {
          idSet.add(item);
        } else if (item && item.id) {
          idSet.add(item.id);
          // Ensure the full object exists in prompts array
          if (!battery.prompts.some(p => p.id === item.id)) {
            battery.prompts.push(item);
          }
        }
      });
      battery.tiers.manual = [...idSet];
      changed = true;
    }

    // Deduplicate prompts array by ID
    const seen = new Set();
    const before = battery.prompts.length;
    battery.prompts = battery.prompts.filter(p => {
      if (!p.id || seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
    if (battery.prompts.length !== before) {
      console.log(`[migrate] Deduplicated prompts: ${before} -> ${battery.prompts.length}`);
      changed = true;
    }

    // Deduplicate tiers.manual
    const manualBefore = battery.tiers.manual.length;
    battery.tiers.manual = [...new Set(battery.tiers.manual)];
    if (battery.tiers.manual.length !== manualBefore) {
      console.log(`[migrate] Deduplicated tiers.manual: ${manualBefore} -> ${battery.tiers.manual.length}`);
      changed = true;
    }

    if (changed) {
      writeJSON(batteryPath, battery);
      console.log('[migrate] battery.json migrated successfully');
    }
  } catch (e) {
    console.error('[migrate] Battery migration error:', e.message);
  }
})();

app.listen(PORT, () => {
  console.log('\n=== ModelRank Backend ===');
  console.log(`Server running on port ${PORT}`);
  console.log(`Node environment: ${NODE_ENV}`);
  console.log(`Eval data directory: ${EVAL_DIR}`);
  console.log(`Static files (dist/): ${distExists ? 'found' : 'not found'}`);
  console.log(`API routes available at http://localhost:${PORT}/api`);
  if (distExists) {
    console.log(`Frontend available at http://localhost:${PORT}`);
  }
  console.log('\n');
});

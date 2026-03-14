import fs from 'fs';
import path from 'path';

const PREFIX = '[eval-parallel]';

/**
 * Semaphore/concurrency limiter for parallel execution
 */
class Semaphore {
  constructor(max) {
    this.max = max;
    this.current = 0;
    this.queue = [];
  }

  async acquire() {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    return new Promise(resolve => {
      this.queue.push(resolve);
    });
  }

  release() {
    this.current--;
    const resolve = this.queue.shift();
    if (resolve) {
      this.current++;
      resolve();
    }
  }
}

/**
 * Fetch token stats from OpenRouter /generation endpoint
 * Waits 2 seconds for stats to finalize, then retrieves them
 */
async function fetchTokenFallback(generationId, apiKey, logger = null) {
  if (!generationId || !apiKey) return { prompt_tokens: 0, completion_tokens: 0 };

  try {
    // Wait for OpenRouter to finalize stats
    await new Promise(r => setTimeout(r, 2000));

    const response = await fetch(
      `https://openrouter.ai/api/v1/generation?id=${generationId}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000)
      }
    );

    if (!response.ok) return { prompt_tokens: 0, completion_tokens: 0 };

    const data = await response.json();
    const pt = data.data?.tokens_prompt ?? data.data?.native_tokens_prompt ?? 0;
    const ct = data.data?.tokens_completion ?? data.data?.native_tokens_completion ?? 0;

    if (logger && (pt > 0 || ct > 0)) {
      logger(`Token fallback from /generation: in=${pt} out=${ct}`);
    }

    return { prompt_tokens: pt, completion_tokens: ct };
  } catch (error) {
    if (logger) logger(`Token fallback failed: ${error.message}`);
    return { prompt_tokens: 0, completion_tokens: 0 };
  }
}

/**
 * Execute a single eval task with retry logic for rate limits (429)
 */
async function executeTask(
  modelKey,
  modelConfig,
  promptId,
  promptData,
  provider,
  apiKey,
  configDir,
  resultsDir,
  logger = null
) {
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [5000, 15000, 30000]; // ms

  const baseUrl = provider.base_url;
  if (!baseUrl) {
    throw new Error(`No base_url for provider`);
  }

  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const requestBody = {
    model: modelConfig.model_id,
    messages: [{ role: 'user', content: promptData.prompt }],
    max_completion_tokens: 4096
  };

  const headers = {
    'Content-Type': 'application/json'
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  // Add custom headers from provider config
  if (provider.headers && typeof provider.headers === 'object') {
    Object.assign(headers, provider.headers);
  }

  let lastError = null;
  let responseBody = null;
  let httpCode = null;
  let latencyMs = 0;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const startTime = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 300s timeout

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      httpCode = response.status;

      // Read response body as text first — measure latency AFTER full body received
      const responseText = await response.text();
      latencyMs = Date.now() - startTime;
      try {
        responseBody = JSON.parse(responseText);
      } catch {
        responseBody = { error: { message: `Invalid JSON response: ${responseText.slice(0, 100)}` } };
      }

      if (logger) {
        logger(`Model=${modelKey} HTTP=${httpCode} Time=${latencyMs}ms RespSize=${responseText.length}bytes`);
      }

      // If rate limited, retry with backoff
      if (httpCode === 429 && attempt < MAX_RETRIES - 1) {
        const waitMs = RETRY_DELAYS[attempt];
        if (logger) {
          logger(`[RATE-LIMIT] Model=${modelKey} got HTTP 429, retry ${attempt + 1}/${MAX_RETRIES} in ${waitMs / 1000}s`);
        }
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      // Success or non-retryable error
      break;
    } catch (error) {
      lastError = error;
      latencyMs = Date.now() - (Date.now() - latencyMs);
      if (logger) {
        logger(`Fetch error on attempt ${attempt + 1}: ${error.message}`);
      }

      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
      }
    }
  }

  // Parse response
  let responseText = '';
  let promptTokens = 0;
  let completionTokens = 0;
  let cost = 0;
  let speedTps = 0;
  let error = null;

  if (httpCode === 200 && responseBody) {
    responseText = responseBody.choices?.[0]?.message?.content ?? '';
    promptTokens = responseBody.usage?.prompt_tokens ?? 0;
    completionTokens = responseBody.usage?.completion_tokens ?? 0;

    // Token fallback: if no usage data, fetch from OpenRouter /generation endpoint
    if (promptTokens === 0 && completionTokens === 0) {
      const generationId = responseBody.id || responseBody.x_generation_id;
      if (generationId && apiKey) {
        const fallback = await fetchTokenFallback(generationId, apiKey, logger);
        promptTokens = fallback.prompt_tokens;
        completionTokens = fallback.completion_tokens;
      }
    }

    if (logger) {
      logger(`Model=${modelKey} Tokens: in=${promptTokens} out=${completionTokens} ContentLen=${responseText.length}`);
    }

    // Calculate cost
    const costIn = parseFloat(modelConfig.cost_per_1m_in ?? 0);
    const costOut = parseFloat(modelConfig.cost_per_1m_out ?? 0);
    cost = (promptTokens * costIn / 1e6) + (completionTokens * costOut / 1e6);

    // Calculate speed (tokens per second)
    if (latencyMs > 0 && completionTokens > 0) {
      speedTps = completionTokens / (latencyMs / 1000);
    } else {
      speedTps = 0;
    }
  } else if (lastError) {
    error = lastError.message;
  } else {
    const errorMsg = responseBody?.error?.message ?? `HTTP ${httpCode}`;
    error = errorMsg;
    if (logger) {
      logger(`[ERROR] Model=${modelKey} HTTP=${httpCode} Error=${errorMsg}`);
    }
  }

  return {
    response: responseText,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    latency_ms: latencyMs,
    cost,
    speed_tps: speedTps,
    error
  };
}

/**
 * Initialize raw_data.json for a new run
 */
function initializeRawData(runId, tier, timestamp, models, prompts) {
  return {
    run_id: runId,
    tier,
    timestamp,
    models,
    prompts,
    results: {},
    total_cost: 0,
    total_calls: 0
  };
}

/**
 * Main parallel eval runner
 *
 * @param {Object} options
 * @param {string} options.runId - Unique run identifier
 * @param {string} options.tier - Tier name (quick/standard/deep)
 * @param {Array} options.models - Array of model keys to evaluate
 * @param {Array} options.prompts - Array of prompt IDs to use
 * @param {Object} options.providers - Provider config object
 * @param {Object} options.keys - API keys object { ENV_VAR_NAME: 'key_value', ... }
 * @param {string} options.configDir - Config directory path
 * @param {string} options.resultsDir - Results directory path
 * @param {Function} options.onProgress - Callback(current, total, currentModel, currentPrompt, completedCount)
 * @param {number} options.concurrency - Concurrent task limit (default 10)
 * @param {Object} options.modelsConfig - Full models config
 * @param {Object} options.promptsConfig - Full prompts config (keyed by ID)
 * @returns {Promise<Object>} { runId, totalCost, totalCalls, results }
 */
export async function runEvalParallel({
  runId,
  tier,
  models,
  prompts,
  providers,
  keys,
  configDir,
  resultsDir,
  onProgress,
  concurrency = 10,
  modelsConfig,
  promptsConfig
}) {
  const timestamp = new Date().toISOString();
  const outputDir = path.join(resultsDir, runId);
  const rawDataPath = path.join(outputDir, 'raw_data.json');
  const statusPath = path.join(outputDir, 'status.json');

  // Helper function for logging
  const log = (msg) => console.log(`${PREFIX} ${msg}`);

  log(`Starting parallel eval: runId=${runId} tier=${tier} concurrency=${concurrency}`);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Build task list: all (promptId, modelKey) pairs
  const tasks = [];
  for (const promptId of prompts) {
    for (const modelKey of models) {
      tasks.push({ promptId, modelKey });
    }
  }

  const totalTasks = tasks.length;
  log(`Total tasks: ${totalTasks} (${prompts.length} prompts × ${models.length} models)`);

  // Initialize raw_data.json (only models and prompts we're evaluating)
  const modelSubset = {};
  models.forEach(mk => {
    if (modelsConfig[mk]) {
      modelSubset[mk] = modelsConfig[mk];
    }
  });

  const promptSubset = {};
  prompts.forEach(pid => {
    if (promptsConfig[pid]) {
      promptSubset[pid] = promptsConfig[pid];
    }
  });

  let rawData = initializeRawData(runId, tier, timestamp, modelSubset, promptSubset);

  // Write initial raw_data.json
  fs.writeFileSync(rawDataPath, JSON.stringify(rawData, null, 2), 'utf-8');
  log(`Initialized raw_data.json at ${rawDataPath}`);

  // Write initial status
  const writeStatus = (current, currentModel, currentPrompt) => {
    const status = {
      running: true,
      run_id: runId,
      current,
      total: totalTasks,
      current_model: currentModel,
      current_prompt: currentPrompt,
      started_at: timestamp
    };
    fs.writeFileSync(statusPath, JSON.stringify(status, null, 2), 'utf-8');
  };

  writeStatus(0, '', '');

  // Concurrency limiter
  const semaphore = new Semaphore(concurrency);

  // Execute tasks in parallel with semaphore
  let completedCount = 0;
  const taskPromises = tasks.map(async (task) => {
    await semaphore.acquire();

    try {
      const { promptId, modelKey } = task;
      const modelConfig = modelsConfig[modelKey];
      const promptData = promptsConfig[promptId];

      if (!modelConfig || !promptData) {
        log(`WARN: Skipping ${modelKey}/${promptId} — missing config`);
        completedCount++;
        writeStatus(completedCount, modelKey, promptId);
        onProgress?.({ current: completedCount, total: totalTasks, currentModel: modelKey, currentPrompt: promptId, completedCount });
        return;
      }

      // Get provider and API key
      const providerKey = modelConfig.provider;
      const provider = providers[providerKey];

      if (!provider) {
        log(`WARN: Provider ${providerKey} not found for model ${modelKey}`);
        completedCount++;
        writeStatus(completedCount, modelKey, promptId);
        onProgress?.({ current: completedCount, total: totalTasks, currentModel: modelKey, currentPrompt: promptId, completedCount });
        return;
      }

      const apiKeyEnv = provider.api_key_env;
      const apiKey = apiKeyEnv ? keys[apiKeyEnv] : '';

      // Execute the task
      const result = await executeTask(
        modelKey,
        modelConfig,
        promptId,
        promptData,
        provider,
        apiKey,
        configDir,
        resultsDir,
        log
      );

      // Update raw_data.json
      if (!rawData.results[promptId]) {
        rawData.results[promptId] = {};
      }

      rawData.results[promptId][modelKey] = {
        response: result.response,
        prompt_tokens: result.prompt_tokens,
        completion_tokens: result.completion_tokens,
        latency_ms: result.latency_ms,
        cost: result.cost,
        speed_tps: result.speed_tps,
        error: result.error
      };

      rawData.total_calls++;
      rawData.total_cost += result.cost;

      fs.writeFileSync(rawDataPath, JSON.stringify(rawData, null, 2), 'utf-8');

      completedCount++;
      writeStatus(completedCount, modelKey, promptId);

      onProgress?.({
        current: completedCount,
        total: totalTasks,
        currentModel: modelKey,
        currentPrompt: promptId,
        completedCount
      });

      log(`Completed ${completedCount}/${totalTasks}: ${modelKey}/${promptId}`);
    } catch (error) {
      log(`FATAL: Task error: ${error.message}`);
      completedCount++;
      onProgress?.({
        current: completedCount,
        total: totalTasks,
        currentModel: '',
        currentPrompt: '',
        completedCount
      });
    } finally {
      semaphore.release();
    }
  });

  // Wait for all tasks
  await Promise.all(taskPromises);

  // Write final status
  const finalStatus = {
    running: false,
    run_id: runId,
    completed: true,
    current: totalTasks,
    total: totalTasks,
    started_at: timestamp,
    completed_at: new Date().toISOString()
  };
  fs.writeFileSync(statusPath, JSON.stringify(finalStatus, null, 2), 'utf-8');

  log(`Evaluation complete: totalCost=$${rawData.total_cost.toFixed(6)} totalCalls=${rawData.total_calls}`);

  return {
    runId,
    totalCost: rawData.total_cost,
    totalCalls: rawData.total_calls,
    results: rawData.results
  };
}

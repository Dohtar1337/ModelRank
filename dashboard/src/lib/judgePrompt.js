/**
 * Judge Prompt Generator
 * Generates structured prompts for LLMs to evaluate eval responses
 */

/**
 * Formats a cost value as a currency string with 6 decimal places
 * @param {number} cost - The cost value
 * @returns {string} Formatted cost string
 */
export function formatCost(cost) {
  if (cost === 0) return '$0.000000 (FREE)';
  return '$' + cost.toFixed(6);
}

/**
 * Generates a judge prompt for a specific category from a run
 * @param {Object} runData - The full run data from raw_data.json
 * @param {string} category - The category key to generate for
 * @param {Object} models - The models config object
 * @returns {string} The formatted judge prompt
 */
export function generateJudgePrompt(runData, category, models) {
  // Filter results to only include entries matching the given category
  const categoryResults = (runData.results || []).filter(
    (result) => result.category === category
  );

  if (categoryResults.length === 0) {
    return `No results found for category: ${category}`;
  }

  // Group results by prompt_id
  const resultsByPrompt = {};
  categoryResults.forEach((result) => {
    if (!resultsByPrompt[result.prompt_id]) {
      resultsByPrompt[result.prompt_id] = [];
    }
    resultsByPrompt[result.prompt_id].push(result);
  });

  // Get unique models in this category
  const uniqueModels = new Set(categoryResults.map((r) => r.model_key));

  // Get run metadata
  const runId = runData.run_id || 'unknown';
  const categoryName = category;
  const tier = runData.tier || 'unknown';
  const timestamp = runData.timestamp || new Date().toISOString();

  // Build the judge prompt
  let prompt = `You are an expert AI model evaluator. Analyze the following eval responses and return ONLY valid JSON (no markdown fences, no preamble).

## Evaluation Context
- Run ID: ${runId}
- Category: ${categoryName}
- Tier: ${tier}
- Date: ${timestamp}
- Models tested: ${uniqueModels.size}

## Scoring Rubric
Rate each response 1-10 on:
- correctness: Did it solve the task accurately?
- completeness: Did it cover all aspects?
- efficiency: Was the approach optimal?
- instruction_adherence: Did it follow all constraints?
- quality: Overall code/text quality

## Required JSON Output:
{
  "eval_id": "${runId}",
  "category": "${categoryName}",
  "judged_at": "<ISO timestamp>",
  "judgments": {
    "{prompt_id}": {
      "model_scores": {
        "{model_key}": {
          "correctness": <1-10>,
          "completeness": <1-10>,
          "efficiency": <1-10>,
          "instruction_adherence": <1-10>,
          "quality": <1-10>,
          "notes": "<brief reasoning>"
        }
      },
      "winner": "<model_key>",
      "reasoning": "<why this model won>"
    }
  },
  "category_ranking": ["best_model", "second", ...],
  "summary": "<2-3 sentence overall analysis>"
}

---
`;

  // Add each prompt and its responses
  const promptIds = Object.keys(resultsByPrompt).sort();
  promptIds.forEach((promptId, index) => {
    const promptResults = resultsByPrompt[promptId];

    // Get prompt metadata from the first result
    const firstResult = promptResults[0];
    const promptName = firstResult.prompt_name || promptId;
    const promptText = firstResult.prompt_text || '(prompt text not available)';
    const expectedTraits = firstResult.expected_traits || [];
    const expectedTraitsStr = Array.isArray(expectedTraits)
      ? expectedTraits.join(', ')
      : String(expectedTraits);

    prompt += `
## Prompt: ${promptId} — ${promptName}
> ${promptText}
> Expected: ${expectedTraitsStr}
`;

    // Add responses for each model
    promptResults.forEach((result) => {
      const modelKey = result.model_key || 'unknown';
      const modelConfig = models[modelKey] || {};
      const modelLabel = modelConfig.label || modelKey;
      const modelRole = modelConfig.role || 'unknown';

      const promptTokens = result.prompt_tokens || 0;
      const completionTokens = result.completion_tokens || 0;
      const latencyMs = result.latency_ms || 0;
      const cost = result.cost || 0;
      const testResult = result.auto_test_result || 'N/A';
      const response = result.response || '(no response captured)';

      prompt += `
### Response: ${modelLabel} (${modelRole})
Tokens: ${promptTokens}→${completionTokens} | Latency: ${latencyMs}ms | Cost: ${formatCost(cost)} | Auto-test: ${testResult}

\`\`\`
${response}
\`\`\`
`;
    });
  });

  return prompt;
}

/**
 * langchain-tools.js — LangChain-Integration für lokale Modelle.
 *
 * Ermöglicht Tool-Calling (Tavily Search, Wikipedia) für LM Studio und Ollama.
 * Unterstützt auch Structured Output via Zod-Schemas.
 *
 * Exportiert:
 * - generateWithLangChain()      — Text-Generierung mit optionalem Tool-Calling
 * - generateStructuredLmStudio() — Structured Output via LM Studio SDK
 * - generateStructuredLocal()    — Structured Output via Zod-Schema (LM Studio)
 * - getSchemaForTask(task)       — Zod-Schema für einen Task-Typ
 * - zodToJsonSchema(schema)      — Zod → JSON Schema Konvertierung
 * - POLL_CREATE_SCHEMA, POLL_VOTE_SCHEMA
 */
const { ChatOllama } = require('@langchain/ollama');
const { ChatOpenAI } = require('@langchain/openai');
const { TavilySearch } = require('@langchain/tavily');
const { WikipediaQueryRun } = require('@langchain/community/tools/wikipedia_query_run');
const { HumanMessage, ToolMessage } = require('@langchain/core/messages');
const { LMStudioClient } = require('@lmstudio/sdk');
const { z } = require('zod');
const fs = require('fs');
const path = require('path');

const MAX_TOOL_ITERATIONS = 5;
const CONTEXT_SAFETY_MARGIN = 0.9; // use max 90% of context window

let toolsCache = null;
let cachedTavilyKey = null;

function getTools(tavilyApiKey) {
  // Rebuild if tavily key changed
  if (toolsCache && cachedTavilyKey === (tavilyApiKey || '')) {
    return toolsCache;
  }
  const tools = [
    new WikipediaQueryRun({ topKResults: 3, maxDocContentLength: 4000 }),
  ];
  if (tavilyApiKey) {
    tools.unshift(new TavilySearch({ maxResults: 3, tavilyApiKey: tavilyApiKey }));
  }
  toolsCache = tools;
  cachedTavilyKey = tavilyApiKey || '';
  return toolsCache;
}

function createChatModel({ isOllama, modelName, baseUrl }) {
  if (isOllama) {
    return new ChatOllama({
      model: modelName,
      baseUrl: baseUrl,
    });
  }
  // LM Studio exposes an OpenAI-compatible API
  return new ChatOpenAI({
    model: modelName,
    temperature: 0.7,
    apiKey: 'lm-studio',
    configuration: {
      baseURL: `${baseUrl}/v1`,
    },
  });
}

function prepareImages(threadAttachments) {
  const images = [];
  for (const att of (threadAttachments || [])) {
    if (!att?.mimeType?.startsWith('image/')) continue;
    try {
      const filePath = path.join(__dirname, 'uploads', att.filename);
      if (!fs.existsSync(filePath)) continue;
      const data = fs.readFileSync(filePath).toString('base64');
      images.push({ mimeType: att.mimeType, data });
    } catch (err) {
      console.error(`[LangChain] Anhang ${att.filename} nicht lesbar:`, err.message);
    }
  }
  return images;
}

function buildMessageContent(prompt, images) {
  if (images.length === 0) return prompt;
  return [
    { type: 'text', text: prompt },
    ...images.map(img => ({
      type: 'image_url',
      image_url: { url: `data:${img.mimeType};base64,${img.data}` },
    })),
  ];
}

async function executeToolCalls(toolCalls, tools) {
  const results = [];
  for (const toolCall of toolCalls) {
    const tool = tools.find(t => t.name === toolCall.name);
    if (!tool) continue;
    try {
      console.log(`[LangChain] Tool ${toolCall.name} args:`, JSON.stringify(toolCall.args));
      // Strip null/undefined values — LLMs sometimes send them but tools reject them
      const cleanArgs = Object.fromEntries(
        Object.entries(toolCall.args || {}).filter(([, v]) => v != null)
      );
      const result = await tool.invoke(cleanArgs);
      console.log(`[LangChain] Tool ${toolCall.name} result:`, typeof result === 'string' ? result.slice(0, 200) : JSON.stringify(result).slice(0, 200));
      results.push(new ToolMessage({
        content: typeof result === 'string' ? result : JSON.stringify(result),
        tool_call_id: toolCall.id,
      }));
    } catch (err) {
      console.error(`[LangChain] Tool ${toolCall.name} Fehler:`, err.message);
      results.push(new ToolMessage({
        content: `Tool-Fehler: ${err.message}`,
        tool_call_id: toolCall.id,
      }));
    }
  }
  return results;
}

function extractText(response) {
  return typeof response.content === 'string' ? response.content.trim() : '';
}

/**
 * Check if prompt fits in context window for LM Studio models.
 * Uses @lmstudio/sdk to count tokens and get context length.
 * Returns { fits, tokenCount, contextLength } or null if check unavailable.
 */
async function checkLmStudioContext(modelName, prompt) {
  try {
    const client = new LMStudioClient();
    const model = await client.llm.model(modelName);
    const { Chat } = require('@lmstudio/sdk');
    const chat = Chat.from([{ role: 'user', content: prompt }]);
    const formatted = await model.applyPromptTemplate(chat);
    const tokenCount = await model.countTokens(formatted);
    const contextLength = await model.getContextLength();
    return { fits: tokenCount < contextLength * CONTEXT_SAFETY_MARGIN, tokenCount, contextLength };
  } catch (err) {
    console.warn(`[LangChain] Context-Check nicht möglich: ${err.message}`);
    return null;
  }
}

/**
 * Summarize a prompt that's too long for the context window.
 * Splits the prompt into system/task part and conversation history,
 * then aggressively trims history to fit within context.
 */
async function summarizeForContext(chat, prompt, tokenCount, contextLength, modelName) {
  const maxTokens = Math.floor(contextLength * CONTEXT_SAFETY_MARGIN);
  const overflowRatio = tokenCount / maxTokens;
  console.log(`[LangChain] Prompt zu lang: ${tokenCount} Tokens, Limit: ${maxTokens} (${contextLength} * ${CONTEXT_SAFETY_MARGIN}). Overflow: ${overflowRatio.toFixed(2)}x`);

  // Split prompt: everything before "BISHERIGE DISKUSSION:" is the system part,
  // everything between that and "YOUR TASK:" is conversation history
  const historyStart = prompt.indexOf('**BISHERIGE DISKUSSION:**');
  const taskStart = prompt.indexOf('**YOUR TASK:**');

  if (historyStart === -1 || taskStart === -1 || historyStart >= taskStart) {
    // Can't split intelligently — hard truncate by estimated char/token ratio
    const charsPerToken = prompt.length / tokenCount;
    const maxChars = Math.floor(maxTokens * charsPerToken * 0.85);
    const truncated = prompt.slice(0, maxChars);
    console.log(`[LangChain] Fallback: Prompt auf ${truncated.length}/${prompt.length} Zeichen hart gekürzt.`);
    return truncated;
  }

  const headerLen = '**BISHERIGE DISKUSSION:**'.length;
  const systemPart = prompt.slice(0, historyStart + headerLen);
  const historyPart = prompt.slice(historyStart + headerLen, taskStart).trim();
  const taskPart = prompt.slice(taskStart);

  // Estimate how much of the prompt is NOT history (system + task)
  const nonHistoryChars = systemPart.length + taskPart.length;
  const charsPerToken = prompt.length / tokenCount;
  const nonHistoryTokens = Math.ceil(nonHistoryChars / charsPerToken);
  const tokensForHistory = maxTokens - nonHistoryTokens - 200; // 200 token buffer for response

  if (tokensForHistory <= 0) {
    // System+task alone fill the context — drop all history
    console.log(`[LangChain] System+Task allein füllen den Context. Historie komplett entfernt.`);
    return `${systemPart}\n*(Diskussionshistorie gekürzt — Context-Limit erreicht)*\n\n${taskPart}`;
  }

  const messages = historyPart.split('\n\n').filter(m => m.trim());
  const maxHistoryChars = Math.floor(tokensForHistory * charsPerToken);

  // Strategy 1: Try model-based summary if history is small enough
  // (summary prompt must be < 60% of context to leave room for the response)
  const summaryBudget = Math.floor(contextLength * 0.55);
  const historyTokensEstimate = Math.ceil(historyPart.length / charsPerToken);

  if (historyTokensEstimate < summaryBudget) {
    try {
      const keepCount = Math.max(3, Math.ceil(messages.length / overflowRatio));
      const summarizePrompt = `Fasse diese Forumsdiskussion in maximal ${keepCount} kurzen Absätzen zusammen. Behalte NUR die wichtigsten Argumente, Lösungen und Standpunkte. Antworte NUR mit der Zusammenfassung:\n\n${historyPart}`;
      const summaryResp = await chat.invoke([new HumanMessage({ content: summarizePrompt })]);
      const summary = typeof summaryResp.content === 'string' ? summaryResp.content.trim() : '';
      if (summary && summary.length < maxHistoryChars) {
        const newPrompt = `${systemPart}\n${summary}\n\n${taskPart}`;
        console.log(`[LangChain] Diskussion zusammengefasst: ${historyPart.length} → ${summary.length} Zeichen.`);
        return newPrompt;
      }
    } catch (err) {
      console.warn(`[LangChain] Modell-Zusammenfassung fehlgeschlagen: ${err.message}`);
    }
  } else {
    console.log(`[LangChain] Historie zu groß für Modell-Zusammenfassung (${historyTokensEstimate} > ${summaryBudget} Tokens). Nutze Textkürzung.`);
  }

  // Strategy 2: Keep last N messages that fit within token budget
  let kept = [];
  let charCount = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msgLen = messages[i].length + 2; // +2 for \n\n
    if (charCount + msgLen > maxHistoryChars) break;
    charCount += msgLen;
    kept.unshift(messages[i]);
  }

  // Always keep at least the last 3 messages
  if (kept.length < 3 && messages.length >= 3) {
    kept = messages.slice(-3);
  }

  const dropped = messages.length - kept.length;
  const truncatedHistory = kept.join('\n\n');
  console.log(`[LangChain] Behalte letzte ${kept.length}/${messages.length} Nachrichten (${dropped} entfernt, ~${charCount} Zeichen).`);
  return `${systemPart}\n*(${dropped} ältere Nachrichten gekürzt — Context-Limit)*\n\n${truncatedHistory}\n\n${taskPart}`;
}

/**
 * Generate a response using a local model (Ollama or LM Studio) via LangChain,
 * with automatic tool calling support (DuckDuckGo Search, Wikipedia).
 */
async function generateWithLangChain({ isOllama, modelName, baseUrl, prompt, threadAttachments = [], tavilyApiKey = '' }) {
  // Pre-check: verify the local server is reachable before doing expensive work
  try {
    const healthUrl = isOllama ? `${baseUrl}/api/tags` : `${baseUrl}/v1/models`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const healthResp = await fetch(healthUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (!healthResp.ok) {
      throw new Error(`${isOllama ? 'Ollama' : 'LM Studio'} antwortet mit HTTP ${healthResp.status}`);
    }
  } catch (err) {
    const provider = isOllama ? 'Ollama' : 'LM Studio';
    const addr = baseUrl;
    if (err.name === 'AbortError' || err.cause?.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED') || err.message?.includes('fetch failed')) {
      throw new Error(`${provider} ist nicht erreichbar (${addr}). Bitte starte ${provider} und lade ein Modell.`);
    }
    throw new Error(`${provider} Verbindungsfehler (${addr}): ${err.message}`);
  }

  const tools = getTools(tavilyApiKey);
  const chat = createChatModel({ isOllama, modelName, baseUrl });

  // Context window check for LM Studio models
  let finalPrompt = prompt;
  if (!isOllama) {
    const ctx = await checkLmStudioContext(modelName, prompt);
    if (ctx) {
      console.log(`[LangChain] Context-Check (${modelName}): ${ctx.tokenCount}/${ctx.contextLength} Tokens${ctx.fits ? ' ✅' : ' ⚠️ ZU LANG'}`);
      if (!ctx.fits) {
        finalPrompt = await summarizeForContext(chat, prompt, ctx.tokenCount, ctx.contextLength, modelName);
      }
    }
  }

  const images = prepareImages(threadAttachments);
  const content = buildMessageContent(finalPrompt, images);
  const humanMsg = new HumanMessage({ content });

  // Try with tool binding first
  try {
    const llmWithTools = chat.bindTools(tools);
    const messages = [humanMsg];

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await llmWithTools.invoke(messages);
      messages.push(response);

      if (!response.tool_calls || response.tool_calls.length === 0) {
        const text = extractText(response);
        if (text) return text;
        break;
      }

      console.log(`[LangChain] Tool-Aufrufe (Iteration ${i + 1}):`,
        response.tool_calls.map(tc => tc.name).join(', '));

      const toolResults = await executeToolCalls(response.tool_calls, tools);
      messages.push(...toolResults);
    }

    // After max iterations, get final response without tools
    const finalResp = await chat.invoke(messages);
    const text = extractText(finalResp);
    if (text) return text;
  } catch (err) {
    console.warn(`[LangChain] Tool-Calling nicht unterstützt, Fallback: ${err.message}`);
  }

  // Fallback: plain invocation without tools
  const fallbackResp = await chat.invoke([humanMsg]);
  const text = extractText(fallbackResp);
  if (!text) {
    throw new Error('Lokales Modell hat keine Antwort geliefert.');
  }
  return text;
}

// ── JSON Schema definitions for PollmasterPaul structured output ────────────

const POLL_CREATE_SCHEMA = {
  type: "object",
  properties: {
    pollQuestion: { type: "string" },
    pollOptions: { type: "array", items: { type: "string" } },
    commentary: { type: "string" },
  },
  required: ["pollQuestion", "pollOptions", "commentary"],
};

const POLL_VOTE_SCHEMA = {
  type: "object",
  properties: {
    pollVote: { type: "integer" },
    reasoning: { type: "string" },
  },
  required: ["pollVote", "reasoning"],
};

/**
 * Generate a structured response from LM Studio using JSON Schema.
 * Used for PollmasterPaul to guarantee correct poll format.
 */
async function generateStructuredLmStudio({ modelName, prompt, schema }) {
  let client, model;
  try {
    client = new LMStudioClient();
    model = await client.llm.model(modelName);
  } catch (err) {
    throw new Error(`LM Studio SDK nicht erreichbar (Modell: ${modelName}). Bitte starte LM Studio und lade ein Modell. Details: ${err.message}`);
  }

  console.log(`[PollStructured] Requesting structured response from ${modelName}, prompt length=${prompt.length} chars...`);

  const result = await model.respond(prompt, {
    structured: { type: "json", jsonSchema: schema },
    maxTokens: 1024,
  });

  console.log(`[PollStructured] Raw content: ${result.content?.slice(0, 400)}`);

  // Clean control tokens that some models inject
  let cleaned = (result.content || '').replace(/<\|[^|]*\|>/g, '');
  // Extract first complete JSON object
  const start = cleaned.indexOf('{');
  if (start === -1) throw new Error('No JSON in structured response');
  let depth = 0, end = -1;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === '{') depth++;
    else if (cleaned[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error('Incomplete JSON in structured response');
  cleaned = cleaned.slice(start, end + 1);

  const parsed = JSON.parse(cleaned);
  console.log(`[PollStructured] Parsed:`, JSON.stringify(parsed).slice(0, 300));
  return parsed;
}

// ── Zod Schemas for structured bot responses ───────────────────────────────

const BotResponseSchemas = {
  analyze: z.object({
    content: z.string().describe('Deine Analyse des Problems (80-300 Wörter, Deutsch, Markdown erlaubt)'),
    upvoteTarget: z.string().nullable().optional().describe('Bot-Name den du upvoten willst, z.B. "RealistRachel", oder null'),
    callVerdict: z.boolean().optional().describe('true wenn du den Richter rufen willst'),
  }),

  tech_solution: z.object({
    content: z.string().describe('Dein Kommentar zur Lösung (1-2 Sätze, Deutsch)'),
    solution: z.string().describe('Die konkrete technische Lösung (umsetzbar, mit Tool-/App-Namen)'),
    solutionType: z.literal('tech'),
    upvoteTarget: z.string().nullable().optional().describe('Bot-Name den du upvoten willst, oder null'),
    callVerdict: z.boolean().optional().describe('true wenn du den Richter rufen willst'),
  }),

  org_solution: z.object({
    content: z.string().describe('Dein Kommentar zur Lösung (1-2 Sätze, Deutsch)'),
    solution: z.string().describe('Die konkrete organisatorische Lösung (umsetzbar, Gewohnheiten/Routinen/Workflows)'),
    solutionType: z.literal('org'),
    upvoteTarget: z.string().nullable().optional().describe('Bot-Name den du upvoten willst, oder null'),
    callVerdict: z.boolean().optional().describe('true wenn du den Richter rufen willst'),
  }),

  pro_argument: z.object({
    content: z.string().describe('Deine Pro-Argumentation (3-5 Sätze, Deutsch)'),
    stance: z.literal('pro'),
    stanceTarget: z.string().describe('Kurzer Name der Lösung die du verteidigst'),
    upvoteTarget: z.string().nullable().optional().describe('Bot-Name den du upvoten willst, oder null'),
    callVerdict: z.boolean().optional().describe('true wenn du den Richter rufen willst'),
  }),

  contra_argument: z.object({
    content: z.string().describe('Deine Contra-Argumentation (3-5 Sätze, Deutsch)'),
    stance: z.literal('contra'),
    stanceTarget: z.string().describe('Kurzer Name der Lösung die du angreifst'),
    upvoteTarget: z.string().nullable().optional().describe('Bot-Name den du upvoten willst, oder null'),
    callVerdict: z.boolean().optional().describe('true wenn du den Richter rufen willst'),
  }),

  rate_solutions: z.object({
    content: z.string().describe('Kurze Begründung deiner Bewertungen (1-2 Sätze, Deutsch)'),
    voteResults: z.array(z.object({
      index: z.number().describe('0-basierter Index der Lösung'),
      score: z.number().min(-2).max(2).describe('Punktzahl: -2 bis +2'),
    })).describe('Deine Bewertungen für jede Lösung'),
    upvoteTarget: z.string().nullable().optional().describe('Bot-Name den du upvoten willst, oder null'),
  }),

  moderate: z.object({
    content: z.string().describe('Neutrale Zusammenfassung aller Pro- und Contra-Argumente (Deutsch, Markdown)'),
    upvoteTarget: z.string().nullable().optional().describe('Bot-Name den du upvoten willst, oder null'),
  }),

  synthesize: z.object({
    content: z.string().describe('Deine Synthese und klare Empfehlung (Deutsch)'),
    upvoteTarget: z.string().nullable().optional().describe('Bot-Name den du upvoten willst, oder null'),
    callVerdict: z.boolean().optional().describe('true wenn du den Richter rufen willst'),
  }),

  conclude: z.object({
    content: z.string().describe('Dein abschließender persönlicher Rat an den User (Deutsch)'),
    upvoteTarget: z.string().nullable().optional().describe('Bot-Name den du upvoten willst, oder null'),
  }),

  close_verdict: z.object({
    content: z.string().describe('Begründung deines Urteils (2-3 Sätze, Deutsch)'),
    verdictClose: z.boolean().describe('true = Thread schließen (CLOSE), false = weiterdiskutieren (CONTINUE)'),
  }),

  create_poll: z.object({
    content: z.string().describe('1-2 Sätze Einleitung zur Abstimmung (Deutsch)'),
    pollQuestion: z.string().describe('Die Abstimmungsfrage'),
    pollOptions: z.array(z.string()).min(2).max(6).describe('Die Abstimmungsoptionen (2-6 Stück)'),
  }),

  vote_poll: z.object({
    content: z.string().describe('Kurze Begründung deiner Wahl (1-2 Sätze, Deutsch)'),
    pollVote: z.number().int().describe('Nummer der gewählten Option (1-basiert)'),
  }),

  react_to_user: z.object({
    content: z.string().describe('Deine Reaktion auf den User-Kommentar (Deutsch, 80-300 Wörter)'),
    upvoteTarget: z.string().nullable().optional().describe('Bot-Name den du upvoten willst, oder null'),
    callVerdict: z.boolean().optional().describe('true wenn du den Richter rufen willst'),
    verdictClose: z.boolean().nullable().optional().describe('NUR für VerdictVictor: true = Thread schließen (CLOSE), false = weiterdiskutieren (CONTINUE), null = kein Urteil'),
  }),

  direct_reply: z.object({
    content: z.string().describe('Deine direkte Antwort an den User (Deutsch, 80-300 Wörter)'),
    upvoteTarget: z.string().nullable().optional().describe('Bot-Name den du upvoten willst, oder null'),
    callVerdict: z.boolean().optional().describe('true wenn du den Richter rufen willst'),
    verdictClose: z.boolean().nullable().optional().describe('NUR für VerdictVictor: true = Thread schließen (CLOSE), false = weiterdiskutieren (CONTINUE), null = kein Urteil'),
  }),

  bot_direct_reply: z.object({
    content: z.string().describe('Deine direkte Antwort an den anderen Bot (Deutsch, kurz und schlagfertig)'),
    upvoteTarget: z.string().nullable().optional().describe('Bot-Name den du upvoten willst, oder null'),
    callVerdict: z.boolean().optional().describe('true wenn du den Richter rufen willst'),
    verdictClose: z.boolean().nullable().optional().describe('NUR für VerdictVictor: true = Thread schließen (CLOSE), false = weiterdiskutieren (CONTINUE), null = kein Urteil'),
  }),

  upvote_comments: z.object({
    content: z.string().describe('Kurzer Satz warum du diesen Kommentar upvotest (Deutsch)'),
    upvoteTarget: z.string().describe('Bot-Name dessen Kommentar du am besten findest'),
  }),
};

/**
 * Get the Zod schema for a given task type.
 * Returns null for unknown tasks (fallback to text parsing).
 */
function getSchemaForTask(task) {
  return BotResponseSchemas[task] || null;
}

/**
 * Convert a Zod schema to a plain JSON Schema object (for Gemini API / LM Studio).
 * Uses Zod v4's built-in toJSONSchema().
 */
function zodToJsonSchema(zodSchema) {
  const jsonSchema = z.toJSONSchema(zodSchema);
  // Remove $schema and additionalProperties — Gemini API doesn't accept them
  delete jsonSchema.$schema;
  // Recursively fix unsupported keywords (e.g. "const" → "enum")
  function sanitize(obj) {
    if (!obj || typeof obj !== 'object') return;
    // "const": "value" → "enum": ["value"] (Gemini doesn't support "const")
    if ('const' in obj) {
      obj.enum = [obj.const];
      delete obj.const;
    }
    delete obj.additionalProperties;
    // Recurse into properties, items, anyOf, oneOf, allOf
    if (obj.properties) {
      for (const v of Object.values(obj.properties)) sanitize(v);
    }
    if (obj.items) sanitize(obj.items);
    for (const key of ['anyOf', 'oneOf', 'allOf']) {
      if (Array.isArray(obj[key])) obj[key].forEach(sanitize);
    }
  }
  sanitize(jsonSchema);
  return jsonSchema;
}

/**
 * Generate a structured response directly via LM Studio SDK.
 * Uses model.respond() with structured JSON schema enforcement.
 * Returns the parsed object or null if structured generation fails.
 */
async function generateStructuredLocal({ modelName, prompt, task }) {
  const zodSchema = getSchemaForTask(task);
  if (!zodSchema) return null;

  const jsonSchema = zodToJsonSchema(zodSchema);
  let client, model;
  try {
    client = new LMStudioClient();
    model = await client.llm.model(modelName);
  } catch (err) {
    throw new Error(`LM Studio SDK nicht erreichbar (Modell: ${modelName}). Bitte starte LM Studio und lade ein Modell. Details: ${err.message}`);
  }

  console.log(`[StructuredLocal] task=${task} model=${modelName}, prompt=${prompt.length} chars, schema keys: ${Object.keys(jsonSchema.properties || {}).join(', ')}`);

  const result = await model.respond(prompt, {
    structured: { type: "json", jsonSchema },
    maxTokens: 2048,
  });

  console.log(`[StructuredLocal] Raw content (${result.content?.length} chars): ${result.content?.slice(0, 400)}`);

  // Clean control tokens that some models inject
  let cleaned = (result.content || '').replace(/<\|[^|]*\|>/g, '');
  // Extract first complete JSON object
  const start = cleaned.indexOf('{');
  if (start === -1) throw new Error('No JSON in structured response');
  let depth = 0, end = -1;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === '{') depth++;
    else if (cleaned[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error('Incomplete JSON in structured response');
  cleaned = cleaned.slice(start, end + 1);

  const parsed = JSON.parse(cleaned);
  console.log(`[StructuredLocal] Parsed keys: ${Object.keys(parsed).join(', ')}`);
  return parsed;
}

module.exports = {
  generateWithLangChain,
  getTools,
  generateStructuredLmStudio,
  generateStructuredLocal,
  getSchemaForTask,
  zodToJsonSchema,
  BotResponseSchemas,
  POLL_CREATE_SCHEMA,
  POLL_VOTE_SCHEMA,
};

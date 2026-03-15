/**
 * gemini.js — LLM-Aufrufe (Gemini, LM Studio, Ollama).
 *
 * Steuert die KI-Kommunikation über drei Backends:
 * - Google Gemini (Cloud API mit GoogleSearch)
 * - LM Studio (lokales OpenAI-kompatibles API, mit Tool-Calling via LangChain)
 * - Ollama (lokales API, mit Tool-Calling via LangChain)
 *
 * Exportiert:
 * - generateBotResponse()      — Haupt-Bot-Antwort (Text + Structured Output)
 * - generateBotConfig()        — KI-generierte Bot-Konfiguration
 * - generateBotLearning()      — Web-Recherche für Bot-Wissen
 * - consolidateBotMemory()     — Komprimiert Bot-Wissens-Einträge
 * - generateBotProbabilities() — Thread-Relevanz pro Bot
 *
 * Prompt-Templates kommen aus prompts.js (getTaskInstruction, buildBotPrompt).
 */
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');
const { generateWithLangChain, generateStructuredLmStudio, generateStructuredLocal, getSchemaForTask, zodToJsonSchema, POLL_CREATE_SCHEMA, POLL_VOTE_SCHEMA } = require('./langchain-tools');
const { buildBotPrompt } = require('./prompts');
const { getPromptLang } = require('./prompts-lang');

const DEFAULT_GEMINI_MODEL = 'gemini-3.1-pro-preview';
const LEARNING_MODEL = 'gemini-2.5-flash';
const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
const DEFAULT_LMSTUDIO_BASE_URL = 'http://localhost:1234';
const DEFAULT_LOCAL_BASE_URL = DEFAULT_LMSTUDIO_BASE_URL;

// ── LM Studio model validation cache ─────────────────────────────────────────
let _lmStudioModelsCache = [];
let _lmStudioCacheTime = 0;
const LM_STUDIO_CACHE_TTL = 30_000; // 30s

async function getLmStudioLoadedModels(baseUrl) {
  const now = Date.now();
  if (_lmStudioModelsCache.length > 0 && now - _lmStudioCacheTime < LM_STUDIO_CACHE_TTL) {
    return _lmStudioModelsCache;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(`${baseUrl}/v1/models`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) return _lmStudioModelsCache;
    const data = await resp.json();
    _lmStudioModelsCache = Array.isArray(data?.data)
      ? data.data.map(m => m?.id).filter(id => typeof id === 'string' && id.trim()).map(id => id.trim())
      : [];
    _lmStudioCacheTime = now;
  } catch {
    // keep stale cache — LM Studio may be offline
  }
  return _lmStudioModelsCache;
}

async function validateLmStudioModel(requestedModel, baseUrl) {
  const loaded = await getLmStudioLoadedModels(baseUrl);
  if (loaded.length === 0) return requestedModel; // can't validate, pass through
  if (loaded.includes(requestedModel)) return requestedModel; // exact match
  // Try case-insensitive match
  const lower = requestedModel.toLowerCase();
  const ciMatch = loaded.find(m => m.toLowerCase() === lower);
  if (ciMatch) return ciMatch;
  // Model not found — use first loaded model as fallback
  console.warn(`[LM Studio] ⚠️ Modell "${requestedModel}" nicht geladen! Verfügbare Modelle: ${loaded.join(', ')}`);
  console.warn(`[LM Studio] → Verwende stattdessen: "${loaded[0]}"`);
  return loaded[0];
}

function isOllamaModel(model) {
  return typeof model === 'string' && model.toLowerCase().startsWith('ollama:');
}

function isLmStudioModel(model) {
  return typeof model === 'string' && model.toLowerCase().startsWith('lmstudio:');
}

function getOllamaModelName(model) {
  return model.slice('ollama:'.length).trim();
}

function getLmStudioModelName(model) {
  return model.slice('lmstudio:'.length).trim();
}

function normalizeLocalBaseUrl(localBaseUrl, fallback = DEFAULT_LOCAL_BASE_URL) {
  if (typeof localBaseUrl !== 'string') return fallback;
  const trimmed = localBaseUrl.trim();
  if (!trimmed) return fallback;
  return trimmed.replace(/\/+$/, '');
}

async function generateWithOllama({ model, prompt, threadAttachments, localBaseUrl, tavilyApiKey = '' }) {
  const modelName = getOllamaModelName(model);
  if (!modelName) {
    throw new Error('Lokales Modell ist leer. Nutze das Format "ollama:<modellname>".');
  }
  const baseUrl = normalizeLocalBaseUrl(localBaseUrl, DEFAULT_OLLAMA_BASE_URL);
  return generateWithLangChain({ isOllama: true, modelName, baseUrl, prompt, threadAttachments, tavilyApiKey });
}

async function generateWithLmStudio({ model, prompt, threadAttachments, localBaseUrl, tavilyApiKey = '' }) {
  let modelName = getLmStudioModelName(model);
  if (!modelName) {
    throw new Error('LM Studio Modell ist leer. Nutze das Format "lmstudio:<modellname>".');
  }
  const baseUrl = normalizeLocalBaseUrl(localBaseUrl, DEFAULT_LMSTUDIO_BASE_URL);
  modelName = await validateLmStudioModel(modelName, baseUrl);
  return generateWithLangChain({ isOllama: false, modelName, baseUrl, prompt, threadAttachments, tavilyApiKey });
}

async function generateBotResponse({
  bot,
  problem,
  threadAttachments = [],
  conversationHistory,
  task,
  apiKey,
  model = DEFAULT_GEMINI_MODEL,
  localBaseUrl = DEFAULT_LOCAL_BASE_URL,
  solutions = [],
  personalityOverride = null,
  similarThreads = [],
  botMemory = [],
  tavilyApiKey = '',
  lang = 'de',
}) {
  const selectedModel = typeof model === 'string' && model.trim() ? model.trim() : DEFAULT_GEMINI_MODEL;
  const useOllama = isOllamaModel(selectedModel);
  const useLmStudio = isLmStudioModel(selectedModel);

  if (!useOllama && !useLmStudio && !apiKey) {
    throw new Error('No API key configured. Please add your Google GenAI API key in settings.');
  }

  const ai = useOllama || useLmStudio ? null : new GoogleGenAI({ apiKey });

  const prompt = buildBotPrompt({ bot, problem, threadAttachments, conversationHistory, task, solutions, personalityOverride, similarThreads, botMemory, lang });

  let text = '';
  let structuredResult = null;

  // ── Try structured output first, then fall back to text generation ─────────
  const taskSchema = getSchemaForTask(task);
  const isPollTask = task === 'create_poll' || task === 'vote_poll';
  console.log(`[BotResponse] bot=${bot.name} task=${task} model=${selectedModel} hasSchema=${!!taskSchema} useLmStudio=${useLmStudio} useOllama=${useOllama}`);

  if (taskSchema) {
    // ── Attempt 1: Structured output via model-native JSON mode ──────────────
    try {
      if (useLmStudio) {
        // Direct LM Studio SDK structured output
        const modelName = getLmStudioModelName(selectedModel);
        const baseUrl = normalizeLocalBaseUrl(localBaseUrl, DEFAULT_LMSTUDIO_BASE_URL);
        const validated = await validateLmStudioModel(modelName, baseUrl);
        structuredResult = await generateStructuredLocal({
          modelName: validated,
          prompt,
          task,
        });
      } else if (useOllama) {
        // Ollama: skip structured output, fall through to text fallback
        console.log(`[Structured] Ollama hat kein natives Structured Output — überspringe, nutze Text-Fallback`);
        structuredResult = null;
      } else {
        // Gemini API: use responseSchema for structured JSON output
        const jsonSchema = zodToJsonSchema(taskSchema);
        const contentParts = [{ text: prompt }];

        for (const att of threadAttachments) {
          try {
            const filePath = path.join(__dirname, 'uploads', att.filename);
            if (fs.existsSync(filePath)) {
              const data = fs.readFileSync(filePath).toString('base64');
              contentParts.push({ inlineData: { mimeType: att.mimeType, data } });
            }
          } catch (err) {
            console.error(`[Gemini] Failed to read attachment ${att.filename}:`, err.message);
          }
        }

        const response = await ai.models.generateContent({
          model: selectedModel,
          contents: contentParts,
          config: {
            responseMimeType: 'application/json',
            responseSchema: jsonSchema,
          },
        });

        const rawJson = response.text.trim();
        structuredResult = JSON.parse(rawJson);
      }

      if (structuredResult && typeof structuredResult === 'object' && structuredResult.content) {
        console.log(`[Structured] ✅ task=${task} bot=${bot.name} — structured output successful, keys: ${Object.keys(structuredResult).join(', ')}`);
      } else {
        console.warn(`[Structured] ⚠️ task=${task} — result missing 'content', falling back to text. Got: ${JSON.stringify(structuredResult).slice(0, 200)}`);
        structuredResult = null;
      }
    } catch (err) {
      console.warn(`[Structured] ⚠️ task=${task} bot=${bot.name} — structured generation failed, falling back to text: ${err.message}`);
      structuredResult = null;
    }
  }

  // ── Fallback: text generation (original path) if structured failed ─────────
  if (!structuredResult) {
    if (isPollTask && useLmStudio) {
      try {
        const modelName = getLmStudioModelName(selectedModel);
        const schema = task === 'create_poll' ? POLL_CREATE_SCHEMA : POLL_VOTE_SCHEMA;
        
        // Build a focused, shorter prompt just for structured output
        let structuredPrompt;
        if (task === 'create_poll') {
          const solutionsList = solutions.length > 0
            ? solutions.map((s, i) =>
                `${i + 1}. [${s.type === 'org' ? 'Org' : 'Tech'}] ${s.content.slice(0, 120)}`
              ).join('\n')
            : 'Keine Lösungen vorhanden';
          structuredPrompt = `Erstelle eine Abstimmung auf Deutsch für ein Diskussionsforum.

Thema: ${problem.slice(0, 200)}

Vorhandene Lösungen:
${solutionsList}

Erstelle eine klare Abstimmungsfrage und fasse die Lösungen als 2-5 kurze Optionen zusammen. Schreibe auch 1-2 Sätze als Einleitung auf Deutsch.`;
        } else {
          const pollQ = bot._pollQuestion || 'Abstimmung';
          const pollOpts = (bot._pollOptions || []).map((o, i) => `${i + 1}: ${o}`).join('\n');
          structuredPrompt = `Gib deine Stimme ab bei einer Abstimmung.

Frage: ${pollQ}
Optionen:
${pollOpts}

Wähle eine Option (als Nummer) und begründe kurz warum, aus der Perspektive von ${bot.name}.`;
        }

        const parsed = await generateStructuredLmStudio({ modelName, prompt: structuredPrompt, schema });

        // Quality check: options must be real text (>5 chars, no just "..." or garbage)
        const isValidPoll = task === 'create_poll' 
          && parsed.pollQuestion && parsed.pollQuestion.length > 10
          && parsed.pollOptions?.length >= 2
          && parsed.pollOptions.every(o => typeof o === 'string' && o.length > 5 && !o.match(/^[.\s…?]+$/));

        if (task === 'create_poll' && isValidPoll) {
          text = `POLL_QUESTION: ${parsed.pollQuestion}\nPOLL_OPTIONS:\n${parsed.pollOptions.map((o, i) => `${i + 1}: ${o}`).join('\n')}\n\n${parsed.commentary || ''}`;
          console.log(`[PollStructured] create_poll → markers injected, ${parsed.pollOptions.length} options`);
        } else if (task === 'vote_poll' && parsed.pollVote) {
          text = `POLL_VOTE: ${parsed.pollVote}\n\n${parsed.reasoning || ''}`;
          console.log(`[PollStructured] vote_poll → vote=${parsed.pollVote}`);
        } else {
          console.warn(`[PollStructured] Quality check failed, falling back to normal gen. Parsed:`, JSON.stringify(parsed).slice(0, 300));
          text = await generateWithLmStudio({ model: selectedModel, prompt, threadAttachments, localBaseUrl, tavilyApiKey });
        }
      } catch (err) {
        console.warn(`[PollStructured] Structured generation failed, falling back to normal: ${err.message}`);
        text = await generateWithLmStudio({ model: selectedModel, prompt, threadAttachments, localBaseUrl, tavilyApiKey });
      }
    } else if (useOllama) {
      text = await generateWithOllama({
        model: selectedModel,
        prompt,
        threadAttachments,
        localBaseUrl,
        tavilyApiKey,
      });
    } else if (useLmStudio) {
      text = await generateWithLmStudio({
        model: selectedModel,
        prompt,
        threadAttachments,
        localBaseUrl,
        tavilyApiKey,
      });
    } else {
      // ── Build multimodal content parts ────────────────────────────────────────
      const contentParts = [{ text: prompt }];

      for (const att of threadAttachments) {
        try {
          const filePath = path.join(__dirname, 'uploads', att.filename);
          if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath).toString('base64');
            contentParts.push({ inlineData: { mimeType: att.mimeType, data } });
          }
        } catch (err) {
          console.error(`[Gemini] Failed to read attachment ${att.filename}:`, err.message);
        }
      }

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: contentParts,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      text = response.text.trim();
    }
  }

  // ── If structured output succeeded, build result directly ─────────────────
  if (structuredResult) {
    console.log(`[Structured] ──── STRUCTURED OUTPUT (${bot.name}, task=${task}) ────`);
    console.log(JSON.stringify(structuredResult).slice(0, 800));
    console.log(`[Structured] ──── END ────`);

    const s = structuredResult;
    let content = s.content || '';
    let solution = s.solution || null;
    let solutionType = s.solutionType || null;
    let stance = s.stance || null;
    let stanceTarget = s.stanceTarget || null;
    let voteResults = s.voteResults || null;
    let upvoteTarget = s.upvoteTarget || null;
    let verdictClose = typeof s.verdictClose === 'boolean' ? s.verdictClose : null;
    let callVerdict = s.callVerdict || false;
    let pollQuestion = s.pollQuestion || null;
    let pollOptions = s.pollOptions || null;
    let pollVote = typeof s.pollVote === 'number' ? s.pollVote : null;

    // ── Verdict fallback: detect CLOSE intent from VerdictVictor's content ──
    if (verdictClose === null || verdictClose === false) {
      const hasCloseSignal = /\b(abgeschlossen|geschlossen|bleibt geschlossen|Fall.*geschlossen|VERDICT:\s*CLOSE)\b/i.test(content);
      const hasContinueSignal = /\b(weiterdiskutieren|noch nicht.*geschlossen|VERDICT:\s*CONTINUE)\b/i.test(content);
      if (hasCloseSignal && !hasContinueSignal) {
        console.log(`[Structured] Verdict fallback: verdictClose was ${verdictClose}, content signals CLOSE → overriding to true`);
        verdictClose = true;
      }
    }

    console.log(`[Structured] Final values: verdictClose=${verdictClose}, callVerdict=${callVerdict}, solution=${!!solution}, stance=${stance}`);

    // Format content for solution tasks (match existing display format)
    if (solution) {
      const typeEmoji = solutionType === 'org' ? '🗂️ Organisatorisch' : '🔧 Technisch';
      content = `**💡 ${typeEmoji} Lösung:**\n${solution}${content ? '\n\n' + content : ''}`;
    }

    return { content, solution, solutionType, stance, stanceTarget, voteResults, upvoteTarget, verdictClose, callVerdict, pollQuestion, pollOptions, pollVote };
  }

  // ── Fallback: Parse text response with regex (original parsing) ───────────
  console.log(`[BotResponse] ──── RAW LLM OUTPUT (${bot.name}, task=${task}) ────`);
  console.log(text.slice(0, 800));
  console.log(`[BotResponse] ──── END RAW (${text.length} chars) ────`);

  // ── Parse solution ──────────────────────────────────────────────────────────
  let content = text;
  let solution = null;
  let solutionType = null;

  const solutionMatch = text.match(/SOLUTION:\s*\n([\s\S]*?)(?:\n\nSOLUTION_TYPE:\s*(TECH|ORG))?(?:\n\n([\s\S]*))?$/i);
  if (solutionMatch) {
    solution = solutionMatch[1].trim();
    solutionType = (solutionMatch[2] || '').toUpperCase() === 'ORG' ? 'org' : 'tech';
    const typeEmoji = solutionType === 'org' ? '🗂️ Organisatorisch' : '🔧 Technisch';
    const commentary = solutionMatch[3] ? `\n\n${solutionMatch[3].trim()}` : '';
    content = `**💡 ${typeEmoji} Lösung:**\n${solution}${commentary}`;
  }

  // ── Parse pro/contra stance ─────────────────────────────────────────────────
  let stance = null;
  let stanceTarget = null;
  const proMatch = text.match(/^PRO:\s*(.+)/im);
  const contraMatch = text.match(/^CONTRA:\s*(.+)/im);
  if (proMatch) { stance = 'pro'; stanceTarget = proMatch[1].trim(); }
  else if (contraMatch) { stance = 'contra'; stanceTarget = contraMatch[1].trim(); }

  // ── Parse votes (rate_solutions task) ──────────────────────────────────────
  let voteResults = null;
  const votesBlockMatch = text.match(/VOTES:\s*\n([\s\S]+?)(?:\n\n|$)/);
  if (votesBlockMatch) {
    voteResults = [];
    for (const line of votesBlockMatch[1].trim().split('\n')) {
      const m = line.match(/^(\d+):([+-]?\d+)/);
      if (m) voteResults.push({ index: parseInt(m[1]) - 1, score: parseInt(m[2]) });
    }
    content = content.replace(/VOTES:\s*\n[\s\S]+?(?:\n\n|$)/, '').trim();
  }

  // ── Parse comment upvote ────────────────────────────────────────────────────
  let upvoteTarget = null;
  const upvoteMatch = content.match(/\bUPVOTE:\s*@?(.+)/i);
  if (upvoteMatch) {
    upvoteTarget = upvoteMatch[1].trim();
    content = content.replace(/\bUPVOTE:\s*@?.+\n?/i, '').trim();
  }

  // ── Parse verdict (close_verdict task) ─────────────────────────────────────
  let verdictClose = null;
  const verdictMatch = text.match(/^VERDICT:\s*(CLOSE|CONTINUE)/im);
  if (verdictMatch) {
    verdictClose = verdictMatch[1].toUpperCase() === 'CLOSE';
    content = content.replace(/^VERDICT:\s*(CLOSE|CONTINUE)\n?/im, '').trim();
  }

  // ── Parse CALL_VERDICT (any bot can request VerdictVictor) ─────────────────
  let callVerdict = false;
  if (/^CALL_VERDICT\b/im.test(text)) {
    callVerdict = true;
    content = content.replace(/^CALL_VERDICT\b.*\n?/im, '').trim();
  }

  // ── Parse poll creation (create_poll task) ─────────────────────────────────
  if (task === 'create_poll' || task === 'vote_poll') {
    console.log(`[Poll] task=${task}, text length=${text.length}, first 200 chars: ${text.slice(0, 200)}`);
  }
  let pollQuestion = null;
  let pollOptions = null;
  // Strip markdown formatting that local LLMs often add: **bold**, code fences
  const cleanText = text
    .replace(/```[\s\S]*?```/g, m => m.replace(/```\w*\n?/g, '').replace(/```/g, ''))
    .replace(/\*\*(POLL_QUESTION|POLL_OPTIONS|POLL_VOTE):\*\*/g, '$1:')
    .replace(/\*\*(POLL_QUESTION|POLL_OPTIONS|POLL_VOTE)\*\*:/g, '$1:');
  const pollQMatch = cleanText.match(/^POLL_QUESTION:\s*(.+)/im);
  const pollOptsMatch = cleanText.match(/POLL_OPTIONS:\s*\n([\s\S]+?)(?:\n\n|$)/);
  if (pollQMatch && pollOptsMatch) {
    pollQuestion = pollQMatch[1].trim();
    pollOptions = [];
    for (const line of pollOptsMatch[1].trim().split('\n')) {
      const m = line.match(/^\s*\**\d+[\.\):]\s*(.+)/);
      if (m) pollOptions.push(m[1].trim().replace(/^\*\*(.+)\*\*$/, '$1'));
    }
    content = content
      .replace(/\*{0,2}POLL_QUESTION:?\*{0,2}\s*.+\n?/im, '')
      .replace(/\*{0,2}POLL_OPTIONS:?\*{0,2}\s*\n[\s\S]+?(?:\n\n|$)/, '')
      .trim();
    console.log(`[Poll] Parsed: question="${pollQuestion}", options=[${pollOptions.join(', ')}]`);
  } else if (task === 'create_poll') {
    // Fallback: try to extract poll from natural-language response (tables, numbered lists, emoji lists)
    console.warn(`[Poll] Marker nicht gefunden, versuche Fallback-Parsing...`);
    // Try to find a question (line ending with ?)
    const questionMatch = cleanText.match(/(?:Frage|Abstimmung|Poll)[^\n]*?:\s*(.+\?)/i)
      || cleanText.match(/^(.+\?)$/m);
    // Try to find numbered options: "1. ...", "1) ...", "1️⃣ ...", "| 1 | ..." etc.
    const optionLines = [];
    const optionRegex = /^\s*(?:[\|\s]*(?:\d+[️⃣]*[\)\.:│\|]|[\-\*•])\s+)(.+)/gm;
    let optMatch;
    while ((optMatch = optionRegex.exec(cleanText)) !== null) {
      const opt = optMatch[1].trim()
        .replace(/^\*\*(.+)\*\*$/, '$1')
        .replace(/\|\s*$/, '').trim();
      if (opt && opt.length > 2 && !opt.match(/^[\-\|\s]+$/)) optionLines.push(opt);
    }
    // Also try markdown table rows: | Option | Description |
    if (optionLines.length < 2) {
      const tableRows = cleanText.match(/^\|[^|]+\|[^|]+\|$/gm) || [];
      for (const row of tableRows) {
        // Skip header/separator rows
        if (row.match(/^[\|\s\-:]+$/) || row.match(/Option|Kurzbeschreibung|Nr/i)) continue;
        const cells = row.split('|').map(c => c.trim()).filter(c => c);
        if (cells.length >= 2) {
          const optText = cells.slice(0, 2).join(' — ').replace(/^\*\*(.+)\*\*$/, '$1').replace(/[️⃣\d]+\s*/, '').trim();
          if (optText.length > 2) optionLines.push(optText);
        }
      }
    }
    if (questionMatch && optionLines.length >= 2) {
      pollQuestion = questionMatch[1].trim();
      pollOptions = optionLines.slice(0, 6); // max 6 options
      console.log(`[Poll] Fallback OK: question="${pollQuestion}", options=[${pollOptions.join(', ')}]`);
    } else {
      console.warn(`[Poll] PARSE FAILED — question=${!!questionMatch}, options=${optionLines.length}. Raw text:\n${text.slice(0, 500)}`);
    }
  }

  // ── Parse poll vote (vote_poll task) ───────────────────────────────────────
  let pollVote = null;
  const pollVoteMatch = cleanText.match(/^POLL_VOTE:\s*(\d+)/im);
  if (pollVoteMatch) {
    pollVote = parseInt(pollVoteMatch[1]);
    content = content.replace(/\*{0,2}POLL_VOTE:?\*{0,2}\s*\d+\n?/im, '').trim();
  } else if (task === 'vote_poll') {
    console.warn(`[Poll] VOTE PARSE FAILED — raw text:\n${text.slice(0, 500)}`);
  }

  return { content, solution, solutionType, stance, stanceTarget, voteResults, upvoteTarget, verdictClose, callVerdict, pollQuestion, pollOptions, pollVote };
}

async function generateBotConfig({ description, apiKey, model = DEFAULT_GEMINI_MODEL }) {
  const selectedModel = typeof model === 'string' && model.trim() ? model.trim() : DEFAULT_GEMINI_MODEL;
  const useOllama = isOllamaModel(selectedModel);
  const useLmStudio = isLmStudioModel(selectedModel);

  if (!useOllama && !useLmStudio && !apiKey) {
    throw new Error('Kein API-Key konfiguriert.');
  }

  const prompt = `Du bist ein Bot-Designer fuer ein deutschsprachiges Reddit-style AI-Diskussionsforum.
Der User beschreibt, was fuer einen Bot er will. Erstelle daraus eine vollstaendige Bot-Konfiguration.

**USER-BESCHREIBUNG:**
${description}

Antworte NUR mit einem JSON-Objekt (kein Markdown, kein Codeblock, nur das reine JSON):
{
  "name": "EinzigartigerBotName (CamelCase, kreativ, max 20 Zeichen)",
  "avatar": "ein passendes Emoji",
  "color": "#HexFarbe passend zur Persoenlichkeit",
  "flair": "Kurzer Titel/Rolle (max 30 Zeichen, auf Deutsch)",
  "karma": Zahl zwischen 1000 und 50000,
  "personality": "Ausfuehrliche Persoenlichkeitsbeschreibung auf Deutsch. Beginne mit 'Du bist [Name], ...' und beschreibe Sprechstil, typische Redewendungen, Perspektive, Staerken und Eigenheiten. Mindestens 3 Saetze."
}`;

  let text = '';
  if (useOllama) {
    text = await generateWithOllama({ model: selectedModel, prompt, threadAttachments: [], localBaseUrl: DEFAULT_OLLAMA_BASE_URL });
  } else if (useLmStudio) {
    text = await generateWithLmStudio({ model: selectedModel, prompt, threadAttachments: [], localBaseUrl: DEFAULT_LMSTUDIO_BASE_URL });
  } else {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: selectedModel,
      contents: [{ text: prompt }],
    });
    text = response.text || '';
  }

  // Extract JSON from response (handle possible markdown wrapping)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('KI hat kein valides JSON zurueckgegeben.');

  const config = JSON.parse(jsonMatch[0]);

  // Validate required fields
  if (!config.name || !config.personality) {
    throw new Error('KI-Antwort fehlen Pflichtfelder (name, personality).');
  }

  return {
    name: String(config.name).trim().slice(0, 60),
    avatar: String(config.avatar || '🤖').trim().slice(0, 10),
    color: String(config.color || '#8B949E').trim().slice(0, 20),
    flair: String(config.flair || 'Custom Bot').trim().slice(0, 120),
    karma: typeof config.karma === 'number' ? Math.max(0, Math.min(100000, config.karma)) : 5000,
    personality: String(config.personality).trim().slice(0, 2000),
  };
}

// ── Bot Learning: research the web based on bot personality ────────────────────
async function generateBotLearning({ bot, apiKey, model = DEFAULT_GEMINI_MODEL, existingTopics = [], localBaseUrl = DEFAULT_LOCAL_BASE_URL, tavilyApiKey = '', lang = 'de' }) {
  const selectedModel = typeof model === 'string' && model.trim() ? model.trim() : DEFAULT_GEMINI_MODEL;
  const useOllama = isOllamaModel(selectedModel);
  const useLmStudio = isLmStudioModel(selectedModel);
  const useLocal = useOllama || useLmStudio;
  const p = getPromptLang(lang);

  if (!useLocal && !apiKey) {
    throw new Error(p.learningNoApiKey);
  }

  const existingNote = existingTopics.length > 0
    ? `\n\n${p.learningExistingNote}:\n${existingTopics.join('\n')}`
    : '';

  const opinionNote = bot.opinion
    ? `\n\n${p.opinionCurrentLabel || 'YOUR CURRENT OPINION'}:\n${bot.opinion}`
    : '';

  const prompt = `${p.learningSystemOverride}

${p.learningPersonality}:
${bot.personality}${opinionNote}

---

${p.learningMission.replace('{name}', bot.name)}

${p.learningTask}:
${p.learningTaskItems}
- ${p.learningDefaultExample.replace('{name}', bot.name)}

${p.learningRulesHeader}:
- ${p.learningRuleRelevant.replace('{name}', bot.name)}
- ${p.learningRuleTopic}
- ${p.learningRuleContent}
- ${p.learningRuleThesis}
- ${p.learningRuleData}
- ${p.learningRuleSource}
- ${p.learningRuleFormat}${existingNote}

${p.learningFindNew}

${p.learningJsonOnly}:
[
  {
    "topic": "...",
    "content": "...",
    "thesis": "...",
    "source": "https://url"
  }
]`;

  let text = '';
  if (useLocal) {
    text = useOllama
      ? await generateWithOllama({ model: selectedModel, prompt, threadAttachments: [], localBaseUrl, tavilyApiKey })
      : await generateWithLmStudio({ model: selectedModel, prompt, threadAttachments: [], localBaseUrl, tavilyApiKey });
  } else {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: LEARNING_MODEL,
      contents: [{ text: prompt }],
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
    text = (response.text || '').trim();
  }
  // Try array first, then single object
  const arrayMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
  const objMatch = text.match(/\{[\s\S]*\}/);

  let results = [];
  if (arrayMatch) {
    results = JSON.parse(arrayMatch[0]);
  } else if (objMatch) {
    results = [JSON.parse(objMatch[0])];
  } else {
    throw new Error(p.learningNoValidJson);
  }

  if (!Array.isArray(results) || results.length === 0) {
    throw new Error(p.learningEmptyResult);
  }

  return results.slice(0, 3).filter(r => r.topic && r.content).map(r => ({
    topic: String(r.topic).trim(),
    content: r.thesis ? `${String(r.content).trim()} | THESE: ${String(r.thesis).trim()}` : String(r.content).trim(),
    source: r.source ? String(r.source).trim() : null,
  }));
}

// ── Consolidate/compress bot memory via LLM ─────────────────────────────────────
async function consolidateBotMemory({ bot, entries, apiKey, model = DEFAULT_GEMINI_MODEL, localBaseUrl = DEFAULT_LOCAL_BASE_URL, tavilyApiKey = '', lang = 'de' }) {
  const selectedModel = typeof model === 'string' && model.trim() ? model.trim() : DEFAULT_GEMINI_MODEL;
  const useOllama = isOllamaModel(selectedModel);
  const useLmStudio = isLmStudioModel(selectedModel);
  const useLocal = useOllama || useLmStudio;
  const p = getPromptLang(lang);

  if (!useLocal && !apiKey) return null;
  if (entries.length < 5) return null;

  const lines = entries.map(e => {
    const src = e.source ? ` | ${e.source}` : '';
    return `${e.content}${src}`;
  }).join('\n');

  const maxEntries = Math.max(15, Math.ceil(entries.length * 0.6));

  const prompt = `${p.consolidateOverride}

${p.consolidateIntro.replace('{name}', bot.name)}:
${bot.personality}

${p.consolidateLog.replace('{count}', String(entries.length))}:
${lines}

---

${p.consolidateTask.replace('{name}', bot.name)}:
${p.consolidateRules.replace(/\{name\}/g, bot.name)}
- ${p.consolidateTarget.replace('{max}', String(maxEntries))}

${p.learningJsonOnly}:
[
  { "topic": "...", "content": "...", "source": "https://url" }
]`;

  let text = '';
  if (useLocal) {
    text = useOllama
      ? await generateWithOllama({ model: selectedModel, prompt, threadAttachments: [], localBaseUrl, tavilyApiKey })
      : await generateWithLmStudio({ model: selectedModel, prompt, threadAttachments: [], localBaseUrl, tavilyApiKey });
  } else {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: LEARNING_MODEL,
      contents: [{ text: prompt }],
    });
    text = (response.text || '').trim();
  }

  const arrayMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (!arrayMatch) return null;

  const results = JSON.parse(arrayMatch[0]);
  if (!Array.isArray(results) || results.length === 0) return null;

  return results.filter(r => r.topic && r.content).map(r => ({
    topic: String(r.topic).trim(),
    content: String(r.content).trim(),
    source: r.source ? String(r.source).trim() : null,
    learnedAt: new Date().toISOString(),
  }));
}

// ── Determine bot join probabilities for a new thread ─────────────────────────
async function generateBotProbabilities({ problem, bots, apiKey, model = DEFAULT_GEMINI_MODEL, localBaseUrl = DEFAULT_LOCAL_BASE_URL, tavilyApiKey = '' }) {
  const selectedModel = typeof model === 'string' && model.trim() ? model.trim() : DEFAULT_GEMINI_MODEL;
  const useOllama = isOllamaModel(selectedModel);
  const useLmStudio = isLmStudioModel(selectedModel);
  const useLocal = useOllama || useLmStudio;

  if (!useLocal && !apiKey) {
    throw new Error('Kein API-Key für Bot-Wahrscheinlichkeiten konfiguriert.');
  }

  const botList = bots.map(b => `- ${b.name} (${b.flair}): ${b.personality.slice(0, 100)}`).join('\n');

  const prompt = `Du bist ein Thread-Routing-System. Ein User hat folgendes Problem gepostet:

"${problem}"

Folgende Bots stehen zur Verfügung:
${botList}

Bewerte für JEDEN Bot, wie relevant er für dieses konkrete Problem ist.
Vergib eine Wahrscheinlichkeit von 0.0 bis 1.0 (wie wahrscheinlich sollte dieser Bot dem Thread beitreten).

Antworte NUR mit einem JSON-Objekt (kein Markdown, kein Codeblock, nur das reine JSON):
{
  "BotName": 0.85,
  "AndererBot": 0.3
}

Jeder Bot MUSS im JSON vorkommen. Werte zwischen 0.1 und 1.0 vergeben.`;

  let text = '';
  if (useLocal) {
    text = useOllama
      ? await generateWithOllama({ model: selectedModel, prompt, threadAttachments: [], localBaseUrl, tavilyApiKey })
      : await generateWithLmStudio({ model: selectedModel, prompt, threadAttachments: [], localBaseUrl, tavilyApiKey });
  } else {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: LEARNING_MODEL,
      contents: [{ text: prompt }],
    });
    text = (response.text || '').trim();
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Bot-Wahrscheinlichkeiten: Kein valides JSON.');

  const parsed = JSON.parse(jsonMatch[0]);

  // Map back to bot IDs
  const nameToId = {};
  for (const b of bots) nameToId[b.name] = b.id;

  const probabilities = {};
  for (const [name, prob] of Object.entries(parsed)) {
    const id = nameToId[name];
    if (id) {
      probabilities[id] = Math.max(0.05, Math.min(1.0, Number(prob) || 0.5));
    }
  }

  // Ensure all bots have a probability (fallback 0.5)
  for (const b of bots) {
    if (!(b.id in probabilities)) probabilities[b.id] = 0.5;
  }

  return probabilities;
}

// ── Translate a single bot to target language ─────────────────────────────────
const LANG_LABELS = { de: 'Deutsch', en: 'English', zh: '中文', hi: 'हिन्दी', es: 'Español', fr: 'Français', ar: 'العربية', pt: 'Português' };

async function translateSingleBot({ bot, targetLang, apiKey, model = DEFAULT_GEMINI_MODEL, localBaseUrl = DEFAULT_LOCAL_BASE_URL }) {
  const selectedModel = typeof model === 'string' && model.trim() ? model.trim() : DEFAULT_GEMINI_MODEL;
  const useOllama = isOllamaModel(selectedModel);
  const useLmStudio = isLmStudioModel(selectedModel);
  if (!useOllama && !useLmStudio && !apiKey) throw new Error('No API key configured.');

  const langLabel = LANG_LABELS[targetLang] || targetLang;

  const prompt = `Translate this bot profile to ${langLabel} (language code: ${targetLang}).
Keep the bot name creative but translate it appropriately into ${langLabel}.
Keep the personality style and tone intact, just translate the language.
IMPORTANT: Return ONLY a valid JSON object, no markdown, no code blocks.

Bot:
- Name: ${bot.name}
- Flair: ${bot.flair}
- Personality: ${bot.personality}

Return a JSON object: { "name": "translated name", "flair": "translated flair", "personality": "translated personality" }`;

  let text = '';
  if (useOllama) {
    text = await generateWithOllama({ model: selectedModel, prompt, threadAttachments: [], localBaseUrl: DEFAULT_OLLAMA_BASE_URL });
  } else if (useLmStudio) {
    text = await generateWithLmStudio({ model: selectedModel, prompt, threadAttachments: [], localBaseUrl: localBaseUrl || DEFAULT_LMSTUDIO_BASE_URL });
  } else {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: selectedModel,
      contents: [{ text: prompt }],
    });
    text = response.text || '';
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`LLM did not return valid JSON for bot ${bot.id}.`);
  const result = JSON.parse(jsonMatch[0]);
  if (typeof result !== 'object' || !result.name) throw new Error(`Invalid translation result for bot ${bot.id}.`);
  return result;
}

// ── Generate/update bot opinion based on learned knowledge ────────────────────
async function generateBotOpinion({ bot, memories, apiKey, model = DEFAULT_GEMINI_MODEL, localBaseUrl = DEFAULT_LOCAL_BASE_URL, lang = 'de' }) {
  const selectedModel = typeof model === 'string' && model.trim() ? model.trim() : DEFAULT_GEMINI_MODEL;
  const useOllama = isOllamaModel(selectedModel);
  const useLmStudio = isLmStudioModel(selectedModel);
  const useLocal = useOllama || useLmStudio;
  const p = getPromptLang(lang);

  if (!useLocal && !apiKey) return null;
  if (memories.length === 0 && !bot.opinion) return null;

  const memoryList = memories.slice(0, 20).map(m => `- ${m.content}`).join('\n');
  const previousOpinion = bot.opinion ? `\n\n${p.opinionPrevious}:\n${bot.opinion}` : '';

  const prompt = `${p.opinionSystemOverride}

${p.opinionPersonality}:
${bot.personality}

${p.opinionKnowledge}:
${memoryList}${previousOpinion}

---

${p.opinionTask.replace('{name}', bot.name)}

${p.opinionRules}

${p.opinionFormat}`;

  let text = '';
  if (useLocal) {
    text = useOllama
      ? await generateWithOllama({ model: selectedModel, prompt, threadAttachments: [], localBaseUrl: DEFAULT_OLLAMA_BASE_URL })
      : await generateWithLmStudio({ model: selectedModel, prompt, threadAttachments: [], localBaseUrl: localBaseUrl || DEFAULT_LMSTUDIO_BASE_URL });
  } else {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: selectedModel,
      contents: [{ text: prompt }],
    });
    text = (response.text || '').trim();
  }

  // Clean up: remove markdown code blocks if present
  text = text.replace(/^```[\s\S]*?\n/m, '').replace(/\n```$/m, '').trim();
  if (!text || text.length < 10) return null;
  return text;
}

module.exports = { generateBotResponse, generateBotConfig, generateBotLearning, consolidateBotMemory, generateBotProbabilities, translateSingleBot, generateBotOpinion };

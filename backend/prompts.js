/**
 * prompts.js — LLM-Aufgaben-Instruktionen (Prompt-Templates).
 *
 * Jede Bot-Aufgabe (task) hat eine spezifische Instruktion die dem LLM sagt,
 * was der Bot tun soll. Die Instruktionen werden in generateBotResponse()
 * in den Prompt eingebaut.
 *
 * Aufgaben-Kategorien:
 * - Analyse:   analyze
 * - Lösungen:  tech_solution, org_solution
 * - Debatte:   pro_argument, contra_argument
 * - Meta:      moderate, rate_solutions, upvote_comments, synthesize, conclude
 * - Abstimmung: create_poll, vote_poll
 * - Reaktion:  react_to_user, direct_reply, bot_direct_reply
 * - Urteil:    close_verdict
 */

const { getPromptLang } = require('./prompts-lang');

// Language name map for the ruleLanguage template
const LANG_NAMES = {
  de: 'Deutsch', en: 'English', zh: '中文', hi: 'हिन्दी',
  es: 'Español', fr: 'Français', ar: 'العربية', pt: 'Português',
};

/**
 * Gibt die Aufgaben-Instruktion für einen Task zurück.
 * @param {string} task - Der Task-Typ
 * @param {object} options - Kontext-Daten
 * @param {object[]} options.solutions - Vorhandene Lösungen
 * @param {object} options.bot - Der aktuelle Bot
 * @returns {string} Die Aufgaben-Instruktion
 */
function getTaskInstruction(task, { solutions = [], bot = {}, lang = 'de' } = {}) {
  const p = getPromptLang(lang);
  switch (task) {
    case 'analyze':
      return p.analyze;

    case 'tech_solution':
      return p.tech_solution;

    case 'org_solution':
      return p.org_solution;

    case 'pro_argument':
      return p.pro_argument;

    case 'contra_argument':
      return p.contra_argument;

    case 'moderate':
      return p.moderate;

    case 'rate_solutions': {
      const solutionsList = solutions.length > 0
        ? solutions.map((s, i) =>
            `${p.solutionLabel} ${i + 1} [${s.type === 'org' ? p.orgLabel : p.techLabel}]:\n${s.content}`
          ).join('\n\n')
        : p.noSolutionsYet;

      return `${p.rate_solutions_prefix} ${bot.name}. ${p.rate_solutions_scale}

${solutionsList}

${p.rate_solutions_format}`;
    }

    case 'synthesize':
      return p.synthesize;

    case 'conclude':
      return p.conclude;

    case 'react_to_user':
      return p.react_to_user;

    case 'direct_reply':
      return `${p.direct_reply_prefix} ${bot.name}.`;

    case 'bot_direct_reply':
      return `${p.bot_direct_reply_prefix} ${bot.name}.`;

    case 'close_verdict': {
      const solutionsSummary = solutions.length > 0
        ? solutions.map((s, i) =>
            `${p.solutionLabel} ${i + 1} (${s.type === 'org' ? 'Org' : 'Tech'}, ${s.votes >= 0 ? '+' : ''}${s.votes} Pkt): ${s.content.slice(0, 80)}...`
          ).join('\n')
        : p.close_verdict_no_solutions;

      return `${p.close_verdict_intro}

${solutionsSummary}

${p.close_verdict_warning}

${p.close_verdict_format}`;
    }

    case 'create_poll': {
      const solutionsList = solutions.length > 0
        ? solutions.map((s, i) =>
            `${p.solutionLabel} ${i + 1} [${s.type === 'org' ? p.orgLabel : p.techLabel}]: ${s.content.slice(0, 100)}`
          ).join('\n')
        : p.noSolutionsYet;

      return `${p.create_poll_intro}

${solutionsList}

${p.create_poll_format}`;
    }

    case 'vote_poll': {
      const pollQuestion = bot._pollQuestion || 'Abstimmung';
      const pollOptions = bot._pollOptions || [];
      const optionsList = pollOptions.map((o, i) => `${i + 1}: ${o}`).join('\n');

      return `${p.vote_poll_intro}

${p.vote_poll_question_label}: ${pollQuestion}
${p.vote_poll_options_label}:
${optionsList}

${p.vote_poll_format_prefix} ${bot.name}${p.vote_poll_format_suffix}`;
    }

    case 'upvote_comments':
      return `${p.upvote_comments}

${p.upvote_format_prefix} ${bot.name}${p.upvote_format_suffix}`;

    default:
      return p.default_task;
  }
}

/**
 * Baut den vollständigen Prompt für einen Bot-Response auf.
 * Kombiniert: Persönlichkeit + Kontext + Diskussions-Historie + Task-Instruktion + Regeln.
 */
function buildBotPrompt({ bot, problem, threadAttachments = [], conversationHistory = [], task, solutions = [], personalityOverride = null, similarThreads = [], botMemory = [], lang = 'de' }) {
  const p = getPromptLang(lang);
  const langName = LANG_NAMES[lang] || 'Deutsch';
  const personality = personalityOverride || bot.personality;

  // Diskussions-Historie formatieren
  const historyText = conversationHistory.length > 0
    ? conversationHistory.map(c => {
        let text = `**${c.botName}:** ${c.content}`;
        if (c.attachments?.length > 0) {
          const descs = c.attachments.map(a => {
            if (a.mimeType.startsWith('image/')) return `[Bild: ${a.originalName}]`;
            if (a.mimeType === 'application/pdf') return `[PDF: ${a.originalName}]`;
            return `[Datei: ${a.originalName}]`;
          }).join(', ');
          text += `\n📎 ${descs}`;
        }
        return text;
      }).join('\n\n')
    : p.noDiscussionYet;

  // Aufgaben-Instruktion
  const taskInstruction = getTaskInstruction(task, { solutions, bot, lang });

  // Optionale Kontext-Blöcke
  const attachmentNotice = threadAttachments.length > 0
    ? `\n\n**${p.attachedFiles}:** ${p.attachedFilesNote.replace('{count}', threadAttachments.length)}`
    : '';

  const similarThreadsNotice = similarThreads.length > 0
    ? `\n\n**${p.similarThreads}:**\n${similarThreads.map(t => {
        const statusLabel = t.status === 'resolved' ? p.statusResolved : t.status === 'discussing' ? p.statusDiscussing : p.statusOpen;
        const solutionHint = t.topSolution ? ` — Top: ${t.topSolution.content.slice(0, 80)}...` : '';
        return `- [${t.problem.slice(0, 60)}${t.problem.length > 60 ? '...' : ''}](thread:${t.id}) (${statusLabel}, ${t.commentCount} ${p.commentsCount || 'Kommentare'}${solutionHint})`;
      }).join('\n')}`
    : '';

  const botMemoryNotice = botMemory.length > 0
    ? `\n\n**${p.botMemoryHeader}:**\n${botMemory.slice(0, 15).map(m => `- ${m.content}${m.source ? ` [Quelle](${m.source})` : ''}`).join('\n')}\n${p.botMemoryFooter.replace('{name}', bot.name)}`
    : '';

  const botOpinionNotice = bot.opinion
    ? `\n\n**${p.botOpinionHeader || 'DEINE GRUNDSÄTZLICHE MEINUNG'}:**\n${bot.opinion}\n${(p.botOpinionFooter || 'Diese Meinung basiert auf deinem recherchierten Wissen. Nutze sie als Basis für deine Argumentation.').replace('{name}', bot.name)}`
    : '';

  return `${personality}

---

${p.forumContext}

**${p.userProblem}:**
> ${problem}${attachmentNotice}${similarThreadsNotice}${botMemoryNotice}${botOpinionNotice}

**${p.previousDiscussion}:**
${historyText}

---

**${p.yourTask}:** ${taskInstruction}

**${p.rules}:**
- ${p.ruleLanguage.replace('{lang}', langName)}
- ${p.ruleStayInRole.replace('{name}', bot.name)}
- ${p.ruleLength}
- ${p.ruleMarkdown}
- ${p.ruleNoSelfName}
- ${p.ruleAuthentic}
- ${p.ruleNoRepeat}
- ${p.ruleNoSelfReply}
- ${p.ruleSearch}
- ${p.ruleSources}
- ${p.ruleUpvote}
- ${p.ruleCallVerdict}
- ${p.ruleAttachments}

${p.responseLabel}:`;
}

module.exports = { getTaskInstruction, buildBotPrompt };

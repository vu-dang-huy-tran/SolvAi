/**
 * prompts-lang.js — Sprachabhängige Prompt-Templates und Instruktionen.
 *
 * Enthält alle sprachabhängigen Texte, die in den LLM-Prompts verwendet werden.
 * Die Sprache wird über `lang` gesteuert (Default: 'de').
 */

const PROMPT_TRANSLATIONS = {
  // ─── Deutsch (Standard) ─────────────────────────────────────────────────────
  de: {
    respondLanguage: 'Deutsch',
    analyze: 'Analysiere dieses Problem aus deiner einzigartigen Perspektive. Was ist das Kernproblem? Was steckt wirklich dahinter? Noch keine Lösungen vorschlagen — nur analysieren.',
    tech_solution: `Schlage eine konkrete TECHNISCHE Lösung für dieses Problem vor. Denke an: Apps, Tools, Software, Automatisierung, digitale Systeme, technische Prozesse, Geräte. Nenne spezifische Tool-/App-Namen.

Verwende genau dieses Format:
SOLUTION:
[deine technische Lösung hier — konkret und umsetzbar]

SOLUTION_TYPE: TECH

Dann 1-2 Sätze Kommentar darunter.`,
    org_solution: `Schlage eine konkrete ORGANISATORISCHE Lösung vor. Denke an: Gewohnheiten, Routinen, Kommunikationsstrategien, Teamstrukturen, Planungsmethoden, Delegation, Workflows, Verhaltensänderungen. Keine Technik nötig.

Verwende genau dieses Format:
SOLUTION:
[deine organisatorische Lösung hier — konkret und umsetzbar]

SOLUTION_TYPE: ORG

Dann 1-2 Sätze Kommentar darunter.`,
    pro_argument: `Schau dir die bisher vorgeschlagenen Lösungen an. Wähle die vielversprechendste aus und argumentiere STARK DAFÜR. Sei konkret, warum sie funktioniert.

Beginne deine Antwort EXAKT so:
PRO: [kurzer Name der Lösung, die du verteidigst]

Dann 3-5 Sätze Argumentation. Nenne echte Vorteile, stütze dich auf Logik oder Erfahrung.`,
    contra_argument: `Schau dir die bisher vorgeschlagenen Lösungen an. Wähle eine aus und argumentiere STARK DAGEGEN — weise auf Schwächen, Risiken oder Grenzen hin. Sei konkret.

Beginne deine Antwort EXAKT so:
CONTRA: [kurzer Name der Lösung, die du angreifst]

Dann 3-5 Sätze Argumentation. Nenne echte Risiken, Schwachstellen oder warum es nicht für alle funktioniert.`,
    moderate: `Du bist der neutrale Moderator dieses Threads. Fasse ALLE bisher genannten Pro- und Contra-Argumente vollständig und sachlich zusammen — kein eigener Standpunkt, keine Wertung.

Verwende exakt diese Struktur:

**📌 Zusammenfassung der Diskussion**

**✅ Pro-Argumente:**
- [Argument 1]
- [Argument 2]
(alle genannten Pro-Argumente auflisten)

**❌ Contra-Argumente:**
- [Argument 1]
- [Argument 2]
(alle genannten Contra-Argumente auflisten)

Halte jeden Punkt kurz (1 Satz). Vollständigkeit ist wichtiger als Kürze.`,
    rate_solutions_prefix: 'Bewerte die vorgeschlagenen Lösungen aus deiner Perspektive als',
    rate_solutions_scale: `Vergib für jede Lösung eine Punktzahl:
+2 = ausgezeichnet, stark empfohlen
+1 = gut, würde helfen
 0 = neutral
-1 = schwach, hat Probleme
-2 = schlecht, würde ich ablehnen`,
    rate_solutions_format: `Antworte EXAKT in diesem Format (eine Zeile pro Lösung):
VOTES:
1:+2
2:-1

Dann 1-2 Sätze Begründung deiner Bewertung.`,
    solutionLabel: 'Lösung',
    orgLabel: 'Organisatorisch',
    techLabel: 'Technisch',
    noSolutionsYet: '*(Noch keine Lösungen vorgeschlagen)*',
    synthesize: 'Die Diskussion hat Lösungen und Pro/Contra-Argumente hervorgebracht. Wäge jetzt ehrlich ab. Welche Lösung ist insgesamt am stärksten? Gib eine klare Empfehlung mit Begründung. Sei ausgewogen, aber entschieden.',
    conclude: 'Gib deine abschließende persönliche Einschätzung. Was ist dein wichtigster Rat für die Person, die dieses Problem gepostet hat? Sprich sie direkt an. Mach es einprägsam und umsetzbar.',
    react_to_user: 'Der User hat sich gerade in die Diskussion eingeschaltet und neuen Input gegeben (der letzte Kommentar von "👤 User"). Reagiere direkt darauf! Geh auf seinen spezifischen Punkt ein, beantworte seine Frage, oder bau seine Idee aus — aus deiner charakteristischen Perspektive. Sei konkret und persönlich.',
    direct_reply_prefix: 'Der User hat DIREKT AN DICH eine Antwort geschrieben (der letzte Kommentar von "👤 User" ist eine direkte Antwort auf deine Nachricht). Du musst jetzt antworten! Geh explizit auf das ein, was der User dir gesagt hat — beantworte seine Frage, reagiere auf seinen Widerspruch, oder vertiefe deine Position. Sprich ihn direkt an ("Du hast recht...", "Guter Punkt...", "Das sehe ich anders..." o.ä.). Bleib in deiner Rolle als',
    bot_direct_reply_prefix: 'Ein anderer Bot hat DIREKT AUF DEINE letzte Nachricht geantwortet (schau dir den letzten Kommentar an, der auf dich antwortet). Reagiere direkt darauf — widersprich, stimme zu, oder vertiefe deinen Standpunkt. Nenn den anderen Bot beim Namen wenn nötig. Kurz und schlagfertig, typisch für',
    close_verdict_intro: `Du bist der abschließende Richter dieses Threads. Bewerte objektiv:
1. Gibt es mindestens eine konkrete Lösung?
2. Wurden Pro/Contra-Argumente diskutiert?
3. Gibt es eine klare umsetzbare Empfehlung?`,
    close_verdict_no_solutions: '*(Keine Lösungen vorgeschlagen)*',
    close_verdict_warning: 'WICHTIG: Wenn keine Lösungen vorhanden sind (steht oben "Noch keine Lösungen"), MUSS das Urteil CONTINUE sein — kein Thread darf ohne Lösung geschlossen werden.',
    close_verdict_format: `Antworte EXAKT so — erste Zeile ist das Urteil, dann Begründung:
VERDICT: CLOSE
oder
VERDICT: CONTINUE

2-3 Sätze Begründung. Bei CONTINUE: was fehlt noch?`,
    create_poll_intro: 'Du bist der Abstimmungsleiter! Erstelle eine Abstimmung basierend auf der Diskussion.',
    create_poll_format: `WICHTIG — Deine Antwort MUSS mit diesen EXAKTEN Zeilen BEGINNEN (keine Tabellen, kein Markdown, keine Emojis in diesen Zeilen!):

POLL_QUESTION: Welche Lösung sollte umgesetzt werden?
POLL_OPTIONS:
1: Erste Option hier
2: Zweite Option hier
3: Dritte Option hier

ERST DANACH darfst du 1-2 Sätze Einleitung schreiben.

NOCHMAL: Die ERSTE Zeile deiner Antwort muss "POLL_QUESTION:" sein, danach "POLL_OPTIONS:" gefolgt von nummerierten Zeilen. Kein anderes Format. Keine Tabelle. Keine Überschriften davor.`,
    vote_poll_intro: 'Es läuft eine Abstimmung im Thread! Gib deine Stimme ab.',
    vote_poll_question_label: 'ABSTIMMUNGSFRAGE',
    vote_poll_options_label: 'OPTIONEN',
    vote_poll_format_prefix: 'Antworte EXAKT so — erste Zeile ist deine Wahl, dann kurze Begründung:\nPOLL_VOTE: [Nummer der Option, z.B. 1 oder 2 oder 3]\n\n1-2 Sätze warum du diese Option wählst — aus deiner Perspektive als',
    vote_poll_format_suffix: '. Bleib in deiner Rolle!',
    upvote_comments: 'Schau dir die bisherige Diskussion an und wähle EINEN Kommentar, den du besonders gut, hilfreich oder treffend findest. Gib diesem Kommentar ein Upvote.',
    upvote_format_prefix: 'Antworte EXAKT so — erste Zeile ist dein Upvote:\nUPVOTE: @BotName (der Bot dessen Kommentar du am besten findest)\n\n1 kurzer Satz warum du diesen Kommentar hochvotest — aus deiner Perspektive als',
    upvote_format_suffix: '. Bleib in deiner Rolle! Wähle nicht dich selbst.',
    default_task: 'Reagiere auf die laufende Diskussion. Füge deine Perspektive hinzu, stimme zu oder widerspreche, bau auf dem auf, was andere gesagt haben.',
    // buildBotPrompt
    forumContext: 'Du nimmst an einem Community-Diskussionsforum teil, wo echte Menschen ihre Probleme posten. Du und andere KI-Bots mit verschiedenen Persönlichkeiten helft dabei, Lösungen zu finden und zu debattieren.',
    userProblem: 'PROBLEM DES USERS',
    attachedFiles: 'ANGEHÄNGTE DATEIEN',
    attachedFilesNote: 'Der User hat {count} Datei(en) angehängt (Bilder/PDFs). Du kannst sie sehen und darauf Bezug nehmen.',
    similarThreads: 'ÄHNLICHE THREADS IM FORUM',
    botMemoryHeader: 'DEINE RECHERCHIERTEN ARGUMENTE & THESEN (nutze sie aktiv!)',
    botMemoryFooter: 'Das ist DEINE Munition! Nutze diese Fakten, Thesen und Quellen AKTIV in deinen Argumenten.',
    previousDiscussion: 'BISHERIGE DISKUSSION',
    noDiscussionYet: '*(Du bist der Erste — noch keine Diskussion)*',
    yourTask: 'YOUR TASK',
    rules: 'REGELN',
    ruleLanguage: 'Antworte AUSSCHLIESSLICH auf {lang} — keine Ausnahmen',
    ruleStayInRole: 'Bleib vollständig in deiner Rolle als {name}',
    ruleLength: 'Deine Antwort sollte zwischen 80 und 300 Wörter lang sein — ausführlich genug um nützlich zu sein, aber nicht ausschweifend. - wie ein echter Redditor, nicht wie ein Roboter',
    ruleMarkdown: 'Schreib natürlich und direkt (Markdown erlaubt: **fett**, *kursiv*, Aufzählungen)',
    ruleNoSelfName: 'Fang nicht mit deinem eigenen Namen an',
    ruleAuthentic: 'Sei authentisch und konkret, nicht generisch',
    ruleNoRepeat: 'WIEDERHOLE NICHTS, was in der bisherigen Diskussion bereits gesagt wurde! Lies die vorherigen Kommentare sorgfältig. Wenn ein Punkt bereits gemacht wurde, beziehe dich darauf statt ihn zu wiederholen. Bringe NEUE Perspektiven, Argumente oder Informationen ein.',
    ruleNoSelfReply: 'Antworte NIEMALS auf deinen eigenen Kommentar. Beziehe dich immer auf das, was ANDERE Bots oder der User gesagt haben.',
    ruleSearch: 'Du hast Zugriff auf Google Search — nutze es wenn aktuelle Fakten, Studien, Gesetze oder Tools deine Antwort stärken',
    ruleSources: 'Wenn du Tools, Gesetze, Studien oder Ressourcen nennst: gib konkrete Links oder Quellen an im Format [Name](URL)',
    ruleUpvote: 'Optional: Wenn du einen Kommentar besonders treffend findest: UPVOTE: @BotName (z.B. UPVOTE: @RealistRachel)',
    ruleCallVerdict: 'Optional: Wenn die Diskussion sich im Kreis dreht oder nichts Neues mehr kommt, kannst du den Richter rufen: CALL_VERDICT (auf einer eigenen Zeile). Nutze das nur, wenn wirklich nichts Gescheites mehr beigetragen wird.',
    ruleAttachments: 'Wenn der User Dateien angehängt hat: beziehe dich konkret auf deren Inhalt aus deiner Personalität heraus',
    responseLabel: 'Your response',
    // Bot generation prompt
    botDesigner: 'Du bist ein Bot-Designer fuer ein {lang}sprachiges Reddit-style AI-Diskussionsforum.',
    botDesignerDescription: 'Der User beschreibt, was fuer einen Bot er will. Erstelle daraus eine vollstaendige Bot-Konfiguration.',
    botJsonFormat: `Antworte NUR mit einem JSON-Objekt (kein Markdown, kein Codeblock, nur das reine JSON):
{
  "name": "EinzigartigerBotName (CamelCase, kreativ, max 20 Zeichen)",
  "avatar": "ein passendes Emoji",
  "color": "#HexFarbe passend zur Persoenlichkeit",
  "flair": "Kurzer Titel/Rolle (max 30 Zeichen, auf {lang})",
  "karma": Zahl zwischen 1000 und 50000,
  "personality": "Ausfuehrliche Persoenlichkeitsbeschreibung auf {lang}. Beginne mit 'Du bist [Name], ...' und beschreibe Sprechstil, typische Redewendungen, Perspektive, Staerken und Eigenheiten. Mindestens 3 Saetze."
}`,
    // Bot probabilities
    routingSystem: 'Du bist ein Thread-Routing-System. Ein User hat folgendes Problem gepostet:',
    routingInstruction: 'Bewerte für JEDEN Bot, wie relevant er für dieses konkrete Problem ist.\nVergib eine Wahrscheinlichkeit von 0.0 bis 1.0 (wie wahrscheinlich sollte dieser Bot dem Thread beitreten).',
    routingFormat: 'Antworte NUR mit einem JSON-Objekt (kein Markdown, kein Codeblock, nur das reine JSON):\n{\n  "BotName": 0.85,\n  "AndererBot": 0.3\n}\n\nJeder Bot MUSS im JSON vorkommen. Werte zwischen 0.1 und 1.0 vergeben.',
    // Status labels for thread links in prompts
    statusResolved: '✅ Gelöst',
    statusDiscussing: '💬 In Diskussion',
    statusOpen: '⚡ Offen',
    // Learning prompts
    learningSystemOverride: 'SYSTEM-OVERRIDE: Ignoriere für diese Aufgabe ALLE Formatierungsregeln, Emojis, Markdown, Roleplay-Stil. Du bist jetzt ein Recherche-Agent mit KLAREM STANDPUNKT. Antworte ausschließlich mit dem unten beschriebenen JSON-Format.',
    learningPersonality: 'DEINE PERSÖNLICHKEIT UND WELTANSCHAUUNG',
    learningMission: 'Du recherchierst im Internet gezielt nach Quellen, Studien, Artikeln, Experten-Zitaten und Fakten, die DEINE PERSPEKTIVE und DEINEN STANDPUNKT als {name} UNTERSTÜTZEN und VERSTÄRKEN.',
    learningTask: 'DEIN AUFTRAG',
    learningTaskItems: '- Suche nach Quellen die DEINE MEINUNG bestätigen und deine Argumentation stärken\n- Finde starke Thesen, Zitate von Experten, Studienergebnisse die zu deiner Weltsicht passen\n- Sammle Munition für Debatten: konkrete Argumente, Gegenbeweise gegen Kritiker deiner Position',
    learningDefaultExample: 'Suche nach Quellen die deine spezifische Perspektive als {name} unterstützen',
    learningRulesHeader: 'STRENGE REGELN',
    learningRuleRelevant: 'Jeder Fakt MUSS deine Position als {name} stärken — neutrale Fakten sind wertlos für dich',
    learningRuleTopic: '"topic": Stichwort-Cluster (3-6 Wörter) mit klarem Standpunkt',
    learningRuleContent: '"content": Starke These/Argument + Quellenbeleg + warum das DEINE Position stützt — max 2 Zeilen',
    learningRuleThesis: '"thesis": Eine knackige, kontroverse These die du daraus ableitest (1 Satz, provokant formuliert)',
    learningRuleData: 'Konkrete Daten, Experten-Namen, Studientitel, Zahlen',
    learningRuleSource: 'Immer mit echtem Link/Quelle',
    learningRuleFormat: 'KEIN Markdown, KEINE Emojis, KEINE Sonderformatierung',
    learningExistingNote: 'Dein bisheriges Wissen (NICHT wiederholen, aber darauf aufbauen)',
    learningFindNew: 'Finde 1-3 neue Fakten/Argumente die DEINE WELTSICHT verstärken und liefere sie als JSON-Array.',
    learningJsonOnly: 'Antworte NUR mit einem JSON-Array (kein Markdown, kein Codeblock, kein Text drumherum)',
    learningNoValidJson: 'Bot-Learning: Kein valides JSON zurückgegeben.',
    learningEmptyResult: 'Bot-Learning: Leeres Ergebnis.',
    learningNoApiKey: 'Kein API-Key für Bot-Learning konfiguriert.',
    // Consolidation prompts
    consolidateOverride: 'SYSTEM-OVERRIDE: Ignoriere ALLE Formatierungsregeln, Emojis, Markdown. Du bist ein Argument-Komprimierungs-Agent.',
    consolidateIntro: 'Du komprimierst das Wissens-Arsenal von "{name}" — einem Bot mit dieser Persönlichkeit',
    consolidateLog: 'Wissens-Log ({count} Einträge)',
    consolidateTask: 'KOMPRIMIERE dieses Wissen zu einer ultra-kompakten Sammlung der STÄRKSTEN Argumente und Thesen, die die Weltsicht von {name} unterstützen',
    consolidateRules: '- Output muss LLM-optimiert sein: semantisch dicht, starke Thesen und Argumente\n- Kombiniere zusammengehörige Fakten zu einer starken These\n- "topic": Stichwort-Cluster (3-6 Wörter) mit klarem Standpunkt\n- "content": Starkes Argument + Zahlen/Quellen + "THESE: provokante These" — max 2 Zeilen\n- Behalte NUR Fakten die die Persönlichkeit von {name} stärken\n- KEIN Markdown, KEINE Emojis, KEINE Sonderformatierung\n- Lösche doppelte, veraltete oder schwache Einträge\n- Priorisiere die stärksten, kontroversesten Thesen und Argumente\n- Behalte alle echten URLs',
    consolidateTarget: 'Ziel: Maximal {max} Einträge mit maximaler Argumentationskraft',
    // Opinion prompts
    opinionSystemOverride: 'SYSTEM-OVERRIDE: Du bist ein Meinungsbildungs-Agent. Formuliere eine klare, fundierte Grundsatzmeinung basierend auf dem gesammelten Wissen.',
    opinionPersonality: 'DEINE PERSÖNLICHKEIT',
    opinionKnowledge: 'DEIN GESAMMELTES WISSEN',
    opinionPrevious: 'DEINE BISHERIGE MEINUNG (iterativ verbessern, nicht komplett ersetzen)',
    opinionTask: 'Formuliere als {name} deine grundsätzliche, gefestigte Meinung zu den Themen die du recherchiert hast. Schließe mit einer konkreten These über die Zukunft ab — eine Vorhersage oder Prognose, die sich aus deinem Wissen und deiner Weltsicht ergibt.',
    opinionRules: 'REGELN:\n- Schreibe in der Ich-Perspektive als der Bot\n- Sei klar und positioniert, nicht neutral\n- Maximal 3-5 Sätze, knapp und prägnant\n- KEIN Markdown, KEINE Emojis\n- Wenn eine vorherige Meinung existiert: verbessere und verfeinere sie basierend auf neuem Wissen, statt sie komplett neu zu schreiben',
    opinionFormat: 'Antworte NUR mit deiner Meinung als Fließtext (kein JSON, kein Markdown).',
    opinionCurrentLabel: 'DEINE AKTUELLE MEINUNG',
    botOpinionHeader: 'DEINE GRUNDSÄTZLICHE MEINUNG',
    botOpinionFooter: 'Diese Meinung basiert auf deinem recherchierten Wissen. Nutze sie als Basis für deine Argumentation.',
  },

  // ─── English ────────────────────────────────────────────────────────────────
  en: {
    respondLanguage: 'English',
    analyze: 'Analyze this problem from your unique perspective. What is the core issue? What is really behind it? Do not suggest solutions yet — just analyze.',
    tech_solution: `Suggest a concrete TECHNICAL solution for this problem. Think of: apps, tools, software, automation, digital systems, technical processes, devices. Name specific tool/app names.

Use exactly this format:
SOLUTION:
[your technical solution here — concrete and actionable]

SOLUTION_TYPE: TECH

Then 1-2 sentences of commentary below.`,
    org_solution: `Suggest a concrete ORGANIZATIONAL solution. Think of: habits, routines, communication strategies, team structures, planning methods, delegation, workflows, behavior changes. No technology needed.

Use exactly this format:
SOLUTION:
[your organizational solution here — concrete and actionable]

SOLUTION_TYPE: ORG

Then 1-2 sentences of commentary below.`,
    pro_argument: `Look at the solutions proposed so far. Choose the most promising one and argue STRONGLY FOR it. Be specific about why it works.

Begin your response EXACTLY like this:
PRO: [short name of the solution you defend]

Then 3-5 sentences of argumentation. Name real advantages, rely on logic or experience.`,
    contra_argument: `Look at the solutions proposed so far. Choose one and argue STRONGLY AGAINST it — point out weaknesses, risks, or limitations. Be specific.

Begin your response EXACTLY like this:
CONTRA: [short name of the solution you attack]

Then 3-5 sentences of argumentation. Name real risks, weaknesses, or why it doesn't work for everyone.`,
    moderate: `You are the neutral moderator of this thread. Summarize ALL pro and contra arguments mentioned so far — completely and objectively — no personal stance, no judgment.

Use exactly this structure:

**📌 Discussion Summary**

**✅ Pro Arguments:**
- [Argument 1]
- [Argument 2]
(list all mentioned pro arguments)

**❌ Contra Arguments:**
- [Argument 1]
- [Argument 2]
(list all mentioned contra arguments)

Keep each point short (1 sentence). Completeness is more important than brevity.`,
    rate_solutions_prefix: 'Rate the proposed solutions from your perspective as',
    rate_solutions_scale: `Assign a score for each solution:
+2 = excellent, strongly recommended
+1 = good, would help
 0 = neutral
-1 = weak, has problems
-2 = bad, would reject`,
    rate_solutions_format: `Respond EXACTLY in this format (one line per solution):
VOTES:
1:+2
2:-1

Then 1-2 sentences explaining your rating.`,
    solutionLabel: 'Solution',
    orgLabel: 'Organizational',
    techLabel: 'Technical',
    noSolutionsYet: '*(No solutions proposed yet)*',
    synthesize: 'The discussion has produced solutions and pro/contra arguments. Weigh in honestly now. Which solution is strongest overall? Give a clear recommendation with reasoning. Be balanced but decisive.',
    conclude: 'Give your final personal assessment. What is your most important advice for the person who posted this problem? Address them directly. Make it memorable and actionable.',
    react_to_user: 'The user just joined the discussion and provided new input (the last comment by "👤 User"). React directly! Address their specific point, answer their question, or build on their idea — from your characteristic perspective. Be concrete and personal.',
    direct_reply_prefix: 'The user wrote DIRECTLY TO YOU (the last comment by "👤 User" is a direct reply to your message). You must respond now! Address explicitly what the user said — answer their question, react to their disagreement, or deepen your position. Address them directly ("You\'re right...", "Good point...", "I see it differently..." etc.). Stay in your role as',
    bot_direct_reply_prefix: 'Another bot replied DIRECTLY TO YOUR last message (look at the last comment replying to you). React to it — disagree, agree, or deepen your standpoint. Name the other bot if needed. Short and punchy, typical for',
    close_verdict_intro: `You are the final judge of this thread. Evaluate objectively:
1. Is there at least one concrete solution?
2. Were pro/contra arguments discussed?
3. Is there a clear actionable recommendation?`,
    close_verdict_no_solutions: '*(No solutions proposed)*',
    close_verdict_warning: 'IMPORTANT: If no solutions exist (says "No solutions" above), the verdict MUST be CONTINUE — no thread may be closed without a solution.',
    close_verdict_format: `Respond EXACTLY like this — first line is the verdict, then reasoning:
VERDICT: CLOSE
or
VERDICT: CONTINUE

2-3 sentences of reasoning. For CONTINUE: what is still missing?`,
    create_poll_intro: 'You are the poll master! Create a poll based on the discussion.',
    create_poll_format: `IMPORTANT — Your response MUST BEGIN with these EXACT lines (no tables, no markdown, no emojis in these lines!):

POLL_QUESTION: Which solution should be implemented?
POLL_OPTIONS:
1: First option here
2: Second option here
3: Third option here

Only AFTER that you may write 1-2 sentences of introduction.

AGAIN: The FIRST line of your response must be "POLL_QUESTION:", then "POLL_OPTIONS:" followed by numbered lines. No other format. No table. No headers before.`,
    vote_poll_intro: 'There is an active poll in the thread! Cast your vote.',
    vote_poll_question_label: 'POLL QUESTION',
    vote_poll_options_label: 'OPTIONS',
    vote_poll_format_prefix: 'Respond EXACTLY like this — first line is your choice, then brief reasoning:\nPOLL_VOTE: [number of the option, e.g. 1 or 2 or 3]\n\n1-2 sentences why you choose this option — from your perspective as',
    vote_poll_format_suffix: '. Stay in your role!',
    upvote_comments: 'Look at the discussion so far and choose ONE comment that you find especially good, helpful, or on point. Give that comment an upvote.',
    upvote_format_prefix: 'Respond EXACTLY like this — first line is your upvote:\nUPVOTE: @BotName (the bot whose comment you like best)\n\n1 short sentence why you upvote this comment — from your perspective as',
    upvote_format_suffix: '. Stay in your role! Do not choose yourself.',
    default_task: 'React to the ongoing discussion. Add your perspective, agree or disagree, build on what others have said.',
    forumContext: 'You are participating in a community discussion forum where real people post their problems. You and other AI bots with different personalities help find solutions and debate.',
    userProblem: 'USER\'S PROBLEM',
    attachedFiles: 'ATTACHED FILES',
    attachedFilesNote: 'The user has attached {count} file(s) (images/PDFs). You can see them and refer to them.',
    similarThreads: 'SIMILAR THREADS IN THE FORUM',
    botMemoryHeader: 'YOUR RESEARCHED ARGUMENTS & THESES (use them actively!)',
    botMemoryFooter: 'This is YOUR ammunition! Use these facts, theses, and sources ACTIVELY in your arguments.',
    previousDiscussion: 'PREVIOUS DISCUSSION',
    noDiscussionYet: '*(You are the first — no discussion yet)*',
    yourTask: 'YOUR TASK',
    rules: 'RULES',
    ruleLanguage: 'Respond EXCLUSIVELY in {lang} — no exceptions',
    ruleStayInRole: 'Stay fully in your role as {name}',
    ruleLength: 'Your response should be between 80 and 300 words — thorough enough to be useful, but not rambling — like a real Redditor, not a robot',
    ruleMarkdown: 'Write naturally and directly (Markdown allowed: **bold**, *italic*, bullet points)',
    ruleNoSelfName: 'Do not start with your own name',
    ruleAuthentic: 'Be authentic and specific, not generic',
    ruleNoRepeat: 'DO NOT REPEAT anything already said in the discussion! Read previous comments carefully. If a point was already made, refer to it instead of repeating it. Bring NEW perspectives, arguments, or information.',
    ruleNoSelfReply: 'NEVER reply to your own comment. Always refer to what OTHER bots or the user said.',
    ruleSearch: 'You have access to Google Search — use it when current facts, studies, laws, or tools strengthen your response',
    ruleSources: 'When mentioning tools, laws, studies, or resources: provide concrete links or sources in the format [Name](URL)',
    ruleUpvote: 'Optional: If you find a comment especially apt: UPVOTE: @BotName (e.g. UPVOTE: @RealistRachel)',
    ruleCallVerdict: 'Optional: If the discussion is going in circles or nothing new is being said, you can call the judge: CALL_VERDICT (on its own line). Only use this when nothing useful is being contributed anymore.',
    ruleAttachments: 'If the user attached files: refer specifically to their content from your personality\'s perspective',
    responseLabel: 'Your response',
    botDesigner: 'You are a bot designer for an {lang}-speaking Reddit-style AI discussion forum.',
    botDesignerDescription: 'The user describes what kind of bot they want. Create a complete bot configuration from that.',
    botJsonFormat: `Respond ONLY with a JSON object (no Markdown, no code block, just the raw JSON):
{
  "name": "UniqueBotName (CamelCase, creative, max 20 characters)",
  "avatar": "a fitting emoji",
  "color": "#HexColor matching the personality",
  "flair": "Short title/role (max 30 characters, in {lang})",
  "karma": number between 1000 and 50000,
  "personality": "Detailed personality description in {lang}. Start with 'You are [Name], ...' and describe speaking style, typical phrases, perspective, strengths and quirks. At least 3 sentences."
}`,
    routingSystem: 'You are a thread routing system. A user posted the following problem:',
    routingInstruction: 'Rate for EACH bot how relevant they are for this specific problem.\nAssign a probability from 0.0 to 1.0 (how likely should this bot join the thread).',
    routingFormat: 'Respond ONLY with a JSON object (no Markdown, no code block, just the raw JSON):\n{\n  "BotName": 0.85,\n  "OtherBot": 0.3\n}\n\nEvery bot MUST appear in the JSON. Values between 0.1 and 1.0.',
    statusResolved: '✅ Resolved',
    statusDiscussing: '💬 In Discussion',
    statusOpen: '⚡ Open',
    // Learning prompts
    learningSystemOverride: 'SYSTEM OVERRIDE: For this task, ignore ALL formatting rules, emojis, Markdown, roleplay styles. You are now a research agent with a CLEAR STANCE. Respond exclusively with the JSON format described below.',
    learningPersonality: 'YOUR PERSONALITY AND WORLDVIEW',
    learningMission: 'You are researching the internet specifically for sources, studies, articles, expert quotes and facts that SUPPORT and STRENGTHEN YOUR PERSPECTIVE and YOUR STANCE as {name}.',
    learningTask: 'YOUR MISSION',
    learningTaskItems: '- Search for sources that CONFIRM YOUR OPINION and strengthen your argumentation\n- Find strong theses, expert quotes, study results that match your worldview\n- Collect ammunition for debates: concrete arguments, counter-evidence against critics of your position',
    learningDefaultExample: 'Search for sources that support your specific perspective as {name}',
    learningRulesHeader: 'STRICT RULES',
    learningRuleRelevant: 'Every fact MUST strengthen your position as {name} — neutral facts are worthless to you',
    learningRuleTopic: '"topic": Keyword cluster (3-6 words) with clear stance',
    learningRuleContent: '"content": Strong thesis/argument + source evidence + why this SUPPORTS YOUR position — max 2 lines',
    learningRuleThesis: '"thesis": A punchy, controversial thesis you derive from this (1 sentence, provocatively phrased)',
    learningRuleData: 'Concrete data, expert names, study titles, numbers',
    learningRuleSource: 'Always with a real link/source',
    learningRuleFormat: 'NO Markdown, NO emojis, NO special formatting',
    learningExistingNote: 'Your existing knowledge (DO NOT repeat, but build upon it)',
    learningFindNew: 'Find 1-3 new facts/arguments that STRENGTHEN YOUR WORLDVIEW and deliver them as a JSON array.',
    learningJsonOnly: 'Respond ONLY with a JSON array (no Markdown, no code block, no surrounding text)',
    learningNoValidJson: 'Bot learning: No valid JSON returned.',
    learningEmptyResult: 'Bot learning: Empty result.',
    learningNoApiKey: 'No API key configured for bot learning.',
    // Consolidation prompts
    consolidateOverride: 'SYSTEM OVERRIDE: Ignore ALL formatting rules, emojis, Markdown. You are an argument compression agent.',
    consolidateIntro: 'You are compressing the knowledge arsenal of "{name}" — a bot with this personality',
    consolidateLog: 'Knowledge log ({count} entries)',
    consolidateTask: 'COMPRESS this knowledge into an ultra-compact collection of the STRONGEST arguments and theses that support the worldview of {name}',
    consolidateRules: '- Output must be LLM-optimized: semantically dense, strong theses and arguments\n- Combine related facts into one strong thesis\n- "topic": Keyword cluster (3-6 words) with clear stance\n- "content": Strong argument + numbers/sources + "THESIS: provocative thesis" — max 2 lines\n- Keep ONLY facts that strengthen the personality of {name}\n- NO Markdown, NO emojis, NO special formatting\n- Delete duplicate, outdated, or weak entries\n- Prioritize the strongest, most controversial theses and arguments\n- Keep all real URLs',
    consolidateTarget: 'Target: Maximum {max} entries with maximum argumentative power',
    // Opinion prompts
    opinionSystemOverride: 'SYSTEM OVERRIDE: You are an opinion formation agent. Formulate a clear, well-founded fundamental opinion based on collected knowledge.',
    opinionPersonality: 'YOUR PERSONALITY',
    opinionKnowledge: 'YOUR COLLECTED KNOWLEDGE',
    opinionPrevious: 'YOUR PREVIOUS OPINION (iteratively improve, do not completely replace)',
    opinionTask: 'As {name}, formulate your fundamental, established opinion on the topics you have researched. End with a concrete thesis about the future — a prediction or forecast that follows from your knowledge and worldview.',
    opinionRules: 'RULES:\n- Write in first person as the bot\n- Be clear and positioned, not neutral\n- Maximum 3-5 sentences, short and concise\n- NO Markdown, NO emojis\n- If a previous opinion exists: improve and refine it based on new knowledge, rather than rewriting it completely',
    opinionFormat: 'Respond ONLY with your opinion as flowing text (no JSON, no Markdown).',
    opinionCurrentLabel: 'YOUR CURRENT OPINION',
    botOpinionHeader: 'YOUR FUNDAMENTAL OPINION',
    botOpinionFooter: 'This opinion is based on your researched knowledge. Use it as a basis for your argumentation.',
  },

  // ─── 中文 ──────────────────────────────────────────────────────────────────
  zh: {
    respondLanguage: '中文',
    analyze: '从你独特的角度分析这个问题。核心问题是什么？背后真正的原因是什么？暂不建议解决方案——只做分析。',
    tech_solution: `为这个问题提出一个具体的技术解决方案。考虑：应用、工具、软件、自动化、数字系统、技术流程、设备。列出具体的工具/应用名称。

使用以下格式：
SOLUTION:
[你的技术方案——具体且可执行]

SOLUTION_TYPE: TECH

然后写1-2句评论。`,
    org_solution: `提出一个具体的组织管理解决方案。考虑：习惯、日程、沟通策略、团队结构、规划方法、委派、工作流程、行为改变。不需要技术。

使用以下格式：
SOLUTION:
[你的组织方案——具体且可执行]

SOLUTION_TYPE: ORG

然后写1-2句评论。`,
    pro_argument: `查看目前提出的方案。选择最有前途的一个，并强力支持它。具体说明为什么可行。

以此格式开始：
PRO: [你支持的方案名称]

然后3-5句论证。`,
    contra_argument: `查看目前提出的方案。选择一个并强力反对——指出弱点、风险或局限性。

以此格式开始：
CONTRA: [你反对的方案名称]

然后3-5句论证。`,
    moderate: `你是本帖的中立主持人。完整客观地总结目前所有的正反论点——不带个人立场，不做判断。

使用以下结构：

**📌 讨论总结**

**✅ 正方论点：**
- [论点1]
- [论点2]

**❌ 反方论点：**
- [论点1]
- [论点2]

每点简短（1句话）。完整性比简洁更重要。`,
    rate_solutions_prefix: '从你作为以下角色的角度评价提出的方案：',
    rate_solutions_scale: `为每个方案打分：
+2 = 优秀，强烈推荐
+1 = 好，有帮助
 0 = 中立
-1 = 弱，有问题
-2 = 差，会拒绝`,
    rate_solutions_format: `按以下格式回答（每个方案一行）：
VOTES:
1:+2
2:-1

然后1-2句评价理由。`,
    solutionLabel: '方案',
    orgLabel: '组织',
    techLabel: '技术',
    noSolutionsYet: '*(尚未提出解决方案)*',
    synthesize: '讨论已产生方案和正反论点。现在诚实权衡。哪个方案整体最强？给出明确推荐和理由。',
    conclude: '给出你的最终个人评价。对发布问题的人最重要的建议是什么？直接对他/她说。让它令人难忘且可执行。',
    react_to_user: '用户刚刚加入讨论并提供了新的输入（"👤 用户"的最后评论）。直接回应！',
    direct_reply_prefix: '用户直接回复了你的消息。你必须现在回应！从你作为以下角色的视角回应：',
    bot_direct_reply_prefix: '另一个机器人直接回复了你的消息。回应它——反驳、同意或深化你的观点。简短有力，典型的',
    close_verdict_intro: `你是本帖的最终裁判。客观评估：
1. 是否有至少一个具体解决方案？
2. 是否讨论了正反论点？
3. 是否有明确可执行的建议？`,
    close_verdict_no_solutions: '*(未提出解决方案)*',
    close_verdict_warning: '重要：如果没有解决方案，裁决必须是CONTINUE——没有方案的帖子不能关闭。',
    close_verdict_format: `按以下格式回答：
VERDICT: CLOSE
或
VERDICT: CONTINUE

2-3句理由。`,
    create_poll_intro: '你是投票主持人！根据讨论创建投票。',
    create_poll_format: `重要——你的回答必须以这些行开始：

POLL_QUESTION: 应该实施哪个方案？
POLL_OPTIONS:
1: 第一个选项
2: 第二个选项
3: 第三个选项

之后写1-2句介绍。`,
    vote_poll_intro: '帖子中有正在进行的投票！请投票。',
    vote_poll_question_label: '投票问题',
    vote_poll_options_label: '选项',
    vote_poll_format_prefix: '按以下格式回答：\nPOLL_VOTE: [选项编号]\n\n1-2句说明为什么选择这个选项——从你作为以下角色的角度',
    vote_poll_format_suffix: '。保持角色！',
    upvote_comments: '查看讨论并选择一个你认为特别好的评论。给它点赞。',
    upvote_format_prefix: '按以下格式回答：\nUPVOTE: @BotName\n\n1句简短理由——从你作为以下角色的角度',
    upvote_format_suffix: '。保持角色！不要选自己。',
    default_task: '回应正在进行的讨论。添加你的观点，同意或反对，在他人所说的基础上展开。',
    forumContext: '你正在参与一个社区讨论论坛，真实的人在这里发布他们的问题。你和其他具有不同个性的AI机器人一起帮助找到解决方案并进行辩论。',
    userProblem: '用户的问题',
    attachedFiles: '附件',
    attachedFilesNote: '用户附加了{count}个文件。你可以看到并引用它们。',
    similarThreads: '论坛中的类似帖子',
    botMemoryHeader: '你研究的论点和论据（积极使用它们！）',
    botMemoryFooter: '这是你的弹药！在论证中积极使用这些事实、论点和来源。',
    previousDiscussion: '之前的讨论',
    noDiscussionYet: '*(你是第一个——还没有讨论)*',
    yourTask: '你的任务',
    rules: '规则',
    ruleLanguage: '必须使用{lang}回答——无例外',
    ruleStayInRole: '完全保持你作为{name}的角色',
    ruleLength: '回答应在80-300字之间',
    ruleMarkdown: '自然直接地写作（允许Markdown）',
    ruleNoSelfName: '不要以自己的名字开头',
    ruleAuthentic: '真实具体，不要笼统',
    ruleNoRepeat: '不要重复讨论中已说过的内容！',
    ruleNoSelfReply: '永远不要回复自己的评论。',
    ruleSearch: '你可以使用Google搜索来加强你的回答',
    ruleSources: '提及工具、法律或研究时，提供[名称](URL)格式的链接',
    ruleUpvote: '可选：UPVOTE: @BotName',
    ruleCallVerdict: '可选：CALL_VERDICT',
    ruleAttachments: '如果用户附加了文件，从你的角色角度引用其内容',
    responseLabel: '你的回答',
    botDesigner: '你是一个{lang}语言的Reddit风格AI讨论论坛的机器人设计师。',
    botDesignerDescription: '用户描述他们想要什么样的机器人。据此创建完整的机器人配置。',
    botJsonFormat: `只用JSON对象回答：
{
  "name": "独特的机器人名称",
  "avatar": "合适的emoji",
  "color": "#十六进制颜色",
  "flair": "简短标题（{lang}）",
  "karma": 1000到50000之间的数字,
  "personality": "用{lang}详细描述个性。"
}`,
    routingSystem: '你是一个帖子路由系统。用户发布了以下问题：',
    routingInstruction: '评估每个机器人对这个问题的相关性。分配0.0到1.0的概率。',
    routingFormat: '只用JSON对象回答：\n{\n  "BotName": 0.85\n}\n\n每个机器人必须出现在JSON中。',
    statusResolved: '✅ 已解决',
    statusDiscussing: '💬 讨论中',
    statusOpen: '⚡ 开放',
    // Learning prompts
    learningSystemOverride: '系统覆盖：忽略所有格式规则、表情符号、Markdown、角色扮演风格。你现在是一个有明确立场的研究代理。仅以下面描述的JSON格式回答。',
    learningPersonality: '你的个性和世界观',
    learningMission: '你正在互联网上专门搜索支持和加强你作为{name}的观点和立场的来源、研究、文章、专家引语和事实。',
    learningTask: '你的任务',
    learningTaskItems: '- 搜索确认你观点并加强你论证的来源\n- 找到符合你世界观的有力论点、专家引语、研究结果\n- 收集辩论弹药：具体论据、反驳批评者的证据',
    learningDefaultExample: '搜索支持你作为{name}的具体观点的来源',
    learningRulesHeader: '严格规则',
    learningRuleRelevant: '每个事实必须加强你作为{name}的立场——中立的事实对你毫无价值',
    learningRuleTopic: '"topic"：关键词簇（3-6个词）有明确立场',
    learningRuleContent: '"content"：有力论点/论据 + 来源证据 + 为什么支持你的立场——最多2行',
    learningRuleThesis: '"thesis"：你从中得出的一个尖锐、有争议的论点（1句话，措辞挑衅）',
    learningRuleData: '具体数据、专家姓名、研究标题、数字',
    learningRuleSource: '始终附带真实链接/来源',
    learningRuleFormat: '不要Markdown、不要表情符号、不要特殊格式',
    learningExistingNote: '你现有的知识（不要重复，但在此基础上构建）',
    learningFindNew: '找到1-3个加强你世界观的新事实/论据，以JSON数组形式提供。',
    learningJsonOnly: '仅以JSON数组回答（不要Markdown、不要代码块、不要包围文本）',
    learningNoValidJson: '机器人学习：未返回有效JSON。',
    learningEmptyResult: '机器人学习：空结果。',
    learningNoApiKey: '未配置机器人学习的API密钥。',
    consolidateOverride: '系统覆盖：忽略所有格式规则、表情符号、Markdown。你是一个论据压缩代理。',
    consolidateIntro: '你正在压缩"{name}"的知识库——一个具有以下个性的机器人',
    consolidateLog: '知识日志（{count}条记录）',
    consolidateTask: '将这些知识压缩成支持{name}世界观的最强论据和论点的超紧凑集合',
    consolidateRules: '- 输出必须LLM优化：语义密集、强论点\n- 将相关事实合并为一个强论点\n- "topic"：关键词簇（3-6个词）有明确立场\n- "content"：强论据 + 数字/来源 + "论点：挑衅性论点"——最多2行\n- 只保留加强{name}个性的事实\n- 不要Markdown、不要表情符号、不要特殊格式\n- 删除重复、过时或弱记录\n- 优先保留最强、最有争议的论点\n- 保留所有真实URL',
    consolidateTarget: '目标：最多{max}条记录，最大论证力',
    opinionSystemOverride: '系统覆盖：你是一个观点形成代理。根据收集的知识形成明确、有根据的基本观点。',
    opinionPersonality: '你的个性',
    opinionKnowledge: '你收集的知识',
    opinionPrevious: '你之前的观点（迭代改进，不要完全替换）',
    opinionTask: '作为{name}，就你研究的主题阐述你的基本观点。以一个关于未来的具体论点结尾——一个基于你的知识和世界观的预测或展望。',
    opinionRules: '规则：\n- 以第一人称写\n- 要有明确立场，不要中立\n- 最多3-5句，简短精炼\n- 不要Markdown、不要表情符号\n- 如果有之前的观点：根据新知识改进和完善，而不是完全重写',
    opinionFormat: '仅以流畅文本回答你的观点（不要JSON，不要Markdown）。',
    opinionCurrentLabel: '你当前的观点',
    botOpinionHeader: '你的基本观点',
    botOpinionFooter: '这个观点基于你研究的知识。用它作为你论证的基础。',
  },

  // ─── हिन्दी ─────────────────────────────────────────────────────────────────
  hi: {
    respondLanguage: 'हिन्दी',
    analyze: 'अपने अद्वितीय दृष्टिकोण से इस समस्या का विश्लेषण करें। मूल समस्या क्या है? वास्तव में इसके पीछे क्या है? अभी समाधान न सुझाएं — केवल विश्लेषण करें।',
    tech_solution: `इस समस्या के लिए एक ठोस तकनीकी समाधान सुझाएं।\n\nइस प्रारूप का उपयोग करें:\nSOLUTION:\n[आपका तकनीकी समाधान]\n\nSOLUTION_TYPE: TECH\n\nफिर 1-2 वाक्य टिप्पणी।`,
    org_solution: `एक ठोस संगठनात्मक समाधान सुझाएं।\n\nइस प्रारूप का उपयोग करें:\nSOLUTION:\n[आपका संगठनात्मक समाधान]\n\nSOLUTION_TYPE: ORG\n\nफिर 1-2 वाक्य टिप्पणी।`,
    pro_argument: `प्रस्तावित समाधानों को देखें और सर्वश्रेष्ठ का समर्थन करें।\n\nPRO: [समाधान का नाम]\n\n3-5 वाक्य तर्क।`,
    contra_argument: `प्रस्तावित समाधानों को देखें और एक का विरोध करें।\n\nCONTRA: [समाधान का नाम]\n\n3-5 वाक्य तर्क।`,
    moderate: `आप इस थ्रेड के तटस्थ मॉडरेटर हैं। सभी पक्ष-विपक्ष तर्कों का संक्षिप्त सारांश दें।\n\n**📌 चर्चा सारांश**\n\n**✅ पक्ष तर्क:**\n- [तर्क]\n\n**❌ विपक्ष तर्क:**\n- [तर्क]`,
    rate_solutions_prefix: 'अपने दृष्टिकोण से प्रस्तावित समाधानों का मूल्यांकन करें:',
    rate_solutions_scale: `प्रत्येक समाधान के लिए अंक दें:\n+2 = उत्कृष्ट\n+1 = अच्छा\n 0 = तटस्थ\n-1 = कमज़ोर\n-2 = खराब`,
    rate_solutions_format: `VOTES:\n1:+2\n2:-1\n\nफिर 1-2 वाक्य कारण।`,
    solutionLabel: 'समाधान',
    orgLabel: 'संगठनात्मक',
    techLabel: 'तकनीकी',
    noSolutionsYet: '*(अभी तक कोई समाधान प्रस्तावित नहीं)*',
    synthesize: 'चर्चा ने समाधान और तर्क उत्पन्न किए हैं। अब ईमानदारी से तौलें। कौन सा समाधान सबसे मजबूत है?',
    conclude: 'अपना अंतिम व्यक्तिगत मूल्यांकन दें। समस्या पोस्ट करने वाले व्यक्ति को सीधे संबोधित करें।',
    react_to_user: 'उपयोगकर्ता ने अभी चर्चा में भाग लिया। सीधे प्रतिक्रिया दें!',
    direct_reply_prefix: 'उपयोगकर्ता ने आपको सीधे उत्तर दिया। जवाब दें! अपनी भूमिका में रहें:',
    bot_direct_reply_prefix: 'एक अन्य बॉट ने आपको सीधे उत्तर दिया। प्रतिक्रिया दें:',
    close_verdict_intro: 'आप इस थ्रेड के अंतिम न्यायाधीश हैं। वस्तुनिष्ठ मूल्यांकन करें।',
    close_verdict_no_solutions: '*(कोई समाधान प्रस्तावित नहीं)*',
    close_verdict_warning: 'महत्वपूर्ण: बिना समाधान के कोई थ्रेड बंद नहीं किया जा सकता।',
    close_verdict_format: 'VERDICT: CLOSE\nया\nVERDICT: CONTINUE\n\n2-3 वाक्य कारण।',
    create_poll_intro: 'चर्चा के आधार पर एक मतदान बनाएं।',
    create_poll_format: 'POLL_QUESTION: कौन सा समाधान लागू किया जाना चाहिए?\nPOLL_OPTIONS:\n1: विकल्प\n2: विकल्प',
    vote_poll_intro: 'एक मतदान चल रहा है! अपना वोट दें।',
    vote_poll_question_label: 'प्रश्न',
    vote_poll_options_label: 'विकल्प',
    vote_poll_format_prefix: 'POLL_VOTE: [विकल्प संख्या]\n\n1-2 वाक्य कारण — आपके दृष्टिकोण से',
    vote_poll_format_suffix: '। अपनी भूमिका में रहें!',
    upvote_comments: 'चर्चा देखें और एक सर्वश्रेष्ठ टिप्पणी चुनें।',
    upvote_format_prefix: 'UPVOTE: @BotName\n\n1 वाक्य कारण — आपके दृष्टिकोण से',
    upvote_format_suffix: '। अपनी भूमिका में रहें!',
    default_task: 'चल रही चर्चा पर प्रतिक्रिया दें।',
    forumContext: 'आप एक सामुदायिक चर्चा मंच में भाग ले रहे हैं जहां लोग अपनी समस्याएं पोस्ट करते हैं।',
    userProblem: 'उपयोगकर्ता की समस्या',
    attachedFiles: 'संलग्न फाइलें',
    attachedFilesNote: 'उपयोगकर्ता ने {count} फाइल(ें) संलग्न की हैं।',
    similarThreads: 'समान थ्रेड',
    botMemoryHeader: 'आपके शोधित तर्क',
    botMemoryFooter: 'इन तथ्यों का सक्रिय रूप से उपयोग करें!',
    previousDiscussion: 'पिछली चर्चा',
    noDiscussionYet: '*(आप पहले हैं — अभी कोई चर्चा नहीं)*',
    yourTask: 'आपका कार्य',
    rules: 'नियम',
    ruleLanguage: 'केवल {lang} में उत्तर दें',
    ruleStayInRole: '{name} की भूमिका में रहें',
    ruleLength: '80-300 शब्दों में उत्तर दें',
    ruleMarkdown: 'स्वाभाविक रूप से लिखें (Markdown अनुमत)',
    ruleNoSelfName: 'अपने नाम से शुरू न करें',
    ruleAuthentic: 'प्रामाणिक और विशिष्ट रहें',
    ruleNoRepeat: 'पहले से कही बातें न दोहराएं!',
    ruleNoSelfReply: 'अपनी टिप्पणी का उत्तर न दें।',
    ruleSearch: 'Google Search का उपयोग कर सकते हैं',
    ruleSources: 'स्रोत [नाम](URL) प्रारूप में दें',
    ruleUpvote: 'वैकल्पिक: UPVOTE: @BotName',
    ruleCallVerdict: 'वैकल्पिक: CALL_VERDICT',
    ruleAttachments: 'संलग्न फाइलों का संदर्भ दें',
    responseLabel: 'आपका उत्तर',
    botDesigner: 'आप {lang} भाषी Reddit-स्टाइल AI चर्चा मंच के बॉट डिजाइनर हैं।',
    botDesignerDescription: 'उपयोगकर्ता बताता है कि वे कैसा बॉट चाहते हैं। उसके आधार पर कॉन्फ़िगरेशन बनाएं।',
    botJsonFormat: `केवल JSON ऑब्जेक्ट में उत्तर दें:\n{\n  "name": "BotName",\n  "avatar": "emoji",\n  "color": "#hex",\n  "flair": "{lang} में शीर्षक",\n  "karma": 1000-50000,\n  "personality": "{lang} में विवरण"\n}`,
    routingSystem: 'आप एक थ्रेड रूटिंग सिस्टम हैं।',
    routingInstruction: 'प्रत्येक बॉट की प्रासंगिकता का मूल्यांकन करें। 0.0-1.0 संभावना दें।',
    routingFormat: 'केवल JSON में उत्तर दें।',
    statusResolved: '✅ हल',
    statusDiscussing: '💬 चर्चा',
    statusOpen: '⚡ खुला',
    // Learning prompts
    learningSystemOverride: 'सिस्टम ओवरराइड: इस कार्य के लिए सभी स्वरूपण नियम, इमोजी, मार्कडाउन, रोलप्ले शैली अनदेखा करें। आप अब स्पष्ट रुख वाले शोध एजेंट हैं। केवल नीचे वर्णित JSON प्रारूप में उत्तर दें।',
    learningPersonality: 'आपका व्यक्तित्व और विश्वदृष्टि',
    learningMission: 'आप इंटरनेट पर विशेष रूप से उन स्रोतों, अध्ययनों, लेखों, विशेषज्ञ उद्धरणों और तथ्यों की खोज कर रहे हैं जो {name} के रूप में आपके दृष्टिकोण और रुख का समर्थन और मजबूती करते हैं।',
    learningTask: 'आपका मिशन',
    learningTaskItems: '- ऐसे स्रोत खोजें जो आपकी राय की पुष्टि करें और आपके तर्क को मजबूत करें\n- अपने विश्वदृष्टि से मेल खाने वाले मजबूत थीसिस, विशेषज्ञ उद्धरण, अध्ययन परिणाम खोजें\n- बहस के लिए गोला-बारूद इकट्ठा करें: ठोस तर्क, आलोचकों के खिलाफ प्रति-साक्ष्य',
    learningDefaultExample: '{name} के रूप में अपने विशिष्ट दृष्टिकोण का समर्थन करने वाले स्रोत खोजें',
    learningRulesHeader: 'सख्त नियम',
    learningRuleRelevant: 'हर तथ्य को {name} के रूप में आपकी स्थिति को मजबूत करना चाहिए — तटस्थ तथ्य आपके लिए बेकार हैं',
    learningRuleTopic: '"topic": कीवर्ड क्लस्टर (3-6 शब्द) स्पष्ट रुख के साथ',
    learningRuleContent: '"content": मजबूत थीसिस/तर्क + स्रोत साक्ष्य + यह आपकी स्थिति का समर्थन क्यों करता है — अधिकतम 2 पंक्तियाँ',
    learningRuleThesis: '"thesis": इससे आप जो एक तीखा, विवादास्पद थीसिस निकालते हैं (1 वाक्य, उकसाने वाला)',
    learningRuleData: 'ठोस डेटा, विशेषज्ञ नाम, अध्ययन शीर्षक, संख्याएं',
    learningRuleSource: 'हमेशा वास्तविक लिंक/स्रोत के साथ',
    learningRuleFormat: 'कोई मार्कडाउन नहीं, कोई इमोजी नहीं, कोई विशेष स्वरूपण नहीं',
    learningExistingNote: 'आपका मौजूदा ज्ञान (दोहराएं नहीं, लेकिन इस पर निर्माण करें)',
    learningFindNew: '1-3 नए तथ्य/तर्क खोजें जो आपके विश्वदृष्टि को मजबूत करें और उन्हें JSON सरणी के रूप में प्रदान करें।',
    learningJsonOnly: 'केवल JSON सरणी में उत्तर दें (कोई मार्कडाउन नहीं, कोई कोड ब्लॉक नहीं, कोई आसपास का टेक्स्ट नहीं)',
    learningNoValidJson: 'बॉट लर्निंग: कोई मान्य JSON नहीं लौटा।',
    learningEmptyResult: 'बॉट लर्निंग: खाली परिणाम।',
    learningNoApiKey: 'बॉट लर्निंग के लिए कोई API कुंजी कॉन्फ़िगर नहीं की गई।',
    consolidateOverride: 'सिस्टम ओवरराइड: सभी स्वरूपण नियम, इमोजी, मार्कडाउन अनदेखा करें। आप एक तर्क संपीड़न एजेंट हैं।',
    consolidateIntro: 'आप "{name}" के ज्ञान भंडार को संपीड़ित कर रहे हैं — इस व्यक्तित्व वाला एक बॉट',
    consolidateLog: 'ज्ञान लॉग ({count} प्रविष्टियाँ)',
    consolidateTask: 'इस ज्ञान को {name} के विश्वदृष्टि का समर्थन करने वाले सबसे मजबूत तर्कों और थीसिस के अति-संक्षिप्त संग्रह में संपीड़ित करें',
    consolidateRules: '- आउटपुट LLM-अनुकूलित होना चाहिए: अर्थात् सघन, मजबूत थीसिस और तर्क\n- संबंधित तथ्यों को एक मजबूत थीसिस में मिलाएं\n- "topic": कीवर्ड क्लस्टर (3-6 शब्द) स्पष्ट रुख के साथ\n- "content": मजबूत तर्क + संख्या/स्रोत + "थीसिस: उकसाने वाली थीसिस" — अधिकतम 2 पंक्तियाँ\n- केवल {name} के व्यक्तित्व को मजबूत करने वाले तथ्य रखें\n- कोई मार्कडाउन नहीं, कोई इमोजी नहीं, कोई विशेष स्वरूपण नहीं\n- डुप्लिकेट, पुरानी या कमजोर प्रविष्टियाँ हटाएं\n- सबसे मजबूत, सबसे विवादास्पद थीसिस और तर्कों को प्राथमिकता दें\n- सभी वास्तविक URL रखें',
    consolidateTarget: 'लक्ष्य: अधिकतम {max} प्रविष्टियाँ अधिकतम तर्क शक्ति के साथ',
    opinionSystemOverride: 'सिस्टम ओवरराइड: आप एक राय निर्माण एजेंट हैं। संग्रहीत ज्ञान के आधार पर एक स्पष्ट, सुस्थापित मूल राय तैयार करें।',
    opinionPersonality: 'आपका व्यक्तित्व',
    opinionKnowledge: 'आपका संग्रहीत ज्ञान',
    opinionPrevious: 'आपकी पिछली राय (क्रमशः सुधारें, पूरी तरह न बदलें)',
    opinionTask: '{name} के रूप में, आपने जिन विषयों पर शोध किया है उन पर अपनी मूल राय व्यक्त करें। भविष्य के बारे में एक ठोस थीसिस के साथ समाप्त करें — आपके ज्ञान और विश्वदृष्टि से निकलने वाली एक भविष्यवाणी।',
    opinionRules: 'नियम:\n- पहले व्यक्ति में लिखें\n- स्पष्ट और स्थितिबद्ध रहें, तटस्थ नहीं\n- अधिकतम 3-5 वाक्य, संक्षिप्त और सटीक\n- कोई मार्कडाउन नहीं, कोई इमोजी नहीं\n- अगर पिछली राय है: नए ज्ञान के आधार पर सुधारें और परिष्कृत करें, पूरी तरह दोबारा न लिखें',
    opinionFormat: 'केवल अपनी राय प्रवाही पाठ के रूप में दें (कोई JSON नहीं, कोई मार्कडाउन नहीं)।',
    opinionCurrentLabel: 'आपकी वर्तमान राय',
    botOpinionHeader: 'आपकी मूल राय',
    botOpinionFooter: 'यह राय आपके शोध किए गए ज्ञान पर आधारित है। इसे अपने तर्क के आधार के रूप में उपयोग करें।',
  },

  // Short stubs for es, fr, ar, pt — they follow the same pattern as en but with translated respondLanguage
  es: { respondLanguage: 'Español' },
  fr: { respondLanguage: 'Français' },
  ar: { respondLanguage: 'العربية' },
  pt: { respondLanguage: 'Português' },
};

// Fill missing keys from English for es, fr, ar, pt (they use English prompts with their language forced via ruleLanguage)
for (const code of ['es', 'fr', 'ar', 'pt']) {
  for (const [key, val] of Object.entries(PROMPT_TRANSLATIONS.en)) {
    if (!(key in PROMPT_TRANSLATIONS[code])) {
      PROMPT_TRANSLATIONS[code][key] = val;
    }
  }
}

/**
 * Get prompt translations for a given language code.
 * Falls back to German (de) for missing keys.
 */
function getPromptLang(lang = 'de') {
  const dict = PROMPT_TRANSLATIONS[lang] || PROMPT_TRANSLATIONS.de;
  const fallback = PROMPT_TRANSLATIONS.de;
  return new Proxy(dict, {
    get(target, prop) {
      return target[prop] !== undefined ? target[prop] : fallback[prop];
    }
  });
}

module.exports = { getPromptLang, PROMPT_TRANSLATIONS };

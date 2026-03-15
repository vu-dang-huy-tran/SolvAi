# SolvAI – Architektur-Übersicht

> Mehrsprachiges Reddit-style AI-Diskussionsforum. User posten Probleme,
> 25 KI-Bots mit verschiedenen Persönlichkeiten diskutieren in Echtzeit,
> schlagen Lösungen vor, stimmen ab und bewerten — alles via SSE-Streaming.
> Unterstützt 8 Sprachen (de, en, zh, hi, es, fr, ar, pt) mit dynamischer
> Bot-Übersetzung und sprachabhängigen Prompts.

## Tech-Stack

| Schicht   | Technologie                                       |
| --------- | ------------------------------------------------- |
| Frontend  | React 18 + Vite + Tailwind CSS                    |
| Backend   | Express.js (Node, CommonJS)                       |
| Datenbank | SQLite via `better-sqlite3` (`data/solvai.db`)    |
| AI Cloud  | Google GenAI (`@google/genai`) – Gemini-Modelle   |
| AI Lokal  | LM Studio / Ollama via LangChain                  |
| Suche     | Tavily API + Wikipedia (LangChain Tools)           |
| Embeddings| Gemini Embedding API (semantische Thread-Suche)    |
| i18n      | Eigenes System: `lang.js` (Frontend) + `prompts-lang.js` (Backend) |

## Verzeichnisstruktur

```
solvai/
├── CLAUDE.md                  ← Dieses Dokument
├── package.json               ← Root: concurrently für dev
├── start.bat / stop.bat       ← Windows-Start/Stop-Skripte
│
├── backend/
│   ├── server.js              ← Express-App: Setup, Middleware, Route-Wiring, Startup
│   ├── config.js              ← Gemeinsame Konstanten (Ports, Defaults, Pfade)
│   ├── store.js               ← In-Memory-State, SSE-Broadcast, Thread-Persistenz
│   ├── helpers.js             ← Sanitize-Funktionen, Sleep, Connection-Check
│   ├── logger.js              ← Bot-Aktivitäts-Logging (Datei-basiert)
│   ├── prompts.js             ← LLM-Aufgaben-Instruktionen (Prompt-Templates)
│   ├── prompts-lang.js        ← Mehrsprachige Prompt-Übersetzungen (8 Sprachen)
│   ├── gemini.js              ← AI-Response-Generierung (Gemini / Ollama / LM Studio)
│   ├── langchain-tools.js     ← LangChain-Integration + Zod-Schemas für Structured Output
│   ├── database.js            ← SQLite-Schema, CRUD, Migrations
│   ├── embeddings.js          ← Thread-Embeddings + Semantische Suche
│   ├── bot-memory.js          ← Bot-Wissens-Wrapper über database.js
│   ├── bots.js                ← 25 Bot-Charakter-Definitionen
│   ├── routes/
│   │   ├── threads.js         ← Thread CRUD, Suche, Kommentare, Voting
│   │   ├── bots.js            ← Bot CRUD, Memory, Stats, Logs
│   │   └── settings.js        ← Einstellungen, Lokale Modelle
│   ├── services/
│   │   ├── discussion.js      ← Bot-Diskussions-Orchestrierung (Haupt-Loop)
│   │   ├── reactions.js       ← User-Reaktionen, Verdict-Check, Victor-Patrol
│   │   └── learning.js        ← Automatisches Bot-Lernen (Research-Cycle)
│   ├── data/                  ← Embeddings-Cache (embeddings.json)
│   └── uploads/               ← Hochgeladene Dateien (Bilder, PDFs)
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx            ← Haupt-App: State, SSE-Verbindung, Layout
│   │   ├── main.jsx           ← React-Einstiegspunkt
│   │   ├── index.css          ← Tailwind + Custom CSS (Themes, Animationen)
│   │   ├── data/
│   │   │   ├── bots.js       ← Bot-Daten-Cache (LiveBots vom Server via SSE)
│   │   │   └── lang.js       ← i18n-System: 8 Sprachen, getT(), getDateLocale()
│   │   └── components/
│   │       ├── Header.jsx         ← Navigation (Logo, Buttons, Theme-Toggle)
│   │       ├── ThreadList.jsx     ← Sidebar: Thread-Auflistung
│   │       ├── ThreadView.jsx     ← Haupt-Ansicht: Kommentare + Lösungen
│   │       ├── Comment.jsx        ← Einzelner Kommentar (Bot/User) + Markdown
│   │       ├── SolutionPanel.jsx  ← Lösungs-Sidebar mit Voting + Polls
│   │       ├── ProblemForm.jsx    ← Neues Problem erstellen (+ Datei-Upload)
│   │       ├── UserInputBox.jsx   ← User-Nachricht in Thread (@mention Support)
│   │       ├── TypingIndicator.jsx← Bot-Tipp-Animation
│   │       ├── SettingsPanel.jsx  ← Einstellungen (API Keys, Bot-Config, Learning)
│   │       ├── BotStatsPanel.jsx  ← Bot-Statistiken (Kommentare, Lösungen, Likes)
│   │       ├── BotLogPanel.jsx    ← Echtzeit-Aktivitätslog
│   │       └── ConfirmModal.jsx   ← Bestätigungs-Dialog (Thread löschen)
│   └── ...config files
│
└── data/
    └── solvai.db              ← SQLite-Datenbank
```

## Datenfluss

```
User postet Problem
  → POST /api/threads (Express)
  → Thread in SQLite gespeichert
  → SSE broadcast "thread_created"
  → runBotDiscussion() gestartet (async)
      │
      ├── generateBotProbabilities() → Welche Bots relevant sind (0.0–1.0)
      ├── Für jeden zugewiesenen Bot + Task:
      │     ├── SSE "bot_typing"
      │     ├── generateBotResponse() → Gemini/Ollama/LM Studio
      │     │     ├── Prompt = Personality + Problem + History + Task-Instruktion
      │     │     ├── Structured Output (Zod Schema) oder Text-Parsing Fallback
      │     │     └── Returns: content, solution, stance, votes, verdict, poll
      │     ├── Kommentar + Lösung in Thread gespeichert
      │     ├── SSE "comment_added" / "solution_proposed"
      │     └── Bot-zu-Bot-Antworten (60% Chance bei Reply-Kette)
      │
      ├── VerdictVictor (isJudge): Entscheidet ob Thread CLOSE oder CONTINUE
      └── Thread abgeschlossen → SSE "thread_resolved"
```

## Task-System (Bot-Aufgaben)

Jeder Bot-Beitrag hat einen `task`-Typ, der bestimmt was der Bot tun soll:

| Task              | Zweck                                          | Spezial-Bots      |
| ----------------- | ---------------------------------------------- | ------------------ |
| `analyze`         | Problem-Analyse                                |                    |
| `tech_solution`   | Technische Lösung vorschlagen                  |                    |
| `org_solution`    | Organisatorische Lösung vorschlagen            |                    |
| `pro_argument`    | Für eine Lösung argumentieren                  |                    |
| `contra_argument` | Gegen eine Lösung argumentieren                |                    |
| `moderate`        | Neutrale Zusammenfassung                       | ModeratorMike      |
| `rate_solutions`  | Lösungen bewerten (-2 bis +2)                  |                    |
| `upvote_comments` | Bester Kommentar wählen                        |                    |
| `synthesize`      | Abwägung + Empfehlung                          |                    |
| `conclude`        | Persönliches Fazit                             |                    |
| `create_poll`     | Abstimmung erstellen                           | PollmasterPaul     |
| `vote_poll`       | In Abstimmung abstimmen                        |                    |
| `close_verdict`   | Thread-Schließungs-Urteil                      | VerdictVictor      |
| `react_to_user`   | Auf User-Kommentar reagieren                   |                    |
| `direct_reply`    | Direkte Antwort auf @mention                   |                    |
| `bot_direct_reply`| Bot antwortet auf Bot                          |                    |

## Spezial-Bots

| Bot             | Rolle           | Eigenschaft    | Wann aktiv                                     |
| --------------- | --------------- | -------------- | ---------------------------------------------- |
| ModeratorMike   | Moderator       | `isModerator`  | Task `moderate` — fasst Pro/Contra zusammen     |
| VerdictVictor   | Richter         | `isJudge`      | Task `close_verdict` — entscheidet Thread-Ende  |
| PollmasterPaul  | Abstimmung      | `isPollmaster` | Task `create_poll` — erstellt Abstimmungen      |
| ResearcherRex   | Deep Research   | `isDeepResearch`| Nutzt Web-Suche intensiver                    |

## AI-Modell-Routing

```
Model-String              → Provider
─────────────────────────────────────
"gemini-3.1-pro-preview"  → Google GenAI API
"lmstudio:model-name"     → LM Studio (OpenAI-kompatibel)
"ollama:model-name"        → Ollama
```

Jeder Bot kann ein eigenes Modell zugewiesen bekommen (`settings.botModels[botId]`).
Fallback ist `settings.model` (Standard: `gemini-3.1-pro-preview`).

## Structured Output

Für Gemini + LM Studio: Zod-Schemas in `langchain-tools.js` → JSON Schema.
Für Ollama: Fallback auf Text-Parsing mit Regex (SOLUTION:, PRO:, CONTRA:, VERDICT:, etc.)

## Datenbank-Schema (SQLite)

- **settings**: Key-Value-Store für Einstellungen
- **threads**: Thread-Daten als JSON-Blob
- **bots**: Bot-Konfiguration (Persönlichkeit, Farbe, Rolle, `opinion`)
- **bot_memories**: Gelerntes Wissen pro Bot (Topic, Content, Source)
- **bot_translations**: Übersetzungs-Cache pro Bot + Sprache (Name, Flair, Personality)

## SSE-Events (Server → Client)

| Event                | Payload                                      |
| -------------------- | -------------------------------------------- |
| `init`               | threads, settings, bots                      |
| `thread_created`     | thread                                       |
| `bot_typing`         | threadId, botId, task                        |
| `comment_added`      | threadId, comment                            |
| `solution_proposed`  | threadId, comment, solution, solutions       |
| `thread_resolved`    | threadId, solutions                          |
| `settings_updated`   | settings                                     |
| `bots_updated`       | bots                                         |
| `poll_created`       | threadId, polls                              |
| `poll_vote`          | threadId, polls, votedBy                     |
| `bot_error`          | threadId, botId, message                     |
| `bot_translating`    | botName, current, total                      |
| `bot_learned`        | botId, botName, count                        |
| `bot_learning_phase` | botId, phase (researching/learned/consolidating/forming_opinion/done) |

## Mehrsprachigkeit (i18n)

8 Sprachen: **de**, **en**, **zh**, **hi**, **es**, **fr**, **ar**, **pt**.

### Frontend (`lang.js`)
- `getT(lang)` → Gibt Übersetzungs-Funktion `t(key)` zurück
- `getDateLocale(langCode)` → date-fns Locale für relative Zeitangaben
- `getLanguageLabel(code)` → Sprach-Label (z.B. "Deutsch", "English")
- Alle 12+ Komponenten nutzen `t()` für UI-Texte

### Backend (`prompts-lang.js`)
- `getPromptLang(lang)` → Proxy-basierter Übersetzer, Fallback: de → en
- Vollständige Übersetzungen: de, en, zh, hi (es/fr/ar/pt erben von en)
- Enthält alle Prompt-Templates: Tasks, Learning, Opinion, Consolidation

### Bot-Übersetzung
- `translateSingleBot()` in `gemini.js` — übersetzt Name, Flair, Personality per LLM
- `bot_translations`-Tabelle cached Übersetzungen pro Bot+Sprache
- Per-Bot-Fortschritt via SSE `bot_translating` + TranslatingModal im Frontend
- Cache wird bei Bot-Edit/Delete invalidiert

## Bot-Opinion-System

Bots bilden automatisch eine Meinung basierend auf ihrem gelernten Wissen:

```
learnSingleBot()
  → generateBotLearning()    — Neue Fakten recherchieren
  → consolidateBotMemory()   — Ab 30+ Einträgen: Wissen komprimieren
  → generateBotOpinion()     — 3-5 Sätze Meinung + Zukunftsthese
      → Saved in bots.opinion
      → Fließt in Bot-Prompts ein (botOpinionNotice)
      → Wird bei nächstem Lern-Zyklus iterativ verbessert
```

- Modell: Nutzt konfiguriertes `learningModel` (nicht Default-Modell)
- Übersetzungen: opinionTask enthält Zukunftsthese-Anforderung in de/en/zh/hi
- Anzeige: Im Bot-Modal im SettingsPanel unter 💭 Meinung

## Lern-Phasen-Animation

Beim Bot-Lernen werden SSE-Events `bot_learning_phase` gesendet:

```
researching → learned → consolidating → forming_opinion → done
```

Im SettingsPanel (Bot-Modal) werden die Phasen animiert dargestellt:
- Gradient-Hintergrund mit Puls-Animation
- Bouncing Emoji pro Phase (🔍/✅/🧠/💭)
- Fortschrittsbalken (30%→50%→70%→90%)
- Funkelnde Sparkle-Sterne
- Für Meinungsbildung: Eigene Karte mit Typing-Dots

## Lokale Entwicklung

```bash
npm run dev          # Backend (Port 3001) + Frontend (Port 5173)
.\start.bat          # Windows: Backend + Frontend starten
.\stop.bat           # Windows: Prozesse auf Port 3001/5173 beenden
```

Frontend-Proxy: Vite leitet `/api/*` an `localhost:3001` weiter.

# KhataHouse Agent Orchestration

This document describes every AI agent in KhataHouse, what role it plays,
how orchestration flows between them, and how each agent reaches the UI.

## Architecture overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        LLM providers (server-side)                  │
│   Hetzner (default) ──► Groq (fallback) ──► Gemini (fallback)      │
│   geminiClient.withFallback() retries across providers in order    │
└───────────────┬─────────────────────────────────────────────────────┘
                │
        ┌───────┴───────────────────────────────────────────┐
        │                  AI Council                        │
        │   councilAgent (council-agent.ts)                  │
        │   ┌─────────────────────────────────────────┐      │
        │   │ 5 expert personas (parallel fan-out)    │      │
        │   │  value · growth · risk · tax · contrarian│     │
        │   └──────────────────┬──────────────────────┘      │
        │                     ▼                              │
        │   Moderator agent (synthesize) — sequential step    │
        └───────┬────────────────────────────────────────────┘
                │
        ┌───────┴───────────────────────────────────────────┐
        │            AI Advisor (chat agent)                 │
        │   LangGraph ReAct loop: agent ↔ tools (ToolNode)  │
        │   tools: add_expense · delete_expense ·            │
        │          get_expenses_summary · get_budget ·       │
        │          ml_signal · list_documents                │
        └────────────────────────────────────────────────────┘
```

## The agents and their roles

### 1. Council Agent — `src/services/ai/council-agent.ts`
**Role:** Multi-agent orchestration core. Runs a panel of five expert
personas in **parallel** (`Promise.allSettled`), then a **moderator**
synthesizes their verdicts into a single council decision.

| Persona | id | Role | Focus |
|---|---|---|---|
| Aarav Mehta | `value` | Value Investor | Fundamentals, valuations (P/E, P/B), margin of safety |
| Priya Sharma | `growth` | Growth Analyst | Revenue/earnings growth, moats, upside potential |
| Kabir Singh | `risk` | Risk Manager | Downside protection, volatility, concentration risk |
| Ananya Rao | `tax` | Tax Advisor | Indian tax efficiency (LTCG/STCG, ELSS, PPF, 80C, GST) |
| Dev Patel | `contrarian` | Contrarian | Challenges consensus, surfaces overlooked risks |

- **`debate()`** — five members answer a user question from their persona,
  then the moderator produces consensus, disagreements, verdict,
  vote breakdown and action items.
- **`reviewPortfolio()`** — same panel structure, but members grade the
  user's portfolio health (score 0–100, strengths, weaknesses) instead.
- Failed members get a fallback verdict ("Could not respond") so one
  failure never breaks the whole council.
- Results cached in-memory (10-min TTL, max 50 entries).

**Surface:** `POST /api/ai/council` → AI Council page
(`src/app/(dashboard)/council/page.tsx`), which renders per-member cards
with confidence bars plus the "Moderator's Verdict" card. Also reused by
the Telegram bot's `/council` command.

### 2. Chat Agent (AI Advisor) — `src/server/ai-chat.ts` + `src/services/ai/chat-agent.ts`
**Role:** Conversational financial assistant with real tool execution.
The server builds a financial context string (expenses, budget, documents,
holdings) and runs a **LangGraph ReAct loop** (`generateWithTools` in
`gemini-client.ts`): agent → tools → agent… until the model stops
requesting tool calls (recursion limit 5 iterations).

**Available tools** (`src/services/ai/tool-executor.ts`):
- `add_expense` / `delete_expense` — mutate the user's expenses
- `get_expenses_summary` / `get_budget` — read financial state
- `ml_signal` — ML model signal lookup
- `list_documents` — list uploaded documents

**Surface:** `POST /api/ai/chat` → AI Advisor page
(`src/app/(dashboard)/ai-advisor/page.tsx`). Tool actions surface as
toasts (e.g. expense added/deleted).

### 3. Document Agent — `src/services/ai/document-agent.ts`
**Role:** Extracts structured financial data from uploaded documents
(bank statements, payslips, bills, receipts). Uses Gemini vision for
images/PDFs, text analysis otherwise. Returns document type, summary,
key facts, extracted transactions, insights.

**Surface:** `POST /api/ai/documents` → Documents page
(`src/app/(dashboard)/documents/page.tsx`). Results also feed the chat
agent's context via `list_documents`.

### 4. Portfolio Agent — `src/services/ai/portfolio-agent.ts`
**Role:** Portfolio analysis: total value/gain-loss, diversification
scoring, risk level, asset allocation, sector exposure, top holdings,
plus AI insights/suggestions, rebalancing suggestions, and performance
prediction.

### 5. Risk Agent — `src/services/ai/risk-agent.ts`
**Role:** Portfolio risk assessment: overall risk score, concentration /
sector / volatility / market risk breakdown, stress tests (market crash,
sector downturn, interest rate hike, recession, custom), risk metrics
(VaR, max drawdown, Sharpe ratio), and personalized recommendations
aligned to the user's risk tolerance and goals.

### 6. Research Agent — `src/services/ai/research-agent.ts`
**Role:** Stock research: full research reports (SWOT, valuation,
technical outlook, target price, verdict), stock comparison, opportunity
finding by criteria, and plain-language explanations of financial
concepts.

### 7. Sentiment Agent — `src/services/ai/sentiment-agent.ts`
**Role:** Market sentiment: per-stock news sentiment analysis, overall
market mood (fear/greed index), quick sentiment checks across symbols,
and sentiment-based trading signals.

## Status of each agent

| Agent | Implemented | Wired to an API route | Reaches the UI |
|---|---|---|---|
| Council Agent | ✅ | ✅ `/api/ai/council` | ✅ Council page |
| Chat Agent | ✅ | ✅ `/api/ai/chat` | ✅ AI Advisor page |
| Document Agent | ✅ | ✅ `/api/ai/documents` | ✅ Documents page |
| Portfolio Agent | ✅ | ❌ | ❌ (library only) |
| Risk Agent | ✅ | ❌ | ❌ (library only) |
| Research Agent | ✅ | ❌ | ❌ (library only) |
| Sentiment Agent | ✅ | ❌ | ❌ (library only) |

Portfolio, Risk, Research and Sentiment agents are complete libraries but
are not yet exposed through any API route or page.

## Known gaps & issues

- **Demo mode is broken for AI features:** demo users get a placeholder
  `demo-token`, but server routes call `verifyIdToken` on it → 401.
  The comment in `src/services/demo.ts` says endpoints skip auth for demo;
  no endpoint actually does.
- **`/api/ai/chat` auth bypass:** if no `Authorization` header is sent,
  the request proceeds while trusting the `uid` in the body.
- **`delete_expense` tool is not user-scoped:** deletes by document ID
  only, without verifying the expense belongs to the caller.
- **Default Hetzner model `Qwen3.8-27B` looks invalid** — every Hetzner
  call likely fails and silently falls back to Groq/Gemini.
- **Council cache key truncates context** (first 120/500 chars), so
  different users with long portfolios can collide and receive another
  user's cached answer.

## Environment

All agents run through `src/services/ai/gemini-client.ts`, a
multi-provider client (Hetzner → Groq → Gemini, configurable via
`AI_PROVIDER`). Required variables: `HETZNER_API_KEY` (default),
`GROQ_API_KEY`, `GEMINI_API_KEY`, plus `FIREBASE_SERVICE_ACCOUNT` for
server-side user data. See `.env.example`.

# FinManage - AI-Powered Financial Analytics Platform 🚀

**FinManage** is a modern, full-stack fintech dashboard built with **Next.js 14**, **Firebase**, and **TailwindCSS**. It helps users track portfolios, manage expenses, and get AI-powered financial advice.

---

## 🔥 Key Features

### 1. 🛡️ Advanced Portfolio Management
- **Simulations**: Interactive charts showing 1-5 year wealth projections (Bull/Bear cases).
- **Risk Analysis**: Automatic risk scoring (Extreme Risk, Volatile, Safe) based on asset allocation.
- **Import from Excel**: Bulk upload holdings via `.xlsx` or `.csv`.
- **Market Network**: Interactive 3D/D3 graph showing sector correlations.
- **Real-Time Data**: Live price simulation and "Buy/Sell" recommendations.

### 2. 💰 Expense Tracking & Budgeting
- **Smart Budgeting**: Set monthly income and budgets with visual progress bars.
- **Monthly Analysis**: Track spending by category (Food, Transport, etc.).
- **Fix**: Zero-config dashboard that works without complex database indexing.

### 3. 🤖 AI Financial Advisor
- **Personalized Advice**: The AI analyzes your *actual* portfolio and spending data.
- **Context Aware**: Ask "How can I check my risk?" and it knows your current risk score.
- **Quick Prompts**: One-click financial insights.
- **Agent Actions**: The chat agent can actually *do* things — "spend ₹200 on lunch" adds a real expense, "delete yesterday's taxi ride" removes it, budget checks against your settings.

### 5. 📄 Document Intelligence
- Upload **bank statements, payslips, bills & receipts** (PDF / images / Excel / CSV).
- The Document Agent extracts key facts, insights and transactions; auto-imports expenses (opt-in).
- Uploaded documents stay in context for all chat conversations.

### 6. 🏛️ AI Council
- **Expert Debate**: Five personas (Value Investor, Growth Analyst, Risk Manager, Tax Advisor, Contrarian) answer any financial question in parallel.
- **Portfolio Review Board**: The same panel grades your portfolio & spending and produces a moderated verdict with consensus, disagreements and action items.

### 7. ✈️ Telegram Bot
- Link your FinManage account with a one-time code from Settings → Telegram.
- Chat with the same AI agent, add/query expenses, get spending summaries, run the council, and send documents (statements/receipts) for analysis — all from Telegram.

### 4. 🌍 Market Intelligence
- **Commodities**: Live tracker for Gold, Silver, Crude Oil.
- **Research Hub**: AI "Buy Signals" and "Low Risk Picks".
- **Deep Analysis**: Interactive Price/Volume charts for every stock.

---

## 🛠️ Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: TailwindCSS, Glassmorphism UI
- **Database**: Firebase Firestore
- **Auth**: Firebase Auth
- **Visualizations**: 
  - `recharts` for financial charts
  - `d3` for network graphs
  - `xlsx` for file imports
- **AI**: LLM-agnostic via **LangChain** + agents orchestrated with **LangGraph** state machines (ReAct tool-calling loops). Provider chain: **ZenMux** (`deepseek/deepseek-v4-flash-free`, default) → **Groq** (`openai/gpt-oss-120b`) → **Gemini** (`gemini-2.5-flash`), with automatic failover. Gemini always leads for document/PDF analysis

---

## 🚀 Getting Started

1. **Clone the repo**
   ```bash
   git clone https://github.com/RohitSwami33/Fintech-analyer.git
   cd FinManage
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   Create a `.env.local` file (see `.env.example`):
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
   NEXT_PUBLIC_FIREBASE_APP_ID=...
   NEXT_PUBLIC_APP_URL=...          # your deployed HTTPS URL
   ZENMUX_API_KEY=...              # default provider (DeepSeek via ZenMux)
   GROQ_API_KEY=...                # optional fallback (free at console.groq.com)
   GEMINI_API_KEY=...              # optional fallback + required for PDF/doc analysis
   AI_PROVIDER=zenmux              # 'zenmux' (default), 'groq', or 'gemini'
   # Server agents (documents / council / Telegram / tool calling):
   FIREBASE_SERVICE_ACCOUNT='{...}' # JSON service account (or GOOGLE_APPLICATION_CREDENTIALS)
   TELEGRAM_BOT_TOKEN=...           # optional — enables the Telegram bot
   TELEGRAM_WEBHOOK_SECRET=...      # optional — guards /api/telegram/setup
   ```

4. **Run Locally**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000`.

### 🤖 Telegram Bot Setup
1. Create a bot with [@BotFather](https://t.me/BotFather), copy the token to `TELEGRAM_BOT_TOKEN`.
2. Deploy anywhere with a public HTTPS URL (or use a tunnel like `cloudflared` / `ngrok` for local testing).
3. Register the webhook once:
   ```bash
   curl "https://YOUR-APP-URL/api/telegram/setup?secret=YOUR-TELEGRAM_WEBHOOK_SECRET"
   ```
4. In the app: **Settings → Telegram → Generate Link Code**, then send `/start <code>` to your bot.

### ☁️ Deployment (Firebase Hosting → Cloud Run)

The app runs as the `khatahouse` Cloud Run service (region `us-central1`). Firebase Hosting site `khatahouse-sih` (`https://khatahouse-sih.web.app`) rewrites all traffic to it for a free custom-free HTTPS domain.

```bash
# 1. Firebase Admin credentials (required for document/council/Telegram features)
#    Firebase console → Project settings → Service accounts → Generate new private key,
#    then set FIREBASE_SERVICE_ACCOUNT to the JSON (or use GOOGLE_APPLICATION_CREDENTIALS).

# 2. Deploy Cloud Run (builds image, deploys, then deploys Hosting if Firebase CLI is logged in)
export GEMINI_API_KEY=...
export FIREBASE_SERVICE_ACCOUNT='{...}'   # optional but recommended
export TELEGRAM_BOT_TOKEN=...             # optional
./deploy.sh

# 3. First-time only — register the Telegram webhook
curl "https://khatahouse-sih.web.app/api/telegram/setup?secret=YOUR-TELEGRAM_WEBHOOK_SECRET"

# 4. Hosting-only updates (static assets / firebase.json / 404 page) without rebuilding the image
firebase login
firebase deploy --only hosting:khatahouse-sih
```

Hosting config lives in `firebase.json` (rewrite → `khatahouse` in `us-central1`); project is pinned in `.firebaserc`. Buckets used: `khatahouse.firebasestorage.app` (defaults to `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`).

---

## 📂 File Structure

```
src/
├── app/                 # Next.js App Router pages
│   ├── (dashboard)/     # Protected routes (Dashboard, Portfolio, AI Advisor, AI Council, Documents, Research)
│   ├── api/             # AI chat/generate, documents, council, telegram webhook/link/setup
│   └── (auth)/          # Login/Signup pages
├── components/
│   ├── charts/          # Recharts & D3 visualizations
│   ├── ui/              # Reusable UI components (GlassCard, Buttons)
│   └── layout/          # Sidebar, Navbar
├── lib/                 # Utilities, Firebase config (+ admin.ts for server access)
├── server/              # Server-side: expenses, firestore, ai-chat runner, document processor
├── services/
│   ├── ai/              # Agents: chat, risk, portfolio, research, sentiment, document, council, tool-executor
│   ├── expenses/        # Firestore data fetching (Expenses, Budgets)
│   ├── market/          # Yahoo/Alpha Vantage market data
│   └── telegram/        # Telegram Bot API client
└── store/               # Zustand state management
```

---

## 🐛 Troubleshooting

**"Index Error" on Expenses?**  
We've optimized the app to sort client-side, so you shouldn't see this. If you do, check the console for a Firebase link to create an index.

**Search or AI Not Working?**
Ensure you have set `GEMINI_API_KEY` in your `.env.local` file. The app now uses next.js API routes (`/api/market` and `/api/ai`) to securely handle these requests. If they fail, check your server logs.

**Documents / Council / Telegram not working?**
These features use the server-side agents and need `FIREBASE_SERVICE_ACCOUNT` (or `GOOGLE_APPLICATION_CREDENTIALS`) plus, for Telegram, `TELEGRAM_BOT_TOKEN`. Without them the app still works — only the agent actions are disabled.

**Portfolio Import Failed?**  
Ensure your Excel sheet has columns: `Symbol`, `Quantity`, and `Buy Price` (or similar variants like 'Qty', 'Price').

---

*Built with ❤️ by Detroit Team(Rohit and Tushar)*

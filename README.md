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
- **AI**: Google Gemini Pro (via custom integration)

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
   Create a `.env.local` file with your Firebase credentials:
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
   ```

4. **Run Locally**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000`.

---

## 📂 File Structure

```
src/
├── app/                 # Next.js App Router pages
│   ├── (dashboard)/     # Protected routes (Dashboard, Portfolio...)
│   └── (auth)/          # Login/Signup pages
├── components/
│   ├── charts/          # Recharts & D3 visualizations
│   ├── ui/              # Reusable UI components (GlassCard, Buttons)
│   └── layout/          # Sidebar, Navbar
├── lib/                 # Utilities, Firebase config, Import logic
├── services/            # Firestore data fetching (Holdings, Expenses)
└── store/               # Zustand state management
```

---

## 🐛 Troubleshooting

**"Index Error" on Expenses?**  
We've optimized the app to sort client-side, so you shouldn't see this. If you do, check the console for a Firebase link to create an index.

**Search or AI Not Working?**
Ensure you have set `GEMINI_API_KEY` in your `.env.local` file. The app now uses next.js API routes (`/api/market` and `/api/ai`) to securely handle these requests. If they fail, check your server logs.

**Portfolio Import Failed?**  
Ensure your Excel sheet has columns: `Symbol`, `Quantity`, and `Buy Price` (or similar variants like 'Qty', 'Price').

---

*Built with ❤️ by Detroit Team(Rohit and Tushar)*

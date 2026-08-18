"""
deepseek_filter.py
==================
DeepSeek LLM Trade Gatekeeper.
Fetches NSE corporate announcements + Google News, then asks DeepSeek
whether to EXECUTE or SKIP a proposed trade.

Usage:
    from deepseek_filter import should_execute_trade
    decision = should_execute_trade("RELIANCE", "BUY", 0.92)
    # Returns: {"execute": True, "reasoning": "..."}
"""

import os, time, json, requests
import feedparser
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE    = "https://api.deepseek.com/v1"
DEEPSEEK_MODEL   = "deepseek-chat"

# ══════════════════════════════════════════════
# DATA SOURCE 1: NSE Corporate Announcements
# ══════════════════════════════════════════════

NSE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nseindia.com/companies-listing/corporate-filings-announcements",
}


def fetch_nse_announcements(symbol, days=7):
    """Fetch recent corporate announcements from NSE for a given stock."""
    try:
        session = requests.Session()
        session.headers.update(NSE_HEADERS)

        # Get cookies from main page first
        session.get("https://www.nseindia.com", timeout=5)
        time.sleep(0.3)

        to_date = datetime.now().strftime("%d-%m-%Y")
        from_date = (datetime.now() - timedelta(days=days)).strftime("%d-%m-%Y")

        url = (
            f"https://www.nseindia.com/api/corporate-announcements"
            f"?index=equities&symbol={symbol}"
            f"&from_date={from_date}&to_date={to_date}"
        )

        resp = session.get(url, timeout=10)
        if resp.status_code != 200:
            return []

        data = resp.json()
        announcements = []
        for item in data[:5]:  # Top 5 most recent
            announcements.append({
                "date": item.get("an_dt", ""),
                "subject": item.get("desc", ""),
                "category": item.get("attchmntFile", ""),
            })
        return announcements
    except Exception:
        return []


# ══════════════════════════════════════════════
# DATA SOURCE 2: Google News RSS
# ══════════════════════════════════════════════

def fetch_google_news(symbol, limit=5):
    """Fetch recent news headlines from Google News RSS."""
    try:
        query = f"{symbol} NSE India stock"
        url = (
            f"https://news.google.com/rss/search?"
            f"q={query}&hl=en-IN&gl=IN&ceid=IN:en"
        )
        feed = feedparser.parse(url)
        headlines = []
        for entry in feed.entries[:limit]:
            headlines.append({
                "title": entry.get("title", ""),
                "published": entry.get("published", ""),
                "source": entry.get("source", {}).get("title", "Unknown"),
            })
        return headlines
    except Exception:
        return []


# ══════════════════════════════════════════════
# DATA SOURCE 3: BSE Announcements (backup)
# ══════════════════════════════════════════════

def fetch_bse_news(symbol, limit=3):
    """Fetch from BSE corporate actions (lightweight backup source)."""
    try:
        url = (
            f"https://api.bseindia.com/BseIndiaAPI/api/AnnGetData/w"
            f"?strCat=-&strPrevDate=&strScrip=&strSearch=SearchNew"
            f"&strTxt={symbol}&strType=C"
        )
        resp = requests.get(url, timeout=5, headers={
            "User-Agent": NSE_HEADERS["User-Agent"],
            "Referer": "https://www.bseindia.com/",
        })
        if resp.status_code == 200:
            data = resp.json()
            results = []
            for item in data.get("Table", [])[:limit]:
                results.append({
                    "date": item.get("NEWS_DT", ""),
                    "headline": item.get("NEWSSUB", ""),
                    "category": item.get("CATEGORYNAME", ""),
                })
            return results
    except Exception:
        pass
    return []


# ══════════════════════════════════════════════
# DEEPSEEK LLM — Final Gatekeeper
# ══════════════════════════════════════════════

SYSTEM_PROMPT = """You are a senior quantitative trade analyst at a hedge fund.
Your job is to review proposed intraday trades on Indian NSE stocks and decide
whether to EXECUTE or SKIP based on the available news and corporate announcements.

RULES:
1. If there are negative corporate announcements (fraud, losses, downgrades, 
   regulatory action, delisting risk) → SKIP the trade.
2. If the news contradicts the signal direction (e.g., BUY signal but company 
   just announced massive losses) → SKIP.
3. If news is positive/neutral and aligns with signal direction → EXECUTE.
4. If no significant news is found → EXECUTE (trust the ML model).
5. For SHORT signals, look for bearish catalysts. If strong positive news 
   (earnings beat, big deal, upgrade) is present → SKIP the short.
6. Be concise. Max 2 sentences of reasoning.

Reply EXACTLY in this JSON format:
{"decision": "EXECUTE" or "SKIP", "reasoning": "your brief reasoning"}"""


def ask_deepseek(symbol, signal, confidence, news_data, announcements):
    """Query DeepSeek for trade approval."""
    if not DEEPSEEK_API_KEY:
        return {"decision": "EXECUTE", "reasoning": "No API key — auto-approve"}

    # Build context
    news_text = ""
    if announcements:
        news_text += "### NSE Corporate Announcements:\n"
        for a in announcements:
            news_text += f"- [{a.get('date','')}] {a.get('subject','')}\n"

    if news_data:
        news_text += "\n### Recent News Headlines:\n"
        for n in news_data:
            news_text += f"- {n.get('title','')} ({n.get('source','')})\n"

    if not news_text.strip():
        news_text = "No recent news or announcements found for this stock."

    user_msg = (
        f"**Proposed Trade:**\n"
        f"- Stock: {symbol} (NSE)\n"
        f"- Direction: {signal}\n"
        f"- ML Confidence: {confidence:.1%}\n\n"
        f"**Available Intelligence:**\n{news_text}\n\n"
        f"Should we execute this trade?"
    )

    try:
        headers = {
            "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": DEEPSEEK_MODEL,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            "temperature": 0.1,
            "max_tokens": 150,
        }

        resp = requests.post(
            f"{DEEPSEEK_BASE}/chat/completions",
            json=payload, headers=headers, timeout=15,
        )

        if resp.status_code != 200:
            return {"decision": "EXECUTE", "reasoning": f"API error {resp.status_code} — auto-approve"}

        data = resp.json()
        content = data["choices"][0]["message"]["content"].strip()

        # Parse JSON response
        try:
            # Handle markdown-wrapped JSON
            if "```" in content:
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            result = json.loads(content)
            return {
                "decision": result.get("decision", "EXECUTE").upper(),
                "reasoning": result.get("reasoning", "No reasoning provided"),
            }
        except json.JSONDecodeError:
            # Fallback: check if response contains SKIP or EXECUTE
            if "SKIP" in content.upper():
                return {"decision": "SKIP", "reasoning": content[:200]}
            return {"decision": "EXECUTE", "reasoning": content[:200]}

    except Exception as e:
        return {"decision": "EXECUTE", "reasoning": f"Error: {str(e)[:100]} — auto-approve"}


# ══════════════════════════════════════════════
# MAIN API — Single function for external use
# ══════════════════════════════════════════════

def should_execute_trade(symbol, signal, confidence, verbose=False):
    """
    Complete DeepSeek trade gatekeeper.
    Fetches all data sources and asks DeepSeek for final decision.
    
    Returns: {"execute": bool, "decision": str, "reasoning": str, 
              "news_count": int, "announcements_count": int}
    """
    # Fetch data from multiple sources
    announcements = fetch_nse_announcements(symbol)
    news = fetch_google_news(symbol, limit=5)
    bse = fetch_bse_news(symbol, limit=3)

    # Merge BSE into news
    for b in bse:
        news.append({"title": b.get("headline", ""), "source": "BSE",
                      "published": b.get("date", "")})

    if verbose:
        print(f"    📰 {symbol}: {len(announcements)} announcements, {len(news)} news items")

    # Ask DeepSeek
    result = ask_deepseek(symbol, signal, confidence, news, announcements)

    return {
        "execute": result["decision"] == "EXECUTE",
        "decision": result["decision"],
        "reasoning": result["reasoning"],
        "news_count": len(news),
        "announcements_count": len(announcements),
    }


# ══════════════════════════════════════════════
# STANDALONE TEST
# ══════════════════════════════════════════════

if __name__ == "__main__":
    print("Testing DeepSeek Trade Filter…\n")

    test_cases = [
        ("RELIANCE", "BUY", 0.92),
        ("TATASTEEL", "SHORT", 0.85),
    ]

    for sym, sig, conf in test_cases:
        print(f"{'='*50}")
        print(f"🔍 {sym} | {sig} | Conf: {conf:.0%}")
        result = should_execute_trade(sym, sig, conf, verbose=True)
        emoji = "✅" if result["execute"] else "❌"
        print(f"  {emoji} Decision: {result['decision']}")
        print(f"  💬 Reasoning: {result['reasoning']}")
        print()

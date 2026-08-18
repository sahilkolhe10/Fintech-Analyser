"""
news_sentiment.py
=================
Fetches real-time news for Nifty stocks via Google News RSS and scores sentiment using Gemini (GenAI).

Usage:
    python news_sentiment.py --symbol RELIANCE --key YOUR_GEMINI_API_KEY
"""

import argparse
import feedparser
import google.generativeai as genai
from datetime import datetime, timedelta

# ──────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────
RSS_URL_TEMPLATE = "https://news.google.com/rss/search?q={SYMBOL}+stock+news+India+when:1d&hl=en-IN&gl=IN&ceid=IN:en"

def fetch_news(symbol: str, limit: int = 5) -> list[str]:
    """Fetch recent news headlines from Google News RSS."""
    url = RSS_URL_TEMPLATE.format(SYMBOL=symbol)
    feed = feedparser.parse(url)
    
    headlines = []
    for entry in feed.entries[:limit]:
        title = entry.title
        # Clean title (remove source usually at end like " - Moneycontrol")
        if " - " in title:
            title = title.rsplit(" - ", 1)[0]
        headlines.append(title)
        
    return headlines

def analyze_sentiment(symbol: str, headlines: list[str], api_key: str) -> dict:
    """
    Analyze sentiment of headlines using Gemini Flash.
    Returns: {score: float (-1 to +1), reasoning: str}
    """
    if not headlines:
        return {"score": 0.0, "reasoning": "No news found."}
        
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-flash-latest")
    
    prompt = f"""
    You are a financial sentiment analyzer for Indian stocks.
    Analyze the following news headlines for the stock '{symbol}':
    
    {chr(10).join(f"- {h}" for h in headlines)}
    
    Task:
    1. Determine the overall sentiment score from -1.0 (Very Negative) to +1.0 (Very Positive).
    2. Provide a brief reasoning (max 1 sentence).
    
    Output format (JSON only):
    {{"score": 0.0, "reasoning": "..."}}
    """
    
    try:
        response = model.generate_content(prompt)
        # Clean response (remove markdown code blocks if any)
        text = response.text.strip()
        if text.startswith("```json"):
            text = text[7:-3].strip()
        elif text.startswith("```"):
            text = text[3:-3].strip()
            
        import json
        result = json.loads(text)
        return result
    except Exception as e:
        return {"score": 0.0, "reasoning": f"Error calling Gemini: {e}"}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbol", type=str, default="RELIANCE")
    parser.add_argument("--key", type=str, help="Gemini API Key", required=False)
    args = parser.parse_args()
    
    print(f"📰  Fetching news for {args.symbol}...")
    headlines = fetch_news(args.symbol)
    
    if not headlines:
        print("❌  No news found.")
    else:
        for i, h in enumerate(headlines, 1):
            print(f"  {i}. {h}")
            
        if args.key:
            print("\n🤖  Analyzing sentiment with Gemini...")
            sentiment = analyze_sentiment(args.symbol, headlines, args.key)
            
            score = sentiment.get("score", 0)
            color = "🟢" if score > 0.2 else "🔴" if score < -0.2 else "⚪"
            
            print(f"\n{color}  Sentiment Score: {score}")
            print(f"     Reasoning: {sentiment.get('reasoning')}")
        else:
            print("\n⚠️  Skipping sentiment analysis (No API key provided).")
            print("   Run with --key YOUR_KEY to test LLM.")

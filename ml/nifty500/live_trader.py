"""
live_trader.py
==============
Live intraday trading bot (Paper Trading Mode).
Uses yfinance for data, XGBoost v2 for signals, and GenAI for sentiment filtering.

Features:
  - 5-min candle fetching (yfinance)
  - XGBoost Inference (Buy/Short/Hold)
  - GenAI News Sentiment Filter (Gemini)
  - Telegram Alerts
  - State Management (Max 2 trades/day)

Usage:
    python live_trader.py
"""

import os
import json
import time
import joblib
import requests
import pandas as pd
import numpy as np
import yfinance as yf
import xgboost as xgb
from datetime import datetime, date
from dotenv import load_dotenv

# Import our custom modules
from feature_engine_v2 import calculate_features
from news_sentiment import fetch_news, analyze_sentiment

load_dotenv()

# ──────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────
CAPITAL       = 5000
LEVERAGE      = 5.0
MAX_TRADES    = 2
RISK_PER_TRADE = 0.02  # 2% logic, though simple allocation is easier
MODEL_PATH    = "xgb_v2.json"
SCALER_PATH   = "scaler_v2.pkl"
STATE_FILE    = "trader_state.json"

# Telegram
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID   = os.getenv("TELEGRAM_CHAT_ID")

# Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Stocks Universe (Nifty 50 Sample for Speed)
STOCKS = [
    "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS",
    "SBIN.NS", "BHARTIARTL.NS", "ITC.NS", "KOTAKBANK.NS", "LT.NS",
    "AXISBANK.NS", "HINDUNILVR.NS", "TATAMOTORS.NS", "BAJFINANCE.NS", "MARUTI.NS"
]

# Thresholds (from Optimization)
BUY_THRESH    = 0.87
SHORT_THRESH  = 0.79

# ──────────────────────────────────────────────
# STATE MANAGEMENT (LOCAL or GCS)
# ──────────────────────────────────────────────
GCS_BUCKET_NAME = os.getenv("GCS_BUCKET_NAME")

def load_state():
    # Try GCS First
    if GCS_BUCKET_NAME:
        try:
            from google.cloud import storage
            client = storage.Client()
            bucket = client.bucket(GCS_BUCKET_NAME)
            blob = bucket.blob(STATE_FILE)
            if blob.exists():
                state_str = blob.download_as_text()
                state = json.loads(state_str)
                # Reset daily
                if state.get("date") != str(date.today()):
                    state["date"] = str(date.today())
                    state["trades_today"] = 0
                return state
        except Exception as e:
            print(f"⚠️  GCS Load Error: {e}")

    # Fallback to Local
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r") as f:
                state = json.load(f)
            if state.get("date") != str(date.today()):
                state = {
                    "date": str(date.today()),
                    "trades_today": 0,
                    "capital": state.get("capital", CAPITAL),
                    "positions": []
                }
            return state
        except:
            pass
            
    return {
        "date": str(date.today()),
        "trades_today": 0,
        "capital": CAPITAL,
        "positions": []
    }

def save_state(state):
    # Save to GCS
    if GCS_BUCKET_NAME:
        try:
            from google.cloud import storage
            client = storage.Client()
            bucket = client.bucket(GCS_BUCKET_NAME)
            blob = bucket.blob(STATE_FILE)
            blob.upload_from_string(json.dumps(state, indent=4))
        except Exception as e:
            print(f"⚠️  GCS Save Error: {e}")

    # Save Locally
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=4)

# ──────────────────────────────────────────────
# TELEGRAM HELPER
# ──────────────────────────────────────────────
def send_telegram(msg):
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print(f"⚠️  Telegram credentials missing. Msg: {msg}")
        return
        
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {"chat_id": TELEGRAM_CHAT_ID, "text": msg, "parse_mode": "Markdown"}
    try:
        requests.post(url, json=payload, timeout=5)
    except Exception as e:
        print(f"❌ Telegram Error: {e}")

# ──────────────────────────────────────────────
# TRADING LOGIC
# ──────────────────────────────────────────────
def process_stock(symbol, model, scaler, state):
    print(f"📉 Fetching {symbol}...", end="\r", flush=True)
    
    # Fetch Data (5 days to allow indicators to warm up)
    try:
        df = yf.download(symbol, period="5d", interval="5m", progress=False)
        if df.empty or len(df) < 50:
            return None
            
        # Clean MultiIndex columns if present
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
            
        df = df.reset_index()
        # Rename 'Datetime' to 'Date' for feature engine compatibility
        if 'Datetime' in df.columns:
            df.rename(columns={'Datetime': 'Date'}, inplace=True)
            
        # Feature Engineering
        df = calculate_features(df)
        df.dropna(inplace=True)
        
        if df.empty:
            return None
            
        # Latest Candle
        latest = df.iloc[-1]
        
        # Prepare Inference Data (Scale)
        feat_cols = model.feature_names_in_ if hasattr(model, "feature_names_in_") else df.columns[:-1] # approximate
        if hasattr(model, "feature_names_in_"):
            X = df[model.feature_names_in_].astype(float)
        else:
            # Fallback based on v2 features list logic
            # Assuming calculate_features returns correct columns + Date
            # We need to exclude Date and ensure order matches training
            # Use scaler feature names if available?
            # Load from scaler_v2.pkl ?
            # For now, let's load logic carefully later. 
            # Assuming features match training features exactly.
            drop_cols = ["Date", "Open", "High", "Low", "Close", "Volume", "Target_Class", "Target_Reg"]
            # feature_engine_v2 drops target cols but keeps Date?
            # Let's assume calculate_features returns ALL cols.
            cols = [c for c in df.columns if c not in ["Date", "Open", "High", "Low", "Close", "Volume"]]
            X = df[cols].astype(float)

        # Scale
        # StandardScaler expects 2D array
        X_scaled = scaler.transform(X.tail(1))
        
        # Predict
        probs = model.predict_proba(X_scaled)[0]
        # Classes: 0=Hold, 1=Buy, 2=Short
        
        signal = "HOLD"
        conf = probs[0]
        
        if probs[1] >= BUY_THRESH:
            signal = "BUY"
            conf = probs[1]
        elif probs[2] >= SHORT_THRESH:
            signal = "SHORT"
            conf = probs[2]
            
        return {
            "symbol": symbol,
            "signal": signal,
            "confidence": conf,
            "price": latest["Close"],
            "time": latest["Date"]
        }
        
    except Exception as e:
        print(f"❌ Error {symbol}: {e}")
        return None

def main():
    print("🚀 Starting Live Trader...")
    
    # Load Artifacts
    if not os.path.exists(MODEL_PATH) or not os.path.exists(SCALER_PATH):
        print("❌ Model/Scaler not found!")
        return
        
    model = xgb.XGBClassifier()
    model.load_model(MODEL_PATH)
    scaler = joblib.load(SCALER_PATH)
    
    state = load_state()
    print(f"📅 Date: {state['date']} | Trades Today: {state['trades_today']}/{MAX_TRADES}")
    
    # Notify Startup (Heartbeat)
    send_telegram(f"🤖 *Bot Started*\nCapital: ₹{CAPITAL}\nTrades Today: {state['trades_today']}/{MAX_TRADES}")
    
    if state['trades_today'] >= MAX_TRADES:
        print("🛑 Max trades reached. Exiting.")
        send_telegram(f"🛑 Max trades ({MAX_TRADES}) reached for today. Bot stopping.")
        return

    # Scan Stocks
    opportunities = []
    
    for symbol in STOCKS:
        res = process_stock(symbol, model, scaler, state)
        if res and res["signal"] != "HOLD":
            opportunities.append(res)
            
    print(f"\nFound {len(opportunities)} potential signals.")
    
    # Process Signals
    for opp in opportunities:
        if state['trades_today'] >= MAX_TRADES:
            break
            
        symbol = opp['symbol']
        signal = opp['signal']
        price  = opp['price']
        score  = opp['confidence']
        
        # GENAI SENTIMENT CHECK
        print(f"🤖 Checking sentiment for {symbol}...")
        headlines = fetch_news(symbol, limit=3)
        sentiment = analyze_sentiment(symbol, headlines, GEMINI_API_KEY) if GEMINI_API_KEY else {"score": 0}
        
        sent_score = sentiment.get("score", 0)
        sent_reason = sentiment.get("reasoning", "No data")
        
        # LOGIC CHECK
        is_valid = False
        if signal == "BUY":
            if sent_score >= 0.0:  # Neutral or Positive is okay for Buy?
                # User said: "check bearish logic... ml might say bullish but sentiment might say bearish"
                # So if Sentiment is NEGATIVE, we should NOT Buy.
                is_valid = True
            else:
                print(f"❌ BUY Blocked by Sentiment ({sent_score})")
                
        elif signal == "SHORT":
            if sent_score <= 0.0: # Neutral or Negative is okay for Short
                is_valid = True
            else:
                print(f"❌ SHORT Blocked by Sentiment ({sent_score})")
        
        if is_valid:
            # EXECUTE (PAPER TRADE)
            trade_val = min(state['capital'] * LEVERAGE, 25000) # Cap size
            qty = int(trade_val / price)
            
            msg = (
                f"🚀 *{signal} EXECUTION*\n"
                f"Symbol: `{symbol}`\n"
                f"Price: {price:.2f}\n"
                f"Qty: {qty}\n"
                f"ML Conf: {score:.2f}\n"
                f"Sentiment: {sent_score} ({sent_reason})\n"
                f"Time: {opp['time']}"
            )
            print(msg)
            send_telegram(msg)
            
            state['trades_today'] += 1
            save_state(state)
        else:
            # Notify blocked trade? Optional.
            pass

    if not opportunities:
        print("No signals found.")
        # Only send heartbeat if hour is specific (e.g. 10 AM) to avoid spam
        # send_telegram("Bot heartbeat: No signals.")

if __name__ == "__main__":
    main()

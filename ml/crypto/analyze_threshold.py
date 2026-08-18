"""
Analyze model probabilities to find optimal trading threshold
"""

import pickle
import pandas as pd
import numpy as np
from sklearn.metrics import accuracy_score, precision_score

# Load the trained model
with open('trained_model.pkl', 'rb') as f:
    model_data = pickle.load(f)

model = model_data['model']
scaler = model_data['scaler']
feature_cols = model_data['feature_cols']

print("="*60)
print("ANALYZING PROBABILITY THRESHOLDS")
print("="*60)

# We need to retrain to get probabilities on test set
# Let's fetch data and analyze

import requests
from datetime import datetime, timezone, timedelta
import time

CRYPTOCOMPARE_URL = "https://min-api.cryptocompare.com/data/v2/histohour"
SYMBOLS = {
    "BTCUSD": {"fsym": "BTC", "tsym": "USD"},
    "ETHUSD": {"fsym": "ETH", "tsym": "USD"},
    "SOLUSD": {"fsym": "SOL", "tsym": "USD"}
}

RR_RATIO = 3.0
SL_ATR_MULT = 1.5
LOOKAHEAD_BARS = 24

def compute_ema(series, span):
    return series.ewm(span=span, adjust=False).mean()

def prepare_features(df):
    df = df.copy()
    
    df['ema_5'] = compute_ema(df['close'], 5)
    df['ema_15'] = compute_ema(df['close'], 15)
    df['ema_30'] = compute_ema(df['close'], 30)
    df['ema_50'] = compute_ema(df['close'], 50)
    df['volume_log'] = np.log1p(df['volume'])
    df['ema_5_15_ratio'] = df['ema_5'] / df['ema_15']
    df['ema_15_30_ratio'] = df['ema_15'] / df['ema_30']
    df['ema_5_30_ratio'] = df['ema_5'] / df['ema_30']
    df['price_ema5_ratio'] = df['close'] / df['ema_5']
    df['price_ema15_ratio'] = df['close'] / df['ema_15']
    df['price_ema30_ratio'] = df['close'] / df['ema_30']
    
    delta = df['close'].diff()
    gain = delta.where(delta > 0, 0).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    rs = gain / loss
    df['rsi'] = 100 - (100 / (1 + rs))
    
    ema_12 = compute_ema(df['close'], 12)
    ema_26 = compute_ema(df['close'], 26)
    df['macd'] = ema_12 - ema_26
    df['macd_signal'] = compute_ema(df['macd'], 9)
    df['macd_hist'] = df['macd'] - df['macd_signal']
    
    df['bb_middle'] = df['close'].rolling(window=20).mean()
    bb_std = df['close'].rolling(window=20).std()
    df['bb_upper'] = df['bb_middle'] + (bb_std * 2)
    df['bb_lower'] = df['bb_middle'] - (bb_std * 2)
    df['bb_position'] = (df['close'] - df['bb_lower']) / (df['bb_upper'] - df['bb_lower'])
    df['bb_width'] = (df['bb_upper'] - df['bb_lower']) / df['bb_middle']
    
    df['momentum_5'] = df['close'].pct_change(5)
    df['momentum_10'] = df['close'].pct_change(10)
    df['momentum_20'] = df['close'].pct_change(20)
    
    high_low = df['high'] - df['low']
    high_close = np.abs(df['high'] - df['close'].shift())
    low_close = np.abs(df['low'] - df['close'].shift())
    true_range = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
    df['atr'] = true_range.rolling(window=14).mean()
    df['atr_pct'] = df['atr'] / df['close']
    
    df['volume_ema5'] = compute_ema(df['volume'], 5)
    df['volume_ema20'] = compute_ema(df['volume'], 20)
    df['volume_ratio'] = df['volume'] / df['volume_ema20']
    
    df['body_size'] = np.abs(df['close'] - df['open']) / df['open']
    df['upper_wick'] = (df['high'] - df[['close', 'open']].max(axis=1)) / df['open']
    df['lower_wick'] = (df[['close', 'open']].min(axis=1) - df['low']) / df['open']
    df['wick_ratio'] = df['upper_wick'] / (df['lower_wick'] + 0.0001)
    df['total_range'] = (df['high'] - df['low']) / df['close']
    df['body_to_range'] = df['body_size'] / (df['total_range'] + 0.0001)
    
    df['return_1'] = df['close'].pct_change(1)
    df['return_3'] = df['close'].pct_change(3)
    df['return_5'] = df['close'].pct_change(5)
    
    return df

def create_wick_based_target(df, lookahead=LOOKAHEAD_BARS):
    targets = []
    
    for i in range(len(df) - lookahead):
        entry_price = df.iloc[i]['close']
        atr = df.iloc[i]['atr']
        
        if pd.isna(atr) or atr == 0:
            targets.append(np.nan)
            continue
        
        sl_distance = atr * SL_ATR_MULT
        tp_distance = sl_distance * RR_RATIO
        
        long_tp = entry_price + tp_distance
        long_sl = entry_price - sl_distance
        short_tp = entry_price - tp_distance
        short_sl = entry_price + sl_distance
        
        long_result = None
        short_result = None
        
        for j in range(1, lookahead + 1):
            future_bar = df.iloc[i + j]
            future_high = future_bar['high']
            future_low = future_bar['low']
            
            if long_result is None:
                if future_low <= long_sl:
                    long_result = 'loss'
                elif future_high >= long_tp:
                    long_result = 'win'
            
            if short_result is None:
                if future_high >= short_sl:
                    short_result = 'loss'
                elif future_low <= short_tp:
                    short_result = 'win'
            
            if long_result and short_result:
                break
        
        if long_result == 'win' and short_result != 'win':
            targets.append(1)
        elif short_result == 'win' and long_result != 'win':
            targets.append(0)
        elif long_result == 'win' and short_result == 'win':
            targets.append(1)
        else:
            if df.iloc[i + 1]['close'] > entry_price:
                targets.append(1)
            else:
                targets.append(0)
    
    targets.extend([np.nan] * lookahead)
    return targets


def fetch_recent_data(symbol_info, hours=2000):
    params = {
        "fsym": symbol_info["fsym"],
        "tsym": symbol_info["tsym"],
        "limit": hours,
        "e": "CCCAGG"
    }
    response = requests.get(CRYPTOCOMPARE_URL, params=params, timeout=30)
    data = response.json()
    if data.get("Response") == "Success":
        candles = data.get("Data", {}).get("Data", [])
        df = pd.DataFrame(candles)
        df = df.rename(columns={'volumefrom': 'volume'})
        df['datetime'] = pd.to_datetime(df['time'], unit='s', utc=True)
        df = df[df['close'] > 0]
        return df[['datetime', 'open', 'high', 'low', 'close', 'volume']]
    return None


print("Fetching test data...")
all_data = []
for symbol, info in SYMBOLS.items():
    df = fetch_recent_data(info, 2000)
    if df is not None:
        df['symbol'] = symbol
        df = prepare_features(df)
        df['target'] = create_wick_based_target(df)
        all_data.append(df)
        print(f"  {symbol}: {len(df)} samples")
    time.sleep(0.5)

combined = pd.concat(all_data, ignore_index=True)
combined = combined.dropna()
combined = combined.replace([np.inf, -np.inf], np.nan).dropna()

print(f"\nTotal test samples: {len(combined)}")

# Get predictions with probabilities
X = combined[feature_cols]
y = combined['target']
X_scaled = scaler.transform(X)

# Get probabilities
probas = model.predict_proba(X_scaled)
prob_long = probas[:, 1]  # Probability of LONG (class 1)

# Analyze different thresholds
print("\n" + "="*80)
print("THRESHOLD ANALYSIS")
print("="*80)
print(f"{'Threshold':<12} {'Trades':<10} {'Win Rate':<12} {'Expected R':<12} {'Profit Factor'}")
print("-"*80)

best_threshold = 0.5
best_expected_r = -999

for threshold in [0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80]:
    # Filter to high confidence predictions
    high_conf_long = prob_long >= threshold
    high_conf_short = prob_long <= (1 - threshold)
    
    # Get actual outcomes
    long_predictions = high_conf_long
    short_predictions = high_conf_short
    
    total_trades = long_predictions.sum() + short_predictions.sum()
    
    if total_trades == 0:
        continue
    
    # Win rate for high confidence predictions
    long_wins = (y[long_predictions] == 1).sum()
    long_total = long_predictions.sum()
    short_wins = (y[short_predictions] == 0).sum()
    short_total = short_predictions.sum()
    
    total_wins = long_wins + short_wins
    win_rate = total_wins / total_trades if total_trades > 0 else 0
    
    # Expected R (with 1:3 R:R ratio)
    # Win = +3R, Loss = -1R
    expected_r = (win_rate * 3) - ((1 - win_rate) * 1)
    
    # Profit factor
    gross_profit = total_wins * 3
    gross_loss = (total_trades - total_wins) * 1
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else float('inf')
    
    print(f"{threshold:<12.2f} {total_trades:<10} {win_rate:<12.1%} {expected_r:<12.2f}R {profit_factor:.2f}")
    
    if expected_r > best_expected_r:
        best_expected_r = expected_r
        best_threshold = threshold

print("\n" + "="*80)
print(f"RECOMMENDED THRESHOLD: {best_threshold}")
print(f"Expected R per trade: {best_expected_r:.2f}R")
print("="*80)

# Save the threshold to a config that can be loaded
config = {
    'probability_threshold': best_threshold,
    'expected_r': best_expected_r,
    'analyzed_at': datetime.now(timezone.utc).isoformat()
}

import json
with open('trading_config.json', 'w') as f:
    json.dump(config, f, indent=2)

print(f"\nSaved to trading_config.json")

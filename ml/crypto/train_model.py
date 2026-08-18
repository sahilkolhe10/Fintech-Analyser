"""
Train ML Model for Crypto Trading with Wick-Based Targets

This script trains on 5 YEARS of historical data using CryptoCompare API.
Uses ACTUAL highs and lows (wicks) to determine if TP would be hit before SL.
"""

import requests
import pandas as pd
import numpy as np
import pickle
import time
from datetime import datetime, timezone, timedelta
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score

# =============================================================================
# CONFIGURATION
# =============================================================================
# CryptoCompare API (free tier allows 100k calls/month)
CRYPTOCOMPARE_URL = "https://min-api.cryptocompare.com/data/v2/histohour"

# Symbols mapping: our name -> CryptoCompare name
SYMBOLS = {
    "BTCUSD": {"fsym": "BTC", "tsym": "USD"},
    "ETHUSD": {"fsym": "ETH", "tsym": "USD"},
    "SOLUSD": {"fsym": "SOL", "tsym": "USD"}
}

# Trading parameters (must match paper_trading_bot.py)
RR_RATIO = 3.0
SL_ATR_MULT = 1.5
LOOKAHEAD_BARS = 24  # How many bars ahead to check for TP/SL hit

# 5 years of hourly data
YEARS_OF_DATA = 5
HOURS_PER_YEAR = 365 * 24
TOTAL_HOURS = YEARS_OF_DATA * HOURS_PER_YEAR  # ~43,800 hours

# =============================================================================
# FEATURE ENGINEERING
# =============================================================================
def compute_ema(series, span):
    return series.ewm(span=span, adjust=False).mean()


def prepare_features(df):
    """Prepare features for prediction"""
    df = df.copy()
    
    # EMAs
    df['ema_5'] = compute_ema(df['close'], 5)
    df['ema_15'] = compute_ema(df['close'], 15)
    df['ema_30'] = compute_ema(df['close'], 30)
    df['ema_50'] = compute_ema(df['close'], 50)
    
    # Volume
    df['volume_log'] = np.log1p(df['volume'])
    
    # EMA ratios
    df['ema_5_15_ratio'] = df['ema_5'] / df['ema_15']
    df['ema_15_30_ratio'] = df['ema_15'] / df['ema_30']
    df['ema_5_30_ratio'] = df['ema_5'] / df['ema_30']
    
    # Price position relative to EMAs
    df['price_ema5_ratio'] = df['close'] / df['ema_5']
    df['price_ema15_ratio'] = df['close'] / df['ema_15']
    df['price_ema30_ratio'] = df['close'] / df['ema_30']
    
    # RSI
    delta = df['close'].diff()
    gain = delta.where(delta > 0, 0).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    rs = gain / loss
    df['rsi'] = 100 - (100 / (1 + rs))
    
    # MACD
    ema_12 = compute_ema(df['close'], 12)
    ema_26 = compute_ema(df['close'], 26)
    df['macd'] = ema_12 - ema_26
    df['macd_signal'] = compute_ema(df['macd'], 9)
    df['macd_hist'] = df['macd'] - df['macd_signal']
    
    # Bollinger Bands
    df['bb_middle'] = df['close'].rolling(window=20).mean()
    bb_std = df['close'].rolling(window=20).std()
    df['bb_upper'] = df['bb_middle'] + (bb_std * 2)
    df['bb_lower'] = df['bb_middle'] - (bb_std * 2)
    df['bb_position'] = (df['close'] - df['bb_lower']) / (df['bb_upper'] - df['bb_lower'])
    df['bb_width'] = (df['bb_upper'] - df['bb_lower']) / df['bb_middle']
    
    # Momentum
    df['momentum_5'] = df['close'].pct_change(5)
    df['momentum_10'] = df['close'].pct_change(10)
    df['momentum_20'] = df['close'].pct_change(20)
    
    # ATR
    high_low = df['high'] - df['low']
    high_close = np.abs(df['high'] - df['close'].shift())
    low_close = np.abs(df['low'] - df['close'].shift())
    true_range = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
    df['atr'] = true_range.rolling(window=14).mean()
    df['atr_pct'] = df['atr'] / df['close']
    
    # Volume features
    df['volume_ema5'] = compute_ema(df['volume'], 5)
    df['volume_ema20'] = compute_ema(df['volume'], 20)
    df['volume_ratio'] = df['volume'] / df['volume_ema20']
    
    # Candle features - WICK ANALYSIS
    df['body_size'] = np.abs(df['close'] - df['open']) / df['open']
    df['upper_wick'] = (df['high'] - df[['close', 'open']].max(axis=1)) / df['open']
    df['lower_wick'] = (df[['close', 'open']].min(axis=1) - df['low']) / df['open']
    df['wick_ratio'] = df['upper_wick'] / (df['lower_wick'] + 0.0001)  # Upper vs lower wick
    df['total_range'] = (df['high'] - df['low']) / df['close']
    df['body_to_range'] = df['body_size'] / (df['total_range'] + 0.0001)  # What % of range is body
    
    # Returns
    df['return_1'] = df['close'].pct_change(1)
    df['return_3'] = df['close'].pct_change(3)
    df['return_5'] = df['close'].pct_change(5)
    
    return df


def create_wick_based_target(df, lookahead=LOOKAHEAD_BARS):
    """
    Create target based on whether LONG or SHORT would hit TP before SL
    using actual highs and lows (wicks), not just closes.
    
    Returns:
    - 1 if LONG trade would be profitable (high hits TP before low hits SL)
    - 0 if SHORT trade would be profitable (low hits TP before high hits SL)
    """
    targets = []
    
    for i in range(len(df) - lookahead):
        entry_price = df.iloc[i]['close']
        atr = df.iloc[i]['atr']
        
        if pd.isna(atr) or atr == 0:
            targets.append(np.nan)
            continue
        
        sl_distance = atr * SL_ATR_MULT
        tp_distance = sl_distance * RR_RATIO
        
        # LONG scenario
        long_tp = entry_price + tp_distance
        long_sl = entry_price - sl_distance
        
        # SHORT scenario
        short_tp = entry_price - tp_distance
        short_sl = entry_price + sl_distance
        
        long_result = None
        short_result = None
        
        # Check future bars using highs and lows (wicks!)
        for j in range(1, lookahead + 1):
            future_bar = df.iloc[i + j]
            future_high = future_bar['high']
            future_low = future_bar['low']
            
            # Check LONG outcome
            if long_result is None:
                if future_low <= long_sl:
                    long_result = 'loss'
                elif future_high >= long_tp:
                    long_result = 'win'
            
            # Check SHORT outcome
            if short_result is None:
                if future_high >= short_sl:
                    short_result = 'loss'
                elif future_low <= short_tp:
                    short_result = 'win'
            
            if long_result and short_result:
                break
        
        # Determine best direction
        if long_result == 'win' and short_result != 'win':
            targets.append(1)  # LONG
        elif short_result == 'win' and long_result != 'win':
            targets.append(0)  # SHORT
        elif long_result == 'win' and short_result == 'win':
            # Both would win - prefer based on which hits first (already determined by order)
            targets.append(1)  # Default to LONG
        else:
            # Neither wins clearly - use simple momentum
            if df.iloc[i + 1]['close'] > entry_price:
                targets.append(1)
            else:
                targets.append(0)
    
    # Pad with NaN for last lookahead bars
    targets.extend([np.nan] * lookahead)
    
    return targets


def get_feature_cols():
    return [
        'ema_5', 'ema_15', 'ema_30', 'ema_50', 'volume_log',
        'ema_5_15_ratio', 'ema_15_30_ratio', 'ema_5_30_ratio',
        'price_ema5_ratio', 'price_ema15_ratio', 'price_ema30_ratio',
        'rsi', 'macd', 'macd_signal', 'macd_hist',
        'bb_position', 'bb_width',
        'momentum_5', 'momentum_10', 'momentum_20',
        'atr_pct', 'volume_ratio',
        'body_size', 'upper_wick', 'lower_wick',
        'wick_ratio', 'total_range', 'body_to_range',  # NEW wick features
        'return_1', 'return_3', 'return_5'
    ]


# =============================================================================
# DATA FETCHING - 5 YEARS FROM CRYPTOCOMPARE
# =============================================================================
def fetch_cryptocompare_hourly(symbol_info, hours_back=2000):
    """
    Fetch hourly data from CryptoCompare.
    API returns max 2000 candles per request.
    """
    params = {
        "fsym": symbol_info["fsym"],
        "tsym": symbol_info["tsym"],
        "limit": min(hours_back, 2000),
        "e": "CCCAGG"  # Aggregate from multiple exchanges
    }
    
    try:
        response = requests.get(CRYPTOCOMPARE_URL, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        if data.get("Response") == "Success":
            candles = data.get("Data", {}).get("Data", [])
            if candles:
                df = pd.DataFrame(candles)
                df = df.rename(columns={
                    'time': 'time',
                    'open': 'open',
                    'high': 'high',
                    'low': 'low',
                    'close': 'close',
                    'volumefrom': 'volume'
                })
                df['datetime'] = pd.to_datetime(df['time'], unit='s', utc=True)
                return df[['datetime', 'time', 'open', 'high', 'low', 'close', 'volume']]
        return None
    except Exception as e:
        print(f"  Error: {e}")
        return None


def fetch_5_years_data(symbol_name, symbol_info):
    """
    Fetch 5 years of hourly data by making multiple API calls.
    CryptoCompare returns max 2000 candles per request.
    """
    print(f"  Fetching {YEARS_OF_DATA} years of {symbol_name} data...")
    
    all_data = []
    current_ts = int(datetime.now(timezone.utc).timestamp())
    hours_remaining = TOTAL_HOURS
    batch_size = 2000
    
    while hours_remaining > 0:
        # Prepare request
        params = {
            "fsym": symbol_info["fsym"],
            "tsym": symbol_info["tsym"],
            "limit": min(batch_size, hours_remaining),
            "toTs": current_ts,
            "e": "CCCAGG"
        }
        
        try:
            response = requests.get(CRYPTOCOMPARE_URL, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            if data.get("Response") == "Success":
                candles = data.get("Data", {}).get("Data", [])
                if candles:
                    df = pd.DataFrame(candles)
                    all_data.append(df)
                    
                    # Move timestamp back
                    oldest_ts = min(c['time'] for c in candles)
                    current_ts = oldest_ts - 1
                    hours_remaining -= len(candles)
                    
                    print(f"    Fetched {len(candles)} candles, {hours_remaining} remaining...")
                else:
                    break
            else:
                print(f"    API Error: {data.get('Message', 'Unknown')}")
                break
                
        except Exception as e:
            print(f"    Error: {e}")
            break
        
        # Rate limiting
        time.sleep(0.3)
    
    if all_data:
        combined = pd.concat(all_data, ignore_index=True)
        combined = combined.rename(columns={
            'volumefrom': 'volume'
        })
        combined['datetime'] = pd.to_datetime(combined['time'], unit='s', utc=True)
        combined = combined.sort_values('datetime').reset_index(drop=True)
        combined = combined.drop_duplicates(subset='time')
        
        # Filter out zero/invalid candles
        combined = combined[combined['close'] > 0]
        combined = combined[combined['volume'] > 0]
        
        print(f"  ✓ {symbol_name}: {len(combined)} total candles ({len(combined)/24/365:.1f} years)")
        return combined[['datetime', 'time', 'open', 'high', 'low', 'close', 'volume']]
    
    return None


# =============================================================================
# TRAINING
# =============================================================================
def train():
    print("="*60)
    print("TRAINING MODEL WITH WICK-BASED TARGETS")
    print(f"DATA: {YEARS_OF_DATA} YEARS (~{TOTAL_HOURS:,} hours per symbol)")
    print("="*60)
    print(f"Looking ahead {LOOKAHEAD_BARS} bars for TP/SL hits using highs/lows")
    print(f"R:R Ratio: 1:{RR_RATIO}, SL ATR Mult: {SL_ATR_MULT}")
    print()
    
    # Fetch 5 years of data from CryptoCompare
    print("Fetching 5 years of historical data from CryptoCompare...")
    all_data = []
    
    for symbol_name, symbol_info in SYMBOLS.items():
        df = fetch_5_years_data(symbol_name, symbol_info)
        if df is not None and len(df) > 100:
            df['symbol'] = symbol_name
            print(f"  Preparing features for {symbol_name}...")
            df = prepare_features(df)
            print(f"  Creating wick-based targets for {symbol_name}...")
            df['target'] = create_wick_based_target(df)
            all_data.append(df)
    
    if not all_data:
        print("ERROR: No data fetched!")
        return False
    
    combined = pd.concat(all_data, ignore_index=True)
    combined = combined.dropna()
    combined = combined.replace([np.inf, -np.inf], np.nan).dropna()
    
    print(f"\n{'='*60}")
    print("DATA SUMMARY")
    print(f"{'='*60}")
    print(f"Total samples: {len(combined):,}")
    print(f"Date range: {combined['datetime'].min()} to {combined['datetime'].max()}")
    print(f"Target distribution:\n{combined['target'].value_counts()}")
    
    # Prepare features
    feature_cols = get_feature_cols()
    X = combined[feature_cols]
    y = combined['target']
    
    # Split data (time-series split - no shuffle)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, shuffle=False
    )
    
    print(f"\nTraining samples: {len(X_train):,}")
    print(f"Testing samples: {len(X_test):,}")
    
    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # Train model with more iterations for larger dataset
    print("\nTraining HistGradientBoostingClassifier...")
    model = HistGradientBoostingClassifier(
        max_iter=300,  # More iterations for larger dataset
        max_depth=10,
        learning_rate=0.05,  # Lower learning rate for better generalization
        min_samples_leaf=50,  # Prevent overfitting
        random_state=42
    )
    model.fit(X_train_scaled, y_train)
    
    # Evaluate
    y_pred = model.predict(X_test_scaled)
    accuracy = accuracy_score(y_test, y_pred)
    
    print(f"\n{'='*60}")
    print("MODEL EVALUATION")
    print(f"{'='*60}")
    print(f"Accuracy: {accuracy:.2%}")
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred, target_names=['SHORT', 'LONG']))
    
    # Save model
    model_data = {
        'model': model,
        'scaler': scaler,
        'feature_cols': feature_cols,
        'n_samples': len(combined),
        'accuracy': accuracy,
        'trained_at': datetime.now(timezone.utc).isoformat(),
        'data_range': f"{combined['datetime'].min()} to {combined['datetime'].max()}",
        'config': {
            'rr_ratio': RR_RATIO,
            'sl_atr_mult': SL_ATR_MULT,
            'lookahead_bars': LOOKAHEAD_BARS,
            'years_of_data': YEARS_OF_DATA
        }
    }
    
    with open('trained_model.pkl', 'wb') as f:
        pickle.dump(model_data, f)
    
    print(f"\n✓ Model saved to trained_model.pkl")
    print(f"  - Samples: {len(combined):,}")
    print(f"  - Features: {len(feature_cols)}")
    print(f"  - Accuracy: {accuracy:.2%}")
    print(f"  - Data: {YEARS_OF_DATA} years")
    
    return True


if __name__ == "__main__":
    train()

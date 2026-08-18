"""
Paper Trading Bot for Crypto ML Model
- Fetches live 1H candle data from Delta Exchange
- Makes predictions using trained model
- Executes paper trades with position management
- Persists state to GCS for continuity across restarts
"""

import requests
import pandas as pd
import numpy as np
import pickle
import json
import time
import logging
import os
from datetime import datetime, timezone, timedelta
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import HistGradientBoostingClassifier

# Google Cloud Storage for state persistence
try:
    from google.cloud import storage
    GCS_AVAILABLE = True
except ImportError:
    GCS_AVAILABLE = False

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# =============================================================================
# CONFIGURATION
# =============================================================================
BASE_URL = "https://api.india.delta.exchange/v2"
SYMBOLS = ["BTCUSD", "ETHUSD", "SOLUSD"]
RESOLUTION = "1h"

# GCS Configuration for state persistence
GCS_BUCKET = os.environ.get("GCS_BUCKET", "trading-bot-free-1765318665-state")
GCS_STATE_FILE = "paper_trading_state.json"

# Trading Parameters
INITIAL_CAPITAL = 10.0
LEVERAGE = 5
MAX_TRADES_PER_DAY = 10  # Increased to allow multiple positions
MAX_POSITIONS = 3  # Can hold positions in all 3 symbols simultaneously
RR_RATIO = 3.0  # Best from backtest
SL_ATR_MULT = 1.5
SLIPPAGE_PCT = 0.05
BROKERAGE_PCT = 0.05

# Probability threshold - only trade when model confidence >= this
# Analysis: 0.55 threshold -> 70% win rate, 1.82R expected per trade, 638 trades
PROBABILITY_THRESHOLD = 0.55

# How often to check prices for position exits (seconds)
CHECK_INTERVAL = 1  # Every second for TP/SL monitoring

# How often to check for new candles for entry signals (seconds)
CANDLE_CHECK_INTERVAL = 60  # 1 minute

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
    
    # Target for training (fallback - actual target from train_model.py uses wicks)
    df['target'] = (df['close'].shift(-1) > df['close']).astype(int)
    
    df = df.dropna()
    df = df.replace([np.inf, -np.inf], np.nan).dropna()
    
    return df


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
# DATA FETCHING
# =============================================================================
def fetch_candles(symbol, limit=100):
    """Fetch recent candles for a symbol"""
    url = f"{BASE_URL}/history/candles"
    
    end_ts = int(datetime.now(timezone.utc).timestamp())
    start_ts = end_ts - (limit * 3600)  # limit hours back
    
    params = {
        "symbol": symbol,
        "resolution": RESOLUTION,
        "start": start_ts,
        "end": end_ts
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        candles = data.get("result", [])
        
        if candles:
            df = pd.DataFrame(candles)
            # API returns: close, high, low, open, time, volume (already correct names)
            df['datetime'] = pd.to_datetime(df['time'], unit='s', utc=True)
            df = df.sort_values('datetime').reset_index(drop=True)
            return df
        return None
    except Exception as e:
        logger.error(f"Error fetching {symbol}: {e}")
        return None


def fetch_current_price(symbol):
    """Fetch current ticker price"""
    url = f"{BASE_URL}/tickers/{symbol}"
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
        result = data.get("result", {})
        return float(result.get("close", 0))
    except Exception as e:
        logger.error(f"Error fetching ticker for {symbol}: {e}")
        return None


# =============================================================================
# PAPER TRADING ENGINE
# =============================================================================
class PaperTradingBot:
    def __init__(self):
        self.capital = INITIAL_CAPITAL
        self.positions = {}  # Dict keyed by symbol: {'direction', 'entry_price', 'sl', 'tp', 'quantity', 'entry_time'}
        self.trades = []
        self.daily_trade_count = 0
        self.current_date = None
        self.model = None
        self.scaler = None
        self.last_candle_time = {}  # Track last processed candle per symbol
        
    def train_model(self):
        """Load pre-trained model or train on historical data"""
        
        # Try to load pre-trained model first
        try:
            import pickle
            with open('trained_model.pkl', 'rb') as f:
                saved = pickle.load(f)
                self.model = saved['model']
                self.scaler = saved['scaler']
                n_samples = saved.get('n_samples', 'unknown')
                logger.info(f"Loaded pre-trained model ({n_samples} samples)")
                return True
        except FileNotFoundError:
            logger.info("No pre-trained model found, training from scratch...")
        except Exception as e:
            logger.error(f"Error loading model: {e}, training from scratch...")
        
        # Fallback: train on API data
        logger.info("Training model on historical data...")
        
        all_data = []
        for symbol in SYMBOLS:
            df = fetch_candles(symbol, limit=500)
            if df is not None:
                df['symbol'] = symbol
                df = prepare_features(df)
                all_data.append(df)
                logger.info(f"Fetched {symbol}: {len(df)} samples")
        
        if not all_data:
            logger.error("No training data available!")
            return False
        
        combined = pd.concat(all_data, ignore_index=True)
        feature_cols = get_feature_cols()
        
        X = combined[feature_cols]
        y = combined['target']
        
        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)
        
        self.model = HistGradientBoostingClassifier(max_iter=100, random_state=42)
        self.model.fit(X_scaled, y)
        
        logger.info(f"Model trained on {len(X)} samples (API fallback)")
        return True
    
    def get_prediction(self, df, symbol):
        """Get model prediction with probability threshold"""
        if self.model is None:
            return None, 0.0
        
        try:
            # Use the latest row for prediction
            latest = df.iloc[-1]
            feature_cols = get_feature_cols()
            features = latest[feature_cols].values.reshape(1, -1)
            features_scaled = self.scaler.transform(features)
            
            # Get probability instead of just prediction
            probas = self.model.predict_proba(features_scaled)[0]
            prob_short = probas[0]  # Probability of class 0 (SHORT)
            prob_long = probas[1]   # Probability of class 1 (LONG)
            
            # Only trade if confidence exceeds threshold
            if prob_long >= PROBABILITY_THRESHOLD:
                logger.info(f"{symbol} | LONG signal with {prob_long:.1%} confidence (threshold: {PROBABILITY_THRESHOLD:.0%})")
                return 'long', prob_long
            elif prob_short >= PROBABILITY_THRESHOLD:
                logger.info(f"{symbol} | SHORT signal with {prob_short:.1%} confidence (threshold: {PROBABILITY_THRESHOLD:.0%})")
                return 'short', prob_short
            else:
                # No high confidence signal
                logger.debug(f"{symbol} | No signal - LONG: {prob_long:.1%}, SHORT: {prob_short:.1%}")
                return None, max(prob_long, prob_short)
                
        except Exception as e:
            logger.error(f"Prediction error: {e}")
            return None, 0.0
    
    def check_position_exit(self, symbol, current_price):
        """Check if position for this symbol should be exited"""
        if symbol not in self.positions:
            return False
        
        position = self.positions[symbol]
        
        if position['direction'] == 'long':
            if current_price <= position['sl']:
                self.close_position(symbol, current_price, 'SL')
                return True
            elif current_price >= position['tp']:
                self.close_position(symbol, current_price, 'TP')
                return True
        else:  # short
            if current_price >= position['sl']:
                self.close_position(symbol, current_price, 'SL')
                return True
            elif current_price <= position['tp']:
                self.close_position(symbol, current_price, 'TP')
                return True
        
        return False
    
    def close_position(self, symbol, exit_price, reason):
        """Close position for a symbol and calculate PnL"""
        if symbol not in self.positions:
            return
        
        position = self.positions[symbol]
        
        # Apply slippage
        if position['direction'] == 'long':
            exit_price *= (1 - SLIPPAGE_PCT / 100)
            pnl = position['quantity'] * (exit_price - position['entry_price'])
        else:
            exit_price *= (1 + SLIPPAGE_PCT / 100)
            pnl = position['quantity'] * (position['entry_price'] - exit_price)
        
        # Subtract brokerage
        brokerage = position['position_value'] * (BROKERAGE_PCT / 100) * 2
        net_pnl = pnl - brokerage
        
        self.capital += net_pnl
        
        trade = {
            'symbol': symbol,
            'direction': position['direction'],
            'entry_time': position['entry_time'],
            'entry_price': position['entry_price'],
            'exit_time': datetime.now(timezone.utc).isoformat(),
            'exit_price': exit_price,
            'exit_reason': reason,
            'net_pnl': net_pnl,
            'capital_after': self.capital
        }
        self.trades.append(trade)
        
        result_emoji = "✅" if net_pnl > 0 else "❌"
        logger.info(f"{result_emoji} CLOSED {position['direction'].upper()} {symbol} | "
                   f"Entry: ${position['entry_price']:.2f} | Exit: ${exit_price:.2f} | "
                   f"{reason} | PnL: ${net_pnl:.2f} | Capital: ${self.capital:.2f}")
        
        del self.positions[symbol]
        self.save_state()
    
    def open_position(self, symbol, direction, entry_price, atr, confidence):
        """Open a new position for a symbol"""
        # Calculate SL and TP
        sl_distance = atr * SL_ATR_MULT
        tp_distance = sl_distance * RR_RATIO
        
        if direction == 'long':
            entry_price *= (1 + SLIPPAGE_PCT / 100)
            sl = entry_price - sl_distance
            tp = entry_price + tp_distance
        else:
            entry_price *= (1 - SLIPPAGE_PCT / 100)
            sl = entry_price + sl_distance
            tp = entry_price - tp_distance
        
        # Position sizing: divide capital among max positions
        available_capital = self.capital / MAX_POSITIONS
        position_value = min(available_capital * LEVERAGE, 200)  # Cap at $200 per position
        quantity = position_value / entry_price
        
        self.positions[symbol] = {
            'direction': direction,
            'entry_price': entry_price,
            'sl': sl,
            'tp': tp,
            'quantity': quantity,
            'position_value': position_value,
            'confidence': confidence,
            'entry_time': datetime.now(timezone.utc).isoformat()
        }
        
        self.daily_trade_count += 1
        
        logger.info(f"📈 OPENED {direction.upper()} {symbol} | "
                   f"Entry: ${entry_price:.2f} | SL: ${sl:.2f} | TP: ${tp:.2f} | "
                   f"Size: ${position_value:.2f} | Confidence: {confidence:.1%}")
        
        self.save_state()
    
    def process_symbol(self, symbol):
        """Process a symbol - check exits, make predictions, open positions"""
        # Fetch recent candles
        df = fetch_candles(symbol, limit=100)
        if df is None or len(df) < 50:
            return
        
        # Prepare features
        df = prepare_features(df)
        if len(df) < 1:
            return
        
        latest = df.iloc[-1]
        current_price = latest['close']
        candle_time = latest['datetime']
        
        # Check if we already processed this candle
        if symbol in self.last_candle_time:
            if candle_time <= self.last_candle_time[symbol]:
                return  # Already processed
        
        self.last_candle_time[symbol] = candle_time
        logger.info(f"{symbol} | Price: ${current_price:.2f} | Candle: {candle_time}")
        
        # Check position exit first
        if symbol in self.positions:
            self.check_position_exit(symbol, current_price)
        
        # If no position for this symbol, under daily limit, and under max positions, look for entry
        can_open_position = (
            symbol not in self.positions and 
            self.daily_trade_count < MAX_TRADES_PER_DAY and
            len(self.positions) < MAX_POSITIONS
        )
        
        if can_open_position:
            direction, confidence = self.get_prediction(df, symbol)
            
            if direction is not None:  # High confidence signal
                atr = latest['atr']
                self.open_position(symbol, direction, current_price, atr, confidence)
    
    def monitor_positions(self):
        """Check all positions against live prices every second"""
        if not self.positions:
            return
        
        for symbol in list(self.positions.keys()):  # list() to avoid mutation during iteration
            current_price = fetch_current_price(symbol)
            
            if current_price is None:
                continue
            
            # Check TP/SL
            self.check_position_exit(symbol, current_price)
    
    def run(self):
        """Main trading loop"""
        logger.info("="*60)
        logger.info("PAPER TRADING BOT STARTED")
        logger.info(f"Capital: ${self.capital} | Leverage: {LEVERAGE}x | R:R: 1:{RR_RATIO}")
        logger.info(f"Probability Threshold: {PROBABILITY_THRESHOLD:.0%} (70% win rate)")
        logger.info(f"Max Positions: {MAX_POSITIONS} | Symbols: {SYMBOLS}")
        logger.info(f"Position monitoring: Every {CHECK_INTERVAL}s | Entry signals: Every {CANDLE_CHECK_INTERVAL}s")
        logger.info("="*60)
        
        # Load state if exists
        self.load_state()
        
        # Train model
        if not self.train_model():
            logger.error("Failed to train model. Exiting.")
            return
        
        last_candle_check = 0
        loop_count = 0
        
        while True:
            try:
                current_time = time.time()
                
                # Reset daily counter on new day
                today = datetime.now(timezone.utc).date()
                if today != self.current_date:
                    self.current_date = today
                    self.daily_trade_count = 0
                    logger.info(f"New day: {today} | Daily trades reset")
                
                # EVERY SECOND: Monitor all positions for TP/SL exits
                if self.positions:
                    self.monitor_positions()
                    
                    # Log position status every 60 seconds
                    if loop_count % 60 == 0:
                        for symbol, position in self.positions.items():
                            price = fetch_current_price(symbol)
                            if price:
                                direction = position['direction']
                                entry = position['entry_price']
                                sl = position['sl']
                                tp = position['tp']
                                if direction == 'long':
                                    unrealized_pnl = position['quantity'] * (price - entry)
                                else:
                                    unrealized_pnl = position['quantity'] * (entry - price)
                                pnl_emoji = "📈" if unrealized_pnl > 0 else "📉"
                                logger.info(f"{pnl_emoji} {direction.upper()} {symbol} | Price: ${price:.2f} | Entry: ${entry:.2f} | uPnL: ${unrealized_pnl:.2f}")
                
                # EVERY CANDLE_CHECK_INTERVAL: Check for new entries
                if current_time - last_candle_check >= CANDLE_CHECK_INTERVAL:
                    last_candle_check = current_time
                    
                    for symbol in SYMBOLS:
                        self.process_symbol(symbol)
                        time.sleep(0.5)  # Small delay between symbols
                
                loop_count += 1
                time.sleep(CHECK_INTERVAL)
                
            except KeyboardInterrupt:
                logger.info("Bot stopped by user")
                break
            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                time.sleep(5)  # Shorter retry on error
    
    def save_state(self):
        """Save current state to GCS for persistence across restarts"""
        state = {
            'capital': self.capital,
            'positions': self.positions,  # Dict of positions keyed by symbol
            'trades': self.trades,
            'daily_trade_count': self.daily_trade_count,
            'current_date': str(self.current_date) if self.current_date else None,
            'last_updated': datetime.now(timezone.utc).isoformat()
        }
        
        # Save to GCS if available
        if GCS_AVAILABLE:
            try:
                client = storage.Client()
                bucket = client.bucket(GCS_BUCKET)
                blob = bucket.blob(GCS_STATE_FILE)
                blob.upload_from_string(json.dumps(state, indent=2), content_type='application/json')
                logger.info(f"State saved to GCS: gs://{GCS_BUCKET}/{GCS_STATE_FILE}")
            except Exception as e:
                logger.error(f"Failed to save state to GCS: {e}")
                # Fallback to local file
                with open('paper_trading_state.json', 'w') as f:
                    json.dump(state, f, indent=2)
        else:
            # Local fallback
            with open('paper_trading_state.json', 'w') as f:
                json.dump(state, f, indent=2)
    
    def load_state(self):
        """Load state from GCS if exists"""
        state = None
        
        # Try GCS first
        if GCS_AVAILABLE:
            try:
                client = storage.Client()
                bucket = client.bucket(GCS_BUCKET)
                blob = bucket.blob(GCS_STATE_FILE)
                if blob.exists():
                    state = json.loads(blob.download_as_string())
                    logger.info(f"Loaded state from GCS: gs://{GCS_BUCKET}/{GCS_STATE_FILE}")
            except Exception as e:
                logger.error(f"Failed to load state from GCS: {e}")
        
        # Fallback to local file
        if state is None:
            try:
                with open('paper_trading_state.json', 'r') as f:
                    state = json.load(f)
                    logger.info("Loaded state from local file")
            except FileNotFoundError:
                pass
        
        if state:
            self.capital = state.get('capital', INITIAL_CAPITAL)
            self.positions = state.get('positions', {})
            self.trades = state.get('trades', [])
            self.daily_trade_count = state.get('daily_trade_count', 0)
            if state.get('current_date'):
                self.current_date = datetime.strptime(state['current_date'], '%Y-%m-%d').date()
            logger.info(f"Restored state: Capital=${self.capital:.2f}, Trades={len(self.trades)}, Open Positions={len(self.positions)}")
            for symbol, pos in self.positions.items():
                logger.info(f"  📊 {pos['direction'].upper()} {symbol} @ ${pos['entry_price']:.2f}")
        else:
            logger.info("No previous state found, starting fresh with $10.00")


def test_connection():
    """Test connection to Delta Exchange API"""
    logger.info("Testing Delta Exchange API connection...")
    
    for symbol in SYMBOLS:
        df = fetch_candles(symbol, limit=10)
        if df is not None:
            latest = df.iloc[-1]
            logger.info(f"✓ {symbol}: Price=${latest['close']:.2f}, Time={latest['datetime']}")
        else:
            logger.error(f"✗ {symbol}: Failed to fetch data")
            return False
    
    return True


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        # Test mode - just check connection
        if test_connection():
            logger.info("\n✓ All connections successful!")
        else:
            logger.error("\n✗ Connection test failed!")
    else:
        # Run the bot
        bot = PaperTradingBot()
        bot.run()

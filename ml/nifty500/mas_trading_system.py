"""
Multi-Agent System (MAS) for Intraday Stock Trading
====================================================
A 4-agent architecture for Nifty 500 intraday trading using ONLY raw OHLCV data.
NO technical indicators - pure price velocity, micro-structure, and volume patterns.

Architecture:
    Data Agent    -> Strategy Agent -> Risk Agent -> Judge -> Execution
    (Ingestion)      (XGBoost)       (Risk Mgmt)    (Consensus)

Training: 2 years recent data
Testing: 7 years historical data
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass, field
from enum import Enum
import logging
from abc import ABC, abstractmethod
import pickle
import json

import xgboost as xgb
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import classification_report, confusion_matrix

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)-8s | %(name)-15s | %(message)s'
)
logger = logging.getLogger(__name__)


# =============================================================================
# ENUMS AND CONSTANTS
# =============================================================================

class Signal(Enum):
    """Trading signal enumeration"""
    BUY = 1
    SHORT = -1
    HOLD = 0


class AgentState(Enum):
    """Agent state machine states"""
    IDLE = "idle"
    PROCESSING = "processing"
    WAITING = "waiting"
    COMPLETED = "completed"
    ERROR = "error"


# Architecture constants
WINDOW_SIZE = 20  # Lookback windows for sequence data
HORIZON = 5  # Prediction horizon (bars ahead)
TRAIN_YEARS = 2  # Training data duration
TEST_YEARS = 7  # Testing data duration


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class MarketData:
    """Raw market data container"""
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int
    symbol: str


@dataclass
class WindowedSequence:
    """Windowed price/volume sequence for model input"""
    prices: np.ndarray  # Shape: (window_size, 4) - OHLC
    volumes: np.ndarray  # Shape: (window_size,)
    timestamps: List[datetime]
    current_idx: int


@dataclass
class StrategyProposal:
    """Strategy Agent's trading proposal"""
    signal: Signal
    confidence: float  # 0.0 to 1.0
    raw_prediction: np.ndarray  # Class probabilities [Hold, Buy, Short]
    reasoning: str
    timestamp: datetime
    symbol: str


@dataclass
class RiskAssessment:
    """Risk Agent's assessment of a proposal"""
    approved: bool
    position_size: float  # Fraction of capital (0.0 to 1.0)
    stop_loss_pct: float  # Stop loss percentage
    take_profit_pct: float  # Take profit percentage
    risk_reasoning: str
    max_adverse_excursion: float  # Maximum allowed drawdown


@dataclass
class ExecutionOrder:
    """Final execution order from Judge"""
    signal: Signal
    symbol: str
    quantity: int
    entry_price: float
    stop_loss: float
    take_profit: float
    timestamp: datetime
    consensus_score: float  # Combined confidence from all agents


@dataclass
class Trade:
    """Executed trade record"""
    symbol: str
    entry_time: datetime
    exit_time: Optional[datetime]
    entry_price: float
    exit_price: Optional[float]
    signal: Signal
    quantity: int
    pnl: float = 0.0
    pnl_pct: float = 0.0
    status: str = "open"  # open, closed, stopped_out


# =============================================================================
# SYNTHETIC DATA GENERATOR
# =============================================================================

class SyntheticDataGenerator:
    """
    Generates synthetic Nifty 500-like OHLCV data for testing.
    Uses realistic market microstructure patterns without any indicators.
    """
    
    def __init__(self, seed: int = 42):
        np.random.seed(seed)
        self.seed = seed
        
    def generate_stock_data(
        self,
        symbol: str,
        start_date: datetime,
        end_date: datetime,
        base_price: float = 1000.0,
        volatility: float = 0.02,
        daily_bars: int = 12  # Reduced from 75 for speed
    ) -> pd.DataFrame:
        """
        Generate synthetic intraday OHLCV data for a single stock.
        
        Args:
            symbol: Stock symbol
            start_date: Start date
            end_date: End date
            base_price: Starting price level
            volatility: Daily volatility
            daily_bars: Number of bars per day (reduced for speed)
            
        Returns:
            DataFrame with OHLCV columns
        """
        # Generate trading days (exclude weekends)
        dates = pd.date_range(start=start_date, end=end_date, freq='B')  # Business days
        
        # Intraday: sample bars throughout the day
        intraday_times = pd.date_range(
            start='09:15', end='15:30', freq=f'{75 // daily_bars * 5}min'
        )[:daily_bars]
        
        records = []
        current_price = base_price
        
        for date in dates:
            # Daily trend component (random walk with drift)
            daily_drift = np.random.normal(0.0001, volatility / np.sqrt(252))
            daily_vol = volatility / np.sqrt(252)
            
            prev_close = current_price
            
            for i, time in enumerate(intraday_times):
                timestamp = date.replace(
                    hour=time.hour, minute=time.minute
                )
                
                # Microstructure patterns
                if i == 0:  # Open auction effect
                    gap = np.random.normal(daily_drift, daily_vol * 0.5)
                    open_price = prev_close * (1 + gap)
                else:
                    open_price = close_prev
                
                # Intraday momentum and mean reversion
                momentum = np.random.normal(0, daily_vol / np.sqrt(75))
                mean_rev = -0.02 * (open_price - prev_close) / prev_close
                
                # Volume patterns (U-shaped throughout the day)
                hour = timestamp.hour
                if hour < 10 or hour >= 15:
                    volume_multiplier = 1.5 + np.random.uniform(0, 0.5)
                elif 10 <= hour < 11 or 14 <= hour < 15:
                    volume_multiplier = 1.2 + np.random.uniform(0, 0.3)
                else:
                    volume_multiplier = 0.8 + np.random.uniform(0, 0.2)
                
                base_volume = int(np.random.lognormal(10, 0.5))
                volume = int(base_volume * volume_multiplier)
                
                # Generate OHLC
                returns = momentum + mean_rev + np.random.normal(0, daily_vol / np.sqrt(75) / 2)
                close_price = open_price * (1 + returns)
                
                # High/Low from open and close
                intraday_range = abs(open_price - close_price) * (1 + np.random.exponential(0.5))
                
                if close_price > open_price:
                    high_price = max(open_price, close_price) * (1 + np.random.uniform(0, 0.003))
                    low_price = min(open_price, close_price) * (1 - np.random.uniform(0, 0.003))
                else:
                    high_price = max(open_price, close_price) * (1 + np.random.uniform(0, 0.003))
                    low_price = min(open_price, close_price) * (1 - np.random.uniform(0, 0.003))
                
                # Ensure OHLC consistency
                high_price = max(high_price, open_price, close_price)
                low_price = min(low_price, open_price, close_price)
                
                records.append({
                    'timestamp': timestamp,
                    'symbol': symbol,
                    'open': round(open_price, 2),
                    'high': round(high_price, 2),
                    'low': round(low_price, 2),
                    'close': round(close_price, 2),
                    'volume': volume
                })
                
                close_prev = close_price
            
            current_price = close_price
        
        df = pd.DataFrame(records)
        return df
    
    def generate_nifty500_dataset(
        self,
        start_date: datetime,
        end_date: datetime,
        n_stocks: int = 50
    ) -> pd.DataFrame:
        """
        Generate synthetic dataset for multiple Nifty 500 stocks.
        
        Args:
            start_date: Dataset start date
            end_date: Dataset end date
            n_stocks: Number of stocks to generate
            
        Returns:
            Combined DataFrame for all stocks
        """
        all_data = []
        
        # Generate diverse stock characteristics
        for i in range(n_stocks):
            symbol = f"NIFTY{i+1:03d}"
            base_price = np.random.uniform(100, 5000)
            volatility = np.random.uniform(0.015, 0.035)
            
            logger.info(f"Generating synthetic data for {symbol}")
            stock_data = self.generate_stock_data(
                symbol=symbol,
                start_date=start_date,
                end_date=end_date,
                base_price=base_price,
                volatility=volatility
            )
            all_data.append(stock_data)
        
        combined_df = pd.concat(all_data, ignore_index=True)
        combined_df = combined_df.sort_values(['symbol', 'timestamp']).reset_index(drop=True)
        
        logger.info(f"Generated {len(combined_df)} records for {n_stocks} stocks")
        return combined_df


# =============================================================================
# DATA AGENT
# =============================================================================

class DataAgent:
    """
    Data Agent: Ingests, cleans, and structures raw OHLCV data.
    Handles outliers and creates windowed sequences for the model.
    NO technical indicators - pure price/volume sequences only.
    """
    
    def __init__(
        self,
        window_size: int = WINDOW_SIZE,
        horizon: int = HORIZON
    ):
        self.window_size = window_size
        self.horizon = horizon
        self.state = AgentState.IDLE
        self._data_cache: Dict[str, pd.DataFrame] = {}
        
    def ingest(self, df: pd.DataFrame) -> None:
        """Ingest raw OHLCV data"""
        self.state = AgentState.PROCESSING
        
        # Validate required columns
        required_cols = ['timestamp', 'symbol', 'open', 'high', 'low', 'close', 'volume']
        missing = set(required_cols) - set(df.columns)
        if missing:
            raise ValueError(f"Missing required columns: {missing}")
        
        # Store by symbol
        for symbol in df['symbol'].unique():
            symbol_data = df[df['symbol'] == symbol].copy()
            symbol_data = symbol_data.sort_values('timestamp').reset_index(drop=True)
            self._data_cache[symbol] = symbol_data
        
        self.state = AgentState.COMPLETED
        logger.info(f"Data Agent: Ingested data for {len(self._data_cache)} symbols")
    
    def clean(self, symbol: str) -> pd.DataFrame:
        """
        Clean data for a specific symbol.
        Handles outliers using raw price bounds only.
        """
        if symbol not in self._data_cache:
            raise ValueError(f"No data for symbol: {symbol}")
        
        df = self._data_cache[symbol].copy()
        
        # Remove zero/negative prices
        for col in ['open', 'high', 'low', 'close']:
            df = df[df[col] > 0]
        
        # Remove volume outliers (> 10x median)
        vol_median = df['volume'].median()
        df = df[df['volume'] < vol_median * 10]
        
        # OHLC consistency check
        df = df[df['high'] >= df['low']]
        df = df[df['high'] >= df['open']]
        df = df[df['high'] >= df['close']]
        df = df[df['low'] <= df['open']]
        df = df[df['low'] <= df['close']]
        
        # Forward fill any gaps
        df = df.ffill()
        
        self._data_cache[symbol] = df
        return df
    
    def create_windowed_sequence(
        self,
        symbol: str,
        idx: int
    ) -> Optional[WindowedSequence]:
        """
        Create a windowed sequence at a specific index.
        Returns raw price/volume sequences only.
        """
        if symbol not in self._data_cache:
            return None
        
        df = self._data_cache[symbol]
        
        if idx < self.window_size or idx >= len(df):
            return None
        
        # Extract window
        start_idx = idx - self.window_size
        end_idx = idx
        
        window = df.iloc[start_idx:end_idx]
        
        # Raw OHLC prices (normalized by first open)
        base_price = window['open'].iloc[0]
        prices = window[['open', 'high', 'low', 'close']].values / base_price
        volumes = window['volume'].values
        
        return WindowedSequence(
            prices=prices,
            volumes=volumes,
            timestamps=window['timestamp'].tolist(),
            current_idx=idx
        )
    
    def create_label(
        self,
        symbol: str,
        idx: int
    ) -> int:
        """
        Create prediction label based on future price movement.
        0: Hold, 1: Buy, 2: Short
        
        Uses raw price change over horizon.
        """
        if symbol not in self._data_cache:
            return 0
        
        df = self._data_cache[symbol]
        
        if idx + self.horizon >= len(df):
            return 0  # Hold (no future data)
        
        current_close = df['close'].iloc[idx]
        future_high = df['high'].iloc[idx + 1:idx + 1 + self.horizon].max()
        future_low = df['low'].iloc[idx + 1:idx + 1 + self.horizon].min()
        
        # Calculate returns
        up_move = (future_high - current_close) / current_close
        down_move = (current_close - future_low) / current_close
        
        # Threshold for signal generation (0.3% move)
        threshold = 0.003
        
        if up_move > threshold and up_move > down_move:
            return 1  # Buy
        elif down_move > threshold and down_move > up_move:
            return 2  # Short
        else:
            return 0  # Hold
    
    def get_feature_matrix(
        self,
        symbol: str
    ) -> Tuple[np.ndarray, np.ndarray, List[int]]:
        """
        Create feature matrix for training/prediction.
        Features are ONLY raw price velocities and volume patterns.
        Uses vectorized operations for speed.
        """
        df = self.clean(symbol).copy()
        
        if len(df) < self.window_size + self.horizon + 10:
            return np.array([]), np.array([]), []
        
        # Pre-compute all rolling windows using numpy stride tricks
        n_samples = len(df) - self.window_size - self.horizon
        
        if n_samples <= 0:
            return np.array([]), np.array([]), []
        
        # Limit samples for memory efficiency
        max_samples = 50000  # Cap samples per symbol
        sample_step = max(1, n_samples // max_samples)
        
        X_list = []
        y_list = []
        indices = []
        
        # Get base arrays
        opens = df['open'].values
        highs = df['high'].values
        lows = df['low'].values
        closes = df['close'].values
        volumes = df['volume'].values
        
        for i in range(0, n_samples, sample_step):
            idx = self.window_size + i
            start_idx = idx - self.window_size
            end_idx = idx
            
            # Extract window
            window_open = opens[start_idx:end_idx]
            window_high = highs[start_idx:end_idx]
            window_low = lows[start_idx:end_idx]
            window_close = closes[start_idx:end_idx]
            window_vol = volumes[start_idx:end_idx]
            
            # Normalize by first open
            base_price = window_open[0]
            prices_norm = np.column_stack([
                window_open / base_price,
                window_high / base_price,
                window_low / base_price,
                window_close / base_price
            ])
            
            # Volume ratios
            vol_mean = window_vol.mean()
            vol_features = window_vol / vol_mean if vol_mean > 0 else np.ones(self.window_size)
            
            # Price velocity (close-to-close changes)
            price_changes = np.diff(window_close) / window_close[:-1]
            
            # High-Low range
            hl_range = (window_high - window_low) / window_open
            
            # Open-Close direction
            oc_direction = (window_close - window_open) / window_open
            
            # Combine features
            features = np.concatenate([
                prices_norm.flatten(),
                vol_features,
                price_changes,
                hl_range,
                oc_direction
            ])
            
            # Create label
            label = self._create_label_fast(df, idx)
            
            X_list.append(features)
            y_list.append(label)
            indices.append(idx)
        
        return np.array(X_list), np.array(y_list), indices
    
    def _create_label_fast(
        self,
        df: pd.DataFrame,
        idx: int
    ) -> int:
        """Fast label creation without bounds checking"""
        current_close = df['close'].iloc[idx]
        future_slice = df.iloc[idx + 1:idx + 1 + self.horizon]
        
        if len(future_slice) == 0:
            return 0
        
        future_high = future_slice['high'].max()
        future_low = future_slice['low'].min()
        
        up_move = (future_high - current_close) / current_close
        down_move = (current_close - future_low) / current_close
        
        threshold = 0.003
        
        if up_move > threshold and up_move > down_move:
            return 1  # Buy
        elif down_move > threshold and down_move > up_move:
            return 2  # Short
        else:
            return 0  # Hold
    
    def get_current_data(self, symbol: str) -> Optional[Dict]:
        """Get latest market data for a symbol"""
        if symbol not in self._data_cache:
            return None
        return self._data_cache[symbol].iloc[-1].to_dict()
    
    def reset(self) -> None:
        """Reset agent state"""
        self._data_cache.clear()
        self.state = AgentState.IDLE


# =============================================================================
# STRATEGY AGENT
# =============================================================================

class StrategyAgent:
    """
    Strategy Agent: Core predictive engine using XGBoost.
    Multi-class classifier: Hold (0), Buy (1), Short (2)
    Uses ONLY raw price/volume sequences - NO indicators.
    """
    
    def __init__(
        self,
        n_estimators: int = 500,
        max_depth: int = 6,
        learning_rate: float = 0.05,
        subsample: float = 0.8,
        colsample_bytree: float = 0.8,
        random_state: int = 42
    ):
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.learning_rate = learning_rate
        self.subsample = subsample
        self.colsample_bytree = colsample_bytree
        self.random_state = random_state
        
        self.model: Optional[xgb.XGBClassifier] = None
        self.state = AgentState.IDLE
        self._feature_importance: Optional[np.ndarray] = None
        
    def _create_model(self) -> xgb.XGBClassifier:
        """Create XGBoost classifier with optimized parameters"""
        return xgb.XGBClassifier(
            n_estimators=self.n_estimators,
            max_depth=self.max_depth,
            learning_rate=self.learning_rate,
            subsample=self.subsample,
            colsample_bytree=self.colsample_bytree,
            objective='multi:softprob',
            num_class=3,
            random_state=self.random_state,
            n_jobs=-1,
            eval_metric='mlogloss',
            early_stopping_rounds=50,
            verbosity=0
        )
    
    def train(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: np.ndarray,
        y_val: np.ndarray
    ) -> Dict[str, float]:
        """
        Train the XGBoost model.
        
        Args:
            X_train: Training features
            y_train: Training labels
            X_val: Validation features
            y_val: Validation labels
            
        Returns:
            Training metrics
        """
        self.state = AgentState.PROCESSING
        logger.info("Strategy Agent: Training XGBoost model...")
        
        self.model = self._create_model()
        
        self.model.fit(
            X_train, y_train,
            eval_set=[(X_val, y_val)],
            verbose=False
        )
        
        # Calculate metrics
        train_score = self.model.score(X_train, y_train)
        val_score = self.model.score(X_val, y_val)
        
        self._feature_importance = self.model.feature_importances_
        self.state = AgentState.COMPLETED
        
        metrics = {
            'train_accuracy': train_score,
            'val_accuracy': val_score,
            'n_features': X_train.shape[1],
            'n_estimators_used': self.model.best_iteration or self.n_estimators
        }
        
        logger.info(f"Strategy Agent: Training complete. Val Accuracy: {val_score:.4f}")
        return metrics
    
    def predict(
        self,
        features: np.ndarray
    ) -> StrategyProposal:
        """
        Generate trading signal from raw features.
        
        Args:
            features: Feature vector from Data Agent
            
        Returns:
            StrategyProposal with signal and confidence
        """
        if self.model is None:
            raise RuntimeError("Strategy Agent: Model not trained")
        
        self.state = AgentState.PROCESSING
        
        # Get class probabilities
        probs = self.model.predict_proba(features.reshape(1, -1))[0]
        
        # Get predicted class
        pred_class = np.argmax(probs)
        
        # Map to Signal enum
        signal_map = {0: Signal.HOLD, 1: Signal.BUY, 2: Signal.SHORT}
        signal = signal_map[pred_class]
        
        # Confidence is the probability of predicted class
        confidence = probs[pred_class]
        
        # Generate reasoning based on raw price patterns
        reasoning = self._generate_reasoning(features, probs)
        
        self.state = AgentState.COMPLETED
        
        return StrategyProposal(
            signal=signal,
            confidence=confidence,
            raw_prediction=probs,
            reasoning=reasoning,
            timestamp=datetime.now(),
            symbol="SYMBOL"  # Will be set by caller
        )
    
    def _generate_reasoning(
        self,
        features: np.ndarray,
        probs: np.ndarray
    ) -> str:
        """Generate human-readable reasoning from raw features"""
        # Extract key feature groups
        n_windows = WINDOW_SIZE
        price_features = features[:n_windows * 4]
        vol_features = features[n_windows * 4:n_windows * 5]
        
        # Recent price trend
        recent_closes = price_features[-4::4]  # Last closes in each window
        trend = "upward" if recent_closes[-1] > recent_closes[0] else "downward"
        
        # Volume pattern
        avg_vol = vol_features.mean()
        vol_pattern = "elevated" if avg_vol > 1.2 else "normal" if avg_vol > 0.8 else "low"
        
        # Prediction confidence
        max_prob = max(probs)
        if max_prob > 0.6:
            conf_str = "high confidence"
        elif max_prob > 0.4:
            conf_str = "moderate confidence"
        else:
            conf_str = "low confidence"
        
        return f"Raw price {trend} trend, {vol_pattern} volume, {conf_str} prediction"
    
    def get_feature_importance(self) -> Optional[np.ndarray]:
        """Get feature importance scores"""
        return self._feature_importance
    
    def save(self, path: str) -> None:
        """Save model to disk"""
        with open(path, 'wb') as f:
            pickle.dump(self.model, f)
        logger.info(f"Strategy Agent: Model saved to {path}")
    
    def load(self, path: str) -> None:
        """Load model from disk"""
        with open(path, 'rb') as f:
            self.model = pickle.load(f)
        self.state = AgentState.COMPLETED
        logger.info(f"Strategy Agent: Model loaded from {path}")
    
    def reset(self) -> None:
        """Reset agent state"""
        self.model = None
        self.state = AgentState.IDLE


# =============================================================================
# RISK AGENT
# =============================================================================

class RiskAgent:
    """
    Risk Agent: Independent risk management gateway.
    Evaluates Strategy proposals using raw volatility and exposure.
    NO indicators - pure price-based risk metrics only.
    """
    
    def __init__(
        self,
        max_position_size: float = 0.25,  # Max 25% of capital per trade
        max_daily_loss: float = 0.02,     # Max 2% daily loss
        base_stop_loss: float = 0.01,     # Base 1% stop loss
        base_take_profit: float = 0.02,   # Base 2% take profit
        volatility_lookback: int = 20     # Windows for volatility calc
    ):
        self.max_position_size = max_position_size
        self.max_daily_loss = max_daily_loss
        self.base_stop_loss = base_stop_loss
        self.base_take_profit = base_take_profit
        self.volatility_lookback = volatility_lookback
        
        self.state = AgentState.IDLE
        self._daily_pnl: float = 0.0
        self._open_positions: Dict[str, Trade] = {}
        self._capital: float = 1_000_000.0  # Default capital
        
    def set_capital(self, capital: float) -> None:
        """Set trading capital"""
        self._capital = capital
        
    def calculate_raw_volatility(
        self,
        price_sequence: WindowedSequence
    ) -> float:
        """
        Calculate volatility from raw price sequences.
        Uses only high-low ranges and close-to-close changes.
        """
        # High-Low volatility
        hl_ranges = (price_sequence.prices[:, 1] - price_sequence.prices[:, 2])
        hl_vol = hl_ranges.std()
        
        # Close-to-close volatility
        close_changes = np.diff(price_sequence.prices[:, 3])
        cc_vol = close_changes.std()
        
        # Combined volatility
        return (hl_vol + cc_vol) / 2
    
    def assess(
        self,
        proposal: StrategyProposal,
        price_sequence: WindowedSequence,
        current_price: float
    ) -> RiskAssessment:
        """
        Assess a strategy proposal for risk.
        
        Args:
            proposal: Strategy's trading proposal
            price_sequence: Current price window
            current_price: Current market price
            
        Returns:
            RiskAssessment with approval and parameters
        """
        self.state = AgentState.PROCESSING
        
        # Check daily loss limit
        if self._daily_pnl < -self._capital * self.max_daily_loss:
            return RiskAssessment(
                approved=False,
                position_size=0.0,
                stop_loss_pct=0.0,
                take_profit_pct=0.0,
                risk_reasoning="Daily loss limit reached",
                max_adverse_excursion=0.0
            )
        
        # Calculate raw volatility
        volatility = self.calculate_raw_volatility(price_sequence)
        
        # Dynamic stop loss based on volatility
        vol_multiplier = 1 + (volatility * 100)  # Scale with volatility
        stop_loss_pct = min(
            self.base_stop_loss * vol_multiplier,
            0.03  # Max 3% stop
        )
        
        # Dynamic take profit (risk-reward ratio)
        take_profit_pct = min(
            stop_loss_pct * 2,  # Minimum 1:2 RR
            0.05  # Max 5% target
        )
        
        # Position sizing based on signal confidence and volatility
        base_size = self.max_position_size * proposal.confidence
        
        # Reduce size for high volatility
        vol_adjustment = 1 / (1 + volatility * 50)
        position_size = min(base_size * vol_adjustment, self.max_position_size)
        
        # Calculate max adverse excursion
        max_adverse = current_price * stop_loss_pct
        
        # Approval logic
        approved = (
            proposal.signal != Signal.HOLD and
            proposal.confidence > 0.30 and  # Lower minimum confidence threshold
            position_size > 0.02  # Lower minimum viable position
        )
        
        reasoning = self._generate_reasoning(
            volatility, position_size, stop_loss_pct, approved
        )
        
        self.state = AgentState.COMPLETED
        
        return RiskAssessment(
            approved=approved,
            position_size=position_size if approved else 0.0,
            stop_loss_pct=stop_loss_pct,
            take_profit_pct=take_profit_pct,
            risk_reasoning=reasoning,
            max_adverse_excursion=max_adverse
        )
    
    def _generate_reasoning(
        self,
        volatility: float,
        position_size: float,
        stop_loss: float,
        approved: bool
    ) -> str:
        """Generate risk assessment reasoning"""
        vol_level = "high" if volatility > 0.02 else "moderate" if volatility > 0.01 else "low"
        
        if approved:
            return f"Volatility {vol_level}, position {position_size:.1%}, stop {stop_loss:.2%}"
        else:
            return f"Rejected: {vol_level} volatility or low confidence"
    
    def record_trade(self, trade: Trade) -> None:
        """Record an open trade"""
        self._open_positions[trade.symbol] = trade
    
    def update_trade(
        self,
        symbol: str,
        exit_price: float,
        exit_time: datetime
    ) -> float:
        """Update a trade with exit information and return PnL"""
        if symbol not in self._open_positions:
            return 0.0
        
        trade = self._open_positions[symbol]
        trade.exit_price = exit_price
        trade.exit_time = exit_time
        trade.status = "closed"
        
        # Calculate PnL
        if trade.signal == Signal.BUY:
            trade.pnl = (exit_price - trade.entry_price) * trade.quantity
        else:  # SHORT
            trade.pnl = (trade.entry_price - exit_price) * trade.quantity
        
        trade.pnl_pct = trade.pnl / (trade.entry_price * trade.quantity)
        
        # Update daily PnL
        self._daily_pnl += trade.pnl
        
        del self._open_positions[symbol]
        
        return trade.pnl
    
    def check_stop_loss(
        self,
        symbol: str,
        current_price: float
    ) -> Optional[Tuple[str, float]]:
        """
        Check if any open position should be stopped out.
        Returns (symbol, exit_price) if stop triggered.
        """
        if symbol not in self._open_positions:
            return None
        
        trade = self._open_positions[symbol]
        
        # Calculate stop loss price
        if trade.signal == Signal.BUY:
            stop_price = trade.entry_price * (1 - 0.03)  # Max 3% stop
            if current_price <= stop_price:
                return (symbol, stop_price)
        else:  # SHORT
            stop_price = trade.entry_price * (1 + 0.03)
            if current_price >= stop_price:
                return (symbol, stop_price)
        
        return None
    
    def reset_daily(self) -> None:
        """Reset daily PnL tracker"""
        self._daily_pnl = 0.0
    
    def get_exposure(self) -> float:
        """Get current total exposure"""
        if not self._open_positions:
            return 0.0
        
        total_value = sum(
            trade.entry_price * trade.quantity
            for trade in self._open_positions.values()
        )
        return total_value / self._capital
    
    def reset(self) -> None:
        """Reset agent state"""
        self._daily_pnl = 0.0
        self._open_positions.clear()
        self.state = AgentState.IDLE


# =============================================================================
# JUDGE AGENT
# =============================================================================

class JudgeAgent:
    """
    The Judge: Final execution layer.
    Requires ABSOLUTE CONSENSUS between Strategy and Risk agents.
    Only outputs execution orders when both agents agree.
    """
    
    def __init__(
        self,
        min_consensus_score: float = 0.7,
        max_concurrent_positions: int = 10,
        max_position_size: float = 0.25
    ):
        self.min_consensus_score = min_consensus_score
        self.max_concurrent_positions = max_concurrent_positions
        self.max_position_size = max_position_size
        
        self.state = AgentState.IDLE
        self._active_positions: Dict[str, ExecutionOrder] = {}
        self._execution_log: List[ExecutionOrder] = []
        
    def evaluate(
        self,
        proposal: StrategyProposal,
        risk_assessment: RiskAssessment,
        current_price: float
    ) -> Optional[ExecutionOrder]:
        """
        Evaluate consensus and create execution order.
        
        Args:
            proposal: Strategy Agent's proposal
            risk_assessment: Risk Agent's assessment
            current_price: Current market price
            
        Returns:
            ExecutionOrder if consensus reached, None otherwise
        """
        self.state = AgentState.PROCESSING
        
        # Check for absolute consensus
        consensus_achieved = (
            risk_assessment.approved and
            proposal.signal != Signal.HOLD and
            proposal.confidence >= self.min_consensus_score
        )
        
        if not consensus_achieved:
            self.state = AgentState.COMPLETED
            logger.debug(
                f"Judge: No consensus - Risk approved: {risk_assessment.approved}, "
                f"Signal: {proposal.signal.name}, Confidence: {proposal.confidence:.2f}"
            )
            return None
        
        # Check position limits
        if len(self._active_positions) >= self.max_concurrent_positions:
            self.state = AgentState.COMPLETED
            logger.debug("Judge: Max concurrent positions reached")
            return None
        
        # Calculate position size
        capital = 1_000_000.0  # Should be injected
        position_value = capital * risk_assessment.position_size
        quantity = int(position_value / current_price)
        
        if quantity < 1:
            self.state = AgentState.COMPLETED
            return None
        
        # Calculate stop loss and take profit prices
        if proposal.signal == Signal.BUY:
            stop_loss = current_price * (1 - risk_assessment.stop_loss_pct)
            take_profit = current_price * (1 + risk_assessment.take_profit_pct)
        else:  # SHORT
            stop_loss = current_price * (1 + risk_assessment.stop_loss_pct)
            take_profit = current_price * (1 - risk_assessment.take_profit_pct)
        
        # Calculate consensus score
        consensus_score = (proposal.confidence + risk_assessment.position_size / self.max_position_size) / 2
        
        # Create execution order
        order = ExecutionOrder(
            signal=proposal.signal,
            symbol=proposal.symbol,
            quantity=quantity,
            entry_price=current_price,
            stop_loss=stop_loss,
            take_profit=take_profit,
            timestamp=datetime.now(),
            consensus_score=consensus_score
        )
        
        # Record order
        self._active_positions[proposal.symbol] = order
        self._execution_log.append(order)
        
        self.state = AgentState.COMPLETED
        
        logger.info(
            f"Judge: EXECUTION ORDER - {proposal.signal.name} {quantity} shares "
            f"@ {current_price:.2f} (SL: {stop_loss:.2f}, TP: {take_profit:.2f})"
        )
        
        return order
    
    def close_position(self, symbol: str) -> Optional[ExecutionOrder]:
        """Close an active position"""
        if symbol not in self._active_positions:
            return None
        
        order = self._active_positions.pop(symbol)
        return order
    
    def get_active_positions(self) -> Dict[str, ExecutionOrder]:
        """Get all active positions"""
        return self._active_positions.copy()
    
    def get_execution_log(self) -> List[ExecutionOrder]:
        """Get full execution history"""
        return self._execution_log.copy()
    
    def reset(self) -> None:
        """Reset agent state"""
        self._active_positions.clear()
        self.state = AgentState.IDLE


# =============================================================================
# MULTI-AGENT ORCHESTRATOR
# =============================================================================

class MASOrchestrator:
    """
    Orchestrates the 4-agent system.
    Manages the sequential debate/consensus loop.
    """
    
    def __init__(
        self,
        data_agent: DataAgent,
        strategy_agent: StrategyAgent,
        risk_agent: RiskAgent,
        judge_agent: JudgeAgent
    ):
        self.data_agent = data_agent
        self.strategy_agent = strategy_agent
        self.risk_agent = risk_agent
        self.judge_agent = judge_agent
        
        self._trades: List[Trade] = []
        self._results: Dict[str, Any] = {}
        self._feature_cache: Dict[str, np.ndarray] = {}
        
    def _precompute_features(self, symbols: List[str]) -> None:
        """Precompute features for all symbols"""
        logger.info("Precomputing features for backtest...")
        for symbol in symbols:
            try:
                X, _, indices = self.data_agent.get_feature_matrix(symbol)
                self._feature_cache[symbol] = (X, indices)
            except Exception as e:
                logger.warning(f"Error precomputing {symbol}: {e}")
        
        logger.info(f"Precomputed features for {len(self._feature_cache)} symbols")
    
    def process_signal(
        self,
        symbol: str,
        idx: int,
        current_price: float,
        feature_vector: Optional[np.ndarray] = None
    ) -> Optional[Trade]:
        """
        Process a single signal through all agents.
        
        Args:
            symbol: Stock symbol
            idx: Current data index
            current_price: Current market price
            feature_vector: Precomputed feature vector (optional)
            
        Returns:
            Trade if executed, None otherwise
        """
        # Step 1: Data Agent creates windowed sequence
        sequence = self.data_agent.create_windowed_sequence(symbol, idx)
        if sequence is None:
            return None
        
        # Step 2: Strategy Agent generates proposal
        if feature_vector is None:
            features, _, _ = self.data_agent.get_feature_matrix(symbol)
            if idx - WINDOW_SIZE >= len(features):
                return None
            feature_vector = features[idx - WINDOW_SIZE]
        
        proposal = self.strategy_agent.predict(feature_vector)
        proposal.symbol = symbol
        
        # Step 3: Risk Agent assesses proposal
        risk_assessment = self.risk_agent.assess(proposal, sequence, current_price)
        
        # Step 4: Judge evaluates consensus
        order = self.judge_agent.evaluate(proposal, risk_assessment, current_price)
        
        if order is None:
            return None
        
        # Create trade record
        trade = Trade(
            symbol=symbol,
            entry_time=datetime.now(),  # Will be set by caller
            exit_time=None,
            entry_price=order.entry_price,
            exit_price=None,
            signal=order.signal,
            quantity=order.quantity,
            status="open"
        )
        
        self.risk_agent.record_trade(trade)
        
        return trade
    
    def run_backtest(
        self,
        df: pd.DataFrame,
        test_start: datetime,
        test_end: datetime,
        sample_interval: int = 10  # Process every Nth bar
    ) -> pd.DataFrame:
        """
        Run full backtest on test data.
        
        Args:
            df: Full dataset
            test_start: Backtest start date
            test_end: Backtest end date
            sample_interval: Process every Nth bar for speed
            
        Returns:
            DataFrame with trade results
        """
        logger.info(f"Starting backtest from {test_start} to {test_end}")
        
        # Filter test period
        test_df = df[
            (df['timestamp'] >= test_start) &
            (df['timestamp'] <= test_end)
        ].copy()
        
        # Precompute features for all symbols
        symbols = test_df['symbol'].unique().tolist()
        self._precompute_features(symbols)
        
        trades = []
        
        for symbol in symbols:
            symbol_data = test_df[test_df['symbol'] == symbol].copy()
            symbol_data = symbol_data.sort_values('timestamp').reset_index(drop=True)
            
            # Get precomputed features
            if symbol not in self._feature_cache:
                continue
            
            X_features, feature_indices = self._feature_cache[symbol]
            
            # Create index mapping
            feature_map = {idx: feat_idx for feat_idx, idx in enumerate(feature_indices)}
            
            # Process sampled bars for speed
            for i in range(WINDOW_SIZE, len(symbol_data) - HORIZON, sample_interval):
                current_price = symbol_data['close'].iloc[i]
                
                # Get precomputed feature if available
                feature_vector = None
                if i in feature_map:
                    feature_vector = X_features[feature_map[i]]
                
                trade = self.process_signal(
                    symbol, i, current_price, feature_vector
                )
                
                if trade:
                    trade.entry_time = symbol_data['timestamp'].iloc[i]
                    trades.append(trade)
        
        return pd.DataFrame([
            {
                'symbol': t.symbol,
                'entry_time': t.entry_time,
                'exit_time': t.exit_time,
                'entry_price': t.entry_price,
                'exit_price': t.exit_price,
                'signal': t.signal.name,
                'quantity': t.quantity,
                'pnl': t.pnl,
                'pnl_pct': t.pnl_pct,
                'status': t.status
            }
            for t in trades
        ])
    
    def get_results(self) -> Dict[str, Any]:
        """Get backtest results summary"""
        return self._results


# =============================================================================
# TRAINING AND EVALUATION
# =============================================================================

class MASTrainer:
    """
    Handles training pipeline for the MAS.
    Train on 2 years, test on 7 years.
    """
    
    def __init__(
        self,
        data_agent: DataAgent,
        strategy_agent: StrategyAgent
    ):
        self.data_agent = data_agent
        self.strategy_agent = strategy_agent
        
    def prepare_training_data(
        self,
        df: pd.DataFrame,
        train_years: int = TRAIN_YEARS
    ) -> Dict[str, Tuple]:
        """
        Prepare training data with time-based split.
        
        Args:
            df: Full dataset
            train_years: Years of recent data for training
            
        Returns:
            Dictionary with train/val/test splits per symbol
        """
        # Get date range
        df['date'] = df['timestamp'].dt.date
        max_date = df['date'].max()
        train_start = max_date - timedelta(days=train_years * 365)
        
        logger.info(f"Training period: {train_start} to {max_date}")
        
        train_data = {}
        
        for symbol in df['symbol'].unique():
            symbol_df = df[df['symbol'] == symbol].copy()
            
            # Get features and labels
            X, y, indices = self.data_agent.get_feature_matrix(symbol)
            
            if len(X) < 100:
                continue
            
            # Time-based split (80/20 train/val)
            split_idx = int(len(X) * 0.8)
            
            X_train = X[:split_idx]
            y_train = y[:split_idx]
            X_val = X[split_idx:]
            y_val = y[split_idx:]
            
            train_data[symbol] = (X_train, y_train, X_val, y_val)
        
        logger.info(f"Prepared training data for {len(train_data)} symbols")
        return train_data
    
    def train(
        self,
        df: pd.DataFrame
    ) -> Dict[str, Any]:
        """
        Train strategy agent on all symbols.
        Aggregates data across symbols for a single model.
        """
        logger.info("Preparing aggregated training data...")
        
        # Aggregate features across all symbols
        all_X = []
        all_y = []
        
        for symbol in df['symbol'].unique():
            try:
                X, y, _ = self.data_agent.get_feature_matrix(symbol)
                all_X.append(X)
                all_y.append(y)
            except Exception as e:
                logger.warning(f"Error processing {symbol}: {e}")
                continue
        
        X_all = np.vstack(all_X)
        y_all = np.concatenate(all_y)
        
        logger.info(f"Total samples: {len(X_all)}, Features: {X_all.shape[1]}")
        
        # Time-based split
        split_idx = int(len(X_all) * 0.8)
        X_train = X_all[:split_idx]
        y_train = y_all[:split_idx]
        X_val = X_all[split_idx:]
        y_val = y_all[split_idx:]
        
        # Train model
        metrics = self.strategy_agent.train(X_train, y_train, X_val, y_val)
        
        # Class distribution
        unique, counts = np.unique(y_all, return_counts=True)
        metrics['class_distribution'] = dict(zip(unique, counts))
        
        return metrics
    
    def evaluate(
        self,
        df: pd.DataFrame,
        test_start: datetime
    ) -> Dict[str, Any]:
        """
        Evaluate model on test data.
        """
        test_df = df[df['timestamp'] >= test_start].copy()
        
        all_preds = []
        all_true = []
        
        for symbol in test_df['symbol'].unique():
            try:
                X, y, _ = self.data_agent.get_feature_matrix(symbol)
                if len(X) == 0:
                    continue
                
                preds = self.strategy_agent.model.predict(X)
                all_preds.extend(preds)
                all_true.extend(y)
            except Exception as e:
                logger.warning(f"Error evaluating {symbol}: {e}")
                continue
        
        all_preds = np.array(all_preds)
        all_true = np.array(all_true)
        
        # Classification report
        report = classification_report(
            all_true, all_preds,
            target_names=['Hold', 'Buy', 'Short'],
            output_dict=True
        )
        
        # Confusion matrix
        cm = confusion_matrix(all_true, all_preds)
        
        return {
            'accuracy': (all_preds == all_true).mean(),
            'classification_report': report,
            'confusion_matrix': cm.tolist(),
            'n_samples': len(all_true)
        }


# =============================================================================
# MAIN EXECUTION
# =============================================================================

def run_mas_pipeline(quick_test: bool = False):
    """
    Main function to run the complete MAS pipeline.
    Generates synthetic data, trains, and tests the system.
    
    Args:
        quick_test: If True, use smaller dataset for faster testing
    """
    print("=" * 80)
    print("MULTI-AGENT TRADING SYSTEM - NIFTY 500")
    print("=" * 80)
    
    # Initialize agents
    print("\n[1/6] Initializing agents...")
    data_agent = DataAgent(window_size=WINDOW_SIZE, horizon=HORIZON)
    strategy_agent = StrategyAgent(
        n_estimators=100 if quick_test else 500,  # Fewer estimators for quick test
        max_depth=6,
        learning_rate=0.05
    )
    risk_agent = RiskAgent(
        max_position_size=0.25,
        base_stop_loss=0.015,      # Wider stop for more trades
        base_take_profit=0.03
    )
    judge_agent = JudgeAgent(
        min_consensus_score=0.35,   # Lower threshold for quick test
        max_concurrent_positions=10,
        max_position_size=0.25
    )
    
    # Generate synthetic data
    print("\n[2/6] Generating synthetic Nifty 500 data...")
    generator = SyntheticDataGenerator(seed=42)
    
    # 7 years of data
    end_date = datetime(2024, 12, 31)
    start_date = end_date - timedelta(days=7 * 365)
    
    n_stocks = 10 if quick_test else 50  # Fewer stocks for quick test
    df = generator.generate_nifty500_dataset(
        start_date=start_date,
        end_date=end_date,
        n_stocks=n_stocks
    )
    
    print(f"Generated {len(df)} records spanning {start_date.date()} to {end_date.date()}")
    
    # Ingest data
    print("\n[3/6] Ingesting data into Data Agent...")
    data_agent.ingest(df)
    
    # Train model
    print("\n[4/6] Training Strategy Agent (XGBoost)...")
    trainer = MASTrainer(data_agent, strategy_agent)
    
    train_metrics = trainer.train(df)
    print(f"\nTraining Results:")
    print(f"  Train Accuracy: {train_metrics['train_accuracy']:.4f}")
    print(f"  Validation Accuracy: {train_metrics['val_accuracy']:.4f}")
    print(f"  Estimators Used: {train_metrics['n_estimators_used']}")
    print(f"  Class Distribution: {train_metrics['class_distribution']}")
    
    # Evaluate on test data
    print("\n[5/6] Evaluating on 7-year test data...")
    test_start = end_date - timedelta(days=5 * 365)  # Last 5 years as test
    eval_metrics = trainer.evaluate(df, test_start)
    
    print(f"\nEvaluation Results:")
    print(f"  Test Accuracy: {eval_metrics['accuracy']:.4f}")
    print(f"  Samples: {eval_metrics['n_samples']}")
    print(f"\nClassification Report:")
    print(f"    Hold  - Precision: {eval_metrics['classification_report']['Hold']['precision']:.3f}, "
          f"Recall: {eval_metrics['classification_report']['Hold']['recall']:.3f}")
    print(f"    Buy   - Precision: {eval_metrics['classification_report']['Buy']['precision']:.3f}, "
          f"Recall: {eval_metrics['classification_report']['Buy']['recall']:.3f}")
    print(f"    Short - Precision: {eval_metrics['classification_report']['Short']['precision']:.3f}, "
          f"Recall: {eval_metrics['classification_report']['Short']['recall']:.3f}")
    
    # Run backtest
    print("\n[6/6] Running full backtest...")
    orchestrator = MASOrchestrator(
        data_agent, strategy_agent, risk_agent, judge_agent
    )

    trades_df = orchestrator.run_backtest(
        df,
        test_start=test_start,
        test_end=end_date,
        sample_interval=15 if quick_test else 10  # Larger interval for quick test
    )
    
    if len(trades_df) > 0:
        print(f"\nBacktest Results:")
        print(f"  Total Trades: {len(trades_df)}")
        print(f"  Win Rate: {(trades_df['pnl'] > 0).mean():.2%}")
        print(f"  Total PnL: ${trades_df['pnl'].sum():,.2f}")
        print(f"  Avg PnL per Trade: ${trades_df['pnl'].mean():,.2f}")
        print(f"  Max Drawdown: ${trades_df['pnl'].min():,.2f}")
        
        # Signal distribution
        print(f"\nSignal Distribution:")
        print(trades_df['signal'].value_counts())
    else:
        print("\nNo trades executed (consensus not reached)")
    
    print("\n" + "=" * 80)
    print("PIPELINE COMPLETE")
    print("=" * 80)
    
    return {
        'data': df,
        'trades': trades_df,
        'train_metrics': train_metrics,
        'eval_metrics': eval_metrics
    }


if __name__ == "__main__":
    import sys
    
    # Use --full flag for complete 50-stock run, otherwise quick test with 10 stocks
    quick_test = "--full" not in sys.argv
    
    if quick_test:
        print("Running QUICK TEST mode (10 stocks, 100 estimators)\n")
    else:
        print("Running FULL mode (50 stocks, 500 estimators)\n")
    
    results = run_mas_pipeline(quick_test=quick_test)

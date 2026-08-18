# 🚀 Crypto Trading Model with ML

A machine learning-powered cryptocurrency trading system that uses historical price data to generate trading signals and execute automated trades with position management.

## 📊 Backtest Results

**Best Performance (4-month backtest):**
- **Initial Capital:** $10
- **Final Capital:** $31.67
- **Total Return:** +216.74%
- **Win Rate:** 51.2%
- **Total Trades:** 11,707
- **Leverage:** 5x
- **Risk-Reward:** 1:3

### Performance by Probability Threshold

| Threshold | Trades | Win Rate | Return | Final Capital |
|-----------|--------|----------|--------|---------------|
| 0.50 | 11,707 | 51.2% | **+216.74%** | $31.67 |
| 0.60 | 584 | 75.2% | +156.27% | $25.63 |
| 0.70+ | 0 | - | 0% | $10.00 |

## 🎯 Features

- **Machine Learning Model:** HistGradientBoostingClassifier for price direction prediction
- **Multi-Asset Trading:** Supports BTC, ETH, and SOL
- **Risk Management:** 
  - Stop-loss based on ATR (1.5x)
  - Take-profit with 1:3 risk-reward ratio
  - Position sizing with leverage control
- **Feature Engineering:** 30+ technical indicators including:
  - EMAs (5, 15, 30, 50 periods)
  - RSI, MACD, Bollinger Bands
  - Volume analysis
  - Candlestick pattern recognition (wick analysis)
- **Backtesting Engine:** Optimized vectorized backtesting with realistic slippage and fees
- **Paper Trading:** Live trading simulation with Delta Exchange API

## 📁 Project Structure

```
Crypto_model/
├── backtest_optimized.py      # Optimized backtesting engine
├── paper_trading_bot.py       # Live paper trading bot
├── train_model.py             # Model training script
├── train_transformer.py       # Transformer model training
├── dataset.py                 # Dataset utilities
├── download_data.py           # Data download script
├── trading_config.json        # Trading configuration
├── trained_model.pkl          # Pre-trained model
├── data/                      # Historical price data
│   ├── BTC_5m_processed.parquet
│   ├── ETH_5m_processed.parquet
│   └── SOL_5m_processed.parquet
└── backtest_results/          # Backtest outputs
    ├── backtest_report.html   # Interactive HTML report
    ├── backtest_summary.json  # Summary metrics
    └── *.csv                  # Detailed trade logs
```

## 🛠️ Installation

### Prerequisites
- Python 3.10+
- Virtual environment (recommended)

### Setup

```bash
# Clone the repository
git clone https://github.com/RohitSwami33/Crypto-model-jan2026.git
cd Crypto-model-jan2026

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

## 🚀 Usage

### 1. Run Backtest

```bash
# Run optimized backtest with multiple thresholds
python backtest_optimized.py

# Generate interactive HTML report
python generate_html_report.py
```

**Output Files:**
- `backtest_report.html` - Interactive charts (open in browser)
- `backtest_summary.json` - Performance metrics
- `backtest_trades_threshold_*.csv` - Detailed trade logs
- `backtest_equity_threshold_*.csv` - Equity curves

### 2. Train Your Own Model

```bash
# Train model on historical data
python train_model.py
```

### 3. Paper Trading (Live Simulation)

```bash
# Set environment variables
export GCS_BUCKET=your-bucket-name

# Run paper trading bot
python paper_trading_bot.py
```

## 📈 Trading Strategy

### Entry Signals
- Model predicts LONG/SHORT direction with probability threshold
- Only trades when confidence ≥ threshold (default: 0.55)
- Maximum 3 simultaneous positions (one per symbol)

### Exit Rules
- **Stop Loss:** 1.5x ATR from entry
- **Take Profit:** 4.5x ATR from entry (1:3 R:R)
- **Position Sizing:** Capital / MAX_POSITIONS × Leverage

### Fees & Slippage
- Brokerage: 0.05% per side
- Slippage: 0.05% per trade

## 📊 Technical Indicators

| Category | Indicators |
|----------|------------|
| Trend | EMA(5, 15, 30, 50), MACD |
| Momentum | RSI, Rate of Change |
| Volatility | ATR, Bollinger Bands |
| Volume | Volume Ratio, Volume EMA |
| Price Action | Wick analysis, Body size |

## 🧪 Model Performance

**Training Data:**
- 5 years of hourly historical data
- ~43,800 samples per symbol
- Wick-based target calculation

**Model Accuracy:** ~50-55% (balanced for directional prediction)

## 📝 Configuration

Edit `trading_config.json` or environment variables:

```json
{
  "probability_threshold": 0.55,
  "expected_r": 2.31,
  "initial_capital": 10.0,
  "leverage": 5,
  "max_positions": 3,
  "rr_ratio": 3.0,
  "sl_atr_mult": 1.5
}
```

## 📄 Backtest Output Example

```
Threshold    Trades     Win Rate     Return %     Final $      Max DD %     Sharpe    
----------------------------------------------------------------------------------------------------
0.50         11707      51.2         216.74       31.67        -1927.32     -2.73     
0.60         584        75.2         156.27       25.63        -2512.05     -0.39     
```

## ⚠️ Risk Disclaimer

This software is for **educational and research purposes only**. 

- **NOT financial advice**
- Cryptocurrency trading involves substantial risk of loss
- Past performance does not guarantee future results
- Always test thoroughly before using real capital
- Never trade with money you cannot afford to lose

## 📋 Requirements

See `requirements.txt`:
- pandas
- numpy
- scikit-learn
- torch (for transformer models)
- pyarrow
- requests
- google-cloud-storage (for state persistence)

## 👥 Contributors

- **Rohit Swami** - Author & Maintainer ([@RohitSwami33](https://github.com/RohitSwami33))

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📧 Contact

- **GitHub:** [@RohitSwami33](https://github.com/RohitSwami33)
- **Repository:** [Crypto-model-jan2026](https://github.com/RohitSwami33/Crypto-model-jan2026)

## 📜 License

MIT License - See LICENSE file for details

---

**Built with ❤️ for crypto trading research**

*Last Updated: March 2026*

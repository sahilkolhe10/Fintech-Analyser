"""
data_loader.py
==============
Downloads 2 years of 5-minute OHLCV historical data for Indian equities
from Angel One (SmartAPI) and saves each stock as a Parquet file.

Usage:
    1. pip install -r requirements.txt
    2. python data_loader.py
"""

import os
import time
import json
from datetime import datetime, timedelta

import requests
import pandas as pd
import pyotp
from SmartApi import SmartConnect
from dotenv import load_dotenv

load_dotenv()

# ──────────────────────────────────────────────
# ① CREDENTIALS  (load from .env)
# ──────────────────────────────────────────────
API_KEY    = os.getenv("ANGEL_API_KEY")
SECRET_KEY = os.getenv("ANGEL_SECRET_KEY")
CLIENT_ID  = os.getenv("ANGEL_CLIENT_ID")
PASSWORD   = os.getenv("ANGEL_PASSWORD")
TOTP_KEY   = os.getenv("ANGEL_TOTP_KEY")

# ──────────────────────────────────────────────
# ② CONSTANTS
# ──────────────────────────────────────────────
SCRIP_MASTER_URL = (
    "https://margincalculator.angelbroking.com/"
    "OpenAPI_File/files/OpenAPIScripMaster.json"
)
HISTORY_DAYS   = 730        # ~2 years
CHUNK_DAYS     = 20         # Angel One per-request limit
REQUEST_DELAY  = 0.4        # seconds between API calls (3 req/s cap)
OUTPUT_DIR     = os.path.join("data", "history")

# ──────────────────────────────────────────────
# NIFTY 500 — Popularity-sorted
# Tier 1: Nifty 50 (highest market cap / volume)
# Tier 2: Nifty Next 50
# Tier 3: Remaining Nifty 500 (alphabetical)
# ──────────────────────────────────────────────
NIFTY_50 = [
    "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK",
    "BHARTIARTL", "SBIN", "ITC", "KOTAKBANK", "LT",
    "HINDUNILVR", "BAJFINANCE", "MARUTI", "HCLTECH", "TITAN",
    "SUNPHARMA", "TATAMOTORS", "NTPC", "AXISBANK", "ADANIENT",
    "ONGC", "ASIANPAINT", "BAJAJFINSV", "M&M", "POWERGRID",
    "ULTRACEMCO", "TATASTEEL", "NESTLEIND", "JSWSTEEL", "COALINDIA",
    "TECHM", "ADANIPORTS", "WIPRO", "INDUSINDBK", "DRREDDY",
    "BAJAJ-AUTO", "HDFCLIFE", "DIVISLAB", "CIPLA", "SBILIFE",
    "GRASIM", "BRITANNIA", "APOLLOHOSP", "TRENT", "EICHERMOT",
    "HINDALCO", "BEL", "BPCL", "TATACONSUM", "HEROMOTOCO",
]

NIFTY_NEXT50 = [
    "ADANIGREEN", "ADANIPOWER", "AMBUJACEM", "ATGL", "AUROPHARMA",
    "BANKBARODA", "BHEL", "BOSCHLTD", "CANBK", "CHOLAFIN",
    "COLPAL", "CONCOR", "CUMMINSIND", "DABUR", "DLF",
    "GODREJCP", "GODREJPROP", "HAL", "HAVELLS", "ICICIPRULI",
    "IDEA", "IDFCFIRSTB", "IGL", "INDHOTEL", "INDUSTOWER",
    "IOC", "IRFC", "JINDALSTEL", "JIOFIN", "JSL",
    "LICI", "LODHA", "LUPIN", "MARICO", "MAXHEALTH",
    "MCDOWELL-N", "NHPC", "NYKAA", "OBEROIRLTY", "OFSS",
    "PAYTM", "PEL", "PFC", "PIDILITIND", "PNB",
    "POLYCAB", "RECLTD", "SAIL", "SBICARD", "SHREECEM",
    "SIEMENS", "SRF", "TATAELXSI", "TATAPOWER", "TORNTPHARM",
    "TVSMOTOR", "UNIONBANK", "UNITDSPR", "VBL", "VEDL",
    "VOLTAS", "ZOMATO", "ZYDUSLIFE",
]

NIFTY_REMAINING = [
    "3MINDIA", "AADHARYHFC", "AARTIDRUGS", "AARTIIND", "AAVAS",
    "ABB", "ABBOTINDIA", "ABCAPITAL", "ABFRL", "ABLBL",
    "ABREL", "ABSLAMC", "ACC", "ACE", "ACMESOLAR",
    "ADANIENERGY", "ADANIENSOL", "AEGISCHEM", "AEGISLOG",
    "AFFLE", "AGARWALEYE", "AIAENG", "AIIL", "AJANTPHARM",
    "AKUMS", "AKZOINDIA", "ALKEM", "ALKYLAMINE", "ALOKINDS",
    "AMBER", "ANANDRATHI", "ANANTRAJ", "ANGELONE", "APARINDS",
    "APLAPOLLO", "APLLTD", "APOLLOTYRE", "APTUS", "ARE&M",
    "ASAHIINDIA", "ASHOKLEY", "ASTERDM", "ASTRAL", "ASTRAZEN",
    "ATHERENERQ", "ATUL", "AUBANK", "AWL",
    "BAJAJHFL", "BAJAJHLDNG", "BALKRISIND", "BALRAMCHIN",
    "BANDHANBNK", "BANKINDIA", "BASF", "BATAINDIA", "BBTC",
    "BDL", "BEML", "BERGEPAINT", "BHARATFORG", "BHARTIHEXA",
    "BIKAJI", "BIOCON", "BLS", "BLUEDART", "BLUEJET",
    "BLUESTARCO", "BRIGADE", "BSE", "BSOFT",
    "CAMPUS", "CAMS", "CANFINHOME", "CAPLIPOINT",
    "CARBORUNIV", "CASTROLIND", "CCL", "CDSL",
    "CEATLID", "CENTRALBK", "CENTURYPLY", "CERA", "CESC",
    "CGCL", "CGPOWER", "CHALET", "CHENNPETRO", "CHOICEIN",
    "CHOLAHLDNG", "CLEAN", "COCHINSHIP", "COFORGE",
    "CONCORDBIO", "COROMANDEL", "CRAFTSMAN", "CREDITACC", "CRISIL",
    "CROMPTON", "CYIENT", "DATAPATTNS", "DEEPAKNTR", "DELTACORP",
    "DEVYANI", "DHAMPUR", "DIXON", "DMART",
    "ECLERX", "EDELWEISS", "EIDPARRY", "ELECON",
    "ELGIEQUIP", "EMAMILTD", "ENDURANCE", "ENGINERSIN",
    "EQUITASBNK", "ESCORTS", "EXIDEIND", "FACT",
    "FEDERALBNK", "FINCABLES", "FINEORG", "FINPIPE",
    "FLUOROCHEM", "FORTIS", "GAIL", "GLS", "GLENMARK",
    "GMRAIRPORT", "GNFC", "GODFRYPHLP", "GRANULES",
    "GRAPHITE", "GRINDWELL", "GUJGASLTD", "GUJRATGAS",
    "HAPPSTMNDS", "HATSUN", "HDFCAMC", "HEG",
    "HINDCOPPER", "HINDPETRO", "HONAUT", "HSCL",
    "HUDCO", "IBREALEST", "ICICIBANK", "IIFL",
    "INDGN", "INDIAMART", "INDIANB", "IRCTC", "IREDA",
    "ISEC", "ISGEC", "ITI", "JAMNAAUTO",
    "JBCHEPHARM", "JKCEMENT", "JKLAKSHMI", "JKPAPER",
    "JMFINANCIL", "JSWENERGY", "JSWINFRA", "JUBLFOOD", "JUSTDIAL",
    "KAJARIACER", "KALPATPOWR", "KALYANKJIL", "KANSAINER",
    "KAYNES", "KEC", "KFINTECH", "KIRLFER",
    "KMCSHIL", "KPITTECH", "KRBL", "KSB",
    "LATENTVIEW", "LAURUSLABS", "LAXMIMACH", "LICHSGFIN",
    "LLOYDSME", "LTFOODS", "LTIM", "LTTS",
    "M&MFIN", "MANAPPURAM", "MANKIND", "MANYAVAR",
    "MAPMYINDIA", "MASTEK", "MCX", "MEDANTA",
    "METROPOLIS", "MFSL", "MGL", "MOTHERSON",
    "MOTILALOFS", "MPHASIS", "MRF", "MSUMI",
    "MUTHOOTFIN", "NAM-INDIA", "NATCOPHARM", "NATIONALUM",
    "NAUKRI", "NAVINFLUOR", "NCC", "NETWORK18",
    "NEWGEN", "NHPC", "NMDC", "NOCIL",
    "NUVAMA", "NUVOCO", "OLECTRA", "OPTIEMUS",
    "PAGEIND", "PATANJALI", "PCBL", "PERSISTENT",
    "PETRONET", "PFIZER", "PGHH", "PHOENIXLTD",
    "PNBHOUSING", "POONAWALLA", "POWERMECH", "PPLPHARMA",
    "PRESTIGE", "PRSMJOHNSN", "PVRINOX", "QUESS",
    "RADICO", "RAJESHEXPO", "RALLIS", "RAMCOCEM",
    "RATNAMANI", "RAYMOND", "RKFORGE", "RITES",
    "ROUTE", "RPOWER", "RVNL", "SANOFI",
    "SAPPHIRE", "SAREGAMA", "SCHAEFFLER", "SHILPAMED",
    "SHOPERSTOP", "SHRIRAMFIN", "SJVN", "SKFINDIA",
    "SOBHA", "SOLARA", "SONACOMS", "SONATSOFTW",
    "SPARC", "STARHEALTH", "SUMICHEM", "SUNDARMFIN",
    "SUNDRMFAST", "SUNTV", "SUPRAJIT", "SUPREMEIND",
    "SUVENPHAR", "SWANENERGY", "SYNGENE", "TANLA",
    "TATACHEM", "TATACOMM", "TATATECH", "TCI",
    "TIINDIA", "TIMKEN", "TITAGARH", "TORNTPOWER",
    "TTML", "TV18BRDCST", "UBL", "UJJIVANSFB",
    "ULTRACEMCO", "UPL", "UTIAMC", "VAIBHAVGBL",
    "VAKRANGEE", "VARDHMAN", "VARUN", "VIJAYA",
    "VINATIORGA", "VIPIND", "WELCORP", "WELSPUNLIV",
    "WESTLIFE", "WHIRLPOOL", "ZAGGLE", "ZEEL",
    "ZENSAR", "ZFCVINDIA",
]

ALL_NIFTY_STOCKS = NIFTY_50 + NIFTY_NEXT50 + NIFTY_REMAINING


# ──────────────────────────────────────────────
# ③ AUTHENTICATION
# ──────────────────────────────────────────────
def login_to_angel() -> SmartConnect:
    """Authenticate with Angel One SmartAPI using TOTP-based 2FA."""
    obj = SmartConnect(api_key=API_KEY)
    totp = pyotp.TOTP(TOTP_KEY).now()
    data = obj.generateSession(CLIENT_ID, PASSWORD, totp)

    if data.get("status") is False:
        raise RuntimeError(f"Login failed: {data.get('message', data)}")

    auth_token  = data["data"]["jwtToken"]
    feed_token  = obj.getfeedToken()

    print("✅  Login successful")
    print(f"    Client  : {CLIENT_ID}")
    print(f"    Feed tok: {feed_token[:20]}…")
    return obj


# ──────────────────────────────────────────────
# ④ TOKEN MAPPING
# ──────────────────────────────────────────────
def download_scrip_master() -> list[dict]:
    """Download Angel One's instrument master file."""
    print("📥  Downloading OpenAPIScripMaster.json …", end=" ", flush=True)
    resp = requests.get(SCRIP_MASTER_URL, timeout=60)
    resp.raise_for_status()
    instruments = resp.json()
    print(f"done  ({len(instruments):,} instruments)")
    return instruments


def get_token(instruments: list[dict], symbol: str, exchange: str = "NSE") -> str:
    """Look up the numeric *token* for a given trading symbol."""
    target = f"{symbol}-EQ"
    # Fast lookup if possible, but list iteration is simple enough for one-off script
    for item in instruments:
        if item.get("exch_seg") == exchange and item.get("symbol") == target:
            return item["token"]
    
    # Fallback match on name
    for item in instruments:
        if item.get("exch_seg") == exchange and item.get("name") == symbol:
            return item["token"]

    raise ValueError(f"Token not found for {symbol}")


# ──────────────────────────────────────────────
# ⑤ HISTORICAL DATA FETCHING (chunked)
# ──────────────────────────────────────────────
def fetch_historical_data(
    obj: SmartConnect,
    symbol: str,
    token: str,
    exchange: str = "NSE",
    interval: str = "FIVE_MINUTE",
    total_days: int = HISTORY_DAYS,
    chunk_days: int = CHUNK_DAYS,
) -> pd.DataFrame:
    """Fetch history in chunks walking backwards."""
    all_candles: list[list] = []
    end_date   = datetime.now()
    start_limit = end_date - timedelta(days=total_days)

    chunk_num = 0
    current_to = end_date

    while current_to > start_limit:
        current_from = current_to - timedelta(days=chunk_days)
        if current_from < start_limit:
            current_from = start_limit

        from_str = current_from.strftime("%Y-%m-%d 09:15")
        to_str   = current_to.strftime("%Y-%m-%d 15:30")

        params = {
            "exchange":    exchange,
            "symboltoken": token,
            "interval":    interval,
            "fromdate":    from_str,
            "todate":      to_str,
        }

        chunk_num += 1
        try:
            resp = obj.getCandleData(params)
        except Exception as exc:
            print(f"      ⚠  Chunk {chunk_num} error: {exc}")
            time.sleep(REQUEST_DELAY)
            current_to = current_from
            continue

        if resp is None or resp.get("data") is None:
            msg = resp.get("message", "no data") if resp else "None response"
            print(f"      ⚠  Chunk {chunk_num}: {msg}")
        else:
            candles = resp["data"]
            all_candles.extend(candles)
            print(
                f"      📦  Chunk {chunk_num:>3}: "
                f"{from_str[:10]} → {to_str[:10]}  |  "
                f"{len(candles):>5} candles"
            )

        time.sleep(REQUEST_DELAY)
        current_to = current_from

    if not all_candles:
        print(f"      ❌  No data retrieved for {symbol}")
        return pd.DataFrame()

    df = pd.DataFrame(
        all_candles,
        columns=["Date", "Open", "High", "Low", "Close", "Volume"],
    )
    return df


# ──────────────────────────────────────────────
# ⑥ CLEANING & PARQUET STORAGE
# ──────────────────────────────────────────────
def clean_and_save(df: pd.DataFrame, symbol: str) -> str:
    """Clean and persist as Parquet."""
    if df.empty:
        return ""

    df["Date"] = pd.to_datetime(df["Date"])
    df.drop_duplicates(subset=["Date"], inplace=True)
    df.sort_values("Date", inplace=True)
    df.reset_index(drop=True, inplace=True)

    for col in ["Open", "High", "Low", "Close", "Volume"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    filepath = os.path.join(OUTPUT_DIR, f"{symbol}.parquet")
    df.to_parquet(filepath, index=False)
    print(f"      💾  Saved {symbol}.parquet ({len(df):,} rows)")
    return filepath


# ──────────────────────────────────────────────
# ⑦ MAIN
# ──────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("  Angel One  ·  Nifty 500 Data Batch Loader")
    print("=" * 60)

    # Login
    smart_api = login_to_angel()

    # Stock list (popularity-sorted: Nifty50 → Next50 → Remaining)
    nifty_stocks = ALL_NIFTY_STOCKS
    print(f"📋  Nifty 500 Count: {len(nifty_stocks)}")

    # Load Scrip Master
    instruments = download_scrip_master()

    # Loop
    print(f"\n🚀  Starting download for {len(nifty_stocks)} stocks...")
    for idx, symbol in enumerate(nifty_stocks, 1):
        # Resume Logic
        filepath = os.path.join(OUTPUT_DIR, f"{symbol}.parquet")
        if os.path.exists(filepath):
            print(f"[{idx}/{len(nifty_stocks)}]  {symbol}  ⏭  Skipping (Exists)")
            continue

        print(f"\n[{idx}/{len(nifty_stocks)}]  {symbol}")
        print("-" * 40)

        try:
            token = get_token(instruments, symbol)
            print(f"      🔑  Token: {token}")
            
            df = fetch_historical_data(smart_api, symbol, token)
            clean_and_save(df, symbol)
            
        except Exception as exc:
            print(f"      ❌  Error processing {symbol}: {exc}")
            continue

    print("\n" + "=" * 60)
    print("  ✅  All downloads complete!")
    print(f"  📂  Files saved in: {os.path.abspath(OUTPUT_DIR)}")
    print("=" * 60)

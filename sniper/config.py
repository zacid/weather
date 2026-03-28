# ---------------------------------------------------------------------------
# Polymarket Sniper Bot v2 — Configuration
# ---------------------------------------------------------------------------

# API base URLs
POLYMARKET_GAMMA_API = "https://gamma-api.polymarket.com"
POLYMARKET_CLOB_API  = "https://clob.polymarket.com"

# WebSocket feeds
BINANCE_WS_URL      = "wss://stream.binance.com:9443/ws/btcusdt@trade"
POLYMARKET_WS_URL   = "wss://ws-subscriptions-clob.polymarket.com/ws/market"

# ---------------------------------------------------------------------------
# Sniper parameters
# ---------------------------------------------------------------------------

# Minimum token price (0–1 scale) to consider a side "near-certain"
MIN_PRICE_THRESHOLD = 0.90

# Only enter within this many seconds of expiry
MAX_SECONDS_REMAINING = 60

# BTC momentum threshold — if |momentum| exceeds this fraction the trade is
# blocked (0.003 = 0.3 %)
MOMENTUM_THRESHOLD = 0.003

# Rolling window (seconds) used to calculate momentum
MOMENTUM_WINDOW_SECONDS = 10

# How often the market-scanner loop runs (seconds)
POLL_INTERVAL_SECONDS = 5

# ---------------------------------------------------------------------------
# Paper trading
# ---------------------------------------------------------------------------
PAPER_TRADE_SIZE_USD = 100.0   # notional per paper trade

# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------
DB_PATH = "trades.db"

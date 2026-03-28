# ---------------------------------------------------------------------------
# Polymarket Sniper Bot v2 — FastAPI entry point
# ---------------------------------------------------------------------------
#
# Usage:
#   cd sniper
#   pip install -r requirements.txt
#   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
#
# Dashboard:  http://localhost:8000
# API docs:   http://localhost:8000/docs
# ---------------------------------------------------------------------------

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

import aiohttp
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.templating import Jinja2Templates

from config import DB_PATH
from database import (
    get_open_trades,
    get_recent_trades,
    get_trade_stats,
    init_db,
)
from binance_feed import BinanceFeed
from polymarket_client import PolymarketClient
from sniper import SniperBot

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)-8s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Global state (set during lifespan)
# ---------------------------------------------------------------------------
binance_feed: BinanceFeed = BinanceFeed()
sniper_bot: SniperBot | None = None
_http_session: aiohttp.ClientSession | None = None

# ---------------------------------------------------------------------------
# Lifespan — start/stop background tasks
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    global sniper_bot, _http_session

    logger.info("Starting Polymarket Sniper Bot v2…")
    await init_db(DB_PATH)

    _http_session = aiohttp.ClientSession(
        timeout=aiohttp.ClientTimeout(total=10),
        headers={"User-Agent": "PolymarketSniperBot/2.0"},
    )
    polymarket = PolymarketClient(_http_session)
    sniper_bot = SniperBot(binance_feed, polymarket, DB_PATH)

    tasks = [
        asyncio.create_task(binance_feed.run(), name="binance-feed"),
        asyncio.create_task(sniper_bot.run(), name="sniper-bot"),
    ]
    logger.info("All background tasks started")

    yield  # application is running

    logger.info("Shutting down…")
    binance_feed.stop()
    sniper_bot.stop()
    for t in tasks:
        t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    await _http_session.close()
    logger.info("Shutdown complete")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Polymarket Sniper Bot v2",
    description="Paper trading bot with Binance safety filter",
    version="2.0.0",
    lifespan=lifespan,
)

templates = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def dashboard(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/status", summary="Bot status + live BTC price")
async def api_status():
    btc_price, momentum = await binance_feed.get_snapshot()
    stats = await sniper_bot.get_full_stats() if sniper_bot else {}
    return {
        "timestamp":          datetime.now(timezone.utc).isoformat(),
        "binance_connected":  binance_feed.is_connected,
        "btc_price":          btc_price,
        "momentum_10s_pct":   round((momentum or 0) * 100, 5),
        "momentum_direction": (
            "UP" if (momentum or 0) > 0.001
            else "DOWN" if (momentum or 0) < -0.001
            else "FLAT"
        ),
        "stats": stats,
    }


@app.get("/api/trades", summary="Recent trade history")
async def api_trades(limit: int = 50):
    trades = await get_recent_trades(DB_PATH, limit)
    return {"trades": trades, "count": len(trades)}


@app.get("/api/trades/open", summary="Currently open paper positions")
async def api_open_trades():
    trades = await get_open_trades(DB_PATH)
    btc_price, momentum = await binance_feed.get_snapshot()
    return {
        "trades":       trades,
        "btc_price":    btc_price,
        "momentum_pct": round((momentum or 0) * 100, 5),
    }


@app.get("/api/stats", summary="Aggregated P&L statistics")
async def api_stats():
    return await get_trade_stats(DB_PATH)


@app.get("/api/stream", summary="SSE live-update stream", include_in_schema=False)
async def api_stream():
    """Server-Sent Events endpoint — pushes status every second."""

    async def generator():
        while True:
            btc_price, momentum = await binance_feed.get_snapshot()
            stats = await sniper_bot.get_full_stats() if sniper_bot else {}
            payload = {
                "timestamp":         datetime.now(timezone.utc).isoformat(),
                "btc_price":         btc_price,
                "momentum_pct":      round((momentum or 0) * 100, 5),
                "binance_connected": binance_feed.is_connected,
                "stats":             stats,
            }
            yield f"data: {json.dumps(payload)}\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

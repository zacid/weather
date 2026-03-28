# ---------------------------------------------------------------------------
# Polymarket Sniper Bot v2 — Binance real-time BTC price feed
# ---------------------------------------------------------------------------
#
# Connects to wss://stream.binance.com:9443/ws/btcusdt@trade
# Maintains a rolling 10-second price window for momentum calculation.
# ---------------------------------------------------------------------------

import asyncio
import json
import logging
import time
from collections import deque
from typing import Optional, Tuple

import websockets
from websockets.exceptions import ConnectionClosed

from config import BINANCE_WS_URL, MOMENTUM_WINDOW_SECONDS

logger = logging.getLogger(__name__)


class BinanceFeed:
    """Thread-safe (asyncio) BTC price feed with momentum calculation."""

    def __init__(self) -> None:
        # Rolling window: deque of (unix_timestamp, price) tuples
        self._window: deque = deque()
        self._latest_price: Optional[float] = None
        self._lock = asyncio.Lock()
        self._running = False
        self._connected = False

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    @property
    def is_connected(self) -> bool:
        return self._connected

    @property
    def latest_price(self) -> Optional[float]:
        return self._latest_price

    async def get_momentum(self) -> float:
        """
        Returns BTC price momentum as a fraction over the last
        MOMENTUM_WINDOW_SECONDS seconds.

        Positive  → price rising
        Negative  → price falling
        0.003     = 0.3 %
        """
        async with self._lock:
            now = time.monotonic()
            cutoff = now - MOMENTUM_WINDOW_SECONDS
            # Prune stale entries
            while self._window and self._window[0][0] < cutoff:
                self._window.popleft()
            if len(self._window) < 2:
                return 0.0
            oldest = self._window[0][1]
            latest = self._window[-1][1]
            return (latest - oldest) / oldest

    async def get_snapshot(self) -> Tuple[Optional[float], float]:
        """Returns (latest_price, momentum_fraction) atomically."""
        momentum = await self.get_momentum()
        return self._latest_price, momentum

    # ------------------------------------------------------------------
    # Background task
    # ------------------------------------------------------------------

    async def run(self) -> None:
        self._running = True
        backoff = 1.0
        while self._running:
            try:
                logger.info("Connecting to Binance WebSocket: %s", BINANCE_WS_URL)
                async with websockets.connect(
                    BINANCE_WS_URL,
                    ping_interval=20,
                    ping_timeout=10,
                    close_timeout=5,
                ) as ws:
                    self._connected = True
                    backoff = 1.0
                    logger.info("Binance WebSocket connected")
                    async for raw in ws:
                        if not self._running:
                            break
                        await self._handle_message(raw)
            except ConnectionClosed as exc:
                self._connected = False
                if self._running:
                    logger.warning(
                        "Binance WebSocket closed (%s), reconnecting in %.0fs…", exc, backoff
                    )
            except Exception as exc:
                self._connected = False
                if self._running:
                    logger.error(
                        "Binance WebSocket error: %s, reconnecting in %.0fs…", exc, backoff
                    )
            if self._running:
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30)

    def stop(self) -> None:
        self._running = False
        self._connected = False

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _handle_message(self, raw: str) -> None:
        """Parse a Binance trade message and record the price."""
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            return

        # Binance @trade stream fields: e=event_type, p=price, T=trade_time_ms
        if msg.get("e") != "trade":
            return

        price = float(msg["p"])
        ts = time.monotonic()

        async with self._lock:
            self._window.append((ts, price))
            self._latest_price = price

# ---------------------------------------------------------------------------
# Polymarket Sniper Bot v2 — Polymarket REST + WebSocket client
# ---------------------------------------------------------------------------
#
# REST endpoints used:
#   Gamma API  GET /markets        → market discovery
#   CLOB  API  GET /prices         → bulk best-ask prices
#   CLOB  API  GET /price          → single token price
#
# WebSocket:
#   wss://ws-subscriptions-clob.polymarket.com/ws/market
#   — receives book / price_change / last_trade_price / market_resolved
# ---------------------------------------------------------------------------

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

import aiohttp
import websockets
from websockets.exceptions import ConnectionClosed

from config import POLYMARKET_GAMMA_API, POLYMARKET_CLOB_API, POLYMARKET_WS_URL

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Date parsing helper
# ---------------------------------------------------------------------------

def _parse_utc(s: str) -> datetime:
    """Parse ISO-8601 datetime string → UTC-aware datetime."""
    s = s.replace("Z", "+00:00")
    # strip sub-second precision that fromisoformat can't handle on Python <3.11
    if "." in s:
        dot = s.index(".")
        tz_start = s.find("+", dot)
        if tz_start == -1:
            tz_start = s.find("-", dot)
        if tz_start != -1:
            s = s[:dot] + s[tz_start:]
        else:
            s = s[:dot]
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


# ---------------------------------------------------------------------------
# REST client
# ---------------------------------------------------------------------------

class PolymarketClient:
    """Async REST client for the Polymarket Gamma + CLOB APIs."""

    def __init__(self, session: aiohttp.ClientSession) -> None:
        self.session = session

    # ------------------------------------------------------------------
    # Market discovery
    # ------------------------------------------------------------------

    async def get_btc_markets_ending_soon(
        self, max_seconds_ahead: float = 120.0
    ) -> List[Dict[str, Any]]:
        """
        Return active BTC/Bitcoin markets whose end_date falls within the
        next *max_seconds_ahead* seconds.

        Each returned dict contains:
            market_id, condition_id, question, clob_token_ids (list[str]),
            outcomes (list[str]), end_date (str), seconds_remaining (float)
        """
        now = datetime.now(timezone.utc)
        raw_markets: List[Dict] = []

        # Primary: Gamma API with crypto tag filter, sorted by end_date asc
        # so the soonest-expiring markets come first.
        try:
            async with self.session.get(
                f"{POLYMARKET_GAMMA_API}/markets",
                params={
                    "active": "true",
                    "tag_slug": "crypto",
                    "limit": 100,
                    "order": "end_date",
                    "ascending": "true",
                },
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    raw_markets = data if isinstance(data, list) else data.get("results", [])
        except Exception as exc:
            logger.error("Gamma API error: %s", exc)

        # Fallback: broader search by keyword if we got nothing
        if not raw_markets:
            try:
                async with self.session.get(
                    f"{POLYMARKET_GAMMA_API}/public-search",
                    params={"q": "Bitcoin", "events_status": "active"},
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        for event in data.get("events", []):
                            raw_markets.extend(event.get("markets", []))
            except Exception as exc:
                logger.error("Public-search fallback error: %s", exc)

        results: List[Dict] = []
        for m in raw_markets:
            # --- time filter ---
            end_str = m.get("endDate") or m.get("end_date") or ""
            if not end_str:
                continue
            try:
                end_dt = _parse_utc(end_str)
            except Exception:
                continue
            secs_remaining = (end_dt - now).total_seconds()
            if secs_remaining < 0 or secs_remaining > max_seconds_ahead:
                continue

            # --- BTC keyword filter ---
            question = (m.get("question") or "").lower()
            if "bitcoin" not in question and "btc" not in question:
                continue

            # --- require CLOB token IDs ---
            raw_ids = m.get("clobTokenIds") or m.get("clob_token_ids")
            if not raw_ids:
                continue
            if isinstance(raw_ids, str):
                try:
                    raw_ids = json.loads(raw_ids)
                except Exception:
                    continue
            if not isinstance(raw_ids, list) or len(raw_ids) < 2:
                continue

            outcomes_raw = m.get("outcomes") or "Yes,No"
            if isinstance(outcomes_raw, str):
                outcomes = [o.strip() for o in outcomes_raw.split(",")]
            else:
                outcomes = list(outcomes_raw)

            results.append(
                {
                    "market_id": str(m.get("id", "")),
                    "condition_id": m.get("conditionId") or m.get("condition_id", ""),
                    "question": m.get("question", ""),
                    "clob_token_ids": raw_ids,
                    "outcomes": outcomes,
                    "end_date": end_str,
                    "seconds_remaining": secs_remaining,
                }
            )

        return results

    # ------------------------------------------------------------------
    # Prices
    # ------------------------------------------------------------------

    async def get_token_prices_bulk(
        self, token_ids: List[str]
    ) -> Dict[str, float]:
        """
        Fetch best-ask prices for up to 500 tokens in one call.
        Returns {token_id: price_float}.
        """
        if not token_ids:
            return {}
        try:
            async with self.session.get(
                f"{POLYMARKET_CLOB_API}/prices",
                params={
                    "token_ids": ",".join(token_ids),
                    "sides": ",".join(["BUY"] * len(token_ids)),
                },
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return {
                        tid: float(v.get("BUY", 0.5))
                        for tid, v in data.items()
                        if isinstance(v, dict) and "BUY" in v
                    }
        except Exception as exc:
            logger.debug("Bulk prices error: %s", exc)
        return {}

    async def get_token_price(
        self, token_id: str, side: str = "BUY"
    ) -> Optional[float]:
        """Fetch a single token price."""
        try:
            async with self.session.get(
                f"{POLYMARKET_CLOB_API}/price",
                params={"token_id": token_id, "side": side},
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return float(data["price"])
        except Exception as exc:
            logger.debug("Single price error for %s: %s", token_id[:12], exc)
        return None

    async def get_last_trade_price(self, token_id: str) -> Optional[float]:
        """Fetch the last trade price for a token (useful for resolution detection)."""
        try:
            async with self.session.get(
                f"{POLYMARKET_CLOB_API}/last-trade-price",
                params={"token_id": token_id},
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return float(data["price"])
        except Exception as exc:
            logger.debug("Last trade price error for %s: %s", token_id[:12], exc)
        return None


# ---------------------------------------------------------------------------
# WebSocket listener (optional enrichment feed)
# ---------------------------------------------------------------------------

class PolymarketFeed:
    """
    Subscribes to the Polymarket CLOB market WebSocket.
    Calls on_price_update(token_id, best_bid, best_ask) when prices change.
    """

    def __init__(self, on_price_update: Callable[[str, float, float], None]) -> None:
        self._on_price_update = on_price_update
        self._subscribed: set = set()
        self._ws = None
        self._running = False

    async def subscribe(self, token_ids: List[str]) -> None:
        new = [t for t in token_ids if t not in self._subscribed]
        if not new or self._ws is None:
            self._subscribed.update(token_ids)
            return
        await self._ws.send(
            json.dumps({"assets_ids": new, "operation": "subscribe", "type": "market"})
        )
        self._subscribed.update(new)

    async def run(self) -> None:
        self._running = True
        backoff = 1.0
        while self._running:
            try:
                async with websockets.connect(
                    POLYMARKET_WS_URL, ping_interval=10
                ) as ws:
                    self._ws = ws
                    backoff = 1.0
                    logger.info("Polymarket market WebSocket connected")

                    # Re-subscribe to any tokens tracked before reconnect
                    if self._subscribed:
                        await ws.send(
                            json.dumps(
                                {
                                    "assets_ids": list(self._subscribed),
                                    "type": "market",
                                    "custom_feature_enabled": True,
                                }
                            )
                        )

                    async for raw in ws:
                        if not self._running:
                            break
                        await self._handle(raw)

            except ConnectionClosed as exc:
                if self._running:
                    logger.warning("Polymarket WS closed (%s), reconnecting in %.0fs", exc, backoff)
            except Exception as exc:
                if self._running:
                    logger.error("Polymarket WS error: %s", exc)
            finally:
                self._ws = None
            if self._running:
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30)

    def stop(self) -> None:
        self._running = False

    async def _handle(self, raw: str) -> None:
        try:
            msg = json.loads(raw)
        except Exception:
            return
        msg_type = msg.get("event_type") or msg.get("type", "")
        if msg_type == "best_bid_ask":
            token_id = msg.get("asset_id", "")
            best_bid = float(msg.get("best_bid", 0))
            best_ask = float(msg.get("best_ask", 1))
            if token_id:
                self._on_price_update(token_id, best_bid, best_ask)

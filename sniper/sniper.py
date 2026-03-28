# ---------------------------------------------------------------------------
# Polymarket Sniper Bot v2 — Core sniper logic
# ---------------------------------------------------------------------------
#
# Strategy:
#   1. Every POLL_INTERVAL_SECONDS, query Polymarket for BTC markets
#      expiring within MAX_SECONDS_REMAINING seconds.
#   2. If one side is ≥ MIN_PRICE_THRESHOLD (90¢), check Binance momentum.
#   3. If BTC momentum is > MOMENTUM_THRESHOLD against our side → SKIP.
#   4. Otherwise → paper trade (log to DB).
#   5. While holding, monitor Binance continuously.
#      If momentum flips adverse → log an early-exit signal.
#   6. After end_date, poll for resolution (winning side → WIN, else LOSS).
# ---------------------------------------------------------------------------

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Set

from config import (
    DB_PATH,
    MAX_SECONDS_REMAINING,
    MIN_PRICE_THRESHOLD,
    MOMENTUM_THRESHOLD,
    PAPER_TRADE_SIZE_USD,
    POLL_INTERVAL_SECONDS,
)
from database import (
    get_open_trades,
    get_trade_stats,
    insert_trade,
    log_early_exit_signal,
    log_event,
    update_trade_outcome,
)
from binance_feed import BinanceFeed
from polymarket_client import PolymarketClient

logger = logging.getLogger(__name__)


class SniperBot:
    def __init__(
        self,
        binance: BinanceFeed,
        polymarket: PolymarketClient,
        db_path: str = DB_PATH,
    ) -> None:
        self.binance = binance
        self.polymarket = polymarket
        self.db_path = db_path

        # condition_ids we've already entered (prevents double-trading)
        self._traded: Set[str] = set()
        # trade_id → trade dict for open positions
        self._open_trades: Dict[int, Dict] = {}

        self._running = False

        # Live counters (in-memory; DB is source of truth for persistence)
        self.stats: Dict[str, Any] = {
            "total_entered": 0,
            "skipped_no_opportunity": 0,
            "skipped_momentum": 0,
            "wins": 0,
            "losses": 0,
            "early_exit_signals": 0,
        }

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def run(self) -> None:
        self._running = True
        logger.info("SniperBot started")

        # Reload open trades from previous run (if any)
        await self._reload_open_trades()

        # Background resolution-checker
        asyncio.create_task(self._resolution_loop())

        while self._running:
            try:
                await self._scan()
            except Exception as exc:
                logger.error("Scan error: %s", exc, exc_info=True)
            await asyncio.sleep(POLL_INTERVAL_SECONDS)

    def stop(self) -> None:
        self._running = False

    # ------------------------------------------------------------------
    # Market scan
    # ------------------------------------------------------------------

    async def _scan(self) -> None:
        btc_price, momentum = await self.binance.get_snapshot()

        if btc_price is None:
            logger.debug("Waiting for Binance feed…")
            return

        markets = await self.polymarket.get_btc_markets_ending_soon(
            max_seconds_ahead=MAX_SECONDS_REMAINING
        )

        if not markets:
            logger.debug("No BTC markets expiring within %ds", MAX_SECONDS_REMAINING)
            return

        for market in markets:
            await self._evaluate_market(market, btc_price, momentum)

    async def _evaluate_market(
        self, market: Dict, btc_price: float, momentum: float
    ) -> None:
        condition_id = market["condition_id"]
        if condition_id in self._traded:
            return

        secs = market["seconds_remaining"]
        if secs > MAX_SECONDS_REMAINING or secs < 0:
            return

        token_ids = market["clob_token_ids"]
        if len(token_ids) < 2:
            return

        yes_id, no_id = token_ids[0], token_ids[1]

        # Fetch best-ask prices for both sides
        prices = await self.polymarket.get_token_prices_bulk([yes_id, no_id])
        yes_price = prices.get(yes_id)
        no_price  = prices.get(no_id)

        if yes_price is None or no_price is None:
            logger.debug("Could not fetch prices for %s", condition_id[:12])
            return

        # Determine which side, if any, qualifies
        if yes_price >= MIN_PRICE_THRESHOLD:
            side, entry_price, entry_token = "YES", yes_price, yes_id
        elif no_price >= MIN_PRICE_THRESHOLD:
            side, entry_price, entry_token = "NO", no_price, no_id
        else:
            self.stats["skipped_no_opportunity"] += 1
            return

        logger.info(
            "Opportunity: %s | side=%s price=%.3f | %.0fs left | "
            "BTC=$%.2f momentum=%.4f%%",
            market["question"][:70], side, entry_price, secs,
            btc_price, momentum * 100,
        )

        # Momentum safety filter
        if not self._momentum_ok(side, momentum):
            logger.info(
                "SKIP (momentum filter) %s | momentum=%.4f%%",
                side, momentum * 100,
            )
            self.stats["skipped_momentum"] += 1
            await log_event(
                self.db_path,
                "skipped_momentum",
                {
                    "condition_id": condition_id,
                    "question": market["question"],
                    "side": side,
                    "entry_price": entry_price,
                    "momentum": momentum,
                    "btc_price": btc_price,
                    "seconds_remaining": secs,
                },
            )
            return

        # Enter paper trade
        await self._enter_trade(market, side, entry_token, entry_price, btc_price, momentum, secs)
        self._traded.add(condition_id)

    # ------------------------------------------------------------------
    # Trade entry
    # ------------------------------------------------------------------

    async def _enter_trade(
        self,
        market: Dict,
        side: str,
        token_id: str,
        entry_price: float,
        btc_price: float,
        momentum: float,
        secs_remaining: float,
    ) -> None:
        shares = PAPER_TRADE_SIZE_USD / entry_price
        record = {
            "market_id":             market["market_id"],
            "condition_id":          market["condition_id"],
            "question":              market["question"],
            "side":                  side,
            "token_id":              token_id,
            "entry_price":           entry_price,
            "trade_size_usd":        PAPER_TRADE_SIZE_USD,
            "shares":                shares,
            "time_remaining_seconds": secs_remaining,
            "btc_price_at_entry":    btc_price,
            "momentum_at_entry":     momentum,
            "end_date":              market["end_date"],
        }

        trade_id = await insert_trade(self.db_path, record)
        record["id"] = trade_id
        self._open_trades[trade_id] = record
        self.stats["total_entered"] += 1

        logger.info(
            "PAPER TRADE #%d | %s | %s | price=%.3f size=$%.0f shares=%.2f | "
            "%.0fs remaining | BTC=$%.2f momentum=%.4f%%",
            trade_id, side, market["question"][:60],
            entry_price, PAPER_TRADE_SIZE_USD, shares,
            secs_remaining, btc_price, momentum * 100,
        )

        await log_event(
            self.db_path,
            "trade_entered",
            {
                "trade_id":    trade_id,
                "side":        side,
                "question":    market["question"],
                "entry_price": entry_price,
                "btc_price":   btc_price,
                "momentum":    momentum,
                "secs":        secs_remaining,
            },
        )

    # ------------------------------------------------------------------
    # Momentum helper
    # ------------------------------------------------------------------

    @staticmethod
    def _momentum_ok(side: str, momentum: float) -> bool:
        """
        Return True if it is safe to enter the given side.

        YES (BTC ↑) → unsafe if BTC falling faster than threshold
        NO  (BTC ↓) → unsafe if BTC rising faster than threshold
        """
        if side == "YES":
            return momentum > -MOMENTUM_THRESHOLD
        else:  # NO
            return momentum < MOMENTUM_THRESHOLD

    # ------------------------------------------------------------------
    # Resolution loop (runs as background task)
    # ------------------------------------------------------------------

    async def _resolution_loop(self) -> None:
        """Checks open trades for adverse momentum and eventual resolution."""
        while self._running:
            await asyncio.sleep(5)
            if not self._open_trades:
                continue
            try:
                await self._check_open_trades()
            except Exception as exc:
                logger.error("Resolution loop error: %s", exc, exc_info=True)

    async def _check_open_trades(self) -> None:
        btc_price, momentum = await self.binance.get_snapshot()
        now = datetime.now(timezone.utc)

        for trade_id, trade in list(self._open_trades.items()):
            try:
                end_dt = _parse_utc_str(trade["end_date"])
            except Exception:
                continue

            secs_since_end = (now - end_dt).total_seconds()

            if secs_since_end < 0:
                # Still live — watch momentum
                if btc_price is not None and not self._momentum_ok(trade["side"], momentum):
                    logger.warning(
                        "EARLY EXIT SIGNAL #%d | %s | momentum=%.4f%% | BTC=$%.2f",
                        trade_id, trade["side"], momentum * 100, btc_price or 0,
                    )
                    await log_early_exit_signal(self.db_path, trade_id, momentum, btc_price)
                    self.stats["early_exit_signals"] += 1
                    # Keep monitoring (don't remove — still needs resolution)

            elif secs_since_end >= 10:
                # Market should be resolving; try to get outcome
                resolved = await self._try_resolve(trade, btc_price)
                if resolved:
                    del self._open_trades[trade_id]

    async def _try_resolve(self, trade: Dict, btc_price: Optional[float]) -> bool:
        """
        Attempt to determine the outcome of a completed trade.
        Returns True if we managed to record a resolution.

        Resolution heuristic:
          - Fetch the last-trade-price of the winning token.
          - If it settled near 1.0 → WIN; near 0.0 → LOSS.
          - Otherwise poll again next cycle.
        """
        token_id = trade["token_id"]
        trade_id = trade["id"]

        # Try last-trade-price first (most reliable post-resolution)
        price = await self.polymarket.get_last_trade_price(token_id)

        # Fall back to best-ask (sometimes stays ~1 or ~0 after resolve)
        if price is None:
            price = await self.polymarket.get_token_price(token_id, "BUY")
        if price is None:
            price = await self.polymarket.get_token_price(token_id, "SELL")

        if price is None:
            logger.debug("No resolution price yet for trade #%d", trade_id)
            return False

        if price >= 0.95:
            outcome = "WIN"
            pnl = (1.0 - trade["entry_price"]) * trade["shares"]
        elif price <= 0.05:
            outcome = "LOSS"
            pnl = -trade["entry_price"] * trade["shares"]
        else:
            logger.debug(
                "Trade #%d resolution pending (price=%.3f)", trade_id, price
            )
            return False

        await update_trade_outcome(self.db_path, trade_id, outcome, pnl)

        if outcome == "WIN":
            self.stats["wins"] += 1
        else:
            self.stats["losses"] += 1

        logger.info(
            "RESOLVED #%d | %s | PnL=$%.2f | %s@%.3f → res=%.3f | BTC=$%s",
            trade_id, outcome, pnl,
            trade["side"], trade["entry_price"], price,
            f"{btc_price:.2f}" if btc_price else "?",
        )

        await log_event(
            self.db_path,
            "trade_resolved",
            {
                "trade_id":        trade_id,
                "outcome":         outcome,
                "pnl":             pnl,
                "resolution_price": price,
                "btc_price":       btc_price,
            },
        )
        return True

    # ------------------------------------------------------------------
    # Reload open trades from DB on startup
    # ------------------------------------------------------------------

    async def _reload_open_trades(self) -> None:
        trades = await get_open_trades(self.db_path)
        for t in trades:
            self._open_trades[t["id"]] = t
            cid = t.get("condition_id")
            if cid:
                self._traded.add(cid)
        if trades:
            logger.info("Reloaded %d open trade(s) from database", len(trades))

    # ------------------------------------------------------------------
    # Stats
    # ------------------------------------------------------------------

    async def get_full_stats(self) -> Dict:
        db_stats = await get_trade_stats(self.db_path)
        return {**self.stats, **db_stats, "open_trades": len(self._open_trades)}


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

def _parse_utc_str(s: str) -> datetime:
    from polymarket_client import _parse_utc
    return _parse_utc(s)

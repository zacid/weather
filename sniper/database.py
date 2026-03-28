# ---------------------------------------------------------------------------
# Polymarket Sniper Bot v2 — SQLite persistence layer
# ---------------------------------------------------------------------------

import json
import aiosqlite
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_SCHEMA = """
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS trades (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at              TEXT    DEFAULT (datetime('now')),
    -- market identification
    market_id               TEXT    NOT NULL,
    condition_id            TEXT    NOT NULL,
    question                TEXT    NOT NULL,
    -- position
    side                    TEXT    NOT NULL,   -- 'YES' or 'NO'
    token_id                TEXT    NOT NULL,
    entry_price             REAL    NOT NULL,   -- price paid (0–1)
    trade_size_usd          REAL    NOT NULL,
    shares                  REAL    NOT NULL,
    time_remaining_seconds  REAL    NOT NULL,
    -- market context at entry
    btc_price_at_entry      REAL,
    momentum_at_entry       REAL,              -- fraction (0.003 = 0.3 %)
    end_date                TEXT    NOT NULL,
    -- lifecycle
    status                  TEXT    DEFAULT 'open',  -- open | resolved | early_exit_signal
    outcome                 TEXT,                    -- WIN | LOSS
    pnl_usd                 REAL,
    resolved_at             TEXT,
    -- early-exit monitoring
    early_exit_logged_at    TEXT,
    early_exit_momentum     REAL,
    early_exit_btc_price    REAL,
    -- free-form notes
    notes                   TEXT    DEFAULT ''
);

CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    occurred_at TEXT    DEFAULT (datetime('now')),
    event_type  TEXT    NOT NULL,
    payload     TEXT    NOT NULL    -- JSON
);
"""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def init_db(db_path: str) -> None:
    async with aiosqlite.connect(db_path) as db:
        await db.executescript(_SCHEMA)
        await db.commit()


async def insert_trade(db_path: str, t: Dict[str, Any]) -> int:
    async with aiosqlite.connect(db_path) as db:
        cur = await db.execute(
            """
            INSERT INTO trades
                (market_id, condition_id, question, side, token_id,
                 entry_price, trade_size_usd, shares, time_remaining_seconds,
                 btc_price_at_entry, momentum_at_entry, end_date, notes)
            VALUES (?,?,?,?,?, ?,?,?,?, ?,?,?,?)
            """,
            (
                t["market_id"], t["condition_id"], t["question"],
                t["side"], t["token_id"],
                t["entry_price"], t["trade_size_usd"], t["shares"],
                t["time_remaining_seconds"],
                t.get("btc_price_at_entry"), t.get("momentum_at_entry"),
                t["end_date"], t.get("notes", ""),
            ),
        )
        await db.commit()
        return cur.lastrowid


async def update_trade_outcome(
    db_path: str, trade_id: int, outcome: str, pnl_usd: float
) -> None:
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            """
            UPDATE trades
            SET status='resolved', outcome=?, pnl_usd=?, resolved_at=datetime('now')
            WHERE id=?
            """,
            (outcome, pnl_usd, trade_id),
        )
        await db.commit()


async def log_early_exit_signal(
    db_path: str, trade_id: int, momentum: float, btc_price: Optional[float]
) -> None:
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            """
            UPDATE trades
            SET status='early_exit_signal',
                early_exit_logged_at=datetime('now'),
                early_exit_momentum=?,
                early_exit_btc_price=?
            WHERE id=? AND status='open'
            """,
            (momentum, btc_price, trade_id),
        )
        await db.commit()


async def get_open_trades(db_path: str) -> List[Dict]:
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM trades WHERE status IN ('open','early_exit_signal') ORDER BY created_at DESC"
        ) as cur:
            return [dict(r) for r in await cur.fetchall()]


async def get_recent_trades(db_path: str, limit: int = 50) -> List[Dict]:
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM trades ORDER BY created_at DESC LIMIT ?", (limit,)
        ) as cur:
            return [dict(r) for r in await cur.fetchall()]


async def get_trade_stats(db_path: str) -> Dict[str, Any]:
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """
            SELECT
                COUNT(*)                                        AS total,
                SUM(CASE WHEN outcome='WIN'  THEN 1 ELSE 0 END) AS wins,
                SUM(CASE WHEN outcome='LOSS' THEN 1 ELSE 0 END) AS losses,
                SUM(COALESCE(pnl_usd, 0))                       AS total_pnl,
                COUNT(CASE WHEN status='open' THEN 1 END)       AS open_count
            FROM trades
            """
        ) as cur:
            row = dict(await cur.fetchone())
    row["win_rate"] = (
        round(row["wins"] / (row["wins"] + row["losses"]) * 100, 1)
        if (row["wins"] or 0) + (row["losses"] or 0) > 0
        else None
    )
    return row


async def log_event(db_path: str, event_type: str, payload: Any) -> None:
    if not isinstance(payload, str):
        payload = json.dumps(payload, default=str)
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "INSERT INTO events (event_type, payload) VALUES (?,?)",
            (event_type, payload),
        )
        await db.commit()

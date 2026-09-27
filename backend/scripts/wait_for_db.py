"""Wait until PostgreSQL accepts connections (used before alembic/seed on startup)."""

import asyncio
import os
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

MAX_ATTEMPTS = 30
DELAY_SECONDS = 2


async def wait_for_db() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL is not set", file=sys.stderr)
        sys.exit(1)

    last_error: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        engine = create_async_engine(database_url, echo=False)
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            print(f"Database is ready (attempt {attempt}/{MAX_ATTEMPTS})")
            return
        except Exception as exc:
            last_error = exc
            print(
                f"Database not ready (attempt {attempt}/{MAX_ATTEMPTS}): {exc}",
                file=sys.stderr,
            )
            await asyncio.sleep(DELAY_SECONDS)
        finally:
            await engine.dispose()

    print(f"ERROR: database unavailable after {MAX_ATTEMPTS} attempts", file=sys.stderr)
    if last_error:
        print(f"Last error: {last_error}", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    asyncio.run(wait_for_db())

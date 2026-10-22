"""Operational calendar dates (Moscow) for duty, attendance, and reports."""

from datetime import date, datetime
from zoneinfo import ZoneInfo

MSK = ZoneInfo("Europe/Moscow")


def today_msk() -> date:
    return datetime.now(MSK).date()

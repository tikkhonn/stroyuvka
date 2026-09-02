from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import ReportStatus, UnitType
from app.models import CourseReport, FacultyReport, Unit
from app.schemas import (
    AttendanceAggregate,
    FacultyTodayBreakdown,
    OverviewDelta,
    OverviewResponse,
    OverviewUnitBreakdown,
    ReadinessSummary,
    TrendDayPoint,
    TrendsResponse,
)
from app.services.attendance import (
    compute_academy_aggregate,
    compute_faculty_aggregate,
    compute_location_aggregate,
)
from app.services.reports import build_chessboard_sick_summary
from app.services.unit_ids import LOCATION_NAMES

_SUBMITTED_STATUSES = frozenset({ReportStatus.SUBMITTED, ReportStatus.APPROVED})


async def _build_readiness(session: AsyncSession, report_date: date) -> ReadinessSummary:
    courses = list(
        (
            await session.execute(
                select(Unit).where(Unit.type == UnitType.COURSE, Unit.is_active.is_(True))
            )
        )
        .scalars()
        .all()
    )
    faculties = list(
        (
            await session.execute(
                select(Unit).where(Unit.type == UnitType.FACULTY, Unit.is_active.is_(True))
            )
        )
        .scalars()
        .all()
    )

    courses_submitted = 0
    for course in courses:
        report = (
            await session.execute(
                select(CourseReport).where(
                    CourseReport.course_id == course.id,
                    CourseReport.report_date == report_date,
                )
            )
        ).scalar_one_or_none()
        if report and report.status in _SUBMITTED_STATUSES:
            courses_submitted += 1

    faculties_submitted = 0
    for faculty in faculties:
        report = (
            await session.execute(
                select(FacultyReport).where(
                    FacultyReport.faculty_id == faculty.id,
                    FacultyReport.report_date == report_date,
                )
            )
        ).scalar_one_or_none()
        if report and report.status in _SUBMITTED_STATUSES:
            faculties_submitted += 1

    return ReadinessSummary(
        courses_total=len(courses),
        courses_submitted=courses_submitted,
        faculties_total=len(faculties),
        faculties_submitted=faculties_submitted,
    )


async def build_overview(session: AsyncSession, report_date: date) -> OverviewResponse:
    academy = await compute_academy_aggregate(session, report_date)

    prev_agg: AttendanceAggregate | None = None
    try:
        prev_agg = await compute_academy_aggregate(session, report_date - timedelta(days=1))
    except ValueError:
        prev_agg = None

    delta: OverviewDelta | None = None
    if prev_agg is not None:
        delta = OverviewDelta(
            present=academy.present - prev_agg.present,
            sick=academy.sick - prev_agg.sick,
            trip=academy.trip - prev_agg.trip,
            leave=academy.leave - prev_agg.leave,
            dismissal=academy.dismissal - prev_agg.dismissal,
        )

    present_percent = (
        round(academy.present / academy.total_list * 100, 1) if academy.total_list else 0.0
    )

    faculties: list[OverviewUnitBreakdown] = []
    fac_result = await session.execute(
        select(Unit)
        .where(Unit.type == UnitType.FACULTY, Unit.is_active.is_(True))
        .order_by(Unit.id)
    )
    for fac in fac_result.scalars():
        agg = await compute_faculty_aggregate(session, fac.id, report_date)
        faculties.append(
            OverviewUnitBreakdown(unit_id=fac.id, unit_name=fac.name, aggregate=agg)
        )

    locations: list[OverviewUnitBreakdown] = []
    for loc_id in sorted(LOCATION_NAMES):
        agg = await compute_location_aggregate(session, loc_id, report_date)
        locations.append(
            OverviewUnitBreakdown(
                unit_id=loc_id,
                unit_name=LOCATION_NAMES[loc_id],
                aggregate=agg,
            )
        )

    sick_summary = await build_chessboard_sick_summary(session, report_date)
    readiness = await _build_readiness(session, report_date)

    return OverviewResponse(
        report_date=report_date,
        academy=academy,
        present_percent=present_percent,
        delta_vs_yesterday=delta,
        faculties=faculties,
        locations=locations,
        sick_summary=sick_summary,
        readiness=readiness,
    )


async def build_trends(
    session: AsyncSession, from_date: date, to_date: date
) -> TrendsResponse:
    if from_date > to_date:
        from_date, to_date = to_date, from_date

    days: list[TrendDayPoint] = []
    current = from_date
    while current <= to_date:
        agg = await compute_academy_aggregate(session, current)
        days.append(
            TrendDayPoint(
                date=current,
                total_list=agg.total_list,
                present=agg.present,
                sick=agg.sick,
                trip=agg.trip,
                leave=agg.leave,
                dismissal=agg.dismissal,
                duty=agg.duty,
                away_dorm=agg.away_dorm,
            )
        )
        current += timedelta(days=1)

    faculties_today: list[FacultyTodayBreakdown] = []
    fac_result = await session.execute(
        select(Unit)
        .where(Unit.type == UnitType.FACULTY, Unit.is_active.is_(True))
        .order_by(Unit.id)
    )
    for fac in fac_result.scalars():
        agg = await compute_faculty_aggregate(session, fac.id, to_date)
        faculties_today.append(
            FacultyTodayBreakdown(
                faculty_id=fac.id,
                faculty_name=fac.name,
                sick=agg.sick,
                trip=agg.trip,
                leave=agg.leave,
                dismissal=agg.dismissal,
            )
        )

    return TrendsResponse(
        from_date=from_date,
        to_date=to_date,
        days=days,
        faculties_today=faculties_today,
    )

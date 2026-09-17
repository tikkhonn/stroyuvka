"""HTML-печать развёрнутой строевой записки (свод + список отсутствующих)."""

from datetime import date
from html import escape

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import ABSENCE_CATEGORY_DEFS, AbsenceCategoryCode, DutyPostType, UnitType
from app.models import Unit
from app.schemas import AbsenceEntryRead, AttendanceAggregate
from app.services.attendance import compute_aggregate_for_unit, get_attendance_snapshot, _normalize_code
from app.services.duty_contacts import get_duty_contact_on_date
from app.services.org import get_courses_for_faculty, get_courses_for_location
from app.services.people import department_display_name, format_rank, normalize_department_code
from app.services.unit_ids import LOCATION_ACADEMY

ACADEMY_TITLE = "Военно-космической академии имени А.Ф. Можайского"

MONTHS_GENITIVE = (
    "",
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
)

CATEGORY_LABELS = {
    code: label for code, label, _req in ABSENCE_CATEGORY_DEFS
}
CATEGORY_LABELS.update(
    {
        "sick_med": "Болен",
        "sick_hosp": "Болен",
        "awol_other": "Прочее",
    }
)


def _format_date_ru(d: date) -> str:
    return f"{d.day} {MONTHS_GENITIVE[d.month]} {d.year} года"


def _cell(value: int) -> str:
    return "—" if value == 0 else str(value)


def _category_code(entry: AbsenceEntryRead) -> str:
    code = entry.category_code
    return code.value if hasattr(code, "value") else str(code)


def _absence_reason(entry: AbsenceEntryRead) -> str:
    code = _category_code(entry)
    label = CATEGORY_LABELS.get(code, code)
    if code in ("sick", "sick_med", "sick_hosp"):
        if entry.hospital_name:
            return f"{label} ({entry.hospital_name})"
        return label
    if entry.note:
        return f"{label} ({entry.note})"
    return label


def _other_count(agg: AttendanceAggregate) -> int:
    return agg.other + agg.away_dorm


def _summary_row(idx: int, unit_name: str, agg: AttendanceAggregate) -> str:
    return f"""
    <tr>
      <td>{idx}</td>
      <td>{unit_name}</td>
      <td>{_cell(agg.total_list)}</td>
      <td>{_cell(agg.present)}</td>
      <td>{_cell(agg.duty)}</td>
      <td>{_cell(agg.trip)}</td>
      <td>{_cell(agg.leave)}</td>
      <td>{_cell(agg.sick)}</td>
      <td>{_cell(agg.dismissal)}</td>
      <td>{_cell(_other_count(agg))}</td>
      <td>{_cell(agg.arrest)}</td>
    </tr>"""


def _total_aggregate(rows: list[tuple[str, AttendanceAggregate]]) -> AttendanceAggregate:
    from app.services.attendance import sum_aggregates

    if not rows:
        from app.services.attendance import empty_aggregate

        return empty_aggregate()
    return sum_aggregates([agg for _, agg in rows])


def _subtitle_for_unit(unit: Unit, report_date: date) -> str:
    if unit.type == UnitType.COURSE:
        return f"{unit.name} {ACADEMY_TITLE} на {_format_date_ru(report_date)}"
    if unit.type == UnitType.FACULTY:
        return f"{unit.name} {ACADEMY_TITLE} на {_format_date_ru(report_date)}"
    if unit.type == UnitType.LOCATION:
        return f"расположения «{unit.name}» {ACADEMY_TITLE} на {_format_date_ru(report_date)}"
    return f"{unit.name} на {_format_date_ru(report_date)}"


def _subtitle_academy(report_date: date) -> str:
    return f"{ACADEMY_TITLE} на {_format_date_ru(report_date)}"


def _subtitle_for_department(dept_name: str, unit: Unit, report_date: date) -> str:
    return f"{dept_name}, {unit.name} {ACADEMY_TITLE} на {_format_date_ru(report_date)}"


_PRINT_PAGE_STYLE = """
    @page { size: A4 landscape; margin: 0; }
    html, body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
      margin: 0;
      padding: 0;
    }
    @media print {
      body { padding: 1.5cm; }
    }
    @media screen {
      body { padding: 1cm; }
    }
    h1 {
      text-align: center;
      font-size: 14pt;
      font-weight: bold;
      margin: 0 0 0.5em;
      text-transform: uppercase;
    }
    .subtitle {
      text-align: center;
      font-size: 12pt;
      margin: 0 0 1.2em;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11pt;
      margin-bottom: 1.5em;
    }
    th, td {
      border: 1px solid #000;
      padding: 3px 5px;
      text-align: center;
      vertical-align: middle;
    }
    th { font-weight: normal; }
    .duty-sign-footer {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 1.5em;
      margin-top: 2.5em;
      font-size: 12pt;
      page-break-inside: avoid;
    }
    .duty-sign-left,
    .duty-sign-right {
      flex: 1 1 32%;
    }
    .duty-sign-right {
      text-align: right;
    }
    .duty-sign-center {
      flex: 1 1 28%;
      text-align: center;
    }
    .duty-sign-line {
      display: block;
      border-bottom: 1px solid #000;
      min-width: 9em;
      height: 1.25em;
      margin: 0 auto;
    }
    .duty-sign-caption {
      display: block;
      font-size: 10pt;
      color: #444;
      margin-top: 0.2em;
    }
"""

_PRINT_TOOLBAR_STYLE = """
    .print-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.2em;
      gap: 1em;
    }
    .print-toolbar button {
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      padding: 8px 18px;
      cursor: pointer;
      border: 1px solid #2A3F5F;
      border-radius: 6px;
      background: #fff;
      color: #2A3F5F;
    }
    .print-toolbar button:hover { background: #f3f5f8; }
    .print-toolbar button.primary {
      background: #2A3F5F;
      color: #fff;
    }
    .print-toolbar button.primary:hover { background: #54657F; }
    @media print { .no-print { display: none !important; } }
"""

_PRINT_TOOLBAR_HTML = """
  <div class="print-toolbar no-print">
    <button type="button" onclick="returnToApp()">Назад</button>
    <button type="button" class="primary" onclick="printDocument()">Печать</button>
  </div>
  <script>
    function returnToApp() {
      if (window.opener && !window.opener.closed) {
        window.opener.focus();
        window.close();
        return;
      }
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
      window.close();
    }
    function printDocument() {
      var previousTitle = document.title;
      document.title = " ";
      window.print();
      document.title = previousTitle;
    }
  </script>
"""


def _duty_officer_line(rank: str | None, full_name: str | None) -> str:
    parts = [p for p in [(rank or "").strip(), (full_name or "").strip()] if p]
    return " ".join(parts) if parts else "—"


def _duty_sign_footer_html(left_label: str, rank: str | None, full_name: str | None) -> str:
    officer = escape(_duty_officer_line(rank, full_name))
    return f"""
  <div class="duty-sign-footer">
    <div class="duty-sign-left">{escape(left_label)}</div>
    <div class="duty-sign-center">
      <span class="duty-sign-line"></span>
      <span class="duty-sign-caption">(подпись)</span>
    </div>
    <div class="duty-sign-right">{officer}</div>
  </div>"""


async def _duty_sign_footer(
    session: AsyncSession,
    report_date: date,
    unit_id: int,
    post_type: DutyPostType,
    left_label: str,
) -> str:
    contact = await get_duty_contact_on_date(session, report_date, unit_id, post_type)
    rank = format_rank(contact.rank) if contact and contact.rank else None
    full_name = (contact.full_name or "").strip() if contact else None
    return _duty_sign_footer_html(left_label, rank, full_name)


async def _summary_rows_for_units(
    session: AsyncSession,
    units: list[Unit],
    report_date: date,
    *,
    include_officers: Unit | None = None,
) -> list[tuple[str, AttendanceAggregate]]:
    rows: list[tuple[str, AttendanceAggregate]] = []
    for unit in units:
        agg = await compute_aggregate_for_unit(session, unit.id, report_date)
        rows.append((unit.name, agg))
    if include_officers:
        officers_name = f"Офицеры ({include_officers.name})"
        agg = await compute_aggregate_for_unit(session, include_officers.id, report_date)
        rows.append((officers_name, agg))
    return rows


async def _absences_for_units(
    session: AsyncSession,
    unit_ids: list[int],
    report_date: date,
) -> list[tuple[str, AbsenceEntryRead]]:
    result: list[tuple[str, AbsenceEntryRead]] = []
    for uid in unit_ids:
        snap = await get_attendance_snapshot(session, uid, report_date, editable=False)
        for entry in snap.absences:
            result.append((snap.unit_name, entry))
    result.sort(key=lambda x: (x[0], x[1].last_name, x[1].id))
    return result


def _build_html(
    subtitle: str,
    summary_rows: list[tuple[str, AttendanceAggregate]],
    absences: list[tuple[str, AbsenceEntryRead]],
    *,
    duty_footer: str = "",
) -> str:
    summary_body = ""
    for i, (name, agg) in enumerate(summary_rows, 1):
        summary_body += _summary_row(i, name, agg)
    if len(summary_rows) > 1:
        total = _total_aggregate(summary_rows)
        summary_body += _summary_row(len(summary_rows) + 1, "ИТОГО", total)

    if absences:
        absence_body = ""
        for i, (unit_name, entry) in enumerate(absences, 1):
            absence_body += f"""
    <tr>
      <td>{i}</td>
      <td>{entry.rank or "—"}</td>
      <td>{entry.last_name}</td>
      <td>{unit_name}</td>
      <td>{_absence_reason(entry)}</td>
      <td>{entry.status_date.strftime("%d.%m.%Y")}</td>
    </tr>"""
    else:
        absence_body = """
    <tr>
      <td colspan="6">Отсутствующих нет</td>
    </tr>"""

    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8"/>
  <title></title>
  <style>
    {_PRINT_PAGE_STYLE}
    {_PRINT_TOOLBAR_STYLE}
  </style>
</head>
<body>
  {_PRINT_TOOLBAR_HTML}
  <h1>Развёрнутая строевая записка</h1>
  <p class="subtitle">{subtitle}</p>

  <table>
    <thead>
      <tr>
        <th>№<br/>п/п</th>
        <th>Подразделение</th>
        <th>По<br/>списку</th>
        <th>На<br/>лицо</th>
        <th>Наряд</th>
        <th>Командировка</th>
        <th>Отпуск</th>
        <th>Болен</th>
        <th>Увольнение</th>
        <th>Прочее</th>
        <th>Арест</th>
      </tr>
    </thead>
    <tbody>{summary_body}
    </tbody>
  </table>

  <table class="detail-table">
    <thead>
      <tr>
        <th>№<br/>п/п</th>
        <th>Воинское<br/>звание</th>
        <th>Фамилия, имя, отчество</th>
        <th>Подразделение</th>
        <th>Причина отсутствия</th>
        <th>Время<br/>отсутствия</th>
      </tr>
    </thead>
    <tbody>{absence_body}
    </tbody>
  </table>
  {duty_footer}
</body>
</html>"""


def _entry_matches_category(entry: AbsenceEntryRead, category: AbsenceCategoryCode) -> bool:
    return _normalize_code(entry.category_code) == category


def _filter_absences_by_category(
    absences: list[tuple[str, AbsenceEntryRead]],
    category: AbsenceCategoryCode,
) -> list[tuple[str, AbsenceEntryRead]]:
    return [(unit_name, entry) for unit_name, entry in absences if _entry_matches_category(entry, category)]


def _category_summary_from_absences(
    absences: list[tuple[str, AbsenceEntryRead]],
) -> list[tuple[str, int]]:
    counts: dict[str, int] = {}
    for unit_name, _entry in absences:
        counts[unit_name] = counts.get(unit_name, 0) + 1
    return sorted(counts.items(), key=lambda x: x[0])


def _build_category_html(
    subtitle: str,
    category_label: str,
    summary_counts: list[tuple[str, int]],
    absences: list[tuple[str, AbsenceEntryRead]],
    *,
    duty_footer: str = "",
) -> str:
    summary_body = ""
    total = 0
    for i, (name, count) in enumerate(summary_counts, 1):
        total += count
        summary_body += f"""
    <tr>
      <td>{i}</td>
      <td>{name}</td>
      <td>{count}</td>
    </tr>"""
    if len(summary_counts) > 1:
        summary_body += f"""
    <tr>
      <td>{len(summary_counts) + 1}</td>
      <td>ИТОГО</td>
      <td>{total}</td>
    </tr>"""
    if not summary_counts:
        summary_body = """
    <tr>
      <td colspan="3">Нет отсутствующих по выбранной причине</td>
    </tr>"""

    if absences:
        absence_body = ""
        for i, (unit_name, entry) in enumerate(absences, 1):
            absence_body += f"""
    <tr>
      <td>{i}</td>
      <td>{entry.rank or "—"}</td>
      <td>{entry.last_name}</td>
      <td>{unit_name}</td>
      <td>{_absence_reason(entry)}</td>
      <td>{entry.status_date.strftime("%d.%m.%Y")}</td>
    </tr>"""
    else:
        absence_body = """
    <tr>
      <td colspan="6">Отсутствующих нет</td>
    </tr>"""

    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8"/>
  <title></title>
  <style>
    {_PRINT_PAGE_STYLE}
    {_PRINT_TOOLBAR_STYLE}
  </style>
</head>
<body>
  {_PRINT_TOOLBAR_HTML}
  <h1>Расход по причине отсутствия: {category_label}</h1>
  <p class="subtitle">{subtitle}</p>

  <table>
    <thead>
      <tr>
        <th>№<br/>п/п</th>
        <th>Подразделение</th>
        <th>Количество</th>
      </tr>
    </thead>
    <tbody>{summary_body}
    </tbody>
  </table>

  <table class="detail-table">
    <thead>
      <tr>
        <th>№<br/>п/п</th>
        <th>Воинское<br/>звание</th>
        <th>Фамилия, имя, отчество</th>
        <th>Подразделение</th>
        <th>Причина отсутствия</th>
        <th>Время<br/>отсутствия</th>
      </tr>
    </thead>
    <tbody>{absence_body}
    </tbody>
  </table>
  {duty_footer}
</body>
</html>"""


async def _academy_unit_ids(session: AsyncSession) -> list[int]:
    fac_result = await session.execute(
        select(Unit)
        .where(Unit.type == UnitType.FACULTY, Unit.is_active.is_(True))
        .order_by(Unit.id)
    )
    faculties = list(fac_result.scalars().all())
    unit_ids: list[int] = []
    for fac in faculties:
        courses = await get_courses_for_faculty(session, fac.id)
        unit_ids.extend(c.id for c in courses)
        unit_ids.append(fac.id)
    return unit_ids


async def build_stroevka_print(
    session: AsyncSession,
    scope: str,
    unit_id: int | None,
    report_date: date,
    *,
    category_code: str | None = None,
    composition: str = "all",
    department_code: str | None = None,
) -> str:
    if category_code:
        try:
            category = _normalize_code(AbsenceCategoryCode(category_code))
        except ValueError as e:
            raise ValueError(f"Неизвестная причина отсутствия: {category_code}") from e
        category_label = CATEGORY_LABELS.get(category.value, category.value)

        if scope == "academy":
            unit_ids = await _academy_unit_ids(session)
            all_absences = await _absences_for_units(session, unit_ids, report_date)
            filtered = _filter_absences_by_category(all_absences, category)
            summary_counts = _category_summary_from_absences(filtered)
            subtitle = _subtitle_academy(report_date)
            dpa_footer = await _duty_sign_footer(
                session,
                report_date,
                LOCATION_ACADEMY,
                DutyPostType.DPA,
                "Дежурный по академии",
            )
            return _build_category_html(
                subtitle, category_label, summary_counts, filtered, duty_footer=dpa_footer
            )

        unit = await session.get(Unit, unit_id)
        if not unit:
            raise ValueError("Подразделение не найдено")

        if scope == "faculty":
            courses = await get_courses_for_faculty(session, unit_id)
            unit_ids = [c.id for c in courses] + [unit_id]
            subtitle = _subtitle_for_unit(unit, report_date)
            duty_footer = await _duty_sign_footer(
                session,
                report_date,
                unit_id,
                DutyPostType.DPF,
                f"Дежурный по {unit_id} факультету",
            )
        elif scope == "location":
            courses = await get_courses_for_location(session, unit_id)
            unit_ids = [c.id for c in courses]
            subtitle = _subtitle_for_unit(unit, report_date)
            duty_footer = ""
        else:
            raise ValueError("Для отчёта по причине укажите scope academy, faculty или location")

        all_absences = await _absences_for_units(session, unit_ids, report_date)
        filtered = _filter_absences_by_category(all_absences, category)
        summary_counts = _category_summary_from_absences(filtered)
        return _build_category_html(
            subtitle, category_label, summary_counts, filtered, duty_footer=duty_footer
        )

    if scope == "academy":
        fac_result = await session.execute(
            select(Unit)
            .where(Unit.type == UnitType.FACULTY, Unit.is_active.is_(True))
            .order_by(Unit.id)
        )
        faculties = list(fac_result.scalars().all())
        summary_rows: list[tuple[str, AttendanceAggregate]] = []
        unit_ids = await _academy_unit_ids(session)
        for fac in faculties:
            courses = await get_courses_for_faculty(session, fac.id)
            fac_rows = await _summary_rows_for_units(
                session, courses, report_date, include_officers=fac
            )
            summary_rows.extend(fac_rows)
        absences = await _absences_for_units(session, unit_ids, report_date)
        dpa_footer = await _duty_sign_footer(
            session,
            report_date,
            LOCATION_ACADEMY,
            DutyPostType.DPA,
            "Дежурный по академии",
        )
        return _build_html(
            _subtitle_academy(report_date),
            summary_rows,
            absences,
            duty_footer=dpa_footer,
        )

    unit = await session.get(Unit, unit_id)
    if not unit:
        raise ValueError("Подразделение не найдено")

    if scope == "unit":
        agg = await compute_aggregate_for_unit(session, unit_id, report_date)
        summary_rows = [(unit.name, agg)]
        absences = await _absences_for_units(session, [unit_id], report_date)
        dpk_footer = await _duty_sign_footer(
            session,
            report_date,
            unit_id,
            DutyPostType.DPK,
            f"Дежурный по {unit_id} курсу",
        )
        return _build_html(
            _subtitle_for_unit(unit, report_date),
            summary_rows,
            absences,
            duty_footer=dpk_footer,
        )

    if scope == "faculty":
        dpf_footer = await _duty_sign_footer(
            session,
            report_date,
            unit_id,
            DutyPostType.DPF,
            f"Дежурный по {unit_id} факультету",
        )

        normalized_dept = normalize_department_code(department_code)
        if normalized_dept:
            snap = await get_attendance_snapshot(
                session, unit_id, report_date, editable=False
            )
            dept = next(
                (d for d in (snap.departments or []) if d.code == normalized_dept),
                None,
            )
            if not dept:
                raise ValueError(
                    f"Кафедра {department_display_name(normalized_dept)} "
                    "не найдена в списке офицеров"
                )
            summary_rows = [(dept.name, dept.aggregate)]
            absences = [(snap.unit_name, entry) for entry in dept.absences]
            subtitle = _subtitle_for_department(dept.name, unit, report_date)
            return _build_html(subtitle, summary_rows, absences, duty_footer=dpf_footer)

        if composition == "variable":
            courses = await get_courses_for_faculty(session, unit_id)
            summary_rows = await _summary_rows_for_units(session, courses, report_date)
            unit_ids = [c.id for c in courses]
        elif composition == "permanent":
            officers_name = f"Офицеры ({unit.name})"
            agg = await compute_aggregate_for_unit(session, unit_id, report_date)
            summary_rows = [(officers_name, agg)]
            unit_ids = [unit_id]
        else:
            courses = await get_courses_for_faculty(session, unit_id)
            summary_rows = await _summary_rows_for_units(
                session, courses, report_date, include_officers=unit
            )
            unit_ids = [c.id for c in courses] + [unit_id]

        absences = await _absences_for_units(session, unit_ids, report_date)
        return _build_html(
            _subtitle_for_unit(unit, report_date),
            summary_rows,
            absences,
            duty_footer=dpf_footer,
        )

    if scope == "location":
        courses = await get_courses_for_location(session, unit_id)
        summary_rows = await _summary_rows_for_units(session, courses, report_date)
        unit_ids = [c.id for c in courses]
        absences = await _absences_for_units(session, unit_ids, report_date)
        return _build_html(_subtitle_for_unit(unit, report_date), summary_rows, absences)

    raise ValueError(f"Неизвестный scope: {scope}")

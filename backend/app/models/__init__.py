from datetime import date, datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import (
    AbsenceCategoryCode,
    Composition,
    DutyPostType,
    ReportStatus,
    UnitType,
    UserRole,
)
from app.db.base import Base

if TYPE_CHECKING:
    pass


class Unit(Base):
    __tablename__ = "units"

    id: Mapped[int] = mapped_column(primary_key=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("units.id"), nullable=True)
    type: Mapped[UnitType] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(default=True)

    parent: Mapped[Optional["Unit"]] = relationship(
        "Unit", remote_side="Unit.id", back_populates="children"
    )
    children: Mapped[list["Unit"]] = relationship("Unit", back_populates="parent")
    people: Mapped[list["Person"]] = relationship("Person", back_populates="unit")
    duty_posts: Mapped[list["DutyPost"]] = relationship("DutyPost", back_populates="unit")


class Person(Base):
    __tablename__ = "people"

    id: Mapped[int] = mapped_column(primary_key=True)
    unit_id: Mapped[int] = mapped_column(ForeignKey("units.id"))
    rank: Mapped[str] = mapped_column(String(64))
    last_name: Mapped[str] = mapped_column(String(128))
    first_name: Mapped[str] = mapped_column(String(128))
    middle_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    composition: Mapped[Composition] = mapped_column(String(32))
    position: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)

    unit: Mapped["Unit"] = relationship("Unit", back_populates="people")
    day_statuses: Mapped[list["PersonDayStatus"]] = relationship(
        "PersonDayStatus", back_populates="person"
    )

    @property
    def full_name(self) -> str:
        parts = [self.last_name, self.first_name]
        if self.middle_name:
            parts.append(self.middle_name)
        return " ".join(parts)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(String(32))
    unit_id: Mapped[int | None] = mapped_column(ForeignKey("units.id"), nullable=True)
    full_name: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(default=True)

    unit: Mapped[Optional["Unit"]] = relationship("Unit")


class DutyPost(Base):
    __tablename__ = "duty_posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    unit_id: Mapped[int] = mapped_column(ForeignKey("units.id"))
    post_type: Mapped[DutyPostType] = mapped_column(String(16))
    name: Mapped[str] = mapped_column(String(255))
    login_name: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    key_hash: Mapped[str] = mapped_column(String(255))
    key_rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    credentials_version: Mapped[int] = mapped_column(default=0)
    is_active: Mapped[bool] = mapped_column(default=True)

    unit: Mapped["Unit"] = relationship("Unit", back_populates="duty_posts")


class AbsenceCategory(Base):
    __tablename__ = "absence_categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[AbsenceCategoryCode] = mapped_column(String(32), unique=True)
    label: Mapped[str] = mapped_column(String(128))
    sort_order: Mapped[int] = mapped_column(default=0)

    reasons: Mapped[list["AbsenceReason"]] = relationship(
        "AbsenceReason", back_populates="category"
    )


class AbsenceReason(Base):
    __tablename__ = "absence_reasons"

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("absence_categories.id"))
    name: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(default=True)

    category: Mapped["AbsenceCategory"] = relationship(
        "AbsenceCategory", back_populates="reasons"
    )


class PersonDayStatus(Base):
    __tablename__ = "person_day_status"
    __table_args__ = (UniqueConstraint("person_id", "status_date", name="uq_person_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    person_id: Mapped[int] = mapped_column(ForeignKey("people.id"))
    status_date: Mapped[date] = mapped_column(Date)
    reason_id: Mapped[int | None] = mapped_column(
        ForeignKey("absence_reasons.id"), nullable=True
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    person: Mapped["Person"] = relationship("Person", back_populates="day_statuses")
    reason: Mapped[Optional["AbsenceReason"]] = relationship("AbsenceReason")


class UnitStrength(Base):
    """Численность «по списку» для курса или факультета (офицеры). Помнится между днями."""

    __tablename__ = "unit_strength"

    unit_id: Mapped[int] = mapped_column(ForeignKey("units.id"), primary_key=True)
    total_list: Mapped[int] = mapped_column(default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AbsenceEntry(Base):
    """Строка отсутствующего: категория + фамилия (без справочника людей)."""

    __tablename__ = "absence_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    unit_id: Mapped[int] = mapped_column(ForeignKey("units.id"), index=True)
    status_date: Mapped[date] = mapped_column(Date, index=True)
    category_code: Mapped[AbsenceCategoryCode] = mapped_column(String(32))
    rank: Mapped[str] = mapped_column(String(64), default="")
    last_name: Mapped[str] = mapped_column(String(128))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class CourseReport(Base):
    __tablename__ = "course_reports"
    __table_args__ = (UniqueConstraint("course_id", "report_date", name="uq_course_report_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("units.id"))
    report_date: Mapped[date] = mapped_column(Date)
    status: Mapped[ReportStatus] = mapped_column(String(32), default=ReportStatus.DRAFT)
    reject_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Алерты после правок ДПК в течение дня
    changes_pending_dpf: Mapped[bool] = mapped_column(default=False)
    changes_pending_dpa: Mapped[bool] = mapped_column(default=False)
    is_editing: Mapped[bool] = mapped_column(default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class OfficerReport(Base):
    __tablename__ = "officer_reports"
    __table_args__ = (UniqueConstraint("faculty_id", "report_date", name="uq_officer_report_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    faculty_id: Mapped[int] = mapped_column(ForeignKey("units.id"))
    report_date: Mapped[date] = mapped_column(Date)
    status: Mapped[ReportStatus] = mapped_column(String(32), default=ReportStatus.DRAFT)
    reject_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class FacultyReport(Base):
    __tablename__ = "faculty_reports"
    __table_args__ = (UniqueConstraint("faculty_id", "report_date", name="uq_faculty_report_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    faculty_id: Mapped[int] = mapped_column(ForeignKey("units.id"))
    report_date: Mapped[date] = mapped_column(Date)
    status: Mapped[ReportStatus] = mapped_column(String(32), default=ReportStatus.DRAFT)
    reject_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_editing: Mapped[bool] = mapped_column(default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    sender_kind: Mapped[str] = mapped_column(String(32))
    sender_id: Mapped[int] = mapped_column()
    sender_name: Mapped[str] = mapped_column(String(255))
    recipient_kind: Mapped[str] = mapped_column(String(32))
    recipient_id: Mapped[int] = mapped_column()
    faculty_id: Mapped[int | None] = mapped_column(ForeignKey("units.id"), nullable=True)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_kind: Mapped[str] = mapped_column(String(32))
    actor_id: Mapped[int] = mapped_column()
    actor_name: Mapped[str] = mapped_column(String(255))
    action: Mapped[str] = mapped_column(String(128))
    entity_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    entity_id: Mapped[int | None] = mapped_column(nullable=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class DutyContact(Base):
    __tablename__ = "duty_contacts"
    __table_args__ = (UniqueConstraint("contact_date", "unit_id", name="uq_duty_contact"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    contact_date: Mapped[date] = mapped_column(Date)
    unit_id: Mapped[int] = mapped_column(ForeignKey("units.id"))
    duty_post_id: Mapped[int | None] = mapped_column(
        ForeignKey("duty_posts.id"), nullable=True
    )
    rank: Mapped[str | None] = mapped_column(String(64), nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    post_name: Mapped[str] = mapped_column(String(255))
    phone: Mapped[str] = mapped_column(String(64))
    room: Mapped[str | None] = mapped_column(String(64), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies import get_current_user, require_shell
from app.schemas import AuthUser, HospitalCreate, HospitalRead, HospitalUpdate
from app.services.attendance import ensure_schema_patches
from app.services.hospitals import create_hospital, list_hospitals, update_hospital

router = APIRouter(prefix="/hospitals", tags=["hospitals"])


@router.get("", response_model=list[HospitalRead])
async def get_hospitals(
    active_only: bool = Query(False),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    await ensure_schema_patches(session)
    only_active = active_only or user.shell != "admin"
    return await list_hospitals(session, active_only=only_active)


@router.post("", response_model=HospitalRead)
async def post_hospital(
    body: HospitalCreate,
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_shell("admin")),
):
    await ensure_schema_patches(session)
    try:
        return await create_hospital(session, body)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.patch("/{hospital_id}", response_model=HospitalRead)
async def patch_hospital(
    hospital_id: int,
    body: HospitalUpdate,
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_shell("admin")),
):
    await ensure_schema_patches(session)
    try:
        return await update_hospital(session, hospital_id, body)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

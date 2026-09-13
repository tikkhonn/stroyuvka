from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies import get_current_user, require_shell
from app.schemas import AuthUser, LandlinePhoneCreate, LandlinePhoneRead, LandlinePhoneUpdate
from app.services.attendance import ensure_schema_patches
from app.services.landline_phones import (
    assert_can_use_phones_page,
    create_landline_phone,
    list_landline_phones,
    update_landline_phone,
)

router = APIRouter(tags=["phones"])


@router.get("/landline-phones", response_model=list[LandlinePhoneRead])
async def get_landline_phones(
    active_only: bool = Query(False),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    await ensure_schema_patches(session)
    assert_can_use_phones_page(user)
    if user.shell != "admin":
        only_active = True
    else:
        only_active = active_only
    return await list_landline_phones(session, active_only=only_active)


@router.post("/landline-phones", response_model=LandlinePhoneRead)
async def post_landline_phone(
    body: LandlinePhoneCreate,
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_shell("admin")),
):
    await ensure_schema_patches(session)
    try:
        return await create_landline_phone(session, body)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.patch("/landline-phones/{phone_id}", response_model=LandlinePhoneRead)
async def patch_landline_phone(
    phone_id: int,
    body: LandlinePhoneUpdate,
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_shell("admin")),
):
    await ensure_schema_patches(session)
    try:
        return await update_landline_phone(session, phone_id, body)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

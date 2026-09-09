from fastapi import APIRouter, Depends

from app.dependencies import get_current_user
from app.schemas import AuthUser, LandlinePhone
from app.services.landline_phones import assert_can_use_phones_page, load_landline_phones

router = APIRouter(tags=["phones"])


@router.get("/landline-phones", response_model=list[LandlinePhone])
async def list_landline_phones(user: AuthUser = Depends(get_current_user)):
    assert_can_use_phones_page(user)
    return load_landline_phones()

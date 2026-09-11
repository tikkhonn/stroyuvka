from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.api.routers import (
    attendance,
    audit,
    auth,
    chat,
    documentation,
    duty_posts,
    hospitals,
    landline_phones,
    print as print_router,
    reports,
    units,
    users,
)
from app.core.config import settings
from app.core.enums import AuthKind
from app.core.security import decode_access_token
from app.db.session import init_db
from app.schemas import AuthUser
from app.seed.run import ensure_chief_user, seed_if_empty
from app.services.chat_access import ws_rooms_for_duty_user
from app.ws.manager import ws_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    if settings.seed_demo_data:
        await seed_if_empty()
    await ensure_chief_user()
    from app.db.session import async_session_factory
    from app.services.attendance import ensure_schema_patches
    from app.services.duty_auth import ensure_duty_post_schema
    from app.services.duty_contacts import ensure_duty_contact_schema

    from app.services.chat_attachments import ensure_chat_attachment_schema

    async with async_session_factory() as session:
        await ensure_schema_patches(session)
        await ensure_duty_post_schema(session)
        await ensure_duty_contact_schema(session)
        await ensure_chat_attachment_schema(session)
        await session.commit()
    yield


app = FastAPI(
    title="ПУЛЬС",
    description="Система учёта расхода личного состава ВКА",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(units.router, prefix="/api")
app.include_router(attendance.router, prefix="/api")
app.include_router(hospitals.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(documentation.router, prefix="/api")
app.include_router(landline_phones.router, prefix="/api")
app.include_router(duty_posts.router, prefix="/api")
app.include_router(audit.router, prefix="/api")
app.include_router(print_router.router, prefix="/api")
app.include_router(users.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "puls"}


def _rooms_for_token(payload: dict) -> list[str]:
    auth_kind = payload.get("auth_kind")
    if auth_kind == AuthKind.DUTY_POST.value:
        user = AuthUser(
            auth_kind=AuthKind.DUTY_POST.value,
            role=payload.get("post_type", ""),
            shell="naryad",
            duty_post_id=payload.get("duty_post_id"),
            unit_id=payload.get("unit_id"),
            display_name="",
            post_type=payload.get("post_type"),
        )
        return ws_rooms_for_duty_user(user)
    return []


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str | None = None):
    if not token:
        await websocket.close(code=4401)
        return
    payload = decode_access_token(token)
    if not payload:
        await websocket.close(code=4401)
        return

    rooms = _rooms_for_token(payload)
    await ws_manager.connect_many(rooms, websocket)

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect_all(rooms, websocket)

import json
from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.active: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect_many(self, rooms: list[str], websocket: WebSocket) -> None:
        await websocket.accept()
        for room in rooms:
            self.active[room].add(websocket)

    def disconnect(self, room: str, websocket: WebSocket) -> None:
        self.active[room].discard(websocket)

    def disconnect_all(self, rooms: list[str], websocket: WebSocket) -> None:
        for room in rooms:
            self.disconnect(room, websocket)

    async def send_to_room(self, room: str, event_type: str, payload: dict) -> None:
        message = json.dumps({"type": event_type, "payload": payload}, default=str)
        dead: list[WebSocket] = []
        for ws in list(self.active.get(room, set())):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(room, ws)

    async def broadcast_event(self, rooms: list[str], event_type: str, payload: dict) -> None:
        for room in rooms:
            await self.send_to_room(room, event_type, payload)


ws_manager = ConnectionManager()

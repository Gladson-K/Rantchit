from typing import Dict, Set, Optional
from fastapi import WebSocket
import asyncio
import logging

logger = logging.getLogger("rantchit.ws")

class ConnectionManager:
    def __init__(self):
        # room_id -> set of active WebSocket connections
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self.room_locks: Dict[str, asyncio.Lock] = {}

    def _get_lock(self, room_id: str) -> asyncio.Lock:
        if room_id not in self.room_locks:
            self.room_locks[room_id] = asyncio.Lock()
        return self.room_locks[room_id]

    async def connect(self, room_id: str, websocket: WebSocket):
        lock = self._get_lock(room_id)
        async with lock:
            if room_id not in self.active_connections:
                self.active_connections[room_id] = set()
            self.active_connections[room_id].add(websocket)
            count = len(self.active_connections[room_id])
            logger.info(f"WebSocket joined room {room_id}. Current participants: {count}")

    async def disconnect(self, room_id: str, websocket: WebSocket):
        lock = self._get_lock(room_id)
        async with lock:
            if room_id in self.active_connections:
                self.active_connections[room_id].discard(websocket)
                count = len(self.active_connections[room_id])
                if count == 0:
                    del self.active_connections[room_id]
                    if room_id in self.room_locks:
                        del self.room_locks[room_id]
                logger.info(f"WebSocket left room {room_id}. Remaining participants: {count}")

    async def send_personal(self, websocket: WebSocket, message: dict):
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.error(f"Error sending personal message: {e}")

    async def broadcast_to_room(self, room_id: str, message: dict, exclude: Optional[WebSocket] = None):
        if room_id in self.active_connections:
            targets = list(self.active_connections[room_id])
            for connection in targets:
                if connection != exclude:
                    try:
                        await connection.send_json(message)
                    except Exception as e:
                        logger.error(f"Error broadcasting to socket: {e}")
                        await self.disconnect(room_id, connection)

    async def close_room_connections(self, room_id: str, code: int = 1000, reason: str = "Room destroyed"):
        if room_id in self.active_connections:
            targets = list(self.active_connections[room_id])
            for connection in targets:
                try:
                    await connection.send_json({"type": "room_destroyed", "reason": reason})
                    await connection.close(code=code, reason=reason)
                except Exception as e:
                    logger.error(f"Error closing socket during room destruction: {e}")
            if room_id in self.active_connections:
                del self.active_connections[room_id]
            if room_id in self.room_locks:
                del self.room_locks[room_id]

    def get_participant_count(self, room_id: str) -> int:
        return len(self.active_connections.get(room_id, set()))

manager = ConnectionManager()
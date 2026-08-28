from typing import Dict, Set
from fastapi import WebSocket
import asyncio
import json
import logging

logger = logging.getLogger("veilchat.ws")

class ConnectionManager:
    def __init__(self):
        # room_id -> set of websocket connections
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self.room_locks: Dict[str, asyncio.Lock] = {}

    async def connect(self, room_id: str, websocket: WebSocket):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = set()
            self.room_locks[room_id] = asyncio.Lock()
        self.active_connections[room_id].add(websocket)
        logger.info(f"WebSocket connected to room {room_id}, total: {len(self.active_connections[room_id])}")

    def disconnect(self, room_id: str, websocket: WebSocket):
        if room_id in self.active_connections:
            self.active_connections[room_id].discard(websocket)
            if len(self.active_connections[room_id]) == 0:
                del self.active_connections[room_id]
                if room_id in self.room_locks:
                    del self.room_locks[room_id]
            logger.info(f"WebSocket disconnected from room {room_id}")

    async def send_personal(self, websocket: WebSocket, message: dict):
        await websocket.send_json(message)

    async def broadcast_to_room(self, room_id: str, message: dict, exclude: WebSocket = None):
        if room_id in self.active_connections:
            for connection in list(self.active_connections[room_id]):
                if connection != exclude:
                    try:
                        await connection.send_json(message)
                    except Exception as e:
                        logger.error(f"Error sending to connection: {e}")
                        self.disconnect(room_id, connection)

manager = ConnectionManager()
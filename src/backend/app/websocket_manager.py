from dataclasses import dataclass
from typing import Dict, List, Optional
from fastapi import WebSocket
import asyncio
import logging
import secrets

logger = logging.getLogger("rantchit.ws")


@dataclass
class Connection:
    """Per-connection metadata. Contains NO message content or key material."""

    peer_id: str
    seq: int
    alias: str = "Anonymous"
    pubkey: Optional[str] = None


class ConnectionManager:
    def __init__(self):
        # room_id -> {websocket: Connection}
        self.active_connections: Dict[str, Dict[WebSocket, Connection]] = {}
        self.room_locks: Dict[str, asyncio.Lock] = {}
        self._seq: Dict[str, int] = {}

    def _get_lock(self, room_id: str) -> asyncio.Lock:
        if room_id not in self.room_locks:
            self.room_locks[room_id] = asyncio.Lock()
        return self.room_locks[room_id]

    async def connect(self, room_id: str, websocket: WebSocket) -> Connection:
        lock = self._get_lock(room_id)
        async with lock:
            conns = self.active_connections.setdefault(room_id, {})
            seq = self._seq.get(room_id, 0) + 1
            self._seq[room_id] = seq
            peer_id = f"p_{secrets.token_hex(4)}"
            while any(c.peer_id == peer_id for c in conns.values()):
                peer_id = f"p_{secrets.token_hex(4)}"
            conn = Connection(peer_id=peer_id, seq=seq)
            conns[websocket] = conn
            logger.info(f"WebSocket joined room {room_id} as {peer_id}. Participants: {len(conns)}")
            return conn

    async def disconnect(self, room_id: str, websocket: WebSocket):
        lock = self._get_lock(room_id)
        async with lock:
            conns = self.active_connections.get(room_id)
            if conns is not None:
                conns.pop(websocket, None)
                count = len(conns)
                if count == 0:
                    self.active_connections.pop(room_id, None)
                    self.room_locks.pop(room_id, None)
                    self._seq.pop(room_id, None)
                logger.info(f"WebSocket left room {room_id}. Remaining participants: {count}")

    def get_connection(self, room_id: str, websocket: WebSocket) -> Optional[Connection]:
        return self.active_connections.get(room_id, {}).get(websocket)

    def get_connection_by_peer(self, room_id: str, peer_id: str) -> Optional[WebSocket]:
        for ws, conn in self.active_connections.get(room_id, {}).items():
            if conn.peer_id == peer_id:
                return ws
        return None

    def set_alias(self, room_id: str, websocket: WebSocket, alias: str) -> Optional[Connection]:
        conn = self.get_connection(room_id, websocket)
        if conn is not None:
            conn.alias = alias
        return conn

    def set_pubkey(self, room_id: str, websocket: WebSocket, pubkey: str):
        conn = self.get_connection(room_id, websocket)
        if conn is not None:
            conn.pubkey = pubkey

    def get_peer_list(self, room_id: str) -> List[dict]:
        conns = self.active_connections.get(room_id, {})
        host_seq = min((c.seq for c in conns.values()), default=None)
        return [
            {
                "peer_id": c.peer_id,
                "alias": c.alias,
                "is_host": c.seq == host_seq,
                "has_key": c.pubkey is not None,
            }
            for c in sorted(conns.values(), key=lambda x: x.seq)
        ]

    def get_peer_pubkeys(self, room_id: str, exclude: WebSocket) -> List[dict]:
        conns = self.active_connections.get(room_id, {})
        return [
            {"peer_id": c.peer_id, "public_key": c.pubkey}
            for ws, c in conns.items()
            if ws != exclude and c.pubkey
        ]

    async def send_personal(self, websocket: WebSocket, message: dict):
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.error(f"Error sending personal message: {e}")

    async def send_to_peer(self, room_id: str, peer_id: str, message: dict) -> bool:
        target = self.get_connection_by_peer(room_id, peer_id)
        if target is None:
            return False
        await self.send_personal(target, message)
        return True

    async def broadcast_to_room(self, room_id: str, message: dict, exclude: Optional[WebSocket] = None):
        conns = self.active_connections.get(room_id)
        if conns:
            for connection in list(conns.keys()):
                if connection != exclude:
                    try:
                        await connection.send_json(message)
                    except Exception as e:
                        logger.error(f"Error broadcasting to socket: {e}")
                        await self.disconnect(room_id, connection)

    async def close_room_connections(self, room_id: str, code: int = 1000, reason: str = "Room destroyed"):
        conns = self.active_connections.get(room_id)
        if conns:
            for connection in list(conns.keys()):
                try:
                    await connection.send_json({"type": "room_destroyed", "reason": reason})
                    await connection.close(code=code, reason=reason)
                except Exception as e:
                    logger.error(f"Error closing socket during room destruction: {e}")
            self.active_connections.pop(room_id, None)
            self.room_locks.pop(room_id, None)
            self._seq.pop(room_id, None)

    def get_participant_count(self, room_id: str) -> int:
        return len(self.active_connections.get(room_id, {}))


manager = ConnectionManager()

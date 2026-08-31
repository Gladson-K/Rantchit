import pytest
from app.websocket_manager import ConnectionManager

@pytest.mark.asyncio
async def test_connection_manager():
    mgr = ConnectionManager()
    assert mgr.get_participant_count("room-123") == 0

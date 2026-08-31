"""create rooms table

Revision ID: 001
Revises: 
Create Date: 2026-08-31 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.create_table(
        'rooms',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('secret_hash', sa.String(length=64), nullable=False),
        sa.Column('status', sa.String(length=16), server_default='active', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('destroyed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('max_participants', sa.SmallInteger(), server_default='2', nullable=False),
        sa.Column('participant_count', sa.SmallInteger(), server_default='0', nullable=False),
        sa.Column('ip_hash', sa.String(length=64), nullable=False)
    )
    op.create_index('ix_rooms_secret_hash', 'rooms', ['secret_hash'])
    op.create_index('ix_rooms_status', 'rooms', ['status'])

def downgrade() -> None:
    op.drop_index('ix_rooms_status', table_name='rooms')
    op.drop_index('ix_rooms_secret_hash', table_name='rooms')
    op.drop_table('rooms')

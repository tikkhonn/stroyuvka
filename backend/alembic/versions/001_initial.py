"""Initial schema

Revision ID: 001
"""
from typing import Sequence, Union

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass  # Tables created via init_db / seed for demo


def downgrade() -> None:
    pass

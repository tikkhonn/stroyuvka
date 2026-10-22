"""Add people.is_adjunct

Revision ID: 002
Revises: 001
"""

from typing import Sequence, Union

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass  # Column added via ensure_schema_patches on existing deployments


def downgrade() -> None:
    pass

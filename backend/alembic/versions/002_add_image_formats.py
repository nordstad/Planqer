"""Add SVG and PNG image fields to user projects

Revision ID: 002_add_image_formats
Revises: 001
Create Date: 2026-08-23 00:00:01.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '002_add_image_formats'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('user_projects', sa.Column('cutlist_image_svg', sa.Text(), nullable=True))
    op.add_column('user_projects', sa.Column('cutlist_image_png', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('user_projects', 'cutlist_image_png')
    op.drop_column('user_projects', 'cutlist_image_svg')

"""Add preferred language to user settings

Revision ID: 009_add_preferred_language
Revises: 008_add_tile_projects
Create Date: 2026-09-20 00:00:00.000000

"""

import sqlalchemy as sa

from alembic import op


revision = "009_add_preferred_language"
down_revision = "008_add_tile_projects"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("user_settings") as batch_op:
        batch_op.add_column(sa.Column("preferred_language", sa.String(), nullable=True))


def downgrade():
    with op.batch_alter_table("user_settings") as batch_op:
        batch_op.drop_column("preferred_language")

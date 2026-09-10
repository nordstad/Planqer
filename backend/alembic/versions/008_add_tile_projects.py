"""Add tile projects table

Revision ID: 008_add_tile_projects
Revises: 007_add_default_currency
Create Date: 2026-09-09 00:00:00.000000

"""

import sqlalchemy as sa

from alembic import op

# revision identifiers
revision = "008_add_tile_projects"
down_revision = "007_add_default_currency"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "user_tile_projects",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("project_group_id", sa.Uuid(), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("surface_data", sa.String(), nullable=False),
        sa.Column("tile_data", sa.String(), nullable=False),
        sa.Column("bond_data", sa.String(), nullable=False),
        sa.Column("options_data", sa.String(), nullable=False, server_default="{}"),
        sa.Column("layout_result", sa.String(), nullable=True),
        sa.Column("cutlist_image", sa.Text(), nullable=True),
        sa.Column("cutlist_image_svg", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(
            ["project_group_id"], ["project_groups.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade():
    op.drop_table("user_tile_projects")

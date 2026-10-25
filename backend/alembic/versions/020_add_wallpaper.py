"""Add saved wallpapers and wallpaper projects."""

import sqlalchemy as sa

from alembic import op

revision = "020_add_wallpaper"
down_revision = "019_user_catalogue_country"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_wallpapers",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(), nullable=False), sa.Column("data", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False), sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]), sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "user_wallpaper_projects",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("project_group_id", sa.Uuid(), nullable=True), sa.Column("name", sa.String(), nullable=False),
        sa.Column("wallpaper_data", sa.Text(), nullable=False), sa.Column("room_data", sa.Text(), nullable=False),
        sa.Column("options_data", sa.Text(), nullable=False, server_default="{}"), sa.Column("plan_result", sa.Text(), nullable=True),
        sa.Column("ordered_rolls", sa.Integer(), nullable=True), sa.Column("progress_data", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("cutlist_image", sa.Text(), nullable=True), sa.Column("cutlist_image_svg", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False), sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]), sa.ForeignKeyConstraint(["project_group_id"], ["project_groups.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("user_wallpaper_projects")
    op.drop_table("user_wallpapers")

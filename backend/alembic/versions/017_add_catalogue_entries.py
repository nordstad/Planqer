"""Add instance catalogue additions, overrides and hidden entries."""

import sqlalchemy as sa

from alembic import op

revision = "017_add_catalogue_entries"
down_revision = "016_add_spare_margin"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "catalogue_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("product_id", sa.String(), nullable=False),
        sa.Column("hidden", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("data", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_catalogue_entries_product_id",
        "catalogue_entries",
        ["product_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_catalogue_entries_product_id", table_name="catalogue_entries")
    op.drop_table("catalogue_entries")

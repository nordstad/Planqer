"""Store optional sheet and tile pricing snapshots."""

import sqlalchemy as sa

from alembic import op

revision = "014_add_sheet_tile_pricing"
down_revision = "013_add_vat_defaults"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("user_sheet_projects", "user_tile_projects"):
        with op.batch_alter_table(table) as batch_op:
            batch_op.add_column(sa.Column("pricing", sa.String(), nullable=True))


def downgrade() -> None:
    for table in ("user_tile_projects", "user_sheet_projects"):
        with op.batch_alter_table(table) as batch_op:
            batch_op.drop_column("pricing")

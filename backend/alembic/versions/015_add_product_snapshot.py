"""Store the product a board or sheet plan was made for."""

import sqlalchemy as sa

from alembic import op

revision = "015_add_product_snapshot"
down_revision = "014_add_sheet_tile_pricing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("user_projects", "user_sheet_projects"):
        with op.batch_alter_table(table) as batch_op:
            batch_op.add_column(sa.Column("product", sa.String(), nullable=True))


def downgrade() -> None:
    for table in ("user_sheet_projects", "user_projects"):
        with op.batch_alter_table(table) as batch_op:
            batch_op.drop_column("product")

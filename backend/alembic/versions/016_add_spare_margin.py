"""Add user and project spare-margin settings."""

import sqlalchemy as sa

from alembic import op

revision = "016_add_spare_margin"
down_revision = "015_add_product_snapshot"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("user_settings") as batch_op:
        batch_op.add_column(sa.Column("spare_margin_percent", sa.Float(), nullable=False, server_default="10"))
    with op.batch_alter_table("project_groups") as batch_op:
        batch_op.add_column(sa.Column("spare_margin_percent", sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("project_groups") as batch_op:
        batch_op.drop_column("spare_margin_percent")
    with op.batch_alter_table("user_settings") as batch_op:
        batch_op.drop_column("spare_margin_percent")

"""Add VAT defaults to user settings."""

import sqlalchemy as sa

from alembic import op

revision = "013_add_vat_defaults"
down_revision = "012_add_instance_bootstrap"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("user_settings") as batch_op:
        batch_op.add_column(
            sa.Column(
                "default_vat_rate", sa.Float(), nullable=False, server_default="25"
            )
        )
        batch_op.add_column(
            sa.Column(
                "default_prices_include_vat",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("user_settings") as batch_op:
        batch_op.drop_column("default_prices_include_vat")
        batch_op.drop_column("default_vat_rate")

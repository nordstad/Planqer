"""Add default currency to user settings

Revision ID: 007_add_default_currency
Revises: 006_add_board_costs
Create Date: 2026-08-24 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "007_add_default_currency"
down_revision = "006_add_board_costs"
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    columns = [
        column["name"] for column in sa.inspect(connection).get_columns("user_settings")
    ]

    if "default_currency" in columns:
        connection.execute(
            sa.text(
                "UPDATE user_settings SET default_currency = 'SEK' WHERE default_currency IS NULL"
            )
        )
        return

    with op.batch_alter_table("user_settings") as batch_op:
        batch_op.add_column(
            sa.Column(
                "default_currency", sa.String(), nullable=True, server_default="SEK"
            )
        )

    connection.execute(
        sa.text(
            "UPDATE user_settings SET default_currency = 'SEK' WHERE default_currency IS NULL"
        )
    )

    with op.batch_alter_table("user_settings") as batch_op:
        batch_op.alter_column("default_currency", nullable=False, server_default=None)


def downgrade():
    with op.batch_alter_table("user_settings") as batch_op:
        batch_op.drop_column("default_currency")

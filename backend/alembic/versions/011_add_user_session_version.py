"""Add per-user session versions for password-reset revocation."""

import sqlalchemy as sa

from alembic import op

revision = "011_add_user_session_version"
down_revision = "010_add_material_dimensions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column(
                "session_version", sa.Integer(), nullable=False, server_default="0"
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("session_version")

"""Add an atomic first-admin bootstrap claim."""

import sqlalchemy as sa

from alembic import op

revision = "012_add_instance_bootstrap"
down_revision = "011_add_user_session_version"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "instance_bootstrap",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("claimed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute(sa.text("INSERT INTO instance_bootstrap (id, claimed) VALUES (1, 0)"))


def downgrade() -> None:
    op.drop_table("instance_bootstrap")

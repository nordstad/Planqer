"""Add instance-wide settings, starting with the catalogue country."""

import sqlalchemy as sa

from alembic import op

revision = "018_add_instance_settings"
down_revision = "017_add_catalogue_entries"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "instance_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("catalogue_country", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute(sa.text("INSERT INTO instance_settings (id) VALUES (1)"))


def downgrade() -> None:
    op.drop_table("instance_settings")

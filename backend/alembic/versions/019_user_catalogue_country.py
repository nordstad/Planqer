"""Make the catalogue country a per-user setting instead of an instance one."""

import sqlalchemy as sa

from alembic import op

revision = "019_user_catalogue_country"
down_revision = "018_add_instance_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table("instance_settings")
    with op.batch_alter_table("user_settings") as batch_op:
        batch_op.add_column(
            sa.Column(
                "catalogue_country",
                sa.String(),
                nullable=False,
                server_default="auto",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("user_settings") as batch_op:
        batch_op.drop_column("catalogue_country")
    op.create_table(
        "instance_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("catalogue_country", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute(sa.text("INSERT INTO instance_settings (id) VALUES (1)"))

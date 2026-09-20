"""Store material and stock profile dimensions with saved plans."""

import sqlalchemy as sa

from alembic import op


revision = "010_add_material_dimensions"
down_revision = "009_add_preferred_language"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("user_projects") as batch_op:
        batch_op.add_column(sa.Column("material_type", sa.String(), nullable=False, server_default=""))
        batch_op.add_column(sa.Column("board_thickness", sa.Float(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("board_width", sa.Float(), nullable=False, server_default="0"))
    with op.batch_alter_table("user_sheet_projects") as batch_op:
        batch_op.add_column(sa.Column("sheet_thickness", sa.Float(), nullable=False, server_default="0"))


def downgrade():
    with op.batch_alter_table("user_sheet_projects") as batch_op:
        batch_op.drop_column("sheet_thickness")
    with op.batch_alter_table("user_projects") as batch_op:
        batch_op.drop_column("board_width")
        batch_op.drop_column("board_thickness")
        batch_op.drop_column("material_type")

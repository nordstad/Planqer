"""Store the stock prices a plan was costed with

A plan already carried its own stock lengths and kerf; the prices behind its
cost analysis were only ever kept as computed totals inside
optimization_result, so loading a plan back gave an empty pricing panel.
Suppliers and prices differ per job, so the prices belong to the plan.

Revision ID: 006_add_board_costs
Revises: 005_add_project_groups
Create Date: 2026-08-24 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '006_add_board_costs'
down_revision = '005_add_project_groups'
branch_labels = None
depends_on = None


def upgrade():
    # Nullable: every plan saved before this has no prices to record, and a
    # plan costed on waste alone never will.
    with op.batch_alter_table('user_projects') as batch_op:
        batch_op.add_column(sa.Column('board_costs', sa.String(), nullable=True))


def downgrade():
    with op.batch_alter_table('user_projects') as batch_op:
        batch_op.drop_column('board_costs')

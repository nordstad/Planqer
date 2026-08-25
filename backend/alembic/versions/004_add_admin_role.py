"""Add admin role to users

Revision ID: 004_add_admin_role
Revises: 003_add_sheet_projects
Create Date: 2026-08-23 00:00:03.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '004_add_admin_role'
down_revision = '003_add_sheet_projects'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('is_admin', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    op.drop_column('users', 'is_admin')

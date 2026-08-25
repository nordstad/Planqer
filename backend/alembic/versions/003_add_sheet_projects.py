"""Add sheet projects table

Revision ID: 003_add_sheet_projects
Revises: 002_add_image_formats
Create Date: 2026-08-23 00:00:02.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '003_add_sheet_projects'
down_revision = '002_add_image_formats'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('user_sheet_projects',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('parts_data', sa.String(), nullable=False),
        sa.Column('sheet_width', sa.Float(), nullable=False),
        sa.Column('sheet_height', sa.Float(), nullable=False),
        sa.Column('kerf_width', sa.Float(), nullable=False),
        sa.Column('material_type', sa.String(), nullable=False, server_default='plywood'),
        sa.Column('algorithm', sa.String(), nullable=True),
        sa.Column('allow_rotation', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('optimization_result', sa.String(), nullable=True),
        sa.Column('cutlist_image', sa.Text(), nullable=True),
        sa.Column('cutlist_image_svg', sa.Text(), nullable=True),
        sa.Column('cutlist_image_png', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade():
    op.drop_table('user_sheet_projects')

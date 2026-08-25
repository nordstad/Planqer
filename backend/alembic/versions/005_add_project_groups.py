"""Add project groups (containers for multiple cutlists)

Revision ID: 005_add_project_groups
Revises: 004_add_admin_role
Create Date: 2026-08-23 00:00:04.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '005_add_project_groups'
down_revision = '004_add_admin_role'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('project_groups',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    # SQLite can't ALTER TABLE ADD CONSTRAINT directly; batch mode recreates
    # the table under the hood there, and is a plain ALTER on other dialects.
    with op.batch_alter_table('user_projects') as batch_op:
        batch_op.add_column(sa.Column('project_group_id', sa.Uuid(), nullable=True))
        batch_op.create_foreign_key(
            'fk_user_projects_project_group_id', 'project_groups',
            ['project_group_id'], ['id'], ondelete='CASCADE',
        )
    with op.batch_alter_table('user_sheet_projects') as batch_op:
        batch_op.add_column(sa.Column('project_group_id', sa.Uuid(), nullable=True))
        batch_op.create_foreign_key(
            'fk_user_sheet_projects_project_group_id', 'project_groups',
            ['project_group_id'], ['id'], ondelete='CASCADE',
        )


def downgrade():
    with op.batch_alter_table('user_sheet_projects') as batch_op:
        batch_op.drop_constraint('fk_user_sheet_projects_project_group_id', type_='foreignkey')
        batch_op.drop_column('project_group_id')
    with op.batch_alter_table('user_projects') as batch_op:
        batch_op.drop_constraint('fk_user_projects_project_group_id', type_='foreignkey')
        batch_op.drop_column('project_group_id')
    op.drop_table('project_groups')

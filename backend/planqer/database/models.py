from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import Column, DateTime
from sqlmodel import Field, Relationship, SQLModel


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    email: str = Field(unique=True, index=True)
    hashed_password: str
    is_active: bool = Field(default=True)
    is_admin: bool = Field(default=False)
    created_at: Optional[datetime] = Field(
        default_factory=lambda: datetime.now(),
        sa_column=Column(DateTime(timezone=False), nullable=False),
    )
    updated_at: Optional[datetime] = Field(
        default_factory=lambda: datetime.now(),
        sa_column=Column(DateTime(timezone=False), nullable=False),
    )

    settings: "UserSettings" = Relationship(back_populates="user")


class UserSettings(SQLModel, table=True):
    __tablename__ = "user_settings"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.id", unique=True)

    default_board_lengths: str = Field(default="[3000, 3600, 5000]")
    default_saw_blade_width: float = Field(default=3.0)
    default_currency: str = Field(default="SEK")
    preferred_algorithm: str = Field(default="auto")
    preferred_units: str = Field(default="mm")

    created_at: Optional[datetime] = Field(
        default_factory=lambda: datetime.now(),
        sa_column=Column(DateTime(timezone=False), nullable=False),
    )
    updated_at: Optional[datetime] = Field(
        default_factory=lambda: datetime.now(),
        sa_column=Column(DateTime(timezone=False), nullable=False),
    )

    user: User = Relationship(back_populates="settings")


class ProjectGroup(SQLModel, table=True):
    """A named container holding the cutlists (board and/or sheet) a single
    real-world project needs — e.g. a chair's 45x45 rails and its plywood
    seat, run as separate cutlists but grouped under one project."""

    __tablename__ = "project_groups"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.id")

    name: str

    created_at: Optional[datetime] = Field(
        default_factory=lambda: datetime.now(),
        sa_column=Column(DateTime(timezone=False), nullable=False),
    )
    updated_at: Optional[datetime] = Field(
        default_factory=lambda: datetime.now(),
        sa_column=Column(DateTime(timezone=False), nullable=False),
    )


class UserProject(SQLModel, table=True):
    __tablename__ = "user_projects"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.id")
    project_group_id: Optional[UUID] = Field(
        default=None, foreign_key="project_groups.id"
    )

    name: str
    parts_data: str
    board_lengths: str
    saw_blade_width: float
    # The prices this plan was costed with, so loading it back restores the
    # pricing panel rather than asking for every figure again. JSON:
    # {"same_price_for_all": bool, "uniform_price": float|null,
    #  "optimize_for": "waste"|"cost", "board_costs": {length: {price_per_meter, price_per_board}}}
    # Null for a plan that was never priced.
    board_costs: str | None = None
    optimization_result: str | None = None
    cutlist_image: str | None = None  # Legacy base64 field, kept for compatibility
    cutlist_image_svg: str | None = None
    # ponytail: nothing writes or reads this any more — PNG is rasterized in
    # the browser. Left in place rather than migrated away because dropping a
    # column in SQLite is a table rebuild, and existing rows hold data (mostly
    # a duplicate of the SVG) that is the user's to delete, not ours. Drop it
    # with a migration if the row size ever matters.
    cutlist_image_png: str | None = None

    created_at: Optional[datetime] = Field(
        default_factory=lambda: datetime.now(),
        sa_column=Column(DateTime(timezone=False), nullable=False),
    )
    updated_at: Optional[datetime] = Field(
        default_factory=lambda: datetime.now(),
        sa_column=Column(DateTime(timezone=False), nullable=False),
    )


class UserSheetProject(SQLModel, table=True):
    __tablename__ = "user_sheet_projects"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.id")
    project_group_id: Optional[UUID] = Field(
        default=None, foreign_key="project_groups.id"
    )

    name: str
    parts_data: str  # JSON array of sheet parts: width, height, quantity, name, id
    sheet_width: float
    sheet_height: float
    kerf_width: float
    material_type: str = Field(default="plywood")
    algorithm: str | None = None
    allow_rotation: bool = Field(default=True)
    optimization_result: str | None = None
    cutlist_image: str | None = None
    cutlist_image_svg: str | None = None
    cutlist_image_png: str | None = None  # ponytail: unused, see UserProject

    created_at: Optional[datetime] = Field(
        default_factory=lambda: datetime.now(),
        sa_column=Column(DateTime(timezone=False), nullable=False),
    )
    updated_at: Optional[datetime] = Field(
        default_factory=lambda: datetime.now(),
        sa_column=Column(DateTime(timezone=False), nullable=False),
    )

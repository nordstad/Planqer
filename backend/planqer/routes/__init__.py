from .admin import router as admin_router
from .auth import router as auth_router
from .project_groups import router as project_groups_router
from .projects import router as projects_router
from .settings import router as settings_router
from .sheet_projects import router as sheet_projects_router
from .tile_projects import router as tile_projects_router

__all__ = [
    "admin_router",
    "auth_router",
    "project_groups_router",
    "projects_router",
    "settings_router",
    "sheet_projects_router",
    "tile_projects_router",
]

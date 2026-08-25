"""
Async Processing Module for Background Optimization Tasks

This module provides background task processing capabilities with real-time progress
updates via WebSocket connections. It allows complex optimizations to run without
blocking the main API while providing users with live progress feedback.
"""

import asyncio
from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import uuid4
from dataclasses import dataclass, asdict

from planqer.services import run_optimization
from planqer.algorithms import OptimizationAlgorithm, get_algorithm_recommendation


class TaskStatus(Enum):
    """Status of an async optimization task."""
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class TaskProgress:
    """Progress information for an optimization task."""
    task_id: str
    status: TaskStatus
    progress_percent: float
    current_step: str
    start_time: datetime
    end_time: datetime | None = None
    error_message: str | None = None
    result: dict[str, Any] | None = None
    algorithm_used: str | None = None
    computation_time: float | None = None


class AsyncTaskManager:
    """Manages background optimization tasks and their progress."""
    
    def __init__(self):
        self._tasks: dict[str, TaskProgress] = {}
        self._websocket_connections: dict[str, set] = {}
    
    def create_task(self, task_id: str) -> TaskProgress:
        """Create a new task with queued status."""
        task = TaskProgress(
            task_id=task_id,
            status=TaskStatus.QUEUED,
            progress_percent=0.0,
            current_step="Queued for processing",
            start_time=datetime.now(timezone.utc)
        )
        self._tasks[task_id] = task
        self._websocket_connections[task_id] = set()
        return task
    
    def get_task(self, task_id: str) -> TaskProgress | None:
        """Get task progress by ID."""
        return self._tasks.get(task_id)
    
    def update_task(self, task_id: str, **kwargs) -> TaskProgress | None:
        """Update task progress and notify WebSocket connections."""
        task = self._tasks.get(task_id)
        if not task:
            return None
        
        # Update task attributes
        for key, value in kwargs.items():
            if hasattr(task, key):
                setattr(task, key, value)
        
        # Notify WebSocket connections (only if event loop is running)
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self._notify_websockets(task_id, task))
        except RuntimeError:
            # No event loop running, skip WebSocket notifications
            pass
        
        return task
    
    async def _notify_websockets(self, task_id: str, task: TaskProgress):
        """Notify all WebSocket connections for this task."""
        connections = self._websocket_connections.get(task_id, set())
        if not connections:
            return
        
        task_data = asdict(task)
        # Convert datetime objects to ISO strings
        if task_data['start_time']:
            task_data['start_time'] = task.start_time.isoformat()
        if task_data['end_time']:
            task_data['end_time'] = task.end_time.isoformat()
        # Convert enum to string
        task_data['status'] = task.status.value
        
        # Send to all connected WebSockets (remove disconnected ones)
        disconnected = set()
        for websocket in connections.copy():
            try:
                await websocket.send_json(task_data)
            except Exception:
                disconnected.add(websocket)
        
        # Clean up disconnected WebSockets
        for websocket in disconnected:
            connections.discard(websocket)
    
    def add_websocket(self, task_id: str, websocket) -> bool:
        """Add a WebSocket connection for task updates."""
        if task_id not in self._websocket_connections:
            return False
        
        self._websocket_connections[task_id].add(websocket)
        return True
    
    def remove_websocket(self, task_id: str, websocket) -> None:
        """Remove a WebSocket connection."""
        if task_id in self._websocket_connections:
            self._websocket_connections[task_id].discard(websocket)
    
    def cleanup_task(self, task_id: str, max_age_hours: int = 24) -> None:
        """Clean up old completed tasks."""
        task = self._tasks.get(task_id)
        if not task or task.status in [TaskStatus.PROCESSING, TaskStatus.QUEUED]:
            return
        
        if task.end_time:
            age = datetime.now(timezone.utc) - task.end_time
            if age.total_seconds() > max_age_hours * 3600:
                self._tasks.pop(task_id, None)
                self._websocket_connections.pop(task_id, None)
    
    def get_all_tasks(self) -> dict[str, TaskProgress]:
        """Get all tasks (for debugging/monitoring)."""
        return self._tasks.copy()


# Global task manager instance
task_manager = AsyncTaskManager()


async def process_optimization_async(
    task_id: str,
    parts: dict[float, int],
    boards: list[float],
    kerf: float,
    project_name: str | None,
    algorithm: OptimizationAlgorithm | None,
    logger,
    planqer_response_class
):
    """
    Process optimization in background with progress updates.
    
    This function runs the optimization algorithm asynchronously and provides
    progress updates through the task manager.
    """
    task = task_manager.get_task(task_id)
    if not task:
        logger.error(f"Task {task_id} not found")
        return
    
    try:
        # Update status to processing
        task_manager.update_task(
            task_id,
            status=TaskStatus.PROCESSING,
            progress_percent=10.0,
            current_step="Initializing optimization"
        )
        
        # Small delay to allow WebSocket connections to establish
        await asyncio.sleep(0.1)
        
        # Determine algorithm if not specified
        if not algorithm:
            algorithm = get_algorithm_recommendation(parts)
            task_manager.update_task(
                task_id,
                progress_percent=20.0,
                current_step=f"Auto-selected algorithm: {algorithm.value}",
                algorithm_used=algorithm.value
            )
            logger.info(f"[{task_id}] Auto-selected algorithm: {algorithm.value}")
        else:
            task_manager.update_task(
                task_id,
                progress_percent=20.0,
                current_step=f"Using algorithm: {algorithm.value}",
                algorithm_used=algorithm.value
            )
        
        await asyncio.sleep(0.1)
        
        # Validate inputs
        task_manager.update_task(
            task_id,
            progress_percent=30.0,
            current_step="Validating inputs"
        )
        
        if not boards:
            raise ValueError("No board lengths provided")
        if not parts:
            raise ValueError("No parts provided")
        
        await asyncio.sleep(0.1)
        
        # Run optimization (this is the heavy computation)
        task_manager.update_task(
            task_id,
            progress_percent=40.0,
            current_step="Running optimization algorithm"
        )
        
        # Run optimization in a thread pool to avoid blocking the event loop
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            run_optimization,
            parts,
            boards,
            kerf,
            project_name,
            algorithm,
            logger,
            planqer_response_class
        )
        
        # Update progress after optimization
        task_manager.update_task(
            task_id,
            progress_percent=80.0,
            current_step="Optimization completed, preparing results"
        )
        
        await asyncio.sleep(0.1)
        
        # Convert result to dict for JSON serialization
        if hasattr(result, '__dict__'):
            result_dict = result.__dict__
        elif hasattr(result, 'dict'):
            result_dict = result.dict()
        else:
            # Convert pydantic model to dict
            result_dict = {
                "optimal_board_length": result.optimal_board_length,
                "cost": result.cost,
                "total_waste": result.total_waste,
                "cut_list": result.cut_list,
                "visualization": result.visualization,
                "algorithm_used": result.algorithm_used,
                "computation_time": result.computation_time,
            }
        
        # Task completed successfully
        task_manager.update_task(
            task_id,
            status=TaskStatus.COMPLETED,
            progress_percent=100.0,
            current_step="Completed successfully",
            end_time=datetime.now(timezone.utc),
            result=result_dict,
            computation_time=result_dict.get("computation_time")
        )
        
        logger.info(f"[{task_id}] Optimization completed successfully")
        
    except Exception as e:
        # Task failed
        error_msg = str(e)
        logger.error(f"[{task_id}] Optimization failed: {error_msg}")
        
        task_manager.update_task(
            task_id,
            status=TaskStatus.FAILED,
            progress_percent=0.0,
            current_step="Failed",
            end_time=datetime.now(timezone.utc),
            error_message=error_msg
        )


def generate_task_id() -> str:
    """Generate a unique task ID."""
    return str(uuid4())


def get_task_progress(task_id: str) -> dict[str, Any] | None:
    """Get task progress as a dictionary for JSON response."""
    task = task_manager.get_task(task_id)
    if not task:
        return None
    
    task_dict = asdict(task)
    # Convert datetime objects to ISO strings
    if task_dict['start_time']:
        task_dict['start_time'] = task.start_time.isoformat()
    if task_dict['end_time'] and task.end_time:
        task_dict['end_time'] = task.end_time.isoformat()
    # Convert enum to string
    task_dict['status'] = task.status.value
    
    return task_dict


def cleanup_old_tasks():
    """Clean up old completed tasks (can be called periodically)."""
    for task_id in list(task_manager._tasks.keys()):
        task_manager.cleanup_task(task_id)


# Periodic cleanup task
async def periodic_cleanup():
    """Periodic task to clean up old completed tasks."""
    while True:
        await asyncio.sleep(3600)  # Run every hour
        cleanup_old_tasks()


def start_periodic_cleanup():
    """Start the periodic cleanup task if an event loop is running."""
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(periodic_cleanup())
    except RuntimeError:
        # No event loop running, cleanup will need to be started manually later
        pass
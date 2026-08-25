"""
Tests for async processing functionality.
"""

import pytest
import asyncio
from unittest.mock import patch, MagicMock
from planqer.async_processing import (
    AsyncTaskManager,
    TaskStatus,
    TaskProgress,
    process_optimization_async,
    generate_task_id,
    get_task_progress,
    cleanup_old_tasks,
    task_manager
)
from planqer.algorithms import OptimizationAlgorithm
from datetime import datetime, timezone, timedelta


@pytest.fixture
def clean_task_manager():
    """Provide a clean task manager for each test."""
    # Clear the global task manager
    task_manager._tasks.clear()
    task_manager._websocket_connections.clear()
    return task_manager


def test_generate_task_id():
    """Test task ID generation."""
    task_id1 = generate_task_id()
    task_id2 = generate_task_id()
    
    assert task_id1 != task_id2
    assert len(task_id1) == 36  # UUID format
    assert len(task_id2) == 36


def test_task_manager_create_task(clean_task_manager):
    """Test task creation."""
    task_id = "test-task-123"
    task = clean_task_manager.create_task(task_id)
    
    assert task.task_id == task_id
    assert task.status == TaskStatus.QUEUED
    assert task.progress_percent == 0.0
    assert task.current_step == "Queued for processing"
    assert task.start_time is not None
    assert task.end_time is None
    assert task.error_message is None
    assert task.result is None


def test_task_manager_get_task(clean_task_manager):
    """Test task retrieval."""
    task_id = "test-task-456"
    
    # Task doesn't exist
    assert clean_task_manager.get_task(task_id) is None
    
    # Create and retrieve task
    task = clean_task_manager.create_task(task_id)
    retrieved_task = clean_task_manager.get_task(task_id)
    
    assert retrieved_task == task
    assert retrieved_task.task_id == task_id


def test_task_manager_update_task(clean_task_manager):
    """Test task updates."""
    task_id = "test-task-789"
    task = clean_task_manager.create_task(task_id)
    
    # Update task progress
    updated_task = clean_task_manager.update_task(
        task_id,
        status=TaskStatus.PROCESSING,
        progress_percent=50.0,
        current_step="Processing data"
    )
    
    assert updated_task.status == TaskStatus.PROCESSING
    assert updated_task.progress_percent == 50.0
    assert updated_task.current_step == "Processing data"
    
    # Update non-existent task
    result = clean_task_manager.update_task("non-existent", progress_percent=100.0)
    assert result is None


def test_task_progress_serialization(clean_task_manager):
    """Test task progress serialization to dict."""
    task_id = "test-task-serialization"
    task = clean_task_manager.create_task(task_id)
    
    # Update with some data
    clean_task_manager.update_task(
        task_id,
        status=TaskStatus.COMPLETED,
        progress_percent=100.0,
        current_step="Completed",
        end_time=datetime.now(timezone.utc),
        result={"optimal_board_length": 300.0, "cost": 5.0}
    )
    
    # Get serialized progress
    progress_dict = get_task_progress(task_id)
    
    assert progress_dict is not None
    assert progress_dict["task_id"] == task_id
    assert progress_dict["status"] == "completed"
    assert progress_dict["progress_percent"] == 100.0
    assert progress_dict["current_step"] == "Completed"
    assert "start_time" in progress_dict
    assert "end_time" in progress_dict
    assert progress_dict["result"]["optimal_board_length"] == 300.0


def test_cleanup_old_tasks(clean_task_manager):
    """Test cleanup of old completed tasks."""
    # Create some tasks
    task1_id = "old-completed-task"
    task2_id = "recent-completed-task"
    task3_id = "processing-task"
    
    # Old completed task (25 hours ago)
    old_time = datetime.now(timezone.utc) - timedelta(hours=25)
    task1 = clean_task_manager.create_task(task1_id)
    clean_task_manager.update_task(
        task1_id,
        status=TaskStatus.COMPLETED,
        end_time=old_time
    )
    
    # Recent completed task (1 hour ago)
    recent_time = datetime.now(timezone.utc) - timedelta(hours=1)
    task2 = clean_task_manager.create_task(task2_id)
    clean_task_manager.update_task(
        task2_id,
        status=TaskStatus.COMPLETED,
        end_time=recent_time
    )
    
    # Still processing task
    task3 = clean_task_manager.create_task(task3_id)
    clean_task_manager.update_task(
        task3_id,
        status=TaskStatus.PROCESSING
    )
    
    # Cleanup with default 24-hour retention
    cleanup_old_tasks()
    
    # Old task should be cleaned up
    assert clean_task_manager.get_task(task1_id) is None
    
    # Recent and processing tasks should remain
    assert clean_task_manager.get_task(task2_id) is not None
    assert clean_task_manager.get_task(task3_id) is not None


@pytest.mark.asyncio
async def test_process_optimization_async_success(clean_task_manager):
    """Test successful async optimization processing."""
    task_id = "async-test-success"
    parts = {100.0: 2, 50.0: 2}
    boards = [200.0]
    kerf = 0.3
    project_name = "Test Project"
    algorithm = OptimizationAlgorithm.FIRST_FIT_DECREASING
    
    # Mock logger and response class
    logger = MagicMock()
    
    # Mock response class (simple object that can be converted to dict)
    class MockResponse:
        def __init__(self):
            self.optimal_board_length = 200.0
            self.cost = 2.0
            self.total_waste = 100.0
            self.cut_list = [[100.0, 50.0], [100.0, 50.0]]
            self.visualization = "mock_base64_image"
            self.algorithm_used = "first_fit_decreasing"
            self.computation_time = 0.1
    
    mock_response = MockResponse()
    
    # Mock the run_optimization function
    with patch('planqer.async_processing.run_optimization', return_value=mock_response):
        # Create task
        clean_task_manager.create_task(task_id)
        
        # Process async
        await process_optimization_async(
            task_id, parts, boards, kerf, project_name, algorithm, logger, None
        )
        
        # Check final task status
        task = clean_task_manager.get_task(task_id)
        assert task.status == TaskStatus.COMPLETED
        assert task.progress_percent == 100.0
        assert task.current_step == "Completed successfully"
        assert task.result is not None
        assert task.result["optimal_board_length"] == 200.0
        assert task.end_time is not None


@pytest.mark.asyncio
async def test_process_optimization_async_failure(clean_task_manager):
    """Test async optimization processing with failure."""
    task_id = "async-test-failure"
    parts = {100.0: 2}
    boards = [200.0]
    kerf = 0.3
    project_name = "Test Project"
    algorithm = OptimizationAlgorithm.FIRST_FIT_DECREASING
    
    logger = MagicMock()
    
    # Mock the run_optimization function to raise an exception
    with patch('planqer.async_processing.run_optimization', side_effect=ValueError("Test error")):
        # Create task
        clean_task_manager.create_task(task_id)
        
        # Process async (should handle the exception)
        await process_optimization_async(
            task_id, parts, boards, kerf, project_name, algorithm, logger, None
        )
        
        # Check final task status
        task = clean_task_manager.get_task(task_id)
        assert task.status == TaskStatus.FAILED
        assert task.progress_percent == 0.0
        assert task.current_step == "Failed"
        assert task.error_message == "Test error"
        assert task.end_time is not None


def test_websocket_management(clean_task_manager):
    """Test WebSocket connection management."""
    task_id = "websocket-test"
    
    # Mock WebSocket
    mock_websocket1 = MagicMock()
    mock_websocket2 = MagicMock()
    
    # Create task
    clean_task_manager.create_task(task_id)
    
    # Add WebSocket connections
    result1 = clean_task_manager.add_websocket(task_id, mock_websocket1)
    result2 = clean_task_manager.add_websocket(task_id, mock_websocket2)
    assert result1 is True
    assert result2 is True
    
    # Try to add WebSocket to non-existent task
    result3 = clean_task_manager.add_websocket("non-existent", mock_websocket1)
    assert result3 is False
    
    # Check WebSocket connections exist
    connections = clean_task_manager._websocket_connections[task_id]
    assert len(connections) == 2
    assert mock_websocket1 in connections
    assert mock_websocket2 in connections
    
    # Remove WebSocket connection
    clean_task_manager.remove_websocket(task_id, mock_websocket1)
    connections = clean_task_manager._websocket_connections[task_id]
    assert len(connections) == 1
    assert mock_websocket1 not in connections
    assert mock_websocket2 in connections


@pytest.mark.asyncio
async def test_algorithm_auto_selection(clean_task_manager):
    """Test automatic algorithm selection in async processing."""
    task_id = "async-auto-algo"
    parts = {100.0: 2, 50.0: 2}  # Small problem -> should use branch_and_bound
    boards = [200.0]
    kerf = 0.3
    project_name = "Test Project"
    algorithm = None  # Auto-select
    
    logger = MagicMock()
    
    class MockResponse:
        def __init__(self):
            self.optimal_board_length = 200.0
            self.cost = 2.0
            self.total_waste = 100.0
            self.cut_list = [[100.0, 50.0], [100.0, 50.0]]
            self.visualization = "mock_base64_image"
            self.algorithm_used = "branch_bound"
            self.computation_time = 0.1
    
    mock_response = MockResponse()
    
    with patch('planqer.async_processing.run_optimization', return_value=mock_response):
        # Create task
        clean_task_manager.create_task(task_id)
        
        # Process async
        await process_optimization_async(
            task_id, parts, boards, kerf, project_name, algorithm, logger, None
        )
        
        # Check that algorithm was auto-selected
        task = clean_task_manager.get_task(task_id)
        assert task.status == TaskStatus.COMPLETED
        assert task.algorithm_used == "branch_bound"
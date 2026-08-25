"""
Tests for the Planqer MCP Server functionality.
"""

import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import httpx

from planqer_mcp_server.server import (
    handle_optimize_cutting,
    handle_optimize_demo,
    handle_get_demo_payloads,
    handle_get_example,
    format_optimization_result,
    DEMO_PAYLOADS,
)
import mcp.types as types


class TestFormatOptimizationResult:
    """Test the result formatting function."""
    
    def test_format_optimization_result_complete(self):
        """Test formatting with complete optimization result."""
        result = {
            "optimal_board_length": 300.0,
            "cost": 2.0,
            "total_waste": 50.0,
            "algorithm_used": "first_fit_decreasing",
            "computation_time": 0.123,
            "cut_list": [[100.0, 50.0], [75.0, 25.0]],
            "visualization": "base64encodedimage..."
        }
        
        request_payload = {
            "parts": {"100": 1, "75": 1, "50": 1, "25": 1},
            "available_board_lengths": [300],
            "saw_blade_width": 3.0,
            "project_name": "Test Project",
            "algorithm": "first_fit_decreasing"
        }
        
        formatted = format_optimization_result(result, request_payload)
        
        assert "🎯 **Cutting Optimization Results**" in formatted
        assert "**Project:** Test Project" in formatted
        assert "4 total pieces of 4 different lengths" in formatted
        assert "1 different sizes" in formatted
        assert "**Saw kerf:** 3.0 units" in formatted
        assert "**Algorithm:** first_fit_decreasing" in formatted
        assert "**Optimal board length:** 300.0" in formatted
        assert "**Total cost:** 2.0 boards" in formatted
        assert "**Total waste:** 50.0 units" in formatted
        assert "**Algorithm used:** first_fit_decreasing" in formatted
        assert "**Computation time:** 0.123s" in formatted
        assert "**Cutting Plan (2 boards):**" in formatted
        assert "**Board 1:** [100.0, 50.0] = 150.0 units" in formatted
        assert "**Board 2:** [75.0, 25.0] = 100.0 units" in formatted
        assert "**Visualization:** Available as base64 encoded image" in formatted
        assert "💡 **For AI Assistants:**" in formatted
    
    def test_format_optimization_result_minimal(self):
        """Test formatting with minimal result data."""
        result = {"message": "success"}
        request_payload = {
            "parts": {"100": 1},
            "available_board_lengths": [300],
            "saw_blade_width": 3.0
        }
        
        formatted = format_optimization_result(result, request_payload)
        
        assert "🎯 **Cutting Optimization Results**" in formatted
        assert "1 total pieces of 1 different lengths" in formatted
        assert "**Complete API Response:**" in formatted
        assert json.dumps(result, indent=2) in formatted
    
    def test_format_optimization_result_error_handling(self):
        """Test formatting error handling."""
        result = {"test": "data"}
        # Invalid request payload that will cause an error
        request_payload = None
        
        formatted = format_optimization_result(result, request_payload)
        
        assert "⚠️ Error formatting response:" in formatted
        assert "Raw response:" in formatted


class TestOptimizeCutting:
    """Test the optimize_cutting tool handler."""
    
    @pytest.mark.asyncio
    @patch('httpx.AsyncClient.post')
    async def test_optimize_cutting_success(self, mock_post):
        """Test successful optimization request."""
        # Mock successful API response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "optimal_board_length": 300.0,
            "cost": 2.0,
            "total_waste": 50.0,
            "algorithm_used": "first_fit_decreasing",
            "cut_list": [[100.0, 50.0], [75.0]]
        }
        mock_post.return_value = mock_response
        
        arguments = {
            "parts": {"100": 1, "75": 1, "50": 1},
            "available_board_lengths": [300],
            "saw_blade_width": 3.0,
            "project_name": "Test Project"
        }
        
        result = await handle_optimize_cutting(arguments)
        
        assert len(result) == 1
        assert isinstance(result[0], types.TextContent)
        assert "🎯 **Cutting Optimization Results**" in result[0].text
        assert "**Project:** Test Project" in result[0].text
        assert "**Optimal board length:** 300.0" in result[0].text
        
        # Verify API call
        mock_post.assert_called_once()
        call_args = mock_post.call_args
        assert "/cutting-plans" in str(call_args)
        
    @pytest.mark.asyncio
    @patch('httpx.AsyncClient.post')
    async def test_optimize_cutting_async(self, mock_post):
        """Test async optimization request."""
        # Mock async API response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "task_id": "test-task-123",
            "status": "queued",
            "message": "Task started",
            "progress_url": "/api/tasks/test-task-123",
            "websocket_url": "/ws/test-task-123"
        }
        mock_post.return_value = mock_response
        
        arguments = {
            "parts": {"100": 1, "75": 1},
            "available_board_lengths": [300],
            "saw_blade_width": 3.0,
            "use_async": True
        }
        
        result = await handle_optimize_cutting(arguments)
        
        assert len(result) == 1
        assert isinstance(result[0], types.TextContent)
        assert "🚀 **Async Optimization Started**" in result[0].text
        assert "**Task ID:** test-task-123" in result[0].text
        assert "**Status:** queued" in result[0].text
        assert "/api/tasks/test-task-123" in result[0].text
        
        # Verify async endpoint was called
        mock_post.assert_called_once()
        call_args = mock_post.call_args
        assert "/cutting-plans/async" in str(call_args)
    
    @pytest.mark.asyncio
    async def test_optimize_cutting_missing_fields(self):
        """Test optimization with missing required fields."""
        arguments = {
            "parts": {"100": 1},
            # Missing required fields
        }
        
        result = await handle_optimize_cutting(arguments)
        
        assert len(result) == 1
        assert isinstance(result[0], types.TextContent)
        assert "❌ Unexpected error: Missing required field:" in result[0].text
    
    @pytest.mark.asyncio
    @patch('httpx.AsyncClient.post')
    async def test_optimize_cutting_api_error(self, mock_post):
        """Test handling of API error responses."""
        # Mock API error response
        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.json.return_value = {"detail": "Invalid input data"}
        mock_post.return_value = mock_response
        
        arguments = {
            "parts": {"100": 1},
            "available_board_lengths": [300],
            "saw_blade_width": 3.0
        }
        
        result = await handle_optimize_cutting(arguments)
        
        assert len(result) == 1
        assert isinstance(result[0], types.TextContent)
        assert "❌ API Error (400): Invalid input data" in result[0].text
    
    @pytest.mark.asyncio
    @patch('httpx.AsyncClient.post')
    async def test_optimize_cutting_connection_error(self, mock_post):
        """Test handling of connection errors."""
        mock_post.side_effect = httpx.ConnectError("Connection failed")
        
        arguments = {
            "parts": {"100": 1},
            "available_board_lengths": [300],
            "saw_blade_width": 3.0
        }
        
        result = await handle_optimize_cutting(arguments)
        
        assert len(result) == 1
        assert isinstance(result[0], types.TextContent)
        assert "❌ Connection error: Could not reach the Planqer API" in result[0].text
    
    @pytest.mark.asyncio
    @patch('httpx.AsyncClient.post')
    async def test_optimize_cutting_timeout(self, mock_post):
        """Test handling of timeout errors."""
        mock_post.side_effect = httpx.TimeoutException("Request timeout")
        
        arguments = {
            "parts": {"100": 1},
            "available_board_lengths": [300],
            "saw_blade_width": 3.0
        }
        
        result = await handle_optimize_cutting(arguments)
        
        assert len(result) == 1
        assert isinstance(result[0], types.TextContent)
        assert "❌ Request timeout: The API took too long to respond" in result[0].text


class TestOptimizeDemo:
    """Test the optimize_demo tool handler."""
    
    @pytest.mark.asyncio
    @patch('planqer_mcp_server.server.handle_optimize_cutting')
    async def test_optimize_demo_success(self, mock_optimize):
        """Test successful demo optimization."""
        mock_optimize.return_value = [types.TextContent(
            type="text",
            text="Optimization result"
        )]
        
        arguments = {"example": "kitchen_cabinets"}
        
        result = await handle_optimize_demo(arguments)
        
        assert len(result) == 1
        assert isinstance(result[0], types.TextContent)
        assert "🎯 **Optimizing with \"kitchen cabinets\" demo payload:**" in result[0].text
        assert "Optimization result" in result[0].text
        
        # Verify the demo payload was used
        mock_optimize.assert_called_once()
        call_args = mock_optimize.call_args[0][0]  # First positional argument
        expected_payload = DEMO_PAYLOADS["kitchen_cabinets"]
        assert call_args["parts"] == expected_payload["parts"]
        assert call_args["available_board_lengths"] == expected_payload["available_board_lengths"]
    
    @pytest.mark.asyncio
    @patch('planqer_mcp_server.server.handle_optimize_cutting')
    async def test_optimize_demo_async(self, mock_optimize):
        """Test async demo optimization."""
        mock_optimize.return_value = [types.TextContent(
            type="text",
            text="Async task started"
        )]
        
        arguments = {"example": "furniture_project", "use_async": True}
        
        result = await handle_optimize_demo(arguments)
        
        # Verify async flag was passed
        mock_optimize.assert_called_once()
        call_args = mock_optimize.call_args[0][0]
        assert call_args["use_async"] is True
    
    @pytest.mark.asyncio
    async def test_optimize_demo_invalid_example(self):
        """Test demo optimization with invalid example."""
        arguments = {"example": "invalid_example"}
        
        result = await handle_optimize_demo(arguments)
        
        assert len(result) == 1
        assert isinstance(result[0], types.TextContent)
        assert "❌ Invalid or missing example" in result[0].text
        assert "kitchen_cabinets, furniture_project, custom_project" in result[0].text


class TestGetDemoPayloads:
    """Test the get_demo_payloads tool handler."""
    
    def test_get_demo_payloads_all(self):
        """Test getting all demo payloads."""
        arguments = {"example": "all"}
        
        result = handle_get_demo_payloads(arguments)
        
        assert len(result) == 1
        assert isinstance(result[0], types.TextContent)
        assert "🎯 **Demo Payloads for Planqer API Testing**" in result[0].text
        assert "Kitchen Cabinets:" in result[0].text
        assert "Furniture Project:" in result[0].text
        assert "Custom Project:" in result[0].text
        
        # Check that all demo payloads are included
        for demo_name in DEMO_PAYLOADS.keys():
            assert demo_name in result[0].text or demo_name.replace('_', ' ').title() in result[0].text
    
    def test_get_demo_payloads_specific(self):
        """Test getting a specific demo payload."""
        arguments = {"example": "kitchen_cabinets"}
        
        result = handle_get_demo_payloads(arguments)
        
        assert len(result) == 1
        assert isinstance(result[0], types.TextContent)
        assert "📋 **Kitchen Cabinets Demo Payload:**" in result[0].text
        assert json.dumps(DEMO_PAYLOADS["kitchen_cabinets"], indent=2) in result[0].text
        assert "Ready to use with optimize_cutting tool!" in result[0].text
    
    def test_get_demo_payloads_default_all(self):
        """Test getting demo payloads with no example specified (defaults to all)."""
        arguments = {}
        
        result = handle_get_demo_payloads(arguments)
        
        assert len(result) == 1
        assert isinstance(result[0], types.TextContent)
        assert "🎯 **Demo Payloads for Planqer API Testing**" in result[0].text
    
    def test_get_demo_payloads_invalid(self):
        """Test getting demo payloads with invalid example."""
        arguments = {"example": "invalid_example"}
        
        result = handle_get_demo_payloads(arguments)
        
        assert len(result) == 1
        assert isinstance(result[0], types.TextContent)
        assert "❌ Unknown demo example: 'invalid_example'" in result[0].text


class TestGetExample:
    """Test the get_cutting_example tool handler."""
    
    def test_get_example(self):
        """Test getting cutting example."""
        result = handle_get_example()
        
        assert len(result) == 1
        assert isinstance(result[0], types.TextContent)
        assert "📋 **Example cutting optimization request:**" in result[0].text
        assert json.dumps(DEMO_PAYLOADS["kitchen_cabinets"], indent=2) in result[0].text
        assert "**This example shows:**" in result[0].text
        assert "**Available algorithms:**" in result[0].text
        assert "first_fit_decreasing" in result[0].text
        assert "best_fit" in result[0].text
        assert "genetic" in result[0].text
        assert "branch_bound" in result[0].text
        assert "**Usage:**" in result[0].text


class TestDemoPayloads:
    """Test the demo payloads structure."""
    
    def test_demo_payloads_structure(self):
        """Test that all demo payloads have required structure."""
        required_fields = ["parts", "available_board_lengths", "saw_blade_width", "project_name"]
        
        for demo_name, payload in DEMO_PAYLOADS.items():
            for field in required_fields:
                assert field in payload, f"Demo {demo_name} missing field {field}"
            
            # Test parts structure
            assert isinstance(payload["parts"], dict)
            assert len(payload["parts"]) > 0
            for length, quantity in payload["parts"].items():
                assert isinstance(length, str)  # JSON keys are strings
                assert isinstance(quantity, int)
                assert quantity > 0
            
            # Test board lengths
            assert isinstance(payload["available_board_lengths"], list)
            assert len(payload["available_board_lengths"]) > 0
            for board_length in payload["available_board_lengths"]:
                assert isinstance(board_length, (int, float))
                assert board_length > 0
            
            # Test saw blade width
            assert isinstance(payload["saw_blade_width"], (int, float))
            assert payload["saw_blade_width"] >= 0
            
            # Test project name
            assert isinstance(payload["project_name"], str)
            assert len(payload["project_name"]) > 0
    
    def test_demo_payloads_completeness(self):
        """Test that we have the expected demo payloads."""
        expected_demos = ["kitchen_cabinets", "furniture_project", "custom_project"]
        
        for demo_name in expected_demos:
            assert demo_name in DEMO_PAYLOADS, f"Missing demo payload: {demo_name}"
        
        assert len(DEMO_PAYLOADS) == len(expected_demos)


@pytest.mark.asyncio
async def test_integration_workflow():
    """Test a complete workflow using the MCP server tools."""
    # 1. Get an example
    example_result = handle_get_example()
    assert len(example_result) == 1
    assert "Kitchen Cabinet Shelves" in example_result[0].text
    
    # 2. Get demo payloads
    demo_result = handle_get_demo_payloads({"example": "kitchen_cabinets"})
    assert len(demo_result) == 1
    assert "Kitchen Cabinets Demo Payload" in demo_result[0].text
    
    # 3. Mock an optimization (we can't test the actual API call in unit tests)
    with patch('httpx.AsyncClient.post') as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "optimal_board_length": 120.0,
            "cost": 3.0,
            "total_waste": 12.5,
            "algorithm_used": "first_fit_decreasing",
            "cut_list": [[12.5, 8.25], [12.5, 6.0], [12.5, 4.75]]
        }
        mock_post.return_value = mock_response
        
        # Run demo optimization
        optimization_result = await handle_optimize_demo({"example": "kitchen_cabinets"})
        assert len(optimization_result) == 1
        assert "Optimizing with \"kitchen cabinets\" demo payload" in optimization_result[0].text
        assert "**Optimal board length:** 120.0" in optimization_result[0].text
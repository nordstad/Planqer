"""
Tests for the Planqer MCP Server functionality.
"""

import asyncio
import json
from unittest.mock import MagicMock, patch

import httpx
import pytest
from mcp import types

from planqer_mcp_server.server import (
    DEMO_PAYLOADS,
    format_optimization_result,
    handle_call_tool,
    handle_get_demo_payloads,
    handle_get_example,
    handle_list_tools,
    handle_optimize_cutting,
    handle_optimize_demo,
    handle_search_products,
)


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

    @pytest.mark.asyncio
    @patch("planqer_mcp_server.server.asyncio.sleep")
    @patch("httpx.AsyncClient.post")
    async def test_optimize_cutting_retries_transient_status(
        self, mock_post, mock_sleep
    ):
        for status_code in (429, 500, 503):
            retry_response = MagicMock(status_code=status_code)
            retry_response.json.return_value = {"detail": "temporarily unavailable"}
            success_response = MagicMock(status_code=200)
            success_response.json.return_value = {
                "optimal_board_length": 300.0,
                "cost": 1.0,
                "total_waste": 0.0,
                "algorithm_used": "first_fit_decreasing",
                "cut_list": [[100.0]],
            }
            mock_post.reset_mock()
            mock_sleep.reset_mock()
            mock_post.side_effect = [retry_response, success_response]

            result = await handle_optimize_cutting(
                {
                    "parts": {"100": 1},
                    "available_board_lengths": [300],
                    "saw_blade_width": 3.0,
                }
            )

            assert "**Optimal board length:** 300.0" in result[0].text
            assert mock_post.call_count == 2
            mock_sleep.assert_awaited_once()

    @pytest.mark.asyncio
    @patch("httpx.AsyncClient.post")
    async def test_async_submission_is_not_retried(self, mock_post):
        response = MagicMock(status_code=503)
        response.json.return_value = {"detail": "temporarily unavailable"}
        mock_post.return_value = response

        result = await handle_optimize_cutting(
            {
                "parts": {"100": 1},
                "available_board_lengths": [300],
                "saw_blade_width": 3.0,
                "use_async": True,
            }
        )

        assert "❌ API Error (503)" in result[0].text
        assert mock_post.call_count == 1


def test_mcp_tool_contract_exposes_all_tools():
    result = asyncio.run(handle_list_tools(None, None))
    assert {tool.name for tool in result.tools} == {
        "optimize_cutting",
        "search_products",
        "optimize_demo",
        "get_demo_payloads",
        "get_cutting_example",
    }


@pytest.mark.asyncio
@patch("httpx.AsyncClient.post")
async def test_protocol_result_marks_tool_execution_failures(mock_post):
    response = MagicMock(status_code=400)
    response.json.return_value = {"detail": "Invalid input data"}
    mock_post.return_value = response

    result = await handle_call_tool(
        None,
        types.CallToolRequestParams(
            name="optimize_cutting",
            arguments={
                "parts": {"100": 1},
                "available_board_lengths": [300],
                "saw_blade_width": 3.0,
            },
        ),
    )

    assert result.is_error is True
    assert result.content[0].text.startswith("❌ API Error (400)")


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
        
        await handle_optimize_demo(arguments)
        
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
        for demo_name in DEMO_PAYLOADS:
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


REGEL = {
    "name": "Framing timber / studs 45 × 95 mm",
    "product": {
        "id": "se:regel:45x95",
        "grades": ["C14", "C24"],
        "species": ["pine", "spruce"],
        "treatments": ["untreated"],
        "lengths": [2400.0, 3000.0],
        "max_length": None,
        "formats": [],
        "note": None,
        "sources": ["https://www.traguiden.se/"],
    },
}
PLYWOOD = {
    "name": "Plywood 15 mm",
    "product": {
        "id": "se:plywood:15",
        "grades": [],
        "species": ["birch"],
        "lengths": [],
        "max_length": 5400,
        "formats": [{"width": 1200.0, "height": 2400.0}],
        "note": "Not every pairing is made.",
        "sources": ["https://www.egger.com/"],
    },
}
CUT_RESULT = {
    "optimal_board_length": 300.0,
    "cost": 1.0,
    "total_waste": 5.0,
    "algorithm_used": "best_fit",
    "cut_list": [[100.0]],
}
CUT_ARGS = {"parts": {"100": 1}, "available_board_lengths": [300], "saw_blade_width": 3.0}


def _json_response(body, status=200):
    response = MagicMock(status_code=status)
    response.json.return_value = body
    return response


class TestSearchProducts:
    @pytest.mark.asyncio
    @patch("httpx.AsyncClient.get")
    async def test_lists_products_with_ids_and_stock(self, mock_get):
        mock_get.return_value = _json_response([REGEL, PLYWOOD])

        result = await handle_search_products({"query": "45x95"})

        text = result[0].text
        assert 'Products matching "45x95"' in text
        assert "1. **Framing timber / studs 45 × 95 mm** — `se:regel:45x95`" in text
        assert "Grades: C14, C24" in text
        assert "Standard lengths: 2400, 3000 mm" in text
        assert "Standard sheets: 1200 × 2400 mm" in text
        assert "Stocked up to: 5400 mm" in text
        assert "Note: Not every pairing is made." in text
        assert "Source: https://www.traguiden.se/" in text
        assert "`product` in `optimize_cutting`" in text

    @pytest.mark.asyncio
    @patch("httpx.AsyncClient.get")
    async def test_passes_the_filters_to_the_catalogue_api(self, mock_get):
        mock_get.return_value = _json_response([])

        result = await handle_search_products(
            {"query": " kryssfiner ", "kind": "sheet", "limit": 3, "language": "sv"}
        )

        assert mock_get.call_args.args[0].endswith("/catalogue/products")
        assert mock_get.call_args.kwargs["params"] == {
            "q": "kryssfiner",
            "kind": "sheet",
            "limit": 3,
            "lang": "sv",
        }
        assert "No products found for \"kryssfiner\"" in result[0].text

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "arguments, message",
        [
            ({}, "query"),
            ({"query": ""}, "query"),
            ({"query": "x" * 101}, "query"),
            ({"query": "x", "kind": "tile"}, "kind"),
            ({"query": "x", "limit": 0}, "limit"),
            ({"query": "x", "limit": True}, "limit"),
            ({"query": "x", "language": "fr"}, "language"),
        ],
    )
    async def test_rejects_bad_input_without_calling_the_api(self, arguments, message):
        with patch("httpx.AsyncClient.get") as mock_get:
            result = await handle_search_products(arguments)
        assert message in result[0].text and result[0].text.startswith("❌")
        mock_get.assert_not_called()

    @pytest.mark.asyncio
    @patch("httpx.AsyncClient.get")
    async def test_reports_api_and_network_failures(self, mock_get):
        mock_get.return_value = _json_response({"detail": "boom"}, status=500)
        assert "(HTTP 500): boom" in (await handle_search_products({"query": "x"}))[0].text
        mock_get.side_effect = httpx.ConnectError("down")
        assert "Connection error" in (await handle_search_products({"query": "x"}))[0].text
        mock_get.side_effect = httpx.TimeoutException("slow")
        assert "Request timeout" in (await handle_search_products({"query": "x"}))[0].text

    @pytest.mark.asyncio
    @patch("httpx.AsyncClient.get")
    async def test_is_reachable_as_a_tool(self, mock_get):
        mock_get.return_value = _json_response([REGEL])
        result = await handle_call_tool(
            None, types.CallToolRequestParams(name="search_products", arguments={"query": "regel"})
        )
        assert result.is_error is False
        assert "se:regel:45x95" in result.content[0].text


class TestOptimizeWithProduct:
    @pytest.mark.asyncio
    @patch("httpx.AsyncClient.post")
    async def test_own_words_are_shown_and_not_sent_to_the_planner(self, mock_post):
        mock_post.return_value = _json_response(CUT_RESULT)

        result = await handle_optimize_cutting({**CUT_ARGS, "product": " Furu 45x95 "})

        assert "**Product:** Furu 45x95 (own words)" in result[0].text
        assert "product" not in mock_post.call_args.kwargs["json"]

    @pytest.mark.asyncio
    @patch("httpx.AsyncClient.get")
    @patch("httpx.AsyncClient.post")
    async def test_a_catalogue_id_is_resolved_with_its_stock_lengths(self, mock_post, mock_get):
        mock_post.return_value = _json_response(CUT_RESULT)
        mock_get.return_value = _json_response([REGEL])

        result = await handle_optimize_cutting({**CUT_ARGS, "product": "se:regel:45x95"})

        assert mock_get.call_args.kwargs["params"] == {"id": "se:regel:45x95", "limit": 1}
        text = result[0].text
        assert "**Product:** Framing timber / studs 45 × 95 mm (`se:regel:45x95`)" in text
        assert "**Standard stock lengths for this product:** 2400, 3000 mm" in text
        assert "product" not in mock_post.call_args.kwargs["json"]

    @pytest.mark.asyncio
    @patch("httpx.AsyncClient.get")
    @patch("httpx.AsyncClient.post")
    async def test_an_unknown_catalogue_id_is_an_error_and_nothing_is_planned(self, mock_post, mock_get):
        mock_get.return_value = _json_response([])

        result = await handle_optimize_cutting({**CUT_ARGS, "product": "se:regel:1x1"})

        assert result[0].text.startswith("❌ Unknown catalogue product 'se:regel:1x1'")
        assert "search_products" in result[0].text
        mock_post.assert_not_called()

    @pytest.mark.asyncio
    @patch("httpx.AsyncClient.get")
    @patch("httpx.AsyncClient.post")
    async def test_text_that_only_looks_like_an_id_is_not_looked_up(self, mock_post, mock_get):
        mock_post.return_value = _json_response(CUT_RESULT)

        await handle_optimize_cutting({**CUT_ARGS, "product": "Oak: 2x4"})

        mock_get.assert_not_called()

    @pytest.mark.asyncio
    @pytest.mark.parametrize("product", ["", "   ", 5, "x" * 201])
    async def test_rejects_bad_product_values(self, product):
        with patch("httpx.AsyncClient.post") as mock_post:
            result = await handle_optimize_cutting({**CUT_ARGS, "product": product})
        assert "product must be text" in result[0].text
        mock_post.assert_not_called()

    @pytest.mark.asyncio
    @patch("httpx.AsyncClient.post")
    async def test_leaving_the_product_out_changes_nothing(self, mock_post):
        mock_post.return_value = _json_response(CUT_RESULT)
        result = await handle_optimize_cutting(CUT_ARGS)
        assert "**Product:**" not in result[0].text

    def test_the_demo_payloads_and_tool_contract_describe_the_product(self):
        assert DEMO_PAYLOADS["furniture_project"]["product"] == "Framing timber 45x95"
        tools = {t.name: t for t in asyncio.run(handle_list_tools(None, None)).tools}
        assert "product" in tools["optimize_cutting"].input_schema["properties"]
        assert tools["search_products"].input_schema["required"] == ["query"]

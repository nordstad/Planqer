import asyncio
import json
import logging
import os
import random
import uuid
from pathlib import Path
from typing import Any

import httpx
import mcp.server.stdio
from mcp import types
from mcp.server import NotificationOptions, Server
from mcp.server.models import InitializationOptions

# API configuration - using localhost for local development, can be configured via env
API_BASE_URL = os.getenv("PLANQER_API_URL", "http://localhost:8002/api")

MCP_DEBUG = os.getenv("MCP_DEBUG", "").lower() in {"1", "true", "yes", "on"}
MCP_LOG_LEVEL = os.getenv("MCP_LOG_LEVEL", "INFO").upper()
if MCP_DEBUG:
    MCP_LOG_LEVEL = "DEBUG"
_RESOLVED_LOG_LEVEL = getattr(logging, MCP_LOG_LEVEL, logging.INFO)
logging.basicConfig(
    level=_RESOLVED_LOG_LEVEL,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

logger = logging.getLogger(__name__)

MCP_API_MAX_RETRIES = max(0, int(os.getenv("MCP_API_MAX_RETRIES", "2")))
MCP_API_RETRY_BASE_DELAY_MS = max(
    0, int(os.getenv("MCP_API_RETRY_BASE_DELAY_MS", "200"))
)
MCP_API_RETRY_MAX_DELAY_MS = max(
    MCP_API_RETRY_BASE_DELAY_MS,
    int(os.getenv("MCP_API_RETRY_MAX_DELAY_MS", "2000")),
)

RETRYABLE_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}

REDACT_FIELDS = {
    "parts",
    "project_name",
    "cut_list",
    "visualization",
    "content",
    "structuredContent",
}

TOOLS_CONTRACT_PATH = Path(__file__).resolve().parents[2] / "schemas" / "mcp-tools.json"
DEMO_PAYLOADS_PATH = (
    Path(__file__).resolve().parents[2] / "schemas" / "demo-payloads.json"
)


def load_tools_contract() -> list[dict[str, Any]]:
    with TOOLS_CONTRACT_PATH.open("r", encoding="utf-8") as f:
        loaded = json.load(f)

    if not isinstance(loaded, list):
        raise TypeError("MCP tools contract must be a list")

    return loaded


TOOLS_CONTRACT = load_tools_contract()


def load_demo_payloads() -> dict[str, dict[str, Any]]:
    with DEMO_PAYLOADS_PATH.open("r", encoding="utf-8") as f:
        loaded = json.load(f)

    if not isinstance(loaded, dict):
        raise TypeError("Demo payloads contract must be an object")

    return loaded


DEMO_PAYLOADS = load_demo_payloads()


def build_tools_from_contract() -> list[types.Tool]:
    return [
        types.Tool(
            name=str(tool_def["name"]),
            description=str(tool_def["description"]),
            inputSchema=tool_def["inputSchema"],
        )
        for tool_def in TOOLS_CONTRACT
    ]


def make_request_id() -> str:
    return uuid.uuid4().hex[:12]


def _redacted_placeholder(value: Any) -> str:
    if isinstance(value, dict):
        return f"<redacted:dict:{len(value)} keys>"
    if isinstance(value, list):
        return f"<redacted:list:{len(value)} items>"
    if isinstance(value, str):
        return f"<redacted:str:{len(value)} chars>"
    return "<redacted>"


def redact_for_log(value: Any, key: str | None = None) -> Any:
    if key in REDACT_FIELDS:
        return _redacted_placeholder(value)

    if isinstance(value, dict):
        return {k: redact_for_log(v, k) for k, v in value.items()}
    if isinstance(value, list):
        return [redact_for_log(v) for v in value]
    return value


def _retry_delay_seconds(attempt_number: int) -> float:
    base_ms = MCP_API_RETRY_BASE_DELAY_MS * (2 ** max(0, attempt_number - 1))
    clamped_ms = min(base_ms, MCP_API_RETRY_MAX_DELAY_MS)
    jitter_factor = random.uniform(0.8, 1.2)
    return (clamped_ms * jitter_factor) / 1000.0


def _is_retryable_status(status_code: int) -> bool:
    return status_code in RETRYABLE_STATUS_CODES


def format_optimization_result(
    result: dict[str, Any], request_payload: dict[str, Any]
) -> str:
    """
    Format the API response in a way that's easy for AI assistants to understand and interpret.
    """
    try:
        # Project information header
        formatted = "🎯 **Cutting Optimization Results**\n\n"

        if request_payload.get("project_name"):
            formatted += f"**Project:** {request_payload['project_name']}\n"

        # Input summary
        parts_count = sum(request_payload["parts"].values())
        parts_types = len(request_payload["parts"])

        formatted += f"**Input:** {parts_count} total pieces of {parts_types} different lengths\n"
        formatted += f"**Available boards:** {len(request_payload['available_board_lengths'])} different sizes\n"
        formatted += f"**Saw kerf:** {request_payload['saw_blade_width']} units\n"

        if request_payload.get("algorithm"):
            formatted += f"**Algorithm:** {request_payload['algorithm']}\n"

        formatted += "\n"

        # Results summary
        if result.get("optimal_board_length"):
            formatted += "📊 **Optimization Summary:**\n"
            formatted += (
                f"- **Optimal board length:** {result['optimal_board_length']}\n"
            )
            formatted += f"- **Total cost:** {result['cost']} boards\n"
            formatted += f"- **Total waste:** {result['total_waste']} units\n"
            formatted += f"- **Algorithm used:** {result['algorithm_used']}\n"

            if result.get("computation_time"):
                formatted += (
                    f"- **Computation time:** {result['computation_time']:.3f}s\n"
                )

            formatted += "\n"

        # Cutting plan
        if result.get("cut_list") and isinstance(result["cut_list"], list):
            formatted += f"📋 **Cutting Plan ({len(result['cut_list'])} boards):**\n"
            for index, board in enumerate(result["cut_list"]):
                board_total = sum(board)
                formatted += f"- **Board {index + 1}:** [{', '.join(map(str, board))}] = {board_total} units\n"
            formatted += "\n"

        # Visualization note
        if result.get("visualization"):
            formatted += "📊 **Visualization:** Available as base64 encoded image\n\n"

        # Raw data for detailed analysis
        formatted += "📄 **Complete API Response:**\n"
        formatted += "```json\n"
        formatted += json.dumps(result, indent=2)
        formatted += "\n```\n\n"

        # AI interpretation helper
        formatted += "💡 **For AI Assistants:**\n"
        formatted += "- Parse the cut_list to provide specific cutting instructions\n"
        formatted += "- Use total_waste to calculate material efficiency\n"
        formatted += "- The visualization field contains a base64 image showing the cutting plan\n"
        formatted += "- Cost represents the number of boards needed\n"

        return formatted
    except Exception as e:  # noqa: BLE001
        return f"⚠️ Error formatting response: {e!s}\n\nRaw response:\n```json\n{json.dumps(result, indent=2)}\n```"


async def handle_list_tools(
    _ctx: Any, _params: types.PaginatedRequestParams | None
) -> types.ListToolsResult:
    """
    List available tools for cutting optimization.
    """
    return types.ListToolsResult(tools=build_tools_from_contract())


async def handle_call_tool(
    _ctx: Any, params: types.CallToolRequestParams
) -> types.CallToolResult:
    """
    Handle tool execution requests for cutting optimization.
    """
    name = params.name
    arguments = params.arguments or {}
    request_id = make_request_id()
    logger.info("event=mcp_call_start request_id=%s tool=%s", request_id, name)

    if name == "optimize_cutting":
        result = await handle_optimize_cutting(arguments, request_id=request_id)
        logger.info("event=mcp_call_end request_id=%s tool=%s", request_id, name)
        return types.CallToolResult(content=result)
    elif name == "optimize_demo":
        result = await handle_optimize_demo(arguments, request_id=request_id)
        logger.info("event=mcp_call_end request_id=%s tool=%s", request_id, name)
        return types.CallToolResult(content=result)
    elif name == "get_demo_payloads":
        result = handle_get_demo_payloads(arguments)
        logger.info("event=mcp_call_end request_id=%s tool=%s", request_id, name)
        return types.CallToolResult(content=result)
    elif name == "get_cutting_example":
        result = handle_get_example()
        logger.info("event=mcp_call_end request_id=%s tool=%s", request_id, name)
        return types.CallToolResult(content=result)
    else:
        logger.warning(
            "event=mcp_call_unknown_tool request_id=%s tool=%s", request_id, name
        )
        raise ValueError(f"Unknown tool: {name}")


server = Server(
    "planqer-mcp-server",
    version="1.0.0",
    on_list_tools=handle_list_tools,
    on_call_tool=handle_call_tool,
)


async def handle_optimize_cutting(
    arguments: dict[str, Any], request_id: str | None = None
) -> list[types.TextContent]:
    """
    Handle cutting optimization requests by calling the Planqer API.
    """
    rid = request_id or make_request_id()
    try:
        # Validate required arguments
        required_fields = ["parts", "available_board_lengths", "saw_blade_width"]
        for field in required_fields:
            if field not in arguments:
                raise ValueError(f"Missing required field: {field}")

        # Check if using async processing
        use_async = bool(arguments.get("use_async", False))

        # Prepare the payload
        payload = {
            "parts": arguments["parts"],
            "available_board_lengths": arguments["available_board_lengths"],
            "saw_blade_width": arguments["saw_blade_width"],
        }

        # Add optional fields
        if arguments.get("project_name"):
            payload["project_name"] = arguments["project_name"]

        if arguments.get("algorithm"):
            payload["algorithm"] = arguments["algorithm"]

        # Choose endpoint based on async flag
        endpoint = "/cutting-plans/async" if use_async else "/cutting-plans"
        timeout = 5.0 if use_async else 30.0

        logger.debug(
            "event=api_request_start request_id=%s endpoint=%s async=%s",
            rid,
            endpoint,
            use_async,
        )
        logger.debug(
            "event=api_request_payload request_id=%s payload=%s",
            rid,
            json.dumps(redact_for_log(payload), separators=(",", ":")),
        )

        # Make the API request with bounded retries for transient failures.
        response = None
        max_attempts = MCP_API_MAX_RETRIES + 1
        async with httpx.AsyncClient(timeout=timeout) as client:
            for attempt in range(1, max_attempts + 1):
                logger.debug(
                    "event=api_request_attempt request_id=%s attempt=%s max_attempts=%s",
                    rid,
                    attempt,
                    max_attempts,
                )
                try:
                    candidate = await client.post(
                        f"{API_BASE_URL}{endpoint}",
                        json=payload,
                        headers={"Content-Type": "application/json"},
                    )
                except (httpx.TimeoutException, httpx.ConnectError) as exc:
                    if attempt < max_attempts:
                        delay_seconds = _retry_delay_seconds(attempt)
                        logger.warning(
                            "event=api_request_retry request_id=%s reason=%s attempt=%s next_delay_seconds=%.3f",
                            rid,
                            type(exc).__name__,
                            attempt,
                            delay_seconds,
                        )
                        await asyncio.sleep(delay_seconds)
                        continue
                    raise

                if (
                    _is_retryable_status(candidate.status_code)
                    and attempt < max_attempts
                ):
                    delay_seconds = _retry_delay_seconds(attempt)
                    logger.warning(
                        "event=api_response_retryable request_id=%s status=%s attempt=%s next_delay_seconds=%.3f",
                        rid,
                        candidate.status_code,
                        attempt,
                        delay_seconds,
                    )
                    await asyncio.sleep(delay_seconds)
                    continue

                response = candidate
                break

            if response is None:
                raise RuntimeError("API request failed before producing a response")

            logger.debug(
                "event=api_response_status request_id=%s status=%s",
                rid,
                response.status_code,
            )
            response_json = None
            try:
                response_json = response.json()
                logger.debug(
                    "event=api_response_json request_id=%s body=%s",
                    rid,
                    json.dumps(redact_for_log(response_json), separators=(",", ":")),
                )
            except ValueError:
                logger.debug("event=api_response_non_json request_id=%s", rid)

            if response.status_code == 200:
                if response_json is None:
                    return [
                        types.TextContent(
                            type="text",
                            text="❌ API Error: Expected a JSON response from Planqer API but received non-JSON content.",
                        )
                    ]

                result = response_json

                if use_async:
                    # Handle async response - return task information
                    return [
                        types.TextContent(
                            type="text",
                            text=f"🚀 **Async Optimization Started**\n\n"
                            f"**Task ID:** {result['task_id']}\n"
                            f"**Status:** {result['status']}\n"
                            f"**Message:** {result['message']}\n\n"
                            f"**Next Steps:**\n"
                            f"- Check progress at: {result['progress_url']}\n"
                            f"- WebSocket updates available at: {result['websocket_url']}\n\n"
                            f"The optimization is running in the background. For complex problems, "
                            f"this can provide better results than the synchronous endpoint.",
                        )
                    ]
                else:
                    # Handle synchronous response
                    formatted_response = format_optimization_result(result, payload)
                    return [types.TextContent(type="text", text=formatted_response)]
            else:
                error_details = ""
                retryable_label = (
                    "retryable"
                    if _is_retryable_status(response.status_code)
                    else "non-retryable"
                )
                try:
                    if isinstance(response_json, dict):
                        error_details = str(response_json.get("detail", response_json))
                    elif response_json is not None:
                        error_details = str(response_json)
                    else:
                        error_details = response.text or f"HTTP {response.status_code}"
                except Exception:  # noqa: BLE001
                    error_details = response.text or f"HTTP {response.status_code}"

                return [
                    types.TextContent(
                        type="text",
                        text=f"❌ API Error ({response.status_code}): {error_details} ({retryable_label})",
                    )
                ]

    except httpx.TimeoutException:
        logger.warning("event=api_timeout request_id=%s", rid)
        return [
            types.TextContent(
                type="text",
                text="❌ Request timeout: The API took too long to respond. Please try again.",
            )
        ]
    except httpx.ConnectError:
        logger.warning(
            "event=api_connect_error request_id=%s api_base_url=%s", rid, API_BASE_URL
        )
        return [
            types.TextContent(
                type="text",
                text=f"❌ Connection error: Could not reach the Planqer API at {API_BASE_URL}. Please check if the service is running.",
            )
        ]
    except Exception as e:
        logger.exception("event=api_unexpected_error request_id=%s", rid)
        return [types.TextContent(type="text", text=f"❌ Unexpected error: {e!s}")]


async def handle_optimize_demo(
    arguments: dict[str, Any], request_id: str | None = None
) -> list[types.TextContent]:
    """
    Handle cutting optimization using a pre-configured demo payload.
    """
    rid = request_id or make_request_id()
    example_choice = arguments.get("example")
    use_async = arguments.get("use_async", False)

    if not example_choice or example_choice not in DEMO_PAYLOADS:
        return [
            types.TextContent(
                type="text",
                text=f"❌ Invalid or missing example. Available options: {', '.join(DEMO_PAYLOADS.keys())}",
            )
        ]

    # Get the demo payload and add async flag if specified
    payload = DEMO_PAYLOADS[example_choice].copy()
    if use_async:
        payload["use_async"] = True

    logger.debug(
        "event=demo_selected request_id=%s example=%s async=%s",
        rid,
        example_choice,
        bool(use_async),
    )

    # Run the optimization
    result = await handle_optimize_cutting(payload, request_id=rid)

    # Prepend info about which demo was used
    if result and result[0].text:
        demo_info = f'🎯 **Optimizing with "{example_choice.replace("_", " ")}" demo payload:**\n\n'
        result[0].text = demo_info + result[0].text

    return result


def handle_get_example() -> list[types.TextContent]:
    """
    Return an example of how to use the cutting optimization tool.
    """
    example = DEMO_PAYLOADS["kitchen_cabinets"]

    return [
        types.TextContent(
            type="text",
            text=f"""📋 **Example cutting optimization request:**

```json
{json.dumps(example, indent=2)}
```

**This example shows:**
- **Parts needed:** 4 pieces of 12.5", 2 pieces of 8.25", 3 pieces of 6.0", and 1 piece of 4.75"
- **Available board lengths:** 96", 120", and 144"
- **Saw blade kerf:** 0.125" (1/8 inch)
- **Project name:** "Kitchen Cabinet Shelves"

You can use the `optimize_cutting` tool with similar data to get an optimized cutting plan that minimizes waste.

**Available algorithms:**
- `first_fit_decreasing` - Fast algorithm for large problems
- `best_fit` - Better space utilization
- `best_fit_decreasing` - Combines sorting with best fit (recommended)
- `genetic` - Near-optimal solutions for complex problems
- `branch_bound` - Optimal solutions for small problems

**Usage:**
```
optimize_cutting({json.dumps(example)})
```
""",
        )
    ]


def handle_get_demo_payloads(arguments: dict[str, Any]) -> list[types.TextContent]:
    """
    Return pre-configured demo payloads for testing the cutting optimization API.
    """
    example_choice = arguments.get("example", "all")

    if example_choice == "all":
        # Return all demo payloads
        formatted_payloads = []
        for name, payload in DEMO_PAYLOADS.items():
            formatted_payloads.append(
                f"**{name.replace('_', ' ').title()}:**\n```json\n{json.dumps(payload, indent=2)}\n```"
            )

        return [
            types.TextContent(
                type="text",
                text=f"""🎯 **Demo Payloads for Planqer API Testing**

Here are pre-configured demo payloads you can use to test the cutting optimization API:

{chr(10).join(formatted_payloads)}

**How to use:**
1. Copy any of the JSON payloads above
2. Use the `optimize_cutting` tool with the copied payload
3. Or call `optimize_demo` with a specific example name

**Available examples:** {", ".join(DEMO_PAYLOADS.keys())}
""",
            )
        ]
    elif example_choice in DEMO_PAYLOADS:
        # Return specific demo payload
        payload = DEMO_PAYLOADS[example_choice]
        return [
            types.TextContent(
                type="text",
                text=f"""📋 **{example_choice.replace("_", " ").title()} Demo Payload:**

```json
{json.dumps(payload, indent=2)}
```

**Ready to use with optimize_cutting tool!**

This payload includes:
- **Parts:** {len(payload["parts"])} different lengths
- **Board sizes:** {len(payload["available_board_lengths"])} available lengths
- **Saw kerf:** {payload["saw_blade_width"]} units
- **Project:** {payload["project_name"]}

Copy the JSON above and use it with the `optimize_cutting` tool to get an optimized cutting plan.
""",
            )
        ]
    else:
        return [
            types.TextContent(
                type="text",
                text=f"❌ Unknown demo example: '{example_choice}'. Available options: {', '.join(DEMO_PAYLOADS.keys())}, all",
            )
        ]


async def main():
    """
    Run the MCP server using stdin/stdout streams.
    """
    logger.info("Planqer MCP server starting (API: %s)", API_BASE_URL)

    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="planqer-mcp-server",
                server_version="1.0.0",
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )


if __name__ == "__main__":
    asyncio.run(main())

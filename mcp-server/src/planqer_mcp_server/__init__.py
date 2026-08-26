"""
Planqer MCP Server

A Model Context Protocol server for AI assistants to interact with the Planqer
cutting optimization API. Provides tools for optimizing cutting plans, getting
demo payloads, and testing the API.
"""

def main():
    """Entry point for the MCP server."""
    import asyncio

    from .server import main as server_main

    asyncio.run(server_main())

__version__ = "1.0.0"
__all__ = ["main"]

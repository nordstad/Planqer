# MCP server (AI assistants)

`mcp-server/` ships a [Model Context Protocol](https://modelcontextprotocol.io/)
server so an AI assistant (Claude Desktop and compatible clients) can drive
the optimizer in natural language, instead of you filling in the form.

## Tools

| Tool | Purpose |
| --- | --- |
| `optimize_cutting` | Run a real optimization from parts and stock lengths you describe. |
| `optimize_demo` | Run a pre-configured demo project, for a quick test. |
| `get_demo_payloads` | List the available demo payloads. |
| `get_cutting_example` | Show the request format the API expects. |

An assistant with this server connected can turn something like *"I need 4
pieces at 270cm, 8 at 179cm, 16 at 90cm, and 4 at 81cm, from boards of 300,
360 or 500cm, 3mm blade"* directly into an `optimize_cutting` call, then
explain the resulting boards/waste/efficiency back to you.

## Connect it to Claude Desktop

```json
{
  "mcpServers": {
    "planqer-cutting-optimizer": {
      "command": "uv",
      "args": [
        "--directory",
        "/path/to/planqer/mcp-server",
        "run",
        "planqer-mcp-server"
      ]
    }
  }
}
```

The server talks to the backend over `PLANQER_API_URL`, which defaults to
`http://localhost:8002/api`. When run via `docker-compose up`, the
`mcp-server` service is already wired to the `backend` container on the
compose network — see [Configuration](../reference/configuration.md).

## Running it yourself

```bash
cd mcp-server
uv sync
npm install
npm run build
uv run planqer-mcp-server
```

Debug it with the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector uv run planqer-mcp-server
```

See `mcp-server/README.md` and `mcp-server/AI_INTEGRATION_GUIDE.md` in the
repository for algorithm selection guidance and worked examples.

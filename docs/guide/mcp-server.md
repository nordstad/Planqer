# MCP server (AI assistants)

`mcp-server/` ships a [Model Context Protocol](https://modelcontextprotocol.io/)
server so an AI assistant (Claude Desktop and compatible clients) can drive
the optimizer in natural language, instead of you filling in the form.

## Tools

| Tool | Purpose |
| --- | --- |
| `optimize_cutting` | Run a real optimization from parts and stock lengths you describe. |
| `search_products` | Search the instance's product catalogue by name, grade or size, and get product ids with their standard stock lengths. |
| `optimize_demo` | Run a pre-configured demo project, for a quick test. |
| `get_demo_payloads` | List the available demo payloads. |
| `get_cutting_example` | Show the request format the API expects. |

An assistant with this server connected can turn something like *"I need 4
pieces at 270cm, 8 at 179cm, 16 at 90cm, and 4 at 81cm, from boards of 300,
360 or 500cm, 3mm blade"* directly into an `optimize_cutting` call, then
explain the resulting boards/waste/efficiency back to you.

### Products

`optimize_cutting` takes an optional `product`: your own words (`Furu 45x95`)
or a catalogue id such as `se:regel:45x95`. An id is looked up in the instance's
catalogue, and the result then shows the product's name and standard stock
lengths; an id the catalogue doesn't have is refused so a typo is never
planned silently. The product is shown with the result and does not change the
plan.

`search_products` finds those ids. It searches the same catalogue as the web
app, including products your admins added and without the ones they hid:

```
search_products({"query": "regel c24 45x95", "kind": "board", "language": "sv"})
```

The MCP server doesn't sign in, so it can plan and search but not save plans;
saved plans, with their product, are made in the web app.

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
`http://localhost:8002/api`. When run through Compose, the `mcp-server`
service is wired to the `backend` container on the Compose network. It is
optional and must be enabled with the `mcp` profile:

```bash
docker compose --profile mcp up -d
```

See [Configuration](../reference/configuration.md) for the environment
variables.

The two MCP runtimes share the same tool schema and version (`0.7.0`). In
stdio mode, stdout is reserved for MCP JSON-RPC messages and logs go to stderr.
Transient synchronous API failures (`408`, `425`, `429`, `500`, `502`, `503`,
`504`) use bounded exponential backoff; async job submissions are not retried
without an idempotency key. Tool execution failures are returned with
`isError: true`.

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

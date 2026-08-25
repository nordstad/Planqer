<!-- markdownlint-disable -->

# Planqer

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)

## 🤖 AI Assistant Integration (MCP Server)

**Transform cutting optimization with natural language!** This project includes a complete **Model Context Protocol (MCP) server** that enables AI assistants like Claude Desktop to perform cutting optimizations through natural conversation.

### Why Use the MCP Server?

**Instead of this manual process:**
```json
// Complex API request
{
  "parts": {"270": 4, "179": 8, "90": 16, "81": 4},
  "available_board_lengths": [2500, 3000, 3300, 3600], 
  "saw_blade_width": 3,
  "project_name": "Furniture Project"
}
```

**Just talk naturally to Claude:**
- *"I need to cut 4 pieces at 270cm, 8 at 179cm, 16 at 90cm, and 4 at 81cm from boards of 300, 360, or 500cm with 3mm saw kerf"*
- *"Test the cutting optimizer with the furniture project demo"*
- *"What's the most efficient way to cut these parts with minimal waste?"*

### Key Benefits

- **🗣️ Natural Language**: No need to remember API formats or JSON syntax
- **⚡ Instant Results**: Get optimized cutting plans in seconds
- **📊 Smart Analysis**: AI can explain results and suggest improvements  
- **🔄 Iterative Design**: Easily modify requirements and re-optimize
- **📚 Built-in Examples**: Pre-configured demos for quick testing

### MCP Server Features

**Four Powerful Tools:**

| Tool | Purpose | Example Usage |
|------|---------|---------------|
| `optimize_cutting` | Custom optimization with your data | *"Optimize cutting for my kitchen cabinet project"* |
| `optimize_demo` | Quick test with furniture project | *"Run the demo optimization"* |
| `get_demo_payloads` | View all available examples | *"Show me example cutting scenarios"* |
| `get_cutting_example` | Learn the API format | *"How do I format a cutting request?"* |

Planqer is a powerful cutting optimization solution that minimizes material waste when cutting boards to specific lengths. Built as a microservices application, it features a FastAPI backend for calculations and a React frontend for intuitive user interaction.

## 🚀 Features

- **Optimal Cutting Plans**: Sophisticated algorithms that minimize material waste
- **Visual Representations**: Auto-generated cutting diagrams to guide implementation
- **Modern UI**: Responsive React interface for seamless user experience
- **Containerized Deployment**: Docker and Docker Compose configuration for easy setup
- **REST API**: Well-documented endpoints for integration with other systems

## 📋 Project Structure

```text
planqer/
├── LICENSE
├── README.md
├── docker-compose.yml
├── backend/             # FastAPI service with optimization algorithms
│   ├── Dockerfile
│   ├── pyproject.toml
│   └── planqer/         # Core optimization logic
├── frontend/            # React application
│   ├── Dockerfile
│   ├── package.json
│   └── src/
└── mcp-server/          # AI assistant integration (MCP server)
    ├── Dockerfile
    ├── package.json
    ├── pyproject.toml
    ├── src/index.ts      # TypeScript implementation
    └── src/planqer_mcp_server/  # Python implementation
```

## ✅ MCP Validation Commands

Run these from `mcp-server/`:

```bash
# TypeScript tests (includes stdio MCP integration test)
npm test

# Python MCP tests
npm run test:py

# Full MCP validation (TS + Python)
npm run test:all
```

Notes:

- `npm test` builds `dist/` first, then runs Vitest.
- The integration test starts a mock backend and validates MCP `listTools` and
  `optimize_cutting` over stdio.
- `npm run test:py` uses `uv run --group dev python -m pytest -q` to avoid
  missing pytest executable issues.

## MCP Logging and Redaction Policy

Both MCP runtimes (Python and TypeScript) use structured logs with request
correlation IDs.

Environment controls:

- `MCP_DEBUG=true` enables debug-level logging.
- `MCP_LOG_LEVEL=DEBUG|INFO|WARN|ERROR` sets the log threshold.
- `MCP_API_MAX_RETRIES` sets retries for transient API failures (default: `2`).
- `MCP_API_RETRY_BASE_DELAY_MS` sets exponential backoff base delay in ms
  (default: `200`).
- `MCP_API_RETRY_MAX_DELAY_MS` sets max delay cap in ms (default: `2000`).

Redaction rules:

- The following fields are redacted before writing logs:
  - `parts`
  - `project_name`
  - `cut_list`
  - `visualization`
  - `content`
  - `structuredContent`
- Redacted fields are replaced with placeholders that preserve only type/size
  metadata (for example: `<redacted:dict:4 keys>`).

Operational guidance:

- Keep `MCP_LOG_LEVEL=INFO` in normal operation.
- Use `MCP_DEBUG=true` only for short-lived debugging sessions.
- Avoid adding new payload fields to logs without updating redaction rules in
  both runtimes.

## 🛠️ Installation

### Prerequisites

- Docker and Docker Compose
- Node.js (for local frontend development)
- Python 3.8+ (for local backend development)

### Quick Start

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/planqer.git
   cd planqer
   ```

2. Build and run with Docker Compose:
   ```bash
   docker-compose up --build
   ```

3. Access the application:
   - **Frontend**: http://localhost:3000
   - **API Documentation**: http://localhost:8000/docs

## 🧪 API Usage

### Basic Optimization Request

```bash
curl -X POST "http://localhost:8002/api/cutting-plans" \
  -H "Content-Type: application/json" \
  -d '{
        "parts": {"270": 4, "179": 8, "90": 16, "81": 4},
        "available_board_lengths": [2500, 3000, 3300, 3600],
        "saw_blade_width": 3
      }'
```

### Swagger Docs

<http://localhost:8002/docs> — or the same path on whatever host you serve
Planqer from.

### Generate Visualization

```bash
cd backend
python -c "import json; from planqer.visualization import generate_visual_cut_list; from planqer.cutting import min_boards_required_with_cut_list; cut_list = min_boards_required_with_cut_list({\"270\":4, \"179\":8, \"90\":16, \"81\":4}, 360)[1]; generate_visual_cut_list(cut_list, 360, 'output.png'); print('Visualization saved as output.png')"
```

### Getting Started with MCP

**1. Test with MCP Inspector (Recommended for first-time users):**
```bash
cd mcp-server
npx @modelcontextprotocol/inspector uv run planqer-mcp-server
```

**2. Claude Desktop Integration:**

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

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

**3. Start Optimizing with Natural Language:**

Once configured, restart Claude Desktop and try these conversations:

```
You: "Test the cutting optimizer with the furniture project demo"

Claude: I'll run the furniture project demo for you using the optimize_demo tool...
✅ Optimized cutting plan complete!
• Total boards needed: 8
• Total waste: 156 cm
• Material efficiency: 94.2%
...
```

```
You: "I need to cut 12 pieces at 45cm and 8 pieces at 80cm from 240cm boards with 3mm kerf"

Claude: I'll optimize that cutting plan for you...
[Processes your request and returns optimized results]
```

### Advanced Use Cases

**Iterative Design:**
```
You: "Show me demo payloads"
Claude: [Shows available examples]

You: "Use the kitchen cabinet example but change the board length to 400cm"
Claude: [Modifies and optimizes the new configuration]
```

**Waste Analysis:**
```
You: "What's causing the most waste in this cutting plan?"
Claude: [Analyzes results and suggests improvements]
```

**Project Comparison:**
```
You: "Compare the efficiency of 300cm vs 360cm boards for my project"
Claude: [Runs both scenarios and compares results]
```

### VS Code Integration

Install the MCP extension in VS Code and add this configuration to `.vscode/mcp.json`:

```json
{
  "mcpServers": {
    "planqer": {
      "command": "uv",
      "args": ["--directory", "./mcp-server", "run", "planqer-mcp-server"]
    }
  }
}
```

### Built-in Demo Data

The MCP server includes several pre-configured examples:

- **Furniture Project**: Cabinet making with various part sizes
- **Kitchen Renovation**: Shelving and trim work
- **Woodworking Shop**: Mixed length requirements
- **Construction**: Framing and structural components

Access them with: *"Show me all demo payloads"* or *"Run the furniture project demo"*

### Real-World MCP Use Cases

**🏠 Home Renovation:**
```
You: "I'm building floating shelves. I need 6 pieces at 120cm, 12 pieces at 30cm, and 4 pieces at 80cm. I have 240cm boards available with a 3mm saw kerf."

Claude: I'll optimize your floating shelf cutting plan...
✅ Result: Use 4 boards total, only 24cm waste (96% efficiency)
[Detailed cutting instructions follow]
```

**🏭 Professional Woodworking:**
```
You: "Compare material costs: 3m boards at $45 each vs 4m boards at $58 each for this cabinet project"

Claude: I'll run both scenarios and calculate the total costs...
📊 3m boards: 12 boards needed = $540 total
📊 4m boards: 9 boards needed = $522 total  
💡 Recommendation: 4m boards save $18 (3.4% cost reduction)
```

**📐 Educational/Learning:**
```
You: "Explain why this cutting plan is generating so much waste"

Claude: Looking at your cutting plan, I can see the main waste factors:
1. Part length mismatch: 85cm parts from 100cm boards = 15cm waste each
2. Kerf accumulation: 3mm × 12 cuts = 36mm additional waste  
3. Optimization suggestion: Try 200cm boards instead...
```

### Troubleshooting MCP Setup

**Common Issues:**

1. **"Command not found: uv"**
   ```bash
   # Install uv first
   curl -LsSf https://astral.sh/uv/install.sh | sh
   # Or on macOS: brew install uv
   ```

2. **"MCP server not responding"**
   ```bash
   # Test server directly
   cd mcp-server
   uv run planqer-mcp-server --version
   ```

3. **"Claude Desktop not connecting"**
   - Ensure the path in config is absolute (not relative)
   - Restart Claude Desktop after config changes
   - Check logs in: `~/Library/Logs/Claude/mcp.log` (macOS)

4. **"Backend not accessible from MCP"**
   ```bash
   # Start the full stack first
   docker-compose up -d
   # Then test MCP
   cd mcp-server && uv run planqer-mcp-server
   ```

**Verification:**
```bash
# Quick test that everything works
cd mcp-server
npx @modelcontextprotocol/inspector uv run planqer-mcp-server
# Click "optimize_demo" in the inspector - should return cutting plan
```

## �🧑‍💻 Development

### Backend

The core optimization logic is located in `backend/app/planqer/`. To set up a local development environment:

```bash
# Set up backend development environment
cd backend
# Use uv to create virtual environment and install dependencies
uv sync
```

### Frontend

The React-based user interface is in `frontend/`. For local development:

```bash
cd frontend
npm install
npm start
```

### MCP Server

To develop or test the MCP server:

```bash
cd mcp-server
uv sync  # Install dependencies
uv run planqer-mcp-server  # Run the server
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 Acknowledgments

- Special thanks to all contributors who have helped shape Planqer
- Inspired by real-world cutting optimization challenges in woodworking and manufacturing
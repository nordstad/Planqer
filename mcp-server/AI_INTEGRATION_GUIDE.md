# AI Integration Guide for Planqer MCP Server

This guide helps AI assistants and their users integrate with the Planqer cutting optimization system through the MCP server.

## Quick Start for AI Assistants

The Planqer MCP server provides you with tools to help users optimize cutting plans for woodworking and similar projects. Here's how to use them effectively:

### Basic Workflow

1. **Start with examples** - Use `get_cutting_example` to show users the format
2. **Use demo payloads** - Try `optimize_demo` for quick demonstrations  
3. **Run optimizations** - Use `optimize_cutting` for user-specific problems
4. **Handle complexity** - Use async mode for large/complex optimizations

### Tool Usage Patterns

#### For New Users
```
User: "I need help cutting boards for my project"
Assistant: Let me show you how this works with an example...
→ Call get_cutting_example()
→ Explain the format and walk through the example
```

#### For Demonstrations  
```
User: "Can you show me how this optimization works?"
Assistant: I'll run a demo optimization for you...
→ Call optimize_demo({"example": "kitchen_cabinets"})
→ Explain the results and what they mean
```

#### For Real Projects
```
User: "I need to cut 4 pieces of 12.5", 2 pieces of 8", from 96" boards"
Assistant: I'll optimize that cutting plan for you...
→ Call optimize_cutting({
    "parts": {"12.5": 4, "8": 2},
    "available_board_lengths": [96],
    "saw_blade_width": 0.125,
    "project_name": "User Project"
  })
→ Interpret and explain the results
```

## Understanding Results

When you receive optimization results, help users understand:

### Key Metrics
- **Total Cost**: Number of boards needed
- **Total Waste**: Material that will be unused
- **Algorithm Used**: Which optimization method was applied
- **Computation Time**: How long the optimization took

### Cutting Plan
- **Cut List**: Shows exactly how to cut each board
- **Board Usage**: Each board's pieces and remaining waste
- **Efficiency**: Waste percentage and material utilization

### Example Result Interpretation
```json
{
  "optimal_board_length": 96,
  "cost": 3.0,
  "total_waste": 12.5,
  "cut_list": [
    [12.5, 12.5, 12.5, 12.5],
    [8, 8],
    []
  ]
}
```

**Explain to user:**
- "You'll need 3 boards of 96 inches each"
- "Board 1: Cut four 12.5" pieces (uses 50", wastes 46")"
- "Board 2: Cut two 8" pieces (uses 16", wastes 80")"  
- "Board 3: Not needed (empty cut list)"
- "Total waste: 12.5 inches across all boards"

## Algorithm Selection Guide

Help users choose the right algorithm:

### `first_fit_decreasing` (Default)
- **When**: Large projects (50+ pieces)
- **Benefits**: Very fast, good results
- **Trade-off**: May not find the absolute best solution

### `best_fit_decreasing` (Recommended)
- **When**: Most projects (general use)
- **Benefits**: Better waste reduction than first-fit
- **Trade-off**: Slightly slower but still fast

### `genetic`
- **When**: Complex projects where quality matters most
- **Benefits**: Near-optimal solutions
- **Trade-off**: Takes longer to compute

### `branch_bound`
- **When**: Small projects (<20 pieces) requiring perfection
- **Benefits**: Guaranteed optimal solution
- **Trade-off**: Can be very slow for larger problems

## Async Processing

Use async processing for:
- Complex optimizations (many pieces/constraints)
- When users want to see progress updates
- Large projects that might take time

```javascript
// Start async optimization
optimize_cutting({
  "parts": {...},
  "available_board_lengths": [...],
  "saw_blade_width": 3.0,
  "use_async": true
})

// Result will include:
// - task_id: for tracking progress
// - progress_url: to check status
// - websocket_url: for real-time updates
```

## Common User Scenarios

### Scenario 1: Kitchen Cabinet Project
```
User: "I'm building kitchen cabinets and need these pieces..."
→ Use optimize_demo({"example": "kitchen_cabinets"}) to show similar project
→ Then adapt with user's specific measurements
```

### Scenario 2: Furniture Building
```
User: "I have 300cm boards and need various pieces for furniture"
→ Use metric measurements in parts
→ Consider algorithm="best_fit_decreasing" for furniture projects
```

### Scenario 3: Workshop Storage
```
User: "Quick optimization for some workshop shelving"
→ Use optimize_demo({"example": "custom_project"}) 
→ Fast synchronous optimization is fine
```

### Scenario 4: Complex Project
```
User: "I have a big project with 100+ pieces"
→ Use algorithm="first_fit_decreasing" for speed
→ Consider use_async=true for large projects
```

## Error Handling for AI Assistants

When errors occur, help users understand and resolve them:

### Validation Errors
```
"❌ Validation error: parts.100: Expected number, received string"
```
**Explain**: "The part length needs to be a number, not text. Use 100 instead of '100'"

### API Connection Errors
```
"❌ Connection error: Could not reach the Planqer API"
```
**Explain**: "The optimization service isn't available right now. Please try again in a moment."

### Invalid Measurements
```
"❌ API Error (400): Part length 1000 exceeds maximum board length 500"
```
**Explain**: "One of your pieces (1000 units) is longer than your available boards (500 units). You'll need longer boards or shorter pieces."

## Best Practices for AI Assistants

### 1. Always Validate Input
- Check that part lengths make sense
- Ensure board lengths are larger than parts
- Verify quantities are reasonable

### 2. Explain the Process
- Show users what data you're sending
- Explain what the optimization does
- Interpret results in practical terms

### 3. Provide Context
- Mention saw kerf and why it matters
- Explain algorithm choices
- Give practical cutting advice

### 4. Handle Edge Cases
- Very small or very large projects
- Unusual measurements or units
- Projects where optimization isn't helpful

### 5. Suggest Improvements
- Better algorithms for specific cases
- Ways to reduce waste
- Alternative cutting strategies

## Example Conversation Flow

```
User: I need to cut pieces for a bookshelf project.
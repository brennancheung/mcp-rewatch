# MCP Rewatch - Development Server Manager

## Problem Statement

When using Claude Code (an AI coding assistant), developers face a workflow friction point: after making code changes, they need to manually restart development servers and check for errors. This is particularly problematic because:

1. File deletions can crash dev servers (like `npm run dev`), requiring manual restart
2. Claude Code cannot keep long-running processes alive between operations
3. Developers must manually coordinate between restarting servers, checking logs, and verifying changes in the browser
4. Multiple services often need restarting together (frontend dev server, backend services, database migrations)

## Solution

**MCP Rewatch** is a Model Context Protocol (MCP) server that manages development processes with a restart-and-watch pattern. The name captures the core functionality: **re**starting processes and **watch**ing their output. This gives Claude Code the ability to:

1. Restart development servers after making changes
2. Capture and retrieve process logs
3. Manage multiple named processes (frontend, backend, migrations, etc.)
4. Ensure clean state between test runs

## Technical Requirements

### Core Functionality

1. **Process Management**
   - Start/stop/restart named processes
   - Handle multiple concurrent processes
   - Clean process termination (SIGTERM, then SIGKILL)
   - Capture stdout/stderr output

2. **Log Management**
   - Buffer process output in memory
   - Retrieve logs by process name
   - Clear logs on restart
   - Handle high-volume output without memory issues

3. **MCP Integration**
   - Implement MCP server protocol
   - Expose tools for Claude Code to use
   - Handle connection lifecycle properly

### MCP Tools API

```typescript
// Tool: restart_process
{
  "name": "restart_process",
  "description": "Stop and restart a development process",
  "inputSchema": {
    "type": "object",
    "properties": {
      "name": { "type": "string", "description": "Process name (e.g., 'frontend', 'backend')" }
    },
    "required": ["name"]
  }
}

// Tool: get_process_logs
{
  "name": "get_process_logs",
  "description": "Retrieve logs from a process",
  "inputSchema": {
    "type": "object",
    "properties": {
      "name": { "type": "string", "description": "Process name" },
      "lines": { "type": "number", "description": "Number of recent lines to retrieve (default: all)" }
    },
    "required": ["name"]
  }
}

// Tool: stop_all
{
  "name": "stop_all",
  "description": "Stop all running processes",
  "inputSchema": {
    "type": "object",
    "properties": {}
  }
}

// Tool: list_processes
{
  "name": "list_processes",
  "description": "List all configured processes and their status",
  "inputSchema": {
    "type": "object",
    "properties": {}
  }
}
```

### Configuration Format

```json
{
  "processes": {
    "frontend": {
      "command": "npm",
      "args": ["run", "dev"],
      "cwd": "./frontend",
      "env": { "PORT": "3000" },
      "readyPattern": "ready on http://localhost:3000"
    },
    "backend": {
      "command": "npm",
      "args": ["run", "dev"],
      "cwd": "./backend",
      "env": { "PORT": "8080" }
    },
    "convex": {
      "command": "npx",
      "args": ["convex", "dev"],
      "cwd": "./",
      "readyPattern": "Convex functions ready"
    }
  }
}
```

## Implementation Guidelines

### Technology Stack
- **Language**: TypeScript
- **MCP SDK**: @modelcontextprotocol/sdk
- **Process Management**: Node.js child_process module
- **Logging**: In-memory ring buffer for each process

### Project Structure
```
mcp-rewatch/
├── src/
│   ├── index.ts          # MCP server entry point
│   ├── process-manager.ts # Core process management logic
│   ├── log-buffer.ts     # Ring buffer for log storage
│   └── types.ts          # TypeScript interfaces
├── package.json
├── tsconfig.json
├── README.md
└── config.example.json
```

### Key Implementation Details

1. **Process Lifecycle**
   - Each process is identified by a unique name
   - On restart: kill existing process (if any), clear logs, start new process
   - Graceful shutdown: SIGTERM first, SIGKILL after timeout
   - Track process state: starting, running, stopped, error

2. **Log Management**
   - Implement ring buffer to cap memory usage (e.g., last 10,000 lines)
   - Separate stdout and stderr capture
   - Timestamps for each log line
   - Clear logs on process restart

3. **Error Handling**
   - Process spawn failures
   - Non-zero exit codes
   - MCP connection errors
   - Invalid process names

4. **MCP Server Setup**
   - Use stdio transport for Claude Code integration
   - Properly handle connection lifecycle
   - Implement all tools with proper error responses

### Example Usage Flow

1. Claude Code modifies frontend code
2. Calls `restart_process({ name: "frontend" })`
3. mcp-rewatch kills any existing frontend process, starts new one
4. Claude Code calls `get_process_logs({ name: "frontend", lines: 50 })`
5. Reviews logs for compilation errors or startup issues
6. Uses browser automation MCP to check the running application

## Success Criteria

- Processes restart reliably when requested
- Logs are captured and retrievable
- Multiple processes can be managed simultaneously
- Clean shutdown without orphaned processes
- Integration works smoothly with Claude Code

## Future Enhancements (Not MVP)

- Process health checks
- Log filtering and search
- Process groups (restart multiple together)
- Persistent log storage
- WebSocket streaming for real-time logs
- Ready detection based on configurable patterns

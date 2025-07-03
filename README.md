# MCP Rewatch

A Model Context Protocol (MCP) server that enables AI coding assistants like Claude Code to manage long-running development processes. Without this tool, Claude Code cannot run commands like `npm run dev` because it will block waiting for the process to complete and eventually timeout without seeing any output.

## The Problem

When using Claude Code for development, you hit a fundamental limitation:

```bash
# What happens when Claude Code tries to run a dev server:
$ npm run dev

> my-app@1.0.0 dev
> next dev

▲ Next.js 14.0.0
- Local: http://localhost:3000

[Claude Code is now stuck here, waiting for the process to exit]
[After ~2 minutes, it times out without seeing any output]
[Claude Code never sees compilation errors, success messages, or any logs]
```

**Claude Code cannot:**
- ❌ See any output from long-running processes
- ❌ Know if a dev server started successfully
- ❌ Check for compilation errors
- ❌ Restart servers after making changes
- ❌ Run multiple dev processes simultaneously

This makes it nearly impossible to develop effectively with Claude Code, as you need to manually run all dev servers and restart them after changes.

## The Solution

MCP Rewatch acts as a bridge between Claude Code and your development processes:

- **Runs processes in the background** - Claude Code doesn't block
- **Captures all output** - stdout/stderr saved in memory buffers
- **Provides async access** - Claude Code can check logs anytime
- **Enables restarts** - Claude Code can restart servers after making changes
- **Manages multiple processes** - Run frontend, backend, database servers together

## How It Works

MCP Rewatch acts as an intermediary between Claude Code and your development processes:

1. **Runs as a separate service** that Claude Code can communicate with via MCP
2. **Manages processes independently** - starts your dev servers as child processes
3. **Non-blocking operations** - Claude Code can start/restart processes and immediately continue
4. **Async log retrieval** - Claude Code can check logs later without blocking
5. **Handles lifecycle properly** - graceful shutdown, no orphaned processes

This architecture allows Claude Code to effectively manage long-running processes despite its inherent limitation of not being able to run them directly.

## Installation

Install globally via npm:

```bash
npm install -g mcp-rewatch
```

Or use directly with npx (no installation needed):

```bash
npx mcp-rewatch
```

## Configuration

Create a `rewatch.config.json` file in your project root (where you'll be running Claude Code):

The `startupDelay` should be tuned based on your specific processes:
- Fast tools (scripts, small servers): 1000-2000ms
- Next.js/React dev servers: 3000-5000ms  
- Heavy build processes: 5000-10000ms
- Services with dependencies: 8000-15000ms

```json
{
  "processes": {
    "convex": {
      "command": "pnpm",
      "args": ["dlx", "convex", "dev"],
      "cwd": "./",
      "startupDelay": 5000  // Convex needs more time to start
    },
    "nextjs": {
      "command": "pnpm",
      "args": ["dev"],
      "cwd": "./",
      "env": {
        "PORT": "3000"
      },
      "startupDelay": 4000  // Next.js startup time
    }
  }
}
```

### Configuration Options

- **command**: The executable to run (e.g., `npm`, `pnpm`, `node`)
- **args**: Array of command arguments
- **cwd**: Working directory for the process (relative to where MCP server runs)
- **env**: Additional environment variables (optional)
- **startupDelay**: Time in milliseconds to wait after starting before checking status (default: 3000)
- **readyPattern**: (Not implemented yet - see roadmap)

## Usage with Claude Code

### Quick Start (Single Project)

1. Add MCP Rewatch to Claude Code:
```bash
# Option A: Add for a specific project (recommended)
claude mcp add rewatch "npx mcp-rewatch" --cwd /path/to/your/project

# Option B: Add without cwd (will use Claude Code's launch directory)
claude mcp add rewatch "npx mcp-rewatch"
```

2. Create `rewatch.config.json` in your project root

3. Start Claude Code - MCP Rewatch will look for the config in the specified directory

### User-Scoped Setup (Global Access)

To make MCP Rewatch available in all Claude Code sessions:

```bash
claude mcp add --user rewatch "npx mcp-rewatch" --cwd /path/to/default/project
```

**Important**: Even with `--user` scope, you still need to specify a `--cwd`. The server will only work with that specific project unless you use multiple entries or future v2.0 features.

### Managing Multiple Projects

**Current Limitation**: MCP servers have a fixed working directory set at launch time. This means:
- Each project needs its own MCP server entry with the correct `--cwd`
- Or you need to edit the configuration when switching projects
- The server doesn't know which project you're currently working on in Claude Code

**Workaround Options**:

1. **Multiple server entries** (recommended for now):
```bash
claude mcp add rewatch-app1 "npx mcp-rewatch" --cwd /path/to/app1
claude mcp add rewatch-app2 "npx mcp-rewatch" --cwd /path/to/app2
```

2. **Single entry with manual config updates** when switching projects

**Coming in v2.0**: Project-aware tools that accept a project path parameter, eliminating the need for multiple entries.

## Available Tools

Once configured, Claude Code can use these tools:

### `restart_process`
Stop and restart a development process by name. Waits for the configured `startupDelay` (or 3 seconds by default), then returns initial logs.

```typescript
await restart_process({ name: "nextjs" })
// Output:
// Process 'nextjs' started successfully
//
// Initial logs:
// [2024-01-07T10:00:01.123Z] [stdout] > my-app@1.0.0 dev
// [2024-01-07T10:00:01.456Z] [stdout] > next dev
// [2024-01-07T10:00:02.789Z] [stdout] ▲ Next.js 14.0.0
// [2024-01-07T10:00:03.012Z] [stdout] - Local: http://localhost:3000
```

### `get_process_logs`
Retrieve logs from a process, optionally limiting the number of lines.

```typescript
await get_process_logs({ name: "nextjs", lines: 50 })
// Returns last 50 lines of logs from the Next.js process

await get_process_logs({ name: "convex" })
// Returns all available logs from the Convex process
```

### `list_processes`
List all configured processes and their current status.

```typescript
await list_processes()
// Output:
// nextjs: running (PID: 12345)
// convex: stopped
```

### `stop_all`
Stop all running processes gracefully.

```typescript
await stop_all()
// Output: "All processes stopped"
```

## Typical Workflow

Here's how Claude Code uses MCP Rewatch during development:

1. **Initial setup** (done once by you):
   - Create `rewatch.config.json` in your project
   - Start Claude Code - servers can be started on demand

2. **During development** Claude Code will:
   - Make code changes to your files
   - Call `restart_process({ name: "nextjs" })` to restart the server
   - **Automatically receive initial logs** after a 3-second startup delay
   - Check the logs for success indicators or errors
   - Continue with more changes based on the results
   - Call `get_process_logs({ name: "nextjs" })` later if needed

3. **Key benefits**:
   - Claude Code never gets blocked by long-running processes
   - You don't need to manually restart servers after every change
   - Claude Code can verify changes worked by checking logs
   - Multiple servers can be managed in parallel

### How It Works

When `restart_process` is called:

1. **Stops** any existing process with that name
2. **Starts** the new process
3. **Waits** for the configured `startupDelay` (default: 3 seconds)
4. **Returns** the startup status and initial logs

This gives Claude Code immediate feedback about whether:
- The process started successfully
- There were immediate errors (port conflicts, missing deps)
- The server is beginning to compile/build

For ongoing monitoring, Claude Code can use `get_process_logs` to check progress later.

## Why This Matters

Without MCP Rewatch, the development flow with Claude Code is frustrating:
- ❌ Claude Code tries `npm run dev` → blocks and times out
- ❌ You make changes → servers break → manual restart needed
- ❌ No way to check if changes compiled successfully

With MCP Rewatch:
- ✅ Claude Code uses `restart_process` → returns immediately
- ✅ Servers restart automatically after changes
- ✅ Claude Code can check logs to verify success

## Troubleshooting

- **Processes not starting**: Check that `rewatch.config.json` exists in your project root
- **Permission errors**: Ensure the commands in your config have proper execution permissions
- **Can't find tools**: Verify MCP Rewatch appears in Claude Code's MCP menu
- **Logs not appearing**: Processes might be buffering output; some servers need specific flags to disable buffering

## Development

To contribute to MCP Rewatch:

```bash
git clone https://github.com/brennancheung/mcp-rewatch.git
cd mcp-rewatch
pnpm install
pnpm build
```

For development, you can point Claude Code directly to the built output:

```json
{
  "mcpServers": {
    "rewatch-dev": {
      "command": "node",
      "args": ["/path/to/mcp-rewatch/dist/index.js"],
      "cwd": "/path/to/test/project"
    }
  }
}
```

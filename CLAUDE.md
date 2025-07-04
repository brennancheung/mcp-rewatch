# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

MCP Rewatch is an MCP (Model Context Protocol) server that manages long-running development processes for Claude Code. It solves the problem that Claude Code cannot handle non-terminating processes like development servers, file watchers, or build tools.

## Build Commands

- `pnpm build` - Compiles TypeScript to JavaScript (required before running)
- `pnpm test` - Builds and runs verification tests
- `pnpm dev` - Runs TypeScript compiler in watch mode (DO NOT use this - it's a long-running process)

## Architecture

The codebase follows a modular architecture:

1. **MCP Server** (`src/index.ts`) - Main entry point that registers 4 tools:
   - `restart_process` - Stop and restart a development process
   - `get_process_logs` - Retrieve logs from a running process
   - `list_processes` - List all configured processes and their status
   - `stop_all` - Stop all running processes

2. **ProcessManager** (`src/process-manager.ts`) - Core process management:
   - Spawns detached child processes that survive parent termination
   - Captures stdout/stderr in memory buffers
   - Handles graceful shutdown (SIGTERM then SIGKILL after timeout)
   - Uses process groups on Unix for proper cleanup

3. **LogBuffer** (`src/log-buffer.ts`) - In-memory circular buffer:
   - Default 10,000 line capacity
   - Truncates lines over 5,000 characters
   - Timestamps all entries

4. **ObserverLogger** (`src/observer-logger.ts`) - Optional external logging via HTTP POST

## Configuration

The server requires a `rewatch.config.json` file in the working directory where Claude Code runs. Example structure:

```json
{
  "processes": {
    "process-name": {
      "command": "executable",
      "args": ["arg1", "arg2"],
      "cwd": "relative/path",
      "env": { "KEY": "value" },
      "startupDelay": 3000
    }
  },
  "observer": {
    "url": "http://localhost:3001/api/logs"
  }
}
```

## Important Implementation Notes

- All file paths in configuration are resolved relative to the config file location
- Process names must be unique and are used as identifiers in the tools
- Processes run detached with stdio piped to capture output
- The server handles SIGTERM/SIGINT for graceful shutdown
- Log buffers are stored in memory only - logs are lost on server restart

## Type System

The codebase uses Zod for runtime validation of:
- Tool inputs (process names, line counts)
- Configuration file structure
- All types are exported from `src/types.ts`

## Testing

Run `pnpm test` to execute the test suite in `/test`. Tests verify:
- Process lifecycle management
- Log capture and retrieval
- Error handling for various process behaviors
- Graceful shutdown scenarios
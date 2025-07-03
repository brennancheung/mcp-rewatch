# MCP Rewatch Roadmap

## v1.0 (Current)
- ✅ Basic process management (start/stop/restart)
- ✅ Log capture and retrieval
- ✅ Multiple named processes
- ✅ MCP tools integration
- ✅ Single project support (via cwd)

## v2.0 - Multi-Project Support
- [ ] Add optional `project` parameter to all tools
- [ ] Support both absolute and relative paths
- [ ] Config file discovery (walk up directory tree)
- [ ] Cache configs to avoid repeated file reads
- [ ] Backwards compatible with v1.0

## v3.0 - Project Registry
- [ ] `register_project` tool for aliasing projects
- [ ] `list_projects` tool to see registered projects
- [ ] `set_default_project` for session defaults
- [ ] Store registry in `~/.config/mcp-rewatch/projects.json`
- [ ] Use aliases in all tool calls

## v4.0 - Smart Ready Detection
- [ ] Framework auto-detection (Next.js, Vite, Convex, etc.)
- [ ] Return ready status in restart_process response
- [ ] Configurable ready patterns and timeouts
- [ ] Port-based ready detection
- [ ] Early failure detection (exit codes, error patterns)
- [ ] Built-in patterns for common frameworks

## v5.0 - Enhanced Features
- [ ] Process health checks
- [ ] Log filtering and search
- [ ] Process groups (restart multiple together)
- [ ] Auto-restart on crash
- [ ] Port conflict detection and resolution

## Future Ideas
- [ ] Web UI for monitoring processes
- [ ] Integration with other MCP tools
- [ ] Process templates for common setups
- [ ] Automatic process discovery
- [ ] Resource usage monitoring
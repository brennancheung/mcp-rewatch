# Architecture Notes - Multi-Project Support

## The Problem with Current Approach

The `cwd` in MCP configuration is static - it's set when the MCP server starts and doesn't change. This means:
- You need a separate MCP server entry for each project
- Or you have to edit the config file every time you switch projects
- Claude Code doesn't pass dynamic context about which project you're working on

## Proposed Solution: Project-Aware Tools

Make the MCP server globally available and add project awareness to each tool call:

### 1. Single Global Configuration
```json
{
  "mcpServers": {
    "rewatch": {
      "command": "npx",
      "args": ["mcp-rewatch"]
    }
  }
}
```

No `cwd` needed - works for all projects!

### 2. Project-Aware Tool Calls

**Option A: Explicit project paths**
```typescript
// Restart process for a specific project
restart_process({ 
  project: "/Users/me/projects/my-app",
  name: "nextjs" 
})

// Or use relative paths from home
restart_process({ 
  project: "~/projects/my-app",
  name: "nextjs" 
})
```

**Option B: Project aliases (register once)**
```typescript
// Register projects with friendly names
register_project({ 
  alias: "my-app",
  path: "/Users/me/projects/my-app" 
})

// Then use the alias
restart_process({ 
  project: "my-app",
  name: "nextjs" 
})
```

**Option C: Default project (backwards compatible)**
```typescript
// Set a default project for the session
set_default_project({ path: "/Users/me/projects/my-app" })

// Then commands work without specifying project
restart_process({ name: "nextjs" })
```

### 3. Config File Discovery

When a project is specified, the server:
1. Looks for `rewatch.config.json` in the project directory
2. If not found, walks up the directory tree
3. Caches the config for future calls

## Use Cases

1. **Developer with multiple projects**
   - Working on 5-10 different repos
   - Each has different dev servers (Next.js, Vite, Convex, Django, etc.)
   - Switches between projects frequently
   - Sometimes works on multiple projects simultaneously

2. **Different project structures**
   - Monorepos with multiple services
   - Single service projects
   - Projects with different package managers (npm, pnpm, yarn)

3. **Workflow patterns**
   - Open project in IDE/terminal
   - Start Claude Code to make changes
   - Need dev servers for that specific project
   - May have multiple Claude Code instances for different projects

## Current Problem

Having to specify `cwd` in mcpServers config means either:
- Multiple MCP server entries (rewatch-project1, rewatch-project2, etc.)
- Constantly editing the config when switching projects
- Can't easily work on multiple projects

## Architectural Options

### Option 1: Project-Aware Global Server
- Single MCP server instance running globally
- Each tool call includes project path
- Server maintains separate process managers per project

```typescript
restart_process({ project: "/path/to/project", name: "nextjs" })
```

### Option 2: Auto-Detection Based on Context
- MCP server uses Claude Code's current context
- Looks for rewatch.config.json in:
  1. Current working directory
  2. Parent directories (walk up tree)
  3. Workspace root

### Option 3: Project Registration
- Register projects once with the server
- Use project aliases in commands

```typescript
register_project({ alias: "my-app", path: "/path/to/project" })
restart_process({ project: "my-app", name: "nextjs" })
```

### Option 4: Separate Config Files
- Global config: ~/.config/mcp-rewatch/projects.json
- Lists all projects and their configs
- Server loads all on startup

## Implementation Plan

### Phase 1: Add Project Parameter (Quick Win)
1. Add optional `project` parameter to all tools
2. If provided, look for config in that directory
3. If not provided, use server's cwd (backwards compatible)

### Phase 2: Project Registry
1. Add `register_project` and `list_projects` tools
2. Store project aliases in ~/.config/mcp-rewatch/projects.json
3. Allow using aliases in all tool calls

### Phase 3: Smart Defaults
1. Add `set_default_project` tool
2. Remember default for the session
3. Auto-discover config files in parent directories

## Benefits

1. **One MCP config for all projects** - No more editing config files
2. **Work on multiple projects** - Just specify which one in the tool call
3. **Backwards compatible** - Still works with cwd-based config
4. **Natural workflow** - Register projects once, use aliases forever
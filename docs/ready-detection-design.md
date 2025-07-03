# Ready Detection Design

## The Problem

Simple string matching for "ready" patterns has several issues:

1. **Timing Issues**
   - Claude Code might check logs immediately after restart
   - Server hasn't had time to output anything yet
   - Need to avoid premature "not ready" conclusions

2. **Pattern Reliability**
   - Ready messages change between versions
   - Different frameworks use different messages
   - Error output might contain the word "ready"

3. **Error Scenarios**
   - Port already in use
   - Syntax errors preventing startup
   - Missing dependencies
   - The ready pattern never appears

4. **User Experience**
   - Users shouldn't need to know exact strings
   - Should work out of the box for common frameworks

## Use Cases

### Successful Start
```
[restart_process called]
→ Server starting...
→ Compiling...
→ Ready on http://localhost:3000
[Server is ready, Claude Code can proceed]
```

### Failed Start - Port Conflict
```
[restart_process called]
→ Server starting...
→ Error: Port 3000 is already in use
[Process exits, need to report failure]
```

### Failed Start - Syntax Error
```
[restart_process called]
→ Server starting...
→ SyntaxError: Unexpected token
→ Build failed
[Server never becomes ready]
```

### Slow Start
```
[restart_process called]
→ Server starting...
→ Installing dependencies...
→ Building... (30 seconds)
→ Ready!
[Need patience, not premature failure]
```

## Proposed Solution: Multi-Strategy Approach

### 1. Framework Detection
```json
{
  "processes": {
    "frontend": {
      "command": "npm",
      "args": ["run", "dev"],
      "framework": "nextjs"  // Auto-detect patterns
    }
  }
}
```

Built-in patterns for common frameworks:
- Next.js: "ready on", "started server on"
- Vite: "ready in", "Local:"
- Create React App: "Compiled successfully"
- Convex: "Convex functions ready"
- Django: "Starting development server at"
- Rails: "Listening on"

### 2. Port Monitoring
```json
{
  "processes": {
    "frontend": {
      "command": "npm",
      "args": ["run", "dev"],
      "port": 3000,
      "portTimeout": 30000  // Max time to wait for port
    }
  }
}
```

### 3. Smart Ready Detection

```typescript
interface ReadyStrategy {
  framework?: string;           // Use built-in patterns
  patterns?: string[];         // Custom patterns
  port?: number;              // Port to monitor
  timeout?: number;           // Max wait time
  stabilityDelay?: number;    // Wait after pattern match
}
```

### 4. Process State Machine

```
STOPPED → STARTING → READY → RUNNING
           ↓          ↓
         ERROR ← ← ← ←
```

### 5. Implementation Flow

When `restart_process` is called:

1. **Start Process**
   - Kill existing process if any
   - Start new process
   - Set state to STARTING

2. **Monitor for Ready**
   - Start timeout timer
   - Monitor process output
   - Check for error patterns
   - Monitor specified port
   - Look for ready patterns

3. **Determine Ready State**
   - Pattern matched + port open = READY
   - Pattern matched (no port) = READY
   - Port open (no pattern) = READY after delay
   - Process exited = ERROR
   - Timeout reached = ERROR

4. **Return to Claude Code**
   ```typescript
   {
     success: true,
     state: "ready",
     message: "Next.js server ready on port 3000",
     duration: 3500  // ms to become ready
   }
   ```

   Or on failure:
   ```typescript
   {
     success: false,
     state: "error", 
     message: "Port 3000 already in use",
     logs: ["last", "10", "lines", "of", "output"]
   }
   ```

## Enhanced Tool API

```typescript
// Restart with smart detection
restart_process({ 
  name: "nextjs",
  wait_for_ready: true,  // Default: true
  ready_timeout: 30000   // Default: 30s
})

// Returns immediately (current behavior)
restart_process({ 
  name: "nextjs",
  wait_for_ready: false
})

// Check ready state separately
check_process_ready({
  name: "nextjs"
})
// Returns: { ready: true, message: "Server running on port 3000" }
```

## Configuration Examples

### Auto-detected (easiest)
```json
{
  "processes": {
    "dev": {
      "command": "npm",
      "args": ["run", "dev"]
      // Framework auto-detected from package.json
    }
  }
}
```

### Port-based
```json
{
  "processes": {
    "api": {
      "command": "python",
      "args": ["manage.py", "runserver"],
      "port": 8000
    }
  }
}
```

### Custom patterns
```json
{
  "processes": {
    "custom": {
      "command": "./start.sh",
      "readyPatterns": [
        "Server initialized",
        "Ready to accept connections"
      ],
      "errorPatterns": [
        "Failed to start",
        "Error:",
        "already in use"
      ]
    }
  }
}
```

## Benefits

1. **Works out of the box** - Auto-detects common frameworks
2. **Reliable** - Multiple strategies increase success rate
3. **Fast feedback** - Errors detected immediately
4. **User-friendly** - No need to know exact strings
5. **Flexible** - Can customize when needed
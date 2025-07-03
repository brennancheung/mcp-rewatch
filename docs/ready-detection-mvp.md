# Ready Detection - MVP Approach

## Core Problems to Solve

1. **Claude Code checks too early** → Add minimum wait time
2. **Process crashes before ready** → Detect early exit as failure
3. **Users don't know patterns** → Provide framework presets

## Simple MVP Solution

### 1. Add Ready Status to restart_process Response

```typescript
restart_process({ name: "nextjs" })

// Current response:
"Process 'nextjs' restarted successfully"

// New response:
{
  "status": "started",  // "started" | "ready" | "failed"
  "message": "Process 'nextjs' started, waiting for ready state...",
  "hint": "Check logs with get_process_logs in a few seconds"
}
```

### 2. Add Simple Ready Detection

```typescript
interface ProcessConfig {
  command: string
  args: string[]
  cwd?: string
  env?: Record<string, string>
  
  // New ready detection options
  ready?: {
    delay?: number      // Wait N ms before checking (default: 2000)
    timeout?: number    // Give up after N ms (default: 30000)
    pattern?: string    // Optional pattern to match
  }
}
```

### 3. Framework Presets

```typescript
const FRAMEWORK_PATTERNS = {
  'next': /ready on|started server on/i,
  'vite': /ready in|Local:/i,
  'convex': /Convex functions ready/i,
  'webpack': /compiled successfully/i
}

// Auto-detect from package.json scripts
function detectFramework(args: string[]): string | null {
  const command = args.join(' ')
  if (command.includes('next dev')) return 'next'
  if (command.includes('vite')) return 'vite'
  if (command.includes('convex dev')) return 'convex'
  // etc...
}
```

### 4. Process Lifecycle

```typescript
class ProcessManager {
  async restart(name: string): Promise<RestartResult> {
    // 1. Stop existing process
    await this.stop(name)
    
    // 2. Start new process
    const process = await this.start(name)
    
    // 3. Wait for ready (if configured)
    const readyConfig = this.getReadyConfig(name)
    if (readyConfig) {
      const ready = await this.waitForReady(name, readyConfig)
      return {
        status: ready ? 'ready' : 'timeout',
        message: ready 
          ? `Process '${name}' is ready`
          : `Process '${name}' started but ready state unclear`,
        logs: this.getRecentLogs(name, 10)
      }
    }
    
    // 4. Return immediately if no ready config
    return {
      status: 'started',
      message: `Process '${name}' started`,
      hint: 'Check logs in a few seconds'
    }
  }
  
  private async waitForReady(
    name: string, 
    config: ReadyConfig
  ): Promise<boolean> {
    const startTime = Date.now()
    const timeout = config.timeout || 30000
    const delay = config.delay || 2000
    
    // Initial delay
    await sleep(delay)
    
    // Check if process already exited (failure)
    if (!this.isRunning(name)) {
      return false
    }
    
    // If no pattern, just check if still running after delay
    if (!config.pattern) {
      return this.isRunning(name)
    }
    
    // Wait for pattern
    while (Date.now() - startTime < timeout) {
      const logs = this.getRecentLogs(name, 50)
      if (logs.some(line => config.pattern!.test(line))) {
        return true
      }
      
      if (!this.isRunning(name)) {
        return false
      }
      
      await sleep(500)
    }
    
    return false
  }
}
```

### 5. Config Examples

```json
{
  "processes": {
    "nextjs": {
      "command": "npm",
      "args": ["run", "dev"],
      "ready": {
        "delay": 3000,
        "timeout": 20000
      }
    },
    "api": {
      "command": "python",
      "args": ["app.py"],
      "ready": {
        "pattern": "Flask app running",
        "timeout": 10000
      }
    },
    "quick": {
      "command": "node",
      "args": ["script.js"]
      // No ready config = returns immediately
    }
  }
}
```

### 6. Tool Response Examples

**Successful ready detection:**
```json
{
  "status": "ready",
  "message": "Process 'nextjs' is ready",
  "duration": 3500,
  "logs": [
    "[2024-01-07T10:00:01] [stdout] ▲ Next.js 14.0.0",
    "[2024-01-07T10:00:04] [stdout] ✓ Ready on http://localhost:3000"
  ]
}
```

**Process crashed:**
```json
{
  "status": "failed",
  "message": "Process 'api' exited unexpectedly",
  "exitCode": 1,
  "logs": [
    "[2024-01-07T10:00:01] [stderr] Error: Port 8000 already in use"
  ]
}
```

**Timeout (process running but pattern not found):**
```json
{
  "status": "timeout",
  "message": "Process 'custom' started but ready state unclear",
  "hint": "Process is running. Check logs for any issues.",
  "logs": ["[last 10 lines of output...]"]
}
```

## Benefits

1. **Simple to implement** - Just delay + pattern matching
2. **Handles common cases** - Early exit, timeout, success
3. **Backward compatible** - Works without ready config
4. **Helpful to Claude Code** - Provides status and recent logs
5. **Framework friendly** - Can auto-detect common patterns
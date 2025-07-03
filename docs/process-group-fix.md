# Process Group Management Fix

## Problem

When stopping processes, only the parent process was being killed, leaving child processes orphaned. For example:
- Running `npm run dev` spawns npm as parent and Next.js server as child
- Stopping only killed npm, leaving Next.js server running
- This happened even when quitting Claude Code

## Root Causes

1. **No process group management**: Processes were spawned without `detached: true`, so they weren't in their own process group
2. **Only killing parent PID**: The stop method only sent signals to the parent process, not its children
3. **No cleanup on exit**: When the MCP server exited, it didn't ensure all managed processes were terminated

## Solution

### 1. Create Process Groups

```typescript
const proc = spawn(command, args, {
  // ...
  detached: process.platform !== 'win32'  // Create new process group on Unix
})
```

This puts the process and all its children in a new process group.

### 2. Kill Entire Process Group

```typescript
// Kill process group using negative PID
if (process.platform !== 'win32' && proc.pid) {
  process.kill(-proc.pid, 'SIGTERM')  // Negative PID kills entire group
}
```

Using negative PID with `process.kill()` sends the signal to all processes in the group.

### 3. Emergency Cleanup on Exit

```typescript
process.on('exit', () => {
  // Synchronously kill all process groups
  for (const [name, managed] of processes) {
    if (managed.process && managed.pid) {
      process.kill(-managed.pid, 'SIGKILL')
    }
  }
})
```

This ensures no processes are left running when the MCP server exits.

## Platform Considerations

- **Unix/Linux/macOS**: Full process group support using negative PIDs
- **Windows**: Process groups work differently; falls back to single process killing
- The `detached` option is only set on non-Windows platforms

## Testing

To verify the fix:
1. Start a dev server that spawns children (like `npm run dev`)
2. Use `ps aux | grep node` to see all processes
3. Stop the process via MCP
4. Verify all child processes are also terminated
5. Quit Claude Code and verify no orphaned processes remain
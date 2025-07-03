# MCP Rewatch Tests

## Running Tests

```bash
# From the project root
pnpm test

# Or directly
cd test && node verify.js
```

## Test Scenarios

The verification script tests:

1. **Quick Echo Process** - Process that exits immediately after output
   - Verifies that we correctly detect process exit
   - Captures output before exit

2. **Failing Process** - Process that exits with error code
   - Simulates port conflict error
   - Verifies error detection and log capture

3. **Slow Build Process** - Process with delayed output
   - Takes 3 seconds to show "Build complete"
   - Tests that startupDelay (4s) waits long enough

4. **Long Running Server** - Continuous output process
   - Simulates a typical dev server
   - Generates logs continuously for testing log retrieval

5. **Get Process Logs** - Tests log retrieval from running process
   - Waits for more logs to be generated
   - Retrieves last N logs

## Test Configuration

See `test/rewatch.config.json` for the test process configurations. Each process has different `startupDelay` values to test various scenarios.

## What's Verified

- ✅ Process startup with configurable delays
- ✅ Initial log capture and return
- ✅ Detection of process exit (success vs failure)
- ✅ Continuous log buffering
- ✅ Log retrieval for running processes
- ✅ Process cleanup (stopAll)

## Manual Testing

To manually test with real dev servers:

1. Create a `rewatch.config.json` in your project
2. Add MCP Rewatch to Claude Code
3. Use the tools to manage your processes
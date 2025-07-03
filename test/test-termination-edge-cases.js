#!/usr/bin/env node

const { ProcessManager } = require('../dist/process-manager.js')
const { exec } = require('child_process')
const { promisify } = require('util')
const execAsync = promisify(exec)

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
}

async function isProcessRunning(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return false
  }
}

async function testEdgeCases() {
  console.log(`${colors.blue}=== Testing Edge Cases ===${colors.reset}\n`)
  
  const config = {
    processes: {
      "stubborn": {
        "command": "node",
        "args": ["test-stubborn-process.js"],
        "cwd": __dirname,
        "startupDelay": 1000
      },
      "detached-process": {
        "command": "node",
        "args": ["-e", "const { spawn } = require('child_process'); console.log('Parent spawning detached child...'); const child = spawn('node', ['-e', 'setInterval(() => console.log(\"Detached child running\"), 1000)'], { detached: true, stdio: 'ignore' }); child.unref(); console.log('Parent exiting, leaving detached child...');"],
        "startupDelay": 1000
      }
    }
  }
  
  const pm = new ProcessManager(config.processes)
  
  // Test 1: Stubborn process that ignores SIGTERM
  console.log(`${colors.yellow}Test 1: Stubborn process ignoring SIGTERM${colors.reset}`)
  const result1 = await pm.restart('stubborn')
  console.log(`Started: ${result1.success}`)
  
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  const processes = pm.listProcesses()
  const stubbornProcess = processes.find(p => p.name === 'stubborn')
  console.log(`Stubborn process PID: ${stubbornProcess.pid}`)
  
  // Get logs before stopping
  const logsBefore = pm.getLogs('stubborn', 5)
  console.log('\nLogs before stop:')
  logsBefore.slice(-3).forEach(log => console.log(`  ${colors.gray}${log}${colors.reset}`))
  
  console.log('\nStopping stubborn process (should force kill after 5 seconds)...')
  const stopStart = Date.now()
  await pm.stop('stubborn')
  const stopDuration = Date.now() - stopStart
  
  console.log(`Stop took ${stopDuration}ms`)
  
  // Check logs after stop
  const logsAfter = pm.getLogs('stubborn', 10)
  console.log('\nLogs after stop:')
  logsAfter.slice(-5).forEach(log => console.log(`  ${colors.gray}${log}${colors.reset}`))
  
  await new Promise(resolve => setTimeout(resolve, 1000))
  
  const stillRunning = await isProcessRunning(stubbornProcess.pid)
  console.log(`Stubborn process still running: ${stillRunning ? colors.red + 'YES' : colors.green + 'NO'}${colors.reset}`)
  
  // Test 2: Process that spawns detached children
  console.log(`\n${colors.yellow}Test 2: Process with detached children${colors.reset}`)
  const result2 = await pm.restart('detached-process')
  console.log(`Started: ${result2.success}`)
  
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  // Look for any orphaned node processes
  console.log('\nChecking for orphaned processes...')
  try {
    const { stdout } = await execAsync('ps aux | grep "Detached child running" | grep -v grep || true')
    if (stdout.trim()) {
      console.log(`${colors.red}Found orphaned processes:${colors.reset}`)
      console.log(stdout)
    } else {
      console.log(`${colors.green}No orphaned processes found${colors.reset}`)
    }
  } catch (err) {
    console.log('Error checking for orphaned processes:', err.message)
  }
  
  // Clean up
  await pm.stopAll()
  
  // Final check for any lingering processes
  console.log('\nFinal check for lingering processes...')
  try {
    const { stdout } = await execAsync('ps aux | grep -E "test-stubborn|Detached child" | grep -v grep || true')
    if (stdout.trim()) {
      console.log(`${colors.red}Found lingering processes:${colors.reset}`)
      console.log(stdout)
      
      // Clean them up
      const pids = stdout.trim().split('\n').map(line => line.trim().split(/\s+/)[1])
      for (const pid of pids) {
        try {
          process.kill(pid, 'SIGKILL')
          console.log(`Killed lingering process ${pid}`)
        } catch (err) {
          // Process might have already exited
        }
      }
    } else {
      console.log(`${colors.green}No lingering processes found${colors.reset}`)
    }
  } catch (err) {
    console.log('Error in final check:', err.message)
  }
  
  console.log(`\n${colors.blue}=== Test Complete ===${colors.reset}`)
}

testEdgeCases().catch(err => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, err)
  process.exit(1)
})
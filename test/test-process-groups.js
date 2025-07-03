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

async function getProcessTree(pid) {
  try {
    // Use ps to find all child processes
    const { stdout } = await execAsync(`ps --ppid ${pid} -o pid --no-headers || true`)
    const childPids = stdout.trim().split('\n').filter(Boolean).map(p => p.trim())
    return childPids
  } catch (err) {
    return []
  }
}

async function isProcessRunning(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return false
  }
}

async function testProcessTermination() {
  console.log(`${colors.blue}=== Testing Process Termination ===${colors.reset}\n`)
  
  const config = {
    processes: {
      "parent-with-children": {
        "command": "node",
        "args": ["test-child-processes.js"],
        "cwd": __dirname,
        "startupDelay": 2000
      },
      "shell-process": {
        "command": "sh",
        "args": ["-c", "while true; do echo 'Shell process running'; sleep 2; done"],
        "startupDelay": 1000
      }
    }
  }
  
  const pm = new ProcessManager(config.processes)
  
  // Test 1: Process with child processes
  console.log(`${colors.yellow}Test 1: Process with child processes${colors.reset}`)
  const result1 = await pm.restart('parent-with-children')
  console.log(`Started: ${result1.success}`)
  
  // Wait a bit to let children spawn
  await new Promise(resolve => setTimeout(resolve, 3000))
  
  // Get process info
  const processes = pm.listProcesses()
  const parentProcess = processes.find(p => p.name === 'parent-with-children')
  console.log(`Parent PID: ${parentProcess.pid}`)
  
  // Find child processes
  const childPids = await getProcessTree(parentProcess.pid)
  console.log(`Found ${childPids.length} child processes: ${childPids.join(', ')}`)
  
  // Stop the parent
  console.log('\nStopping parent process...')
  await pm.stop('parent-with-children')
  
  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 1000))
  
  // Check if processes are still running
  const parentRunning = await isProcessRunning(parentProcess.pid)
  console.log(`Parent still running: ${parentRunning ? colors.red + 'YES' : colors.green + 'NO'}${colors.reset}`)
  
  for (const childPid of childPids) {
    const childRunning = await isProcessRunning(childPid)
    console.log(`Child ${childPid} still running: ${childRunning ? colors.red + 'YES' : colors.green + 'NO'}${colors.reset}`)
  }
  
  // Test 2: Shell process
  console.log(`\n${colors.yellow}Test 2: Shell process with while loop${colors.reset}`)
  const result2 = await pm.restart('shell-process')
  console.log(`Started: ${result2.success}`)
  
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  const shellProcess = pm.listProcesses().find(p => p.name === 'shell-process')
  console.log(`Shell process PID: ${shellProcess.pid}`)
  
  console.log('\nStopping shell process...')
  await pm.stop('shell-process')
  
  await new Promise(resolve => setTimeout(resolve, 1000))
  
  const shellRunning = await isProcessRunning(shellProcess.pid)
  console.log(`Shell process still running: ${shellRunning ? colors.red + 'YES' : colors.green + 'NO'}${colors.reset}`)
  
  // Clean up
  await pm.stopAll()
  
  console.log(`\n${colors.blue}=== Test Complete ===${colors.reset}`)
}

testProcessTermination().catch(err => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, err)
  process.exit(1)
})
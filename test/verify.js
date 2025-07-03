#!/usr/bin/env node

const { ProcessManager } = require('../dist/process-manager.js')
const { readFileSync } = require('fs')
const { resolve } = require('path')

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
}

async function runVerification() {
  console.log(`${colors.blue}=== MCP Rewatch Verification ===${colors.reset}\n`)
  
  // Load config
  const config = JSON.parse(readFileSync(resolve(__dirname, 'rewatch.config.json'), 'utf-8'))
  const pm = new ProcessManager(config.processes)
  
  const tests = [
    {
      name: 'Quick Echo Process (exits immediately)',
      process: 'quick-echo',
      expectedSuccess: false,  // Process exits after echo, so it won't be running
      checkLogs: (logs) => logs.some(log => log.includes('Server ready'))
    },
    {
      name: 'Failing Process',
      process: 'fail-fast',
      expectedSuccess: false,
      checkLogs: (logs) => logs.some(log => log.includes('Port already in use'))
    },
    {
      name: 'Slow Build Process',
      process: 'slow-build', 
      expectedSuccess: true,
      checkLogs: (logs) => logs.some(log => log.includes('Build complete'))
    },
    {
      name: 'Long Running Server',
      process: 'test-server',
      expectedSuccess: true,
      checkLogs: (logs) => logs.some(log => log.includes('Listening on port'))
    }
  ]
  
  let passed = 0
  let failed = 0
  
  for (const test of tests) {
    console.log(`${colors.yellow}Test: ${test.name}${colors.reset}`)
    console.log(`Process: ${test.process}`)
    
    try {
      const result = await pm.restart(test.process)
      const statusMatch = result.success === test.expectedSuccess
      const logsMatch = test.checkLogs(result.logs)
      
      console.log(`Status: ${result.success ? 'running' : 'failed'} (expected ${test.expectedSuccess ? 'running' : 'failed'})`)
      console.log(`Logs (${result.logs.length} lines):`)
      result.logs.forEach(log => console.log(`  ${colors.gray}${log}${colors.reset}`))
      
      if (statusMatch && logsMatch) {
        console.log(`${colors.green}✓ PASS${colors.reset}\n`)
        passed++
      } else {
        console.log(`${colors.red}✗ FAIL${colors.reset}`)
        if (!statusMatch) console.log(`  Expected success=${test.expectedSuccess}, got ${result.success}`)
        if (!logsMatch) console.log(`  Expected logs not found`)
        console.log()
        failed++
      }
    } catch (err) {
      console.log(`${colors.red}✗ ERROR: ${err.message}${colors.reset}\n`)
      failed++
    }
  }
  
  // Test get_process_logs
  console.log(`${colors.yellow}Test: Get Process Logs${colors.reset}`)
  await new Promise(resolve => setTimeout(resolve, 3000)) // Let test-server generate more logs
  const logs = pm.getLogs('test-server', 5)
  console.log(`Got ${logs.length} recent logs:`)
  logs.forEach(log => console.log(`  ${colors.gray}${log}${colors.reset}`))
  console.log(`${colors.green}✓ PASS${colors.reset}\n`)
  passed++
  
  // Clean up
  console.log(`${colors.yellow}Cleaning up...${colors.reset}`)
  await pm.stopAll()
  
  // Summary
  console.log(`\n${colors.blue}=== Summary ===${colors.reset}`)
  console.log(`${colors.green}Passed: ${passed}${colors.reset}`)
  console.log(`${colors.red}Failed: ${failed}${colors.reset}`)
  
  if (failed === 0) {
    console.log(`\n${colors.green}✅ All tests passed!${colors.reset}`)
  } else {
    console.log(`\n${colors.red}❌ Some tests failed${colors.reset}`)
  }
  
  process.exit(failed > 0 ? 1 : 0)
}

runVerification().catch(err => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, err)
  process.exit(1)
})
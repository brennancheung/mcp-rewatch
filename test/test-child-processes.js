#!/usr/bin/env node

const { spawn } = require('child_process')

console.log(`Parent process started (PID: ${process.pid})`)

// Create multiple child processes
const children = []
for (let i = 1; i <= 3; i++) {
  const child = spawn('node', ['-e', `
    console.log('Child ${i} started (PID: ' + process.pid + ')');
    setInterval(() => {
      console.log('Child ${i} running (PID: ' + process.pid + ')');
    }, 2000);
    process.on('SIGTERM', () => {
      console.log('Child ${i} received SIGTERM, exiting...');
      process.exit(0);
    });
  `], { stdio: 'inherit' })
  
  children.push(child)
  console.log(`Spawned child ${i} (PID: ${child.pid})`)
}

// Handle parent termination
process.on('SIGTERM', () => {
  console.log('Parent received SIGTERM, cleaning up children...')
  children.forEach((child, index) => {
    console.log(`Terminating child ${index + 1} (PID: ${child.pid})`)
    child.kill('SIGTERM')
  })
  
  setTimeout(() => {
    console.log('Parent exiting...')
    process.exit(0)
  }, 500)
})

// Keep parent running
setInterval(() => {
  console.log(`Parent still running (PID: ${process.pid})`)
}, 3000)
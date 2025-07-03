#!/usr/bin/env node

console.log(`Stubborn process started (PID: ${process.pid})`)

// Ignore SIGTERM
process.on('SIGTERM', () => {
  console.log('Stubborn process: Received SIGTERM but ignoring it!')
})

// Only exit on SIGKILL (which can't be caught)
process.on('SIGINT', () => {
  console.log('Stubborn process: Received SIGINT but ignoring it!')
})

// Keep running
setInterval(() => {
  console.log(`Stubborn process still running (PID: ${process.pid})`)
}, 1000)
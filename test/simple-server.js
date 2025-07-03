// Simple test server that outputs logs over time
console.log('Test server starting...')
console.log('Listening on port 3000')

let counter = 0
const interval = setInterval(() => {
  counter++
  console.log(`Request ${counter} processed`)
  
  if (counter % 5 === 0) {
    console.error(`Warning: High load at request ${counter}`)
  }
}, 1000)

// Keep running
process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...')
  clearInterval(interval)
  process.exit(0)
})
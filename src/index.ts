#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { ProcessManager } from './process-manager'
import { Config } from './types'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const server = new McpServer({
  name: 'mcp-rewatch',
  version: '1.0.0'
})

let processManager: ProcessManager

function loadConfig(): Config {
  const configPath = resolve(process.cwd(), 'rewatch.config.json')
  
  // Check if config file exists
  if (!existsSync(configPath)) {
    console.error(`Configuration file not found at: ${configPath}`)
    console.error('Please create a rewatch.config.json file. See rewatch.config.example.json for reference.')
    process.exit(1)
  }
  
  try {
    const configContent = readFileSync(configPath, 'utf-8')
    const parsed = JSON.parse(configContent)
    
    // Validate config structure
    if (!parsed.processes || typeof parsed.processes !== 'object') {
      throw new Error('Invalid config: "processes" must be an object')
    }
    
    // Validate each process config
    for (const [name, processConfig] of Object.entries(parsed.processes)) {
      if (!processConfig || typeof processConfig !== 'object') {
        throw new Error(`Invalid process config for "${name}": must be an object`)
      }
      const config = processConfig as any
      if (!config.command || typeof config.command !== 'string') {
        throw new Error(`Invalid process config for "${name}": "command" is required and must be a string`)
      }
    }
    
    return parsed
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error('Invalid JSON in rewatch.config.json:', error.message)
    } else if ((error as any).code === 'EACCES') {
      console.error('Permission denied reading rewatch.config.json')
    } else {
      console.error('Failed to load config:', error instanceof Error ? error.message : error)
    }
    process.exit(1)
  }
}

// Load config and initialize process manager when server starts
console.error('Loading configuration from:', resolve(process.cwd(), 'rewatch.config.json'))
const config = loadConfig()
console.error(`Loaded ${Object.keys(config.processes).length} process configuration(s):`, Object.keys(config.processes).join(', '))
processManager = new ProcessManager(config.processes)

// Register tools
server.registerTool(
  'restart_process',
  {
    title: 'Restart Process',
    description: 'Stop and restart a development process',
    inputSchema: {
      name: z.string().describe('Process name (e.g., "frontend", "backend")')
    }
  },
  async ({ name }) => {
    try {
      // Validate input
      if (!name || typeof name !== 'string' || name.trim() === '') {
        return {
          content: [{
            type: 'text',
            text: 'Error: Process name must be a non-empty string'
          }]
        }
      }
      
      // Check if process exists
      const processes = processManager.listProcesses()
      const processNames = processes.map(p => p.name)
      if (!processNames.includes(name)) {
        return {
          content: [{
            type: 'text',
            text: `Error: Process '${name}' not found. Available processes: ${processNames.join(', ') || 'none'}`
          }]
        }
      }
      
      const result = await processManager.restart(name)
      
      let message = `Process '${name}' `
      if (result.success) {
        message += 'started successfully\n\n'
        message += 'Initial logs:\n'
        message += result.logs.length > 0 
          ? result.logs.join('\n') 
          : 'No output yet'
      } else {
        message += 'failed to start or exited early\n\n'
        message += 'Logs:\n'
        message += result.logs.length > 0 
          ? result.logs.join('\n') 
          : 'No output captured'
      }
      
      return {
        content: [
          {
            type: 'text',
            text: message
          }
        ]
      }
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error restarting process '${name}': ${error instanceof Error ? error.message : String(error)}`
        }]
      }
    }
  }
)

server.registerTool(
  'get_process_logs',
  {
    title: 'Get Process Logs',
    description: 'Retrieve logs from a process',
    inputSchema: {
      name: z.string().describe('Process name'),
      lines: z.number().optional().describe('Number of recent lines to retrieve (default: all)')
    }
  },
  async ({ name, lines }) => {
    try {
      // Validate name
      if (!name || typeof name !== 'string' || name.trim() === '') {
        return {
          content: [{
            type: 'text',
            text: 'Error: Process name must be a non-empty string'
          }]
        }
      }
      
      // Validate lines parameter if provided
      if (lines !== undefined) {
        if (typeof lines !== 'number' || lines < 1 || lines > 10000 || !Number.isInteger(lines)) {
          return {
            content: [{
              type: 'text',
              text: 'Error: lines must be an integer between 1 and 10000'
          }]
          }
        }
      }
      
      // Check if process exists
      const processes = processManager.listProcesses()
      const processNames = processes.map(p => p.name)
      if (!processNames.includes(name)) {
        return {
          content: [{
            type: 'text',
            text: `Error: Process '${name}' not found. Available processes: ${processNames.join(', ') || 'none'}`
          }]
        }
      }
      
      const logs = processManager.getLogs(name, lines)
      return {
        content: [
          {
            type: 'text',
            text: logs.length > 0 ? logs.join('\n') : 'No logs available'
          }
        ]
      }
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error retrieving logs: ${error instanceof Error ? error.message : String(error)}`
        }]
      }
    }
  }
)

server.registerTool(
  'stop_all',
  {
    title: 'Stop All Processes',
    description: 'Stop all running processes',
    inputSchema: {}
  },
  async () => {
    try {
      await processManager.stopAll()
      return {
        content: [
          {
            type: 'text',
            text: 'All processes stopped'
          }
        ]
      }
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error stopping processes: ${error instanceof Error ? error.message : String(error)}`
        }]
      }
    }
  }
)

server.registerTool(
  'list_processes',
  {
    title: 'List Processes',
    description: 'List all configured processes and their status',
    inputSchema: {}
  },
  async () => {
    try {
      const processes = processManager.listProcesses()
      const output = processes.map(p => {
        let line = `${p.name}: ${p.status}`
        if (p.pid) line += ` (PID: ${p.pid})`
        if (p.error) line += ` - Error: ${p.error}`
        return line
      }).join('\n')
      
      return {
        content: [
          {
            type: 'text',
            text: output || 'No processes configured'
          }
        ]
      }
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error listing processes: ${error instanceof Error ? error.message : String(error)}`
        }]
      }
    }
  }
)


async function main() {
  try {
    const transport = new StdioServerTransport()
    await server.connect(transport)
    console.error('MCP Rewatch server started successfully')
    
    // Handle shutdown gracefully
    const shutdown = async (signal: string) => {
      console.error(`\\nReceived ${signal}, shutting down gracefully...`)
      try {
        await processManager.stopAll()
        console.error('All processes stopped')
      } catch (error) {
        console.error('Error during shutdown:', error instanceof Error ? error.message : error)
      }
      process.exit(0)
    }
    
    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
    
    // Also handle unexpected exits
    process.on('exit', () => {
      // Synchronously try to kill all processes
      const processes = processManager.getProcesses()
      for (const [name, managed] of processes) {
        if (managed.process && managed.pid) {
          try {
            if (process.platform !== 'win32') {
              process.kill(-managed.pid, 'SIGKILL')
            } else {
              process.kill(managed.pid, 'SIGKILL')
            }
          } catch (e) {
            // Ignore errors during emergency cleanup
          }
        }
      }
    })
    
  } catch (error) {
    if ((error as any).code === 'EPIPE') {
      console.error('Lost connection to MCP client')
    } else if (error instanceof Error && error.message.includes('transport')) {
      console.error('Failed to establish MCP transport:', error.message)
    } else {
      console.error('Fatal error during startup:', error instanceof Error ? error.message : error)
    }
    
    // Attempt cleanup
    try {
      await processManager?.stopAll()
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError instanceof Error ? cleanupError.message : cleanupError)
    }
    
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { createProcessManager, ProcessManager } from './process-manager'
import { Config } from './types'
import { createObserverLogger } from './observer-logger'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const server = new McpServer({
  name: 'mcp-rewatch',
  version: '1.0.0'
})

let processManager: ProcessManager

// Validation utilities
const isValidProcessName = (name: unknown): name is string => 
  typeof name === 'string' && name.trim().length > 0

const isValidLineCount = (lines: unknown): boolean =>
  typeof lines === 'number' && lines >= 1 && lines <= 10000 && Number.isInteger(lines)

const isProcessConfigValid = (config: unknown): boolean =>
  config !== null && 
  typeof config === 'object' && 
  'command' in config &&
  typeof (config as any).command === 'string'

const hasValidProcesses = (config: any): boolean =>
  config.processes && typeof config.processes === 'object'

// Error handling utilities
const handleConfigError = (error: unknown): never => {
  if (error instanceof SyntaxError) {
    console.error('Invalid JSON in rewatch.config.json:', error.message)
    process.exit(1)
  }
  
  if ((error as NodeJS.ErrnoException).code === 'EACCES') {
    console.error('Permission denied reading rewatch.config.json')
    process.exit(1)
  }
  
  console.error('Failed to load config:', error instanceof Error ? error.message : error)
  process.exit(1)
}

const isConnectionError = (error: unknown): boolean => {
  const errorCode = (error as NodeJS.ErrnoException).code
  return errorCode === 'EPIPE'
}

const isTransportError = (error: unknown): boolean =>
  error instanceof Error && error.message.includes('transport')

// Response builders
const buildErrorResponse = (message: string) => ({
  content: [{
    type: 'text' as const,
    text: message
  }]
})

const buildSuccessResponse = (message: string) => ({
  content: [{
    type: 'text' as const,
    text: message
  }]
})

const buildProcessNotFoundError = (name: string, availableProcesses: string[]) =>
  buildErrorResponse(`Error: Process '${name}' not found. Available processes: ${availableProcesses.join(', ') || 'none'}`)

// Process message builders
const buildRestartMessage = (name: string, success: boolean, logs: string[]): string => {
  let message = `Process '${name}' `
  message += success ? 'started successfully\n\n' : 'failed to start or exited early\n\n'
  message += success ? 'Initial logs:\n' : 'Logs:\n'
  message += logs.length > 0 ? logs.join('\n') : (success ? 'No output yet' : 'No output captured')
  return message
}

const buildProcessListLine = (name: string, status: string, pid?: number, error?: string): string => {
  let line = `${name}: ${status}`
  if (pid) line += ` (PID: ${pid})`
  if (error) line += ` - Error: ${error}`
  return line
}

// Config loading
const loadConfig = (): Config => {
  const configPath = resolve(process.cwd(), 'rewatch.config.json')
  
  if (!existsSync(configPath)) {
    console.error(`Configuration file not found at: ${configPath}`)
    console.error('Please create a rewatch.config.json file. See rewatch.config.example.json for reference.')
    process.exit(1)
  }
  
  try {
    const configContent = readFileSync(configPath, 'utf-8')
    const parsed = JSON.parse(configContent)
    
    if (!hasValidProcesses(parsed)) throw new Error('Invalid config: "processes" must be an object')
    
    for (const [name, processConfig] of Object.entries(parsed.processes)) {
      if (!isProcessConfigValid(processConfig)) {
        throw new Error(`Invalid process config for "${name}": must be an object with a command string`)
      }
    }
    
    return parsed
  } catch (error) {
    return handleConfigError(error)
  }
}

// Initialize
console.error('Loading configuration from:', resolve(process.cwd(), 'rewatch.config.json'))
const config = loadConfig()
console.error(`Loaded ${Object.keys(config.processes).length} process configuration(s):`, Object.keys(config.processes).join(', '))

const observerLogger = createObserverLogger(config)
if (observerLogger.isEnabled()) {
  console.error('Observer logging enabled')
  observerLogger.logSystem('info', 'MCP Rewatch server started', { 
    processes: Object.keys(config.processes),
    configPath: resolve(process.cwd(), 'rewatch.config.json')
  })
}

processManager = createProcessManager(config.processes, observerLogger)

// Tool registrations
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
      if (!isValidProcessName(name)) return buildErrorResponse('Error: Process name must be a non-empty string')
      
      const processes = processManager.listProcesses()
      const processNames = processes.map(p => p.name)
      if (!processNames.includes(name)) return buildProcessNotFoundError(name, processNames)
      
      const result = await processManager.restart(name)
      const message = buildRestartMessage(name, result.success, result.logs)
      
      return buildSuccessResponse(message)
    } catch (error) {
      return buildErrorResponse(`Error restarting process '${name}': ${error instanceof Error ? error.message : String(error)}`)
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
      if (!isValidProcessName(name)) return buildErrorResponse('Error: Process name must be a non-empty string')
      
      if (lines !== undefined && !isValidLineCount(lines)) {
        return buildErrorResponse('Error: lines must be an integer between 1 and 10000')
      }
      
      const processes = processManager.listProcesses()
      const processNames = processes.map(p => p.name)
      if (!processNames.includes(name)) return buildProcessNotFoundError(name, processNames)
      
      const logs = processManager.getLogs(name, lines)
      return buildSuccessResponse(logs.length > 0 ? logs.join('\n') : 'No logs available')
    } catch (error) {
      return buildErrorResponse(`Error retrieving logs: ${error instanceof Error ? error.message : String(error)}`)
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
      return buildSuccessResponse('All processes stopped')
    } catch (error) {
      return buildErrorResponse(`Error stopping processes: ${error instanceof Error ? error.message : String(error)}`)
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
      const output = processes
        .map(p => buildProcessListLine(p.name, p.status, p.pid, p.error))
        .join('\n')
      
      return buildSuccessResponse(output || 'No processes configured')
    } catch (error) {
      return buildErrorResponse(`Error listing processes: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// Main application
const handleShutdown = async (signal: string) => {
  console.error(`\\nReceived ${signal}, shutting down gracefully...`)
  try {
    await processManager.stopAll()
    console.error('All processes stopped')
  } catch (error) {
    console.error('Error during shutdown:', error instanceof Error ? error.message : error)
  }
  process.exit(0)
}

const performEmergencyCleanup = () => {
  const processes = processManager.getProcesses()
  for (const [name, managed] of processes) {
    if (!managed.process || !managed.pid) continue
    
    try {
      process.kill(process.platform !== 'win32' ? -managed.pid : managed.pid, 'SIGKILL')
    } catch (e) {
      // Ignore errors during emergency cleanup
    }
  }
}

const handleStartupError = async (error: unknown) => {
  if (isConnectionError(error)) {
    console.error('Lost connection to MCP client')
    await attemptCleanup()
    process.exit(1)
  }
  
  if (isTransportError(error)) {
    console.error('Failed to establish MCP transport:', (error as Error).message)
    await attemptCleanup()
    process.exit(1)
  }
  
  console.error('Fatal error during startup:', error instanceof Error ? error.message : error)
  await attemptCleanup()
  process.exit(1)
}

const attemptCleanup = async () => {
  try {
    await processManager?.stopAll()
  } catch (cleanupError) {
    console.error('Error during cleanup:', cleanupError instanceof Error ? cleanupError.message : cleanupError)
  }
}

const main = async () => {
  try {
    const transport = new StdioServerTransport()
    await server.connect(transport)
    console.error('MCP Rewatch server started successfully')
    
    process.on('SIGTERM', () => handleShutdown('SIGTERM'))
    process.on('SIGINT', () => handleShutdown('SIGINT'))
    process.on('exit', performEmergencyCleanup)
    
  } catch (error) {
    await handleStartupError(error)
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
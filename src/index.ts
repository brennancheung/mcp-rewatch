#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { ProcessManager } from './process-manager'
import { Config } from './types'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const server = new McpServer({
  name: 'mcp-rewatch',
  version: '1.0.0'
})

let processManager: ProcessManager

function loadConfig(): Config {
  try {
    const configPath = resolve(process.cwd(), 'rewatch.config.json')
    const configContent = readFileSync(configPath, 'utf-8')
    return JSON.parse(configContent)
  } catch (error) {
    console.error('Failed to load config from rewatch.config.json:', error)
    return {
      processes: {}
    }
  }
}

// Load config and initialize process manager when server starts
const config = loadConfig()
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
    const logs = processManager.getLogs(name, lines)
    return {
      content: [
        {
          type: 'text',
          text: logs.length > 0 ? logs.join('\n') : 'No logs available'
        }
      ]
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
    await processManager.stopAll()
    return {
      content: [
        {
          type: 'text',
          text: 'All processes stopped'
        }
      ]
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
  }
)


async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('MCP Rewatch server started')
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
import { spawn, ChildProcess } from 'child_process'
import { ProcessConfig, ProcessInfo, ProcessStatus } from './types'
import { LogBuffer } from './log-buffer'

interface ManagedProcess {
  config: ProcessConfig
  process?: ChildProcess
  status: ProcessStatus
  pid?: number
  startTime?: Date
  logBuffer: LogBuffer
  error?: string
}

export class ProcessManager {
  private processes: Map<string, ManagedProcess> = new Map()

  constructor(processConfigs: Record<string, ProcessConfig>) {
    for (const [name, config] of Object.entries(processConfigs)) {
      this.processes.set(name, {
        config,
        status: 'stopped',
        logBuffer: new LogBuffer()
      })
    }
  }

  async restart(name: string): Promise<{ success: boolean; logs: string[] }> {
    const managed = this.processes.get(name)
    if (!managed) {
      throw new Error(`Process '${name}' not found`)
    }

    await this.stop(name)
    managed.logBuffer.clear()
    await this.start(name)
    
    // Wait for the process to start up
    const startupDelay = managed.config.startupDelay || 3000 // Default 3 seconds
    await new Promise(resolve => setTimeout(resolve, startupDelay))
    
    // Check if process is still running
    const isRunning = managed.status === 'running'
    const logs = managed.logBuffer.getLines(20) // Get initial logs
    
    return {
      success: isRunning,
      logs
    }
  }

  private async start(name: string): Promise<void> {
    const managed = this.processes.get(name)
    if (!managed) {
      throw new Error(`Process '${name}' not found`)
    }

    if (managed.status === 'running' || managed.status === 'starting') {
      return
    }

    managed.status = 'starting'
    managed.error = undefined

    try {
      const env = {
        ...process.env,
        ...managed.config.env
      }

      const proc = spawn(managed.config.command, managed.config.args, {
        cwd: managed.config.cwd || process.cwd(),
        env,
        shell: false  // Don't use shell to avoid shell syntax issues
      })

      managed.process = proc
      managed.pid = proc.pid
      managed.startTime = new Date()
      managed.status = 'running'

      proc.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n').filter(Boolean)
        lines.forEach((line: string) => managed.logBuffer.add(`[stdout] ${line}`))
      })

      proc.stderr?.on('data', (data) => {
        const lines = data.toString().split('\n').filter(Boolean)
        lines.forEach((line: string) => managed.logBuffer.add(`[stderr] ${line}`))
      })

      proc.on('error', (error) => {
        managed.status = 'error'
        managed.error = error.message
        managed.logBuffer.add(`[error] Process error: ${error.message}`)
      })

      proc.on('exit', (code, signal) => {
        managed.status = 'stopped'
        managed.pid = undefined
        managed.logBuffer.add(`[exit] Process exited with code ${code} and signal ${signal}`)
      })

    } catch (error) {
      managed.status = 'error'
      managed.error = error instanceof Error ? error.message : String(error)
      throw error
    }
  }

  async stop(name: string): Promise<void> {
    const managed = this.processes.get(name)
    if (!managed || !managed.process) {
      return
    }

    return new Promise((resolve) => {
      const proc = managed.process!
      let killed = false

      const cleanup = () => {
        if (!killed) {
          killed = true
          managed.process = undefined
          managed.pid = undefined
          managed.status = 'stopped'
          resolve()
        }
      }

      proc.once('exit', cleanup)

      proc.kill('SIGTERM')

      setTimeout(() => {
        if (!killed) {
          proc.kill('SIGKILL')
          setTimeout(cleanup, 1000)
        }
      }, 5000)
    })
  }

  async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.processes.keys()).map(name => this.stop(name))
    await Promise.all(stopPromises)
  }

  getLogs(name: string, lines?: number): string[] {
    const managed = this.processes.get(name)
    if (!managed) {
      throw new Error(`Process '${name}' not found`)
    }

    return managed.logBuffer.getLines(lines)
  }

  listProcesses(): ProcessInfo[] {
    return Array.from(this.processes.entries()).map(([name, managed]) => ({
      name,
      status: managed.status,
      pid: managed.pid,
      startTime: managed.startTime,
      error: managed.error
    }))
  }
}
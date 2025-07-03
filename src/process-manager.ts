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
        shell: false,  // Don't use shell to avoid shell syntax issues
        detached: process.platform !== 'win32'  // Create new process group on Unix-like systems
      })

      managed.process = proc
      managed.pid = proc.pid
      managed.startTime = new Date()
      
      // Listen for spawn event to confirm successful start
      proc.once('spawn', () => {
        managed.status = 'running'
        managed.logBuffer.add(`[system] Process started successfully (PID: ${proc.pid})`)
      })

      proc.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n').filter(Boolean)
        lines.forEach((line: string) => managed.logBuffer.add(`[stdout] ${line}`))
      })

      proc.stderr?.on('data', (data) => {
        const lines = data.toString().split('\n').filter(Boolean)
        lines.forEach((line: string) => managed.logBuffer.add(`[stderr] ${line}`))
      })

      proc.on('error', (error: any) => {
        managed.status = 'error'
        
        // Provide specific error messages based on error code
        if (error.code === 'ENOENT') {
          managed.error = `Command not found: ${managed.config.command}`
          managed.logBuffer.add(`[error] Command '${managed.config.command}' not found. Check if it's installed and in PATH.`)
        } else if (error.code === 'EACCES') {
          managed.error = `Permission denied: ${managed.config.command}`
          managed.logBuffer.add(`[error] Permission denied executing '${managed.config.command}'. Check file permissions.`)
        } else if (error.code === 'ENOTDIR') {
          managed.error = `Invalid working directory: ${managed.config.cwd}`
          managed.logBuffer.add(`[error] Working directory '${managed.config.cwd}' is not a directory.`)
        } else if (error.code === 'EMFILE') {
          managed.error = 'Too many open files'
          managed.logBuffer.add('[error] Too many open files. System limit reached.')
        } else {
          managed.error = error.message
          managed.logBuffer.add(`[error] Process error: ${error.message} (${error.code || 'unknown code'})`)
        }
      })

      proc.on('exit', (code, signal) => {
        managed.status = 'stopped'
        managed.pid = undefined
        
        if (signal) {
          managed.logBuffer.add(`[exit] Process terminated by signal ${signal}`)
        } else if (code === 0) {
          managed.logBuffer.add('[exit] Process exited successfully (code 0)')
        } else {
          managed.logBuffer.add(`[exit] Process exited with code ${code}`)
        }
      })

    } catch (error: any) {
      managed.status = 'error'
      
      // Handle spawn errors that might be thrown synchronously
      if (error.code === 'ENOENT') {
        managed.error = `Command not found: ${managed.config.command}`
        managed.logBuffer.add(`[error] Failed to spawn process: command '${managed.config.command}' not found`)
      } else {
        managed.error = error instanceof Error ? error.message : String(error)
        managed.logBuffer.add(`[error] Failed to spawn process: ${managed.error}`)
      }
      
      throw error
    }
  }

  async stop(name: string): Promise<void> {
    const managed = this.processes.get(name)
    if (!managed || !managed.process) {
      return
    }

    return new Promise((resolve, reject) => {
      const proc = managed.process!
      let killed = false
      let forceKillTimer: NodeJS.Timeout

      const cleanup = (reason: string) => {
        if (!killed) {
          killed = true
          clearTimeout(forceKillTimer)
          managed.process = undefined
          managed.pid = undefined
          managed.status = 'stopped'
          managed.logBuffer.add(`[system] Process stopped: ${reason}`)
          resolve()
        }
      }

      proc.once('exit', () => cleanup('graceful shutdown'))
      
      // Send SIGTERM for graceful shutdown
      try {
        // On Unix-like systems, kill the entire process group
        if (process.platform !== 'win32' && proc.pid) {
          process.kill(-proc.pid, 'SIGTERM')
          managed.logBuffer.add(`[system] Sent SIGTERM signal to process group ${proc.pid}`)
        } else {
          proc.kill('SIGTERM')
          managed.logBuffer.add('[system] Sent SIGTERM signal for graceful shutdown')
        }
      } catch (error: any) {
        managed.logBuffer.add(`[error] Failed to send SIGTERM: ${error.message}`)
        cleanup('kill failed')
        return
      }

      // Force kill after timeout (5 seconds)
      forceKillTimer = setTimeout(() => {
        if (!killed) {
          managed.logBuffer.add('[warning] Process did not respond to SIGTERM within 5 seconds, sending SIGKILL')
          try {
            // Kill entire process group on Unix-like systems
            if (process.platform !== 'win32' && proc.pid) {
              process.kill(-proc.pid, 'SIGKILL')
              managed.logBuffer.add(`[system] Sent SIGKILL to process group ${proc.pid}`)
            } else {
              proc.kill('SIGKILL')
            }
          } catch (error: any) {
            managed.logBuffer.add(`[error] Failed to send SIGKILL: ${error.message}`)
          }
          // Give it another second after SIGKILL
          setTimeout(() => cleanup('force killed'), 1000)
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
  
  // Expose processes for emergency cleanup
  getProcesses(): Map<string, ManagedProcess> {
    return this.processes
  }
}
import { spawn, ChildProcess } from 'child_process'
import { ProcessConfig, ProcessInfo, ProcessStatus } from './types'
import { LogBuffer, createLogBuffer } from './log-buffer'
import { ObserverLogger, LogLevel } from './observer-logger'

interface ManagedProcess {
  config: ProcessConfig
  process?: ChildProcess
  status: ProcessStatus
  pid?: number
  startTime?: Date
  logBuffer: LogBuffer
  error?: string
}

interface ProcessError extends Error {
  code?: string
}

export interface ProcessManager {
  restart: (name: string) => Promise<{ success: boolean; logs: string[] }>
  stop: (name: string) => Promise<void>
  stopAll: () => Promise<void>
  getLogs: (name: string, lines?: number) => string[]
  listProcesses: () => ProcessInfo[]
  getProcesses: () => Map<string, ManagedProcess>
}

export const createProcessManager = (
  processConfigs: Record<string, ProcessConfig>,
  observerLogger?: ObserverLogger
): ProcessManager => {
  const processes = new Map<string, ManagedProcess>()
  
  // Initialize processes
  Object.entries(processConfigs).forEach(([name, config]) => {
    processes.set(name, {
      config,
      status: 'stopped',
      logBuffer: createLogBuffer()
    })
  })

  const handleProcessOutput = (
    name: string,
    data: Buffer,
    stream: 'stdout' | 'stderr'
  ): void => {
    const lines = data.toString().split('\n').filter(Boolean)
    const managed = processes.get(name)
    if (!managed) return
    
    lines.forEach(line => {
      managed.logBuffer.addLine(`[${stream}] ${line}`)
      
      if (!observerLogger) return
      
      observerLogger.logProcess(
        name,
        stream === 'stderr' ? 'error' : 'info',
        line,
        { stream }
      )
    })
  }

  const handleProcessError = (
    name: string,
    error: ProcessError
  ): void => {
    const managed = processes.get(name)
    if (!managed) return

    const errorHandlers: Record<string, () => { error: string; message: string }> = {
      'ENOENT': () => ({
        error: `Command not found: ${managed.config.command}`,
        message: `Command '${managed.config.command}' not found. Check if it's installed and in PATH.`
      }),
      'EACCES': () => ({
        error: `Permission denied: ${managed.config.command}`,
        message: `Permission denied executing '${managed.config.command}'. Check file permissions.`
      }),
      'ENOTDIR': () => ({
        error: `Invalid working directory: ${managed.config.cwd}`,
        message: `Working directory '${managed.config.cwd}' is not a directory.`
      }),
      'EMFILE': () => ({
        error: 'Too many open files',
        message: 'Too many open files. System limit reached.'
      })
    }
    
    const handler = errorHandlers[error.code || '']
    
    if (handler) {
      const { error: errorMsg, message } = handler()
      managed.status = 'error'
      managed.error = errorMsg
      managed.logBuffer.addLine(`[error] ${message}`)
      
      if (observerLogger && error.code === 'ENOENT') observerLogger.logProcess(name, 'error', message, { 
        command: managed.config.command, 
        errorCode: 'ENOENT' 
      })
      return
    }
    
    const errorMsg = error.message
    const message = `Process error: ${error.message} (${error.code || 'unknown code'})`
    
    managed.status = 'error'
    managed.error = errorMsg
    managed.logBuffer.addLine(`[error] ${message}`)
    
    if (observerLogger) observerLogger.logProcess(name, 'error', message, { errorCode: error.code })
  }

  const start = async (name: string): Promise<void> => {
    const managed = processes.get(name)
    if (!managed) throw new Error(`Process '${name}' not found`)
    
    if (managed.status === 'running' || managed.status === 'starting') return

    managed.status = 'starting'
    managed.error = undefined

    try {
      const env = {
        ...process.env,
        ...managed.config.env
      }

      const proc = spawn(managed.config.command, managed.config.args || [], {
        cwd: managed.config.cwd || process.cwd(),
        env,
        shell: false,
        detached: process.platform !== 'win32'
      })

      managed.process = proc
      managed.pid = proc.pid
      managed.startTime = new Date()
      
      proc.once('spawn', () => {
        const message = `Process started successfully (PID: ${proc.pid})`
        managed.status = 'running'
        managed.logBuffer.addLine(`[system] ${message}`)
        
        if (observerLogger) observerLogger.logProcess(name, 'info', message, { pid: proc.pid })
      })

      proc.stdout?.on('data', (data) => handleProcessOutput(name, data, 'stdout'))
      proc.stderr?.on('data', (data) => handleProcessOutput(name, data, 'stderr'))
      proc.on('error', (error) => handleProcessError(name, error as ProcessError))

      proc.on('exit', (code, signal) => {
        managed.status = 'stopped'
        managed.pid = undefined
        
        if (signal) {
          const message = `Process terminated by signal ${signal}`
          managed.logBuffer.addLine(`[exit] ${message}`)
          if (observerLogger) observerLogger.logProcess(name, 'warn', message, { signal })
          return
        }
        
        if (code === 0) {
          const message = 'Process exited successfully (code 0)'
          managed.logBuffer.addLine(`[exit] ${message}`)
          if (observerLogger) observerLogger.logProcess(name, 'info', message, { exitCode: 0 })
          return
        }
        
        const message = `Process exited with code ${code}`
        managed.logBuffer.addLine(`[exit] ${message}`)
        if (observerLogger) observerLogger.logProcess(name, 'error', message, { exitCode: code })
      })

    } catch (error) {
      const processError = error as ProcessError
      
      if (processError.code === 'ENOENT') {
        managed.status = 'error'
        managed.error = `Command not found: ${managed.config.command}`
        managed.logBuffer.addLine(`[error] Failed to spawn process: command '${managed.config.command}' not found`)
        throw error
      }
      
      const errorMsg = error instanceof Error ? error.message : String(error)
      managed.status = 'error'
      managed.error = errorMsg
      managed.logBuffer.addLine(`[error] Failed to spawn process: ${errorMsg}`)
      throw error
    }
  }

  const stop = async (name: string): Promise<void> => {
    const managed = processes.get(name)
    if (!managed || !managed.process) return

    return new Promise((resolve) => {
      const proc = managed.process!
      let killed = false
      let forceKillTimer: NodeJS.Timeout

      const cleanup = (reason: string) => {
        if (killed) return
        
        killed = true
        clearTimeout(forceKillTimer)
        managed.process = undefined
        managed.pid = undefined
        managed.status = 'stopped'
        managed.logBuffer.addLine(`[system] Process stopped: ${reason}`)
        resolve()
      }

      proc.once('exit', () => cleanup('graceful shutdown'))
      
      try {
        if (process.platform !== 'win32' && proc.pid) {
          process.kill(-proc.pid, 'SIGTERM')
          managed.logBuffer.addLine(`[system] Sent SIGTERM signal to process group ${proc.pid}`)
        } else {
          proc.kill('SIGTERM')
          managed.logBuffer.addLine('[system] Sent SIGTERM signal for graceful shutdown')
        }
      } catch (error) {
        const processError = error as ProcessError
        managed.logBuffer.addLine(`[error] Failed to send SIGTERM: ${processError.message}`)
        cleanup('kill failed')
        return
      }

      forceKillTimer = setTimeout(() => {
        if (killed) return
        
        managed.logBuffer.addLine('[warning] Process did not respond to SIGTERM within 5 seconds, sending SIGKILL')
        try {
          if (process.platform !== 'win32' && proc.pid) {
            process.kill(-proc.pid, 'SIGKILL')
            managed.logBuffer.addLine(`[system] Sent SIGKILL to process group ${proc.pid}`)
          } else {
            proc.kill('SIGKILL')
          }
        } catch (error) {
          const processError = error as ProcessError
          managed.logBuffer.addLine(`[error] Failed to send SIGKILL: ${processError.message}`)
        }
        setTimeout(() => cleanup('force killed'), 1000)
      }, 5000)
    })
  }

  const restart = async (name: string): Promise<{ success: boolean; logs: string[] }> => {
    const managed = processes.get(name)
    if (!managed) throw new Error(`Process '${name}' not found`)

    await stop(name)
    managed.logBuffer.clear()
    await start(name)
    
    const startupDelay = managed.config.startupDelay || 3000
    await new Promise(resolve => setTimeout(resolve, startupDelay))
    
    const isRunning = managed.status === 'running'
    const logs = managed.logBuffer.getLines(20)
    
    return { success: isRunning, logs }
  }

  const stopAll = async (): Promise<void> => {
    const names = Array.from(processes.keys())
    await Promise.all(names.map(name => stop(name)))
  }

  const getLogs = (name: string, lines?: number): string[] => {
    const managed = processes.get(name)
    if (!managed) throw new Error(`Process '${name}' not found`)
    
    return managed.logBuffer.getLines(lines)
  }

  const listProcesses = (): ProcessInfo[] => 
    Array.from(processes.entries()).map(([name, managed]) => ({
      name,
      status: managed.status,
      pid: managed.pid,
      startTime: managed.startTime,
      error: managed.error
    }))

  const getProcesses = (): Map<string, ManagedProcess> => processes

  return {
    restart,
    stop,
    stopAll,
    getLogs,
    listProcesses,
    getProcesses
  }
}
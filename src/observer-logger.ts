import { Config } from './types'

export type LogLevel = 'info' | 'error' | 'warn' | 'debug'

export interface LogEntry {
  source: string
  level: LogLevel
  message: string
  metadata?: Record<string, unknown>
}

export interface ObserverLogger {
  isEnabled: () => boolean
  log: (entry: LogEntry) => Promise<void>
  logProcess: (processName: string, level: LogLevel, message: string, metadata?: Record<string, unknown>) => Promise<void>
  logSystem: (level: LogLevel, message: string, metadata?: Record<string, unknown>) => Promise<void>
}

export const createObserverLogger = (config: Config): ObserverLogger => {
  let observerUrl: string | null = null
  let enabled = false

  if (config.observer?.url && config.observer?.port) {
    observerUrl = `${config.observer.url}:${config.observer.port}/api/logs`
    enabled = true
  }
  
  if (!enabled && config.observer?.url) {
    observerUrl = `${config.observer.url}/api/logs`
    enabled = true
  }

  const isEnabled = (): boolean => enabled

  const log = async (entry: LogEntry): Promise<void> => {
    if (!enabled || !observerUrl) return

    try {
      const response = await fetch(observerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(entry)
      })

      if (!response.ok) {
        console.error(`Failed to send log to observer: ${response.status} ${response.statusText}`)
      }
    } catch (error) {
      console.error('Failed to send log to observer:', error)
    }
  }

  const logProcess = (
    processName: string,
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void> => {
    return log({
      source: `mcp-rewatch.${processName}`,
      level,
      message,
      metadata
    })
  }

  const logSystem = (
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void> => {
    return log({
      source: 'mcp-rewatch.system',
      level,
      message,
      metadata
    })
  }

  return {
    isEnabled,
    log,
    logProcess,
    logSystem
  }
}
export interface ProcessConfig {
  command: string
  args: string[]
  cwd?: string
  env?: Record<string, string>
  startupDelay?: number  // ms to wait after starting before checking status
  // readyPattern?: string  // TODO: Implement in v4.0
}

export interface ProcessesConfig {
  [key: string]: ProcessConfig
}

export interface Config {
  processes: ProcessesConfig
  observer?: {
    url?: string
    port?: number
  }
}

export type ProcessStatus = 'stopped' | 'starting' | 'running' | 'error'

export interface ProcessInfo {
  name: string
  status: ProcessStatus
  pid?: number
  startTime?: Date
  error?: string
}
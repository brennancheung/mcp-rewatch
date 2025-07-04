export interface LogBuffer {
  addLine: (line: string) => void
  getLines: (count?: number) => string[]
  clear: () => void
  getLength: () => number
}

export const createLogBuffer = (maxLines = 10000): LogBuffer => {
  const buffer: string[] = []
  const maxLineLength = 5000

  const addLine = (line: string): void => {
    try {
      const truncatedLine = line.length > maxLineLength 
        ? line.substring(0, maxLineLength) + '... (truncated)'
        : line
      
      const timestamp = new Date().toISOString()
      buffer.push(`[${timestamp}] ${truncatedLine}`)
      
      if (buffer.length > maxLines) {
        const excess = buffer.length - maxLines
        buffer.splice(0, Math.max(1, excess))
      }
    } catch (error) {
      try {
        const errorMessage = `[error] Failed to add log: ${error instanceof Error ? error.message : 'unknown error'}`
        buffer.push(errorMessage)
        
        if (buffer.length > maxLines) buffer.shift()
      } catch {
        if (buffer.length > maxLines) buffer.shift()
      }
    }
  }

  const getLines = (count?: number): string[] => {
    if (!count) return [...buffer]
    return buffer.slice(-count)
  }

  const clear = (): void => {
    buffer.length = 0
  }

  const getLength = (): number => buffer.length

  return {
    addLine,
    getLines,
    clear,
    getLength
  }
}
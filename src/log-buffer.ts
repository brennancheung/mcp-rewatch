export class LogBuffer {
  private buffer: string[] = []
  private maxLines: number
  private readonly maxLineLength = 5000

  constructor(maxLines: number = 10000) {
    this.maxLines = maxLines
  }

  add(line: string): void {
    try {
      // Truncate extremely long lines to prevent memory issues
      const truncatedLine = line.length > this.maxLineLength 
        ? line.substring(0, this.maxLineLength) + '... (truncated)'
        : line
      
      const timestamp = new Date().toISOString()
      this.buffer.push(`[${timestamp}] ${truncatedLine}`)
      
      // Remove multiple lines if buffer is significantly over limit
      if (this.buffer.length > this.maxLines) {
        const excess = this.buffer.length - this.maxLines
        this.buffer.splice(0, Math.max(1, excess))
      }
    } catch (error) {
      // Fallback if timestamp generation or other operations fail
      try {
        this.buffer.push(`[error] Failed to add log: ${error instanceof Error ? error.message : 'unknown error'}`)
        // Ensure we don't exceed limits even in error case
        if (this.buffer.length > this.maxLines) {
          this.buffer.shift()
        }
      } catch {
        // If even error logging fails, just ensure buffer doesn't grow unbounded
        if (this.buffer.length > this.maxLines) {
          this.buffer.shift()
        }
      }
    }
  }

  getLines(count?: number): string[] {
    if (!count) {
      return [...this.buffer]
    }
    
    return this.buffer.slice(-count)
  }

  clear(): void {
    this.buffer = []
  }

  get length(): number {
    return this.buffer.length
  }
}
export class LogBuffer {
  private buffer: string[] = []
  private maxLines: number

  constructor(maxLines: number = 10000) {
    this.maxLines = maxLines
  }

  add(line: string): void {
    const timestamp = new Date().toISOString()
    this.buffer.push(`[${timestamp}] ${line}`)
    
    if (this.buffer.length > this.maxLines) {
      this.buffer.shift()
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
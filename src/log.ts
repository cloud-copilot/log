export const LogLevels = ['error', 'warn', 'info', 'debug', 'trace'] as const

export type LogLevel = (typeof LogLevels)[number]

const LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4
}

/**
 * Determine if a string is a valid log level.
 *
 * @param level the log level string to check
 * @returns true if the string is a valid log level, false otherwise
 */
export function isLogLevel(level: string | LogLevel): level is LogLevel {
  return level !== undefined && LEVELS.hasOwnProperty(level)
}

interface Logger {
  error: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  debug: (...args: unknown[]) => void
  trace: (...args: unknown[]) => void
}

export class StandardLogger implements Logger {
  private logLevel: LogLevel

  constructor(initialLogLevel?: LogLevel) {
    if (initialLogLevel && isLogLevel(initialLogLevel)) {
      this.logLevel = initialLogLevel
    } else {
      this.logLevel = 'warn'
    }
  }

  setLogLevel(level: LogLevel) {
    if (!isLogLevel(level)) {
      throw new Error(`Invalid log level: ${level}`)
    }
    this.logLevel = level
  }

  error(...args: unknown[]) {
    logAt(this.logLevel, 'error', args)
  }
  warn(...args: unknown[]) {
    logAt(this.logLevel, 'warn', args)
  }
  info(...args: unknown[]) {
    logAt(this.logLevel, 'info', args)
  }
  debug(...args: unknown[]) {
    logAt(this.logLevel, 'debug', args)
  }
  trace(...args: unknown[]) {
    logAt(this.logLevel, 'trace', args)
  }
}

// helper to serialize non-object args into a single string
function serializeArgs(args: unknown[]): string {
  return args
    .map((a) =>
      typeof a === 'string'
        ? a
        : a instanceof Error
          ? a.stack || a.message
          : a === undefined
            ? 'undefined'
            : JSON.stringify(a)
    )
    .join(' ')
}

function isError(obj: unknown): obj is Error {
  return (
    obj instanceof Error ||
    (typeof obj === 'object' && obj !== null && 'message' in obj && 'name' in obj)
  )
}

// core log function: level check → prefix → JSON output
function logAt(currentLevel: LogLevel, level: LogLevel, args: unknown[]) {
  if (LEVELS[level] > LEVELS[currentLevel]) return

  // Base log entry
  const entry: Record<string, any> = {
    timestamp: new Date().toISOString(),
    level
  }

  // Separate object args and message args
  const objectArgs = args.filter((a) => typeof a === 'object' && a !== null && !isError(a))
  const messageArgs = args.filter((a) => typeof a !== 'object' || a === null)
  const errorArgs = args.filter(isError)

  // Merge all object arguments into the entry
  for (const obj of objectArgs) {
    Object.assign(entry, obj)
  }

  const msg = serializeArgs(messageArgs)
  if (msg) {
    entry.message = msg
  }
  if (errorArgs.length > 0) {
    entry.errors = errorArgs.map((e) => ({
      name: e.name,
      message: e.message,
      stack: e.stack
    }))
  }

  const line = JSON.stringify(entry)

  switch (level) {
    case 'error':
      return console.error(line)
    case 'warn':
      return console.warn(line)
    case 'info':
      return console.info(line)
    default:
      return console.log(line)
  }
}

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

/**
 * A structured logger that outputs JSON log entries to the console.
 * Accepts variadic arguments of mixed types: strings are joined as the message,
 * objects are merged as context, and Errors are serialized into the entry.
 */
export interface Logger {
  /** Log at error level. */
  error: (...args: unknown[]) => void
  /** Log at warn level. */
  warn: (...args: unknown[]) => void
  /** Log at info level. */
  info: (...args: unknown[]) => void
  /** Log at debug level. */
  debug: (...args: unknown[]) => void
  /** Log at trace level. */
  trace: (...args: unknown[]) => void
}

/**
 * Options for constructing a StandardLogger.
 */
export interface StandardLoggerOptions {
  /** The initial log level. Defaults to 'warn'. */
  logLevel?: LogLevel
  /**
   * When true, outputs raw objects instead of JSON.stringify for environments
   * like CloudWatch Logs where each log line is expected to be a JSON object.
   * Defaults to false.
   */
  rawJsonLogs?: boolean
}

/**
 * A logger that outputs structured JSON to the console.
 * Supports configurable log levels, raw JSON output for CloudWatch,
 * and variadic arguments with mixed types.
 */
export class StandardLogger implements Logger {
  private logLevel: LogLevel
  private rawJsonLogs: boolean

  /**
   * Create a new StandardLogger.
   *
   * @param initialLogLevel - The initial log level (backward-compatible positional form)
   */
  constructor(initialLogLevel?: LogLevel)
  /**
   * Create a new StandardLogger with options.
   *
   * @param options - Configuration options for the logger
   */
  constructor(options: StandardLoggerOptions)
  constructor(arg?: LogLevel | StandardLoggerOptions) {
    const envRawJsonLogs =
      typeof process !== 'undefined' &&
      process.env?.IAM_COLLECT_RAW_JSON_LOGS?.toLowerCase() === 'true'

    if (typeof arg === 'object' && arg !== null) {
      this.logLevel = arg.logLevel && isLogLevel(arg.logLevel) ? arg.logLevel : 'warn'
      this.rawJsonLogs = arg.rawJsonLogs ?? envRawJsonLogs
    } else {
      this.logLevel = arg && isLogLevel(arg) ? arg : 'warn'
      this.rawJsonLogs = envRawJsonLogs
    }
  }

  /**
   * Update the log level.
   *
   * @param level - The new log level to set
   * @throws Error if the provided level is not a valid log level
   */
  setLogLevel(level: LogLevel) {
    if (!isLogLevel(level)) {
      throw new Error(`Invalid log level: ${level}`)
    }
    this.logLevel = level
  }

  error(...args: unknown[]) {
    logAt(this.logLevel, 'error', args, this.rawJsonLogs)
  }
  warn(...args: unknown[]) {
    logAt(this.logLevel, 'warn', args, this.rawJsonLogs)
  }
  info(...args: unknown[]) {
    logAt(this.logLevel, 'info', args, this.rawJsonLogs)
  }
  debug(...args: unknown[]) {
    logAt(this.logLevel, 'debug', args, this.rawJsonLogs)
  }
  trace(...args: unknown[]) {
    logAt(this.logLevel, 'trace', args, this.rawJsonLogs)
  }
}

/**
 * Check if an object is an Error or Error-like (has name and message properties).
 *
 * @param obj - The object to check
 * @returns true if the object is an Error or Error-like
 */
function isError(obj: unknown): obj is Error {
  return (
    obj instanceof Error ||
    (typeof obj === 'object' && obj !== null && 'message' in obj && 'name' in obj)
  )
}

/**
 * The result of normalizing variadic log arguments into structured parts.
 */
export interface NormalizedLogArgs {
  /** All string arguments joined with spaces. */
  message: string
  /** All non-Error object arguments merged together. */
  context: Record<string, unknown>
  /** All Error arguments, normalized to a consistent shape. */
  errors: { name: string; message: string; stack?: string; code?: unknown }[]
}

/**
 * Normalize variadic log arguments into structured parts.
 * Separates string args (joined as message), Error args (serialized), and object args (merged as context).
 * This is useful for adapters that need to convert cloud-copilot's variadic log calls
 * into structured `(message, context)` calls for other logging frameworks.
 *
 * @param args - The variadic arguments passed to a log method
 * @returns The normalized parts: message, context, and errors
 */
export function normalizeArgs(args: unknown[]): NormalizedLogArgs {
  const messageArgs = args.filter((a) => typeof a !== 'object' || a === null)
  const objectArgs = args.filter((a) => typeof a === 'object' && a !== null && !isError(a))
  const errorArgs = args.filter(isError)

  const context: Record<string, unknown> = {}
  for (const obj of objectArgs) {
    Object.assign(context, obj)
  }

  return {
    message: serializeArgs(messageArgs),
    context,
    errors: errorArgs.map(mapError)
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

/**
 * Map an Error object to a consistent shape.
 *
 * @param e The error object to map
 * @returns A normalized error object
 */
function mapError(e: Error) {
  // Normalize anything Error-like to a consistent shape
  const { name, message, stack, code } = e as any
  return {
    name: typeof name === 'string' ? name : 'Error',
    message: typeof message === 'string' ? message : String(message ?? ''),
    stack: typeof stack === 'string' ? stack : undefined,
    ...(code !== undefined ? { code } : {})
  }
}

// core log function: level check → prefix → JSON output
function logAt(currentLevel: LogLevel, level: LogLevel, args: unknown[], rawJsonLogs: boolean) {
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
    entry.error = mapError(errorArgs[0])
    entry.error_count = errorArgs.length
    if (errorArgs.length > 1) {
      entry.errors = errorArgs.map(mapError)
    }
  }

  /**
   * Raw JSON logging is great for things like CloudWatch Logs where each log line
   * is expected to be a single JSON object for easier parsing and querying.
   *
   * The default is JSON.stringify for each log line as a single line for processing
   * with bash and other command-line tools.
   */
  const line = rawJsonLogs ? entry : JSON.stringify(entry)

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

// ── Module-level logger singleton ──────────────────────────────────────────────

let currentLogger: Logger = new StandardLogger()

/**
 * Replace the current module-level logger with a custom implementation.
 * Call this at application startup to inject your own logger (e.g. an adapter
 * that bridges to another logging framework).
 *
 * @param logger - The logger implementation to use
 */
export function setLogger(logger: Logger): void {
  currentLogger = logger
}

/**
 * Get the current module-level logger.
 *
 * @returns The current logger instance (default: StandardLogger)
 */
export function getLogger(): Logger {
  return currentLogger
}

/**
 * A proxy object that delegates all log calls to the current module-level logger.
 * Use this for convenient access: `log.info('message', { context })`.
 * The underlying logger can be swapped at runtime via `setLogger()`.
 */
export const log: Logger = {
  error: (...args: unknown[]) => currentLogger.error(...args),
  warn: (...args: unknown[]) => currentLogger.warn(...args),
  info: (...args: unknown[]) => currentLogger.info(...args),
  debug: (...args: unknown[]) => currentLogger.debug(...args),
  trace: (...args: unknown[]) => currentLogger.trace(...args)
}

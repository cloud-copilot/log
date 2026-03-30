import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isLogLevel,
  log,
  StandardLogger,
  type Logger,
  type LogLevel,
  normalizeArgs,
  setLogger,
  getLogger
} from './log.js'

describe('StandardLogger', () => {
  let consoleSpy: {
    error: ReturnType<typeof vi.spyOn>
    warn: ReturnType<typeof vi.spyOn>
    info: ReturnType<typeof vi.spyOn>
    log: ReturnType<typeof vi.spyOn>
  }

  beforeEach(() => {
    consoleSpy = {
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      log: vi.spyOn(console, 'log').mockImplementation(() => {})
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should default to warn level when no initial level provided', () => {
      const logger = new StandardLogger()

      logger.info('test message')
      expect(consoleSpy.info).not.toHaveBeenCalled()

      logger.warn('test message')
      expect(consoleSpy.warn).toHaveBeenCalled()
    })

    it('should use provided initial log level', () => {
      const logger = new StandardLogger('debug')

      logger.debug('test message')
      expect(consoleSpy.log).toHaveBeenCalled()
    })

    it('should default to warn when invalid initial level provided', () => {
      const logger = new StandardLogger('invalid' as LogLevel)

      logger.info('test message')
      expect(consoleSpy.info).not.toHaveBeenCalled()

      logger.warn('test message')
      expect(consoleSpy.warn).toHaveBeenCalled()
    })

    it('should accept options object with logLevel', () => {
      const logger = new StandardLogger({ logLevel: 'debug' })

      logger.debug('test message')
      expect(consoleSpy.log).toHaveBeenCalled()
    })

    it('should accept options object with rawJsonLogs', () => {
      const logger = new StandardLogger({ logLevel: 'info', rawJsonLogs: true })

      logger.info('test message')

      //Then the output should be a raw object, not a string
      const call = consoleSpy.info.mock.calls[0][0]
      expect(typeof call).toBe('object')
      expect(call.message).toBe('test message')
    })

    it('should default rawJsonLogs to false when env var is not set', () => {
      const logger = new StandardLogger({ logLevel: 'info' })

      logger.info('test message')

      //Then the output should be a JSON string
      const call = consoleSpy.info.mock.calls[0][0]
      expect(typeof call).toBe('string')
      JSON.parse(call) // should not throw
    })
  })

  describe('IAM_COLLECT_RAW_JSON_LOGS env var', () => {
    const originalEnv = process.env.IAM_COLLECT_RAW_JSON_LOGS

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.IAM_COLLECT_RAW_JSON_LOGS
      } else {
        process.env.IAM_COLLECT_RAW_JSON_LOGS = originalEnv
      }
    })

    it('should enable rawJsonLogs when env var is true', () => {
      //Given the env var is set to true
      process.env.IAM_COLLECT_RAW_JSON_LOGS = 'true'
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const logger = new StandardLogger({ logLevel: 'info' })

      //When logging a message
      logger.info('env-driven raw output')

      //Then the output should be a raw object
      const call = consoleSpy.mock.calls[0][0]
      expect(typeof call).toBe('object')
      expect(call.message).toBe('env-driven raw output')
    })

    it('should enable rawJsonLogs for bare constructor when env var is true', () => {
      //Given the env var is set to true
      process.env.IAM_COLLECT_RAW_JSON_LOGS = 'true'
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const logger = new StandardLogger()

      //When logging a message
      logger.warn('bare constructor raw output')

      //Then the output should be a raw object
      const call = consoleSpy.mock.calls[0][0]
      expect(typeof call).toBe('object')
      expect(call.message).toBe('bare constructor raw output')
    })

    it('should allow explicit rawJsonLogs: false to override the env var', () => {
      //Given the env var is set to true but rawJsonLogs is explicitly false
      process.env.IAM_COLLECT_RAW_JSON_LOGS = 'true'
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const logger = new StandardLogger({ logLevel: 'info', rawJsonLogs: false })

      //When logging a message
      logger.info('override to string')

      //Then the output should be a JSON string despite the env var
      const call = consoleSpy.mock.calls[0][0]
      expect(typeof call).toBe('string')
      const parsed = JSON.parse(call)
      expect(parsed.message).toBe('override to string')
    })

    it('should default to stringified output when env var is not set', () => {
      //Given the env var is not set
      delete process.env.IAM_COLLECT_RAW_JSON_LOGS
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const logger = new StandardLogger({ logLevel: 'info' })

      //When logging a message
      logger.info('no env var')

      //Then the output should be a JSON string
      const call = consoleSpy.mock.calls[0][0]
      expect(typeof call).toBe('string')
    })
  })

  describe('setLogLevel', () => {
    it('should update the log level', () => {
      const logger = new StandardLogger('error')

      logger.info('should not log')
      expect(consoleSpy.info).not.toHaveBeenCalled()

      logger.setLogLevel('info')
      logger.info('should log')
      expect(consoleSpy.info).toHaveBeenCalled()
    })

    it('should throw error for invalid log level', () => {
      const logger = new StandardLogger()

      expect(() => {
        logger.setLogLevel('invalid' as LogLevel)
      }).toThrow('Invalid log level: invalid')
    })
  })

  describe('log level filtering', () => {
    it.each([
      ['error', ['error'], ['warn', 'info', 'debug', 'trace']],
      ['warn', ['error', 'warn'], ['info', 'debug', 'trace']],
      ['info', ['error', 'warn', 'info'], ['debug', 'trace']],
      ['debug', ['error', 'warn', 'info', 'debug'], ['trace']],
      ['trace', ['error', 'warn', 'info', 'debug', 'trace'], []]
    ] as [LogLevel, LogLevel[], LogLevel[]][])(
      'should log appropriate levels for %s',
      (level, shouldLog, shouldNotLog) => {
        const logger = new StandardLogger(level)

        shouldLog.forEach((logLevel) => {
          logger[logLevel]('test message')
        })

        shouldNotLog.forEach((logLevel) => {
          logger[logLevel]('test message')
        })

        expect(consoleSpy.error).toHaveBeenCalledTimes(shouldLog.includes('error') ? 1 : 0)
        expect(consoleSpy.warn).toHaveBeenCalledTimes(shouldLog.includes('warn') ? 1 : 0)
        expect(consoleSpy.info).toHaveBeenCalledTimes(shouldLog.includes('info') ? 1 : 0)
        expect(consoleSpy.log).toHaveBeenCalledTimes(
          shouldLog.filter((l) => ['debug', 'trace'].includes(l)).length
        )
      }
    )
  })

  describe('message formatting', () => {
    let logger: StandardLogger

    beforeEach(() => {
      logger = new StandardLogger('trace')
    })

    it('should format string messages', () => {
      logger.info('test message')

      const call = consoleSpy.info.mock.calls[0][0] as any
      const parsed = JSON.parse(call)

      expect(parsed.message).toBe('test message')
      expect(parsed.level).toBe('info')
      expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    })

    it('should serialize multiple string arguments', () => {
      logger.info('hello', 'world', 123)

      const call = consoleSpy.info.mock.calls[0][0] as any
      const parsed = JSON.parse(call)

      expect(parsed.message).toBe('hello world 123')
    })

    it('should merge object arguments', () => {
      logger.info('message', { userId: 123, action: 'login' })

      const call = consoleSpy.info.mock.calls[0][0] as any
      const parsed = JSON.parse(call)

      expect(parsed.message).toBe('message')
      expect(parsed.userId).toBe(123)
      expect(parsed.action).toBe('login')
    })

    it('should handle Error objects', () => {
      const error = new Error('test error')
      logger.error('something failed', error)

      const call = consoleSpy.error.mock.calls[0][0] as any
      const parsed = JSON.parse(call)

      expect(parsed.message).toBe('something failed')
      expect(parsed.error.name).toBe('Error')
      expect(parsed.error.message).toBe('test error')
      expect(parsed.error.stack).toBeDefined()
    })

    it('should handle multiple Error objects', () => {
      const error1 = new Error('first error')
      const error2 = new Error('second error')
      logger.error('multiple errors', error1, error2)

      const call = consoleSpy.error.mock.calls[0][0] as any
      const parsed = JSON.parse(call)

      expect(parsed.errors).toHaveLength(2)
      expect(parsed.errors[0].message).toBe('first error')
      expect(parsed.errors[1].message).toBe('second error')
    })

    it('should handle mixed argument types', () => {
      const error = new Error('test error')
      logger.warn('mixed args', { userId: 123 }, 'string', 456, error, { action: 'test' })

      const call = consoleSpy.warn.mock.calls[0][0] as any
      const parsed = JSON.parse(call)

      expect(parsed.message).toBe('mixed args string 456')
      expect(parsed.userId).toBe(123)
      expect(parsed.action).toBe('test')
      expect(parsed.error.message).toBe('test error')
    })

    it('should report multiple errors', () => {
      const error1 = new Error('error1')
      const error2 = new Error('error2')
      logger.warn('mixed args', { userId: 123 }, 'string', 456, error1, error2, { action: 'test' })

      const call = consoleSpy.warn.mock.calls[0][0] as any
      const parsed = JSON.parse(call)

      expect(parsed.message).toBe('mixed args string 456')
      expect(parsed.userId).toBe(123)
      expect(parsed.action).toBe('test')
      expect(parsed.error.message).toEqual('error1')
      expect(parsed.error_count).toBe(2)
      expect(parsed.errors).toHaveLength(2)
      expect(parsed.errors[0].message).toBe('error1')
      expect(parsed.errors[1].message).toBe('error2')
    })

    it('should handle null and undefined values', () => {
      logger.info('test', null, undefined)

      const call = consoleSpy.info.mock.calls[0][0] as any
      const parsed = JSON.parse(call)

      expect(parsed.message).toBe('test null undefined')
    })

    it('should stringify complex objects in message', () => {
      logger.info('complex', { nested: { value: 'test' } })

      const call = consoleSpy.info.mock.calls[0][0] as any
      const parsed = JSON.parse(call)

      expect(parsed.message).toContain('complex')
      expect(parsed.nested).toEqual({ value: 'test' })
    })
  })

  describe('rawJsonLogs', () => {
    it('should output raw objects when rawJsonLogs is true', () => {
      //Given a logger with rawJsonLogs enabled
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const logger = new StandardLogger({ logLevel: 'info', rawJsonLogs: true })

      //When logging a message
      logger.info('raw output', { key: 'value' })

      //Then the output should be a raw object
      const call = consoleSpy.mock.calls[0][0]
      expect(typeof call).toBe('object')
      expect(call.message).toBe('raw output')
      expect(call.key).toBe('value')
      expect(call.level).toBe('info')
    })

    it('should output JSON strings when rawJsonLogs is false', () => {
      //Given a logger with rawJsonLogs disabled
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const logger = new StandardLogger({ logLevel: 'info', rawJsonLogs: false })

      //When logging a message
      logger.info('stringified output')

      //Then the output should be a JSON string
      const call = consoleSpy.mock.calls[0][0]
      expect(typeof call).toBe('string')
      const parsed = JSON.parse(call)
      expect(parsed.message).toBe('stringified output')
    })
  })

  describe('console method mapping', () => {
    let logger: StandardLogger

    beforeEach(() => {
      logger = new StandardLogger('trace')
    })

    it('should use console.error for error level', () => {
      logger.error('error message')
      expect(consoleSpy.error).toHaveBeenCalled()
      expect(consoleSpy.warn).not.toHaveBeenCalled()
    })

    it('should use console.warn for warn level', () => {
      logger.warn('warn message')
      expect(consoleSpy.warn).toHaveBeenCalled()
      expect(consoleSpy.error).not.toHaveBeenCalled()
    })

    it('should use console.info for info level', () => {
      logger.info('info message')
      expect(consoleSpy.info).toHaveBeenCalled()
    })

    it('should use console.log for debug and trace levels', () => {
      logger.debug('debug message')
      logger.trace('trace message')
      expect(consoleSpy.log).toHaveBeenCalledTimes(2)
    })
  })
})

describe('isLogLevel', () => {
  it('should return true for valid log levels', () => {
    expect(isLogLevel('error')).toBe(true)
    expect(isLogLevel('warn')).toBe(true)
    expect(isLogLevel('info')).toBe(true)
    expect(isLogLevel('debug')).toBe(true)
    expect(isLogLevel('trace')).toBe(true)
  })

  it('should return false for invalid log levels', () => {
    expect(isLogLevel('invalid')).toBe(false)
    expect(isLogLevel('ERROR')).toBe(false)
    expect(isLogLevel('Warning')).toBe(false)
    expect(isLogLevel('')).toBe(false)
    expect(isLogLevel('verbose')).toBe(false)
    expect(isLogLevel('fatal')).toBe(false)
  })

  it('should return false for non-string values', () => {
    expect(isLogLevel(undefined as any)).toBe(false)
    expect(isLogLevel(null as any)).toBe(false)
    expect(isLogLevel(123 as any)).toBe(false)
    expect(isLogLevel({} as any)).toBe(false)
    expect(isLogLevel([] as any)).toBe(false)
    expect(isLogLevel(true as any)).toBe(false)
  })

  it('should work with LogLevel type', () => {
    const level: LogLevel = 'info'
    expect(isLogLevel(level)).toBe(true)
  })
})

describe('normalizeArgs', () => {
  it('should separate string message from object context', () => {
    //Given a mix of string and object arguments
    const args = ['hello world', { userId: 123 }]

    //When normalizing the arguments
    const result = normalizeArgs(args)

    //Then the message and context should be separated
    expect(result.message).toBe('hello world')
    expect(result.context).toEqual({ userId: 123 })
    expect(result.errors).toEqual([])
  })

  it('should handle object-first arguments', () => {
    //Given an object followed by a string
    const args = [{ accountId: '123' }, 'Using cached credentials']

    //When normalizing the arguments
    const result = normalizeArgs(args)

    //Then both parts should be captured
    expect(result.message).toBe('Using cached credentials')
    expect(result.context).toEqual({ accountId: '123' })
  })

  it('should extract errors', () => {
    //Given a message, error, and context
    const error = new Error('test error')
    const args = ['Failed to parse', error, { topicArn: 'arn:aws:sns:...' }]

    //When normalizing the arguments
    const result = normalizeArgs(args)

    //Then errors should be extracted
    expect(result.message).toBe('Failed to parse')
    expect(result.context).toEqual({ topicArn: 'arn:aws:sns:...' })
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toBe('test error')
  })

  it('should merge multiple object arguments', () => {
    //Given multiple object arguments
    const args = ['message', { a: 1 }, { b: 2 }]

    //When normalizing the arguments
    const result = normalizeArgs(args)

    //Then objects should be merged
    expect(result.context).toEqual({ a: 1, b: 2 })
  })

  it('should handle empty arguments', () => {
    //Given no arguments
    const result = normalizeArgs([])

    //Then everything should be empty
    expect(result.message).toBe('')
    expect(result.context).toEqual({})
    expect(result.errors).toEqual([])
  })
})

describe('module-level logger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Reset to default logger
    setLogger(new StandardLogger())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    setLogger(new StandardLogger())
  })

  it('should use the default StandardLogger', () => {
    //Given the default logger
    const logger = getLogger()

    //Then it should be a StandardLogger
    expect(logger).toBeInstanceOf(StandardLogger)
  })

  it('should allow replacing the logger with setLogger', () => {
    //Given a custom logger
    const customLogger: Logger = {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }

    //When we set it as the module logger
    setLogger(customLogger)

    //Then getLogger should return the custom logger
    expect(getLogger()).toBe(customLogger)
  })

  it('should route log object calls through the current logger', () => {
    //Given a spy logger
    const spyLogger: Logger = {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
    setLogger(spyLogger)

    //When calling via the log object
    log.trace('trace msg')
    log.debug('debug msg')
    log.info('info msg')
    log.warn('warn msg')
    log.error('error msg')

    //Then each should delegate to the corresponding logger method
    expect(spyLogger.trace).toHaveBeenCalledWith('trace msg')
    expect(spyLogger.debug).toHaveBeenCalledWith('debug msg')
    expect(spyLogger.info).toHaveBeenCalledWith('info msg')
    expect(spyLogger.warn).toHaveBeenCalledWith('warn msg')
    expect(spyLogger.error).toHaveBeenCalledWith('error msg')
  })

  it('should pass multiple arguments through the log object', () => {
    //Given a spy logger
    const spyLogger: Logger = {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
    setLogger(spyLogger)

    //When calling with multiple arguments
    log.warn('message', { key: 'value' }, new Error('oops'))

    //Then all arguments should be forwarded
    expect(spyLogger.warn).toHaveBeenCalledWith('message', { key: 'value' }, expect.any(Error))
  })
})

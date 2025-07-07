import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isLogLevel, StandardLogger, type LogLevel } from './log'

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
      expect(parsed.errors).toHaveLength(1)
      expect(parsed.errors[0].name).toBe('Error')
      expect(parsed.errors[0].message).toBe('test error')
      expect(parsed.errors[0].stack).toBeDefined()
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
      expect(parsed.errors).toHaveLength(1)
      expect(parsed.errors[0].message).toBe('test error')
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

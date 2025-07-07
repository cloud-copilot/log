# Log

[![NPM Version](https://img.shields.io/npm/v/@cloud-copilot/log.svg?logo=nodedotjs)](https://www.npmjs.com/package/@cloud-copilot/log) [![MIT](https://img.shields.io/github/license/cloud-copilot/log)](LICENSE.txt) [![GuardDog](https://github.com/cloud-copilot/log/actions/workflows/guarddog.yml/badge.svg)](https://github.com/cloud-copilot/log/actions/workflows/guarddog.yml) [![Known Vulnerabilities](https://snyk.io/test/github/cloud-copilot/log/badge.svg?targetFile=package.json&style=flat-square)](https://snyk.io/test/github/cloud-copilot/log?targetFile=package.json)

A lightweight logger to output JSON structured logs for Typescript.

## Installation

```bash
npm install @cloud-copilot/log
```

## Basic Usage

```typescript
import { StandardLogger } from '@cloud-copilot/log'

// Create a logger with default log level (warn)
const logger = new StandardLogger()

// Or specify an initial log level
const logger = new StandardLogger('info')

// Log messages at different levels
logger.error('Something went wrong')
logger.warn('This is a warning')
logger.info('Information message')
logger.debug('Debug information')
logger.trace('Trace information')
```

## Log Levels

The logger supports five log levels in order of priority:

- `error` (0) - Highest priority
- `warn` (1)
- `info` (2)
- `debug` (3)
- `trace` (4) - Lowest priority

Only messages at or above the current log level will be output. For example, if the log level is set to `info`, then `error`, `warn`, and `info` messages will be logged, but `debug` and `trace` will be filtered out.

```typescript
const logger = new StandardLogger('info')

logger.error('This will be logged') // ✓
logger.warn('This will be logged') // ✓
logger.info('This will be logged') // ✓
logger.debug('This will be filtered') // ✗
logger.trace('This will be filtered') // ✗
```

## Changing Log Level

```typescript
const logger = new StandardLogger('error')

// Change the log level at runtime
logger.setLogLevel('debug')

// Invalid log levels throw an error
logger.setLogLevel('invalid') // throws Error: Invalid log level: invalid
```

## Structured Logging

The logger automatically creates structured JSON output with timestamps:

```typescript
const logger = new StandardLogger('info')

logger.info('User logged in')
// Output: {"timestamp":"2023-10-01T12:00:00.000Z","level":"info","message":"User logged in"}
```

## Object Merging

Objects passed as arguments are merged into the log entry:

```typescript
logger.info('User action', {
  userId: 123,
  action: 'login',
  ip: '192.168.1.1'
})
// Output: {"timestamp":"2023-10-01T12:00:00.000Z","level":"info","message":"User action","userId":123,"action":"login","ip":"192.168.1.1"}
```

## Error Handling

Error objects are specially handled and added to an `errors` array:

```typescript
const error = new Error('Database connection failed')

logger.error('Operation failed', error, { userId: 123 })
// Output: {
//   "timestamp": "2023-10-01T12:00:00.000Z",
//   "level": "error",
//   "message": "Operation failed",
//   "userId": 123,
//   "errors": [{
//     "name": "Error",
//     "message": "Database connection failed",
//     "stack": "Error: Database connection failed\n    at ..."
//   }]
// }
```

## Mixed Arguments

The logger handles mixed argument types intelligently:

```typescript
logger.warn(
  'Processing user', // string message
  { userId: 123 }, // object (merged)
  'with status', // string message
  { status: 'active' }, // object (merged)
  new Error('Minor issue') // error (in errors array)
)
// Output: {
//   "timestamp": "2023-10-01T12:00:00.000Z",
//   "level": "warn",
//   "message": "Processing user with status",
//   "userId": 123,
//   "status": "active",
//   "errors": [{"name": "Error", "message": "Minor issue", "stack": "..."}]
// }
```

## Advanced Examples

### Application Logging

```typescript
import { StandardLogger } from '@cloud-copilot/log'

class UserService {
  private logger = new StandardLogger('info')

  async createUser(userData: any) {
    this.logger.info('Creating user', {
      operation: 'createUser',
      email: userData.email
    })

    try {
      // ... user creation logic
      this.logger.info('User created successfully', {
        userId: newUser.id,
        email: newUser.email
      })
    } catch (error) {
      this.logger.error('Failed to create user', error, {
        email: userData.email
      })
      throw error
    }
  }
}
```

### Environment-based Log Levels

```typescript
const logLevel = process.env.LOG_LEVEL || 'warn'
const logger = new StandardLogger(logLevel as LogLevel)

// In production: LOG_LEVEL=error (only errors)
// In development: LOG_LEVEL=debug (detailed logging)
```

### Validating Log Levels

Use the `isLogLevel` utility function to validate log level strings:

```typescript
import { isLogLevel } from '@cloud-copilot/log'

// Validate user input
const userInput = 'debug'
if (isLogLevel(userInput)) {
  const logger = new StandardLogger(userInput)
} else {
  console.error('Invalid log level provided')
}

// Safe environment variable parsing
const envLogLevel = process.env.LOG_LEVEL
const logLevel = isLogLevel(envLogLevel) ? envLogLevel : 'warn'
const logger = new StandardLogger(logLevel)

// Type guard in functions
function createLoggerFromConfig(config: { logLevel?: string }) {
  if (config.logLevel && isLogLevel(config.logLevel)) {
    return new StandardLogger(config.logLevel)
  }
  return new StandardLogger() // defaults to 'warn'
}
```

## TypeScript Support

Full TypeScript support with proper type definitions:

```typescript
import { StandardLogger, LogLevel, LogLevels, isLogLevel } from '@cloud-copilot/log'

const logger: StandardLogger = new StandardLogger()
const level: LogLevel = 'info'
const isValid: boolean = isLogLevel('debug') // true
```

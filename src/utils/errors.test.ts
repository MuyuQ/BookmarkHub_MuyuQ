import { describe, it, expect } from 'vitest'
import {
  BookmarkHubError,
  ErrorCode,
  handleError,
  createError,
  isError,
  ValidationError,
} from './errors'

describe('BookmarkHubError', () => {
  it('should create an error with all properties', () => {
    const error = new BookmarkHubError(
      'Test error',
      ErrorCode.UNKNOWN_ERROR,
      'User message',
      true
    )

    expect(error.message).toBe('Test error')
    expect(error.code).toBe(ErrorCode.UNKNOWN_ERROR)
    expect(error.userMessage).toBe('User message')
    expect(error.retryable).toBe(true)
    expect(error.name).toBe('BookmarkHubError')
  })

  it('should convert to log string', () => {
    const error = new BookmarkHubError(
      'Test error',
      ErrorCode.AUTH_TOKEN_MISSING,
      'User message'
    )

    expect(error.toLogString()).toBe('[AUTH_TOKEN_MISSING] Test error')
  })

  it('should convert to user string', () => {
    const error = new BookmarkHubError(
      'Test error',
      ErrorCode.UNKNOWN_ERROR,
      'User friendly message'
    )

    expect(error.toUserString()).toBe('User friendly message')
  })
})

describe('ValidationError', () => {
  it('should create validation error', () => {
    const error = new ValidationError(
      'Invalid field',
      'githubToken',
      'GitHub Token is required'
    )

    expect(error.field).toBe('githubToken')
    expect(error.code).toBe(ErrorCode.VALIDATION_ERROR)
  })
})

describe('handleError', () => {
  it('should return BookmarkHubError as is', () => {
    const original = new BookmarkHubError(
      'Original',
      ErrorCode.UNKNOWN_ERROR,
      'User message'
    )

    const result = handleError(original)

    expect(result).toBe(original)
  })

  it('should wrap Error into BookmarkHubError', () => {
    const original = new Error('Something went wrong')

    const result = handleError(original)

    expect(result).toBeInstanceOf(BookmarkHubError)
    expect(result.message).toBe('Something went wrong')
    expect(result.code).toBe(ErrorCode.UNKNOWN_ERROR)
    expect(result.retryable).toBe(true)
  })

  it('should wrap string into BookmarkHubError', () => {
    const result = handleError('String error')

    expect(result).toBeInstanceOf(BookmarkHubError)
    expect(result.message).toBe('String error')
  })
})

describe('createError', () => {
  it('should create auth token missing error', () => {
    const error = createError.authTokenMissing()

    expect(error.code).toBe(ErrorCode.AUTH_TOKEN_MISSING)
    expect(error.retryable).toBe(false)
  })

  it('should create gist id missing error', () => {
    const error = createError.gistIdMissing()

    expect(error.code).toBe(ErrorCode.GIST_ID_MISSING)
  })

  it('should create file name missing error', () => {
    const error = createError.fileNameMissing()

    expect(error.code).toBe(ErrorCode.FILE_NAME_MISSING)
  })

  it('should create file not found error with filename', () => {
    const error = createError.fileNotFound('test.json')

    expect(error.message).toContain('test.json')
    expect(error.code).toBe(ErrorCode.FILE_NOT_FOUND)
  })

  it('should create sync failed error', () => {
    const originalError = new Error('Network failed')
    const error = createError.syncFailed('Sync failed', originalError)

    expect(error.code).toBe(ErrorCode.SYNC_FAILED)
    expect(error.retryable).toBe(true)
    expect(error.originalError).toBe(originalError)
  })

  it('should create webdav auth failed error', () => {
    const error = createError.webdavAuthFailed()

    expect(error.code).toBe(ErrorCode.WEBDAV_AUTH_FAILED)
    expect(error.retryable).toBe(false)
  })
})

describe('isError', () => {
  it('should identify auth errors', () => {
    const error = createError.authTokenMissing()

    expect(isError.authError(error)).toBe(true)
  })

  it('should identify network errors', () => {
    const error = createError.networkError('Network failed')

    expect(isError.networkError(error)).toBe(true)
  })

  it('should identify sync errors', () => {
    const error = createError.syncFailed('Sync failed')

    expect(isError.syncError(error)).toBe(true)
  })

  it('should identify webdav errors', () => {
    const error = createError.webdavAuthFailed()

    expect(isError.webdavError(error)).toBe(true)
  })

  it('should identify retryable errors', () => {
    const retryableError = createError.networkError('Network failed')
    const nonRetryableError = createError.authTokenMissing()

    expect(isError.retryable(retryableError)).toBe(true)
    expect(isError.retryable(nonRetryableError)).toBe(false)
  })
})
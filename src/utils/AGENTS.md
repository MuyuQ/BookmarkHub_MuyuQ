# src/utils - Utility Modules

**Purpose:** Core utility functions and services for BookmarkHub extension.

## Modules

| File | Purpose | Key Exports |
|------|---------|-------------|
| `models.ts` | Data types | `BookmarkInfo`, `SyncDataInfo`, `OperType`, `BrowserType` |
| `bookmarkUtils.ts` | Bookmark operations | `getBookmarkCount`, `formatBookmarks`, `flattenBookmarks` |
| `services.ts` | GitHub Gist API | `BookmarkService` (get/update), `getBookmarks` |
| `setting.ts` | Settings access | `Setting.build()` - always use this |
| `optionsStorage.ts` | Persistence | `webext-options-sync` defaults |
| `sync.ts` | Auto-sync | `startAutoSync`, `stopAutoSync`, `performSync` |
| `webdav.ts` | WebDAV client | `WebDAVClient`, `webdavRead`, `webdavWrite` |
| `http.ts` | HTTP client | `http` (ky wrapper with GitHub auth) |
| `retry.ts` | Retry logic | `retryOperation` (3 retries, exponential backoff) |
| `errors.ts` | Error handling | `BookmarkHubError`, `ErrorCode`, `createError` |
| `importer.ts` | Import bookmarks | `importBookmarks` (JSON/HTML) |
| `exporter.ts` | Export bookmarks | `exportBookmarks` (JSON/HTML) |
| `logger.ts` | Logging | `logger`, `logSync`, `logWebDAV` |

## Dependency Graph

```
optionsStorage.ts ← setting.ts ←─┬── services.ts ← sync.ts
                                 │        ↑
                                 │      http.ts
                                 │        ↑
                                 │     retry.ts
                                 │
                                 ├── webdav.ts ← sync.ts
                                 │
                                 └── bookmarkUtils.ts
                                         ↑
                                    models.ts (shared everywhere)
```

## Key Patterns

### Settings Access
```typescript
const setting = await Setting.build()  // ALWAYS use this
// Never access optionsStorage directly for read
```

### Bookmark Count
```typescript
import { getBookmarkCount } from './bookmarkUtils'  // Use this, not services
```

### Network Retry
```typescript
import { retryOperation } from './retry'
await retryOperation(() => api.call(), { maxRetries: 3, logRetries: true })
```

### Error Handling
```typescript
import { handleError, createError } from './errors'
catch (error: unknown) {
    const err = handleError(error)
    console.error(err.toLogString())
}
```

## Internal Patterns

### Conflict Prevention
- `OperType` enum marks current operation state
- `isSyncing` lock in `sync.ts` prevents concurrent syncs
- Bookmark events ignored during sync operations

### Storage Backend Selection
- `storageType` setting controls backend: `'github'` | `'webdav'`
- Both backends share same data format (SyncDataInfo)
- `fetchRemoteData()` in sync.ts abstracts backend choice

### Message Flow
```
Popup/Options → browser.runtime.sendMessage({ name: 'upload' })
                    ↓
              background.ts → uploadBookmarks()
                    ↓
              services.ts/webdav.ts → remote storage
```

## TODO (Unimplemented)

| Location | Description |
|----------|-------------|
| `sync.ts:315` | Complex merge logic (detect add/delete/modify) |
| `sync.ts:369` | Change detection logic |
| `sync.ts:380` | Change detection implementation |

## Notes

- `bookmarkUtils.ts` is the **canonical source** for bookmark utilities
- `services.ts` re-exports for backward compatibility only
- Chinese comments are acceptable in this codebase
- No test coverage exists yet
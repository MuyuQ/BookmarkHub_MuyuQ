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
| `importer.ts` | Import bookmarks | `importBookmarks` (JSON/HTML) |
| `exporter.ts` | Export bookmarks | `exportBookmarks` (JSON/HTML) |

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

## Architecture

```
Setting.build() → optionsStorage.getAll()
                 ↓
BookmarkService ← http (ky) ← retryOperation
       ↓
sync.ts ← webdav.ts
       ↓
background.ts
```

## TODO (Unimplemented)

- `sync.ts:315` - Complex merge logic (detect add/delete/modify)
- `sync.ts:369` - Change detection logic
- `sync.ts:380` - Change detection implementation

## Notes

- `bookmarkUtils.ts` is the **canonical source** for bookmark utilities
- `services.ts` re-exports for backward compatibility only
- Chinese comments are acceptable in this codebase
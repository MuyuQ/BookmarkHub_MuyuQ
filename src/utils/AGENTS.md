# src/utils - Utility Modules

**Purpose:** Core utility functions and services for BookmarkHub extension.

## Modules

| File | Purpose | Key Exports |
|------|---------|-------------|
| `models.ts` | Data types | `BookmarkInfo`, `SyncDataInfo`, `Tombstone`, `OperType`, `BrowserType` |
| `bookmarkUtils.ts` | Bookmark operations | `getBookmarkCount`, `formatBookmarks`, `flattenBookmarks` |
| `services.ts` | GitHub Gist API | `BookmarkService` (get/update), `getBookmarks` |
| `webdav.ts` | WebDAV client | `WebDAVService`, `webdavRead`, `webdavWrite` |
| `setting.ts` | Settings access | `Setting.build()` - always use this |
| `optionsStorage.ts` | Persistence | `webext-options-sync` defaults + storage migration |
| `sync.ts` | Auto-sync | `startAutoSync`, `stopAutoSync`, `performSync` |
| `changeDetection.ts` | Change detection | `detectChanges` (compare local vs remote) |
| `merge.ts` | Three-way merge | `mergeBookmarks` (with tombstone support) |
| `localCache.ts` | Local persistence | `getLocalCache`, `saveLocalCache`, `getBackupRecords` |
| `crypto.ts` | Credential encryption | `encryptCredential`, `decryptCredential` (Web Crypto API) |
| `manualSyncTransfer.ts` | Manual backend transfer | `uploadManualBookmarks`, `downloadManualBookmarks` |
| `http.ts` | HTTP client | `http` (ky wrapper with GitHub auth) |
| `retry.ts` | Retry logic | `retryOperation` (3 retries, exponential backoff) |
| `errors.ts` | Error handling | `BookmarkHubError`, `ErrorCode`, `createError` |
| `importer.ts` | Import bookmarks | `importBookmarks` (JSON/HTML) |
| `exporter.ts` | Export bookmarks | `exportBookmarks` (JSON/HTML) |
| `logger.ts` | Logging | `logger`, `logSync`, `logWebDAV` |
| `constants.ts` | Constants | `ROOT_NODE_IDS`, `STORAGE_KEYS`, `MV3_CONFIG` |
| `browserInfo.ts` | Browser detection | `getBrowserInfo` (browser/OS identification) |
| `debounce.ts` | Utility | `debounce` (for event rate limiting) |
| `icons.ts` | Icon paths | Icon asset path resolutions |

## Dependency Graph

```
optionsStorage.ts ← setting.ts ←─┬── services.ts ←─┬── sync.ts
                                 │        ↑         │      ↑
                                 │      http.ts     │      │
                                 │        ↑         │  manualSyncTransfer.ts
                                 │     retry.ts     │
                                 │                  ├── webdav.ts ←──┘
                                 │                  │
                                 │                  └── bookmarkUtils.ts
                                 │                          ↑
                                 │                     models.ts (shared)
                                 │
                                 ├── changeDetection.ts ← sync.ts
                                 │
                                 ├── merge.ts ← sync.ts
                                 │
                                 ├── localCache.ts ← sync.ts, background.ts
                                 │
                                 ├── crypto.ts ← optionsStorage.ts
                                 │
                                 └── constants.ts ← shared everywhere
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
- Both backends share the same sync payload format
- `fetchRemoteData()` in `sync.ts` abstracts automatic sync reads
- `manualSyncTransfer.ts` abstracts manual upload/download reads and writes

### Message Flow
```
Popup/Options → browser.runtime.sendMessage({ name: 'upload' })
                    ↓
              background.ts → uploadBookmarks()
                    ↓
              services.ts/webdav.ts → remote storage
```

## Notes

- `bookmarkUtils.ts` is the **canonical source** for bookmark utilities
- `services.ts` re-exports for backward compatibility only
- Chinese comments are acceptable in this codebase
- Utility modules have unit test coverage, including sync behavior, WebDAV, crypto, merge, and settings storage

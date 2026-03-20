# src/entrypoints - Extension Entry Points

**Purpose:** Browser extension entry points for BookmarkHub.

## Entry Points

| Path | Type | Purpose |
|------|------|---------|
| `background.ts` | Service Worker | Message handling, sync orchestration, bookmark events |
| `popup/` | Toolbar Popup | Quick sync actions, bookmark counts |
| `options/` | Settings Page | Configuration, backup management |

## Message Handlers (background.ts)

| Message | Handler | Purpose |
|---------|---------|---------|
| `upload` | `uploadBookmarks()` | Upload local bookmarks to remote |
| `download` | `downloadBookmarks()` | Download remote bookmarks to local |
| `sync` | `performSync()` | Bi-directional sync with conflict resolution |
| `removeAll` | `clearBookmarkTree()` | Clear all local bookmarks |
| `getBackupRecords` | Returns backup history | List available backups |
| `restoreFromBackup` | Restore from backup | Restore bookmarks from timestamp |
| `deleteBackupRecord` | Delete backup record | Remove backup from history |

## Message Flow

```
Popup/Options → browser.runtime.sendMessage({ name: 'upload' })
                           ↓
                     background.ts → uploadBookmarks()
                           ↓
                     services.ts/webdav.ts → remote storage
```

## Key Patterns

### Message Handler
```typescript
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.name === 'upload') {
        uploadBookmarks().then(() => sendResponse(true))
    }
    return true  // Required for async
})
```

### Operation Queue
- Uses `operationQueue` promise chain
- Prevents concurrent sync operations
- Single operation at a time

### Bookmark Events
- `onCreated`, `onChanged`, `onMoved`, `onRemoved` listeners
- Ignored during sync operations (`isSyncing` flag)
- Used for event-based auto-sync

## Anti-Patterns

- DO NOT forget `return true` in async message listeners
- DO NOT use `chrome` API → use `browser` for cross-browser
- DO NOT access storage directly → use `Setting.build()`
- DO NOT trigger sync during sync (check `isSyncing`)
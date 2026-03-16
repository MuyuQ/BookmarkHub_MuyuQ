# AGENTS.md - BookmarkHub Development Guide

**Generated:** 2026-03-16 | **Commit:** 5708fca | **Branch:** main

## Overview
Browser extension (Chrome/Firefox) for syncing bookmarks via GitHub Gist or WebDAV. Built with WXT + React 18 + TypeScript.

**Stack:** WXT 0.19 | React 18 | TypeScript | Bootstrap 4 | ky | webext-options-sync

## Commands

```bash
npm run dev              # Start dev server (Chrome)
npm run dev:firefox      # Start dev server (Firefox)
npm run build            # Build for production (Chrome)
npm run build:firefox    # Build for production (Firefox)
npm run compile          # TypeScript type check (tsc --noEmit)
```

## Structure

```
src/
├── entrypoints/           # Extension entry points
│   ├── background.ts      # Service worker - message handling, sync ops
│   ├── popup/             # Toolbar popup UI
│   └── options/           # Settings page UI
├── utils/                 # Core utilities (see src/utils/AGENTS.md)
└── public/_locales/       # i18n message files (10 languages)
```

## Where to Look

| Task | Location |
|------|----------|
| Add message handler | `src/entrypoints/background.ts` |
| Add new setting | `optionsStorage.ts` → `setting.ts` → `options.tsx` |
| Modify sync logic | `src/utils/sync.ts` |
| Add API endpoint | `src/utils/services.ts` (Gist) or `webdav.ts` |
| Data model changes | `src/utils/models.ts` |
| Add i18n text | `src/public/_locales/*/messages.json` |

## Code Map

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `BookmarkInfo` | Class | models.ts:20 | Bookmark data model |
| `SyncDataInfo` | Class | models.ts:60 | Sync payload wrapper |
| `BookmarkHubError` | Class | errors.ts:47 | Typed error handling |
| `Setting.build()` | Method | setting.ts:104 | Get current settings |
| `BookmarkService` | Singleton | services.ts:52 | GitHub Gist API |
| `performSync()` | Function | sync.ts:134 | Main sync orchestration |
| `retryOperation()` | Function | retry.ts:59 | Network retry with backoff |

## Conventions

- **Indentation:** 2 spaces
- **Strings:** Single quotes
- **Semicolons:** Required
- **Line length:** Max 120 chars
- **Comments:** Chinese acceptable
- **Imports:** external → internal → styles

```typescript
// Naming conventions
BookmarkInfo        // Classes/Types/Interfaces
BrowserType.CHROME  // Enums
githubToken         // Variables/Functions
enableAutoSync      // Booleans (prefix: is/has/enable)
```

## Anti-Patterns

### DO NOT
- Use `chrome` API → use `browser` for cross-browser compatibility
- Forget `return true` in async message listeners
- Use `as any` / `@ts-ignore` → use `unknown` with type assertion
- Access `optionsStorage` directly → use `await Setting.build()`
- Log sensitive data (tokens, passwords) to console

### Security Notes
- Credentials stored in plain text in browser storage
- Remove all `console.log` before production
- WebDAV uses Basic Auth (base64 encoded, not encrypted)

## TODO (Unimplemented)

| Location | Description |
|----------|-------------|
| `sync.ts:315` | Complex merge logic (detect add/delete/modify) |
| `sync.ts:369` | Change detection implementation |
| `sync.ts:380` | Change detection logic |

## Architecture Patterns

### Settings Access
```typescript
const setting = await Setting.build()  // ALWAYS use this pattern
```

### Message Passing
```typescript
// Background listener
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.name === 'upload') {
        uploadBookmarks().then(() => sendResponse(true))
    }
    return true  // Required for async
})
```

### Conflict Prevention
- `OperType` enum marks current operation state
- `isSyncing` lock prevents concurrent syncs
- Ignore bookmark events during sync operations

## Resources
- [WXT Docs](https://wxt.dev/)
- [Chrome Extension APIs](https://developer.chrome.com/docs/extensions/reference/)
- [webext-options-sync](https://github.com/fregante/webext-options-sync)
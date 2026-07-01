# AGENTS.md - BookmarkHub Development Guide

**Generated:** 2026-05-11 | **Commit:** d7b9cbf | **Branch:** main

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
npm run test             # Run all unit tests
npm run test:watch       # Test watch mode
npm run test:coverage    # Test coverage report
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
| `BookmarkInfo` | Class | models.ts | Bookmark data model |
| `SyncDataInfo` | Class | models.ts | Sync payload wrapper (deprecated in v2) |
| `Tombstone` | Interface | models.ts | Deletion marker |
| `BookmarkHubError` | Class | errors.ts | Typed error handling |
| `Setting.build()` | Method | setting.ts | Get current settings |
| `BookmarkService` | Singleton | services.ts | GitHub Gist API |
| `WebDAVService` | Singleton | webdav.ts | WebDAV client |
| `performSync()` | Function | sync.ts | Main sync orchestration |
| `mergeBookmarks()` | Function | merge.ts | Three-way merge algorithm |
| `detectChanges()` | Function | changeDetection.ts | Change detection |
| `retryOperation()` | Function | retry.ts | Network retry with backoff |
| `encryptCredential()` | Function | crypto.ts | Web Crypto API credential encryption |
| `uploadManualBookmarks()` | Function | manualSyncTransfer.ts | Manual upload to selected backend |
| `downloadManualBookmarks()` | Function | manualSyncTransfer.ts | Manual download from selected backend |
| `getBackupRecords()` | Function | localCache.ts | List backup history |
| `getBrowserInfo()` | Function | browserInfo.ts | Runtime browser/OS detection |

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

| 功能 | 优先级 |
|------|--------|
| 移动端支持 | Low |
| 端到端数据加密 | Medium |
| 书签分享功能 | Low |
| 自动化测试与 CI/CD 流水线 | Medium |

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

## Documentation

详细中文技术文档请参阅 `docs/` 目录：

| 文档 | 文件 | 内容 |
|------|------|------|
| 项目架构总览 | `docs/项目架构总览.md` | 系统架构、目录结构、数据模型 |
| 数据流与同步机制 | `docs/数据流与同步机制.md` | 同步模式、合并算法、墓碑机制 |
| 核心模块详解 | `docs/核心模块详解.md` | 12个核心模块的详细说明 |
| 开发者指南 | `docs/开发者指南.md` | 开发环境、代码规范、调试技巧 |

其他参考文档：
- `/CLAUDE.md` - Claude Code 开发指南
- `/src/utils/AGENTS.md` - 工具模块详情
- `/src/entrypoints/AGENTS.md` - 入口点详情

## Resources
- [WXT Docs](https://wxt.dev/)
- [Chrome Extension APIs](https://developer.chrome.com/docs/extensions/reference/)
- [webext-options-sync](https://github.com/fregante/webext-options-sync)
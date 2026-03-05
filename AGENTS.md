# AGENTS.md - BookmarkHub Development Guide

## Project Overview
BookmarkHub is a browser extension (Chrome/Firefox) for syncing bookmarks via GitHub Gist or WebDAV. Built with WXT, React 18, and TypeScript.

## Commands

### Development
```bash
npm run dev              # Start dev server (Chrome)
npm run dev:firefox      # Start dev server (Firefox)
```

### Build & Release
```bash
npm run build            # Build for production (Chrome)
npm run build:firefox    # Build for production (Firefox)
npm run zip              # Create distributable ZIP (Chrome)
npm run zip:firefox      # Create distributable ZIP (Firefox)
```

### Type Checking
```bash
npm run compile          # Run TypeScript compiler (tsc --noEmit)
```

### Testing
```bash
npm test                 # Run tests (if configured)
npx vitest run src/utils/services.test.ts  # Run single test file
```

---

## Code Style

### General
- 2 spaces for indentation
- Single quotes for strings
- Semicolons at end of statements
- Max 120 characters per line
- Chinese comments are acceptable in this codebase

### Imports (order: external → internal → styles)
```typescript
import React, { useState, useEffect } from 'react'
import { Dropdown, Badge } from 'react-bootstrap'
import { Setting } from './setting'
import BookmarkService from '../utils/services'
import { BookmarkInfo } from '../utils/models'
import 'bootstrap/dist/css/bootstrap.min.css'
import './popup.css'
```

### TypeScript
- Explicit types for parameters and return types
- Avoid `any`; use `unknown` with type assertion when needed
- Use interfaces for data structures, classes for models with logic
```typescript
const Popup: React.FC = () => { ... }
async function uploadBookmarks(): Promise<void> { ... }
export interface SyncRecord { lastSyncTime: number; ... }
export class BookmarkInfo { title: string = ""; ... }
```

### Naming Conventions
- Classes/Types/Interfaces: PascalCase (`BookmarkInfo`, `SyncDataInfo`)
- Enums: PascalCase (`enum BrowserType { FIREFOX, CHROME }`)
- Variables/Functions: camelCase (`githubToken`, `getSetting()`)
- Booleans: prefix with `is`, `has`, `enable` (`enableNotify`, `enableAutoSync`)
- Constants: PascalCase (`rootBookmarks`)
- Private class members: no prefix, use `private` keyword

### React Components
- Use functional components with hooks
- Use `React.FC` type annotation
- Use `useState<T>()` with explicit generic types for complex state
```typescript
const Popup: React.FC = () => {
    const [count, setCount] = useState<{ local: string; remote: string }>({ local: "0", remote: "0" })
    useEffect(() => { ... }, [])
    return ( <div>...</div> )
}
```

### Error Handling
```typescript
async function uploadBookmarks() {
    try {
        let setting = await Setting.build()
        if (setting.githubToken == '') throw new Error("Gist Token Not Found")
    } catch (error: unknown) {
        console.error(error)
        const err = error as Error
        // Handle error...
    }
}
```

### Browser Extension Patterns
- Use WXT's `defineBackground` wrapper for background scripts
- Use `browser` API (not `chrome`) for cross-browser compatibility
- Always return `true` from async message listeners
```typescript
export default defineBackground(() => {
    browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.name === 'upload') {
            uploadBookmarks().then(() => sendResponse(true))
        }
        return true  // Required for async responses
    })
})
```

### Internationalization (i18n)
- Use `browser.i18n.getMessage('key')` for all user-facing text
- Message files are in `.output/chrome-mv3/_locales/{locale}/messages.json`
- Source locale files: `public/_locales/{locale}/messages.json`

---

## File Organization
```
src/
├── entrypoints/           # Extension entry points
│   ├── background.ts      # Service worker (main background script)
│   ├── popup/             # Popup page (popup.tsx, popup.css)
│   └── options/           # Options page (options.tsx)
├── utils/                 # Utility modules
│   ├── models.ts          # Data types and classes
│   ├── setting.ts         # Settings management
│   ├── services.ts        # GitHub Gist API operations
│   ├── sync.ts            # Auto-sync functionality
│   ├── webdav.ts          # WebDAV client
│   ├── http.ts            # HTTP client (ky)
│   ├── optionsStorage.ts  # Options persistence
│   ├── importer.ts        # Bookmark import
│   ├── exporter.ts        # Bookmark export
│   └── icons.ts           # Icon utilities
├── assets/                # Static assets (icons, images)
└── public/_locales/       # i18n message files
```

---

## Common Tasks

### Add a new feature
1. Create/update models in `src/utils/models.ts`
2. Add background listener in `src/entrypoints/background.ts`
3. Create/update React component in appropriate entrypoint
4. Add i18n keys to locale files in `public/_locales/*/messages.json`
5. Test with `npm run dev`

### Add a new setting
1. Add default value to `src/utils/optionsStorage.ts` defaults object
2. Add property to `SettingBase` class in `src/utils/setting.ts`
3. Update `Setting.build()` to copy the new setting
4. Add form field to `src/entrypoints/options/options.tsx`

### Add a new message type
1. Add handler in `background.ts` runtime.onMessage listener
2. Send message from popup/options: `browser.runtime.sendMessage({ name: 'actionName' })`
3. Return `true` for async responses

---

## Architecture Notes

### Settings Pattern
- `optionsStorage.ts`: Defines defaults and handles persistence via `webext-options-sync`
- `setting.ts`: `Setting` class with static `build()` method for type-safe access
- Always use `await Setting.build()` to get current settings

### Sync System
- Auto-sync runs on interval (if enabled) via `startAutoSync()`/`stopAutoSync()`
- Manual sync triggered via message: `{ name: 'upload' }` or `{ name: 'download' }`
- Sync state tracked via `OperType` enum to prevent recursive operations

### Storage Backends
- GitHub Gist: Primary storage via `BookmarkService` class
- WebDAV: Alternative storage via `webdav.ts` module
- Storage type selected via `storageType` setting

---

## Resources
- [WXT Docs](https://wxt.dev/)
- [React 18](https://react.dev/)
- [Chrome Extension APIs](https://developer.chrome.com/docs/extensions/reference/)
- [webext-options-sync](https://github.com/fregante/webext-options-sync)
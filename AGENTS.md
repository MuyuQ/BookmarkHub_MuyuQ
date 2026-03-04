# AGENTS.md - BookmarkHub Development Guide

## Project Overview
BookmarkHub is a browser extension (Chrome/Firefox) for syncing bookmarks via GitHub Gists. Built with WXT, React 18, and TypeScript.

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
npm run zip             # Create distributable ZIP (Chrome)
npm run zip:firefox     # Create distributable ZIP (Firefox)
```

### Type Checking
```bash
npm run compile         # Run TypeScript compiler (tsc --noEmit)
```

### Testing (no tests currently)
```bash
npm test                # Run tests (if configured)
npx vitest run src/utils/services.test.ts  # Run single test file
```

---

## Code Style

### General
- 2 spaces for indentation
- Single quotes for strings
- Semicolons at end of statements
- Max 120 characters per line

### Imports (order: external → internal → styles)
```typescript
import React, { useState } from 'react'
import { Dropdown } from 'react-bootstrap'
import { Setting } from './setting'
import BookmarkService from '../utils/services'
import { BookmarkInfo } from '../utils/models'
import './popup.css'
```

### TypeScript
- Explicit types for parameters and return types
- Avoid `any`; use `unknown` with type assertion
```typescript
const Popup: React.FC = () => { ... }
async function uploadBookmarks(): Promise<void> { ... }
catch (error: unknown) { const err = error as Error; ... }
```

### Naming Conventions
- Classes/Types: PascalCase (`BookmarkInfo`, `SyncDataInfo`)
- Enums: PascalCase (`enum BrowserType { FIREFOX, CHROME }`)
- Variables/Functions: camelCase (`githubToken`, `getSetting()`)
- Booleans: prefix with `is`, `has`, `enable` (`enableNotify`)
- Constants: PascalCase (`rootBookmarks`)

### React Components
```typescript
const Popup: React.FC = () => {
    const [count, setCount] = useState<{ local: string }>({ local: "0" })
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
    }
}
```

### Browser Extension
- Use WXT's `defineBackground` wrapper
- Use `browser` API (not `chrome`)
```typescript
export default defineBackground(() => {
    browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        return true  // Required for async responses
    })
})
```

---

## File Organization
```
src/
├── entrypoints/           # Extension entry points
│   ├── background.ts      # Service worker
│   ├── popup/             # Popup page (popup.tsx, popup.css)
│   └── options/           # Options page (options.tsx)
├── utils/                 # Utility modules
│   ├── models.ts          # Data types
│   ├── setting.ts         # Settings management
│   ├── services.ts        # Business logic
│   ├── http.ts            # HTTP client (ky)
│   ├── optionsStorage.ts  # Options persistence
│   └── icons.ts           # Icon utilities
└── assets/                # Static assets
```

---

## Common Tasks

### Add a new feature
1. Create/update models in `src/utils/models.ts`
2. Add background listener in `src/entrypoints/background.ts`
3. Create/update React component in appropriate entrypoint
4. Test with `npm run dev`

### Add a new setting
1. Add to `src/utils/optionsStorage.ts`
2. Update `Setting` class in `src/utils/setting.ts`
3. Add to options page UI

---

## Resources
- [WXT Docs](https://wxt.dev/)
- [React 18](https://react.dev/)
- [Chrome Extension APIs](https://developer.chrome.com/docs/extensions/reference/)

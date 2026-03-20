# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

BookmarkHub - 跨浏览器书签同步扩展，支持 GitHub Gist 和 WebDAV 后端。

**技术栈:** WXT 0.19 | React 18 | TypeScript | Bootstrap 4

## Commands

```bash
npm run dev              # 开发模式 (Chrome)
npm run dev:firefox      # 开发模式 (Firefox)
npm run build            # 生产构建
npm run compile          # TypeScript 类型检查
npm run test             # 运行所有单元测试
npm run test:watch       # 测试监听模式
npm run test:coverage    # 测试覆盖率
npx vitest run path/to/test.ts   # 运行单个测试文件
```

## Architecture

```
Popup/Options ──browser.runtime.sendMessage──> background.ts
                                                   │
                    ┌──────────────────────────────┼──────────────────────────────┐
                    │                              │                              │
                    ▼                              ▼                              ▼
              services.ts                    webdav.ts                      bookmarkUtils.ts
           (GitHub Gist API)              (WebDAV 客户端)                   (书签操作)
                    │                              │                              │
                    └──────────────────────────────┼──────────────────────────────┘
                                                   ▼
                                              sync.ts (同步逻辑)
                                                   │
                    ┌──────────────────────────────┼──────────────────────────────┐
                    ▼                              ▼                              ▼
              changeDetection.ts              merge.ts                      localCache.ts
              (变更检测)                      (合并逻辑)                    (本地缓存)
```

## Key Files

| 用途 | 文件 |
|------|------|
| 后台服务 | `src/entrypoints/background.ts` |
| 数据模型 | `src/utils/models.ts` |
| 同步逻辑 | `src/utils/sync.ts` |
| GitHub API | `src/utils/services.ts` |
| WebDAV | `src/utils/webdav.ts` |
| 错误处理 | `src/utils/errors.ts` |
| 设置管理 | `src/utils/setting.ts` |
| 变更检测 | `src/utils/changeDetection.ts` |
| 合并逻辑 | `src/utils/merge.ts` |
| 日志 | `src/utils/logger.ts` |

## Critical Patterns

### Settings Access
```typescript
const setting = await Setting.build()  // 必须使用此模式，不可直接访问 optionsStorage
```

### Path Alias
```typescript
import { BookmarkInfo } from '@/utils/models'  // @/ 指向 src/
```

### Message Passing
```typescript
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.name === 'someAction') {
        someAsyncOperation().then(() => sendResponse(true))
    }
    return true  // 异步必须返回 true
})
```

### Error Handling
```typescript
catch (error: unknown) {
    const err = handleError(error)
    console.error(err.toLogString())
}
```

### Network Retry
```typescript
await retryOperation(() => api.call(), { maxRetries: 3, logRetries: true })
```

## Anti-Patterns

- 使用 `chrome` API → 使用 `browser` (跨浏览器兼容)
- 忘记 `return true` 在异步消息监听器中
- 直接访问 `optionsStorage` → 使用 `await Setting.build()`
- 使用 `as any` / `@ts-ignore` → 使用 `unknown` 配合类型断言
- 在控制台记录敏感数据（token、密码）

## Tests

测试文件位于 `src/utils/*.test.ts`，使用 Vitest + Testing Library。

```bash
# 测试设置文件
tests/setup.ts  # Mock browser API (storage, bookmarks, runtime 等)
```

测试中使用 `globalThis.browser` 访问 mock 的浏览器 API。

## Code Conventions

- 缩进: 2 spaces
- 字符串: 单引号
- 分号: 必须
- 行宽: 最大 120 字符
- 注释: 可使用中文

## Documentation

详细模块文档请参阅：
- `/AGENTS.md` - 项目概览
- `/src/utils/AGENTS.md` - 工具模块详情
- `/src/entrypoints/AGENTS.md` - 入口点详情
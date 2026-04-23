# BookmarkHub 全面重构设计文档

**日期:** 2026-04-15  
**分支:** refactor-v2  
**状态:** 待审查

---

## 1. 概述

对 BookmarkHub 浏览器扩展进行全面重构，包括：
- 模块拆分（解决代码臃肿问题）
- 依赖升级（bootstrap、react-bootstrap、react-hook-form）
- Bug 修复（删除回滚、敏感字段加密、废弃 API 等）
- 测试补充（覆盖所有未测试模块）

---

## 2. 当前问题

### 2.1 代码臃肿
| 文件 | 行数 | 问题 |
|------|------|------|
| `background.ts` | 610 | 消息处理、书签 CRUD、墓碑管理、徽章更新混在一起 |
| `sync.ts` | 775 | 同步编排、数据获取、备份管理、上传逻辑耦合 |

### 2.2 数据格式不一致
- `background.ts` 使用 v1 格式 (`SyncDataInfo`)
- `sync.ts` 使用 v2 格式 (`SyncData`)
- 手动上传和自动同步使用不同数据格式

### 2.3 依赖过时
| 包 | 当前版本 | 最新版本 | 风险 |
|---|---------|---------|------|
| bootstrap | 4.6.0 | 5.3.x | 安全漏洞，CSS 类名变更 |
| react-bootstrap | 1.5.2 | 2.10.x | API 变更 |
| react-hook-form | 6.15.5 | 7.51.x | 表单 API 变更较大 |
| lz-string | 1.5.0 | - | 未使用，应移除 |

### 2.4 潜在 Bug
1. `clearBookmarkTree` 删除操作无回滚机制
2. `masterPassword` 未列入敏感字段加密
3. `webdav.ts` 使用已废弃的 `unescape()`
4. `setting.ts` 缓存 TTL 仅 5 秒
5. `logger.ts` 日志级别无法动态调整
6. `errors.ts` 错误判断使用 `startsWith('SYNC_')` 不精确

### 2.5 测试缺失
- `background.ts` - 无测试
- `importer.ts` / `exporter.ts` - 无测试
- `crypto.ts` - 无测试
- `localCache.ts` - 无测试
- `debounce.ts` - 无测试
- `setting.ts` - 无测试
- `http.ts` - 无测试
- `optionsStorage.ts` - 无测试

---

## 3. 目标架构

### 3.1 模块拆分

#### background.ts 拆分

```
src/entrypoints/
├── background.ts              # 入口文件 (~100行)
│   └── 职责: Service Worker 入口，注册消息监听器
└── background/
    ├── messageHandlers.ts     # 消息处理 (~150行)
    │   └── 职责: 处理 popup/options 消息，路由到对应操作
    ├── bookmarkOperations.ts  # 书签操作 (~200行)
    │   └── 职责: 书签增删改查、树遍历、备份创建
    ├── tombstoneManager.ts    # 墓碑管理 (~80行)
    │   └── 职责: 墓碑创建、清理、查询
    └── badgeManager.ts        # 徽章管理 (~50行)
        └── 职责: 更新扩展图标徽章
```

#### sync.ts 拆分

```
src/utils/
├── sync/
│   ├── orchestrator.ts        # 同步编排 (~200行)
│   │   └── 职责: performSync() 主流程，协调各子模块
│   ├── dataFetcher.ts         # 数据获取 (~150行)
│   │   └── 职责: fetchRemoteData() 及相关逻辑
│   ├── backupManager.ts       # 备份管理 (~120行)
│   │   └── 职责: 备份记录创建、清理、查询
│   └── uploadManager.ts       # 上传管理 (~150行)
│       └── 职责: uploadBookmarks() v2 格式上传
├── merge.ts                   # 保持不变
├── changeDetection.ts         # 保持不变
└── sync.ts                    # 向后兼容导出层 (~50行)
    └── 职责: 保留旧导出，标记 deprecated
```

### 3.2 数据格式统一

- 删除 `SyncDataInfo` (v1) 相关代码
- 统一使用 `SyncData` (v2) 作为唯一数据格式
- `background.ts` 的手动上传迁移到 v2 格式

### 3.3 依赖升级策略

1. 升级 `bootstrap` 4.6 → 5.3
2. 升级 `react-bootstrap` 1.5 → 2.10
3. 升级 `react-hook-form` 6 → 7
4. 移除 `lz-string`
5. 修复所有因升级导致的 breaking changes

### 3.4 Bug 修复清单

| Bug | 修复方案 |
|-----|---------|
| 删除无回滚 | 添加事务机制或补偿操作 |
| 敏感字段遗漏 | `masterPassword` 加入加密列表 |
| 废弃 API | `unescape(encodeURIComponent())` → `TextEncoder` |
| 缓存 TTL 过短 | 5秒 → 15秒 |
| 日志级别固定 | 支持运行时动态调整 |
| 错误判断不精确 | `startsWith('SYNC_')` → 显式枚举列表 |

### 3.5 测试补充

预计新增 15 个测试文件，约 195 个测试用例：

| 测试文件 | 覆盖模块 | 预计用例 |
|---------|---------|---------|
| `messageHandlers.test.ts` | 消息路由 | ~15 |
| `bookmarkOperations.test.ts` | 书签 CRUD | ~25 |
| `tombstoneManager.test.ts` | 墓碑管理 | ~10 |
| `orchestrator.test.ts` | 同步编排 | ~15 |
| `dataFetcher.test.ts` | 远程数据获取 | ~10 |
| `backupManager.test.ts` | 备份管理 | ~10 |
| `uploadManager.test.ts` | 上传逻辑 | ~10 |
| `importer.test.ts` | 书签导入 | ~15 |
| `exporter.test.ts` | 书签导出 | ~15 |
| `crypto.test.ts` | 加密解密 | ~10 |
| `localCache.test.ts` | 缓存管理 | ~10 |
| `debounce.test.ts` | 防抖器 | ~10 |
| `setting.test.ts` | 设置构建 | ~10 |
| `http.test.ts` | HTTP 客户端 | ~10 |
| `optionsStorage.test.ts` | 设置存储 | ~10 |

---

## 4. 执行顺序

```
阶段 1: 模块重构
  1.1 拆分 background.ts
  1.2 拆分 sync.ts
  1.3 统一数据格式 (v1 → v2)

阶段 2: 依赖升级
  2.1 升级 bootstrap + react-bootstrap
  2.2 升级 react-hook-form
  2.3 移除 lz-string
  2.4 修复 breaking changes

阶段 3: Bug 修复
  3.1 删除回滚机制
  3.2 敏感字段加密
  3.3 废弃 API 替换
  3.4 缓存 TTL 调整
  3.5 日志级别动态化
  3.6 错误判断精确化

阶段 4: 测试补充
  4.1 background 模块测试
  4.2 sync 模块测试
  4.3 工具函数测试
  4.4 运行完整测试套件

阶段 5: 最终验证
  5.1 npm run build
  5.2 npm run compile
  5.3 npm test (全部通过)
  5.4 合并回 main
```

---

## 5. 风险控制

### 5.1 分支隔离
- 所有工作在 `refactor-v2` 分支进行
- 不影响 `main` 分支的稳定性

### 5.2 阶段性验证
- 每个阶段完成后运行 `npm run build` + `npm run compile`
- 确保代码可构建、类型检查通过

### 5.3 回退方案
- 如果某个模块重构失败，可单独回退
- 使用 git worktree 隔离工作环境

### 5.4 测试保障
- 重构完成后运行全部测试
- 新增测试覆盖所有未测试模块
- 确保无回归问题

---

## 6. 验收标准

- [ ] 所有测试通过 (现有 117 + 新增 ~195 = ~312 个测试)
- [ ] `npm run build` 成功
- [ ] `npm run compile` 无类型错误
- [ ] `background.ts` 拆分为 4 个独立模块
- [ ] `sync.ts` 拆分为 4 个独立模块 + 兼容层
- [ ] 数据格式统一为 v2
- [ ] 所有依赖升级到最新稳定版
- [ ] 所有已知 Bug 修复完成
- [ ] 代码覆盖率显著提升

---

## 7. 后续工作

- 考虑添加 E2E 测试
- 评估是否需要添加性能测试
- 更新项目文档和 AGENTS.md
- 清理过时的 TODO 标记

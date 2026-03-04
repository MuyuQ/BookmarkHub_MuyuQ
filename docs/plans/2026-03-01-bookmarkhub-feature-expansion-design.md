# BookmarkHub 功能扩展设计文档

**日期**：2026-03-01

**目标**：扩展 BookmarkHub 功能，实现自动同步、导入导出、WebDAV 支持

---

## 1. 项目概述

BookmarkHub 是一款浏览器扩展，用于通过 GitHub Gist 同步不同浏览器间的书签。本次更新将增加自动同步、导入导出和 WebDAV 支持功能。

---

## 2. 待实现功能

### 2.1 自动同步书签

#### 2.1.1 同步触发方式

| 模式 | 描述 |
|------|------|
| 定时同步 | 按设定的时间间隔自动同步 |
| 事件触发 | 浏览器启动时 + 书签变动时 |
| 混合模式 | 支持定时和事件触发两种方式（用户可选择） |

#### 2.1.2 时间间隔选项

- 15 分钟
- 30 分钟
- 1 小时
- 6 小时
- 24 小时

#### 2.1.3 实现方案

- 使用 `setInterval` 实现定时同步
- 使用 `browser.runtime.onStartup` 监听浏览器启动
- 复用现有的 `browser.bookmarks.onCreated/onChanged/onMoved/onRemoved` 事件监听书签变动

---

### 2.2 冲突解决策略

#### 2.2.1 智能合并（默认模式）

- 检测书签变动（新增/修改/删除）
- 基于时间戳判断新旧，保留最新版本
- 全自动，无需用户干预
- 类似于 Git 的 merge 策略

#### 2.2.2 提醒模式（可选）

- 检测到冲突时弹窗询问用户
- 用户可选择：保留本地 / 保留远程 / 手动合并

#### 2.2.3 模式选择

- 用户可在设置中选择：自动模式 / 提醒模式

---

### 2.3 导入导出

#### 2.3.1 支持格式

| 格式 | 导出 | 导入 |
|------|------|------|
| JSON | ✅ | ✅ |
| HTML（浏览器书签格式） | ✅ | ✅ |

#### 2.3.2 实现方案

- 使用 `<input type="file">` 实现文件选择
- 使用 `<a download>` 实现文件下载
- HTML 格式兼容 Chrome、Firefox、Edge 等浏览器

---

### 2.4 WebDAV 支持

#### 2.4.1 新增设置项

| 设置项 | 描述 |
|--------|------|
| storageType | 存储服务类型：github / webdav |
| webdavUrl | WebDAV 服务器 URL |
| webdavUsername | WebDAV 用户名 |
| webdavPassword | WebDAV 密码 |
| webdavPath | WebDAV 路径（如 /bookmarks.json） |

#### 2.4.2 实现方案

- 新增存储服务选项：GitHub Gist / WebDAV
- 创建 WebDAV 客户端服务（复用现有 HTTP 服务架构）
- 支持连接私有云盘（Nextcloud、OwnCloud）、NAS 设备等

---

## 3. 设置页面更新

### 3.1 新增设置项

```
├── 自动同步
│   ├── 启用自动同步 [开关]
│   ├── 同步模式 [定时/事件/混合]
│   └── 同步间隔 [15分钟/30分钟/1小时/6小时/24小时]
├── 冲突处理
│   └── 处理模式 [自动合并/提醒用户]
├── 导入导出
│   ├── 导出为 JSON
│   ├── 导出为 HTML
│   └── 从文件导入
└── 存储服务
    └── 类型 [GitHub Gist / WebDAV]
        ├── (GitHub Gist 选项)
        └── (WebDAV 选项)
            ├── 服务器 URL
            ├── 用户名
            ├── 密码
            └── 路径
```

---

## 4. 数据模型更新

### 4.1 新增设置项

```typescript
// optionsStorage.ts
interface SyncOptions {
  // 自动同步
  enableAutoSync: boolean;
  syncMode: 'interval' | 'event' | 'hybrid';
  syncInterval: 15 | 30 | 60 | 360 | 1440; // 分钟

  // 冲突处理
  conflictMode: 'auto' | 'prompt';

  // 存储服务
  storageType: 'github' | 'webdav';

  // WebDAV
  webdavUrl: string;
  webdavUsername: string;
  web string;
  webdavPath:davPassword: string;
}
```

### 4.2 同步记录

```typescript
interface SyncRecord {
  lastSyncTime: number;
  lastSyncDirection: 'upload' | 'download';
  lastSyncStatus: 'success' | 'failed';
}
```

---

## 5. 架构设计

### 5.1 模块划分

```
src/
├── entrypoints/
│   ├── background.ts      # 服务Worker - 同步逻辑
│   ├── popup/             # 弹出页面
│   └── options/           # 设置页面 - UI更新
├── utils/
│   ├── models.ts          # 数据类型更新
│   ├── setting.ts         # 设置管理更新
│   ├── services.ts        # 业务逻辑
│   ├── http.ts            # HTTP客户端 (GitHub)
│   ├── webdav.ts          # WebDAV客户端 [新增]
│   ├── sync.ts            # 同步核心逻辑 [新增]
│   ├── importer.ts        # 导入功能 [新增]
│   ├── exporter.ts         # 导出功能 [新增]
│   └── optionsStorage.ts  # 设置持久化更新
```

### 5.2 核心流程

#### 自动同步流程

```
1. 用户启用自动同步
2. 根据 syncMode 设置：
   - interval: 启动 setInterval 定时器
   - event: 注册 browser.runtime.onStartup 和 bookmarks 事件
   - hybrid: 同时启用 interval 和 event
3. 触发同步时：
   - 获取远程数据
   - 与本地数据合并
   - 处理冲突（根据 conflictMode）
   - 上传/下载变更
4. 记录同步状态和时间
```

---

## 6. 错误处理

### 6.1 网络错误

- GitHub Gist：显示错误提示，提供重试选项
- WebDAV：显示服务器连接错误，提供重试选项

### 6.2 冲突错误

- 自动模式：记录冲突日志，继续合并
- 提醒模式：弹窗让用户选择

### 6.3 数据错误

- 导入文件格式错误：提示用户文件格式不正确
- JSON 解析失败：提示用户检查文件内容

---

## 7. 测试计划

### 7.1 单元测试

- 同步逻辑测试
- 冲突解决测试
- 导入导出测试

### 7.2 集成测试

- GitHub Gist 同步测试
- WebDAV 同步测试

---

## 8. 后续工作

实现计划将详细列出每个功能的开发步骤、任务分解和时间估算。

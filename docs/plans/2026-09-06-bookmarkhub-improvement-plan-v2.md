# BookmarkHub 改进计划书 v2

**日期：** 2026-09-06
**基线：** main @ e86cdce（工作区干净），版本 0.7.0
**分析范围：** 全仓库（src 约 12,700 行含测试；配置、CI、i18n、依赖、Git 状态、构建产物）
**分析方法：** 四路并行深度审计（同步核心正确性 / 安全 / UI 与入口点 / 测试与工程化），逐条人工读码复核；实测 `tsc --noEmit` 零错误、344/344 单测通过、`npm run lint` 0 error/6 warning

---

## 〇、与 2026-08-29 计划（v1）的衔接

v1 计划阶段 0-6 已按期完成，**修复质量整体较高，不是"注释式修复"**：写回本地树（P0-2）、统一上传路径（P0-3/4）、事件排队重放（P1-1）、raw_url 白名单（P1-10）、共享 sanitize 模块（P1-11 主体）、加密版本前缀（P1-13 主体）、单 origin 权限（P1-14）、11 语言包键补齐、344 个真实通过的测试等均已在代码中核实。

但复核发现三类新问题，构成本计划（v2）的主体：

1. **修复的"最后一公里"缺口**——例如：同步失败状态从不持久化（"上次同步"UI 的失败分支是死代码）、popup 仍用原生 `confirm/alert`、CI 不跑 lint 与 coverage（两条门禁实际都不设防）；
2. **新发现的正确性缺陷**——最重要的一条：**重复 URL 书签共用同一稳定 ID**，会在多设备场景下静默丢失书签副本并引发墓碑误杀（见 P0-1）；
3. **一条完整的 sanitize 绕过链**——恶意远程数据可经"备份恢复"注入 `javascript:` 书签（见 P1-8）。

### v1 阶段 0-6 复核总表

| v1 计划项 | 复核结论 | 残留缺口（v2 编号） |
|---|---|---|
| P0-1 syncInterval /60 | 彻底修复（sync.ts:158；background.ts:19-29 含 syncInterval 变更监听） | — |
| P0-2 写回本地树 | 基本彻底（sync/writeback.ts + 基线以真实树重建 + bulk 保护） | 写回部分失败时基线分叉（P1-4） |
| P0-3/4 手动路径统一 | 彻底（uploadSnapshot 统一路径 + 剥根 + 墓碑合并） | 自动同步上传不过滤墓碑节点（P1-2） |
| P0-5 智能同步入口 | 彻底（popup 入口 + 结果反馈） | 错误消息未 i18n、成功反馈弱（P1-12） |
| P0-6 语言包损坏 | 彻底（JSON/BOM 修复 + validate-locales） | 校验脚本只比数量不比键集合（P1-17） |
| P0-7 conflictMode prompt | 部分修复（UI 已移除选项） | 存量 'prompt' 值仍生效、静默本地赢（P1-7） |
| P1-1 事件排队重放 | 彻底（listeners.ts 队列 + performSync finally 重放） | bulk 期间事件直接丢弃（窗口小，P2） |
| P1-2 时间戳校验 | 彻底（放宽为非严格降序 + 排序） | — |
| P1-3/4 统一锁 | 部分（operationQueue 已收编全部消息入口与 Alarm） | LockManager 死代码并行锁、持久锁 TOCTOU、中断同步只跳过不恢复（P1-5） |
| P1-5 pendingSync 恢复 | 彻底（onInstalled/onStartup 已接入） | — |
| P1-6 先清后建 | 部分（失败通知已明确） | 仍非原子、无回滚快照（P2） |
| P1-7 合成根/跨语言根名 | 部分（空 title 合成根已跳过） | 本地化根名映射覆盖有限（P2） |
| P1-8 层级导入 | 彻底（:scope + 递归 + 去重） | 导入在 popup 上下文执行，失焦中断（P1-15） |
| P1-9 findConflicts O(n×m) | 彻底（Map 索引） | stable ID 弱哈希升级为 v2 的 P0-1 |
| P1-10 raw_url 白名单 | 彻底（含 user-info 绕过防护与测试） | raw 响应体无大小上限（P2） |
| P1-11 共享 sanitize | 部分修复（同步/导入/手动下载路径已接入） | 备份恢复链路完全绕过（P1-8）；手动下载无大小上限（P1-11） |
| P1-12 https+超时 | 部分（AbortController 超时彻底） | 明文 http 仍被接受且无用户可见警告（P1-9） |
| P1-13 加密前缀 | 大部分修复（前缀 + 解密失败不再静默清空） | 解密失败无 UI 提示；新发现主密码静默清除 bug（P1-10） |
| P1-14 单 origin 权限 | 基本彻底 | 旧版升级用户的全站授权不回收（P2） |
| P2 死代码/依赖 | 大部分完成（lz-string/react-hook-form/happy-dom 已删） | icons.ts、formatBookmarks、LockManager、REMOVE_ALL 死协议残留（P2-1） |
| P2-7 options UI | 部分 | GitHub 测试连接测错对象（P1-13）、WebDAV 测试可卡死（P1-14） |
| P2-9 上次同步展示 | 部分 | 失败状态从不持久化（P1-11） |
| P2-10 确认弹窗 | 部分 | options 已换 Modal；popup 仍原生 confirm/alert（P1-12） |
| P2-11 i18n | 大部分（27 个错误码 ×11 语言齐全） | popup/options 三条错误路径绕过 i18n；~45 死键/语言（P1-12、P2-6） |
| P2-12 工程化 | 大部分（CI/ESLint/Prettier/阈值/gitignore 就位） | CI 不跑 lint+coverage、entrypoints 仍在排除清单（P1-16/18） |

---

## 一、总体评估

项目的"账面健康度"良好：类型检查零错误、344 个测试真实通过、utils 行覆盖 84%、无 XSS 注入面（无 innerHTML/eval/dangerouslySetInnerHTML）、消息入口有 sender 校验、权限最小化、MV3 CSP 默认安全。

但本轮审计确认：**核心稳定 ID 方案存在一个比 v1 全部 P0 更隐蔽的数据丢失缺陷（重复 URL 碰撞）**，v1 修复存在一批"最后一公里"缺口（状态持久化、错误本地化、徽章清理、门禁接 CI），且 sanitize 体系存在一条真实可走的绕过链。

### 问题总览

| 等级 | 定义 | 数量 |
|------|------|------|
| P0 | 多设备常见场景下静默丢失用户书签数据 | 1 项 |
| P1 | 特定场景正确性/安全缺陷、核心功能链路断裂 | 19 项 |
| P2 | 代码质量、工程化、可维护性、i18n 卫生 | 约 20 项 |

---

## 二、P0 问题清单

### P0-1 重复 URL 书签共用同一稳定 ID：跨设备丢失副本 + 墓碑误杀活书签

> **状态：✅ 已修复（2026-09-06），两个遗留点亦已闭合**。书签稳定 ID 改为"URL + 父路径哈希"，子树路径前缀对顶层根文件夹类型化（`buildChildPath`）；`detectChanges` 按 URL 将"旧路径 deleted + 新路径 created"重分类为 moved（移动不再产生墓碑、移回不受墓碑压制）；`merge.findConflicts` 对 moved 冲突增加 URL 回退配对，`applyChangesToBaseline` 支持跨 ID 移动（移旧插新）；`background.computeStableIdForRemovedNode` 书签墓碑统一掺入父路径。
>
> **遗留点闭合（同日）**：① 旧版纯 URL 墓碑 30 天过渡——`legacyBookmarkId` 双匹配接入两处墓碑过滤，升级后已删除书签不再复活；② 同文件夹重复 URL/同名文件夹——`generateStableId` 增加同级序号（duplicateIndex，规则由 `duplicateIndexOf` 与遍历计数双实现并测试一致性），重复项各自独立 ID。新增测试共 36 个，380/380 通过。

- **证据链：**
  - `src/utils/bookmarkUtils.ts:75-79` — `generateStableId` 对书签**仅以 URL 哈希**：`bm_${hashString(bookmark.url)}`。同一 URL 存放在两个文件夹（用户非常常见的用法）→ 两份书签获得**同一个稳定 ID**。
  - `src/utils/sync/writeback.ts:93-107` — `collectLocalRefs`/`mergedNodes` 均以 stableId 为 Map 键，后遍历的节点**覆盖**先遍历的 → 两份重复中只有一份受写回管理，另一份成为同步"幽灵节点"。
  - `src/utils/merge.ts:114-117` — `addBookmarkToTree` 发现同 ID 节点已存在时改为更新而非插入 → 联合合并/首次同步时，接收设备**只保留一份副本**，另一份的文件夹归属静默丢失。
  - 墓碑连锁（更严重）：用户删除其中一份 → `background.ts:299-311` 按 URL 生成 `bm_X` 墓碑 → 另一份同名 ID 的副本仍存活。手动上传路径 `filterTombstonedNodes`（manualSyncTransfer.ts:39）会把**所有** `bm_X` 节点从上传树中剔除（误杀存活副本）；自动同步路径则把"墓碑 + 活节点"矛盾数据同时上传（performSync 上传前不过滤墓碑，见 P1-2）。其他设备/新装设备上 `filterChangesByTombstones`（merge.ts:355-369）过滤 created 变更 → 该书签被 30 天僵尸墓碑压制，无法同步落地。
- **后果：** 多设备下同一 URL 的多份书签只保留一份；删除任一副本可能引发存活副本被误删或在 30 天内无法在任何设备重建。这是比弱哈希碰撞（v1 P1-9）更基本、触发更频繁的 ID 方案缺陷。
- **修复方向：** 书签稳定 ID 从"纯 URL"改为"URL + 父路径哈希"（与文件夹 ID 方案 `folder_<path>` 对齐），例如 `bm_<hash(url + '|' + parentPath)>`。**迁移成本已被现有设计消化**：`performSync` 步骤 4/5 已对远程树与基线按"当前算法"重新标准化（sync.ts:356,366），`writeback.ts:18-22`、`manualSyncTransfer.ts:37-38` 同样如此——三处 re-normalize 机制意味着只要算法全局一致，ID 方案升级是自洽的。唯一过渡成本：存量墓碑的 ID 由旧算法生成，升级后 30 天 TTL 内已删除书签可能复活一次，需在发布说明标注；`deletedBy` 可加算法版本号辅助排查。
- **工作量：** 2-3 人日（含 344 个既有测试回归 + 新增重复 URL 场景测试）

---

## 三、P1 问题清单

### 数据正确性（同步链路）

| # | 问题 | 证据 | 说明与建议 |
|---|------|------|------|
| P1-1 | **智能同步把本地缓存覆盖为单条备份记录，"恢复备份"历史退化为单点** | `sync.ts:426-437`（`newCache.backupRecords` 仅 1 条）；options 备份管理读取本地缓存（`localCache.ts:164-167`）；而远程保留 3 份（uploader MAX_BACKUPS） | 每次智能同步后，本地恢复点从最多 3 个跌至 1 个，与手动上传路径（保留合并后历史）行为不一致。修复：newCache.backupRecords 应在旧缓存基础上追加并截断至 MAX_BACKUPS |
| P1-2 | **performSync 上传快照不过滤墓碑节点** | `sync.ts:418`（`uploadSnapshot(finalTree, mergeResult.tombstones)`，uploader 内无过滤）；对比 `manualSyncTransfer.ts:39` 手动路径有 `filterTombstonedNodes` | 事件墓碑（用户删除）+ 同 ID 存活节点的组合会产生"墓碑 + 活节点"矛盾数据上传，是新设备书签被压制的帮凶（与 P0-1 连锁）。修复：uploadSnapshot 内统一按 tombstoneIds 过滤 bookmarkData |
| P1-3 | **上传备份数截断在排序之前，乱序输入时误删最新备份** | `uploader.ts:77-80`：先 `while (length > MAX) pop()` 再 `sortBackupRecords` | 远程记录一旦非降序（旧版客户端写入/篡改），pop 会从数组尾删掉**较新**的备份。修复：先 sort 后截断（一行顺序对调 + 测试） |
| P1-4 | **写回本地树部分失败时，基线退回 merged，本地真实树与基线分叉** | `sync.ts:409-412`（catch 中 `finalTree = mergeResult.merged`） | 部分创建失败后上传 merged 并以其为基线 → 下次同步 detectChanges 会把"写回失败未落地的节点"误判为本地删除并生成墓碑，恰好回归 v1 P0-2 的误杀模式。修复：失败时仍重新 `getLocalBookmarkTree()` 取真实树作为基线与上传内容（或中止上传） |
| P1-5 | **锁体系残留：LockManager 死代码并行锁、持久锁 TOCTOU、中断同步只跳过不恢复** | `debounce.ts:47-108`（LockManager/SYNC_LOCK_KEY 无调用方）；`sync.ts:243-261` 读-判-写非原子；`restoreSyncState` 恢复 isSyncing=true 后被中断的同步只会被跳过 | 删除 LockManager；持久锁加 owner token 防误释；SW 唤醒发现活跃锁时标记"待恢复同步"而非静默跳过 |
| P1-6 | **手动上传与用户删除的墓碑竞态** | `manualSyncTransfer.ts:29-51` 读缓存→上传→整写缓存；期间用户删除触发的 `createTombstoneForBookmark`（background.ts:320-358）也是读-改-写整个缓存 | 两路非原子读-改-写交错时后写覆盖前写，墓碑静默丢失 → 已删书签复活。修复：缓存写入统一走带合并语义的单一入口（或对 tombstones 字段单独 key 存储并合并不覆盖） |
| P1-7 | **conflictMode 'prompt' 存量值仍生效** | `setting.ts:147` 仍接受 'prompt'；`merge.ts:98-102` prompt 模式 winner=null → `applyChangesToBaseline` 本地静默获胜 | v1 只从 UI 移除了选项。老用户 storage 里的 'prompt' 仍在静默裁决。修复：Setting 解析时把 'prompt' 归一化为 'auto'（或迁移到固定值），彻底删除 prompt 分支 |

### 安全

| # | 问题 | 证据 | 说明与建议 |
|---|------|------|------|
| P1-8 | **备份恢复链路完全绕过 sanitize：恶意远程数据可注入 `javascript:` 书签** | 完整链路：`uploader.ts:56`（远程 backupRecords 原样并入上传）→ `manualSyncTransfer.ts:46-51`（写入本地缓存）→ `background.ts:235-266`（RESTORE_FROM_BACKUP）→ `background.ts:626-630`（`browser.bookmarks.create` 直写，无 sanitizeBookmarkTree） | 攻击者控制远程存储（共享 Gist/账号被盗/http 中间人）→ 在历史备份记录植入 `javascript:` 书签 → 用户点"恢复"→ 本地树清空后写入恶意书签。修复：restoreFromBackup 返回前过 `sanitizeBookmarkTree`；uploader 并入远程 backupRecords 前同样清洗（双保险） |
| P1-9 | **WebDAV 明文 http 无用户可见警告** | `webdav.ts:111-115`（仅 console.warn）；`optionsStorage.ts:183-201` 与 `options.tsx:102-111` 均不拦截 | Basic Auth + 全部书签明文上线且可被中间人篡改（配合 P1-8 注入）。修复：options 保存时对 http:// 显式警告 + 二次确认，或默认拒绝并提供"我知悉风险"开关 |
| P1-10 | **主密码在每次保存时被静默清除（安全降级无确认）** | `options.tsx:119-137` loadSettings 不回填 masterPassword；`options.tsx:188-192` 保存传空；`optionsStorage.ts:287-291` 空值即清空已存主密码并用扩展 ID 弱密钥重加密凭证 | 已设主密码的用户改任意设置（如 Gist ID）都会静默移除主密码、凭证降级。修复：已有主密码时保存需输入旧密码或显式"移除主密码"二次确认；loadSettings 回填掩码状态 |
| P1-11 | **手动下载与 WebDAV read 无响应体大小上限；远程 tombstones 无数量/结构校验** | `manualSyncTransfer.ts:60-67`（直接 read 后解析）；`webdav.ts:190`；`sync.ts:375-377`、`merge.ts:332-346`（全量接受远程墓碑） | 10MB 上限只在 `fetchRemoteData` 生效；恶意/异常服务器可致 OOM（MV3 SW 被杀、锁残留 5 分钟）；数百万条垃圾墓碑会随每次同步原样回传（上传放大）。修复：大小检查下沉到 storageProvider.read()；tombstones 上限 10000 + 元素形状校验 |
| P1-12 | **webdavUrl 允许内嵌 userinfo，凭据绕过加密明文落盘** | `optionsStorage.ts:183-201` 仅做 URL 解析，`https://user:pass@host/dav` 合法通过 | URL 明文存储于 options 且出现在错误日志。修复：validateOptions 拒绝 `url.username/url.password` 非空 |

### 功能正确性（UI/入口链路，复核 v1 阶段 4/5 时新发现）

| # | 问题 | 证据 | 说明与建议 |
|---|------|------|------|
| P1-11b | **同步失败状态从不持久化，popup"上次同步-失败"分支是死代码** | `sync.ts:488-498`（saveSyncStatus 仅成功路径调用，catch 分支不写 storage）；`popup.tsx:173` | 同步失败后 footer 仍显示旧的成功时间，LAST_SYNC_ERROR 恒为空。修复：catch/finally 中同样调用 saveSyncStatus |
| P1-12b | **popup 原生 confirm/alert 残留 + 错误消息未 i18n** | `popup.tsx:81,90,92,95`（window.confirm/alert）；`background.ts:150,172,204,225` 返回 `handleError(error).message` 而通知路径用 `toUserString()` | popup 用户看到英文技术报错，i18n 成果对主路径无效。修复：background 统一返回 toUserString；popup 反馈改内联提示/Modal |
| P1-13b | **智能同步成功后不清除 "!" 徽章；badge 进度未实现** | 全仓库 setBadge 仅 UPLOAD/DOWNLOAD/REMOVE_ALL/RESTORE 的 finally 清除；SYNC 消息链（background.ts:218-228）无清除 | 用户改书签 → badge "!" → 智能同步成功 → 徽章仍红 "!"，误导"还有未同步变更"。修复：SYNC 链 finally 清除；performSync 开始置同步中徽章 |
| P1-14b | **GitHub 测试连接测的是已存配置而非表单值；WebDAV 测试按钮可永久卡死** | `options.tsx:214` + `services.ts:194-200`（内部 Setting.build()）；`options.tsx:223-234` 无 try/finally 且 `webdav.ts:389` 构造函数在 try 之外（URL 缺协议即抛） | 前者误导排查方向；后者填错 URL 后按钮永久禁用无提示。修复：testConnection 接受表单参数；WebDAV 测试加 try/finally + 构造移入 try |
| P1-15 | **popup 导入长任务运行在 popup 上下文，失焦即中断** | `popup.tsx:133-159`（逐条 await bookmarks.create 循环） | 大文件导入到一半 popup 被关掉 → 导入不完整且无提示。修复：移交 background 处理（消息 + 进度通知），至少加模态忙碌态 |
| P1-16 | **popup 无首次使用空态引导** | popup 全文不读 options；未配置时显示"本地 0 / 远程 0"，点同步只会收到技术报错 | 新用户首用体验断裂。修复：初始化读配置，未配置渲染引导态（说明 + "打开设置"按钮） |
| P1-17 | **validate-locales 只比数量不比键集合，CI 形同虚设** | `scripts/validate-locales.mjs:46-55`（`baseKeys.length - count` 且仅 warn）；实测 zh_CN 166 键 > en 164 键（2 个多余键未报告） | 缺 94 个键的语言包在 CI 照样绿灯。修复：改键集合 diff（列缺失/多余键名），缺失 exit 1 |
| P1-18 | **CI 不跑 lint 也不跑 coverage，两条门禁实际不设防** | `ci.yml` 无 lint/format:check 步骤；第 7 步 `npm test` 不带 --coverage（thresholds 仅 coverage 模式生效） | 一旦回归无人拦截。修复：CI 加 lint 步骤、test 改 test:coverage、加 timeout/concurrency |
| P1-19 | **entrypoints 与 sync/ 子目录覆盖黑洞** | `vitest.config.ts:19` exclude 仍含 `src/entrypoints/`（与代码注释"先统计后补测"矛盾）；`src/utils/sync/` 聚合仅 52.26% 行覆盖（listeners.ts 11.76%、storageProvider.ts 25%）；http.ts 0%（承载 raw_url 安全校验与限流状态机） | v1 声称"移出排除清单"未兑现。修复：移出排除、为 `src/utils/sync/**` 单独设阈值（起步 55%）、补 background 消息路由/listeners/http 测试（tests/setup.ts 的 browser mock 基建已备好未消费） |

> 另有文档漂移（docs/ 四份文档对 sync/ 六个子模块零提及、README MIT 徽章与 Apache-2.0 矛盾/死链/"10 种语言"实为 11/路线图过时、src/utils/AGENTS.md 与根 AGENTS.md 不一致）与发布工程缺失（无 release workflow、无 CHANGELOG、dist 过期产物 manifest 缺 alarms 且 Firefox 仍 MV2、tag `0.7` 与 `0.7.0` 口径不一）两个 P1 级工程项，归入阶段 R4 处理。

---

## 四、P2 问题清单（择要）

**代码清理（一次 PR 可完成）**
- 死代码：`utils/icons.ts`（零引用）、`bookmarkUtils.formatBookmarks`（零引用）、`debounce.ts` LockManager 类（含 `SYNC_LOCK_KEY`）、`models.ts` BookmarkInfo.createSafe/validate（与 sanitize 双协议白名单并存易误用，且 SAFE_PROTOCOLS 含 chrome:/about: 与白名单冲突）、background `REMOVE_ALL` 死协议（popup 已无入口，处理器含两条通知路径）、`merge.ts` formatChangeSummary 中文硬编码（当前仅写日志，可顺手 i18n 或删除）
- 死键：约 45 个/语言（含 zh_CN 独有 2 键 `syncSuccess/syncFailed`），一次 PR 清理
- 仓库卫生：`images/1.png、2.png、3.gif` 无引用；tsconfig `typeRoots` 指向不存在的 `./src/types`

**类型与 Lint 收紧**
- tsconfig 无 `noUncheckedIndexedAccess`/`exactOptionalPropertyTypes`（v1 阶段 3 第 6 条明确要求，未做）
- ESLint 非 type-checked 规则集（无 no-floating-promises）；6 个 no-non-null-assertion warning 无收敛跟踪；`scripts/**` 游离在 lint/format 之外

**UI/UX**
- 两个入口无 React 错误边界（渲染异常即白屏）；popup SETTING 消息链无 .catch + sendMessage 无超时 → 可能永久转圈
- restore Modal 恢复期间仍可用 ESC/遮罩关闭（与禁用的 Cancel 按钮矛盾）；忙碌期间"设置"按钮被禁用
- Gist ID 格式（32-40 hex）只在 background 校验；storageType 切换不隐藏无关表单区块；options.tsx 474 行/20+ useState 建议拆组件；background.ts 657 行建议拆 messages.ts + bookmarkTree.ts
- 可访问性：导入入口 label 不可键盘聚焦；`<html lang="en">` 硬编码（ar RTL 受影响）；日期格式化未跟随 UI locale；计数拼接未用 `$COUNT$` 占位符（ru 语法错误）
- BS5 类名残留 `ms-4`/`me-2`（BS4 下静默失效）；暗色主题色值四处重复定义；popup.css 死规则

**工程化**
- coverage include 把 `_locales/*.json` 与 PNG 计入报告（"All files 38.3%"失真）；reporter 缺 json-summary
- 无 husky/lint-staged（pre-commit）、无 dependabot/renovate、无 npm audit 步骤
- Bootstrap 4.6.2（EOL）+ react-bootstrap 1.6.8 双双过时，全量 CSS 双入口引入（升 BS5 归入阶段 R6）
- @testing-library/react 已装未用（组件测试零起步）
- 旧版升级用户此前授予的全站 host 权限不主动回收；`handleTestWebDAV` 在权限申请之前执行（无 CORS 头时误报失败）

**中期演进（评估项）**
- 主密码不再落盘（仅存 PBKDF2 校验哈希），解决"扩展 ID 弱密钥 + 自锁"的实际安全边界问题
- 端到端数据加密（AGENTS.md TODO Medium）；Firefox MV2 → MV3 对齐；MV3 Alarm 防抖彻底替代 setTimeout

---

## 五、分阶段实施路线图

> 总量约 **28-42 人日**。R1/R2 为"数据与安全止损包"（建议 2 周内完成并发版），R3 起可按节奏推进。每阶段独立可发布、可回滚。

### 阶段 R1：同步数据正确性（P0 + 数据链 P1，5-7 人日）

| 任务 | 对应 | 验收 |
|------|------|------|
| 书签稳定 ID 掺入父路径（URL+路径哈希），三处 re-normalize 回归验证 | P0-1 | 新增重复 URL 场景测试：双副本跨设备同步均保留；删除一份不再误杀另一份；新设备不被僵尸墓碑压制 |
| uploadSnapshot 内按墓碑过滤快照；先排序后截断 | P1-2, P1-3 | "墓碑+活节点"矛盾数据不再上传；乱序远程记录不丢最新备份（单测） |
| 智能同步保留本地备份历史（追加+截断至 MAX_BACKUPS） | P1-1 | 智能同步后本地恢复点 = min(旧+1, 3)，与手动上传一致 |
| 写回失败时以真实树重建基线（或中止上传） | P1-4 | 写回注入失败用例：下次同步不产生虚假墓碑 |
| conflictMode 'prompt' 存量值归一化为 'auto'，删除 prompt 分支 | P1-7 | 存量 'prompt' 用户升级后行为与 auto 一致 |
| 缓存写入合并语义统一（tombstones 不被整写覆盖）；删除 LockManager 死代码 | P1-6, P1-5 | 上传与删除并发竞态用例通过 |

### 阶段 R2：安全收尾（4-6 人日）

| 任务 | 对应 |
|------|------|
| 备份恢复链路接入 sanitizeBookmarkTree（restoreFromBackup + uploader 双保险） | P1-8 |
| WebDAV 明文 http 用户可见警告 + 二次确认；拒绝含 userinfo 的 webdavUrl | P1-9, P1-12 |
| 主密码静默清除修复（回填掩码 + 变更需确认）；解密失败 UI 提示"请重新输入凭证" | P1-10 |
| 大小上限下沉 storageProvider.read()；远程 tombstones 数量/结构校验 | P1-11 |

### 阶段 R3：同步反馈链路与 UX（5-7 人日）

| 任务 | 对应 |
|------|------|
| 同步失败状态持久化（catch 路径 saveSyncStatus）；SYNC 链清 badge + 同步中徽章 | P1-11b, P1-13b |
| popup 反馈 Modal 化/内联化，替换 window.confirm/alert；background 错误统一 toUserString | P1-12b |
| GitHub/WebDAV 测试连接修复（表单值参数 + try/finally + 构造移入 try） | P1-14b |
| popup 空态引导；导入移交 background（或模态忙碌态） | P1-16, P1-15 |
| 消息等待超时 + SETTING 链补 catch；React ErrorBoundary ×2 | P2 |

### 阶段 R4：工程化与门禁（3-5 人日）

| 任务 | 对应 |
|------|------|
| CI 加 lint + test:coverage + concurrency/timeout；coverage include 收窄为 *.ts/*.tsx + json-summary | P1-18 |
| entrypoints 移出 coverage 排除；`src/utils/sync/**` 单独阈值（起步 55%） | P1-19 |
| validate-locales 升级键集合 diff 硬校验（缺失 exit 1 + placeholder 校验） | P1-17 |
| 文档同步：docs/ 四份补 sync/ 子模块章节；README 校对（许可证徽章/死链/语言数/路线图/CI badge）；统一两层 AGENTS.md | 文档漂移 |
| release workflow（tag 触发 wxt build + zip 双浏览器 + artifact）、CHANGELOG.md 起步、tag 口径 SemVer；发布前重建并核对 dist manifest | 发布工程 |
| husky + lint-staged；dependabot；npm audit（观察模式起步） | P2 |

### 阶段 R5：测试补强（4-6 人日）

| 任务 | 验收 |
|------|------|
| background 消息路由测试（isValidSender/queueOperation/REMOVE_ALL 死协议决策/RESTORE 清洗） | 消息入口全覆盖 |
| listeners.ts（事件排队/重放/bulk 抑制）、http.ts（限流状态机/超时/Bearer 注入）、storageProvider.ts 专属测试 | sync/ 子目录 ≥55%；http.ts 从 0% 起步 |
| 组件测试起步（@testing-library 已装）：popup 计数展示、options 表单联动各 2-3 个冒烟用例 | *.test.tsx 从 0 到 1 |

### 阶段 R6：清理与现代化（4-6 人日，可与 R5 并行）

| 任务 |
|------|
| 死代码/死键/无引用图片一次 PR 清理（icons.ts、formatBookmarks、REMOVE_ALL、models 双白名单等） |
| tsconfig 开 noUncheckedIndexedAccess（预计暴露少量索引访问点，与 6 个 non-null 断言一并收敛）；ESLint 对 src/utils 启用 type-checked |
| Bootstrap 4→5 + react-bootstrap 1→2（顺带修复 ms-4/me-2 失效）；暗色主题 CSS 抽共享模块 |
| options.tsx / background.ts / sync.ts 拆分（sync.ts 目标 <300 行） |

### 阶段 R7：中期演进（评估后排期）

1. 主密码重构：仅存 PBKDF2 校验哈希不落盘，密钥不依赖公开扩展 ID。
2. stable id v2 评估：内容寻址 + 显式迁移（P0-1 修复后重新评估必要性）。
3. 端到端数据加密；Firefox MV3 产物对齐；远端写入乐观并发控制（ETag/If-Match，降低多设备同时同步的 last-writer-wins 覆盖窗口）。

---

## 六、风险与注意事项

1. **P0-1 是全项目最高风险改动**：ID 算法变更会触发三处 re-normalize 与全部既有测试的联动。务必先落"重复 URL 场景"的失败复现测试，再改算法观察转绿；发布说明标注"存量墓碑 30 天内可能复活一次"。
2. **R1-1（备份历史保留）与 uploader 截断逻辑耦合**：本地追加+截断与远程 sort/trim 必须同一语义（先 sort 后 trim），否则两侧恢复点会漂移。
3. **上传过滤墓碑（P1-2）要区分"事件墓碑"与"合并墓碑"**：过滤只应作用于快照书签数据，不得把合并产生的墓碑从 tombstones 字段中剔除，否则删除无法跨设备传播。
4. **CI 接入 coverage 前**先把 include 口径修准（P1-18 与 coverage include 收窄须同 PR），否则门禁阈值基线会被失真数字干扰。
5. **dist/ 产物过期**（Chrome manifest 缺 alarms、Firefox 仍 MV2），任何发布前必须重新 `wxt build` 并人工核对 manifest（permissions/default_locale/version）。
6. 修改合并/墓碑/上传语义时同步更新 `docs/数据流与同步机制.md`（v1 教训：阶段 3 拆分后文档已漂移，R4 一并偿还）。

## 七、成功度量

- **数据安全：** 重复 URL 双副本跨设备矩阵（同步/删除/恢复 × 双设备）测试全绿；"恢复点数量"在智能同步后保持 ≤3 且 >1。
- **安全：** 恢复链路恶意数据注入用例（javascript: URL / __proto__）全部被拒。
- **门禁真实生效：** CI 含 lint + coverage，任意一项回归可红；sync/ 子目录 ≥55%、http.ts ≥60%。
- **反馈闭环：** 同步失败在 popup 可见（状态+本地化错误消息）；成功后徽章清零。
- **发布工程：** tag → CI → 双浏览器 zip artifact 全自动；CHANGELOG 存在且与版本对应。

---

## 附录：本轮审计证据来源

- 实测命令：`npm run compile`（零错误）、`npm test`（344/344 通过）、`npm run lint`（0 error/6 warning）、`npm outdated`、`git ls-files`（97 文件无异常产物）
- 自读复核：`src/utils/sync.ts`、`sync/writeback.ts`、`sync/uploader.ts`、`sync/listeners.ts`、`sync/syncState.ts`、`sync/dataFetcher.ts`、`merge.ts`、`changeDetection.ts`、`bookmarkUtils.ts`、`sanitize.ts`、`localCache.ts`、`manualSyncTransfer.ts`、`debounce.ts`、`entrypoints/background.ts`
- 三路专项审计：安全（services/webdav/http/crypto/sanitize/optionsStorage/wxt.config）、UI 与 i18n（popup/options/locales/errors）、测试与工程化（CI/vitest/eslint/tsconfig/coverage/依赖/git）

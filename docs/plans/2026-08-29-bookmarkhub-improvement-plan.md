# BookmarkHub 改进计划书

**日期：** 2026-08-29
**分析范围：** 全仓库（src 38 个 TS 文件，约 9300 行；配置、测试、CI、i18n、依赖、Git 状态）
**分析方式：** 四路并行深度审计（核心代码质量与架构 / 安全 / 测试与工程化 / UI 与入口点），关键结论已逐条人工复核

---

## 一、总体评估

BookmarkHub 的基础面是健康的：`tsc --noEmit` 零错误、141/141 单测通过、TypeScript strict 已开启、日志有敏感字段脱敏、background 消息入口有 sender 校验、导入模块（importer.ts）具备协议白名单/原型污染防护/大小上限等成熟防御、全库无 innerHTML/eval、无硬编码密钥。

但深入分析后发现**同步核心状态机存在架构级缺陷**，当前代码存在多个会**静默丢失用户书签数据**的严重 bug，且部分核心功能（三向合并同步、冲突裁决）**用户实际无法触达**。问题密度集中在 `sync.ts`（739 行上帝模块）、`merge.ts`、`manualSyncTransfer.ts` 三者的交互处。

### 问题总览

| 等级 | 定义 | 数量 |
|------|------|------|
| P0 | 会导致用户数据丢失、核心功能不可用、资源滥用 | 7 项 |
| P1 | 正确性/安全性缺陷，特定场景触发 | 14 项 |
| P2 | 代码质量、工程化、可维护性 | 12 项 |

---

## 二、P0 问题清单（必须立即修复）

### P0-1 同步间隔换算错误：选"1 小时"实际每 1 分钟同步一次

- **证据：** `src/utils/sync.ts:305` `const intervalMinutes = setting.syncInterval / 60;`
- **分析：** `syncInterval` 存储值本身已是分钟（选项值 60/720/1440，见 `src/utils/setting.ts:41`、`src/utils/optionsStorage.ts:74`、options UI 选项）。再除以 60 后，选 1 小时得到 `periodInMinutes = 1`，`Math.max(intervalMinutes, 1)` 无法挽救。
- **后果：** 自动同步频率放大 60 倍，快速耗尽 GitHub API 配额并触发限流，用户不明所以地被限流。
- **修复：** 删除 `/ 60`；同时在 `background.ts:18-27` 的设置变更监听中加入 `syncInterval` 比较，使修改间隔立即生效（当前改间隔不重建 Alarm，需重启浏览器）。
- **工作量：** 0.5 人日

### P0-2 合并结果从不写回本地书签树：远程新增书签会被墓碑"误杀"

- **证据：** `performSync`（`src/utils/sync.ts:421-612`）只做三件事：上传 merged、把 merged 写为本地缓存基线（sync.ts:553-570）、通知 popup。**本地浏览器书签树从未被更新。**
- **分析：** 三向合并的数学前提是 `local = baseline + 本地变更`。但由于基线缓存（含"仅远程存在的书签"）与真实本地书签永久分叉，下次同步 `detectChanges(baseline, local)`（`src/utils/changeDetection.ts:98-106`）会把"从未在本地存在"的远程书签判定为**本地删除**，`createTombstonesForDeletions`（`src/utils/merge.ts:533-553`）为其生成墓碑并上传 → 远程书签被删除且被墓碑压制 30 天（`merge.ts:505` TTL）。`filterChangesByTombstones` 只过滤 created 不过滤 deleted（`merge.ts:395-418`），无法自救。
- **后果：** 多设备场景下，B 设备新增的书签在 A 设备同步一轮后被删掉，且 30 天内无法恢复。**这是本扩展最核心的数据丢失缺陷。**
- **修复方案：** 同步完成后将 merged 与真实本地书签树的差异应用回 `browser.bookmarks`（创建/移动/改名/删除），应用期间抑制事件监听防止递归触发同步；完成后用应用后的真实树重建基线缓存。需要配套设计"远端书签落地到哪个文件夹"的策略（建议固定落到"其他书签/BookmarkHub"子文件夹）。
- **验收标准：** 集成测试覆盖"A 设备上传 → B 设备同步 → B 本地树包含新书签 → B 再次同步不再产生墓碑"的完整回路。
- **工作量：** 3-5 人日（含测试）

### P0-3 手动一键上传清空远程备份历史与全部墓碑

- **证据：** `uploadManualBookmarks`（`src/utils/manualSyncTransfer.ts:25-57`）不读取现有远程数据，直接用 `createManualSyncData`（新建只含 1 条备份记录、`tombstones: []` 的 SyncData）整体覆盖远程。
- **后果：** 其它设备上"已删除"的书签被复活；远程 3 份备份历史全部丢失。与自动同步的 `uploadBookmarks`（`src/utils/sync.ts:622-701`，会保留并迁移远程 backupRecords、限制 MAX_BACKUPS=3）行为完全不一致。
- **修复：** 手动上传改为与自动同步相同的"读远程 → 合并墓碑与备份历史 → 追加本次快照 → 写回"路径；序列化统一（当前自动 `JSON.stringify(data, null, 2)` 带缩进体积翻倍，手动无缩进，二选一）。
- **工作量：** 1-2 人日

### P0-4 手动/自动两套数据格式混用可导致远程被整体清空

- **证据：** 自动同步以 `getBookmarks()`（= `browser.bookmarks.getTree()`，**含虚拟根节点**）参与合并并上传（`sync.ts:486,547,639-648`）；手动上传用 `formatBookmarks` 剥掉根节点（`manualSyncTransfer.ts:18`）。
- **后果：** 两种格式混用时（先手动上传、后自动同步），`detectChanges` 将根节点判定为"远程删除"，`applyChangesToBaseline` 中 `removeBookmarkFromTree(result, rootId)` 后 merged 变为空树并上传（`merge.ts:461-465` + `sync.ts:545-547`）→ **远程数据被清空一轮**。
- **修复：** 收敛为单一数据出口——所有上传路径统一使用"剥根节点后的 children 树"；在 `dataFetcher` 解析层拒绝/剔除含虚拟根节点的畸形输入。
- **工作量：** 1-2 人日（与 P0-3 同批实施）

### P0-5 三向合并同步功能用户不可达（核心卖点无入口）

- **证据：** background 的 `sync` 消息处理器（`src/entrypoints/background.ts:221-231`）调用 `performSync`（三向合并），但全仓库 grep 确认**没有任何 UI 发送 `name: 'sync'` 消息**（popup 只发 upload/download/setting，见 `popup.tsx:104,105,121`）。
- **后果：** 项目同名核心功能"智能三向合并同步"对用户完全不可达，用户实际只能用会互相覆盖的 upload/download。
- **修复：** 在 popup 增加"sync（推荐）"菜单项，并在 options 页为该功能补说明文档；同时让 popup 解析响应结果（当前 `popup.tsx:26-32` 完全忽略 sendResponse，失败只靠浏览器通知）。
- **工作量：** 1-2 人日

### P0-6 zh_CN 语言包 JSON 损坏、ru 带 BOM，中文环境 i18n 可能整体失效

- **证据（已实测复现）：** `src/public/_locales/zh_CN/messages.json:383` 末尾多一个 `}`，`JSON.parse` 报 "Extra data" 直接失败；`src/public/_locales/ru/messages.json` 带 UTF-8 BOM，严格解析同样失败。
- **后果：** 中文用户（主要用户群）的 i18n 可能整包回退到 default_locale；ru 同理。
- **修复：** 修正 JSON；为 CI 增加 locales 校验脚本（node 一行循环 `JSON.parse` 即可）。
- **工作量：** 0.5 人日

### P0-7 conflictMode 'prompt' 形同虚设：冲突被静默以本地获胜裁决

- **证据：** options 提供 prompt 选项（`options.tsx:248`），merge 在 prompt 模式只标记 `winner: null, isConflict: true`（`merge.ts:94-98`）；`applyChangesToBaseline` 对未裁决冲突先远程后本地依次 `Object.assign`（`merge.ts:450-492`）→ 本地静默获胜；`performSync` 仅把 conflictCount 写入结果（`sync.ts:576`），全工程无任何裁决 UI。语言包中 `conflictsDetected/syncConflict` 键无调用者（死键）。
- **后果：** 选了"询问我"的用户实际得到的是"本地赢 + 无提示"，行为与预期严重不符。
- **修复（二选一）：** (a) 实现 popup/options 冲突列表裁决 UI（工作量大，放阶段 4）；(b) 短期先从设置中移除 prompt 选项、默认 lastWriteWins，并在 UI 注明。推荐 (b) 先止血，(a) 列入后续功能计划。
- **工作量：** 止血 0.5 人日；完整 UI 3-4 人日

---

## 三、P1 问题清单（正确性与安全）

### 正确性

| # | 问题 | 证据 | 说明 |
|---|------|------|------|
| P1-1 | 同步期间书签事件被静默丢弃，用户删除不产生墓碑 → 删除被远程"复活" | `sync.ts:151-194`（`isSuppressingEvents` 时回调既不触发同步也不执行）；background 的墓碑创建恰挂在这些回调上（`background.ts:335-341`） | 事件应排队、同步结束后重放，至少墓碑事件必须补记 |
| P1-2 | backupRecords 时间戳"严格降序"校验 vs 写入端伪造时间戳 + 设备时钟偏差 → 校验失败 → 基线丢失 → 触发"首次同步"分支以远程整包覆盖 | 校验 `localCache.ts:101-106`；写入 `sync.ts:660`（`old.createDate \|\| Date.now() - 1000`） | 放宽为"非严格降序"，写入端统一用单调递增时间源 |
| P1-3 | 四套锁机制并存且互有缺口：内存 `isSyncing`、持久化 `SYNC_STATE_KEY`、`LockManager`、`operationQueue`；`sync` 消息与 Alarm 既不进队列也不取 LockManager 锁 → 手动 sync 可与排队的 upload 并发读写远程 | `sync.ts:52,206-252`；`debounce.ts:47-108`；`background.ts:84-132,160,221-231` | 统一为单一 SyncLock，所有同步入口（含手动 sync、Alarm）一律取锁 |
| P1-4 | 锁检查 TOCTOU 竞态（读-判-写非原子）；SW 同步中途崩溃后持久锁阻塞所有同步最长 5 分钟 | `sync.ts:429-460`；`SYNC_STATE_EXPIRY_MS`（`constants.ts:72`） | 缩短过期 + 崩溃恢复时清理；锁带 owner token 防误释 |
| P1-5 | `checkAndResumePendingSync` 从未被调用 → SW 休眠丢失 setTimeout 防抖后，pendingSync 永久滞留 | `debounce.ts:235-242`（死代码）；`setTimeout` 防抖在 MV3 不可靠 | 在 `onStartup`/Alarm 中接入恢复逻辑，或改用 alarms 实现防抖 |
| P1-6 | 恢复/下载"先清空后重建"非原子，中途失败已删书签无法回滚 | `background.ts:247-248,396-398`；`createBookmarkTree` 失败仅逐条 log（552-554） | 至少失败时给出明确通知与导出文件兜底建议；中期做暂存-校验-替换 |
| P1-7 | 下载路径创建空垃圾文件夹：缓存中合成根节点（空 title）落到"其他书签"下 | `background.ts:498-501,544-550` | RootBookmarksType 分支需匹配空 title 合成根；本地化根名映射（`constants.ts:29-34`）只覆盖 3 种语言，跨语言浏览器书签全部落入 UNFILED，需扩展匹配矩阵 |
| P1-8 | popup 导入拍平文件夹层级、不查重；importer `parseDlElement` 用 `querySelector('a')` 搜索全部后代，嵌套子 DL 的锚点会使整个文件夹被误判为单个书签 | `popup.tsx:76-81`；`importer.ts:332,335` | importer 改用 `:scope > a` / `:scope > h3`；popup 导入改为整树导入并去重 |
| P1-9 | `findConflicts` O(n×m) 双重循环，书签量大时性能差；stable id 基于 32 位弱哈希且依赖 parentPath，文件夹改名导致整子树 id 变化 → 误判"删除+新建"并生成墓碑 | `merge.ts:64-72`；`bookmarkUtils.ts:18-48` | 冲突比对先建 Map；stable id 方案中期评审（v2 迁移需谨慎，见风险节） |

### 安全

| # | 问题 | 证据 | 说明 |
|---|------|------|------|
| P1-10 | Gist `truncated` 兜底对 `raw_url` 发请求时**无条件附带 GitHub Token**，目标域名未校验 → 恶意/被盗 Gist 可把 token 引到第三方服务器 | `services.ts:130` + `http.ts:82-102`（beforeRequest 对所有请求注入 Bearer） | raw_url 请求校验 host ∈ {gist.githubusercontent.com, github.com}，或为该请求剥离 Authorization |
| P1-11 | 同步路径远程 JSON 裸 `JSON.parse`，无 importer 那套 safeReviver/协议白名单/标题清洗；恶意远程数据可注入 `javascript:` 书签；`__proto__` 自有属性经 `Object.assign`（`merge.ts:182`）传播原型污染；手动下载路径无大小上限 | `manualSyncTransfer.ts:69`；`dataFetcher.ts:96`；`background.ts:546-550` | 抽取 importer 的 `safeReviver/sanitizeUrl/sanitizeTitle` 为共享模块，同步路径统一复用 |
| P1-12 | WebDAV 允许明文 http://（Basic Auth 明文上线）；四处 fetch 均无超时（30s 超时常量定义了但从未引用） | `webdav.ts:92-93,150-155,182-189,213-218,248-253`；`constants.ts:10,25` | 默认 https + 明文警告；fetch 统一接入 AbortController + 已有超时常量 |
| P1-13 | 无主密码时"加密"密钥 = `BookmarkHub-<公开扩展ID>-encryption-key`，实际安全价值趋近于零；主密码本身又被同一密钥加密后与凭证同库存储（自锁）；`isEncrypted` 弱启发式会把恰好合法 base64 的明文误判为密文 → 解密失败后凭证被**静默置空** | `crypto.ts:69-70,146-155`；`optionsStorage.ts:286,167` | 加密值加版本前缀（如 `bhub:v1:`）替代启发式；UI 引导设置主密码并明示无主密码时的保护边界；主密码不再落盘（仅存校验哈希）列入中期 |
| P1-14 | `optional_host_permissions: ["http://*/*","https://*/*"]` 等价于全站访问 | `wxt.config.ts:14-17` | WebDAV 模式改为按用户填写的 origin 逐个 `browser.permissions.request`，README 明示权限用途 |

---

## 四、P2 问题清单（质量与工程化）

### 死代码与依赖清理（一次 PR 可完成）

| # | 项目 | 证据 |
|---|------|------|
| P2-1 | 死依赖：`lz-string`、`react-hook-form` 全仓库零引用（后者还有整库类型 shim `src/types/react-hook-form.d.ts`）；`happy-dom` 与 `jsdom` 双测试环境冗余（vitest 只用 jsdom） | `package.json:29,33`；grep 实测无 import |
| P2-2 | 死代码：`applyChanges`（merge.ts:102-139）、`rootBookmarks`（models.ts:162-188）、`OperType`/`curOperType` 只写从不读（background.ts + models.ts:128-141）、`isError`（errors.ts:350-373）、十余个从未使用的 `createError` 工厂、`getAllGist`（services.ts:163-165）、`SyncMode`（sync.ts:37）、localCache 5 个死导出、未使用 import（sync.ts:14,17；background.ts:2）、`BookmarkInfo.createSafe` | 各文件 |
| P2-3 | `@deprecated SyncDataInfo` 仍被 3 处引用，v1/v2 判定规则在三处互不一致（dataFetcher.ts:22-37 / sync.ts:651-667 / manualSyncTransfer.ts:71-83） | 收敛为 `dataFetcher` 单一解析器 |
| P2-4 | 生产日志噪音：`========== 诊断日志 START/END ==========`、`>>> syncListeners.onXxx 触发`、"步骤1~步骤12" 流水日志全部以 info 级别在生产打印（logger 默认 info） | `sync.ts:142-185,272-283,358-384,422-594` |
| P2-5 | Gist/WebDAV 错误语义不一致（Gist 抛错 / WebDAV 吞错返回 null|false）、抛裸 `new Error` 绕过错误体系、`JSON.parse` 无 try/catch（manualSyncTransfer.ts:69）、`exists` 无重试、`sanitizePath` 双重执行、`getBrowserName` 双实现且行为不同、`formatChangeSummary` 重名两份、存储键裸字符串与常量混用 | 见分项 file:line |
| P2-6 | 类型安全：`Setting.build()` 内十余处 `as string`；远程数据无运行时校验即 `as SyncData`；`merge.ts` 多处非空断言 `!`；`BookmarkInfo` 是 class 但被当 POJO（JSON 深拷贝后类语义丢失） | `setting.ts:129-151`；`dataFetcher.ts:101,104`；`merge.ts:115-169` |
| P2-7 | 首选项 UI：options 24 个手工 useState；GitHub Token 无连接测试（仅 WebDAV 有）；WebDAV URL 无格式校验；UI 默认路径 `/bookmarks.json` 与后端默认 `/bookmarkhub-bookmarks.json` 不一致（options.tsx:109 vs constants.ts:24）；删除备份用原生 `confirm()` 与 React Modal 风格割裂 | `options.tsx` |
| P2-8 | UI 技术债：Bootstrap 4（已 EOL）+ react-bootstrap 1.x；BS5 类名（`ms-4`/`me-2`）在 BS4 下**静默失效**（options.tsx:240,307）；暗色主题两套 `!important` 覆盖 CSS 重复维护；内联样式散布 | `popup.css`/`options.css` |
| P2-9 | 上次同步信息写而不读：`lastSyncTime/Status/Error` 被 sync.ts:730-739 写入 storage，全 UI 无任何展示；popup 无同步进度指示 | `sync.ts:730-739`；`constants.ts:17-19` |
| P2-10 | 破坏性操作无确认：popup 的 download（清空本地树）与 removeAll 一键执行；备份恢复无内容预览 | `popup.tsx`；`background.ts:396` |
| P2-11 | i18n：9 种语言各缺 94/124 键（76%），缺键区域显示空字符串；errors.ts 全部 `userMessage` 硬编码中文（非中文用户看到中文报错）；options 26 处英文硬编码 fallback；logger 模块日志中英混杂 | `_locales/*`；`errors.ts:147-336` |
| P2-12 | 工程化缺失：无 CI/CD、无 ESLint/Prettier/.editorconfig/.gitattributes、coverage 无阈值且把 `src/entrypoints/` 整体排除（三大入口零测试被"隐藏"）、11 个 utils 模块约 1937 行零测试（importer/localCache/debounce/http/retry/setting 等）、`.gitignore` 缺 `coverage/` `.playwright-cli/` `.sisyphus/` `.superpowers/` `.claude/`（这些产物目录已被提交）、4 个最新测试文件 untracked 未入库、双锁文件（package-lock.json + pnpm-lock.yaml）、`license: ""` 与 Apache-2.0 LICENSE 文件矛盾、版本号 `"0.7"` 非 SemVer、`@vitejs/plugin-react` 为隐式传递依赖 | `vitest.config.ts`；`package.json`；`.gitignore` |

---

## 五、分阶段实施路线图

> 总量约 **32-52 人日**。阶段 0-2 为"必做止损包"，建议 2-3 周内完成并发版；阶段 3 起可按节奏推进。每阶段独立可发布、可回滚。

### 阶段 0：止血急救（0.5 版本，1-2 人日）

| 任务 | 对应 | 验收 |
|------|------|------|
| 修复 syncInterval /60 bug；设置变更监听加入 syncInterval | P0-1 | 选 1 小时 → Alarm periodInMinutes=60；改间隔立即生效 |
| 修复 zh_CN JSON、去除 ru BOM；新增 `scripts/validate-locales.mjs` 校验脚本 | P0-6 | 11 个语言包全部 `JSON.parse` 通过 |
| 从设置中移除 conflictMode='prompt' 选项（止血） | P0-7 | 不再出现无效选项 |
| 生产日志降噪：诊断横幅/步骤日志降为 debug 级 | P2-4 | 生产环境 console 无 `=====`/`>>>` 噪音 |
| `.gitignore` 补条目并 `git rm -r --cached` 已提交产物；提交 4 个 untracked 测试文件；双锁文件二选一删除；`license` 改 `Apache-2.0`；`version` 改 `0.7.0` | P2-12 | `git status` 干净；CI 可复现安装 |
| **整理当前工作区：** 现有 +253/-5543 行未提交改动与 untracked 源码文件先评审入库（建议按主题拆 PR） | — | working tree 与 main 一致 |

### 阶段 1：同步正确性修复（1.0 版本核心，5-8 人日）

| 任务 | 对应 | 验收 |
|------|------|------|
| 合并结果写回本地书签树 + 抑制事件递归 + 基线以真实树重建 | P0-2 | 集成测试：A 传 → B 同 → B 树含新书签 → B 再同无墓碑 |
| 手动上传改为"读-合-写"，保留墓碑与备份历史 | P0-3 | 手动上传后远程 backupRecords 与 tombstones 不丢失 |
| 统一上传数据为"剥根节点"格式；dataFetcher 拒绝虚拟根输入 | P0-4 | 混用手动/自动不再清空远程 |
| backupRecords 校验放宽 + 时间戳写入统一 | P1-2 | 时钟偏差 ±5 分钟的模拟用例通过 |
| 同步期事件排队重放（至少墓碑事件） | P1-1 | 同步中删除书签 → 同步结束该墓碑存在 |
| `checkAndResumePendingSync` 接入 onStartup/Alarm | P1-5 | pendingSync 场景测试 |
| 下载/恢复：合成根节点不落盘；失败通知明确 | P1-7, P1-6 | 跨语言根名用例；中途失败有提示 |

### 阶段 2：安全加固（3-5 人日）

| 任务 | 对应 |
|------|------|
| raw_url 域名白名单或剥离 Authorization | P1-10 |
| 抽取共享 sanitize 模块（safeReviver/sanitizeUrl/sanitizeTitle），同步与手动路径复用；大小上限补齐 | P1-11 |
| WebDAV 默认 https + 明文警告；全部 fetch 接 AbortController + 超时常量 | P1-12 |
| 加密值加版本前缀替代 isEncrypted 启发式；解密失败不再静默清空（提示重输）；UI 明示无主密码的保护边界 | P1-13 |
| WebDAV host 按需单 origin 申请权限 | P1-14 |

### 阶段 3：架构重构（8-12 人日，可与阶段 4 并行穿插）

1. **StorageProvider 抽象**：统一 Gist/WebDAV 的 read/write/exists 与错误语义（现在 4 处 `if (storageType === 'webdav')` 分支 + 两套传输栈），新增后端只改一处。
2. **统一锁**：单一 SyncLock（内存标志 + 持久化 + 过期 + owner token），operationQueue 收编全部入口（含 sync 消息与 Alarm）。
3. **sync.ts 拆分**（739 行 → 编排器 <200 行）：`syncOrchestrator` / `syncUploader` / `syncState` / 浏览器探测并入 `browserInfo.ts`（消除双实现）。
4. **错误体系统一**：WebDAV 改抛错语义；裸 `new Error` 全部替换为 `createError` 工厂；手动路径 JSON.parse 加 try/catch。
5. **死代码大清扫**（P2-1/2/3 清单一次 PR）：移除 lz-string、react-hook-form 及其类型 shim、happy-dom；删 OperType/applyChanges/rootBookmarks 等；SyncDataInfo 收敛到单一 v2 解析器。
6. **类型收紧**：`Setting` 结构化返回替代 `as string`；远程数据运行时校验（复用 localCache 的 validateSyncData 思路）；tsconfig 增加 `noUncheckedIndexedAccess`。
7. 消息协议常量化 + TS 类型定义（`'refreshCounts'` 等字符串字面量收敛）。

### 阶段 4：功能补全（5-8 人日）

1. popup 增加"sync（三向合并）"入口 + 结果反馈（成功/冲突数/耗时）——**补上核心卖点**（P0-5）。
2. 冲突裁决 UI：备份 diff 预览 + 冲突列表逐条选择（P0-7 完整版，可先出只读冲突报告）。
3. popup 展示上次同步时间/状态/错误（数据已备好，只差 UI，P2-9）。
4. 同步进行中的进度指示（badge 动画 + popup spinner）。
5. download/removeAll 加确认弹窗；备份恢复加内容预览（P2-10）。
6. popup 导入保留层级 + importer `:scope >` 修复 + 去重（P1-8）。
7. options：GitHub Token 连接测试、WebDAV URL 校验、默认路径对齐、`confirm()` 换统一 Modal（P2-7）。

### 阶段 5：i18n 与文案（3-4 人日）

1. errors.ts 错误码 → locale key 映射，userMessage 全部接入 i18n（P2-11）。
2. 补齐 9 语言 94 键（建议机器翻译初稿 + 人工抽检）。
3. options 26 处英文 fallback 收敛；CI 增加"语言包键完整性 diff en 基准"检查。

### 阶段 6：工程化建设（3-5 人日）

1. GitHub Actions：`compile + test + build(chrome/firefox) + validate-locales`，PR 门禁。
2. ESLint（typescript-eslint + react-hooks）+ Prettier + .editorconfig + .gitattributes（`* text=auto eol=lf`）。
3. coverage thresholds 起步：utils 行覆盖 ≥70%，并把 `src/entrypoints/` 移出排除清单（先统计后补测）。
4. 补测试：localCache、debounce（含 SW 休眠场景）、http、retry、importer/exporter、setting；background 消息路由测试（复用 tests/setup.ts 的 browser mock）。

### 阶段 7：依赖与 UI 现代化（可选，5-10 人日）

1. Bootstrap 4→5 + react-bootstrap 1→2（顺带修复 `ms-4/me-2` 失效）；暗色主题 CSS 合并为共享模块。
2. 组件测试起步（@testing-library 已装未用）。
3. 中期评估：stable id 方案 v2（内容寻址 + 显式迁移）、端到端数据加密（AGENTS.md TODO 中 Medium 项）、MV2 Firefox 产物对齐。

---

## 六、风险与注意事项

1. **P0-2 的写回是全项目最高风险改动**：写回本地树时若事件抑制不彻底会引发"同步风暴"（写回触发事件 → 触发同步 → 再写回）。必须先落 P1-1 的事件排队机制，且写回操作要带幂等保护与集成测试。
2. **数据格式迁移需兼容存量用户**：统一"剥根节点"格式（P0-4）与未来 stable id v2 都要写 v1→v2 迁移逻辑并保留 `isSyncDataInfo` 兼容读取至少一个大版本；发布前用真实旧格式 Gist 做回放测试。
3. **工作区与 main 严重脱节**（+253/-5543 行未提交 + 4 个 untracked 源文件），动手修复前先让仓库状态健康，否则修复会与存量改动纠缠。
4. **dist/ 产物过期**（Chrome manifest 缺 alarms 权限、Firefox 还是 MV2），任何发布前必须重新 `wxt build` 并人工核对 manifest。
5. 修改合并/墓碑语义时同步更新 `docs/数据流与同步机制.md`，避免文档漂移（本项目文档密度高，这是资产，要维护）。

## 七、成功度量

- **数据安全：** 多设备交互矩阵测试（手动/自动 × 上传/下载 × 双设备，共 8+ 场景）全绿；"远程书签被误杀"复现用例转绿。
- **资源：** 选 1 小时间隔时，24h 内 Gist API 请求数 ≤ 24 次。
- **质量门禁：** CI 全绿；coverage ≥70%（utils）；11 语言包校验通过。
- **功能可达：** popup 可一键发起三向合并同步并看到结果反馈。
- **代码健康：** 死依赖 0、死导出 0（以 `ts-prune` 类工具验收）、sync.ts < 300 行。

---

## 附录：本计划书引用的关键证据文件

`src/utils/sync.ts`（739 行）、`src/utils/merge.ts`（590 行）、`src/utils/manualSyncTransfer.ts`、`src/utils/sync/dataFetcher.ts`、`src/utils/localCache.ts`、`src/utils/debounce.ts`、`src/utils/changeDetection.ts`、`src/utils/bookmarkUtils.ts`、`src/utils/crypto.ts`、`src/utils/optionsStorage.ts`、`src/utils/services.ts`、`src/utils/webdav.ts`、`src/utils/http.ts`、`src/utils/importer.ts`、`src/utils/errors.ts`、`src/entrypoints/background.ts`（571 行）、`src/entrypoints/popup/popup.tsx`、`src/entrypoints/options/options.tsx`、`src/public/_locales/*`、`wxt.config.ts`、`vitest.config.ts`、`package.json`、`.gitignore`

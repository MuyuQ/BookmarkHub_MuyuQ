# BookmarkHub：交给 GLM 的修复实施方案

日期：2026-09-12  
审计基线：`889557eafd2c7eda74c1d047c1c83d27dad48031`，版本 `0.7.0`  
项目目录：`E:\Git_Repositories\BookmarkHub_MuyuQ`  
状态：待实施。本文件保存方案，不表示任何缺陷已经修复。

## 1. 可直接交给 GLM 的任务说明

请阅读本文件、根目录 `AGENTS.md`、`src/utils/AGENTS.md` 和 `src/entrypoints/AGENTS.md`，按下面的阶段顺序实施修复。先建立能复现缺陷的回归测试，再修改代码；每阶段验证后更新本文件的进度和实际结果。优先完成远程数据校验、写回失败处理、稳定 ID 三项。

实施前检查 Git 状态和当前代码，保留用户已有修改。如果当前版本与审计基线不同，先核实问题是否仍存在，不按旧行号机械修改。可以创建 `codex/` 前缀的工作分支；不要自动提交、推送、发版或调用真实 Gist/WebDAV 账户。测试使用模拟服务和书签树。

现有 `docs/plans/2026-09-06-bookmarkhub-improvement-plan-v2.md` 可作背景资料，但其中“重复 URL/同名文件夹问题已闭合”的结论需要重新评估。本文件的四个复现说明该修复仍不完整。旧计划中“写回失败后重新读取真实本地树再上传”的建议也不能单独作为解决方案：不完整本地树上传后会覆盖远端最新快照。

完成一个阶段后继续下一阶段；如果遇到无法自行解决的兼容性问题，记录具体阻塞、已完成工作和候选方案，不把未完成项标为完成。无需为了独立模块拆分而大规模重构，也不要在本轮顺带升级前端框架。

## 2. 已验证的项目基线

本轮已运行：

| 检查 | 结果 |
| --- | --- |
| `npm run compile` | 通过 |
| `npm run lint` | 0 error，6 warning，均为非空断言 |
| `npm run validate:locales` | 通过；脚本目前只比较键数量，不能证明键集合完整 |
| `npm run test:coverage` | 20 个测试文件、380 个测试全部通过 |
| `npm run build` | Chrome MV3 构建通过 |
| `npm run build:firefox` | Firefox MV2 构建通过；不代表真实 Firefox 行为已验证 |

覆盖率报告中，`src/utils/sync/` 行覆盖为 53.6%，`listeners.ts` 为 11.76%，`storageProvider.ts` 为 25%，`http.ts` 为 0%。入口代码被排除统计。`coverage.include: ['src/**']` 将语言包 JSON 纳入统计，还尝试解析 `AGENTS.md`，产生警告；不能把报告中的全仓 39.25% 行覆盖直接当作代码覆盖率。

另以现有内存书签 API 测试夹具执行了 4 个临时用例，均按预期暴露缺陷，详见附录。临时文件已删除，复现代码需在实施时正式加入回归测试。没有进行真实浏览器端到端验证、真实远端写入或页面自动化安全验证。

## 3. 问题与实施顺序

| 阶段 | 优先级 | 目标 | 证据强度 | 状态 |
| --- | --- | --- | --- | --- |
| A | P0 | 拒绝畸形远程数据，防止把损坏数据解释为空树 | 已通过模拟同步复现删除 | 待实施 |
| B | P1 | 写回失败时中止上传、基线更新和成功反馈 | 已通过失败注入复现 | 待实施 |
| C | P0 | 修复副本身份不稳定及同名文件夹子节点 ID 冲突 | 两个纯函数用例已复现 | 待实施 |
| D | P1 | 备份恢复校验、恢复点保护、主密码保存语义 | 代码链路确认，需补正式回归测试 | 待实施 |
| E | P1 | CI、覆盖率、语言包校验真实生效 | 配置和命令结果确认 | 待实施 |
| F | P2 | 连接测试、同步反馈、本地备份历史 | 代码检查确认，需补回归测试 | 待实施 |

A、B 改动边界较清晰，应先止损；C 涉及身份模型和迁移，应单独实施并充分验证。全部完成前不要以“现有 380 个测试通过”作为缺陷已修复的依据。

### 阶段 A：远程数据必须经过完整校验

涉及文件：`src/utils/sync/dataFetcher.ts`、`src/utils/sanitize.ts`、`src/utils/sync/storageProvider.ts`、`src/utils/manualSyncTransfer.ts`、`src/utils/localCache.ts`。

证据：`dataFetcher.ts` 约 100 行只凭 `version === '2.0'` 就断言为 `SyncData`；缺失 `backupRecords` 后，`performSync` 通过 `extractBookmarksFromData(...) || []` 得到空远程树。存在成功基线时，空树会被解释为远端删除。本轮输入 `{"version":"2.0"}`，结果为本地唯一书签被删除、调用远程上传、返回 `success`。

实施要求：

1. 复用 `safeJsonParse`，增加接收 `unknown` 的统一同步数据解析/校验入口，返回已验证的数据；不要靠类型断言绕过验证。
2. 检查版本、备份记录数组、每条记录的时间戳和书签数据、墓碑数组及元素形状；递归书签节点要有深度、数量和大小边界。现有 `validateBackupRecords` 主要检查排序，不能直接当完整 schema 使用。
3. 区分“远端确实不存在”“格式合法且明确为空的快照”“内容损坏或结构缺失”。损坏不得返回 `null` 或空数组继续同步。明确空 `backupRecords` 的语义，不能让它隐式代表用户清空书签。
4. 保留有效 v1 数据和现有有效 v2 数据的兼容性；哪些字段允许缺省、如何迁移，要用测试说明。不要把所有旧数据一律拒绝。
5. 自动同步、手动下载、上传时读取历史备份采用同一数据校验规则。响应体限制应尽量在读取层执行，避免完整读入后才检查；注意 UTF-8 字节数与 JS 字符数不同。

验收：畸形 v2、非法墓碑、错误类型的 `bookmarkData` 均在调用任何书签写 API 或远端写 API 之前失败；原本地树和成功基线不变。有效 v1/v2、首次同步、明确空快照各有测试。大小/深度限制有边界用例。

### 阶段 B：写回必须完整成功才能提交同步结果

涉及文件：`src/utils/sync.ts`、`src/utils/sync/writeback.ts`、`src/utils/sync/listeners.ts`、`src/utils/sync.writeback.test.ts`。

证据：`writeback.ts` 捕获创建/更新错误并累计 `stats.failed`，`performSync` 约 406 行忽略返回值；删除和移动失败甚至未统一累计。随后读取不完整本地树并上传。另一条 catch 路径则直接使用 `merged` 上传。本轮让远程书签 C 的本地创建失败，观察到 `status: 'success'`、上传发生、最新快照书签数为 0。

实施要求：

1. 为创建、更新、删除、移动统一返回可检查的失败信息，或抛出包含部分执行结果的类型化错误。已不存在节点等可忽略情况必须有明确判断，不能吞掉所有异常。
2. 调用方检查写回结果；任一影响目标一致性的失败都应中止本次远端上传和成功基线更新。删除现有 catch 中“改用 merged 继续上传”的行为。
3. 保存写回前恢复快照，并使其与“上次成功同步基线”分开。当前基线读取 `backupRecords[0]`，直接把恢复快照插到同一数组首位会意外改变基线语义。
4. 完整成功后读取真实树，验证关键语义与目标一致，再上传和提交新基线；比较时排除浏览器生成时间、浏览器节点 ID 等正常差异。
5. 失败状态及错误信息要持久化，锁和事件抑制标志必须释放；部分执行要明确反馈，不能展示成功计数。
6. 增加重试场景：失败后再次同步不会把未成功落地的远程节点误判为用户删除。网络上传失败与本地写回失败分别覆盖。

验收：附录中的创建失败用例转绿；更新/删除/移动失败各有针对性测试；失败不上传、不替换成功基线，恢复点可读取；下一次重试能收敛。不能仅检查返回状态而漏掉已经发生的危险写入。

### 阶段 C：书签身份与位置、重复序号解耦

涉及文件：`src/utils/bookmarkUtils.ts`、`src/utils/changeDetection.ts`、`src/utils/merge.ts`、`src/utils/sync/writeback.ts`、`src/entrypoints/background.ts`、数据模型和缓存相关文件。

已复现两种情况：

- 同一书签栏下两个名为 Work 的文件夹，各有相同 URL 的书签。文件夹自身 ID 不同，但子节点路径只使用标题，两个子节点都得到 `bm_134913196`（本轮夹具）。
- 同一文件夹存在 A、B 两个同 URL 书签。删除 A 后，B 的重复序号从 1 变成 0，其新 ID 与 A 的删除记录重合；手动上传过滤后，本应剩 1 个，实际为 0 个。

实施要求：

1. 先补附录中的两个失败用例及真实调用链回归。现有测试主要覆盖“不同副本首次 ID 不同”和删除后面的副本，不足以证明身份随编辑保持稳定。
2. 实施前在本阶段下记录选定身份方案：节点身份如何持久化、浏览器节点 ID 如何映射到同步身份、跨设备首次匹配如何完成、复制/移动/删除如何区分、旧数据如何迁移。
3. 稳定身份不能仅由当前同级序号决定；同名父文件夹必须向后代传递可区分的身份。仅修改 `buildChildPath` 可处理部分碰撞，无法解决副本删除后重新编号。
4. 如果引入持久化同步 ID，应保留远端已有 ID，并建立本地浏览器 ID 到同步 ID 的映射；不要在每次 normalize 时重新生成随机 UUID，也不要直接以设备私有浏览器 ID 作为跨设备身份。
5. 同步修改本地归一化、远程读取、基线迁移、写回映射及删除墓碑计算，避免同一节点在各路径使用不同算法。
6. 兼容旧版纯 URL 墓碑和当前路径/序号墓碑。记录迁移版本及歧义处理策略，不得通过清空全部墓碑或全部基线“修复”测试。无法确定两个副本对应关系时，不能静默压成一个。
7. 复核按 URL 回退配对的移动/冲突逻辑：多个同 URL 副本同时移动、修改、删除时，不能因为只保存一个 URL 索引而配错节点。

最小验收矩阵：

| 场景 | 期望 |
| --- | --- |
| 同文件夹 2/3 个同 URL 副本，删除首个/中间/末尾 | 只删除目标副本，剩余身份不变 |
| 同名兄弟文件夹内有同 URL 书签和同名嵌套子目录 | 所有独立节点身份不同且归属正确 |
| 单设备排序、改标题、改 URL、跨目录移动及移回 | 按定义保留身份，不产生虚假删除 |
| 双设备编辑不同副本、同时移动多个同 URL 副本 | 不串改、不误删、不丢副本 |
| 旧 v1/v2 树、旧基线、两代墓碑升级 | 删除不误作用于存活副本，升级可重复执行 |
| 同步完成后立刻再次同步 | 无虚假变更和墓碑，结果收敛 |

验收后更新旧计划中“已闭合”的说明及 `docs/数据流与同步机制.md`，说明真正解决的场景和仍有的兼容性限制。

### 阶段 D：恢复边界与主密码语义

#### D1. 备份恢复

证据链：`sync/uploader.ts` 约 56 行原样追加远程历史记录 → 手动上传结果进入本地缓存 → `localCache.restoreFromBackup` 约 230 行直接返回 `bookmarkData` → `background.ts` 清空本地树并调用 `createBookmarkTree`。恢复链未经过共享书签清洗；这属于代码链路确认，未对真实浏览器执行恶意书签测试。

要求：在远程历史进入缓存时和恢复消费时验证/清洗数据，复用统一协议白名单、结构校验和原型污染防护。全部校验及恢复点保存成功后才允许开始替换本地树。非法非空输入不能因清洗为零节点而静默变成一次“清空本地”操作。不要把恢复前快照覆盖为成功同步基线。

验收：历史记录含 `javascript:` URL、异常节点结构、超深子树或原型污染字段时，不调用危险 URL 的创建 API；不可用恢复数据不触发本地清空。合法历史恢复、部分创建失败、恢复点保存失败有测试。

#### D2. 主密码

证据：`options.tsx` 主密码状态默认空白，加载时不恢复“已设置”状态，保存时仍提交 `masterPassword: ''`；`optionsStorage.ts` 约 245、283、290 行将空值视为清除主密码并改用默认密钥加密凭证。

要求：明确 `unchanged / replace / remove` 三种保存意图（具体类型由实现决定）；普通设置保存默认保持已有主密码。页面展示是否已设置，不能用空密码输入框表达“删除”。移除必须由用户显式触发并确认。不得为了保留密码而将真实主密码重新填入页面输入框。

验收：已有主密码后修改同步间隔/Gist ID、连续保存两次、只更新一个凭证，都不移除密码；显式修改和移除正常；验证或解密失败不清空凭证；日志不输出凭证和主密码。存储层与表单提交路径均须覆盖。

### 阶段 E：工程门禁与测试范围

涉及文件：`.github/workflows/ci.yml`、`vitest.config.ts`、`scripts/validate-locales.mjs`、相关测试。

1. CI 加入 `npm run lint`，普通测试步骤改为 `npm run test:coverage`，保留类型检查、语言包检查和双浏览器构建。按需设置超时和取消重复运行。
2. coverage include 收窄到源码 `.ts/.tsx`，排除测试和类型声明；移除入口代码排除，先统计并补关键入口测试。增加 `json-summary` 方便记录实际基线。
3. 保留现有 utils 门禁，不为过检降低阈值或排除难测模块。`src/utils/sync/**` 可以设置至少 55% 的独立行覆盖门禁，先补测再启用，并记录最终指标。
4. 优先补 background 消息路由与恢复入口、listeners 事件排队/重放/批量操作、storageProvider 错误传播、http 认证和失败处理。已有内存书签树夹具可复用。
5. 语言包校验改为与 en 的键集合比较，输出缺失键名，缺失必须非零退出；检查占位符匹配。多余键应明确报告并确定清理规则，不能再用总数量代替完整性。
6. 格式门禁若新增，应先确认现有格式基线，避免用一次全仓格式化淹没数据安全修复 diff。

验收：上述回归用例真正进入 CI；缺少语言键时校验失败；覆盖率不再解析 Markdown 或统计语言 JSON；入口和低覆盖模块可见，完整 CI 通过。

### 阶段 F：反馈和备份体验

- **同步失败状态**：阶段 B 中完成持久化；补 popup 对失败状态的展示测试，区分“最近尝试”与“最近成功”的时间语义。只有真正同步成功才能清理未同步徽章，失败或仍有待处理编辑时不能无条件清徽章。
- **GitHub 测试连接**：`options.tsx` 调用无参 `BookmarkService.testConnection()`，后者读取已保存设置。改为测试当前表单配置，测试操作不应顺带保存设置。
- **WebDAV 测试连接**：表单处理器增加 `try/catch/finally`，确保 URL 解析、权限拒绝和网络异常后按钮恢复。按当前 origin 处理必要权限，不能通过请求全站权限解决。
- **本地备份历史**：`performSync` 约 430 行每次只保存一个快照；统一备份保留规则，先排序再截断，保留多个恢复点。明确成功基线与可选恢复点的关系，删除或排序恢复点不得改变共同基线。

验收：测试连接使用未保存的表单值；WebDAV 失败后可重试；同步失败在 popup 可见；智能同步后保留设定数量内的历史恢复点，且下一次同步不会因为备份排序产生虚假变更。

## 4. 附录：四个已复现用例

下面是最小复现逻辑，实施时应成为正式测试。用例 3/4 的 `store`、`mockBookmarks`、`BookmarkService`、`makeRemoteContent`、`performSync` 来自现有 `src/utils/sync.writeback.test.ts` 中的内存夹具和 `beforeEach` 初始化；把用例加入该 describe 或抽取共用夹具后使用。纯函数用例放入 `bookmarkUtils.test.ts`。

### 用例 1：同名文件夹的后代身份冲突

```typescript
const tree = normalizeBookmarkIds([{
  title: 'Bookmarks Bar',
  children: [
    { title: 'Work', children: [{ title: 'A', url: 'https://example.com' }] },
    { title: 'Work', children: [{ title: 'B', url: 'https://example.com' }] },
  ],
}]);
const folders = tree[0].children!;
expect(folders[0].id).not.toBe(folders[1].id); // 现有代码通过
expect(folders[0].children![0].id).not.toBe(folders[1].children![0].id); // 失败
```

### 用例 2：删除首个重复项后误过滤存活副本

```typescript
const original = normalizeBookmarkIds([{
  title: 'Bookmarks Bar',
  children: [
    { title: 'A', url: 'https://example.com' },
    { title: 'B', url: 'https://example.com' },
  ],
}]);
const deletedId = original[0].children![0].id!;
const survivor = normalizeBookmarkIds([{
  title: 'Bookmarks Bar',
  children: [{ title: 'B', url: 'https://example.com' }],
}]);
const filtered = filterTombstonedNodes(survivor, new Set([deletedId]));
expect(getBookmarkCount(filtered)).toBe(1); // 实际 0
```

若新身份方案依赖持久化映射，此用例需按真实删除过程保留映射和浏览器节点身份，不可通过为存活副本随意指定一个无关 ID 让它通过；同时保留旧格式迁移测试。

### 用例 3：创建失败仍上传空快照并报告成功

```typescript
vi.mocked(BookmarkService.get).mockResolvedValue(makeRemoteContent([
  { id: '30', title: 'C', url: 'https://c.example.com', index: 0, dateAdded: 2000 },
]));
mockBookmarks.create.mockRejectedValue(new Error('Injected bookmark create failure'));
vi.mocked(BookmarkService.update).mockResolvedValue({} as never);
const result = await performSync();
expect(result.status).toBe('failed');
expect(BookmarkService.update).not.toHaveBeenCalled();
```

本轮实际观察：`status === 'success'`，远程 update 被调用，上传数据的最新记录 `bookmarkCount === 0`。进一步添加成功基线保持、恢复点和重试断言。

### 用例 4：结构不完整的 v2 导致本地删除

```typescript
store.root.children![0].children = [{
  id: '10', parentId: '1', title: 'A', url: 'https://a.example.com',
  index: 0, dateAdded: 1000,
}];
vi.mocked(BookmarkService.get).mockResolvedValue(makeRemoteContent([
  { id: '30', title: 'A', url: 'https://a.example.com', index: 0, dateAdded: 1000 },
]));
vi.mocked(BookmarkService.update).mockResolvedValue({} as never);
expect((await performSync()).status).toBe('success');
vi.mocked(BookmarkService.update).mockClear();
mockBookmarks.removeTree.mockClear();
vi.mocked(BookmarkService.get).mockResolvedValue('{"version":"2.0"}');
const result = await performSync();
expect(result.status).toBe('failed');
expect(mockBookmarks.removeTree).not.toHaveBeenCalled();
expect(BookmarkService.update).not.toHaveBeenCalled();
expect(store.root.children![0].children).toHaveLength(1);
```

本轮实际观察：返回 `success`，removeTree 和 update 均被调用，存活书签数量为 0。

## 5. 最终验收和交付

各阶段先运行相关测试；最终统一执行以下命令并记录结果：

```bash
npm run compile
npm run lint
npm run validate:locales
npm run test:coverage
npm run build
npm run build:firefox
```

交付说明必须包含：

- 已完成的阶段和修改文件，剩余问题或兼容性限制。
- 四个缺陷复现如何转绿，新增失败注入和双设备场景的结果。
- 实际测试数量、覆盖率、lint 和双浏览器构建结果。
- 稳定身份迁移、备份/基线关系、失败恢复机制的设计说明。
- 是否实际完成浏览器端到端验证；模拟测试与真实验证分开记录。

不得以增加类型断言、吞掉异常、清空墓碑、清空基线、降低测试阈值或仅改文档状态代替修复。

## 6. 实施记录（由 GLM 更新）

| 日期 | 阶段 | 改动及设计决策 | 验证结果 | 剩余事项 |
| --- | --- | --- | --- | --- |
| 2026-09-12 | 方案准备 | 保存审计证据、复现步骤和实施要求；未修改业务代码 | 基线检查与四个临时复现结果见上文 | A–F 全部待实施 |

# 自动同步功能测试指南

## 测试概述

本文档描述了如何测试BookmarkHub的自动同步功能。

## 测试配置

- **Gist Token**: `<YOUR_GITHUB_TOKEN>`
- **Gist ID**: `<YOUR_GIST_ID>`
- **测试环境**: WSL2 + Chrome

## 自动化测试

### 运行测试脚本

```bash
# 1. 构建扩展
npm run build

# 2. 运行e2e测试
npm run test:e2e
```

### 测试脚本说明

测试脚本位于 `tests/e2e/auto-sync-test.ts`，它会：

1. 启动Chrome浏览器并加载扩展
2. 尝试配置Token和Gist ID
3. 开启自动同步
4. 添加测试书签
5. 验证同步是否触发

## 手动测试步骤

如果自动化测试遇到问题（WSL环境限制），请按以下步骤手动测试：

### 1. 启动Chrome并加载扩展

```bash
# 启动开发服务器（会自动构建扩展）
npm run dev

# 在Chrome中加载扩展
# 1. 打开 chrome://extensions/
# 2. 启用"开发者模式"
# 3. 点击"加载已解压的扩展程序"
# 4. 选择 .output/chrome-mv3 目录
```

### 2. 配置扩展

1. 点击扩展图标，然后点击设置（齿轮图标）
2. 填写以下信息：
   - **GitHub Token**: `<YOUR_GITHUB_TOKEN>`
   - **Gist ID**: `<YOUR_GIST_ID>`
3. 开启以下选项：
   - ✅ 启用自动同步
   - ✅ 启用事件触发同步（添加书签时触发）
4. 点击"保存"

### 3. 测试自动同步

1. 在浏览器中添加一个新书签
   - 方法1：按 Ctrl+D 添加当前页面
   - 方法2：右键点击页面 → "将此页面添加到书签"
   
2. 观察扩展popup：
   - 点击扩展图标
   - 查看本地书签数是否增加
   - 等待几秒钟（事件触发同步需要时间）
   - 再次打开popup，查看远程书签数是否同步更新

### 4. 验证同步结果

1. 打开扩展popup
2. 检查以下内容：
   - 本地书签数
   - 远程书签数（应该与本地一致）
   
3. 访问Gist页面验证：
   ```
   https://gist.github.com/c7705376bd2b2c5f10be8fb4a1fc6646
   ```
   
4. 检查Gist文件内容，确认新书签已同步

### 5. 检查控制台日志

打开扩展的background页面查看日志：

1. 访问 `chrome://extensions/`
2. 找到BookmarkHub扩展
3. 点击"service worker"或"背景页"
4. 查看控制台输出，确认同步操作已触发

## 预期结果

✅ **成功标准**：
1. 添加书签后，扩展popup显示本地书签数增加
2. 几秒钟后，自动同步触发
3. 远程书签数与本地书签数一致
4. Gist文件中包含新添加的书签

❌ **失败情况排查**：
1. **Token无效**：检查Token是否有gist权限
2. **Gist ID错误**：确认Gist ID正确
3. **网络问题**：检查是否能访问github.com
4. **扩展未加载**：检查chrome://extensions/中扩展是否启用

## 已知问题

### WSL环境限制

在WSL环境中运行自动化测试可能遇到以下问题：

1. **Chrome远程调试端口冲突**：多个Chrome实例可能导致端口绑定失败
2. **图形界面访问**：WSL可能无法正确显示Chrome窗口
3. **扩展加载延迟**：扩展可能需要额外时间加载

### 解决方案

如果在WSL中遇到问题：
1. 使用手动测试步骤
2. 或者使用Windows上的Chrome进行测试
3. 或者使用Docker容器进行隔离测试

## 测试代码结构

```
tests/e2e/
└── auto-sync-test.ts    # 自动化测试脚本
```

测试脚本使用Puppeteer控制Chrome浏览器，实现：
- 扩展加载和ID获取
- 设置页面配置
- 书签添加模拟
- 同步状态验证

<!-- PROJECT LOGO -->
<br />
<p align="center">
  <a href="https://github.com/MuyuQ/BookmarkHub_MuyuQ">
    <img src="images/icon128.png" alt="BookmarkHub" width="128">
  </a>

  <h1 align="center">BookmarkHub</h1>
  <p align="center">
    跨浏览器书签同步工具 · 基于 [dudor/BookmarkHub](https://github.com/dudor/BookmarkHub) 深度增强维护
    <br />
    <a href="https://github.com/MuyuQ/BookmarkHub_MuyuQ/issues">🐞 反馈问题</a>
  </p>
</p>

<!-- BADGES -->
<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/版本-0.7-blue.svg">
  <img alt="Chrome" src="https://img.shields.io/badge/Chrome-88+-green.svg">
  <img alt="Firefox" src="https://img.shields.io/badge/Firefox-109+-orange.svg">
  <img alt="License" src="https://img.shields.io/badge/许可证-MIT-purple.svg">
  <img alt="Tests" src="https://img.shields.io/badge/测试-✅_passing-brightgreen.svg">
</p>

<!-- TABLE OF CONTENTS -->
<details open="open">
  <summary><h2 style="display: inline-block">📋 目录</h2></summary>
  <ol>
    <li><a href="#关于">📐 关于</a></li>
    <li><a href="#功能">✨ 功能特性</a></li>
    <li><a href="#技术栈">🛠 技术栈</a></li>
    <li><a href="#下载安装">📥 下载安装</a></li>
    <li><a href="#使用方法">📋 使用方法</a></li>
    <li><a href="#开发指南">👨‍💻 开发指南</a></li>
    <li><a href="#文档">📚 文档</a></li>
    <li><a href="#待实现的功能">🚀 发展路线</a></li>
    <li><a href="#license">📜 License</a></li>
    <li><a href="#contact">📧 Contact</a></li>
  </ol>
</details>

<!-- ABOUT THE PROJECT -->
## 📐 关于

本仓库是 [dudor/BookmarkHub](https://github.com/dudor/BookmarkHub) 的深度增强分支，在保留原有 GitHub Gist 和 WebDAV 同步能力的基础上，新增了大量核心功能与质量改进。

### 与原版的差异

| 方面 | 原版 | 本分支 |
|------|------|--------|
| 🔄 同步引擎 | 基础同步 | 三向合并 + 变更检测 + 墓碑机制 |
| 🔐 凭证安全 | 明文存储 | Web Crypto API 加密存储 |
| 🧪 测试覆盖 | 无 | 单元测试 + 行为测试 + 覆盖率报告 |
| 🏗 代码质量 | - | TypeScript 严格模式、统一错误处理、日志分级 |
| 📂 数据迁移 | - | v2 数据格式、手动同步传输

### 存储后端

| 存储方式 | 说明 |
|----------|------|
| 💻 GitHub Gist | 默认方式，使用 GitHub 账号 |
| 🗁 WebDAV | 可选方式，支持 NAS、Nextcloud 等 |

## ✨ 功能特性

### 核心功能

| 功能 | 描述 |
|------|------|
| 📅 一键同步 | 上传/下载书签到云端 |
| 🔄 自动同步 | 定时同步、事件触发同步、混合模式 |
| 👝 智能合并 | 三向合并算法，自动处理冲突 |
| 👥 多设备同步 | 跨电脑、跨浏览器无缝同步 |
| 💺 墓碑机制 | 删除传播，防止书签"复活" |
| 📈 导入导出 | JSON/HTML 格式书签导入导出 |
| 🔐 凭证加密 | Web Crypto API 加密存储 Token 和密码 |
| 📂 手动同步传输 | 手动切换后端存储间的书签传输 |
| 💬 多语言支持 | 支持 10 种语言 |

### 特点

- 🔑 **无需注册新账号** - 使用 GitHub 账号的 Token 和 Gist 即可
- 📄 **一键清空** - 清空本地所有书签（谨慎使用）
- 📋 **书签计数** - 显示本地和远程书签数量
- 🔒 **安全存储** - 数据存储在私有 Gist，安全可靠
- 🏗 **质量保障** - 全面 TypeScript 严格模式 + 单元测试覆盖

## 🛠 技术栈

| 技术 | 版本 |
|------|------|
| 👑 WXT | 0.19.x |
| 👨 React | 18.x |
| 📋 TypeScript | 5.x |
| 💚 Bootstrap | 4.x |
| 📦 Vitest | 4.x |

## 📥 下载安装

> 📘 本插件需要把书签存储到 Gist 中，所以请确保有 GitHub 账号。

### 从商店安装（原版）

原版 BookmarkHub 已上架各浏览器商店：

| 浏览器 | 下载链接 |
|--------|----------|
| 🐐 Chrome | [Chrome 应用商店](https://chrome.google.com/webstore/detail/bookmarkhub-sync-bookmark/fohimdklhhcpcnpmmichieidclgfdmol) |
| 🐗 Firefox | [Firefox Add-ons](https://addons.mozilla.org/zh-CN/firefox/addon/BookmarkHub/) |
| 🐮 Edge | [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/BookmarkHub/fdnmfpogadcljhecfhdikdecbkggfmgk) |

### 从源码构建（本分支增强版）

```bash
git clone https://github.com/MuyuQ/BookmarkHub_MuyuQ.git
cd BookmarkHub_MuyuQ
npm install
npm run build       # Chrome 构建
npm run build:firefox  # Firefox 构建
```

构建产物在 `dist/` 目录，可在浏览器扩展管理页面以「加载已解压的扩展」方式安装。

<!-- USAGE EXAMPLES -->
## 📋 使用方法

### GitHub Gist 方式

1. 💻 [登录](https://github.com/login) GitHub，如果没有账号请[注册](https://github.com/join)
2. 🔑 [创建 Token](https://github.com/settings/tokens/new) - 需要 `gist` 权限
3. 📄 [创建私有 Gist](https://gist.github.com) - ⚠️ 公开 Gist 可被搜索
4. 🐐 安装扩展，填入 Token 和 Gist ID

### WebDAV 方式

1. 🗁 准备 WebDAV 服务器（如 Nextcloud、NAS）
2. 🐐 安装扩展，选择 WebDAV 存储类型
3. 🔑 填入服务器地址、用户名、密码
4. 🔄 点击连接测试，确认可用

## 👨‍💻 开发指南

```bash
# 安装依赖
npm install

# 开发模式 (Chrome)
npm run dev

# 开发模式 (Firefox)
npm run dev:firefox

# 生产构建
npm run build

# 运行测试
npm run test

# 类型检查
npm run compile
```

## 📚 文档

| 文档 | 说明 |
|------|------|
| [项目架构总览](docs/项目架构总览.md) | 系统架构、目录结构、核心模块 |
| [数据流与同步机制](docs/数据流与同步机制.md) | 同步流程、三向合并、墓碑机制 |
| [核心模块详解](docs/核心模块详解.md) | 各模块详细代码说明 |
| [开发者指南](docs/开发者指南.md) | 开发规范、添加功能、测试调试 |
| [代码审查报告](docs/BookmarkHub项目代码审查报告.md) | 全面代码审查与质量改进记录 |

<!-- ROADMAP -->
## 🚀 发展路线

### 已完成

- [x] ✅ 自动同步书签（定时/事件/混合）
- [x] ✅ WebDAV 协议支持
- [x] ✅ 书签导入导出 (JSON/HTML)
- [x] ✅ 三向合并算法
- [x] ✅ 墓碑机制（删除传播）
- [x] ✅ 变更检测
- [x] ✅ 多语言支持（10种语言）
- [x] ✅ 凭证加密存储（Web Crypto API）
- [x] ✅ 手动同步传输
- [x] ✅ v2 数据格式
- [x] ✅ 统一错误处理与日志分级
- [x] ✅ 单元测试与行为测试覆盖
- [x] ✅ TypeScript 严格模式代码重构

### 待实现

- [ ] 📱 移动端支持
- [ ] 🔒 端到端数据加密
- [ ] 📉 书签分享功能
- [ ] 🤖 自动化测试与 CI/CD 流水线


<!-- LICENSE -->
## 📜 License

MIT License - 详情见 `LICENSE` 文件

<!-- CONTACT -->
## 📧 Contact

| 角色 | 链接 |
|------|------|
| 原作者 | [dudor](https://github.com/dudor) |
| 上游项目 | [dudor/BookmarkHub](https://github.com/dudor/BookmarkHub) |
| 维护者 | [MuyuQ](https://github.com/MuyuQ) |

---

<p align="center">
  Made with 💚 by BookmarkHub Team
</p>


<!-- PROJECT LOGO -->
<br />
<p align="center">
  <a href="https://github.com/dudor/BookmarkHub">
    <img src="images/icon128.png" alt="BookmarkHub" width="128">
  </a>

  <h1 align="center">BookmarkHub</h1>
  <p align="center">
    一个持续维护的 BookmarkHub 分支，用于跨浏览器同步书签。
    <br />
    <a href="../../issues">🐞 反馈问题</a>
      
    <a href="README.md">🇨🇳 简体中文</a>
      
    <a href="README_e.md">🇺🇸 English</a>
  </p>
</p>

<!-- BADGES -->
<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/版本-0.7-blue.svg">
  <img alt="Chrome" src="https://img.shields.io/badge/Chrome-88+-green.svg">
  <img alt="Firefox" src="https://img.shields.io/badge/Firefox-109+-orange.svg">
  <img alt="License" src="https://img.shields.io/badge/许可证-MIT-purple.svg">
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

本仓库基于 [dudor/BookmarkHub](https://github.com/dudor/BookmarkHub) fork 而来。

保留了原项目基于 GitHub Gist 的书签同步能力，并在此分支持续维护。

BookmarkHub 是一款浏览器扩展程序，可以在不同浏览器之间同步你的书签。

### 支持的浏览器

| 浏览器 | 支持状态 |
|--------|----------|
| 🐐 Chrome | ✅ 完全支持 |
| 🐗 Firefox | ✅ 完全支持 |
| 🐮 Microsoft Edge | ✅ 完全支持 |
| 🐨 其他 Chromium 内核浏览器 | ✅ 完全支持 |

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
| 📈 导入导出 | JSON 格式书签导入导出 |
| 💬 多语言支持 | 支持 10 种语言 |

### 特点

- 🔑 **无需注册新账号** - 使用 GitHub 账号的 Token 和 Gist 即可
- 📄 **一键清空** - 清空本地所有书签（谨慎使用）
- 📋 **书签计数** - 显示本地和远程书签数量
- 🔒 **安全存储** - 数据存储在私有 Gist，安全可靠

## 🛠 技术栈

| 技术 | 版本 |
|------|------|
| 👑 WXT | 0.19.x |
| 👨 React | 18.x |
| 📋 TypeScript | 5.x |
| 💚 Bootstrap | 4.x |
| 📦 Vitest | 4.x |

## 📥 下载安装

> 📘 本插件需要把书签存储到 Gist 中，所以请确保有 GitHub 贡号。

| 浏览器 | 下载链接 |
|--------|----------|
| 🐐 Chrome | [Chrome 应用商店](https://chrome.google.com/webstore/detail/bookmarkhub-sync-bookmark/fohimdklhhcpcnpmmichieidclgfdmol) |
| 🐗 Firefox | [Firefox Add-ons](https://addons.mozilla.org/zh-CN/firefox/addon/BookmarkHub/) |
| 🐮 Edge | [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/BookmarkHub/fdnmfpogadcljhecfhdikdecbkggfmgk) |
| Chromium 内核 | [Chrome 应用商店](https://chrome.google.com/webstore/detail/bookmarkhub-sync-bookmark/fohimdklhhcpcnpmmichieidclgfdmol) |

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

<!-- ROADMAP -->
## 🚀 发展路线

### 已完成

- [x] ✅ 自动同步书签（定时/事件/混合）
- [x] ✅ WebDAV 协议支持
- [x] ✅ 书签导入导出
- [x] ✅ 三向合并算法
- [x] ✅ 墓碑机制（删除传播）
- [x] ✅ 多语言支持（10种语言）

### 待实现

- [ ] 📱 移动端支持
- [ ] 📉 书签分享功能
- [ ] 🔒 数据加密存储


<!-- LICENSE -->
## 📜 License

MIT License - 详情见 `LICENSE` 文件

<!-- CONTACT -->
## 📧 Contact

| 角色 | 链接 |
|------|------|
| 原作者 | [dudor](https://github.com/dudor) |
| 上游项目 | [dudor/BookmarkHub](https://github.com/dudor/BookmarkHub) |

---

<p align="center">
  Made with 💚 by BookmarkHub Team
</p>

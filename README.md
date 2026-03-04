
<!-- PROJECT LOGO -->
<br />
<p align="center">
  <a href="https://github.com/dudor/BookmarkHub">
    <img src="images/icon128.png" alt="BookmarkHub" >
  </a>

  <h1 align="center">BookmarkHub</h1>
  <p align="center">
    一个持续维护的 BookmarkHub 分支，用于跨浏览器同步书签。
    <br />
    <a href="../../issues">反馈问题</a>
    ·
    <a href="README.md">简体中文</a>
    ·
    <a href="README_e.md">English</a>
  </p>
</p>

<!-- TABLE OF CONTENTS -->
<details open="open">
  <summary><h2 style="display: inline-block">目录</h2></summary>
  <ol>
    <li><a href="#关于">关于</a></li>
    <li><a href="#功能">功能</a></li>
    <li><a href="#下载安装">下载安装</a></li>
    <li><a href="#使用方法">使用方法</a></li>
    <li><a href="#待实现的功能">待实现的功能</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
  </ol>
</details>

<!-- ABOUT THE PROJECT -->
## 关于 

本仓库基于 [dudor/BookmarkHub](https://github.com/dudor/BookmarkHub) fork 而来。

保留了原项目基于 GitHub Gist 的书签同步能力，并在此分支持续维护。

BookmarkHub 是一款浏览器插件，可以在不同浏览器之间同步你的书签。

适用于各大主流浏览器，如 Chrome、Firefox、Microsoft Edge 等。

它使用 GitHub 的 Gist 记录来存储浏览器的书签，可以放心安全的使用。

## 功能
* 不需要注册特殊账号，只需要用你的 GitHub 账号的Token和Gist
* 一键上传下载书签
* 一键清空本地所有书签
* 支持跨电脑跨浏览器同步书签
* 支持显示本地和远程书签的数量
* 支持自动同步（定时 / 事件 / 混合）
* 支持 WebDAV 作为可选存储后端
* 支持书签导入导出

## 下载安装
> 本插件需要把书签存储到 Gist 中，所以请确保有 GitHub 账号或可以通过网络注册 GitHub 账号。
* [Chrome 浏览器](https://chrome.google.com/webstore/detail/bookmarkhub-sync-bookmark/fohimdklhhcpcnpmmichieidclgfdmol)
* [Firefox 浏览器](https://addons.mozilla.org/zh-CN/firefox/addon/BookmarkHub/)
* [Microsoft Edge 浏览器](https://microsoftedge.microsoft.com/addons/detail/BookmarkHub/fdnmfpogadcljhecfhdikdecbkggfmgk)
* [其他基于 Chromium 内核的浏览器](https://chrome.google.com/webstore/detail/bookmarkhub-sync-bookmark/fohimdklhhcpcnpmmichieidclgfdmol)

<!-- USAGE EXAMPLES -->
## 使用方法

1. [登陆](https://github.com/login) GitHub，如果没有账号请点此[注册](https://github.com/join)。
2. [创建一个可以管理 gist 的 token](https://github.com/settings/tokens/new)。
3. [创建一个私有的 gist](https://gist.github.com)。__注意：如果是公开的 gist，你的书签是可以被他人搜索到的。__
4. 在浏览器的应用商店下载 BookmarkHub，点击插件的设置按钮，在弹出的设置窗口填入 token 和 gist ID，然后你就可以上传下载书签了。

<!-- ROADMAP -->
## 待实现的功能

- [x] 自动同步书签
- [x] 支持 webdav 协议
- [ ] 移动端
- [x] 导入导出
- [ ] 分享书签


<!-- LICENSE -->
## License

See `LICENSE` for more information.

<!-- CONTACT -->
## Contact

原作者: [dudor](https://github.com/dudor)

上游项目: [https://github.com/dudor/BookmarkHub](https://github.com/dudor/BookmarkHub)




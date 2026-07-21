![New Tab icon](../icons/icon.svg)

# New Tab
[![Chrome 网上应用店](https://img.shields.io/badge/Chrome%20Web%20Store-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/bgjillpeijfmdopfbmoinfogfhaadina?utm_source=item-share-cb)
[![Edge 插件商店](https://img.shields.io/badge/Edge-插件商店-0A7CFF?style=for-the-badge&logo=microsoftedge&logoColor=white)](https://microsoftedge.microsoft.com/addons/detail/new-tab/mcbemnamenhelofgaclcanfcdjnjnhmi)
[![下载 CRX](https://img.shields.io/badge/下载-CRX-111827?style=for-the-badge&logo=googlechrome&logoColor=white)](https://github.com/404-PF/New-Tab/releases/latest/download/New-Tab.crx)
[![许可证: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../LICENSE)

Chrome Web Store 文案：[en-US](CHROME-WEB-STORE.en-US.md) | [zh-CN](CHROME-WEB-STORE.zh-CN.md)

这是一个面向 Chromium 浏览器的个性化新标签页扩展。它会用一个可自定义的仪表盘替换默认新标签页，并提供快捷方式、背景、待办、引导和 AI 助手等能力，同时附带一个使用浏览器默认搜索提供程序的可选搜索框。

## ✨ 主要功能
- 在简洁界面中显示时钟、日期和每日格言
- 一个使用浏览器默认搜索提供程序的可选搜索框
- 应用快捷方式网格，支持内置入口、自定义网站和拖拽排序
- 支持静态背景、动态视频背景，以及自定义上传图片和视频
- 待办清单支持截止日期、逾期状态、筛选和进度统计
- 提供简洁模式，以及主题、颜色、字体、图标大小和图标形状设置
- 支持英文和简体中文界面
- 内置新手引导、更新检查，以及带离线兜底的 AI 聊天

## 🚀 安装方式
推荐安装方式：
1. Chrome 用户：通过 [Chrome 网上应用店](https://chromewebstore.google.com/detail/bgjillpeijfmdopfbmoinfogfhaadina?utm_source=item-share-cb) 安装。
2. Microsoft Edge 用户：优先通过 [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/new-tab/mcbemnamenhelofgaclcanfcdjnjnhmi) 安装。
3. 其他 Chromium 浏览器用户：请按照下方手动安装说明进行安装；最新安装包也可从 [Releases](https://github.com/404-PF/New-Tab/releases/latest) 下载为 [New-Tab.crx](https://github.com/404-PF/New-Tab/releases/latest/download/New-Tab.crx)。

手动安装或本地开发：
1. 下载或克隆本仓库。
2. 打开 `chrome://extensions` 或 `edge://extensions`。
3. 启用开发者模式。
4. 点击 **Load unpacked**，选择项目根目录。
5. 打开一个新标签页即可开始使用。

## 🖼️ 截图
| 页面 | 预览 |
|------|------|
| 主界面 | ![](../screenshots/New-Tab_1.png) |
| 背景选择器 | ![](../screenshots/New-Tab_2.png) |

## 📁 项目结构
```text
New-Tab.html         # 扩展主页面
style.css            # 全局样式
src/
	ai/                # AI 助手、联网检测与离线处理
	core/              # 启动逻辑、语言、版本、工具函数、更新检查
	data/              # 内置背景、自定义背景、格言数据
	features/          # 待办、引导、简洁模式、拖拽等功能
	ui/                # 设置、应用管理、添加应用、搜索栏处理
_locales/            # 扩展国际化文案
background/tools/    # 背景缩略图与视频预览生成脚本
```

## 👥 贡献指南
欢迎贡献代码。请先阅读我们的 [贡献指南](CONTRIBUTING.zh-CN.md)，了解工作流和分支约定。

本地开发说明：
- 项目无需构建步骤，全部采用原生 JavaScript，浏览器会直接加载源码。
- 主入口页面：`New-Tab.html`
- 样式文件：`style.css`
- 源码目录：`src/`
- 国际化文案：`_locales/`
- 背景资源辅助脚本：`background/tools/`
- 仓库当前没有自动化测试。日常验证方式是重新加载已解压扩展，并在浏览器中新开标签页进行手动测试。

## 📄 许可协议
本项目基于 [MIT 许可协议](../LICENSE)。

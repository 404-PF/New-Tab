# 为 New Tab 做出贡献

感谢你对 New Tab 项目感兴趣！

## 👥 参与贡献

项目仍处于开发阶段，非常欢迎各种贡献！

无论你想修复 bug、添加功能、完善文档，还是翻译界面，我们都非常感谢。本指南介绍了如何搭建项目、开发流程、架构概览以及需要遵循的规范。

## 🚀 开始之前

### 环境要求

- **Node.js**：`^20.19.0 || ^22.13.0 || >=24`（`.nvmrc` 固定为 `22.13`）。
- 一款基于 Chromium 的浏览器（Chrome、Edge、Brave 等），用于加载未打包的扩展。

### 搭建步骤

1. Fork 并克隆仓库：

   ```bash
   git clone https://github.com/<your-username>/New-Tab.git
   cd New-Tab
   ```

2. 安装依赖（同时会安装 Husky 的 pre-commit 钩子）：

   ```bash
   npm install
   ```

3. 加载未打包的扩展：
   - 打开 `chrome://extensions`（或 `edge://extensions`）。
   - 开启 **开发者模式**。
   - 点击 **加载已解压的扩展程序**，选择项目根目录（包含 `manifest.json` 的文件夹）。
   - 项目 **无需构建步骤** —— 扩展直接以源码形式运行。

## 🔧 开发流程

本项目使用原生 JS、无打包工具的架构。源码位于 `src/` 下，由引导脚本动态加载。

### 常用命令

| 任务 | 命令 |
|---|---|
| 运行一次全部测试 | `npm test` |
| 监听模式运行测试 | `npm run test:watch` |
| 覆盖率（HTML 报告在 `coverage/`） | `npm run test:coverage` |
| 运行单个测试文件 | `npx vitest run tests/todo.test.js` |
| 代码检查 | `npm run lint` |
| 自动修复检查问题 | `npm run lint:fix` |

### 提交 PR 之前

CI 按顺序执行以下命令，请先在本地运行：

```bash
npm ci --ignore-scripts
npm run lint
npm test
```

Husky 的 pre-commit 钩子也会自动运行 `eslint .`。

### 分支规范

- 从 `main` 分支拉取新分支；PR 的目标分支为 `main`。
- 使用具有描述性的分支名（例如 `fix/issue-123-tooltip`、`feat/issue-456-weather`）。
- 改动应聚焦于单个问题或功能。

## 🏗️ 架构概览

- **入口**：`New-Tab.html` 是 `chrome_url_overrides.newtab` 页面（见 `manifest.json`）。
- **脚本加载**：`New-Tab.html` 仅包含两个 `<script>` 标签 —— `<head>` 中的 `src/core/storage.js` 与 `<body>` 末尾的 `src/core/bootstrap.js`。其余源文件均由 `bootstrap.js` 动态加载。**若要新增源文件，请将其路径追加到 `src/core/bootstrap.js` 的 `scriptSources` 中 —— 不要向 `New-Tab.html` 添加 `<script>` 标签。**
- **加载顺序很重要**。`bootstrap.js` 使用 `script.async = false` 来保持顺序，且 `app-manager.js` 必须在 `add-app-modal.js`、`context-menu.js` 与 `app-folders.js` 之前执行。
- **模块风格**：浏览器代码为普通脚本，将函数挂载到 `window.*`。`src/` 源文件中不使用 ES module 的 `import`（测试文件是 ES module，使用 `import`/`export`）。部分文件将顶层代码包裹在严格模式的 IIFE 中。在这些 IIFE 内部，跨文件全局变量必须以 `window.Foo` 引用，而非裸写 `Foo`。
- **存储**：`src/core/storage.js` 将 `localStorage` 桥接到 `chrome.storage.local`。引导脚本会等待 `window.__storageBridgeReady` 后再加载其余脚本。
- **Service worker**：`background/service-worker.js` 是独立的运行上下文。
- **无构建产物**：源码不会生成任何产物。`package.json` 与 `manifest.json` 的版本需手动保持同步。

### 目录结构

- `src/core/` - 引导、存储、版本、工具函数、语言/运行时、更新检查、应用网格状态/存储
- `src/ui/` - 设置、应用管理器、添加应用流程、颜色/字体选择器
- `src/features/` - 待办、笔记、新手引导、简洁模式、拖拽、应用文件夹、右键菜单、天气、交互背景
- `src/ai/` - AI 助手、Markdown 解析、网络/离线检测、OpenRouter 客户端
- `src/data/` - 内置背景与格言
- `background/` - Service worker 与 Node 缩略图/视频工具
- `tests/` - Vitest 测试
- `docs/` - 本地化 README 与贡献指南
- `_locales/` - 扩展的 i18n 文案

## 🎨 代码风格

- **语言**：原生 JavaScript，单引号，分号，`===` 仅用全等，不使用 `var`。
- **命名**：函数/变量使用 `camelCase`，常量使用 `UPPER_SNAKE_CASE`。
- **DOM 初始化守卫**：初始化遵循 `readyState` 守卫：

  ```js
  if (document.readyState === 'loading') {
    addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  ```

  `src/core/dom-ready.js` 导出了 `window.onDomReady` 用于此目的。
- **IIFE 中的跨文件全局变量**：必须以 `window.Foo` 引用，不得裸写 `Foo`（由 ESLint 强制）。
- **存储**：使用 `localStorage` 持久化（桥接到 `chrome.storage.local`）。读取时用 `try/catch` 包裹，解析失败时返回 `[]`/`{}` 默认值。
- **定时器**：对于在标签页隐藏时应暂停的定时器，使用 `new window.VisibilityInterval(fn, ms)`；它会回退到 `setInterval`。
- **代码检查**：ESLint v10 扁平配置（`eslint.config.js`）。提交前请运行 `npm run lint`。

## 🌐 添加新的语言

扩展支持多种界面语言。添加新语言的方法：

1. **在 `src/core/languages.js` 中添加翻译条目**：
   - 在 `translations` 对象中新增一个语言对象。你只需翻译你已有的字符串即可 —— 缺失的键会自动回退到英文，但语言对象及其元数据仍需保留。
   - 在 `en` 对象中添加原生名称键（例如 `swahili: 'Swahili'`）
   - 在 `SUPPORTED_LANGUAGES` 数组中添加一项，包含语言代码、国旗 emoji、原生名称与名称键

2. **在 `_locales/<code>/messages.json` 中添加 Chrome i18n 语言包**：
   - 在 `_locales/` 下新建以语言代码命名的文件夹
   - 添加 `name` 与 `description` 字段（供 Chrome 网上应用店使用）

3. **缺失的键会自动回退到英文** —— 无需翻译每一个字符串

4. 运行测试验证：`npm test`

## 📝 提交改动

1. 在功能/修复分支上进行改动。
2. 为任何行为变更添加或更新测试。
3. 运行 `npm run lint` 与 `npm test`，确保通过。
4. 使用清晰、约定式的提交信息（例如 `fix(todo): ...`、`feat(weather): ...`）。
5. 向 `main` 发起 PR，并描述改动内容及原因。
6. 在 PR 描述中关联相关 issue（例如 `Closes #123`）。

## 📄 许可证

本项目基于 [MIT 许可证](../LICENSE) 开源。

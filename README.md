![New Tab icon](icons/icon.svg)

# New Tab v0.4.3

[![Microsoft Edge Add-ons](https://img.shields.io/badge/Microsoft%20Edge-Add--ons-0A7CFF?style=for-the-badge&logo=microsoftedge&logoColor=white)](https://microsoftedge.microsoft.com/addons/detail/new-tab/mcbemnamenhelofgaclcanfcdjnjnhmi)
[![Download CRX](https://img.shields.io/badge/Download-CRX-111827?style=for-the-badge&logo=googlechrome&logoColor=white)](https://github.com/404-PF/New-Tab/releases/latest/download/New-Tab.crx)

**Available Languages**:  
[![English](https://img.shields.io/badge/English-blue)](docs/README.en-US.md)
[![简体中文](https://img.shields.io/badge/简体中文-blue)](docs/README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.4.3-blue)](CHANGELOG.md)

A personalized new tab extension for Chromium-based browsers. It replaces the default new tab page with a customizable dashboard for search, shortcuts, backgrounds, todos, onboarding, and AI assistance.

## ✨ Highlights
- Clock, date, and daily motto on a clean dashboard
- Search bar that uses your browser's default search provider
- App grid with built-in actions, custom shortcuts, and drag-and-drop ordering
- Static and live backgrounds, including uploaded images and videos
- Todo list with due dates, overdue state, filters, and progress tracking
- Simple mode plus settings for themes, colors, fonts, icon size, and icon shape
- English and Simplified Chinese interface support
- Built-in onboarding tour, update checks, and AI chat with offline fallback

## 🚀 Installation
Recommended install methods:
1. Microsoft Edge users: install from [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/new-tab/mcbemnamenhelofgaclcanfcdjnjnhmi).
2. Other Chromium browser users: follow the manual installation instructions below. The latest package is also available as [New-Tab.crx](https://github.com/404-PF/New-Tab/releases/latest/download/New-Tab.crx) from [Releases](https://github.com/404-PF/New-Tab/releases/latest).

Manual or development install:
1. Download or clone this repository.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable Developer mode.
4. Click **Load unpacked** and select the project root folder.
5. Open a new tab to start using the extension.

## 🖼️ Screenshots
| Screen | Preview |
|------|------|
| Dashboard | ![](screenshots/New-Tab_1.png) |
| Background picker | ![](screenshots/New-Tab_2.png) |

## 📁 Project Structure
```text
New-Tab.html         # main extension page
style.css            # global styles
src/
	ai/                # AI assistant, network detection, offline handling
	core/              # startup, language, version, utilities, update checks
	data/              # built-in backgrounds, custom backgrounds, motto data
	features/          # todo list, onboarding, simple mode, drag/drop helpers
	ui/                # settings, app manager, add-app flow, search bar handling
_locales/            # extension translations
background/tools/    # background thumbnail and video preview generators
```

## 👥 Contributing
Contributions are welcome. See our [Contributing Guide](CONTRIBUTING.md) for workflow and branch conventions.

Development notes:
- No build step is required. The extension is written in vanilla JavaScript and loaded directly by the browser.
- Main entry point: `New-Tab.html`
- Styles: `style.css`
- Source code: `src/`
- Localization files: `_locales/`
- Background asset helper scripts: `background/tools/`
- There is no automated test suite in the repository yet. Manual verification is done by reloading the unpacked extension and testing the new tab page in the browser.

## 📄 License
This project is licensed under the [MIT License](LICENSE).

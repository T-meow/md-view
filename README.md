# md-view

[English](README.en.md)

一个轻量、本地优先的 Markdown 阅读与编辑器。打开一份 README，或管理整个文档文件夹；在阅读、源码、可视化编辑与分屏预览之间切换，文件始终保存在自己的设备上。

[下载 v1.2.0](https://github.com/T-meow/md-view/releases/tag/v1.2.0) · [产品官网](https://t-meow.github.io/md-view/) · [在线体验](https://t-meow.github.io/md-view/play/) · [更新日志](CHANGELOG.md)

## 下载与开始使用

在 [GitHub Releases](https://github.com/T-meow/md-view/releases/latest) 选择对应系统和版本的文件：

| 系统 | 下载文件 | 使用方式 |
| --- | --- | --- |
| Windows x64 | `md-view-lite_1.2.0_windows-x64-portable.exe` 或 `md-view-plus_1.2.0_windows-x64-portable.exe` | 下载后直接运行，需要系统提供 WebView2 运行环境 |
| macOS Apple Silicon | 文件名以 `md-view-lite_1.2.0_` 或 `md-view-plus_1.2.0_` 开头的 `.dmg` | 打开磁盘映像，将应用拖入 Applications |

当前公开包覆盖以上平台；不包含 Linux 或 Intel Mac 的预构建包。macOS 应用尚未签名和公证，首次打开可能受到系统拦截。

启动后可新建文档、打开一个或多个文件，也可打开文件夹或直接拖入文件。点击文档里的本地 Markdown 链接，会在应用标签页中打开对应文件；网页链接由系统浏览器打开。修改后按 `Ctrl+S` 保存，未保存文档关闭时会提示处理。

## 1.2.0 更新

- **更完整的文件工作流**：多标签、新建、拖放打开、关闭文件，以及重命名、移动、回收站和系统定位。切换标签保留文档内容、源码撤销历史、视图和阅读位置。
- **自适应侧栏**：窗口缩小时收窄两侧栏，空间不足时临时收起大纲；扩大窗口后恢复，不覆盖手动设置。
- **统一代码复制**：Lite、Plus 和网页体验都支持代码块复制与换行，包括没有语言标记的代码块。复制保留缩进和换行，成功后才显示“已复制”，失败可重试。
- **应用内本地跳转**：修复本地文档链接误开浏览器的问题，支持中文、空格、相对路径和跨文件章节跳转。
- **编辑与阅读修复**：改善可视化编辑对代码、列表、表格和引用链接的保留；修复阅读位置更新，并隐藏打印中的代码工具栏。
- **关于与依赖更新**：设置中显示版本、作者、官网、仓库和许可证；同步更新存在已知安全问题的依赖。

完整说明见 [更新日志](CHANGELOG.md)，操作验收样例见 [1.2.0 验收清单](docs/ui-update-checklist.md)。

## Lite 与 Plus

两个版本共用桌面界面、文件管理和保存机制，按需要选择渲染能力。

| 功能 | Lite | Plus |
| --- | --- | --- |
| 本地文件夹、多标签、新建与拖放 | ✓ | ✓ |
| 阅读、源码、可视化编辑、分屏 | ✓ | ✓ |
| 自适应侧栏、大纲、本地文档跳转 | ✓ | ✓ |
| 表格、任务列表、代码复制与换行 | ✓ | ✓ |
| 主题、背景、中英文、草稿与保存冲突提示 | ✓ | ✓ |
| 已打开 / 最近 / 已加载文件的快速查找 | ✓ | ✓ |
| 数学公式、Mermaid、Frontmatter、脚注与高级语法 | — | ✓ |
| 工作区标题索引、本地链接校验、HTML 导出 | — | ✓ |

![md-view 界面预览](assets/preview.png)

## 本地文件与保存

- 单独打开文件只读取目标文档；打开文件夹后逐层加载，文件树只渲染可见行。工作区索引按需启动。
- 自动草稿与手动保存分开；**自动写回默认关闭**。保存前检查磁盘文件是否变化，避免直接覆盖外部修改。
- 保存保留已有 UTF-8、GBK、UTF-16 编码、BOM 与换行风格。大于 2 MiB 的文档默认使用源码模式。
- 文件扫描遵循 `.gitignore`、`.ignore` 与自定义排除，默认不遍历符号链接或 junction。
- 可视化编辑会尽量保留未修改块的原始 Markdown。复杂语法建议在源码模式编辑；跨标签的可视化撤销历史没有持久化保证。

在线体验在浏览器中处理导入的文本，提供源码编辑、预览与下载导出；桌面版负责直接读写文件、文件夹管理和草稿。文档中的远程图片仍会按原地址加载。

## 快捷键

| 操作 | Windows / Linux |
| --- | --- |
| 新建文档 | `Ctrl+N` |
| 打开文件 | `Ctrl+O` |
| 快速打开 | `Ctrl+P` |
| 保存 / 另存为 | `Ctrl+S` / `Ctrl+Shift+S` |
| 关闭当前标签 | `Ctrl+W` |
| 下一个 / 上一个标签 | `Ctrl+Tab` / `Ctrl+Shift+Tab` |

macOS 的新建、打开、查找、保存和关闭使用对应的 `Command` 组合键。

## 开发与构建

使用 Tauri 2、Svelte 和 Vite。开发需要 Node.js 24、Rust stable（至少 1.88）及所在系统的 Tauri 桌面依赖。

```bash
npm ci
npm run tauri:dev          # Plus
npm run tauri:dev:lite     # Lite
```

常用构建命令：

```bash
# Windows 便携版；将 plus 换成 lite 可构建 Lite
npm run tauri:build:plus -- --no-bundle

# Windows NSIS 安装包（默认构建目标）
npm run tauri:build:plus

# macOS DMG（在 macOS 上执行）
npm run tauri:build:plus -- --bundles dmg

# 官网与在线体验
npm run build:web
npm run check:web
```

桌面构建产物位于 `src-tauri/target/release/`，规范化命名的分发文件复制到 `release/`。官网与在线体验输出到 `dist-site/`，默认部署路径为 `/md-view/`，可通过 `VITE_BASE_PATH` 调整。

提交前检查：

```bash
npm run check
npm test
npm run check:editions
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked
git diff --check
```

GitHub Actions 在分支更新时检查并构建 Lite / Plus 的 Windows 和 macOS 版本；推送 `v*` 标签会创建带产物的草稿 Release，检查后再正式发布。`main` 更新会部署中英文官网及在线体验到 GitHub Pages。

架构和文件加载设计见 [开发记录](docs/load-performance-plan.md)。

## 反馈与许可证

问题反馈请提交 [Issue](https://github.com/T-meow/md-view/issues)，附上系统、版本、复现步骤和不含私人信息的最小文档。本项目不接受 PR，欢迎 fork 后按自己的需要修改、构建和分发。

作者：[T-meow](https://github.com/T-meow)。使用 [WTFPL v2](LICENSE) 许可证，按原样提供，不提供任何明示或暗示的担保；使用、修改和分发的风险由使用者承担。

# 更新日志 / Changelog

## 1.2.0 — 2026-09-29

此版本包含自 1.0.1 以来的桌面文件工作流更新；中间开发版本 1.1.0 未单独正式发布。

### 新增与改进

- Lite / Plus 共用新建、打开、拖放、关闭和多标签流程。标签保留内容、源码撤销历史、视图与阅读位置。
- 文件夹按需加载，文件树仅渲染可见行；增加快速打开与按需工作区索引。基础文件管理、自动草稿、保存冲突检测和编码保留由两个版本共用。
- 侧栏根据实际工作区宽度收缩；空间不足时临时隐藏大纲，扩大窗口后恢复用户设置。拖动与键盘调整从实际显示宽度开始。
- Lite、Plus、网页体验和快速预览统一代码复制与换行工具，支持未标注语言的代码块，横向滚动时按钮保持可见。
- 复制在剪贴板写入成功后确认，失败时提示重试；Mermaid 复制源码使用同样的反馈，切换内容时清理旧状态。
- 共用设置新增“关于”：版本、Lite / Plus 标识、作者、官网、仓库和许可证，支持中英文。
- 重写中英文 README，同步更新官网与在线体验。

### 修复

- 本地文档链接在应用内打开，修复 Windows 下误启动浏览器的问题；支持中文、空格、相对路径、绝对路径、`file://` 与跨文件章节锚点。
- 可视化编辑保留未修改块和引用定义；改善代码缩进与空行、围栏、任务列表、删除线、嵌套列表、起始编号、表格对齐、转义文字和链接标题的回写。
- 代码换行、折叠块与图表缩放后更新阅读位置；链接校验失败时保留正文，避免过期异步状态影响新内容。
- 打印时隐藏代码与图表工具栏，并让长代码换行。
- 更新 DOMPurify、Mermaid、devalue、Vitest、PostCSS 和 nanoid 等依赖的修复版本。

### 下载与使用说明

- Lite / Plus 均提供 Windows x64 便携 exe 与 macOS Apple Silicon DMG。
- macOS 应用未签名和公证；Windows 便携版使用系统 WebView2 运行环境。
- 自动写回默认关闭，修改通过手动保存写回文件。可视化编辑的跨标签撤销历史不做持久化保证。
- 自动化测试覆盖布局、代码复制、文档会话、本地导航与可视化回写；真实窗口、系统拖放与原生剪贴板的验收方法见 [检查清单](docs/ui-update-checklist.md)。

### English

- Shared Lite / Plus desktop workflow: tabs, new documents, drag and drop, close, file management, lazy folder loading, quick open, drafts and conflict-aware saving.
- Adaptive sidebars restore saved widths as the window grows; code blocks have consistent copy and wrap controls across editions and the online demo.
- Clipboard feedback waits for a successful write and supports retrying failures. Mermaid source copying shares this behavior.
- Local document links open in the app, including Unicode paths, spaces and cross-file heading links, instead of launching a browser.
- Improved visual Markdown round-tripping, reading position updates and printing; added localized About information and updated dependencies.
- Refreshed documentation and website. Both editions ship as Windows x64 portable executables and macOS Apple Silicon DMGs.

[与 1.0.1 比较 / Compare with 1.0.1](https://github.com/T-meow/md-view/compare/v1.0.1...v1.2.0)

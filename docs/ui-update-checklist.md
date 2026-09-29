# 1.2.0 验收清单

用于 Lite / Plus 桌面版及网页体验的回归检查。桌面版从 [v1.2.0 Release](https://github.com/T-meow/md-view/releases/tag/v1.2.0) 下载；开发环境使用 `npm run tauri:dev:plus` 或 `npm run tauri:dev:lite`。

## 自动检查

```bash
npm run check
npm test
npm run check:editions
npm run build:web
npm run check:web
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked
git diff --check
```

前端测试覆盖布局计算、模拟 ResizeObserver 的侧栏调整、复制成功与失败、多代码块独立反馈、快速预览去重、关闭取消、标签切换与源码撤销历史、本地链接点击和可视化回写。后端测试覆盖文件读取、保存、冲突与会话行为。

系统接口在组件测试中使用模拟实现；真实窗口观感、原生对话框、系统拖放、原生剪贴板和打印预览仍需人工检查。十万文件性能和真实回收站往返测试不在默认测试中运行。

## 人工验收

1. 打开一个文件夹和本文件，同时显示文件栏与大纲。将窗口从约 1280px 缩到 1024px、900px：侧栏先收窄，随后大纲及分隔条隐藏；放大后恢复。判断依据是工作区实际宽度，两侧栏同时显示至少需要 928px。
2. 在窄窗口检查大纲按钮的说明。收起文件栏后大纲应恢复；手动关闭大纲后，缩放窗口不应重新打开它。
3. 拖动两侧分隔条，再通过 Tab 聚焦并按左右方向键，确认宽度从当前显示位置开始变化，没有跳动。自动收缩不应覆盖保存的宽度。
4. 在阅读和分屏视图复制下方两个代码块，粘贴到源码编辑器或记事本。确认只有代码内容，保留中文、特殊字符、缩进和换行；成功提示约两秒后恢复。横向滚动长代码并切换“换行”，按钮应始终可见。在网页体验中也执行一次。
5. 在 Plus 中复制 Mermaid 源码，确认内容正确。快速切换文件或修改内容，确认旧文档的复制提示不会残留；若浏览器拒绝剪贴板访问，应提示失败并允许重试。
6. 同时拖入两个 Markdown 文件，确认各自打开标签。新建并编辑文档后关闭，选择取消，确认内容保留。切换标签后检查内容、阅读位置和源码撤销历史。
7. 在设置的“关于”中检查版本 `1.2.0`、edition、作者和许可证。切换 English 后检查文案；官网及仓库链接应由系统浏览器打开。
8. 将下方样例另存为临时文档，在可视化模式修改段落、列表项和表格单元格，再切回源码。确认任务勾选、删除线、引用定义、表格对齐、代码空行和围栏保留；保存、关闭、重新打开后再次核对。
9. 打开打印预览，确认代码与图表工具栏隐藏，长代码自动换行。另检查代码换行、折叠块展开和图表缩放后，阅读高亮与大纲能跟随当前位置。
10. 点击[本地 Markdown 示例的 Mermaid 章节](plus-markdown-syntax-sample.md#mermaid)，应在应用中打开并定位，浏览器不应启动。返回后再次点击，应复用目标标签。也可用带中文、空格和百分号的文件名检查本地跳转。二进制文件不在文本编辑器的支持范围内。

可视化编辑的跨标签撤销历史没有额外持久化保证，复杂文档建议在副本上验收。

## 复制样例

```ts
  const 消息 = '<&> "你好"';
  const 很长的一行 = 'abcdefghijklmnopqrstuvwxyz-abcdefghijklmnopqrstuvwxyz-abcdefghijklmnopqrstuvwxyz-abcdefghijklmnopqrstuvwxyz-abcdefghijklmnopqrstuvwxyz-abcdefghijklmnopqrstuvwxyz-abcdefghijklmnopqrstuvwxyz';
  console.log(消息, 很长的一行);
```

```
  没有语言标记的文本
    保留缩进、空格和 <tag> & "引号"

  最后一行
```

```mermaid
flowchart LR
  A[打开文档] --> B[复制源码]
  B --> C[粘贴并核对]
```

## 可视化回写样例

可以修改这一段文字，再检查后面的内容是否保留。

- [x] ~~已完成的事项~~
- [ ] 待办事项

10. 从十开始的列表
    - 子项
11. 下一个事项

| 左对齐 | 居中 | 右对齐 |
| :--- | :---: | ---: |
| 文本 | 内容 | 123 |

\*这里应显示字面星号\*，以及 [项目引用][md-view-repo]。

````md
```js
  console.log('嵌套围栏');
```


以上两行空行也应保留。
````

[md-view-repo]: https://github.com/T-meow/md-view "md-view 源码"

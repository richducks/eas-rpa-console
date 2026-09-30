# 0.26.1 窗口响应式验收

本补丁针对 Ubuntu 实机拖动窗口后的三个问题：放大后底部露出白色背景、窗口变窄后右侧内容被截断、窄窗口出现横向拖动条。

## 修复标准

- [x] 页面不再使用固定 `min-width: 680px`。
- [x] `body` 与 `.app-shell` 至少覆盖完整视口高度，深色主题不会在内容下方露出浅色底。
- [x] 整窗禁止横向溢出；纵向内容仍可滚动，但不占用可见滚动条轨道。
- [x] 720px 以下工作区由左右双栏重排为上下单栏。
- [x] 560px 以下压缩标题栏、状态区和账号操作，不通过裁切隐藏功能。
- [x] Electron 最小窗口调整为 420×420，避免进入不可操作的极小尺寸。

## 自动尺寸矩阵

使用最终 Electron 打包目录，在深色主题和真实账号/数据中心结构下执行固定尺寸截图：

| 用例 | 请求窗口 | renderer 视口 | scrollWidth | 工作区列 | 结果 |
|---|---:|---:|---:|---|---|
| 大 | 1500×820 | 1456×740 | 1456 | 260px + 846px | PASS |
| 中 | 560×820 | 516×740 | 516 | 488px 单列 | PASS |
| 小 | 500×520 | 456×440 | 456 | 428px 单列 | PASS |

三种尺寸均满足 `scrollWidth <= clientWidth`，因此不存在整窗横向滚动。

## 截图证据

- `docs/screenshots/responsive/large.png`
- `docs/screenshots/responsive/medium.png`
- `docs/screenshots/responsive/small.png`

这些截图来自 Electron 打包目录，不是单独的浏览器静态页面。

SHA-256：

- `large.png`：`32e8d6c59602dc6f81b791396f31ef2465f6f6ed791a039b9c159bef7b067533`
- `medium.png`：`34d2b78f95c59b1e79d9caf86bd668d70569aee4284cf0902f6906532bfd11cc`
- `small.png`：`850157decee1a5fde747ea6e374be3dbcc676818ec37770602da06fa0ce4a530`

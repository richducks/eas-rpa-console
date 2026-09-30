# 0.27.1 大窗口布局与桌面图标验收

## 1. 大窗口布局

目标：窗口最大化或进入超宽屏后，内部布局必须跟随视口扩展，不再把内容固定在中央窄列并留下大块黑色空区。

实测使用打包后的 Electron `linux-unpacked`，深色主题，读取本机配置副本，截图仅保存在本地 `artifacts/`，不提交真实账号数据。

| 场景 | viewport | main | workspace | 横向溢出 | 布局 |
|---|---:|---:|---:|---|---|
| 大窗口 | 1869×1010 | 1869px | 680px 高 | 无 | 355px + 1352px 双栏 |
| 普通窗口 | 1156×680 | 1156px | 538px 高 | 无 | 254px + 826px 双栏 |
| 窄窗口 | 420×620 | 420px | 854px 高 | 无 | 392px 单栏 |

验收结果：

- [x] `main` 不再设置固定最大宽度，跟随视口 100% 扩展。
- [x] 1400px 以上采用独立宽屏规则，数据中心栏与账号栏重新分配宽度。
- [x] 工作区最小高度随视口高度变化，减少最大化后的底部黑色空区。
- [x] 窄窗口仍保持单栏，不引入横向滚动。
- [x] 大/普通/窄三档 `scrollWidth <= viewportWidth`。

## 2. 用户指定桌面图标

图标源：用户在本次对话上传的第二张蓝色 EAS 蝴蝶图片。未重新生成、未重绘，只为桌面主题兼容生成标准尺寸缩放副本。

- 原始源：`build/icon.png`，1254×1254 RGBA。
- 原始 PNG 文件 SHA-256：`37b475814389782e848af9a3718e28395ab1f47e065967a207c3af3a2d3cd9bf`。
- 与本次上传第二张图片的 RGBA 像素 SHA-256 一致：`ce77f37f12c3171d06c35900564128f16331a1675dda9b620febec881e398ed8`。
- Linux 标准尺寸：16 / 32 / 48 / 64 / 128 / 256 / 512 / 1024 px。
- Windows 构建显式使用 `build/icon.png`。
- Electron 窗口运行时使用 `build/icons/512x512.png`。

Deb 解包验收：

- [x] `.desktop` 中 `Icon=eas-rpa-console`。
- [x] `hicolor` 下存在 16–1024px 八档标准图标。
- [x] `app.asar` 内包含 `/build/icons/512x512.png`。

## 3. 自动化验收

- [x] `npm test`：40 项，39 通过，0 失败；Ubuntu 跳过 Windows DPAPI 实机项。
- [x] `npm run check`：通过。
- [x] `npm run acceptance`：通过。
- [x] `npm audit --omit=dev --audit-level=high`：0 vulnerabilities。
- [x] `git diff --check`：通过。
- [x] `npm run build:linux`：Deb / AppImage / linux-unpacked 构建成功。

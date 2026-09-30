# 0.26.0 验收产物

本机原生 Linux 构建与 UI 验收产物如下。大体积安装包位于本机 `dist/`，不直接提交到 Git；正式发布后由 GitHub Release 提供下载。

```text
bf5d2df2111dd2b1c18ada3e195da8dba72872129c65aaaa02267a4a4c4f875f  dist/EAS-RPA-Console-0.26.0-x86_64.AppImage
71ec0cfb41bc54b3200efd6a61c7b5df63ce91e8030906b040b3b6ae6a80725f  dist/EAS-RPA-Console-0.26.0-amd64.deb
23771f330b1670b3991ae7336156e05016ac67028325da227f01bd5f114fa4c3  docs/screenshots/acceptance-first-run.png
51e074301a88a1795ffc7e4ed848fee8bf132cb7d723aa21c710a8acb5a186a4  docs/screenshots/acceptance-first-run-dark.png
e3a92dff7f0cbb35bb28a570f7b0a54aeb808979858ae85bd1a06115c5fdfb0e  docs/screenshots/acceptance-diagnostics.png
aef03181fa455b9f42bdb3719d4dde60f4efce76a5403dc3117fe374d7b12ce4  docs/screenshots/acceptance-settings.png
```

## 可打开性

- `EAS-RPA-Console-0.26.0-x86_64.AppImage`：已从全新配置目录启动并截图。
- `EAS-RPA-Console-0.26.0-amd64.deb`：已解包到临时安装根目录，并从 `/opt/EAS自动登录中心/eas-rpa-console` 启动截图。
- `dist/linux-unpacked/eas-rpa-console`：已启动截图。
- 上述三种入口的首次打开截图 SHA-256 相同：`5f65d0931c8ecb1fdfbf2e6b6d7b48f238c69a1b943ba62baba0b240a06f8bf2`。

截图测试使用隔离的 Xvfb 会话；由于未执行系统级安装设置 SUID sandbox 权限，仅截图进程使用 `--no-sandbox`。正式安装包本身没有关闭 Electron sandbox。

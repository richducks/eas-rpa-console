# 独立仓库迁移说明

## 迁移目标

原先散落在 `kingdee-eas` 工作区中的 EAS RPA 自动登录项目，现统一维护在：

```text
/home/sducks/Documents/CodexProjects/kingdee-eas-rpa
```

GitHub 仓库：`https://github.com/richducks/eas-rpa-console`

## 当前主线

- 分支：`main`
- 当前源码版本：`0.24.0`
- 用途：Linux / Windows 金蝶 EAS Cloud 多账号自动登录控制台
- Git 历史：继承 GitHub 原有 `v0.20.0` 历史后继续演进，没有重建或覆盖远端历史
- 0.24.0：Windows / Linux 主线完成平台适配层重构，`src/platform` 统一承载 OS 差异

## 历史快照

旧工作区中的两份临时备份没有继续堆放在主分支，而是保存到独立归档分支：

```text
archive/local-backups-2026-09-29
```

其中包含：

- `2026-09-29-linux-before-win-merge`：Windows 合并前的 Linux 关键源码备份
- `2026-09-29-windows-test`：Windows 实机测试阶段快照，版本 `0.21.2`

这些内容仅用于回退和对比，不作为日常开发目录。

## 不迁移的内容

以下内容属于依赖、构建产物或运行时数据，不作为源码迁移：

- `node_modules/`
- `dist/`
- `logs/`
- `artifacts/`
- 本机 `config.yaml`
- `.env`

依赖统一由 `package-lock.json` 恢复。

## 日常版本管理

```bash
cd /home/sducks/Documents/CodexProjects/kingdee-eas-rpa

git status
git pull --ff-only
npm ci
npm test
npm run check

git add -A
git commit -m "说明本次修改"
git push
```

查看历史版本：

```bash
git log --oneline --decorate --graph --all
git tag --list
git branch -a
```

查看旧快照但不修改当前主线：

```bash
git switch archive/local-backups-2026-09-29
```

返回当前开发分支：

```bash
git switch main
```

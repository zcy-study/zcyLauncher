# zcyGal 启动器

本地 galgame 库启动器：展示游戏、启动、记录时长、截图。

Electron + 原生 JavaScript（主进程 / 渲染进程都是 CommonJS，无框架、无打包步骤），
数据落在一个 `library.json` 里。

## 目录结构

```
app/
  main/       主进程：窗口、Store、进程追踪、截图、元数据抓取、鼠标钩子
  preload.js  contextIsolation 下的 IPC 白名单
  renderer/   界面：原生 JS + CSS + HTML，无构建
assets/       应用图标（ico / png）
使用说明.txt   面向使用者的功能说明
```

## 功能

- 游戏库：封面网格 / 沉浸布局、搜索、排序、标签、备注
- 启动与计时：目录/进程/进程名三种追踪方式，崩溃恢复，时长统计
- 桌面时钟：启动游戏时顺带拉起，退出游戏时自动关闭
- 启动密码：毛玻璃锁屏，多密码、提示、密码管理
- 截图：鼠标侧键 / 快捷键触发，预览后保存到游戏目录下的「我的截图」，
  支持整图复制与框选裁剪复制

## 本地运行

仓库里**不包含运行时**（`runtime/` 是 357MB 的 Electron 二进制）。要跑起来：

1. 安装 `app` 的依赖：`cd app && npm install`
2. 把 Electron 运行时放到 `runtime/`，可执行文件名 `zcyGal.exe`
3. 双击 `runtime/zcyGal.exe`（它默认加载同级的 `app/` 目录）

`data/` 也不在仓库内，首次运行会自动创建。

## 平台

仅 Windows。用到了 `uiohook-napi`（全局鼠标侧键）与 `taskkill`（关闭时钟进程）。

# 新媒体工作台 · Windows 桌面版

个人自用的本地新媒体发布工具：统一管理内容与账号，通过浏览器自动化完成重复发布操作，不依赖平台开放 API。

## 技术栈

Electron + React + TypeScript + Vite（electron-vite）+ Tailwind CSS + Zustand。
SQLite（Drizzle ORM）与 Playwright 浏览器自动化将在 Phase 2 / 3 接入。

## 开发

```bash
cd desktop
npm install
npm run dev      # 启动应用（开发模式，热更新）
npm run build    # 产出 out/ 主进程与渲染层构建
npm run typecheck
npm run lint
```

## 数据目录

所有本地数据保存在 `%APPDATA%\NewMediaWorkbench\`：

```
NewMediaWorkbench/
├── database/           # SQLite（Phase 2）
├── browser-profiles/   # Playwright 持久化登录状态（Phase 3）
│   ├── douyin-main/
│   ├── xiaohongshu-main/
│   └── bilibili-main/
├── media/
├── logs/
│   └── screenshots/
└── cache/
```

## 路线图

- **Phase 1（已完成）**：Electron 应用窗口、侧边栏导航、Dashboard、路由、主题（明/暗/跟随系统）、发布确认模式设置。
- **Phase 2（已完成）**：SQLite + Drizzle，五张表（accounts / content / publish_tasks / publish_logs / settings），Dashboard 实时数据，内容库拖拽导入。
- **Phase 3（已完成）**：BrowserProfileManager——Profile 创建/重命名/删除、Playwright persistent context 启动与关闭、防重复启动、异常退出标记、退出时关闭全部浏览器、账号管理页 Profile UI。
- **Phase 4（已完成）**：PlatformAdapter 统一接口 + DouyinAdapter——抖音登录状态检测（creator.douyin.com）、账号绑定 Profile（1:1，删除防孤儿）、账号卡 UI 与人工登录/安全验证等待流程、开发调试面板。
- **Phase 5（已完成）**：Douyin Publisher——状态机驱动的发布执行（检查浏览器→登录→打开发布页→选视频→上传→等待上传→填标题/文案/话题→封面→人工确认→发布），失败截图/日志/错误码、暂停/继续/取消、任务页时间线 UI。
- **Phase 5.1（已完成）**：真实抖音创作者中心实机验证（登录墙识别 PASS；逐步诊断 JSONL + 每步截图）。
- **Phase 6（已完成）**：本地发布调度器——定时发布（1s tick 检查到期任务）、优先级 HIGH/NORMAL/LOW、失败自动重试（30s/2min/5min 退避，最多 3 次）、全局单任务执行、重启恢复、任务中心统计与定时/优先级编辑。
- **Phase 7（已完成）**：批量发布——内容库多选 × 多抖音账号批量生成任务（矩阵展开、自动跳过重复/不可发布组合）、批量定时、选择模式 UI。
- **Phase 8（已完成）**：AI 内容助手——OpenAI-compatible 接口（OpenAI/DeepSeek/Kimi 等），设置页配置与测试连接；编辑内容时按主题生成标题（3 选 1）/文案/话题/封面文案，一键应用。Key 只存本地，AI 仅生成内容绝不发布。
- **Phase 9（已完成）**：小红书 / B站 / 视频号适配器——登录检测全部经真实创作者中心页面验证（登录墙 / URL 重定向双信号）；账号绑定与登录状态检测四平台可用（发布执行目前仍仅抖音）。素材库——视频/图片/音频/字体分类管理，拖拽导入、搜索、收藏、系统预览、删除（原文件保留）。
- **Phase 10（已完成）**：打包发行——electron-builder 产出 NSIS 安装包 + 便携版（`release/`），单实例锁、迁移随包分发、系统 Edge 回退（目标机器无需安装 Playwright 浏览器）。
- **自定义平台接口（已完成）**：设置名称 + 创作者中心地址即可接入任意平台——绑定 Profile、URL 重定向登录检测、一键打开创作者中心手动发文；四平台登录检测 + 素材库 + 数据记录页全部可用。
- **Phase 11（候选）**：自定义平台发布步骤实机校准；自动更新；多账号并发实验。
- **Phase 6**：PublishQueue 任务队列（暂停 / 继续 / 取消 / 重试）。
- **Phase 7**：批量任务（多内容 × 多平台）。
- **Phase 8**：AI 内容助手（标题 / 文案 / 话题）。
- **Phase 9**：小红书、B站、视频号适配器。

## 打包发行

```bash
cd desktop
npm run dist:dir   # 仅产出未打包目录（快速自测）：release/win-unpacked/NewMediaWorkbench.exe
npm run dist       # 产出 NSIS 安装包 + 便携版：release/*.exe
```

要点：

- Playwright Chromium 不随包分发；目标机器缺浏览器时自动回退系统 Microsoft Edge（Win11 自带）。
- Drizzle 迁移通过 extraResources 随包分发到 `resources/migrations`。
- better-sqlite3 使用与 Electron ABI 匹配的预编译产物（`npmRebuild: false`），无需本机构建工具链。
- 应用为单实例锁：重复启动会唤起已有窗口。
- 安装包体积约 128 MB（Electron 运行时 + 应用 + 原生模块）。

## 安全原则

- 不保存账号密码、验证码、Cookie 到数据库；登录状态只存在于本地浏览器 Profile。
- 遇到验证码、二次验证、风控立即暂停任务，由用户在浏览器中手动完成。
- 默认不点击最终发布按钮，需用户确认（可在设置中切换）。
- 不绕过任何平台授权与风控机制。

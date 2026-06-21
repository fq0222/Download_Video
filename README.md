# Download Video WebUI

这是一个基于本地 `yt-dlp.exe` 的视频下载 WebUI。用户可以在浏览器中填写视频链接，勾选常用下载参数，点击下载后在页面中查看实时进度和日志。

## 项目组成

- `src/server.ts`：Express 后端入口，提供下载任务 API、健康检查接口和生产环境静态文件托管。
- `src/downloadManager.ts`：下载任务管理器，负责启动 `yt-dlp.exe`、取消下载、解析实时进度、推送 SSE 事件。
- `src/ytDlpCommand.ts`：把页面参数转换为安全的 `yt-dlp` 参数数组。
- `src/processOutput.ts`：处理 `yt-dlp` 输出编码，兼容 Windows 中文日志。
- `client/`：Vue 3 + Vite 前端页面。
- `bin/`：本地二进制工具目录，需要放置 `yt-dlp.exe`、`ffmpeg.exe`、`ffprobe.exe` 等文件。
- `downloads/`：默认下载输出目录，运行时自动创建，已加入 `.gitignore`。

## 使用到的第三方项目资源

本项目的下载能力依赖以下外部项目提供的本地可执行文件：

- `yt-dlp.exe`：来自 [yt-dlp](https://github.com/yt-dlp/yt-dlp)，用于解析和下载视频。
- `ffmpeg.exe`、`ffprobe.exe`、`ffplay.exe`：来自 [FFmpeg](https://ffmpeg.org/)，用于音视频合并、转码和媒体信息处理。

这些二进制文件体积较大，并且可能随平台变化，当前不会提交到 git。请在本地手动放入 `bin/` 目录。

## 本地运行

### 1. 安装依赖

```powershell
npm install
```

### 2. 准备本地工具

确认以下文件存在：

```text
bin/yt-dlp.exe
bin/ffmpeg.exe
bin/ffprobe.exe
```

`ffplay.exe` 不是必须项，但如果你的 FFmpeg 包中已有，可以一并放在 `bin/`。

### 3. 构建前后端

```powershell
npm run build
```

### 4. 启动服务

```powershell
npm start
```

启动后访问：

```text
http://127.0.0.1:3000
```

## 开发模式

开发时可以同时启动后端和 Vite 前端：

```powershell
npm run dev
```

默认地址：

- 前端开发服务：`http://127.0.0.1:5173`
- 后端 API 服务：`http://127.0.0.1:3000`

## 常用功能

页面支持以下常用参数：

- 视频链接输入
- 代理地址，例如 `http://127.0.0.1:7897`
- 限制最高画质，例如 1080p
- 合并输出格式，例如 mp4
- 音频转 AAC
- 自定义 User-Agent
- 从浏览器读取 cookies，例如 Chrome
- 自定义输出文件名或输出模板
- 实时下载进度和日志
- 取消下载任务

## 测试

```powershell
npm test
```

## 输出目录

下载文件默认保存到：

```text
downloads/
```

该目录已加入 `.gitignore`，不会提交到仓库。

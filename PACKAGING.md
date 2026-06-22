# Windows 打包说明

本项目可以打包成一个便携发布目录，双击 `DownloadVideo.exe` 后会启动本地 WebUI，并自动打开默认浏览器。

## 打包命令

```powershell
npm run package:win
```

打包完成后会生成：

```text
release/DownloadVideo/
  DownloadVideo.exe
  bin/
    yt-dlp.exe
    ffmpeg.exe
    ffprobe.exe
  dist/
    client/
  downloads/
```

## 使用方式

双击：

```text
release/DownloadVideo/DownloadVideo.exe
```

程序会监听本机地址并打开浏览器：

```text
http://127.0.0.1:3000
```

下载文件默认保存到发布目录下的 `downloads/`。

## 注意事项

- `bin/` 目录需要包含 `yt-dlp.exe`、`ffmpeg.exe`、`ffprobe.exe`。
- 如果 `3000` 端口被占用，可以在命令行中设置 `PORT` 后再启动 exe。
- 当前方案是“一个主 exe + 必要资源目录”的便携包，稳定性优先于严格单文件。

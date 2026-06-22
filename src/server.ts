import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import type { Server } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DownloadManager, getRuntimeLabel } from './downloadManager.js';
import { openDirectory, resolveRuntimePaths, type RuntimePaths } from './runtime.js';
import type { DownloadRequest } from './types.js';

/** Web 服务启动参数。 */
interface StartServerOptions {
  /** 运行时路径配置；未传入时自动按当前环境解析。 */
  paths?: RuntimePaths;
  /** HTTP 服务监听端口。 */
  port?: number;
  /** HTTP 服务监听主机。 */
  host?: string;
  /** 服务开始监听后触发的回调。 */
  onListening?: (details: { url: string; port: number; paths: RuntimePaths }) => void;
}

/**
 * 启动 Download Video WebUI 的 HTTP 服务。
 *
 * @param options 服务启动参数。
 * @returns 已启动的 HTTP Server 实例。
 */
export function startServer(options: StartServerOptions = {}): Server {
  const paths = options.paths ?? resolveRuntimePaths();
  const port = options.port ?? Number(process.env.PORT ?? 3000);
  const host = options.host ?? '127.0.0.1';

  if (!fs.existsSync(paths.ytDlpPath)) {
    console.warn(`[startup] yt-dlp executable not found at ${paths.ytDlpPath}`);
  }

  const manager = new DownloadManager(paths.ytDlpPath, paths.downloadDir);
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  // 健康检查路由：返回服务状态和本地运行路径。
  app.get('/api/health', (_request, response) => {
    response.json({
      ok: true,
      runtime: getRuntimeLabel(),
      ytDlpPath: paths.ytDlpPath,
      downloadDir: paths.downloadDir
    });
  });

  // 下载任务列表路由：返回当前内存中的任务快照。
  app.get('/api/downloads', (_request, response) => {
    response.json(manager.listJobs());
  });

  // 打开下载目录路由：由服务端调用系统文件管理器打开保存目录。
  app.post('/api/download-directory/open', (_request, response) => {
    const requestId = crypto.randomUUID();
    console.log('[api] open download directory request', {
      requestId,
      downloadDir: paths.downloadDir
    });

    try {
      fs.mkdirSync(paths.downloadDir, { recursive: true });
      const child = openDirectory(paths.downloadDir);
      console.log('[api] open download directory spawned', {
        requestId,
        pid: child.pid ?? null,
        downloadDir: paths.downloadDir
      });

      child.on('error', (error) => {
        console.error('[api] open download directory process error', {
          requestId,
          pid: child.pid ?? null,
          message: error.message
        });
      });

      child.on('close', (code, signal) => {
        console.log('[api] open download directory process closed', {
          requestId,
          pid: child.pid ?? null,
          code,
          signal
        });
      });

      response.json({
        ok: true,
        path: paths.downloadDir,
        pid: child.pid ?? null,
        requestId
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '打开下载目录失败';
      console.error('[api] open download directory failed', {
        requestId,
        message
      });
      response.status(500).json({ message, requestId });
    }
  });

  // 创建下载任务路由：根据前端表单参数启动新的 yt-dlp 下载进程。
  app.post('/api/downloads', (request, response) => {
    try {
      const body = request.body as DownloadRequest;
      console.log('[api] creating download job', {
        url: body.url,
        proxyEnabled: body.proxyEnabled,
        cookiesFromBrowserEnabled: body.cookiesFromBrowserEnabled,
        outputEnabled: body.outputEnabled
      });
      const job = manager.createJob(body);
      response.status(201).json(job);
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建下载任务失败';
      console.error('[api] create job failed', message);
      response.status(400).json({ message });
    }
  });

  // 取消下载任务路由：终止正在运行的任务并返回最新任务快照。
  app.delete('/api/downloads/:id', (request, response) => {
    const job = manager.cancelJob(request.params.id);
    if (!job) {
      response.status(404).json({ message: '下载任务不存在' });
      return;
    }
    response.json(job);
  });

  // 单任务事件流路由：通过 SSE 推送实时下载进度。
  app.get('/api/downloads/:id/events', (request, response) => {
    const id = request.params.id;
    const job = manager.getJob(id);

    if (!job) {
      response.status(404).json({ message: '下载任务不存在' });
      return;
    }

    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    });

    const send = (snapshot: unknown): void => {
      response.write(`data: ${JSON.stringify(snapshot)}\n\n`);
    };

    console.log(`[sse:${id}] client connected`);
    send(job);
    const unsubscribe = manager.subscribe(id, send);

    request.on('close', () => {
      console.log(`[sse:${id}] client disconnected`);
      unsubscribe();
    });
  });

  if (fs.existsSync(paths.clientDistDir)) {
    // 前端静态资源路由：生产环境下托管 Vite 构建产物。
    app.use(express.static(paths.clientDistDir));
    // 前端回退路由：让刷新页面或直接访问子路径时仍返回入口 HTML。
    app.get('*', (_request, response) => {
      response.sendFile(path.join(paths.clientDistDir, 'index.html'));
    });
  }

  const server = app.listen(port, host, () => {
    const address = server.address();
    const resolvedPort = typeof address === 'object' && address ? address.port : port;
    const url = `http://${host}:${resolvedPort}`;

    console.log(`[startup] Download Video WebUI server listening at ${url}`);
    console.log(`[startup] app root: ${paths.appRoot}`);
    console.log(`[startup] yt-dlp path: ${paths.ytDlpPath}`);
    console.log(`[startup] download directory: ${paths.downloadDir}`);
    options.onListening?.({ url, port: resolvedPort, paths });
  });

  return server;
}

const entryPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (entryPath === import.meta.url) {
  startServer();
}

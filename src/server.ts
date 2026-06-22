import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import type { Server } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DownloadManager, getRuntimeLabel } from './downloadManager.js';
import { resolveRuntimePaths, type RuntimePaths } from './runtime.js';
import type { DownloadRequest } from './types.js';

interface StartServerOptions {
  paths?: RuntimePaths;
  port?: number;
  host?: string;
  onListening?: (details: { url: string; port: number; paths: RuntimePaths }) => void;
}

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

  app.get('/api/health', (_request, response) => {
    response.json({
      ok: true,
      runtime: getRuntimeLabel(),
      ytDlpPath: paths.ytDlpPath,
      downloadDir: paths.downloadDir
    });
  });

  app.get('/api/downloads', (_request, response) => {
    response.json(manager.listJobs());
  });

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

  app.delete('/api/downloads/:id', (request, response) => {
    const job = manager.cancelJob(request.params.id);
    if (!job) {
      response.status(404).json({ message: '下载任务不存在' });
      return;
    }
    response.json(job);
  });

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
    app.use(express.static(paths.clientDistDir));
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

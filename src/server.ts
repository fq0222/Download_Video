import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { DownloadManager, getRuntimeLabel, resolveDownloadDir } from './downloadManager.js';
import type { DownloadRequest } from './types.js';

const projectRoot = process.cwd();
const ytDlpPath = path.join(projectRoot, 'bin', 'yt-dlp.exe');
const downloadDir = resolveDownloadDir(projectRoot);
const clientDistDir = path.join(projectRoot, 'dist', 'client');
const port = Number(process.env.PORT ?? 3000);

if (!fs.existsSync(ytDlpPath)) {
  console.warn(`[startup] yt-dlp executable not found at ${ytDlpPath}`);
}

const manager = new DownloadManager(ytDlpPath, downloadDir);
const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    runtime: getRuntimeLabel(),
    ytDlpPath,
    downloadDir
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

if (fs.existsSync(clientDistDir)) {
  app.use(express.static(clientDistDir));
  app.get('*', (_request, response) => {
    response.sendFile(path.join(clientDistDir, 'index.html'));
  });
}

app.listen(port, '127.0.0.1', () => {
  console.log(`[startup] Download Video WebUI server listening at http://127.0.0.1:${port}`);
  console.log(`[startup] yt-dlp path: ${ytDlpPath}`);
  console.log(`[startup] download directory: ${downloadDir}`);
});

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { YtDlpOutputDecoder, type YtDlpOutputEncoding } from './processOutput.js';
import type { DownloadJobSnapshot, DownloadProgress, DownloadRequest, DownloadStatus } from './types.js';
import { YtDlpCommandBuilder } from './ytDlpCommand.js';

export interface ProcessKillCommand {
  file: string;
  args: string[];
}

/**
 * 下载任务的内部可变状态。
 */
interface DownloadJobState extends DownloadJobSnapshot {
  /** 当前任务关联的子进程。 */
  child?: ChildProcessWithoutNullStreams;
}

/**
 * 管理 yt-dlp 下载任务，并为 WebUI 提供不可变的任务快照。
 */
export class DownloadManager {
  private readonly jobs = new Map<string, DownloadJobState>();
  private readonly events = new EventEmitter();

  /**
   * 创建绑定到本地 yt-dlp 可执行文件和下载目录的管理器。
   *
   * @param ytDlpPath bin/yt-dlp.exe 的绝对路径。
   * @param downloadDir yt-dlp 子进程使用的工作目录。
   * @param builder 命令参数构造器。
   */
  constructor(
    private readonly ytDlpPath: string,
    private readonly downloadDir: string,
    private readonly builder = new YtDlpCommandBuilder()
  ) {
    this.events.setMaxListeners(200);
  }

  /**
   * 创建并立即启动一个下载任务。
   *
   * @param request 用户在 WebUI 中选择的下载参数。
   * @returns 初始任务快照。
   */
  createJob(request: DownloadRequest): DownloadJobSnapshot {
    fs.mkdirSync(this.downloadDir, { recursive: true });

    const args = this.builder.buildArgs(request);
    const id = crypto.randomUUID();
    const job: DownloadJobState = {
      id,
      status: 'queued',
      request,
      args,
      commandPreview: this.builder.buildPreviewCommand(this.ytDlpPath, args),
      logs: [],
      progress: {},
      createdAt: new Date().toISOString()
    };

    this.jobs.set(id, job);
    console.log(`[download:${id}] queued ${job.commandPreview}`);
    this.startJob(job);
    return this.snapshot(job);
  }

  /**
   * 获取所有已知任务，按创建时间倒序排列。
   *
   * @returns 任务快照列表。
   */
  listJobs(): DownloadJobSnapshot[] {
    return [...this.jobs.values()]
      .map((job) => this.snapshot(job))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * 根据任务 ID 获取单个任务。
   *
   * @param id 任务 ID。
   * @returns 找到任务时返回任务快照。
   */
  getJob(id: string): DownloadJobSnapshot | undefined {
    const job = this.jobs.get(id);
    return job ? this.snapshot(job) : undefined;
  }

  /**
   * 取消正在运行的下载任务。
   *
   * @param id 任务 ID。
   * @returns 任务存在时返回更新后的快照。
   */
  cancelJob(id: string): DownloadJobSnapshot | undefined {
    const job = this.jobs.get(id);
    if (!job) {
      return undefined;
    }

    if (job.status === 'running' && job.child) {
      console.log(`[download:${id}] cancelling process`);
      job.status = 'cancelled';
      this.appendLog(job, '正在取消下载任务...');
      this.terminateJobProcess(job);
      this.emit(job);
    }

    return this.snapshot(job);
  }

  /**
   * 订阅单个任务的状态更新。
   *
   * @param id 任务 ID。
   * @param listener 任务变化时触发的监听函数。
   * @returns 用于移除监听的清理函数。
   */
  subscribe(id: string, listener: (job: DownloadJobSnapshot) => void): () => void {
    const eventName = this.eventName(id);
    this.events.on(eventName, listener);
    return () => this.events.off(eventName, listener);
  }

  /**
   * 为排队任务启动 yt-dlp 子进程。
   *
   * @param job 可变任务状态。
   */
  private startJob(job: DownloadJobState): void {
    job.status = 'running';
    job.startedAt = new Date().toISOString();
    this.appendLog(job, `开始下载，输出目录：${this.downloadDir}`);

    const env = buildYtDlpEnvironment(this.ytDlpPath, process.env);

    const child = spawn(this.ytDlpPath, job.args, {
      cwd: this.downloadDir,
      env
    });

    job.child = child;
    const outputEncoding = resolveYtDlpOutputEncoding(process.env);
    const stdoutDecoder = new YtDlpOutputDecoder(outputEncoding);
    const stderrDecoder = new YtDlpOutputDecoder(outputEncoding);
    console.log(`[download:${job.id}] spawned pid=${child.pid ?? 'unknown'}`);
    console.log(`[download:${job.id}] output encoding=${outputEncoding}`);
    this.emit(job);

    child.stdout.on('data', (chunk: Buffer) => this.handleOutput(job, stdoutDecoder.write(chunk)));
    child.stderr.on('data', (chunk: Buffer) => this.handleOutput(job, stderrDecoder.write(chunk)));

    child.on('error', (error) => {
      console.error(`[download:${job.id}] spawn error`, error);
      job.status = 'failed';
      job.errorMessage = error.message;
      job.endedAt = new Date().toISOString();
      this.appendLog(job, `启动失败：${error.message}`);
      this.emit(job);
    });

    child.on('close', (code) => {
      this.handleOutput(job, stdoutDecoder.end());
      this.handleOutput(job, stderrDecoder.end());
      if (job.status !== 'cancelled') {
        job.status = code === 0 ? 'completed' : 'failed';
      }
      job.exitCode = code;
      job.endedAt = new Date().toISOString();
      this.appendLog(job, `进程结束，退出码：${code ?? 'null'}`);
      console.log(`[download:${job.id}] closed code=${code} status=${job.status}`);
      this.emit(job);
    });
  }

  /**
   * 终止任务关联的子进程；Windows 下会终止整棵进程树。
   *
   * @param job 可变任务状态。
   */
  private terminateJobProcess(job: DownloadJobState): void {
    const pid = job.child?.pid;
    const killCommand = buildProcessTreeKillCommand(pid);

    if (!job.child) {
      return;
    }

    if (!killCommand) {
      job.child.kill('SIGTERM');
      return;
    }

    console.log(`[download:${job.id}] killing process tree pid=${pid}`);
    const killer = spawn(killCommand.file, killCommand.args, {
      stdio: 'ignore',
      windowsHide: true
    });

    killer.on('error', (error) => {
      console.error(`[download:${job.id}] taskkill failed`, error);
      job.child?.kill('SIGTERM');
    });

    killer.on('close', (code) => {
      console.log(`[download:${job.id}] taskkill closed code=${code}`);
    });
  }

  /**
   * 解析 yt-dlp 输出文本，并保存有用的进度字段。
   *
   * @param job 可变任务状态。
   * @param text 已解码的 stdout 或 stderr 文本。
   */
  private handleOutput(job: DownloadJobState, text: string): void {
    const lines = text
      .split(/\r|\n/u)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      this.appendLog(job, line);
      const progress = this.parseProgressLine(line);
      if (progress.percent !== undefined || progress.speed || progress.eta) {
        job.progress = progress;
      }
      console.log(`[download:${job.id}] ${line}`);
    }

    this.emit(job);
  }

  /**
   * 从常见 yt-dlp 下载日志中提取百分比、速度和 ETA。
   *
   * @param line 单行归一化后的 yt-dlp 输出。
   * @returns 解析后的进度数据。
   */
  private parseProgressLine(line: string): DownloadProgress {
    const percentMatch = line.match(/\[download\]\s+([\d.]+)%/u);
    const speedMatch = line.match(/\bat\s+([^\s]+\/s)/u);
    const etaMatch = line.match(/\bETA\s+([^\s]+)/u);
    return {
      percent: percentMatch ? Number(percentMatch[1]) : undefined,
      speed: speedMatch?.[1],
      eta: etaMatch?.[1],
      line
    };
  }

  /**
   * 追加日志行，并限制内存中保留的日志数量。
   *
   * @param job 可变任务状态。
   * @param line 需要保存的日志行。
   */
  private appendLog(job: DownloadJobState, line: string): void {
    appendJobLogLine(job.logs, line);
  }

  /**
   * 发送克隆后的任务快照，避免监听方修改内部状态。
   *
   * @param job 可变任务状态。
   */
  private emit(job: DownloadJobState): void {
    this.events.emit(this.eventName(job.id), this.snapshot(job));
  }

  /**
   * 将可变任务状态转换为不可变的响应对象。
   *
   * @param job 可变任务状态。
   * @returns 可安全序列化为 JSON 的任务快照。
   */
  private snapshot(job: DownloadJobState): DownloadJobSnapshot {
    return {
      id: job.id,
      status: job.status as DownloadStatus,
      request: { ...job.request },
      args: [...job.args],
      commandPreview: job.commandPreview,
      logs: [...job.logs],
      progress: { ...job.progress },
      exitCode: job.exitCode,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      endedAt: job.endedAt
    };
  }

  /**
   * 构造任务对应的私有 EventEmitter 事件名。
   *
   * @param id 任务 ID。
   * @returns 事件名。
   */
  private eventName(id: string): string {
    return `job:${id}`;
  }
}

/**
 * 解析应用默认下载目录。
 *
 * @param projectRoot 仓库根目录。
 * @returns 下载目录绝对路径。
 */
export function resolveDownloadDir(projectRoot: string): string {
  return path.join(projectRoot, 'downloads');
}

/**
 * 返回用于启动日志展示的平台标签。
 *
 * @returns 平台和 CPU 架构字符串。
 */
export function getRuntimeLabel(): string {
  return `${os.platform()}-${os.arch()}`;
}

/**
 * 构造 yt-dlp 子进程环境变量。
 *
 * @param ytDlpPath yt-dlp.exe 的绝对路径。
 * @param baseEnv 父进程环境变量。
 * @returns 适合传给 spawn 的环境变量对象。
 */
export function buildYtDlpEnvironment(
  ytDlpPath: string,
  baseEnv: NodeJS.ProcessEnv
): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    PATH: `${path.dirname(ytDlpPath)}${path.delimiter}${baseEnv.PATH ?? ''}`,
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1'
  };
}

/**
 * 解析 yt-dlp 输出日志应该使用的文本编码。
 *
 * @param baseEnv 父进程环境变量。
 * @returns 用于解码 stdout/stderr 的编码。
 */
export function resolveYtDlpOutputEncoding(baseEnv: NodeJS.ProcessEnv): YtDlpOutputEncoding {
  if (baseEnv.YT_DLP_OUTPUT_ENCODING === 'utf-8' || baseEnv.YT_DLP_OUTPUT_ENCODING === 'gb18030') {
    return baseEnv.YT_DLP_OUTPUT_ENCODING;
  }

  return 'utf-8';
}

/**
 * 构造用于终止进程树的系统命令。
 *
 * @param pid 需要终止的父进程 ID。
 * @param platform 当前运行平台。
 * @returns Windows 下的 taskkill 命令；无法构造时返回 undefined。
 */
export function buildProcessTreeKillCommand(
  pid: number | undefined,
  platform: NodeJS.Platform = process.platform
): ProcessKillCommand | undefined {
  if (!Number.isInteger(pid) || !pid || pid <= 0) {
    return undefined;
  }

  if (platform === 'win32') {
    return {
      file: 'taskkill',
      args: ['/pid', String(pid), '/t', '/f']
    };
  }

  return undefined;
}

/**
 * 追加任务日志；连续的下载进度行会复用同一个日志位置。
 *
 * @param logs 当前任务日志数组。
 * @param line 需要追加或替换的日志行。
 * @param maxLines 最多保留的日志行数。
 */
export function appendJobLogLine(logs: string[], line: string, maxLines = 400): void {
  const lastIndex = logs.length - 1;

  if (
    lastIndex >= 0 &&
    isDownloadProgressLogLine(logs[lastIndex]) &&
    isDownloadProgressLogLine(line)
  ) {
    logs[lastIndex] = line;
    return;
  }

  logs.push(line);
  if (logs.length > maxLines) {
    logs.splice(0, logs.length - maxLines);
  }
}

/**
 * 判断日志行是否是 yt-dlp 的下载进度刷新行。
 *
 * @param line 待判断的日志行。
 * @returns 是下载进度刷新行时返回 true。
 */
function isDownloadProgressLogLine(line: string): boolean {
  return /^\[download\]\s+[\d.]+%/u.test(line);
}

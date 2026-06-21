export type DownloadStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * WebUI 创建下载任务时提交的参数。
 */
export interface DownloadRequest {
  /** 需要下载的视频、短链或 m3u8 链接。 */
  url: string;
  /** 是否启用 yt-dlp 的 --proxy 参数。 */
  proxyEnabled?: boolean;
  /** 代理地址，例如 http://127.0.0.1:7897。 */
  proxyUrl?: string;
  /** 是否限制最高视频高度。 */
  maxHeightEnabled?: boolean;
  /** 最高视频高度，例如 1080。 */
  maxHeight?: number;
  /** 是否启用 --merge-output-format 合并输出格式。 */
  mergeOutputFormatEnabled?: boolean;
  /** 合并后的容器格式。 */
  mergeOutputFormat?: 'mp4' | 'mkv' | 'webm';
  /** 是否通过 ffmpeg 后处理把音频转为 AAC。 */
  audioAacEnabled?: boolean;
  /** 是否自定义 User-Agent。 */
  userAgentEnabled?: boolean;
  /** 传给 yt-dlp 的 User-Agent 字符串。 */
  userAgent?: string;
  /** 是否从本机浏览器读取 cookies。 */
  cookiesFromBrowserEnabled?: boolean;
  /** cookies 来源浏览器名称，例如 chrome 或 edge。 */
  cookiesBrowser?: string;
  /** 是否启用 -o 输出文件名或模板。 */
  outputEnabled?: boolean;
  /** 输出文件名或 yt-dlp 输出模板。 */
  outputTemplate?: string;
}

/**
 * 从 yt-dlp 日志中解析出的下载进度。
 */
export interface DownloadProgress {
  /** 下载百分比。 */
  percent?: number;
  /** 当前下载速度。 */
  speed?: string;
  /** 预计剩余时间。 */
  eta?: string;
  /** 产生该进度的原始日志行。 */
  line?: string;
}

/**
 * 返回给前端展示的下载任务快照。
 */
export interface DownloadJobSnapshot {
  /** 任务唯一 ID。 */
  id: string;
  /** 当前任务状态。 */
  status: DownloadStatus;
  /** 创建任务时使用的请求参数。 */
  request: DownloadRequest;
  /** 实际传给 yt-dlp 的参数数组。 */
  args: string[];
  /** 只用于页面展示的命令预览。 */
  commandPreview: string;
  /** 最近保留的任务日志。 */
  logs: string[];
  /** 最新下载进度。 */
  progress: DownloadProgress;
  /** 子进程退出码。 */
  exitCode?: number | null;
  /** 任务失败时的错误信息。 */
  errorMessage?: string;
  /** 任务创建时间。 */
  createdAt: string;
  /** 任务开始时间。 */
  startedAt?: string;
  /** 任务结束时间。 */
  endedAt?: string;
}

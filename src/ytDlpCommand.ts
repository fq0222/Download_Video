import type { DownloadRequest } from './types.js';

const DEFAULT_MAX_HEIGHT = 1080;
const DEFAULT_MERGE_FORMAT = 'mp4';

/**
 * 为本地 yt-dlp 可执行文件构造安全的参数数组。
 *
 * 构造器不会返回用于执行的 shell 命令字符串。调用方应把返回的数组直接
 * 传给 child_process.spawn，避免用户输入被 shell 解释。
 */
export class YtDlpCommandBuilder {
  /**
   * 将 Web 表单请求转换为 yt-dlp 命令参数。
   *
   * @param request 用户在 WebUI 中选择的下载参数。
   * @returns 可传给 spawn(file, args) 的有序 yt-dlp 参数列表。
   */
  buildArgs(request: DownloadRequest): string[] {
    const args: string[] = [];
    const url = request.url.trim();

    if (!url) {
      throw new Error('请输入视频链接');
    }

    if (request.proxyEnabled) {
      args.push('--proxy', this.requireText(request.proxyUrl, '请填写代理地址'));
    }

    if (request.userAgentEnabled) {
      args.push('--user-agent', this.requireText(request.userAgent, '请填写 User-Agent'));
    }

    if (request.cookiesFromBrowserEnabled) {
      args.push('--cookies-from-browser', this.requireText(request.cookiesBrowser, '请选择 cookies 浏览器'));
    }

    if (request.maxHeightEnabled) {
      const maxHeight = this.requirePositiveInteger(request.maxHeight ?? DEFAULT_MAX_HEIGHT, '最大高度必须是正整数');
      args.push('-f', `bv*[height<=${maxHeight}]+ba/b[height<=${maxHeight}]`);
    }

    if (request.mergeOutputFormatEnabled) {
      args.push('--merge-output-format', request.mergeOutputFormat || DEFAULT_MERGE_FORMAT);
    }

    if (request.audioAacEnabled) {
      args.push('--postprocessor-args', 'ffmpeg:-c:a aac');
    }

    if (request.outputEnabled) {
      args.push('-o', this.requireText(request.outputTemplate, '请填写输出文件名或模板'));
    }

    args.push(url);
    return args;
  }

  /**
   * 生成只用于展示的命令预览，并按 Windows 习惯为参数加引号。
   *
   * @param executable yt-dlp.exe 的绝对路径。
   * @param args 有序参数列表。
   * @returns 用于日志和页面展示的人类可读命令。
   */
  buildPreviewCommand(executable: string, args: string[]): string {
    return [executable, ...args].map((part) => this.quoteForPreview(part)).join(' ');
  }

  /**
   * 确保可选文本字段存在非空值。
   *
   * @param value 待校验的文本值。
   * @param message 字段为空时展示的错误信息。
   * @returns 去除首尾空白后的文本。
   */
  private requireText(value: string | undefined, message: string): string {
    const text = value?.trim();
    if (!text) {
      throw new Error(message);
    }
    return text;
  }

  /**
   * 确保数值选项是正整数。
   *
   * @param value 待校验的数值。
   * @param message 校验失败时展示的错误信息。
   * @returns 已校验的整数。
   */
  private requirePositiveInteger(value: number, message: string): number {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(message);
    }
    return value;
  }

  /**
   * 仅为展示用途给命令片段加引号，实际执行不会使用该字符串。
   *
   * @param value 需要渲染的命令片段。
   * @returns 包含空白字符时加引号后的片段。
   */
  private quoteForPreview(value: string): string {
    if (!/[\s"]/u.test(value)) {
      return value;
    }
    return `"${value.replaceAll('"', '\\"')}"`;
  }
}

import { TextDecoder } from 'node:util';

export type YtDlpOutputEncoding = 'utf-8' | 'gb18030';

/**
 * yt-dlp 输出流解码器。
 *
 * 使用 Node 的流式文本解码器处理 stdout/stderr 数据块，避免中文字符被拆到
 * 两个 chunk 时产生 `�` 替换字符。Windows 下 yt-dlp.exe 常会按中文代码页
 * 输出文件名日志，因此支持 gb18030 解码。
 */
export class YtDlpOutputDecoder {
  private readonly decoder: TextDecoder;

  /**
   * 创建 yt-dlp 输出流解码器。
   *
   * @param encoding 子进程输出使用的文本编码。
   */
  constructor(encoding: YtDlpOutputEncoding = 'utf-8') {
    this.decoder = new TextDecoder(encoding, { fatal: false });
  }

  /**
   * 解码一个输出数据块。
   *
   * @param chunk 子进程输出的原始字节。
   * @returns 已完整解码的文本片段。
   */
  write(chunk: Buffer): string {
    return this.decoder.decode(chunk, { stream: true });
  }

  /**
   * 结束解码并取出剩余文本。
   *
   * @returns 解码器缓存中的剩余文本。
   */
  end(): string {
    return this.decoder.decode();
  }
}

import { describe, expect, it } from 'vitest';
import { YtDlpOutputDecoder } from './processOutput.js';

describe('YtDlpOutputDecoder', () => {
  it('跨数据块解码 UTF-8 中文时不产生替换字符', () => {
    const decoder = new YtDlpOutputDecoder();
    const source = Buffer.from('[download] Destination: 宝可梦中心.mp4\n', 'utf8');
    const firstChunk = source.subarray(0, 26);
    const secondChunk = source.subarray(26);

    const text = decoder.write(firstChunk) + decoder.write(secondChunk) + decoder.end();

    expect(text).toBe('[download] Destination: 宝可梦中心.mp4\n');
    expect(text).not.toContain('�');
  });

  it('可以解码 Windows 中文代码页输出的 yt-dlp 文件名日志', () => {
    const decoder = new YtDlpOutputDecoder('gb18030');
    const source = Buffer.from([
      0x5b, 0x4d, 0x65, 0x72, 0x67, 0x65, 0x72, 0x5d, 0x20,
      0xd6, 0xd8, 0xb0, 0xf5, 0xc6, 0xd8, 0xb9, 0xe2, 0xa3, 0xa1,
      0x43, 0x6c, 0x61, 0x75, 0x64, 0x65, 0xd7, 0xee, 0xc7, 0xbf,
      0x0a
    ]);

    const text = decoder.write(source) + decoder.end();

    expect(text).toBe('[Merger] 重磅曝光！Claude最强\n');
    expect(text).not.toContain('�');
  });
});

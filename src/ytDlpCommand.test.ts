import { describe, expect, it } from 'vitest';
import { YtDlpCommandBuilder } from './ytDlpCommand.js';

describe('YtDlpCommandBuilder', () => {
  it('builds the 1080p YouTube mp4 command with proxy and AAC audio', () => {
    const args = new YtDlpCommandBuilder().buildArgs({
      url: 'https://www.youtube.com/watch?v=5na7eGXFVUk',
      proxyEnabled: true,
      proxyUrl: 'http://127.0.0.1:7897',
      maxHeightEnabled: true,
      maxHeight: 1080,
      mergeOutputFormatEnabled: true,
      mergeOutputFormat: 'mp4',
      audioAacEnabled: true
    });

    expect(args).toEqual([
      '--proxy',
      'http://127.0.0.1:7897',
      '-f',
      'bv*[height<=1080]+ba/b[height<=1080]',
      '--merge-output-format',
      'mp4',
      '--postprocessor-args',
      'ffmpeg:-c:a aac',
      'https://www.youtube.com/watch?v=5na7eGXFVUk'
    ]);
  });

  it('builds the browser-cookie command with user agent and output template', () => {
    const userAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    const args = new YtDlpCommandBuilder().buildArgs({
      url: 'https://v.douyin.com/AMniWt7Irt4/',
      userAgentEnabled: true,
      userAgent,
      cookiesFromBrowserEnabled: true,
      cookiesBrowser: 'chrome',
      outputEnabled: true,
      outputTemplate: '%(title)s.%(ext)s'
    });

    expect(args).toEqual([
      '--user-agent',
      userAgent,
      '--cookies-from-browser',
      'chrome',
      '-o',
      '%(title)s.%(ext)s',
      'https://v.douyin.com/AMniWt7Irt4/'
    ]);
  });

  it('builds a direct m3u8 download command with an exact output name', () => {
    const args = new YtDlpCommandBuilder().buildArgs({
      url: 'https://xgct-video.bzcdn.net/77a61198-4c6f-4f7f-9582-126414f12163/playlist.m3u8',
      outputEnabled: true,
      outputTemplate: '002宝可梦中心大对决.mp4'
    });

    expect(args).toEqual([
      '-o',
      '002宝可梦中心大对决.mp4',
      'https://xgct-video.bzcdn.net/77a61198-4c6f-4f7f-9582-126414f12163/playlist.m3u8'
    ]);
  });

  it('rejects an empty URL before spawning yt-dlp', () => {
    expect(() => new YtDlpCommandBuilder().buildArgs({ url: '   ' })).toThrow('请输入视频链接');
  });
});

import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildProcessTreeKillCommand,
  buildYtDlpEnvironment,
  appendJobLogLine,
  resolveYtDlpOutputEncoding
} from './downloadManager.js';

describe('buildYtDlpEnvironment', () => {
  it('把 yt-dlp 所在目录加入 PATH，方便找到同目录下的 ffmpeg', () => {
    const ytDlpPath = path.join('F:', 'web-project', 'Download_Video', 'bin', 'yt-dlp.exe');
    const env = buildYtDlpEnvironment(ytDlpPath, { PATH: 'C:\\Windows\\System32' });

    expect(env.PATH).toBe(`${path.dirname(ytDlpPath)}${path.delimiter}C:\\Windows\\System32`);
    expect(env.PYTHONIOENCODING).toBeUndefined();
    expect(env.PYTHONUTF8).toBeUndefined();
  });
});

describe('resolveYtDlpOutputEncoding', () => {
  it('允许通过环境变量覆盖 yt-dlp 输出解码编码', () => {
    expect(resolveYtDlpOutputEncoding({ YT_DLP_OUTPUT_ENCODING: 'utf-8' })).toBe('utf-8');
    expect(resolveYtDlpOutputEncoding({ YT_DLP_OUTPUT_ENCODING: 'gb18030' })).toBe('gb18030');
  });
});

describe('buildProcessTreeKillCommand', () => {
  it('在 Windows 下使用 taskkill 终止整个进程树', () => {
    expect(buildProcessTreeKillCommand(1234, 'win32')).toEqual({
      file: 'taskkill',
      args: ['/pid', '1234', '/t', '/f']
    });
  });

  it('进程 ID 无效时不构造终止命令', () => {
    expect(buildProcessTreeKillCommand(undefined, 'win32')).toBeUndefined();
    expect(buildProcessTreeKillCommand(0, 'win32')).toBeUndefined();
  });
});

describe('appendJobLogLine', () => {
  it('连续下载进度日志会替换上一行，避免日志区域不断滚动', () => {
    const logs = [
      '[download]   8.7% of  828.92MiB at   18.18KiB/s ETA 11:51:38'
    ];

    appendJobLogLine(logs, '[download]   8.9% of  828.92MiB at    1.75MiB/s ETA 07:10');

    expect(logs).toEqual([
      '[download]   8.9% of  828.92MiB at    1.75MiB/s ETA 07:10'
    ]);
  });

  it('普通日志不会被下载进度日志覆盖', () => {
    const logs = ['[info] Downloading video metadata'];

    appendJobLogLine(logs, '[download]   1.0% of  100.00MiB at    1.00MiB/s ETA 01:39');

    expect(logs).toEqual([
      '[info] Downloading video metadata',
      '[download]   1.0% of  100.00MiB at    1.00MiB/s ETA 01:39'
    ]);
  });
});

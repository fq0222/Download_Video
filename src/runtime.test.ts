import { describe, expect, test } from 'vitest';
import path from 'node:path';
import { buildBrowserOpenCommand, resolveRuntimePaths } from './runtime.js';

describe('resolveRuntimePaths', () => {
  test('uses the current working directory during normal Node execution', () => {
    const paths = resolveRuntimePaths({
      cwd: 'F:\\web-project\\Download_Video',
      execPath: 'C:\\Program Files\\nodejs\\node.exe',
      isPackaged: false
    });

    expect(paths.appRoot).toBe('F:\\web-project\\Download_Video');
    expect(paths.ytDlpPath).toBe(path.join(paths.appRoot, 'bin', 'yt-dlp.exe'));
    expect(paths.clientDistDir).toBe(path.join(paths.appRoot, 'dist', 'client'));
  });

  test('uses the executable directory when running from a packaged exe', () => {
    const paths = resolveRuntimePaths({
      cwd: 'C:\\Users\\alice',
      execPath: 'D:\\Apps\\DownloadVideo\\DownloadVideo.exe',
      isPackaged: true
    });

    expect(paths.appRoot).toBe('D:\\Apps\\DownloadVideo');
    expect(paths.downloadDir).toBe(path.join(paths.appRoot, 'downloads'));
  });
});

describe('buildBrowserOpenCommand', () => {
  test('builds a Windows command that opens the default browser', () => {
    expect(buildBrowserOpenCommand('http://127.0.0.1:3000', 'win32')).toEqual({
      command: 'cmd',
      args: ['/c', 'start', '', 'http://127.0.0.1:3000']
    });
  });
});

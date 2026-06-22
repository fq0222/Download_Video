import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

interface RuntimePathOptions {
  cwd?: string;
  execPath?: string;
  isPackaged?: boolean;
}

export interface RuntimePaths {
  appRoot: string;
  ytDlpPath: string;
  downloadDir: string;
  clientDistDir: string;
}

export interface BrowserOpenCommand {
  command: string;
  args: string[];
}

function isPkgRuntime(): boolean {
  return Boolean((process as NodeJS.Process & { pkg?: unknown }).pkg);
}

// 打包成 exe 后，工作目录可能不是程序目录，资源需要从 exe 所在目录查找。
export function resolveRuntimePaths(options: RuntimePathOptions = {}): RuntimePaths {
  const isPackaged = options.isPackaged ?? isPkgRuntime();
  const cwd = options.cwd ?? process.cwd();
  const execPath = options.execPath ?? process.execPath;
  const appRoot = isPackaged ? path.dirname(execPath) : cwd;

  return {
    appRoot,
    ytDlpPath: path.join(appRoot, 'bin', 'yt-dlp.exe'),
    downloadDir: path.join(appRoot, 'downloads'),
    clientDistDir: path.join(appRoot, 'dist', 'client')
  };
}

// 启动器只负责交给系统默认浏览器，不绑定具体浏览器路径。
export function buildBrowserOpenCommand(
  url: string,
  platform: NodeJS.Platform = process.platform
): BrowserOpenCommand {
  if (platform === 'win32') {
    return {
      command: 'cmd',
      args: ['/c', 'start', '', url]
    };
  }

  if (platform === 'darwin') {
    return {
      command: 'open',
      args: [url]
    };
  }

  return {
    command: 'xdg-open',
    args: [url]
  };
}

export function openBrowser(url: string): ChildProcess {
  const { command, args } = buildBrowserOpenCommand(url);
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();
  return child;
}

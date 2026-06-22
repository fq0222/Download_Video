import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

/** 运行时路径解析的可选覆盖参数，主要用于测试和打包场景。 */
interface RuntimePathOptions {
  /** 当前工作目录，普通 Node 运行时会作为应用根目录。 */
  cwd?: string;
  /** 当前可执行文件路径，打包成 exe 后用于定位应用根目录。 */
  execPath?: string;
  /** 是否按打包后的运行环境解析路径。 */
  isPackaged?: boolean;
}

/** 应用启动和下载流程所需的关键本地路径。 */
export interface RuntimePaths {
  /** 应用根目录，普通运行时为仓库目录，打包后为 exe 所在目录。 */
  appRoot: string;
  /** yt-dlp 可执行文件的绝对路径。 */
  ytDlpPath: string;
  /** 下载文件保存目录。 */
  downloadDir: string;
  /** 前端静态资源构建产物目录。 */
  clientDistDir: string;
}

/** 打开浏览器时传给子进程的命令和参数。 */
export interface BrowserOpenCommand {
  /** 需要启动的系统命令。 */
  command: string;
  /** 传给系统命令的参数列表。 */
  args: string[];
}

/** 打开本地目录时传给子进程的命令和参数。 */
export interface DirectoryOpenCommand {
  /** 需要启动的系统命令。 */
  command: string;
  /** 传给系统命令的参数列表。 */
  args: string[];
}

/**
 * 判断当前进程是否运行在 pkg 打包后的环境中。
 *
 * @returns 运行在 pkg 环境中时返回 true。
 */
function isPkgRuntime(): boolean {
  return Boolean((process as NodeJS.Process & { pkg?: unknown }).pkg);
}

/**
 * 将字符串转成 PowerShell 单引号字面量。
 *
 * @param value 需要传入 PowerShell 脚本的原始字符串。
 * @returns 可安全嵌入 PowerShell 脚本的单引号字面量。
 */
function quotePowerShellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * 解析应用运行所需的本地路径。
 *
 * 打包成 exe 后，工作目录可能不是程序目录，资源需要从 exe 所在目录查找。
 *
 * @param options 路径解析覆盖参数。
 * @returns 应用根目录、yt-dlp 路径、下载目录和前端静态资源目录。
 */
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

/**
 * 构造打开默认浏览器的系统命令。
 *
 * 启动器只负责交给系统默认浏览器，不绑定具体浏览器路径。
 *
 * @param url 需要打开的页面地址。
 * @param platform 当前运行平台。
 * @returns 可传给 spawn 的命令和参数。
 */
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

/**
 * 构造打开本地目录的系统命令。
 *
 * @param directoryPath 需要在文件管理器中打开的目录路径。
 * @param platform 当前运行平台。
 * @returns 可传给 spawn 的命令和参数。
 */
export function buildDirectoryOpenCommand(
  directoryPath: string,
  platform: NodeJS.Platform = process.platform
): DirectoryOpenCommand {
  if (platform === 'win32') {
    const quotedDirectoryPath = quotePowerShellString(directoryPath);
    const foregroundExplorerScript = [
      "$ErrorActionPreference = 'Stop'",
      `$path = ${quotedDirectoryPath}`,
      'Write-Output ("[open-directory] requested=" + $path)',
      'if (-not (Test-Path -LiteralPath $path -PathType Container)) { throw ("Directory not found: " + $path) }',
      '$target = [System.IO.Path]::GetFullPath($path).TrimEnd("\\")',
      '$memberDefinition = ' +
        quotePowerShellString(
          '[System.Runtime.InteropServices.DllImport("user32.dll")] ' +
            'public static extern bool ShowWindowAsync(System.IntPtr hWnd, int nCmdShow); ' +
            '[System.Runtime.InteropServices.DllImport("user32.dll")] ' +
            'public static extern bool SetForegroundWindow(System.IntPtr hWnd);'
        ),
      'Add-Type -Namespace DownloadVideo -Name WindowTools -MemberDefinition $memberDefinition -ErrorAction Stop',
      '$shell = New-Object -ComObject Shell.Application',
      '$wshell = New-Object -ComObject WScript.Shell',
      'Write-Output "[open-directory] shell-open"',
      '$shell.Open($path)',
      'Start-Sleep -Milliseconds 700',
      '$matched = $false',
      'for ($attempt = 1; $attempt -le 12 -and -not $matched; $attempt++) {',
      '  foreach ($window in @($shell.Windows())) {',
      '    try {',
      '      if (-not ($window.FullName -like "*explorer.exe")) { continue }',
      '      $folder = [System.IO.Path]::GetFullPath($window.Document.Folder.Self.Path).TrimEnd("\\")',
      '      Write-Output ("[open-directory] probe-window attempt=" + $attempt + " hwnd=" + $window.HWND + " folder=" + $folder)',
      '      if ($folder -ieq $target) {',
      '        Write-Output ("[open-directory] matched-window hwnd=" + $window.HWND + " folder=" + $folder)',
      '        [DownloadVideo.WindowTools]::ShowWindowAsync([System.IntPtr]$window.HWND, 9) | Out-Null',
      '        [DownloadVideo.WindowTools]::ShowWindowAsync([System.IntPtr]$window.HWND, 5) | Out-Null',
      '        $activated = $wshell.AppActivate($window.LocationName)',
      '        $foreground = [DownloadVideo.WindowTools]::SetForegroundWindow([System.IntPtr]$window.HWND)',
      '        Write-Output ("[open-directory] app-activate=" + $activated + " set-foreground=" + $foreground)',
      '        $matched = $true',
      '        break',
      '      }',
      '    } catch {',
      '      Write-Output ("[open-directory] probe-error=" + $_.Exception.Message)',
      '    }',
      '  }',
      '  if (-not $matched) { Start-Sleep -Milliseconds 250 }',
      '}',
      'if (-not $matched) {',
      '  Write-Output "[open-directory] fallback-start-process"',
      '  Start-Process -FilePath explorer.exe -ArgumentList ("/n,/e,`"" + $path + "`"") -WindowStyle Normal',
      '  Start-Sleep -Milliseconds 500',
      '  Write-Warning "[open-directory] no matching explorer window found"',
      '}'
    ].join('; ');

    return {
      command: 'powershell.exe',
      args: [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-WindowStyle',
        'Hidden',
        '-Command',
        foregroundExplorerScript
      ]
    };
  }

  if (platform === 'darwin') {
    return {
      command: 'open',
      args: [directoryPath]
    };
  }

  return {
    command: 'xdg-open',
    args: [directoryPath]
  };
}

/**
 * 使用系统默认浏览器打开指定地址。
 *
 * @param url 需要打开的页面地址。
 * @returns 已启动的子进程对象。
 */
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

/**
 * 使用系统文件管理器打开指定目录。
 *
 * @param directoryPath 需要打开的目录路径。
 * @returns 已启动的子进程对象。
 */
export function openDirectory(directoryPath: string): ChildProcess {
  const { command, args } = buildDirectoryOpenCommand(directoryPath);
  console.log('[runtime] open directory command', {
    directoryPath,
    command,
    args
  });
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false
  });
  child.stdout?.on('data', (chunk: Buffer) => {
    const message = chunk.toString('utf8').trim();
    if (message) {
      console.log('[runtime] open directory stdout', message);
    }
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    const message = chunk.toString('utf8').trim();
    if (message) {
      console.error('[runtime] open directory stderr', message);
    }
  });
  child.on('error', (error) => {
    console.error('[runtime] open directory spawn error', {
      directoryPath,
      command,
      args,
      message: error.message
    });
  });
  return child;
}

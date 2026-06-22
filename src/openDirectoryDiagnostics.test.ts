import fs from 'node:fs';
import { describe, expect, test } from 'vitest';
import { buildDirectoryOpenCommand } from './runtime.js';

describe('open directory diagnostics', () => {
  test('windows script logs each explorer activation step', () => {
    const command = buildDirectoryOpenCommand('F:\\web-project\\Download_Video\\downloads', 'win32');
    const script = command.args.at(-1) ?? '';

    expect(script).toContain("$ErrorActionPreference = 'Stop'");
    expect(script).toContain('[open-directory] requested=');
    expect(script).toContain('$shell.Open($path)');
    expect(script).toContain('[open-directory] matched-window');
    expect(script).toContain('[open-directory] app-activate=');
    expect(script).toContain('[open-directory] fallback-start-process');
    expect(script).toContain('[open-directory] no matching explorer window found');
  });

  test('runtime forwards child stdout and stderr into server logs', () => {
    const source = fs.readFileSync(new URL('./runtime.ts', import.meta.url), 'utf8');

    expect(source).toContain('[runtime] open directory stdout');
    expect(source).toContain('[runtime] open directory stderr');
    expect(source).toContain("stdio: ['ignore', 'pipe', 'pipe']");
  });
});

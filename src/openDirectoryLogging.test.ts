import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const appVueSource = fs.readFileSync(path.join(projectRoot, 'client/src/App.vue'), 'utf8');
const runtimeSource = fs.readFileSync(path.join(projectRoot, 'src/runtime.ts'), 'utf8');
const serverSource = fs.readFileSync(path.join(projectRoot, 'src/server.ts'), 'utf8');

describe('open directory diagnostics', () => {
  it('logs the frontend click, response, success, and failure states', () => {
    expect(appVueSource).toContain('[download-directory] open clicked');
    expect(appVueSource).toContain('[download-directory] open response');
    expect(appVueSource).toContain('[download-directory] open accepted');
    expect(appVueSource).toContain('[download-directory] open failed');
  });

  it('logs the backend request, command, child process, and errors', () => {
    expect(serverSource).toContain('[api] open download directory request');
    expect(serverSource).toContain('[api] open download directory spawned');
    expect(serverSource).toContain('[api] open download directory process error');
    expect(serverSource).toContain('[api] open download directory process closed');
    expect(runtimeSource).toContain('[runtime] open directory command');
    expect(runtimeSource).toContain('[runtime] open directory spawn error');
  });

  it('handles stdout and stderr stream errors from the open-directory child process', () => {
    expect(runtimeSource).toContain('[runtime] open directory stdout stream error');
    expect(runtimeSource).toContain('[runtime] open directory stderr stream error');
  });

  it('guards repeated open clicks while an open-directory process is still running', () => {
    expect(runtimeSource).toContain('openDirectoryChild');
    expect(runtimeSource).toContain('[runtime] open directory already running');
  });
});

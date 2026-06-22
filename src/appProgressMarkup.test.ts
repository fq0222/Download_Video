import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const appVueSource = fs.readFileSync(path.join(projectRoot, 'client/src/App.vue'), 'utf8');

describe('download progress markup', () => {
  it('does not show the process exit code in the progress summary', () => {
    const metricRow = appVueSource.match(/<div class="metric-row">[\s\S]*?<\/div>/)?.[0] ?? '';

    expect(metricRow).toContain('job.progress.percent');
    expect(metricRow).toContain('job.progress.speed');
    expect(metricRow).not.toContain('job.exitCode');
  });

  it('keeps command output collapsed by default like the command preview', () => {
    const logDetail = appVueSource.match(/<details class="log-detail"[^>]*>[\s\S]*?<\/details>/)?.[0] ?? '';

    expect(logDetail).toContain('<summary>输出</summary>');
    expect(logDetail).toContain('<pre class="log-box">{{ visibleLogs(job).join(\'\\n\') }}</pre>');
    expect(logDetail).not.toMatch(/<details[^>]*\sopen(?:\s|>|=)/);
  });

  it('shows an open button in the job card header that opens the download directory', () => {
    const jobHead = appVueSource.match(/<div class="job-head">[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? '';

    expect(jobHead).toContain('openDownloadDirectory');
    expect(jobHead).toContain('打开');
    expect(jobHead).toContain('class="ghost-button"');
  });

  it('shows feedback while and after opening the download directory', () => {
    expect(appVueSource).toContain('isOpeningDownloadDirectory');
    expect(appVueSource).toContain('打开中');
    expect(appVueSource).toContain('已发送打开目录请求');
    expect(appVueSource).toContain('toLocaleTimeString');
    expect(appVueSource).toContain('directory-message');
  });
});

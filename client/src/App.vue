<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import type { DownloadJobSnapshot, DownloadRequest } from '../../src/types';

/**
 * 后端健康检查接口返回的运行信息。
 */
interface HealthInfo {
  /** 服务是否正常响应。 */
  ok: boolean;
  /** 后端运行平台。 */
  runtime: string;
  /** yt-dlp.exe 的绝对路径。 */
  ytDlpPath: string;
  /** 下载文件保存目录。 */
  downloadDir: string;
}

const chromeUserAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const form = reactive<DownloadRequest>({
  url: '',
  proxyEnabled: false,
  proxyUrl: 'http://127.0.0.1:7897',
  maxHeightEnabled: true,
  maxHeight: 1080,
  mergeOutputFormatEnabled: true,
  mergeOutputFormat: 'mp4',
  audioAacEnabled: true,
  userAgentEnabled: false,
  userAgent: chromeUserAgent,
  cookiesFromBrowserEnabled: false,
  cookiesBrowser: 'chrome',
  outputEnabled: false,
  outputTemplate: '%(title)s.%(ext)s'
});

const jobs = ref<DownloadJobSnapshot[]>([]);
const health = ref<HealthInfo | null>(null);
const errorMessage = ref('');
const isSubmitting = ref(false);
const eventSources = new Map<string, EventSource>();

const latestJob = computed(() => jobs.value[0]);

/**
 * 加载服务端运行信息，用于顶部状态栏展示。
 */
async function loadHealth(): Promise<void> {
  const response = await fetch('/api/health');
  health.value = await response.json();
}

/**
 * 页面刷新后加载后端已有任务。
 */
async function loadJobs(): Promise<void> {
  const response = await fetch('/api/downloads');
  jobs.value = await response.json();
}

/**
 * 应用示例命令中的 YouTube 1080p MP4 预设。
 */
function applyYoutubePreset(): void {
  form.proxyEnabled = true;
  form.maxHeightEnabled = true;
  form.maxHeight = 1080;
  form.mergeOutputFormatEnabled = true;
  form.mergeOutputFormat = 'mp4';
  form.audioAacEnabled = true;
}

/**
 * 应用示例命令中的抖音浏览器 cookies 预设。
 */
function applyDouyinPreset(): void {
  form.userAgentEnabled = true;
  form.userAgent = chromeUserAgent;
  form.cookiesFromBrowserEnabled = true;
  form.cookiesBrowser = 'chrome';
  form.outputEnabled = true;
  form.outputTemplate = '%(title)s.%(ext)s';
  form.maxHeightEnabled = false;
  form.mergeOutputFormatEnabled = false;
  form.audioAacEnabled = false;
}

/**
 * 应用示例命令中的 m3u8 指定输出名预设。
 */
function applyM3u8Preset(): void {
  form.outputEnabled = true;
  form.outputTemplate = '002宝可梦中心大对决.mp4';
  form.maxHeightEnabled = false;
  form.mergeOutputFormatEnabled = false;
  form.audioAacEnabled = false;
  form.proxyEnabled = false;
  form.userAgentEnabled = false;
  form.cookiesFromBrowserEnabled = false;
}

/**
 * 创建下载任务，并打开 SSE 通道接收实时更新。
 */
async function submitDownload(): Promise<void> {
  errorMessage.value = '';
  isSubmitting.value = true;

  try {
    const response = await fetch('/api/downloads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });

    if (!response.ok) {
      const payload = await response.json();
      throw new Error(payload.message || '创建下载任务失败');
    }

    const job = (await response.json()) as DownloadJobSnapshot;
    upsertJob(job);
    connectJobEvents(job.id);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '创建下载任务失败';
  } finally {
    isSubmitting.value = false;
  }
}

/**
 * 请求取消正在运行的下载任务。
 *
 * @param id 任务 ID。
 */
async function cancelJob(id: string): Promise<void> {
  const response = await fetch(`/api/downloads/${id}`, { method: 'DELETE' });
  if (response.ok) {
    upsertJob(await response.json());
  }
}

/**
 * 为单个任务打开服务端事件流。
 *
 * @param id 任务 ID。
 */
function connectJobEvents(id: string): void {
  if (eventSources.has(id)) {
    return;
  }

  const source = new EventSource(`/api/downloads/${id}/events`);
  eventSources.set(id, source);

  source.onmessage = (event) => {
    const job = JSON.parse(event.data) as DownloadJobSnapshot;
    upsertJob(job);

    if (['completed', 'failed', 'cancelled'].includes(job.status)) {
      source.close();
      eventSources.delete(id);
    }
  };

  source.onerror = () => {
    source.close();
    eventSources.delete(id);
  };
}

/**
 * 插入或替换任务快照，并保持新任务在前。
 *
 * @param job 后端返回的最新任务快照。
 */
function upsertJob(job: DownloadJobSnapshot): void {
  const index = jobs.value.findIndex((item) => item.id === job.id);
  if (index >= 0) {
    jobs.value[index] = job;
  } else {
    jobs.value.unshift(job);
  }
  jobs.value = [...jobs.value].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * 将任务状态映射为中文展示文本。
 *
 * @param status 后端任务状态。
 * @returns 状态展示文案。
 */
function statusText(status: DownloadJobSnapshot['status']): string {
  const map: Record<DownloadJobSnapshot['status'], string> = {
    queued: '排队中',
    running: '下载中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消'
  };
  return map[status];
}

/**
 * 限制页面展示的日志为最新若干行。
 *
 * @param job 任务快照。
 * @returns 最新日志行。
 */
function visibleLogs(job: DownloadJobSnapshot): string[] {
  return job.logs.slice(-80);
}

onMounted(async () => {
  await Promise.all([loadHealth(), loadJobs()]);
});
</script>

<template>
  <main class="app-shell">
    <header class="topbar">
      <div>
        <h1>Download Video WebUI</h1>
        <p v-if="health">{{ health.runtime }} · {{ health.downloadDir }}</p>
      </div>
      <span class="server-pill" :class="{ online: health?.ok }">{{ health?.ok ? '在线' : '连接中' }}</span>
    </header>

    <section class="workspace">
      <form class="panel form-panel" @submit.prevent="submitDownload">
        <div class="section-heading">
          <h2>下载参数</h2>
          <div class="preset-row">
            <button type="button" @click="applyYoutubePreset">YouTube 1080p</button>
            <button type="button" @click="applyDouyinPreset">浏览器 Cookies</button>
            <button type="button" @click="applyM3u8Preset">m3u8 输出名</button>
          </div>
        </div>

        <label class="field-block">
          <span>视频链接</span>
          <textarea v-model.trim="form.url" rows="4" placeholder="https://www.youtube.com/watch?v=5na7eGXFVUk"></textarea>
        </label>

        <div class="option-grid">
          <label class="check-row">
            <input v-model="form.proxyEnabled" type="checkbox" />
            <span>启用代理</span>
          </label>
          <input v-model.trim="form.proxyUrl" :disabled="!form.proxyEnabled" class="inline-input" />

          <label class="check-row">
            <input v-model="form.maxHeightEnabled" type="checkbox" />
            <span>限制最高画质</span>
          </label>
          <select v-model.number="form.maxHeight" :disabled="!form.maxHeightEnabled" class="inline-input">
            <option :value="2160">2160p</option>
            <option :value="1440">1440p</option>
            <option :value="1080">1080p</option>
            <option :value="720">720p</option>
            <option :value="480">480p</option>
          </select>

          <label class="check-row">
            <input v-model="form.mergeOutputFormatEnabled" type="checkbox" />
            <span>合并输出格式</span>
          </label>
          <select v-model="form.mergeOutputFormat" :disabled="!form.mergeOutputFormatEnabled" class="inline-input">
            <option value="mp4">mp4</option>
            <option value="mkv">mkv</option>
            <option value="webm">webm</option>
          </select>

          <label class="check-row">
            <input v-model="form.audioAacEnabled" type="checkbox" />
            <span>音频转 AAC</span>
          </label>
          <span class="muted-text">ffmpeg:-c:a aac</span>

          <label class="check-row">
            <input v-model="form.userAgentEnabled" type="checkbox" />
            <span>User-Agent</span>
          </label>
          <textarea v-model.trim="form.userAgent" :disabled="!form.userAgentEnabled" rows="3" class="inline-area"></textarea>

          <label class="check-row">
            <input v-model="form.cookiesFromBrowserEnabled" type="checkbox" />
            <span>读取浏览器 Cookies</span>
          </label>
          <select v-model="form.cookiesBrowser" :disabled="!form.cookiesFromBrowserEnabled" class="inline-input">
            <option value="chrome">chrome</option>
            <option value="edge">edge</option>
            <option value="firefox">firefox</option>
            <option value="brave">brave</option>
            <option value="opera">opera</option>
          </select>

          <label class="check-row">
            <input v-model="form.outputEnabled" type="checkbox" />
            <span>输出文件名 / 模板</span>
          </label>
          <input v-model.trim="form.outputTemplate" :disabled="!form.outputEnabled" class="inline-input" />
        </div>

        <p v-if="errorMessage" class="error-line">{{ errorMessage }}</p>

        <button class="primary-button" type="submit" :disabled="isSubmitting">
          {{ isSubmitting ? '创建中...' : '开始下载' }}
        </button>
      </form>

      <section class="panel jobs-panel">
        <div class="section-heading">
          <h2>实时进度</h2>
          <span v-if="latestJob" class="job-count">{{ jobs.length }} 个任务</span>
        </div>

        <div v-if="!jobs.length" class="empty-state">暂无下载任务</div>

        <article v-for="job in jobs" :key="job.id" class="job-card" :class="job.status">
          <div class="job-head">
            <div>
              <strong>{{ statusText(job.status) }}</strong>
              <p>{{ job.request.url }}</p>
            </div>
            <button v-if="job.status === 'running'" type="button" class="ghost-button" @click="cancelJob(job.id)">取消</button>
          </div>

          <div class="progress-track">
            <div class="progress-bar" :style="{ width: `${Math.min(job.progress.percent ?? 0, 100)}%` }"></div>
          </div>

          <div class="metric-row">
            <span>{{ job.progress.percent?.toFixed(1) ?? '0.0' }}%</span>
            <span v-if="job.progress.speed">{{ job.progress.speed }}</span>
            <span v-if="job.progress.eta">ETA {{ job.progress.eta }}</span>
            <span v-if="job.exitCode !== undefined && job.exitCode !== null">退出码 {{ job.exitCode }}</span>
          </div>

          <details class="command-detail">
            <summary>命令</summary>
            <code>{{ job.commandPreview }}</code>
          </details>

          <pre class="log-box">{{ visibleLogs(job).join('\n') }}</pre>
        </article>
      </section>
    </section>
  </main>
</template>

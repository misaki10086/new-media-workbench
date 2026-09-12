import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Check, Monitor, Moon, Sparkles, Sun } from 'lucide-react';
import { PUBLISH_CONFIRM_MODE_META } from '@shared/constants/platforms';
import type { AiConfigView, PublishConfirmMode, ThemePreference } from '@shared/types/domain';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { useUiStore } from '@renderer/stores/uiStore';

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: '跟随系统', icon: Monitor },
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
];

function AiConfigSection(): ReactNode {
  const [config, setConfig] = useState<AiConfigView | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    void window.newMedia.ai.getConfig().then((loaded) => {
      setConfig(loaded);
      setBaseUrl(loaded.baseUrl);
      setModel(loaded.model);
    });
  }, []);

  async function save(): Promise<void> {
    if (saving) return;
    setSaving(true);
    setResult(null);
    try {
      const saved = await window.newMedia.ai.saveConfig({
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        apiKey: apiKey.trim() === '' ? undefined : apiKey.trim(),
      });
      setConfig(saved);
      setApiKey('');
      setResult({ ok: true, message: '配置已保存' });
    } catch (cause) {
      setResult({ ok: false, message: cause instanceof Error ? cause.message : '保存失败' });
    } finally {
      setSaving(false);
    }
  }

  async function test(): Promise<void> {
    if (testing) return;
    setTesting(true);
    setResult(null);
    try {
      const outcome = await window.newMedia.ai.testConfig();
      setResult({ ok: outcome.ok, message: outcome.message });
    } catch (cause) {
      setResult({ ok: false, message: cause instanceof Error ? cause.message : '测试失败' });
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="mt-4 rounded-xl border border-line bg-panel">
      <header className="border-b border-line px-4 py-3">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Sparkles size={14} className="text-accent" />
          AI 内容助手
        </h2>
        <p className="mt-0.5 text-[11px] text-fg-muted">
          兼容 OpenAI 接口格式（OpenAI / DeepSeek / Kimi 等）。API Key 只保存在本地数据库，不会上传
        </p>
      </header>
      <div className="px-4 py-3.5">
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 block text-[12px] text-fg-muted">
            API Base URL
            <input
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.openai.com/v1"
              className="mt-1 h-9 w-full rounded-lg border border-line bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-accent"
            />
          </label>
          <label className="block text-[12px] text-fg-muted">
            API Key
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={config?.hasApiKey ? '已保存（输入可覆盖）' : 'sk-…'}
              autoComplete="new-password"
              className="mt-1 h-9 w-full rounded-lg border border-line bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-accent"
            />
          </label>
          <label className="block text-[12px] text-fg-muted">
            模型
            <input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="gpt-4o-mini"
              className="mt-1 h-9 w-full rounded-lg border border-line bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-accent"
            />
          </label>
        </div>
        {config?.apiKeyFromEnv ? (
          <p className="mt-2 text-[11px] text-warning">当前使用环境变量 OPENAI_API_KEY；保存后将覆盖为本地配置。</p>
        ) : null}
        {result ? (
          <div
            className={`mt-3 rounded-lg border px-3 py-2 text-[12px] ${
              result.ok ? 'border-success bg-success-soft text-success' : 'border-danger bg-danger-soft text-danger'
            }`}
          >
            {result.message}
          </div>
        ) : null}
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            disabled={testing}
            onClick={() => void test()}
            className="rounded-lg border border-line px-3.5 py-1.5 text-[12px] text-fg-muted hover:text-fg disabled:opacity-50"
          >
            {testing ? '测试中…' : '测试连接'}
          </button>
          <button
            type="button"
            disabled={saving || baseUrl.trim() === '' || model.trim() === ''}
            onClick={() => void save()}
            className="rounded-lg bg-accent px-3.5 py-1.5 text-[12px] font-medium text-accent-fg disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存配置'}
          </button>
        </div>
      </div>
    </section>
  );
}

export function SettingsPage(): ReactNode {
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const { publishConfirmMode, setPublishConfirmMode } = useSettingsStore();

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <div className="mb-5">
        <h1 className="text-[17px] font-semibold">设置</h1>
        <p className="mt-0.5 text-[12px] text-fg-muted">界面偏好与发布行为</p>
      </div>

      <section className="rounded-xl border border-line bg-panel">
        <header className="border-b border-line px-4 py-3">
          <h2 className="text-[13px] font-semibold">外观</h2>
        </header>
        <div className="flex gap-2 px-4 py-3.5">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-[12px] transition-colors ${
                theme === option.value
                  ? 'border-accent bg-accent-soft font-medium text-accent'
                  : 'border-line text-fg-muted hover:bg-panel-hover hover:text-fg'
              }`}
            >
              <option.icon size={14} />
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-line bg-panel">
        <header className="border-b border-line px-4 py-3">
          <h2 className="text-[13px] font-semibold">发布确认模式</h2>
          <p className="mt-0.5 text-[11px] text-fg-muted">保存在本地数据库，发布队列（Phase 6）将按此设置执行</p>
        </header>
        <div className="flex flex-col divide-y divide-line px-4 py-1">
          {(Object.keys(PUBLISH_CONFIRM_MODE_META) as PublishConfirmMode[]).map((mode) => {
            const meta = PUBLISH_CONFIRM_MODE_META[mode];
            const active = publishConfirmMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => void setPublishConfirmMode(mode)}
                className="flex items-start gap-3 py-3 text-left"
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    active ? 'border-accent bg-accent text-accent-fg' : 'border-line'
                  }`}
                >
                  {active ? <Check size={10} strokeWidth={3} /> : null}
                </span>
                <span>
                  <span className={`block text-[13px] ${active ? 'font-medium text-fg' : 'text-fg'}`}>{meta.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-fg-muted">{meta.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <AiConfigSection />

      <section className="mt-4 rounded-xl border border-line bg-panel">
        <header className="border-b border-line px-4 py-3">
          <h2 className="text-[13px] font-semibold">关于</h2>
        </header>
        <div className="px-4 py-3.5 text-[12px] leading-relaxed text-fg-muted">
          <p>新媒体工作台 · 本地个人使用，完全离线运行（AI 助手调用除外）。</p>
          <p className="mt-1">
            数据目录：<code className="rounded bg-panel-hover px-1.5 py-0.5 text-[11px]">%APPDATA%\NewMediaWorkbench\database\app.db</code>
          </p>
          <p className="mt-1">本工具不绕过任何平台风控；登录与安全验证始终由你本人完成。</p>
        </div>
      </section>
    </div>
  );
}

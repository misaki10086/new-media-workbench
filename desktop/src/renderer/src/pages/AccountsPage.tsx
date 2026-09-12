import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pencil, Play, Plus, RefreshCw, ShieldAlert, Square, Trash2, UserRoundPlus, X } from 'lucide-react';
import { PLATFORMS, PLATFORM_LABEL } from '@shared/constants/platforms';
import type { AccountView, BrowserProfile, CustomPlatform, Platform } from '@shared/types/domain';
import type { PlatformCatalogEntry } from '@shared/types/ipc';
import type { LoginCheckResult } from '@shared/types/ipc';
import { StatusChip, StatusDot } from '@renderer/components/ui';

const PROFILE_STATUS_META: Record<BrowserProfile['status'], { label: string; tone: 'idle' | 'accent' | 'danger' }> = {
  stopped: { label: '未启动', tone: 'idle' },
  running: { label: '运行中', tone: 'accent' },
  crashed: { label: '异常退出', tone: 'danger' },
};

const LOGIN_STATUS_META: Record<AccountView['loginStatus'], { label: string; tone: 'idle' | 'accent' | 'danger' | 'warning' | 'success' }> = {
  unknown: { label: '未知', tone: 'idle' },
  logged_in: { label: '已登录', tone: 'success' },
  logged_out: { label: '未登录', tone: 'danger' },
  security_check: { label: '需要人工验证', tone: 'warning' },
};

const BROWSER_STATUS_LABEL: Record<BrowserProfile['status'], { label: string; tone: 'idle' | 'accent' | 'danger' }> = {
  stopped: { label: '未运行', tone: 'idle' },
  running: { label: '运行中', tone: 'accent' },
  crashed: { label: '异常退出', tone: 'danger' },
};

function PlatformBadge({ platform, name }: { platform: Platform; name?: string }): ReactNode {
  return (
    <span className="inline-flex items-center rounded-md border border-line bg-panel-hover px-2 py-0.5 text-[11px] font-medium">
      {name ?? PLATFORM_LABEL[platform] ?? platform}
    </span>
  );
}

function formatOpenedAt(iso: string | null): string {
  if (!iso) return '从未打开';
  const date = new Date(iso);
  return `${date.getMonth() + 1}/${date.getDate()} ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return '从未检查';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

export function AccountsPage(): ReactNode {
  const [profiles, setProfiles] = useState<BrowserProfile[]>([]);
  const [platformCatalog, setPlatformCatalog] = useState<PlatformCatalogEntry[]>([]);
  const [customPlatforms, setCustomPlatforms] = useState<CustomPlatform[]>([]);
  const [customPlatformOpen, setCustomPlatformOpen] = useState(false);
  const [confirmDeleteCustomId, setConfirmDeleteCustomId] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createProfileOpen, setCreateProfileOpen] = useState(false);
  const [createAccountOpen, setCreateAccountOpen] = useState(false);
  const [renaming, setRenaming] = useState<BrowserProfile | null>(null);
  const [confirmDeleteProfileId, setConfirmDeleteProfileId] = useState<number | null>(null);
  const [confirmDeleteAccountId, setConfirmDeleteAccountId] = useState<number | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pendingLoginAccountId, setPendingLoginAccountId] = useState<number | null>(null);
  const [debugInfo, setDebugInfo] = useState<{ accountName: string; platform: Platform; profilePath: string; debug: LoginCheckResult } | null>(null);
  const busyRef = useRef(false);

  const loadAll = useCallback(async (): Promise<void> => {
    try {
      const [profileList, accountList, catalog, customs] = await Promise.all([
        window.newMedia.browserProfile.list(),
        window.newMedia.account.list(),
        window.newMedia.platform.list(),
        window.newMedia.platformCustom.list(),
      ]);
      setProfiles(profileList);
      setAccounts(accountList);
      setPlatformCatalog(catalog);
      setCustomPlatforms(customs);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '数据加载失败');
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await loadAll();
      setLoading(false);
    })();
    const timer = setInterval(() => void loadAll(), 4000);
    return () => clearInterval(timer);
  }, [loadAll]);

  const withBusy = useCallback(
    async (key: string, task: () => Promise<unknown>): Promise<void> => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusyKey(key);
      setError(null);
      try {
        await task();
        await loadAll();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '操作失败');
      } finally {
        busyRef.current = false;
        setBusyKey(null);
      }
    },
    [loadAll],
  );

  async function handleOpenLogin(account: AccountView): Promise<void> {
    setPendingLoginAccountId(account.id);
    await withBusy(`login-${account.id}`, () => window.newMedia.account.openLogin(account.id));
  }

  async function handleCheckLogin(account: AccountView): Promise<void> {
    const result = await withBusyResult(`check-${account.id}`, () => window.newMedia.account.checkLogin(account.id));
    if (result) {
      setDebugInfo({
        accountName: result.account.name,
        platform: result.account.platform,
        profilePath: result.account.profilePath,
        debug: result.debug,
      });
      if (result.account.loginStatus === 'logged_in') setPendingLoginAccountId(null);
    }
  }

  const withBusyResult = useCallback(
    async (key: string, task: () => Promise<unknown>): Promise<{ account: AccountView; debug: LoginCheckResult } | null> => {
      if (busyRef.current) return null;
      busyRef.current = true;
      setBusyKey(key);
      setError(null);
      try {
        const result = (await task()) as { account: AccountView; debug: LoginCheckResult };
        await loadAll();
        return result;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '操作失败');
        return null;
      } finally {
        busyRef.current = false;
        setBusyKey(null);
      }
    },
    [loadAll],
  );

  const boundProfileIds = new Set(accounts.map((account) => account.profileId));

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      {/* ============ 平台账号 ============ */}
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[17px] font-semibold">账号管理</h1>
          <p className="mt-0.5 text-[12px] text-fg-muted">
            账号绑定浏览器 Profile，登录由你本人完成；登录状态检测目前支持抖音
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="刷新"
            onClick={() => void loadAll()}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-fg-muted transition-colors hover:bg-panel-hover hover:text-fg"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={() => setCreateAccountOpen(true)}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[12px] font-medium text-accent-fg transition-opacity hover:opacity-90"
          >
            <Plus size={14} />
            添加账号
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-danger bg-danger-soft px-3 py-2 text-[12px] text-danger">
          {error}
          <button type="button" aria-label="关闭提示" onClick={() => setError(null)}>
            <X size={13} />
          </button>
        </div>
      ) : null}

      {accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-panel px-6 py-10 text-center">
          <p className="text-[13px] text-fg">还没有平台账号</p>
          <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-fg-muted">
            先在下方创建浏览器 Profile，再点击「添加账号」把账号绑定到对应 Profile。
            打开浏览器后手动登录平台，本工具不会接触你的密码与验证码。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {accounts.map((account) => {
            const loginMeta = LOGIN_STATUS_META[account.loginStatus];
            const browserMeta = BROWSER_STATUS_LABEL[account.browserStatus];
            const busy = busyKey?.includes(String(account.id)) ?? false;
            const isWaitingLogin = pendingLoginAccountId === account.id && account.loginStatus !== 'logged_in';
            const isSecurityCheck = account.loginStatus === 'security_check';
            const loginLabel =
              account.loginDisplayName ?? account.loginUsername ?? loginMeta.label;
            return (
              <div key={account.id} className="rounded-xl border border-line bg-panel p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <PlatformBadge platform={account.platform} name={account.platformName} />
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold">{account.name}</div>
                      <div className="truncate text-[11px] text-fg-muted">Profile：{account.profileName}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`删除账号${account.name}`}
                    disabled={busyRef.current}
                    onClick={() => setConfirmDeleteAccountId(account.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-panel-hover hover:text-danger disabled:opacity-50"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-panel-hover/60 px-3 py-2.5 text-[12px]">
                  <div className="flex items-center gap-1.5 text-fg-muted">
                    浏览器
                    <span className="ml-auto flex items-center gap-1.5 text-fg">
                      <StatusDot tone={browserMeta.tone} pulse={account.browserStatus === 'running'} />
                      {browserMeta.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-fg-muted">
                    登录状态
                    <span className="ml-auto flex items-center gap-1.5 text-fg">
                      <StatusDot tone={loginMeta.tone} pulse={isSecurityCheck} />
                      {loginMeta.label}
                    </span>
                  </div>
                  <div className="text-fg-muted">
                    最后检查
                    <span className="ml-2 text-fg">{formatRelative(account.lastLoginCheckAt)}</span>
                  </div>
                  <div className="truncate text-fg-muted">
                    账号识别
                    <span className="ml-2 text-fg">{account.loginStatus === 'logged_in' ? loginLabel : '—'}</span>
                  </div>
                </div>

                {isSecurityCheck ? (
                  <div className="mt-3 rounded-lg border border-warning bg-warning-soft px-3 py-2 text-[11px] leading-relaxed text-warning">
                    <div className="flex items-center gap-1.5 font-medium">
                      <ShieldAlert size={12} />
                      需要人工验证
                    </div>
                    <p className="mt-0.5">请在浏览器中完成安全验证。程序不会自动处理验证码或滑块。</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleCheckLogin(account)}
                        className="rounded-lg bg-warning px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                      >
                        {busy ? '检查中…' : '我已完成验证'}
                      </button>
                    </div>
                  </div>
                ) : isWaitingLogin ? (
                  <div className="mt-3 rounded-lg border border-warning bg-warning-soft px-3 py-2 text-[11px] leading-relaxed text-warning">
                    <div className="font-medium">需要登录{PLATFORM_LABEL[account.platform]}</div>
                    <p className="mt-0.5">浏览器已经打开创作者中心，请完成登录。程序不会代替你输入任何账号信息。</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleCheckLogin(account)}
                        className="rounded-lg bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-fg disabled:opacity-50"
                      >
                        {busy ? '检查中…' : '我已完成登录'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingLoginAccountId(null)}
                        className="rounded-lg border border-line bg-panel px-2.5 py-1 text-[11px] text-fg-muted"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {account.browserStatus === 'running' ? (
                    <button
                      type="button"
                      disabled={busyRef.current}
                      onClick={() => void withBusy(`profile-${account.profileId}`, () => window.newMedia.browserProfile.close(account.profileId))}
                      className="flex h-7 items-center gap-1 rounded-lg border border-line px-2.5 text-[11px] text-fg-muted transition-colors hover:bg-panel-hover hover:text-fg disabled:opacity-50"
                    >
                      <Square size={10} /> 关闭浏览器
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyRef.current}
                      onClick={() => void withBusy(`profile-${account.profileId}`, () => window.newMedia.browserProfile.launch(account.profileId))}
                      className="flex h-7 items-center gap-1 rounded-lg border border-line px-2.5 text-[11px] text-fg-muted transition-colors hover:bg-panel-hover hover:text-fg disabled:opacity-50"
                    >
                      <Play size={10} /> 打开浏览器
                    </button>
                  )}
                  {isWaitingLogin || account.loginStatus === 'logged_out' ? (
                    <button
                      type="button"
                      disabled={busyRef.current}
                      onClick={() => void handleOpenLogin(account)}
                      className="flex h-7 items-center gap-1 rounded-lg bg-accent px-2.5 text-[11px] font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      <UserRoundPlus size={10} /> 登录账号
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyRef.current}
                      onClick={() => void handleOpenLogin(account)}
                      className="flex h-7 items-center gap-1 rounded-lg border border-line px-2.5 text-[11px] text-fg-muted transition-colors hover:bg-panel-hover hover:text-fg disabled:opacity-50"
                    >
                      <Play size={10} /> 重新登录
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busyRef.current}
                    onClick={() => void handleCheckLogin(account)}
                    className="flex h-7 items-center gap-1 rounded-lg border border-line px-2.5 text-[11px] text-fg-muted transition-colors hover:bg-panel-hover hover:text-fg disabled:opacity-50"
                  >
                    <RefreshCw size={10} className={busy ? 'animate-spin' : ''} />
                    {busy && busyKey?.startsWith('check') ? '检查中…' : '检查登录'}
                  </button>
                </div>

                {confirmDeleteAccountId === account.id ? (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-warning bg-warning-soft px-3 py-2 text-[11px] text-warning">
                    <span>删除账号（Profile 与登录状态保留）？</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDeleteAccountId(null);
                          void withBusy(`account-${account.id}`, () => window.newMedia.account.delete(account.id));
                        }}
                        className="rounded-lg bg-danger px-2.5 py-1 text-[11px] text-white"
                      >
                        删除
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteAccountId(null)}
                        className="rounded-lg border border-line bg-panel px-2.5 py-1 text-[11px] text-fg-muted"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {/* ============ 自定义平台 ============ */}
      <div className="mb-3 mt-8 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">自定义平台</h2>
          <p className="mt-0.5 text-[12px] text-fg-muted">填一个创作者中心地址即可接入：绑定 Profile、检测登录状态、一键打开创作者中心（发文需在该平台网页手动完成）</p>
        </div>
        <button
          type="button"
          onClick={() => setCustomPlatformOpen(true)}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[12px] text-fg-muted transition-colors hover:bg-panel-hover hover:text-fg"
        >
          <Plus size={14} />
          添加自定义平台
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-panel">
        {customPlatforms.length === 0 ? (
          <div className="px-4 py-6 text-center text-[12px] text-fg-muted">
            还没有自定义平台。例如添加「快手」（创作者中心 https://cp.kuaishou.com），登录检测通过未登录跳转地址自动判断。
          </div>
        ) : (
          <table className="w-full text-left">
            <tbody>
              {customPlatforms.map((platform) => (
                <tr key={platform.id} className="border-b border-line last:border-b-0 hover:bg-panel-hover/50">
                  <td className="px-4 py-2.5 text-[13px] font-medium">{platform.name}</td>
                  <td className="max-w-64 truncate px-4 py-2.5 text-[11px] text-fg-muted" title={platform.creatorUrl}>{platform.creatorUrl}</td>
                  <td className="px-4 py-2.5 font-mono text-[10px] text-fg-muted">{platform.key}</td>
                  <td className="px-4 py-2.5 text-right">
                    {confirmDeleteCustomId === platform.id ? (
                      <span className="flex items-center justify-end gap-2">
                        <span className="text-[11px]">确认删除？</span>
                        <button
                          type="button"
                          onClick={() => {
                            const id = platform.id;
                            setConfirmDeleteCustomId(null);
                            void withBusy(`custom-${id}`, () => window.newMedia.platformCustom.delete(id));
                          }}
                          className="rounded-lg bg-danger px-2.5 py-1 text-[11px] text-white"
                        >
                          删除
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteCustomId(null)}
                          className="rounded-lg border border-line bg-panel px-2.5 py-1 text-[11px] text-fg-muted"
                        >
                          取消
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busyRef.current}
                        onClick={() => setConfirmDeleteCustomId(platform.id)}
                        className="flex h-7 items-center gap-1 rounded-lg border border-line px-2.5 text-[11px] text-fg-muted hover:text-danger disabled:opacity-50"
                      >
                        <Trash2 size={10} /> 删除
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ============ 浏览器 Profiles ============ */}
      <div className="mb-3 mt-8 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">浏览器 Profile</h2>
          <p className="mt-0.5 text-[12px] text-fg-muted">每个 Profile 是一个独立的 Chromium 用户目录，登录状态保存在本地磁盘</p>
        </div>
        <button
          type="button"
          onClick={() => setCreateProfileOpen(true)}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[12px] text-fg-muted transition-colors hover:bg-panel-hover hover:text-fg"
        >
          <Plus size={14} />
          创建 Profile
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-panel">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-line bg-bg text-[11px] text-fg-muted">
              <th className="px-4 py-2.5 font-medium">平台</th>
              <th className="px-4 py-2.5 font-medium">Profile 名称</th>
              <th className="px-4 py-2.5 font-medium">状态</th>
              <th className="px-4 py-2.5 font-medium">最近打开</th>
              <th className="px-4 py-2.5 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {profiles.length === 0 && !loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[12px] text-fg-muted">
                  还没有浏览器 Profile。先创建一个，再添加平台账号。
                </td>
              </tr>
            ) : null}
            {profiles.map((profile) => {
              const meta = PROFILE_STATUS_META[profile.status];
              const running = profile.status === 'running';
              return (
                <tr key={profile.id} className="border-b border-line last:border-b-0 hover:bg-panel-hover/50">
                  <td className="px-4 py-2.5"><PlatformBadge platform={profile.platform} name={profile.platformName} /></td>
                  <td className="px-4 py-2.5">
                    <div className="text-[13px] font-medium">{profile.name}</div>
                    <div className="text-[11px] text-fg-muted">browser-profiles/{profile.profilePath}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusChip tone={meta.tone} label={meta.label} />
                    {boundProfileIds.has(profile.id) ? (
                      <span className="ml-2 text-[10px] text-fg-muted">已绑定账号</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-fg-muted">{formatOpenedAt(profile.lastOpenedAt)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      {running ? (
                        <button
                          type="button"
                          disabled={busyRef.current}
                          onClick={() => void withBusy(`profile-${profile.id}`, () => window.newMedia.browserProfile.close(profile.id))}
                          className="flex h-7 items-center gap-1 rounded-lg border border-line px-2.5 text-[11px] text-fg-muted transition-colors hover:bg-panel-hover hover:text-fg disabled:opacity-50"
                        >
                          <Square size={10} /> 关闭浏览器
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busyRef.current}
                          onClick={() => void withBusy(`profile-${profile.id}`, () => window.newMedia.browserProfile.launch(profile.id))}
                          className="flex h-7 items-center gap-1 rounded-lg border border-line px-2.5 text-[11px] text-fg-muted transition-colors hover:bg-panel-hover hover:text-fg disabled:opacity-50"
                        >
                          <Play size={10} /> {profile.status === 'crashed' ? '重新启动' : '打开浏览器'}
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`重命名${profile.name}`}
                        disabled={busyRef.current}
                        onClick={() => setRenaming(profile)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-panel-hover hover:text-fg disabled:opacity-50"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        type="button"
                        aria-label={`删除${profile.name}`}
                        disabled={busyRef.current}
                        onClick={() => setConfirmDeleteProfileId(profile.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-panel-hover hover:text-danger disabled:opacity-50"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {confirmDeleteProfileId !== null ? (
          <div className="flex items-center justify-between gap-3 border-t border-warning bg-warning-soft px-4 py-2.5 text-[12px] text-warning">
            <span>删除后该 Profile 的本地登录状态会一并清除（已绑定账号时需先删除账号），确定删除？</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const id = confirmDeleteProfileId;
                  setConfirmDeleteProfileId(null);
                  void withBusy(`profile-${id}`, () => window.newMedia.browserProfile.delete(id));
                }}
                className="rounded-lg bg-danger px-3 py-1 text-[11px] text-white"
              >
                删除
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteProfileId(null)}
                className="rounded-lg border border-line bg-panel px-3 py-1 text-[11px] text-fg-muted"
              >
                取消
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* ============ 开发调试 ============ */}
      {debugInfo ? (
        <details className="mt-6 rounded-xl border border-line bg-panel">
          <summary className="cursor-pointer px-4 py-3 text-[13px] font-semibold">开发调试 · 最近一次登录检测</summary>
          <div className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-fg-muted">
            <div className="grid grid-cols-2 gap-2">
              <div>Platform: <span className="text-fg">{debugInfo.platform}</span></div>
              <div>Profile: <span className="text-fg">{debugInfo.profilePath}</span></div>
              <div>Result: <span className="text-fg">{debugInfo.debug.login.loggedIn ? 'logged_in' : (debugInfo.debug.login.reason ?? 'logged_out')}</span></div>
              <div>耗时: <span className="text-fg">{debugInfo.debug.durationMs}ms</span></div>
              <div className="col-span-2 truncate">URL: <span className="text-fg">{debugInfo.debug.finalUrl}</span></div>
            </div>
            <ol className="mt-2 flex list-decimal flex-col gap-0.5 pl-4">
              {debugInfo.debug.steps.map((step, index) => (
                <li key={`${index}-${step}`}>{step}</li>
              ))}
            </ol>
          </div>
        </details>
      ) : null}

      {createProfileOpen ? (
        <CreateProfileDialog
          platforms={platformCatalog}
          onClose={() => setCreateProfileOpen(false)}
          onCreated={async () => {
            setCreateProfileOpen(false);
            await loadAll();
          }}
          onError={setError}
        />
      ) : null}

      {createAccountOpen ? (
        <CreateAccountDialog
          platforms={platformCatalog}
          profiles={profiles.filter((profile) => !boundProfileIds.has(profile.id))}
          onClose={() => setCreateAccountOpen(false)}
          onCreated={async () => {
            setCreateAccountOpen(false);
            await loadAll();
          }}
          onError={setError}
        />
      ) : null}

      {customPlatformOpen ? (
        <CreateCustomPlatformDialog
          onClose={() => setCustomPlatformOpen(false)}
          onCreated={async () => {
            setCustomPlatformOpen(false);
            await loadAll();
          }}
          onError={setError}
        />
      ) : null}

      {renaming ? (
        <RenameDialog
          profile={renaming}
          onClose={() => setRenaming(null)}
          onRenamed={async () => {
            setRenaming(null);
            await loadAll();
          }}
          onError={setError}
        />
      ) : null}
    </div>
  );
}

function CreateAccountDialog({
  platforms,
  profiles,
  onClose,
  onCreated,
  onError,
}: {
  platforms: PlatformCatalogEntry[];
  profiles: BrowserProfile[];
  onClose: () => void;
  onCreated: () => Promise<void>;
  onError: (message: string) => void;
}): ReactNode {
  const [platform, setPlatform] = useState<Platform>('douyin');
  const [name, setName] = useState('');
  const [profileId, setProfileId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const platformProfiles = profiles.filter((profile) => profile.platform === platform);
  const valid = name.trim().length > 0 && profileId !== null;

  async function submit(): Promise<void> {
    if (!valid || saving || profileId === null) return;
    setSaving(true);
    try {
      await window.newMedia.account.create({ platform, name: name.trim(), profileId });
      await onCreated();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : '创建失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogShell title="添加平台账号" onClose={onClose}>
      <label className="block text-[12px] text-fg-muted">
        平台
        <select
          value={platform}
          onChange={(event) => {
            setPlatform(event.target.value as Platform);
            setProfileId(null);
          }}
          className="mt-1 h-9 w-full rounded-lg border border-line bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-accent"
        >
          {platforms.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}{item.builtin ? '' : '（自定义平台）'}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 block text-[12px] text-fg-muted">
        账号名称
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={60}
          placeholder="例如：我的抖音主账号"
          className="mt-1 h-9 w-full rounded-lg border border-line bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-accent"
        />
      </label>
      <label className="mt-3 block text-[12px] text-fg-muted">
        绑定浏览器 Profile
        <select
          value={profileId ?? ''}
          onChange={(event) => setProfileId(event.target.value ? Number(event.target.value) : null)}
          className="mt-1 h-9 w-full rounded-lg border border-line bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-accent"
        >
          <option value="">{platformProfiles.length === 0 ? '（该平台还没有可用 Profile）' : '请选择'}</option>
          {platformProfiles.map((profile) => (
            <option key={profile.id} value={profile.id}>{profile.name}</option>
          ))}
        </select>
      </label>
      <p className="mt-3 rounded-lg bg-panel-hover px-2.5 py-2 text-[11px] leading-relaxed text-fg-muted">
        {!PLATFORMS.find((item) => item.id === platform)?.adapterReady
          ? '该平台的登录检测适配器尚未实现（Phase 9），当前可以先绑定 Profile 并打开浏览器手动登录。'
          : '添加后点「登录账号」打开创作者中心，由你手动完成登录，之后可随时「检查登录」。'}
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-line px-3.5 py-1.5 text-[12px] text-fg-muted hover:text-fg">
          取消
        </button>
        <button
          type="button"
          disabled={!valid || saving}
          onClick={() => void submit()}
          className="rounded-lg bg-accent px-3.5 py-1.5 text-[12px] font-medium text-accent-fg disabled:opacity-50"
        >
          {saving ? '添加中…' : '添加'}
        </button>
      </div>
    </DialogShell>
  );
}

function CreateProfileDialog({
  platforms,
  onClose,
  onCreated,
  onError,
}: {
  platforms: PlatformCatalogEntry[];
  onClose: () => void;
  onCreated: () => Promise<void>;
  onError: (message: string) => void;
}): ReactNode {
  const [platform, setPlatform] = useState<Platform>('douyin');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const valid = name.trim().length > 0;

  async function submit(): Promise<void> {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await window.newMedia.browserProfile.create({ platform, name: name.trim() });
      await onCreated();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : '创建失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogShell title="创建浏览器 Profile" onClose={onClose}>
      <label className="block text-[12px] text-fg-muted">
        平台
        <select
          value={platform}
          onChange={(event) => setPlatform(event.target.value as Platform)}
          className="mt-1 h-9 w-full rounded-lg border border-line bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-accent"
        >
          {(platforms ?? []).map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </label>
      <label className="mt-3 block text-[12px] text-fg-muted">
        Profile 名称
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={60}
          placeholder="例如：抖音主账号"
          className="mt-1 h-9 w-full rounded-lg border border-line bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-accent"
        />
      </label>
      <p className="mt-3 rounded-lg bg-panel-hover px-2.5 py-2 text-[11px] leading-relaxed text-fg-muted">
        创建后会在 browser-profiles/ 下生成独立目录。打开浏览器后你可以访问任意页面并手动完成登录；
        登录状态保存在本地，下次打开同一 Profile 无需重新登录。
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-line px-3.5 py-1.5 text-[12px] text-fg-muted hover:text-fg">
          取消
        </button>
        <button
          type="button"
          disabled={!valid || saving}
          onClick={() => void submit()}
          className="rounded-lg bg-accent px-3.5 py-1.5 text-[12px] font-medium text-accent-fg disabled:opacity-50"
        >
          {saving ? '创建中…' : '创建'}
        </button>
      </div>
    </DialogShell>
  );
}

function RenameDialog({
  profile,
  onClose,
  onRenamed,
  onError,
}: {
  profile: BrowserProfile;
  onClose: () => void;
  onRenamed: () => Promise<void>;
  onError: (message: string) => void;
}): ReactNode {
  const [name, setName] = useState(profile.name);
  const [saving, setSaving] = useState(false);
  const valid = name.trim().length > 0 && name.trim() !== profile.name;

  async function submit(): Promise<void> {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await window.newMedia.browserProfile.rename({ id: profile.id, name: name.trim() });
      await onRenamed();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : '重命名失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogShell title="重命名 Profile" onClose={onClose}>
      <label className="block text-[12px] text-fg-muted">
        新名称
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={60}
          className="mt-1 h-9 w-full rounded-lg border border-line bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-accent"
        />
      </label>
      <p className="mt-3 text-[11px] text-fg-muted">仅修改显示名称；磁盘目录名保持不变，不影响已保存的登录状态。</p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-line px-3.5 py-1.5 text-[12px] text-fg-muted hover:text-fg">
          取消
        </button>
        <button
          type="button"
          disabled={!valid || saving}
          onClick={() => void submit()}
          className="rounded-lg bg-accent px-3.5 py-1.5 text-[12px] font-medium text-accent-fg disabled:opacity-50"
        >
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </DialogShell>
  );
}

function CreateCustomPlatformDialog({
  onClose,
  onCreated,
  onError,
}: {
  onClose: () => void;
  onCreated: () => Promise<void>;
  onError: (message: string) => void;
}): ReactNode {
  const [name, setName] = useState('');
  const [creatorUrl, setCreatorUrl] = useState('');
  const [loginUrlPattern, setLoginUrlPattern] = useState('');
  const [saving, setSaving] = useState(false);
  const valid = name.trim().length > 0 && creatorUrl.trim().length > 0;

  async function submit(): Promise<void> {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await window.newMedia.platformCustom.create({
        name: name.trim(),
        creatorUrl: creatorUrl.trim(),
        loginUrlPattern: loginUrlPattern.trim() === '' ? null : loginUrlPattern.trim(),
      });
      await onCreated();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : '创建失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogShell title="添加自定义平台" onClose={onClose}>
      <label className="block text-[12px] text-fg-muted">
        平台名称
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={40}
          placeholder="例如：快手"
          className="mt-1 h-9 w-full rounded-lg border border-line bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-accent"
        />
      </label>
      <label className="mt-3 block text-[12px] text-fg-muted">
        创作者中心地址
        <input
          value={creatorUrl}
          onChange={(event) => setCreatorUrl(event.target.value)}
          placeholder="例如：https://cp.kuaishou.com"
          className="mt-1 h-9 w-full rounded-lg border border-line bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-accent"
        />
      </label>
      <label className="mt-3 block text-[12px] text-fg-muted">
        未登录跳转地址特征（可选）
        <input
          value={loginUrlPattern}
          onChange={(event) => setLoginUrlPattern(event.target.value)}
          placeholder="例如：passport|login"
          className="mt-1 h-9 w-full rounded-lg border border-line bg-bg px-2.5 font-mono text-[12px] text-fg outline-none focus:border-accent"
        />
      </label>
      <p className="mt-3 rounded-lg bg-panel-hover px-2.5 py-2 text-[11px] leading-relaxed text-fg-muted">
        登录检测原理：打开创作者中心后，如果页面跳转到匹配该特征的地址即判定为「未登录」。
        不填时使用通用特征（地址含 login / passport / signin）。登录一律由你在浏览器中手动完成。
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-line px-3.5 py-1.5 text-[12px] text-fg-muted hover:text-fg">
          取消
        </button>
        <button
          type="button"
          disabled={!valid || saving}
          onClick={() => void submit()}
          className="rounded-lg bg-accent px-3.5 py-1.5 text-[12px] font-medium text-accent-fg disabled:opacity-50"
        >
          {saving ? '创建中…' : '创建'}
        </button>
      </div>
    </DialogShell>
  );
}

function DialogShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }): ReactNode {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-[420px] rounded-xl border border-line bg-panel p-4 shadow-lg" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold">{title}</h3>
          <button type="button" aria-label="关闭" onClick={onClose} className="text-fg-muted hover:text-fg">
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

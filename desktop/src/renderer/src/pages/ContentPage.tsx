import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, CheckSquare, Clapperboard, Pencil, Plus, RefreshCw, Rocket, Search, Sparkles, Trash2, UploadCloud, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CONTENT_STATUS_META } from '@shared/constants/platforms';
import type { AccountView, ContentItem, ContentStatus } from '@shared/types/domain';
import type { AiIdeasResult, ImportResult } from '@shared/types/ipc';
import { formatBytes, formatDuration, StatusChip } from '@renderer/components/ui';

interface Banner {
  tone: 'success' | 'error';
  text: string;
}

async function importDroppedFiles(files: FileList): Promise<ImportResult | null> {
  if (files.length === 0) return null;
  const paths: string[] = [];
  for (const file of Array.from(files)) {
    const path = window.newMedia.utility.getPathForFile(file);
    if (path) paths.push(path);
  }
  if (paths.length === 0) return null;
  return window.newMedia.content.importFiles(paths);
}

export function ContentPage(): ReactNode {
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [search, setSearch] = useState('');
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<ContentItem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [taskContent, setTaskContent] = useState<ContentItem | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const navigate = useNavigate();
  const dragCounter = useRef(0);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBanner = useCallback((tone: Banner['tone'], text: string): void => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setBanner({ tone, text });
    bannerTimer.current = setTimeout(() => setBanner(null), 5000);
  }, []);

  const loadContents = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      setContents(await window.newMedia.content.list());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '内容列表加载失败');
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await loadContents();
      setLoading(false);
    })();
  }, [loadContents]);

  const runImport = useCallback(
    async (task: () => Promise<ImportResult | null>): Promise<void> => {
      setImporting(true);
      try {
        const result = await task();
        if (result) {
          const imported = result.imported.length;
          const { skipped } = result;
          if (imported === 0 && skipped > 0) {
            showBanner('error', `没有导入新内容：${skipped} 个文件是重复或不支持的视频格式`);
          } else {
            showBanner('success', `已导入 ${imported} 个视频${skipped > 0 ? `，跳过 ${skipped} 个重复/不支持的文件` : ''}`);
          }
          await loadContents();
        }
      } catch (cause) {
        showBanner('error', cause instanceof Error ? cause.message : '导入失败');
      } finally {
        setImporting(false);
      }
    },
    [loadContents, showBanner],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>): void => {
      event.preventDefault();
      dragCounter.current = 0;
      setDragging(false);
      void runImport(() => importDroppedFiles(event.dataTransfer.files));
    },
    [runImport],
  );

  async function handleSaveEdit(id: number, patch: { title: string; description: string; tags: string[] }): Promise<void> {
    try {
      await window.newMedia.content.update(id, patch);
      setEditing(null);
      await loadContents();
      showBanner('success', '内容已保存');
    } catch (cause) {
      showBanner('error', cause instanceof Error ? cause.message : '保存失败');
    }
  }

  async function handleDelete(id: number): Promise<void> {
    try {
      await window.newMedia.content.remove(id);
      setContents((current) => current.filter((item) => item.id !== id));
      setConfirmDeleteId(null);
      showBanner('success', '内容已删除');
    } catch (cause) {
      setConfirmDeleteId(null);
      showBanner('error', cause instanceof Error ? cause.message : '删除失败');
    }
  }

  function toggleSelect(id: number): void {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode(): void {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  const selectedContents = contents.filter((content) => selectedIds.has(content.id));

  const keyword = search.trim().toLowerCase();
  const filtered = keyword
    ? contents.filter(
        (item) =>
          item.title.toLowerCase().includes(keyword) ||
          item.description.toLowerCase().includes(keyword) ||
          item.tags.some((tag) => tag.toLowerCase().includes(keyword)),
      )
    : contents;

  return (
    <div
      className="relative mx-auto max-w-6xl px-6 py-6"
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        dragCounter.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => {
        dragCounter.current = Math.max(0, dragCounter.current - 1);
        if (dragCounter.current === 0) setDragging(false);
      }}
      onDrop={handleDrop}
    >
      <div className="mb-5 flex items-end justify-between gap-3">
        {selectMode ? (
          <div className="flex w-full items-center justify-between gap-3 rounded-lg border border-accent bg-accent-soft px-3 py-2">
            <span className="text-[13px] font-medium text-accent">
              已选 {selectedIds.size} 项内容
              {selectedIds.size > 0 ? `（将生成 ${selectedIds.size} × 账号数 个发布任务）` : ''}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={selectedIds.size === 0}
                onClick={() => setBatchOpen(true)}
                className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[12px] font-medium text-accent-fg disabled:opacity-50"
              >
                <Rocket size={13} />
                创建发布任务
              </button>
              <button
                type="button"
                onClick={exitSelectMode}
                className="flex h-8 items-center rounded-lg border border-line bg-panel px-3 text-[12px] text-fg-muted hover:text-fg"
              >
                取消选择
              </button>
            </div>
          </div>
        ) : (
          <>
            <div>
              <h1 className="text-[17px] font-semibold">内容库</h1>
              <p className="mt-0.5 text-[12px] text-fg-muted">拖入视频文件即可导入（MP4 / MOV / WebM）</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-56 items-center gap-2 rounded-lg border border-line bg-panel px-2.5 text-fg-muted focus-within:border-accent">
                <Search size={13} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索标题、文案、标签"
                  className="h-full w-full bg-transparent text-[12px] text-fg outline-none placeholder:text-fg-muted"
                />
              </div>
              <button
                type="button"
                onClick={() => void loadContents()}
                aria-label="刷新内容库"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-fg-muted transition-colors hover:bg-panel-hover hover:text-fg"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              </button>
              {contents.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSelectMode(true)}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[12px] text-fg-muted transition-colors hover:bg-panel-hover hover:text-fg"
                >
                  <CheckSquare size={13} />
                  批量发布
                </button>
              ) : null}
              <button
                type="button"
                disabled={importing}
                onClick={() => void runImport(() => window.newMedia.content.pickAndImport())}
                className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[12px] font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                <Plus size={14} />
                {importing ? '导入中…' : '导入视频'}
              </button>
            </div>
          </>
        )}
      </div>

      {banner ? (
        <div
          className={`mb-4 flex items-center justify-between rounded-lg border px-3 py-2 text-[12px] ${
            banner.tone === 'success'
              ? 'border-success bg-success-soft text-success'
              : 'border-danger bg-danger-soft text-danger'
          }`}
        >
          {banner.text}
          <button type="button" aria-label="关闭提示" onClick={() => setBanner(null)}>
            <X size={13} />
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-lg border border-danger bg-danger-soft px-3 py-2 text-[12px] text-danger">{error}</div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-panel px-6 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Clapperboard size={22} strokeWidth={1.6} />
          </span>
          <h2 className="mt-4 text-[15px] font-semibold">{search ? '没有匹配的内容' : '内容库还是空的'}</h2>
          <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-fg-muted">
            {search ? '换个关键词试试。' : '把 MP4 / MOV / WebM 视频拖到这里，或点击右上角「导入视频」。导入后可以编辑标题、文案和话题标签。'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {filtered.map((content) => {
            const selected = selectedIds.has(content.id);
            return (
            <div
              key={content.id}
              onClick={selectMode ? () => toggleSelect(content.id) : undefined}
              className={`group relative rounded-xl border bg-panel p-3 transition-shadow ${
                selectMode ? 'cursor-pointer' : ''
              } ${selected ? 'border-accent ring-1 ring-accent' : 'border-line'} ${selectMode ? 'hover:border-accent/60' : 'hover:shadow-sm'}`}
            >
              {selectMode ? (
                <span
                  className={`absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-md border ${
                    selected ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-panel text-transparent'
                  }`}
                >
                  <Check size={12} strokeWidth={3} />
                </span>
              ) : null}
              <div className="relative flex h-28 w-full items-center justify-center rounded-lg border border-line bg-panel-hover text-fg-muted">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2" y="5" width="20" height="14" rx="3" /><path d="m10 9 5 3-5 3z" /></svg>
                <span className="absolute bottom-1.5 left-2 text-[10px] text-fg-muted">{formatBytes(content.fileSizeBytes)}</span>
                {content.durationSeconds > 0 ? (
                  <span className="absolute bottom-1.5 right-2 rounded bg-black/50 px-1 text-[10px] text-white">
                    {formatDuration(content.durationSeconds)}
                  </span>
                ) : null}
                {selectMode ? null : (
                  <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      aria-label={`为${content.title}创建发布任务`}
                      onClick={() => setTaskContent(content)}
                      className="flex h-6 w-6 items-center justify-center rounded-md border border-line bg-panel text-fg-muted hover:text-accent"
                    >
                      <Rocket size={11} />
                    </button>
                    <button
                      type="button"
                      aria-label={`编辑${content.title}`}
                      onClick={() => setEditing(content)}
                      className="flex h-6 w-6 items-center justify-center rounded-md border border-line bg-panel text-fg-muted hover:text-fg"
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      type="button"
                      aria-label={`删除${content.title}`}
                      onClick={() => setConfirmDeleteId(content.id)}
                      className="flex h-6 w-6 items-center justify-center rounded-md border border-line bg-panel text-fg-muted hover:text-danger"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-2.5">
                <div className="truncate text-[13px] font-medium" title={content.title}>{content.title}</div>
                <div className="mt-1 line-clamp-2 min-h-[28px] text-[11px] leading-snug text-fg-muted">
                  {content.description || '暂无文案'}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap gap-1">
                    {content.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="max-w-20 truncate rounded-md bg-idle-soft px-1.5 py-0.5 text-[10px] text-fg-muted">
                        #{tag}
                      </span>
                    ))}
                    {content.tags.length > 3 ? (
                      <span className="text-[10px] text-fg-muted">+{content.tags.length - 3}</span>
                    ) : null}
                  </div>
                  <StatusChip tone={CONTENT_STATUS_META[content.status as ContentStatus].tone} label={CONTENT_STATUS_META[content.status as ContentStatus].label} />
                </div>
              </div>

              {confirmDeleteId === content.id ? (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-panel/95">
                  <div className="px-3 text-center text-[12px]">删除「{content.title}」？<br />相关发布记录会一并删除。</div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleDelete(content.id)}
                      className="rounded-lg bg-danger px-3 py-1 text-[12px] text-white"
                    >
                      删除
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="rounded-lg border border-line px-3 py-1 text-[12px] text-fg-muted"
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

      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent-soft">
          <div className="flex flex-col items-center gap-2 text-accent">
            <UploadCloud size={32} strokeWidth={1.4} />
            <span className="text-[13px] font-medium">松开导入视频文件</span>
          </div>
        </div>
      ) : null}

      {editing ? (
        <EditDialog
          content={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => void handleSaveEdit(editing.id, patch)}
        />
      ) : null}

      {taskContent ? (
        <CreateTaskDialog
          content={taskContent}
          onClose={() => setTaskContent(null)}
          onCreated={async () => {
            setTaskContent(null);
            showBanner('success', '发布任务已创建，可在「发布任务」页启动');
            navigate('/tasks');
          }}
          onError={(message) => showBanner('error', message)}
        />
      ) : null}

      {batchOpen ? (
        <BatchPublishDialog
          contents={selectedContents}
          onClose={() => setBatchOpen(false)}
          onCreated={async (created, skipped) => {
            setBatchOpen(false);
            exitSelectMode();
            showBanner(
              'success',
              `已创建 ${created} 个发布任务${skipped > 0 ? `，跳过 ${skipped} 个（重复或不可发布）` : ''}，队列将依次执行`,
            );
            navigate('/tasks');
          }}
          onError={(message) => showBanner('error', message)}
        />
      ) : null}
    </div>
  );
}

function CreateTaskDialog({
  content,
  onClose,
  onCreated,
  onError,
}: {
  content: ContentItem;
  onClose: () => void;
  onCreated: () => Promise<void>;
  onError: (message: string) => void;
}): ReactNode {
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void window.newMedia.account
      .list()
      .then((list) => {
        const douyinAccounts = list.filter((account) => account.platform === 'douyin');
        setAccounts(douyinAccounts);
        if (douyinAccounts.length > 0) setAccountId(douyinAccounts[0].id);
      })
      .catch(() => setAccounts([]));
  }, []);

  async function submit(): Promise<void> {
    if (accountId === null || saving) return;
    setSaving(true);
    try {
      await window.newMedia.publish.create({ contentId: content.id, accountId });
      await onCreated();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : '任务创建失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-[440px] rounded-xl border border-line bg-panel p-4 shadow-lg" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold">创建抖音发布任务</h3>
          <button type="button" aria-label="关闭" onClick={onClose} className="text-fg-muted hover:text-fg">
            <X size={15} />
          </button>
        </div>
        <div className="rounded-lg bg-panel-hover px-3 py-2.5 text-[12px]">
          <div className="truncate font-medium">{content.title}</div>
          <div className="mt-0.5 text-[11px] text-fg-muted">
            {content.tags.length > 0 ? content.tags.map((tag) => `#${tag}`).join(' ') : '暂无话题标签'}
          </div>
        </div>
        <label className="mt-3 block text-[12px] text-fg-muted">
          发布到抖音账号
          <select
            value={accountId ?? ''}
            onChange={(event) => setAccountId(event.target.value ? Number(event.target.value) : null)}
            className="mt-1 h-9 w-full rounded-lg border border-line bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-accent"
          >
            {accounts.length === 0 ? <option value="">（还没有抖音账号，请先在账号管理添加）</option> : null}
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </select>
        </label>
        <p className="mt-3 text-[11px] leading-relaxed text-fg-muted">
          任务创建后是「等待执行」状态；启动后会自动打开浏览器完成上传与内容填写，
          之后停在发布页等待你人工确认，绝不会自动点击最终发布。
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-3.5 py-1.5 text-[12px] text-fg-muted hover:text-fg">
            取消
          </button>
          <button
            type="button"
            disabled={accountId === null || saving}
            onClick={() => void submit()}
            className="rounded-lg bg-accent px-3.5 py-1.5 text-[12px] font-medium text-accent-fg disabled:opacity-50"
          >
            {saving ? '创建中…' : '创建任务'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditDialog({
  content,
  onClose,
  onSave,
}: {
  content: ContentItem;
  onClose: () => void;
  onSave: (patch: { title: string; description: string; tags: string[] }) => void;
}): ReactNode {
  const [title, setTitle] = useState(content.title);
  const [description, setDescription] = useState(content.description);
  const [tagsText, setTagsText] = useState(content.tags.join('，'));
  const titleValid = title.trim().length > 0 && title.trim().length <= 255;

  const [aiTopic, setAiTopic] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<AiIdeasResult | null>(null);
  const [selectedTitleIndex, setSelectedTitleIndex] = useState(0);

  async function runAi(): Promise<void> {
    if (aiTopic.trim().length < 2 || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await window.newMedia.ai.generate({ topic: aiTopic.trim() });
      setAiResult(result);
      setSelectedTitleIndex(0);
    } catch (cause) {
      setAiError(cause instanceof Error ? cause.message : 'AI 生成失败');
    } finally {
      setAiLoading(false);
    }
  }

  function applyAi(): void {
    if (!aiResult) return;
    if (aiResult.titles[selectedTitleIndex]) setTitle(aiResult.titles[selectedTitleIndex]);
    if (aiResult.description) setDescription(aiResult.description);
    if (aiResult.tags.length > 0) setTagsText(aiResult.tags.join('，'));
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-[440px] rounded-xl border border-line bg-panel p-4 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold">编辑内容</h3>
          <button type="button" aria-label="关闭" onClick={onClose} className="text-fg-muted hover:text-fg">
            <X size={15} />
          </button>
        </div>

        {/* AI 内容助手 */}
        <div className="mb-3 rounded-lg border border-line bg-panel-hover/50 p-2.5">
          <div className="flex items-center gap-2">
            <Sparkles size={13} className="shrink-0 text-accent" />
            <input
              value={aiTopic}
              onChange={(event) => setAiTopic(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void runAi();
              }}
              placeholder="输入主题，例如：AI 短剧第一集"
              className="h-8 w-full rounded-lg border border-line bg-bg px-2 text-[12px] text-fg outline-none focus:border-accent"
            />
            <button
              type="button"
              disabled={aiTopic.trim().length < 2 || aiLoading}
              onClick={() => void runAi()}
              className="h-8 shrink-0 rounded-lg bg-accent px-3 text-[12px] font-medium text-accent-fg disabled:opacity-50"
            >
              {aiLoading ? '生成中…' : 'AI 生成'}
            </button>
          </div>
          {aiError ? <p className="mt-2 text-[11px] text-danger">{aiError}</p> : null}
          {aiResult ? (
            <div className="mt-2 rounded-lg bg-panel px-2.5 py-2">
              <div className="text-[11px] font-medium text-fg-muted">标题建议（点击选用）</div>
              <div className="mt-1 flex flex-col gap-1">
                {aiResult.titles.map((titleOption, index) => (
                  <button
                    key={`${index}-${titleOption}`}
                    type="button"
                    onClick={() => setSelectedTitleIndex(index)}
                    className={`rounded-lg border px-2 py-1 text-left text-[12px] transition-colors ${
                      selectedTitleIndex === index
                        ? 'border-accent bg-accent-soft font-medium text-accent'
                        : 'border-line text-fg hover:bg-panel-hover'
                    }`}
                  >
                    {titleOption}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-[11px] text-fg-muted">
                <div className="line-clamp-2">文案：{aiResult.description || '—'}</div>
                <div className="mt-1">话题：{aiResult.tags.map((tag) => `#${tag}`).join(' ')}</div>
                {aiResult.coverText ? <div className="mt-1">封面文案：{aiResult.coverText}</div> : null}
              </div>
              <button
                type="button"
                onClick={applyAi}
                className="mt-2 w-full rounded-lg border border-accent px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent-soft"
              >
                应用到下方表单
              </button>
            </div>
          ) : null}
        </div>

        <label className="block text-[12px] text-fg-muted">
          标题
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={255}
            className="mt-1 h-9 w-full rounded-lg border border-line bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-accent"
          />
        </label>
        <label className="mt-3 block text-[12px] text-fg-muted">
          文案 / 简介
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={5}
            maxLength={20000}
            className="mt-1 w-full resize-none rounded-lg border border-line bg-bg px-2.5 py-2 text-[13px] leading-relaxed text-fg outline-none focus:border-accent"
          />
        </label>
        <label className="mt-3 block text-[12px] text-fg-muted">
          话题标签（用逗号分隔，最多 30 个）
          <input
            value={tagsText}
            onChange={(event) => setTagsText(event.target.value)}
            placeholder="短剧，AI短剧，剧情"
            className="mt-1 h-9 w-full rounded-lg border border-line bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-accent"
          />
        </label>
        <div className="mt-3 rounded-lg bg-panel-hover px-2.5 py-2 text-[11px] text-fg-muted">
          视频文件：{content.videoPath ? content.videoPath.split(/[\\/]/).pop() : '—'} · 所属平台在创建发布任务时选择
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-3.5 py-1.5 text-[12px] text-fg-muted hover:text-fg">
            取消
          </button>
          <button
            type="button"
            disabled={!titleValid}
            onClick={() =>
              onSave({
                title: title.trim(),
                description: description.trim(),
                tags: tagsText
                  .split(/[,，]/)
                  .map((tag) => tag.trim())
                  .filter((tag) => tag.length > 0)
                  .slice(0, 30),
              })
            }
            className="rounded-lg bg-accent px-3.5 py-1.5 text-[12px] font-medium text-accent-fg disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function BatchPublishDialog({
  contents,
  onClose,
  onCreated,
  onError,
}: {
  contents: ContentItem[];
  onClose: () => void;
  onCreated: (created: number, skipped: number) => Promise<void>;
  onError: (message: string) => void;
}): ReactNode {
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [checkedAccounts, setCheckedAccounts] = useState<Set<number>>(new Set());
  const [scheduleValue, setScheduleValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void window.newMedia.account
      .list()
      .then((list) => {
        const douyinAccounts = list.filter((account) => account.platform === 'douyin');
        setAccounts(douyinAccounts);
        setCheckedAccounts(new Set(douyinAccounts.map((account) => account.id)));
      })
      .catch(() => setAccounts([]));
  }, []);

  function toggleAccount(id: number): void {
    setCheckedAccounts((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const total = contents.length * checkedAccounts.size;

  async function submit(): Promise<void> {
    if (checkedAccounts.size === 0 || saving) return;
    setSaving(true);
    try {
      const result = await window.newMedia.publish.createBatch({
        contentIds: contents.map((content) => content.id),
        accountIds: [...checkedAccounts],
        scheduledAt: scheduleValue ? new Date(scheduleValue).toISOString() : null,
      });
      await onCreated(result.created.length, result.skipped);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : '批量任务创建失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-[520px] rounded-xl border border-line bg-panel p-4 shadow-lg" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold">批量创建发布任务</h3>
          <button type="button" aria-label="关闭" onClick={onClose} className="text-fg-muted hover:text-fg">
            <X size={15} />
          </button>
        </div>

        <div className="max-h-28 overflow-y-auto rounded-lg bg-panel-hover px-3 py-2">
          {contents.map((content) => (
            <div key={content.id} className="truncate py-0.5 text-[12px]">{content.title}</div>
          ))}
        </div>

        <div className="mt-3 text-[12px] font-medium">发布到抖音账号（可多选）</div>
        <div className="mt-1.5 flex max-h-32 flex-col gap-1 overflow-y-auto">
          {accounts.length === 0 ? (
            <p className="text-[11px] text-fg-muted">还没有抖音账号，请先到「账号管理」添加并登录。</p>
          ) : null}
          {accounts.map((account) => {
            const checked = checkedAccounts.has(account.id);
            return (
              <label key={account.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-[12px] hover:bg-panel-hover">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleAccount(account.id)}
                  className="h-3.5 w-3.5 accent-[var(--app-accent)]"
                />
                <span className="font-medium">{account.name}</span>
                <span className="text-[11px] text-fg-muted">
                  {account.loginStatus === 'logged_in' ? '已登录' : account.loginStatus === 'logged_out' ? '未登录' : '登录状态未知'}
                </span>
              </label>
            );
          })}
        </div>

        <label className="mt-3 block text-[12px] text-fg-muted">
          计划发布时间（可选，留空为立即进入队列）
          <input
            type="datetime-local"
            value={scheduleValue}
            onChange={(event) => setScheduleValue(event.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-line bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-accent"
          />
        </label>

        <p className="mt-3 rounded-lg bg-panel-hover px-2.5 py-2 text-[11px] leading-relaxed text-fg-muted">
          将为 {contents.length} 条内容 × {checkedAccounts.size} 个账号生成 <span className="font-medium text-accent">{total} 个任务</span>，
          队列按优先级与计划时间依次执行；每个任务仍会停在发布页等待你人工确认，绝不自动发布。
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-3.5 py-1.5 text-[12px] text-fg-muted hover:text-fg">
            取消
          </button>
          <button
            type="button"
            disabled={total === 0 || saving}
            onClick={() => void submit()}
            className="rounded-lg bg-accent px-3.5 py-1.5 text-[12px] font-medium text-accent-fg disabled:opacity-50"
          >
            {saving ? '创建中…' : `创建 ${total} 个任务`}
          </button>
        </div>
      </div>
    </div>
  );
}

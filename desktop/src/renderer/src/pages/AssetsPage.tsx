import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Clapperboard,
  FileAudio2,
  FileText,
  Image as ImageIcon,
  RefreshCw,
  Search,
  Star,
  Trash2,
  UploadCloud,
  X,
  ExternalLink,
} from 'lucide-react';
import { ASSET_TYPE_META } from '@shared/constants/platforms';
import type { AssetItem, AssetType } from '@shared/types/domain';
import { formatBytes } from '@renderer/components/ui';

type TypeFilter = 'all' | 'video' | 'image' | 'audio' | 'font';

interface Banner {
  tone: 'success' | 'error';
  text: string;
}

function assetIcon(type: AssetType): ReactNode {
  if (type === 'image') return <ImageIcon size={22} strokeWidth={1.4} />;
  if (type === 'audio') return <FileAudio2 size={22} strokeWidth={1.4} />;
  if (type === 'font') return <FileText size={22} strokeWidth={1.4} />;
  return <Clapperboard size={22} strokeWidth={1.4} />;
}

/** 图片素材的缩略图（file:// 由 CSP 放行，仅本地应用使用）。 */
function AssetThumb({ asset }: { asset: AssetItem }): ReactNode {
  if (asset.type === 'image') {
    return (
      <img
        src={`file://${asset.path.split('\\').join('/')}`}
        alt={asset.name}
        className="h-full w-full rounded-lg object-cover"
        draggable={false}
      />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center rounded-lg bg-panel-hover text-fg-muted">
      {assetIcon(asset.type)}
    </div>
  );
}

export function AssetsPage(): ReactNode {
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<AssetItem | null>(null);
  const dragCounter = useRef(0);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBanner = useCallback((tone: Banner['tone'], text: string): void => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setBanner({ tone, text });
    bannerTimer.current = setTimeout(() => setBanner(null), 5000);
  }, []);

  const loadAssets = useCallback(async (): Promise<void> => {
    try {
      setAssets(
        await window.newMedia.asset.list({
          type: typeFilter,
          search: search.trim() || undefined,
          favorite: favoriteOnly || undefined,
        }),
      );
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '素材列表加载失败');
    }
  }, [typeFilter, search, favoriteOnly]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  async function importPaths(paths: string[]): Promise<void> {
    try {
      const result = await window.newMedia.asset.importPaths(paths);
      if (result.imported.length === 0 && result.skipped > 0) {
        showBanner('error', `没有导入新素材：${result.skipped} 个文件重复或不支持的格式`);
      } else {
        showBanner('success', `已导入 ${result.imported.length} 个素材${result.skipped > 0 ? `，跳过 ${result.skipped} 个` : ''}`);
      }
      await loadAssets();
    } catch (cause) {
      showBanner('error', cause instanceof Error ? cause.message : '导入失败');
    }
  }

  async function handleDelete(asset: AssetItem): Promise<void> {
    try {
      await window.newMedia.asset.remove(asset.id);
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      showBanner('success', `素材「${asset.name}」已移除（原文件保留）`);
    } catch (cause) {
      showBanner('error', cause instanceof Error ? cause.message : '删除失败');
    }
  }

  async function handlePreviewOpen(asset: AssetItem): Promise<void> {
    await window.newMedia.asset.openInSystem(asset.path);
  }

  const filters: { value: TypeFilter; label: string }[] = [
    { value: 'all', label: '全部' },
    { value: 'video', label: ASSET_TYPE_META.video.label },
    { value: 'image', label: ASSET_TYPE_META.image.label },
    { value: 'audio', label: ASSET_TYPE_META.audio.label },
    { value: 'font', label: ASSET_TYPE_META.font.label },
  ];

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
      onDrop={(event) => {
        event.preventDefault();
        dragCounter.current = 0;
        setDragging(false);
        const paths: string[] = [];
        for (const file of Array.from(event.dataTransfer.files)) {
          const path = window.newMedia.utility.getPathForFile(file);
          if (path) paths.push(path);
        }
        if (paths.length > 0) void importPaths(paths);
      }}
    >
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[17px] font-semibold">素材库</h1>
          <p className="mt-0.5 text-[12px] text-fg-muted">拖入视频、图片、音频、字体文件统一管理（引用原文件，不复制不占用双份空间）</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-52 items-center gap-2 rounded-lg border border-line bg-panel px-2.5 text-fg-muted focus-within:border-accent">
            <Search size={13} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索名称、标签"
              className="h-full w-full bg-transparent text-[12px] text-fg outline-none placeholder:text-fg-muted"
            />
          </div>
          <button
            type="button"
            aria-label="刷新素材"
            onClick={() => void loadAssets()}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-fg-muted transition-colors hover:bg-panel-hover hover:text-fg"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={() => void window.newMedia.asset.pickAndImport().then((result) => {
              if (result.imported.length > 0 || result.skipped > 0) {
                showBanner('success', `已导入 ${result.imported.length} 个素材${result.skipped > 0 ? `，跳过 ${result.skipped} 个` : ''}`);
              }
              void loadAssets();
            })}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[12px] font-medium text-accent-fg transition-opacity hover:opacity-90"
          >
            <UploadCloud size={13} />
            导入素材
          </button>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2">
        {filters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setTypeFilter(filter.value)}
            className={`rounded-lg border px-3 py-1.5 text-[12px] transition-colors ${
              typeFilter === filter.value
                ? 'border-accent bg-accent-soft font-medium text-accent'
                : 'border-line text-fg-muted hover:bg-panel-hover hover:text-fg'
            }`}
          >
            {filter.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setFavoriteOnly((value) => !value)}
          className={`ml-2 flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12px] transition-colors ${
            favoriteOnly ? 'border-warning bg-warning-soft font-medium text-warning' : 'border-line text-fg-muted hover:text-fg'
          }`}
        >
          <Star size={12} fill={favoriteOnly ? 'currentColor' : 'none'} />
          只看收藏
        </button>
      </div>

      {banner ? (
        <div
          className={`mb-4 flex items-center justify-between rounded-lg border px-3 py-2 text-[12px] ${
            banner.tone === 'success' ? 'border-success bg-success-soft text-success' : 'border-danger bg-danger-soft text-danger'
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

      {assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-panel px-6 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Clapperboard size={22} strokeWidth={1.6} />
          </span>
          <h2 className="mt-4 text-[15px] font-semibold">素材库还是空的</h2>
          <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-fg-muted">
            把视频 / 图片 / 音频 / 字体文件拖到这里，或点击「导入素材」。素材只记录文件位置，不会复制占用空间。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
          {assets.map((asset) => (
            <div key={asset.id} className="group relative rounded-xl border border-line bg-panel p-3">
              <button
                type="button"
                aria-label={`预览${asset.name}`}
                onClick={() => void handlePreviewOpen(asset)}
                className="block h-28 w-full overflow-hidden rounded-lg border border-line bg-panel-hover"
                title="双击在系统中打开"
              >
                <AssetThumb asset={asset} />
              </button>
              <button
                type="button"
                aria-label={asset.favorite ? '取消收藏' : '收藏'}
                onClick={() =>
                  void window.newMedia.asset.setFavorite(asset.id, !asset.favorite).then(() => loadAssets())
                }
                className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md border border-line bg-panel"
              >
                <Star
                  size={11}
                  className={asset.favorite ? 'text-warning' : 'text-fg-muted'}
                  fill={asset.favorite ? 'currentColor' : 'none'}
                />
              </button>
              <div className="mt-2.5">
                <div className="truncate text-[13px] font-medium" title={asset.name}>{asset.name}</div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-fg-muted">
                  <span>{ASSET_TYPE_META[asset.type].label} · {formatBytes(asset.sizeBytes)}</span>
                </div>
                {asset.tags.length > 0 ? (
                  <div className="mt-1.5 flex min-w-0 flex-wrap gap-1">
                    {asset.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="max-w-20 truncate rounded-md bg-idle-soft px-1.5 py-0.5 text-[10px] text-fg-muted">
                        #{tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="mt-2 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handlePreviewOpen(asset)}
                    className="flex h-7 flex-1 items-center justify-center gap-1 rounded-lg border border-line text-[11px] text-fg-muted hover:text-fg"
                  >
                    <ExternalLink size={10} /> 打开
                  </button>
                  <button
                    type="button"
                    aria-label={`移除素材${asset.name}`}
                    onClick={() => void handleDelete(asset)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-fg-muted hover:text-danger"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent-soft">
          <div className="flex flex-col items-center gap-2 text-accent">
            <UploadCloud size={32} strokeWidth={1.4} />
            <span className="text-[13px] font-medium">松开导入素材文件</span>
          </div>
        </div>
      ) : null}

      {preview ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70" onClick={() => setPreview(null)}>
          <div className="max-w-[80vw] rounded-xl border border-line bg-panel p-3" onClick={(event) => event.stopPropagation()}>
            {preview.type === 'image' ? (
              <img src={`file://${preview.path.split('\\').join('/')}`} alt={preview.name} className="max-h-[70vh] max-w-[76vw] rounded-lg" />
            ) : (
              <div className="p-6 text-center text-[12px] text-fg-muted">{preview.name}（该类型请在系统中打开预览）</div>
            )}
            <div className="mt-2 flex items-center justify-between text-[11px] text-fg-muted">
              <span>{preview.name}</span>
              <button type="button" aria-label="关闭预览" onClick={() => setPreview(null)}>
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
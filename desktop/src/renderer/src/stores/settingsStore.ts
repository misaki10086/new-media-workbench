import { useCallback, useEffect, useState } from 'react';
import type { PublishConfirmMode } from '@shared/types/domain';

interface SettingsState {
  publishConfirmMode: PublishConfirmMode;
  loaded: boolean;
  setPublishConfirmMode: (mode: PublishConfirmMode) => Promise<void>;
}

/** 发布确认模式：存 SQLite settings 表（主进程在 Phase 6 执行发布时读取同一份配置）。 */
export function useSettingsStore(): SettingsState {
  const [publishConfirmMode, setMode] = useState<PublishConfirmMode>('manual_confirm');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void window.newMedia.settings
      .get('publish_confirm_mode')
      .then(setMode)
      .finally(() => setLoaded(true));
  }, []);

  const setPublishConfirmMode = useCallback(async (mode: PublishConfirmMode): Promise<void> => {
    const saved = await window.newMedia.settings.set('publish_confirm_mode', mode);
    setMode(saved);
  }, []);

  return { publishConfirmMode, loaded, setPublishConfirmMode };
}

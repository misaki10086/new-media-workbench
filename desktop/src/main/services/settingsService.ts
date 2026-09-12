import { eq } from 'drizzle-orm';
import { getDatabase } from '../database/db';
import { settings } from '../database/schema';
import type { PublishConfirmMode, ThemePreference } from '@shared/types/domain';

export const SETTINGS_DEFAULTS = {
  publish_confirm_mode: 'manual_confirm',
  ai_base_url: 'https://api.openai.com/v1',
  ai_model: 'gpt-4o-mini',
  ai_api_key: '',
} as const;

export type SettingsKey = keyof typeof SETTINGS_DEFAULTS;

export function getSetting(key: SettingsKey): string {
  const row = getDatabase().select().from(settings).where(eq(settings.key, key)).get();
  if (row) return row.value;
  return SETTINGS_DEFAULTS[key];
}

export function setSetting(key: SettingsKey, value: string): void {
  getDatabase()
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

export function getPublishConfirmMode(): PublishConfirmMode {
  const value = getSetting('publish_confirm_mode');
  return value === 'auto_publish' || value === 'save_draft' ? value : 'manual_confirm';
}

export type { ThemePreference };

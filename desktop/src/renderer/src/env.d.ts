/// <reference types="vite/client" />

import type { NewMediaApi } from '@shared/types/ipc';

declare global {
  interface Window {
    newMedia: NewMediaApi;
  }
}

export {};

import axios from 'axios';
import type {
  AccountInput,
  ContentInput,
  ContentItem,
  PlatformAccount,
  PlatformAuthStatus,
  PublishRecord,
} from './types';

interface ApiEnvelope<T> {
  data: T;
}

interface ErrorEnvelope {
  error?: { message?: string };
  message?: string;
}

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 20_000,
});

export function getErrorMessage(error: unknown, fallback = '操作失败，请稍后重试'): string {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as ErrorEnvelope | undefined;
    if (payload?.error?.message) return payload.error.message;
    if (payload?.message) return payload.message;
    if (error.code === 'ECONNABORTED') return '请求超时，请稍后重试';
    if (!error.response) return '无法连接服务器，请检查服务是否已启动';
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

export const accountApi = {
  async list(): Promise<PlatformAccount[]> {
    const response = await http.get<ApiEnvelope<{ accounts: PlatformAccount[] }>>('/accounts');
    return response.data.data.accounts;
  },
  async create(input: AccountInput): Promise<PlatformAccount> {
    const response = await http.post<ApiEnvelope<{ account: PlatformAccount }>>('/accounts', input);
    return response.data.data.account;
  },
  async remove(id: number): Promise<void> {
    await http.delete(`/accounts/${id}`);
  },
};

export const platformAuthApi = {
  async status(): Promise<PlatformAuthStatus[]> {
    const response = await http.get<ApiEnvelope<{ platforms: PlatformAuthStatus[] }>>('/platform-auth/status');
    return response.data.data.platforms;
  },
  async connectWechat(credentials?: { appId?: string; appSecret?: string }): Promise<PlatformAccount> {
    const response = await http.post<ApiEnvelope<{ account: PlatformAccount }>>('/platform-auth/wechat/connect', credentials ?? {});
    return response.data.data.account;
  },
};

export const contentApi = {
  async list(): Promise<ContentItem[]> {
    const response = await http.get<ApiEnvelope<{ contents: ContentItem[] }>>('/contents');
    return response.data.data.contents;
  },
  async create(input: ContentInput): Promise<ContentItem> {
    const response = await http.post<ApiEnvelope<{ content: ContentItem }>>('/contents', input);
    return response.data.data.content;
  },
  async update(id: number, input: Partial<ContentInput>): Promise<ContentItem> {
    const response = await http.put<ApiEnvelope<{ content: ContentItem }>>(`/contents/${id}`, input);
    return response.data.data.content;
  },
  async publish(id: number, accountIds?: number[]): Promise<{ message: string; records: PublishRecord[] }> {
    const response = await http.post<ApiEnvelope<{ message: string; records: PublishRecord[] }>>(
      `/contents/${id}/publish`,
      accountIds ? { accountIds } : {},
    );
    return response.data.data;
  },
};

export const aiApi = {
  async generateTitles(topic: string): Promise<string[]> {
    const response = await http.post<ApiEnvelope<{ titles: string[] }>>('/ai/generate-titles', { topic });
    return response.data.data.titles;
  },
};

/* eslint-disable no-console */

import { getCloudflareContext } from '@opennextjs/cloudflare';

import { AdminConfig } from './admin.types';
import { MemoryStorage } from './memory.db';
import {
  Favorite,
  IStorage,
  PlayRecord,
  SkipConfig,
  SkipPreset,
} from './types';

interface KVNamespaceLike {
  get<T = string>(key: string, type?: 'text' | 'json'): Promise<T | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: {
    prefix?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{
    keys: Array<{ name: string }>;
    list_complete: boolean;
    cursor?: string;
  }>;
}

interface UserState {
  password: string;
  playRecords: Record<string, PlayRecord>;
  favorites: Record<string, Favorite>;
  searchHistory: string[];
  skipConfigs: Record<string, SkipConfig>;
  skipPresets: SkipPreset[];
}

const PREFIX = 'decotv:v1:';
const ADMIN_CONFIG_KEY = `${PREFIX}admin-config`;
const USER_PREFIX = `${PREFIX}user:`;

function emptyUser(password = ''): UserState {
  return {
    password,
    playRecords: {},
    favorites: {},
    searchHistory: [],
    skipConfigs: {},
    skipPresets: [],
  };
}

function userKey(userName: string): string {
  return `${USER_PREFIX}${encodeURIComponent(userName)}`;
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Cloudflare KV backed storage. The in-memory fallback is used only when the
 * Cloudflare request context is unavailable, such as a local Next.js build.
 */
export class KVStorage implements IStorage {
  private fallback: MemoryStorage | null = null;

  private getFallback(): MemoryStorage {
    this.fallback ??= new MemoryStorage();
    return this.fallback;
  }

  private async getKV(): Promise<KVNamespaceLike | null> {
    // Next invokes some server functions while producing the build manifest.
    // There is no Cloudflare request context during that phase.
    if (process.env.NEXT_PHASE === 'phase-production-build') return null;

    try {
      const { env } = await getCloudflareContext({ async: true });
      const bindings = env as typeof env & {
        DECOTV_KV?: KVNamespaceLike;
      };
      if (!bindings.DECOTV_KV) {
        throw new Error(
          'Cloudflare KV binding DECOTV_KV is not configured. Add it to the Pages project.',
        );
      }
      return bindings.DECOTV_KV;
    } catch (error) {
      // Local Next.js development and build do not expose a worker context.
      // A configured Cloudflare request still throws for a missing binding.
      if (
        error instanceof Error &&
        error.message.includes('binding DECOTV_KV is not configured')
      ) {
        throw error;
      }
      return null;
    }
  }

  private async readUser(
    kv: KVNamespaceLike,
    userName: string,
  ): Promise<UserState | null> {
    const raw = await kv.get<string>(userKey(userName));
    return raw ? parseJson<UserState>(raw, emptyUser()) : null;
  }

  private async writeUser(
    kv: KVNamespaceLike,
    userName: string,
    state: UserState,
  ): Promise<void> {
    await kv.put(userKey(userName), JSON.stringify(state));
  }

  private async updateUser(
    kv: KVNamespaceLike,
    userName: string,
    update: (state: UserState) => void,
  ): Promise<void> {
    const state = (await this.readUser(kv, userName)) ?? emptyUser();
    update(state);
    await this.writeUser(kv, userName, state);
  }

  async getPlayRecord(
    userName: string,
    key: string,
  ): Promise<PlayRecord | null> {
    const kv = await this.getKV();
    if (!kv) return this.getFallback().getPlayRecord(userName, key);
    const state = await this.readUser(kv, userName);
    return state?.playRecords[key] ?? null;
  }

  async setPlayRecord(
    userName: string,
    key: string,
    record: PlayRecord,
  ): Promise<void> {
    const kv = await this.getKV();
    if (!kv) return this.getFallback().setPlayRecord(userName, key, record);
    await this.updateUser(kv, userName, (state) => {
      state.playRecords[key] = record;
    });
  }

  async getAllPlayRecords(
    userName: string,
  ): Promise<Record<string, PlayRecord>> {
    const kv = await this.getKV();
    if (!kv) return this.getFallback().getAllPlayRecords(userName);
    return (await this.readUser(kv, userName))?.playRecords ?? {};
  }

  async deletePlayRecord(userName: string, key: string): Promise<void> {
    const kv = await this.getKV();
    if (!kv) return this.getFallback().deletePlayRecord(userName, key);
    await this.updateUser(kv, userName, (state) => {
      delete state.playRecords[key];
    });
  }

  async getFavorite(userName: string, key: string): Promise<Favorite | null> {
    const kv = await this.getKV();
    if (!kv) return this.getFallback().getFavorite(userName, key);
    return (await this.readUser(kv, userName))?.favorites[key] ?? null;
  }

  async setFavorite(
    userName: string,
    key: string,
    favorite: Favorite,
  ): Promise<void> {
    const kv = await this.getKV();
    if (!kv) return this.getFallback().setFavorite(userName, key, favorite);
    await this.updateUser(kv, userName, (state) => {
      state.favorites[key] = favorite;
    });
  }

  async getAllFavorites(userName: string): Promise<Record<string, Favorite>> {
    const kv = await this.getKV();
    if (!kv) return this.getFallback().getAllFavorites(userName);
    return (await this.readUser(kv, userName))?.favorites ?? {};
  }

  async deleteFavorite(userName: string, key: string): Promise<void> {
    const kv = await this.getKV();
    if (!kv) return this.getFallback().deleteFavorite(userName, key);
    await this.updateUser(kv, userName, (state) => {
      delete state.favorites[key];
    });
  }

  async registerUser(userName: string, password: string): Promise<void> {
    const kv = await this.getKV();
    if (!kv) return this.getFallback().registerUser(userName, password);
    if (await this.readUser(kv, userName)) throw new Error('用户已存在');
    await this.writeUser(kv, userName, emptyUser(password));
  }

  async verifyUser(userName: string, password: string): Promise<boolean> {
    const kv = await this.getKV();
    if (!kv) return this.getFallback().verifyUser(userName, password);
    return (await this.readUser(kv, userName))?.password === password;
  }

  async checkUserExist(userName: string): Promise<boolean> {
    const kv = await this.getKV();
    if (!kv) return this.getFallback().checkUserExist(userName);
    return (await this.readUser(kv, userName)) !== null;
  }

  async changePassword(userName: string, newPassword: string): Promise<void> {
    const kv = await this.getKV();
    if (!kv) return this.getFallback().changePassword(userName, newPassword);
    const state = await this.readUser(kv, userName);
    if (!state) throw new Error('用户不存在');
    state.password = newPassword;
    await this.writeUser(kv, userName, state);
  }

  async deleteUser(userName: string): Promise<void> {
    const kv = await this.getKV();
    if (!kv) return this.getFallback().deleteUser(userName);
    await kv.delete(userKey(userName));
  }

  async getSearchHistory(userName: string): Promise<string[]> {
    const kv = await this.getKV();
    if (!kv) return this.getFallback().getSearchHistory(userName);
    return (await this.readUser(kv, userName))?.searchHistory ?? [];
  }

  async addSearchHistory(userName: string, keyword: string): Promise<void> {
    const kv = await this.getKV();
    if (!kv) return this.getFallback().addSearchHistory(userName, keyword);
    await this.updateUser(kv, userName, (state) => {
      state.searchHistory = [
        keyword,
        ...state.searchHistory.filter((item) => item !== keyword),
      ].slice(0, 20);
    });
  }

  async deleteSearchHistory(userName: string, keyword?: string): Promise<void> {
    const kv = await this.getKV();
    if (!kv) return this.getFallback().deleteSearchHistory(userName, keyword);
    if (!keyword) {
      await this.updateUser(kv, userName, (state) => {
        state.searchHistory = [];
      });
      return;
    }
    await this.updateUser(kv, userName, (state) => {
      state.searchHistory = state.searchHistory.filter(
        (item) => item !== keyword,
      );
    });
  }

  async getAllUsers(): Promise<string[]> {
    const kv = await this.getKV();
    if (!kv) return this.getFallback().getAllUsers();
    const users: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await kv.list({ prefix: USER_PREFIX, cursor });
      users.push(
        ...page.keys.map(({ name }) =>
          decodeURIComponent(name.slice(USER_PREFIX.length)),
        ),
      );
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    return users.sort();
  }

  async getAdminConfig(): Promise<AdminConfig | null> {
    const kv = await this.getKV();
    if (!kv) return this.getFallback().getAdminConfig();
    return parseJson<AdminConfig | null>(
      await kv.get<string>(ADMIN_CONFIG_KEY),
      null,
    );
  }

  async setAdminConfig(config: AdminConfig): Promise<void> {
    const kv = await this.getKV();
    if (!kv) return this.getFallback().setAdminConfig(config);
    await kv.put(ADMIN_CONFIG_KEY, JSON.stringify(config));
  }

  async getSkipConfig(
    userName: string,
    source: string,
    id: string,
  ): Promise<SkipConfig | null> {
    const kv = await this.getKV();
    if (!kv) return this.getFallback().getSkipConfig(userName, source, id);
    return (
      (await this.readUser(kv, userName))?.skipConfigs[`${source}+${id}`] ??
      null
    );
  }

  async setSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: SkipConfig,
  ): Promise<void> {
    const kv = await this.getKV();
    if (!kv)
      return this.getFallback().setSkipConfig(userName, source, id, config);
    await this.updateUser(kv, userName, (state) => {
      state.skipConfigs[`${source}+${id}`] = config;
    });
  }

  async deleteSkipConfig(
    userName: string,
    source: string,
    id: string,
  ): Promise<void> {
    const kv = await this.getKV();
    if (!kv) return this.getFallback().deleteSkipConfig(userName, source, id);
    await this.updateUser(kv, userName, (state) => {
      delete state.skipConfigs[`${source}+${id}`];
    });
  }

  async getAllSkipConfigs(
    userName: string,
  ): Promise<Record<string, SkipConfig>> {
    const kv = await this.getKV();
    if (!kv) return this.getFallback().getAllSkipConfigs(userName);
    return (await this.readUser(kv, userName))?.skipConfigs ?? {};
  }

  async getSkipPresets(userName: string): Promise<SkipPreset[]> {
    const kv = await this.getKV();
    if (!kv) return this.getFallback().getSkipPresets(userName);
    return (await this.readUser(kv, userName))?.skipPresets ?? [];
  }

  async setSkipPresets(userName: string, presets: SkipPreset[]): Promise<void> {
    const kv = await this.getKV();
    if (!kv) return this.getFallback().setSkipPresets(userName, presets);
    await this.updateUser(kv, userName, (state) => {
      state.skipPresets = [...presets];
    });
  }

  async clearAllData(): Promise<void> {
    const kv = await this.getKV();
    if (!kv) return this.getFallback().clearAllData();
    let cursor: string | undefined;
    do {
      const page = await kv.list({ prefix: PREFIX, cursor });
      await Promise.all(page.keys.map(({ name }) => kv.delete(name)));
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
  }
}

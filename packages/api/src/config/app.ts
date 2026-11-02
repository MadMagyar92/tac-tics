export type AppScopeConfig = {
  scope: string;
  definition?: string;
  object?: string;
};

export type AppConfig = AppScopeConfig[];

export interface AppConfigService<K, V> {
  loadAll(): Map<K, V>;
};

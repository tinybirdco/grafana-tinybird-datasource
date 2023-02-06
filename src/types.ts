import { DataQuery, DataSourceJsonData } from '@grafana/data';

export type Pair<T, K> = [T, K];

export interface TinybirdQuery extends DataQuery {
  params: Array<Pair<string, string>>;
}

export const DEFAULT_QUERY: Partial<TinybirdQuery> = {
  params: [],
};

export interface TinybirdOptions extends DataSourceJsonData {
  endpoint: string;
  token: string;
  pipeName: string;
}

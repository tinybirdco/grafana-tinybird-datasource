import { DataQuery, DataSourceJsonData } from '@grafana/data';

export type Pair<T, K> = [T, K];

export const SUPPORTED_OUTPUT_FORMATS = ['table', 'logs', 'timeseries'] as const;

export type OutputFormat = (typeof SUPPORTED_OUTPUT_FORMATS)[number];

export interface TinybirdQuery extends DataQuery {
  format: OutputFormat;
  params: Array<Pair<string, string>>;
  extrapolate?: boolean;
}

export const DEFAULT_QUERY: Partial<TinybirdQuery> = {
  format: 'timeseries',
  params: [],
  extrapolate: true,
};

export interface TinybirdOptions extends DataSourceJsonData {
  endpoint: string;
  token: string;
  pipeName: string;
}

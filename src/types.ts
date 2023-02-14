import { DataQuery, DataSourceJsonData } from '@grafana/data';

export type Pair<T, K> = [T, K];

export const SUPPORTED_OUTPUT_FORMATS = ['table', 'logs', 'timeseries'] as const;

export type OutputFormat = (typeof SUPPORTED_OUTPUT_FORMATS)[number];

export interface TinybirdQuery extends DataQuery {
  format: OutputFormat;
  pipeName: string;
  extrapolate?: boolean;
  params: Array<Pair<string, string>>;
}

export const DEFAULT_QUERY: Partial<TinybirdQuery> = {
  format: 'timeseries',
  pipeName: '',
  extrapolate: true,
  params: [],
};

export interface TinybirdOptions extends DataSourceJsonData {
  host: string;
  token: string;
}

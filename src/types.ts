import { DataQuery, DataSourceJsonData } from '@grafana/data';

export const SUPPORTED_OUTPUT_FORMATS = ['table', 'logs', 'timeseries'] as const;

export type OutputFormat = (typeof SUPPORTED_OUTPUT_FORMATS)[number];

export interface TinybirdQuery extends DataQuery {
  format: OutputFormat;
  pipeName: string;
  extrapolate?: boolean;
  paramOptions: Record<string, TinybirdParam>;
  params: Record<string, string>;
  dataKeys: string;
}

export const DEFAULT_QUERY: Partial<TinybirdQuery> = {
  format: 'timeseries',
  pipeName: '',
  extrapolate: true,
  paramOptions: {},
  params: {},
  dataKeys: '',
};

export interface TinybirdOptions extends DataSourceJsonData {
  host: string;
  token: string;
}

export interface TinybirdPipe {
  id: string;
  name: string;
}

export interface TinybirdParam {
  type: string;
  description?: string;
  required?: boolean;
  default?: string;
}

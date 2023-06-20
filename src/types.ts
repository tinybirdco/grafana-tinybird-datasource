import { DataQuery, DataSourceJsonData } from '@grafana/data';

export const SUPPORTED_OUTPUT_FORMATS = ['table', 'logs', 'timeseries'] as const;

export type OutputFormat = (typeof SUPPORTED_OUTPUT_FORMATS)[number];

export interface TinybirdQuery extends DataQuery {
  format: OutputFormat;
  pipeName: string;
  paramOptions: Record<string, TinybirdParam>;
  params: Record<string, string>;
  extrapolate: boolean;
  timeKey: string;
  dataKeys: string;
  labelKeys: string;
  variableKey: string;
}

export const DEFAULT_QUERY: Partial<TinybirdQuery> = {
  format: 'timeseries',
  pipeName: '',
  paramOptions: {},
  params: {},
  extrapolate: true,
  timeKey: '',
  dataKeys: '',
  labelKeys: '',
  variableKey: '',
};

export interface TinybirdOptions extends DataSourceJsonData {}

export interface TinybirdSecureJsonData {
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

export interface TinybirdResponse {
  meta: Meta[];
  data: any[];
  rows: number;
  statistics: Statistics;
}

export interface Meta {
  name: string;
  type: string;
}

export interface Statistics {
  elapsed: number;
  rows_read: number;
  bytes_read: number;
}

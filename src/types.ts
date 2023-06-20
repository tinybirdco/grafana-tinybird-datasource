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
  description: string;
  endpoint: string;
  created_at: string;
  updated_at: string;
  parent: null;
  type: string;
  nodes: Node[];
  url: string;
}

export interface TinybirdNode {
  id: string;
  name: string;
  sql: string;
  description: string;
  materialized: null;
  cluster: null;
  tags: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  version: number;
  project: null;
  result: null;
  ignore_sql_errors: boolean;
  node_type: string;
  dependencies: string[];
  params: TinybirdParam[];
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

import {
  CoreApp,
  DashboardVariableModel,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceInstanceSettings,
  ScopedVars,
} from '@grafana/data';
import { DataSourceWithBackend, getBackendSrv, getTemplateSrv } from '@grafana/runtime';
import { defaults, get, has, pick } from 'lodash';
// eslint-disable-next-line no-restricted-imports
import moment from 'moment';
import { Observable, from } from 'rxjs';
import SqlSeries from 'SqlSeries';
import { TinybirdQuery, TinybirdOptions, DEFAULT_QUERY, TinybirdPipe, TinybirdResponse } from './types';

export default class DataSource extends DataSourceWithBackend<TinybirdQuery, TinybirdOptions> {
  readonly url: string;

  constructor(instanceSettings: DataSourceInstanceSettings<TinybirdOptions>) {
    super(instanceSettings);

    this.url = `${instanceSettings.url!}/query`;
  }

  getDefaultQuery(_: CoreApp): Partial<TinybirdQuery> {
    return DEFAULT_QUERY;
  }

  async metricFindQuery(query: TinybirdQuery, options?: Record<string, any>) {
    if (!query.variableKey.trim().length) {
      throw new Error('Add variable key');
    }

    const res = await this.doRequest(query);

    if (!res?.data.length) {
      return [];
    }

    if (!has(res.data[0], query.variableKey)) {
      throw new Error('Variable key is not part of data schema');
    }

    return res.data.map((d: any) => ({ text: d[query.variableKey] }));
  }

  query(options: DataQueryRequest<TinybirdQuery>): Observable<DataQueryResponse> {
    return from(
      Promise.all(
        options.targets
          .filter((target) => !target.hide)
          .map((target) => this.doRequest(defaults(target, DEFAULT_QUERY)))
      )
        .then((responses) => responses.filter((response) => Boolean(response)) as TinybirdResponse[])
        .then((responses) => {
          const data = responses.reduce((result, response, index) => {
            const target = options.targets[index];

            if (!response || !response.data) {
              return result;
            }

            const variables = this.getVariables();
            const timeKey = this.replaceValue(target.timeKey, variables);
            const labelKeys = this.replaceValue(target.labelKeys, variables).split(',');
            const dataKeys = this.replaceValue(target.dataKeys, variables).split(',');
            const isUTC = options.timezone === 'utc';
            const tillNow = options.rangeRaw?.to === 'now';

            const sqlSeries = new SqlSeries({
              refId: target.refId,
              series: response.data,
              meta: response.meta,
              timeKey,
              dataKeys,
              labelKeys,
              isUTC,
              tillNow,
              from: options.range.from,
              to: options.range.to,
            });

            if (target.format === 'table') {
              return [...result, ...sqlSeries.toTable()];
            } else if (target.format === 'logs') {
              return sqlSeries.toLogs();
            } else {
              return [...result, ...sqlSeries.toTimeSeries(target.extrapolate)];
            }
          }, [] as DataQueryResponse['data']);

          return { data };
        })
    );
  }

  async doRequest(query: TinybirdQuery) {
    if (!query.pipeName.length) {
      return;
    }

    const variables = this.getVariables();
    const searchParams = new URLSearchParams();
    Object.entries(query.params).forEach(([key, value]) => {
      if (value.trim() === '') {
        return;
      }

      searchParams.set(key, this.replaceValue(value, variables));
    });

    return getBackendSrv()
      .fetch<TinybirdResponse>({
        url: `${this.url}/${query.pipeName}.json?${searchParams.toString()}`,
        method: 'GET',
      })
      .toPromise()
      .then((res) => res?.data);
  }

  async testDatasource() {
    const result = (await getBackendSrv()
      .fetch({ url: this.url, method: 'GET' })
      .toPromise()
      .then((res) => res?.data)) as { error?: string };

    return {
      status: result.error ? 'error' : 'success',
      message: result.error ?? 'Success',
    };
  }

  readonly globalVariables = {
    __dashboard: this.noop,
    __from: this.parseTimeVariable,
    __to: this.parseTimeVariable,
    __interval: this.noop,
    __interval_ms: this.noop,
    __name: this.noop,
    __org: this.noop,
    __user: this.noop,
    __range: this.noop,
    __rate_interval: this.noop,
    timeFilter: this.noop,
    __timeFilter: this.noop,
  } as const;

  replaceValue(value: string, variables: ScopedVars) {
    const gvMatch = Object.entries(this.globalVariables).find(([name]) => value.includes(name));
    return gvMatch ? gvMatch[1](value, variables[gvMatch[0]]?.value) : getTemplateSrv().replace(value, variables);
  }

  async getPipes(): Promise<TinybirdPipe[]> {
    return getBackendSrv()
      .fetch<{ pipes: TinybirdPipe[] }>({ url: this.url })
      .toPromise()
      .then((res) => res?.data?.pipes ?? [])
      .then((pipes) =>
        pipes.filter((pipe) => get(pipe, 'type') === 'endpoint').map((pipe) => pick(pipe, 'id', 'name'))
      );
  }

  async getNodes(pipeId: string): Promise<any[]> {
    return getBackendSrv()
      .fetch<{ nodes: any[] }>({ url: `${this.url}/${pipeId}` })
      .toPromise()
      .then((res) => res?.data.nodes ?? []);
  }

  getVariables() {
    const variables: ScopedVars = (getTemplateSrv().getVariables() as DashboardVariableModel[])
      .filter(({ current: { value } }) => Boolean(value))
      .reduce((acc, { name, current: { value } }) => ({ ...acc, [name]: { text: name, value: value.toString() } }), {});

    Object.keys(this.globalVariables).forEach((gv) => {
      variables[gv] = { text: gv, value: this.getGlobalVariableValue(gv) };
    });

    return variables;
  }

  getGlobalVariableValue(name: string) {
    const values: string[] = [];

    getTemplateSrv().replace(`$${name}`, {}, (value: string | string[]) => {
      if (Array.isArray(value)) {
        values.push(...value);
      } else {
        values.push(value);
      }
    });

    return values.toString();
  }

  noop(_variable: string, value: string) {
    return value;
  }

  parseTimeVariable(variable: string, _value: string) {
    const value = Number(_value);

    if (!variable.includes(':')) {
      // ${__from}
      return value.toString();
    } else if (variable.endsWith(':date}') || variable.endsWith(':date:iso}')) {
      // ${__from:date}	|| ${__from:date:iso}
      return moment(value).toISOString();
    } else if (variable.endsWith(':date:seconds}')) {
      // ${__from:date:seconds}
      return moment(value).unix().toString();
    }

    try {
      // ${__from:date:YYYY-MM}
      return moment(value).format(variable.match(/date\:(.*)\}/)![1]);
    } catch (e) {
      return value.toString();
    }
  }
}

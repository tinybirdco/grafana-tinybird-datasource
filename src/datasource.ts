import { DataQueryRequest, DataQueryResponse, DataSourceApi, DataSourceInstanceSettings } from '@grafana/data';
import { getBackendSrv, getTemplateSrv } from '@grafana/runtime';
import { defaults } from 'lodash';
import SqlSeries from 'SqlSeries';
import { TinybirdQuery, TinybirdOptions, DEFAULT_QUERY } from './types';

const globalVariables = [
  '__dashboard',
  '__from',
  '__to',
  '__interval',
  '__interval_ms',
  '__name',
  '__org',
  '__user',
  '__range',
  '__rate_interval',
  'timeFilter',
  '__timeFilter',
];

export class DataSource extends DataSourceApi<TinybirdQuery, TinybirdOptions> {
  private readonly token: string;
  private readonly pipeName: string;
  private readonly tinybirdURL: URL;

  constructor(instanceSettings: DataSourceInstanceSettings<TinybirdOptions>) {
    super(instanceSettings);

    this.token = instanceSettings.jsonData.token;
    this.pipeName = instanceSettings.jsonData.pipeName;
    this.tinybirdURL = new URL(
      `${instanceSettings.jsonData.endpoint}${instanceSettings.jsonData.endpoint.endsWith('/') ? '' : '/'}v0/pipes/`
    );
  }

  async query(options: DataQueryRequest<TinybirdQuery>): Promise<DataQueryResponse> {
    return Promise.all(
      options.targets.filter((target) => !target.hide).map((target) => this.doRequest(defaults(target, DEFAULT_QUERY)))
    ).then((responses) => {
      const data = responses.reduce((result, response, index) => {
        const target = options.targets[index];

        if (!response || !response.data) {
          return result;
        }

        const sqlSeries = new SqlSeries({
          refId: target.refId,
          series: response.data,
          meta: response.meta,
          keys: ['t', 'job_name'],
          tillNow: options.rangeRaw?.to === 'now',
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
      }, []);

      return { data };
    });
  }

  async doRequest(query: TinybirdQuery) {
    const bindings = this.getBindings();
    const variables = getTemplateSrv().getVariables();

    const url = new URL(`${this.tinybirdURL}${this.pipeName}${this.pipeName.endsWith('.json') ? '' : '.json'}`);
    url.searchParams.set('token', this.token);
    query.params.forEach(([key, value]) => {
      const globalVariable = globalVariables.find((v) => value.includes(v));
      const customVariable = variables.find((v) => v.name === key);

      if (globalVariable) {
        value = bindings[globalVariable];
      } else if (customVariable) {
        value = (customVariable as any).query;
      }
      url.searchParams.set(key, value);
    });

    return getBackendSrv().get(url.toString());
  }

  async testDatasource() {
    const url = new URL(this.tinybirdURL);
    url.searchParams.set('token', this.token);
    const result = await getBackendSrv().get(url.toString());

    return {
      status: result.error ? 'error' : 'success',
      message: result.error ?? 'Success',
    };
  }

  getBindings(): Record<string, any> {
    const getVariable = (name: any): string[] => {
      const values: string[] = [];

      getTemplateSrv().replace(`$${name}`, {}, (value: string | string[]) => {
        Array.isArray(value) ? values.push(...value) : values.push(value);
      });

      return values;
    };

    return Object.fromEntries(globalVariables.map((v) => [v, getVariable(v)]));
  }
}

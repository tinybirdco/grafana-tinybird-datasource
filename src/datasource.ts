import { DataQueryRequest, DataQueryResponse, DataSourceApi, DataSourceInstanceSettings } from '@grafana/data';
import { getBackendSrv, getTemplateSrv } from '@grafana/runtime';
import { defaults } from 'lodash';
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
  private readonly tinybirdURL: URL;

  constructor(instanceSettings: DataSourceInstanceSettings<TinybirdOptions>) {
    super(instanceSettings);

    const url = new URL(
      `${instanceSettings.jsonData.endpoint}${instanceSettings.jsonData.endpoint.endsWith('/') ? '' : '/'}v0/pipes/${
        instanceSettings.jsonData.pipeName
      }${instanceSettings.jsonData.pipeName.endsWith('.json') ? '' : '.json'}`
    );
    url.searchParams.set('token', instanceSettings.jsonData.token);

    this.tinybirdURL = url;
  }

  async query(options: DataQueryRequest<TinybirdQuery>): Promise<DataQueryResponse> {
    const data = await Promise.all(
      options.targets.filter((target) => !target.hide).map((target) => this.doRequest(defaults(target, DEFAULT_QUERY)))
    );

    return { data };
  }

  async doRequest(query: TinybirdQuery) {
    const bindings = this.getBindings();
    const url = new URL(this.tinybirdURL);
    query.params.forEach((pair) => {
      const gv = globalVariables.find((v) => pair[1].includes(v));
      url.searchParams.set(pair[0], gv ? bindings[gv] : pair[1]);
    });

    const result = await getBackendSrv().get(url.toString());
    return result.data;
  }

  async testDatasource() {
    const result = await getBackendSrv().get(this.tinybirdURL.toString());

    return {
      status: result.error ? 'error' : 'success',
      message: result.error ?? 'Success',
    };
  }

  getBindings(): Record<string, any> {
    const getVariable = (name: any): string[] => {
      const values: string[] = [];

      getTemplateSrv().replace(`$${name}`, {}, (value: string | string[]) => {
        console.log(value);
        Array.isArray(value) ? values.push(...value) : values.push(value);
      });

      return values;
    };

    return Object.fromEntries(globalVariables.map((v) => [v, getVariable(v)]));
  }
}

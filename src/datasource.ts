import { DataQueryRequest, DataQueryResponse, DataSourceApi, DataSourceInstanceSettings } from '@grafana/data';
import { getBackendSrv, getTemplateSrv } from '@grafana/runtime';
import { defaults } from 'lodash';
// eslint-disable-next-line no-restricted-imports
import moment from 'moment';
import SqlSeries from 'SqlSeries';
import { TinybirdQuery, TinybirdOptions, DEFAULT_QUERY } from './types';

export class DataSource extends DataSourceApi<TinybirdQuery, TinybirdOptions> {
  readonly tinybirdToken: string;
  readonly tinybirdURL: URL;

  constructor(instanceSettings: DataSourceInstanceSettings<TinybirdOptions>) {
    super(instanceSettings);

    this.tinybirdToken = instanceSettings.jsonData.token;
    this.tinybirdURL = new URL(
      `${instanceSettings.jsonData.host}${instanceSettings.jsonData.host.endsWith('/') ? '' : '/'}v0/pipes/`
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
    if (!query.pipeName) {
      throw new Error('Please select a pipe');
    }

    const variables = getTemplateSrv().getVariables();
    const url = new URL(`${this.tinybirdURL}${query.pipeName}.json`);
    url.searchParams.set('token', this.tinybirdToken);
    Object.entries(query.params).forEach(([key, value]) => {
      if (value.trim() === '') {
        return;
      }

      const customVariable = variables.find((v) => v.name === key);

      if (value.includes('__from') || value.includes('__to')) {
        value = this.parseTimeVariable(value);
      } else if (customVariable) {
        value = (customVariable as any).query;
      }
      url.searchParams.set(key, value);
    });

    return getBackendSrv().get(url.toString());
  }

  async testDatasource() {
    const url = new URL(this.tinybirdURL);
    url.searchParams.set('token', this.tinybirdToken);
    const result = await getBackendSrv().get(url.toString());

    return {
      status: result.error ? 'error' : 'success',
      message: result.error ?? 'Success',
    };
  }

  parseTimeVariable(variable: string) {
    const globalName = variable.includes('__from') ? '__from' : '__to';
    const value = +getTemplateSrv().replace(`$${globalName}`);

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

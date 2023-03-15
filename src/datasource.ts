import {
  DashboardVariableModel,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  ScopedVars,
} from '@grafana/data';
import { getBackendSrv, getTemplateSrv } from '@grafana/runtime';
import { defaults } from 'lodash';
// eslint-disable-next-line no-restricted-imports
import moment from 'moment';
import SqlSeries from 'SqlSeries';
import { TinybirdQuery, TinybirdOptions, DEFAULT_QUERY } from './types';

export default class DataSource extends DataSourceApi<TinybirdQuery, TinybirdOptions> {
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
          timeKey: target.timeKey,
          dataKeys: target.dataKeys.split(','),
          labelKeys: target.labelKeys.split(','),
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
    if (!query.pipeName.length) {
      throw new Error('Please select a pipe');
    }

    const variables = this.getVariables();

    const url = new URL(`${this.tinybirdURL}${query.pipeName}.json`);
    url.searchParams.set('token', this.tinybirdToken);
    Object.entries(query.params).forEach(([key, value]) => {
      if (value.trim() === '') {
        return;
      }

      const gvMatch = Object.entries(this.globalVariables).find(([name]) => value.includes(name));
      value = gvMatch ? gvMatch[1](value, variables[gvMatch[0]].value) : getTemplateSrv().replace(value, variables);
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

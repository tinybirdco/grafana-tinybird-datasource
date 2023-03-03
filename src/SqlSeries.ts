import { find, pickBy, omitBy } from 'lodash';
import { FieldType, MutableDataFrame, DataFrame, TableData, TimeSeries, DateTime } from '@grafana/data';
// eslint-disable-next-line no-restricted-imports
import moment from 'moment';

type SqlSeriesOptions = {
  refId: string;
  series: any[];
  keys: string[];
  meta: Array<{
    name: string;
    type: string;
  }>;
  tillNow: boolean;
  from: DateTime;
  to: DateTime;
};

export default class SqlSeries {
  private readonly refId: string;
  private readonly series: any[];
  private readonly keys: string[];
  private readonly meta: Array<{
    name: string;
    type: string;
  }>;
  private readonly tillNow: boolean;
  private readonly from: number;
  private readonly to: number;

  constructor(options: SqlSeriesOptions) {
    this.refId = options.refId;
    this.series = options.series;
    this.meta = options.meta;
    this.tillNow = options.tillNow;
    this.from = options.from.unix();
    this.to = options.to.unix();
    this.keys = options.keys || [];
  }

  toTable(): TableData[] {
    if (!this.series.length) {
      return [];
    }

    const columns = this.meta.map((col) => ({
      text: col.name,
      type: this.toJSType(col.type),
    }));

    const rows = this.series.map((ser) =>
      columns.map((col, index) => this.formatValueByType(ser[col.text], this.toJSType(this.meta[index].type)))
    );

    return [
      {
        columns,
        rows,
        type: 'table',
      },
    ];
  }

  toLogs(): DataFrame[] {
    const dataFrames: DataFrame[] = [],
      reservedFields = ['level', 'id'];

    if (!this.series.length) {
      return dataFrames;
    }

    const types: { [key: string]: FieldType } = {};
    const labelFields: string[] = [];
    const messageField =
      find(this.meta, ['name', 'content'])?.name ??
      find(this.meta, (col) => this.toFieldType(col.type) === FieldType.string)?.name;

    if (!messageField) {
      return dataFrames;
    }

    this.meta.forEach((col, index) => {
      let type = this.toFieldType(col.type);
      if (index === 0 && col.type === 'UInt64') {
        type = FieldType.time;
      }
      if (type === FieldType.string && col.name !== messageField && !reservedFields.includes(col.name)) {
        labelFields.push(col.name);
      }

      types[col.name] = type;
    });

    this.series.forEach((ser) => {
      const frame = new MutableDataFrame({
        refId: this.refId,
        meta: {
          preferredVisualisationType: 'logs',
        },
        fields: [],
      });
      const labels = pickBy(ser, (_value, key) => labelFields.includes(key));

      Object.entries(ser).forEach(([key, _value]) => {
        if (!types[key]) {
          return;
        }
        if (key === messageField) {
          frame.addField({ name: key, type: types[key], labels: labels });
        } else if (!labelFields.includes(key)) {
          frame.addField({ name: key, type: types[key] });
        }
      });

      frame.add(omitBy(ser, (_value, key) => labelFields.includes(key)));
      dataFrames.push(frame);
    });

    return dataFrames;
  }

  toTimeSeries(extrapolate = true): TimeSeries[] {
    if (!this.series.length) {
      return [];
    }

    const metrics = {};
    const timeCol = this.findColByFieldType(FieldType.time) ?? this.findColByFieldType(FieldType.number);

    if (!timeCol) {
      throw new Error('Please select time column');
    }

    let lastTimeStamp = this.formatTimeValue(this.series[0][timeCol.name]);
    const keyColumns = this.keys.filter((name) => name !== timeCol.name);

    this.series.forEach((row) => {
      const t = this.formatTimeValue(row[timeCol.name]);
      let metricKey: string | null = null;

      if (keyColumns.length) {
        metricKey = keyColumns.map((name) => row[name]).join(', ');
      }

      if (lastTimeStamp < t) {
        Object.values<any[]>(metrics).forEach((dataPoints) => {
          if (dataPoints[dataPoints.length - 1][1] < lastTimeStamp) {
            dataPoints.push([null, lastTimeStamp]);
          }
        });
        lastTimeStamp = t;
      }

      Object.entries(row).forEach(([key, val]) => {
        if ((!this.keys.length && timeCol.name === key) || this.keys.includes(key)) {
          return;
        }

        if (metricKey) {
          key = metricKey;
        }

        if (Array.isArray(val)) {
          val.forEach((arr) => {
            this.pushDatapoint(metrics, t, arr[0], arr[1]);
          });
        } else {
          this.pushDatapoint(metrics, t, key, val as number);
        }
      });
    });

    return Object.entries<[string, any[]]>(metrics).map(([seriesName, dataPoints]) => ({
      target: seriesName,
      datapoints: extrapolate ? this.extrapolate(dataPoints) : dataPoints,
    }));
  }

  extrapolate(datapoints: any[]) {
    const minimumDatapoints = 10;
    const startBoundary = 0;

    if (datapoints.length < minimumDatapoints || (!this.tillNow && datapoints[0][0] !== startBoundary)) {
      return datapoints;
    }

    const durationToStart = datapoints[0][1] / 1000 - this.from;
    const durationToEnd = this.to - datapoints[datapoints.length - 1][1] / 1000;
    const sampledInterval = (datapoints[datapoints.length - 1][1] - datapoints[0][1]) / 1000;
    const averageDurationBetweenSamples = sampledInterval / (datapoints.length - 1);
    const averageDurationThreshold = averageDurationBetweenSamples / 2;

    if (durationToStart < averageDurationThreshold && datapoints[0][0] === startBoundary) {
      const diff = ((datapoints[1][0] - datapoints[2][0]) / datapoints[1][0]) * 0.1;
      datapoints[0][0] = datapoints[1][0] * (1 + (diff % 1 || 0));
    }

    if (durationToEnd < averageDurationThreshold) {
      const diff =
        ((datapoints[datapoints.length - 2][0] - datapoints[datapoints.length - 3][0]) /
          datapoints[datapoints.length - 2][0]) *
        0.1;
      datapoints[datapoints.length - 1][0] = datapoints[datapoints.length - 2][0] * (1 + (diff % 1 || 0));
    }

    return datapoints;
  }

  private pushDatapoint(metrics: Record<string, any[][]>, timestamp: number, key: string, value: number): void {
    if (!metrics[key]) {
      metrics[key] = [];
      Object.entries(metrics).forEach(([, dataPoints]) => {
        dataPoints.forEach(([, previousTimestamp]) => {
          if (previousTimestamp < timestamp) {
            metrics[key].push([null, previousTimestamp]);
          }
        });
      });
    }

    metrics[key].push([this.formatValue(value), timestamp]);
  }

  private toJSType(type: string): string {
    switch (type) {
      case 'UInt8':
      case 'UInt16':
      case 'UInt32':
      case 'UInt64':
      case 'Int8':
      case 'Int16':
      case 'Int32':
      case 'Int64':
      case 'Float32':
      case 'Float64':
      case 'Decimal':
      case 'Decimal32':
      case 'Decimal64':
      case 'Decimal128':
      case 'Nullable(UInt8)':
      case 'Nullable(UInt16)':
      case 'Nullable(UInt32)':
      case 'Nullable(UInt64)':
      case 'Nullable(Int8)':
      case 'Nullable(Int16)':
      case 'Nullable(Int32)':
      case 'Nullable(Int64)':
      case 'Nullable(Float32)':
      case 'Nullable(Float64)':
      case 'Nullable(Decimal)':
      case 'Nullable(Decimal32)':
      case 'Nullable(Decimal64)':
      case 'Nullable(Decimal128)':
        return 'number';
      default:
        return 'string';
    }
  }

  private toFieldType(type: string): FieldType {
    switch (type) {
      case 'UInt8':
      case 'UInt16':
      case 'UInt32':
      case 'UInt64':
      case 'Int8':
      case 'Int16':
      case 'Int32':
      case 'Int64':
      case 'Float32':
      case 'Float64':
      case 'Decimal':
      case 'Decimal32':
      case 'Decimal64':
      case 'Decimal128':
      case 'Nullable(UInt8)':
      case 'Nullable(UInt16)':
      case 'Nullable(UInt32)':
      case 'Nullable(UInt64)':
      case 'Nullable(Int8)':
      case 'Nullable(Int16)':
      case 'Nullable(Int32)':
      case 'Nullable(Int64)':
      case 'Nullable(Float32)':
      case 'Nullable(Float64)':
      case 'Nullable(Decimal)':
      case 'Nullable(Decimal32)':
      case 'Nullable(Decimal64)':
      case 'Nullable(Decimal128)':
        return FieldType.number;
      case 'Date':
      case 'DateTime':
      case 'DateTime64':
      case 'DateTime64(3)':
      case 'DateTime64(6)':
      case 'Nullable(Date)':
      case 'Nullable(DateTime)':
      case 'Nullable(DateTime64)':
      case 'Nullable(DateTime64(3))':
      case 'Nullable(DateTime64(6))':
        return FieldType.time;
      case 'IPv6':
      case 'IPv4':
      case 'Nullable(IPv6)':
      case 'Nullable(IPv4)':
        return FieldType.other;
      default:
        return FieldType.string;
    }
  }

  private findColByFieldType(fieldType: FieldType) {
    return this.meta
      .filter(({ type }) => !type.includes('Float'))
      .find(({ type }) => this.toFieldType(type) === fieldType);
  }

  private formatTimeValue(value: any) {
    return moment(value).valueOf();
  }

  private formatValue(value: any) {
    const numeric = Number(value);
    return value === null || isNaN(numeric) ? value : numeric;
  }

  private formatValueByType(value: any, t: string) {
    const numeric = Number(value);
    return value === null || isNaN(numeric) || t !== 'number' ? value : numeric;
  }
}

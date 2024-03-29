import { find, pickBy, omitBy } from 'lodash';
import { FieldType, MutableDataFrame, DataFrame, TableData, TimeSeries, DateTime } from '@grafana/data';
// eslint-disable-next-line no-restricted-imports
import moment from 'moment';

type Meta = {
  name: string;
  type: string;
};

type SqlSeriesOptions = {
  refId: string;
  series: any[];
  meta: Meta[];
  dataKeys: string[];
  labelKeys: string[];
  timeKey: string;
  isUTC: boolean;
  tillNow: boolean;
  from: DateTime;
  to: DateTime;
};

export default class SqlSeries {
  private readonly refId: string;
  private readonly series: Array<Record<string, any>>;
  private readonly meta: Meta[];
  private readonly timeKey: string;
  private readonly dataKeys: string[];
  private readonly labelKeys: string[];
  private readonly isUTC: boolean;
  private readonly tillNow: boolean;
  private readonly from: number;
  private readonly to: number;

  constructor(options: SqlSeriesOptions) {
    this.refId = options.refId;
    this.series = options.series;
    this.meta = options.meta;
    this.isUTC = options.isUTC;
    this.tillNow = options.tillNow;
    this.from = options.from.unix();
    this.to = options.to.unix();
    const allKeys = options.meta.map((m) => m.name);
    const timeKey =
      options.timeKey.length > 0 && allKeys.includes(options.timeKey)
        ? options.timeKey
        : this.findColByFieldType(FieldType.time)?.name ?? this.findEpochCol() ?? '';
    const allNumberKeys = options.meta
      .filter((m) => this.toJSType(m.type) === 'number' && m.name !== timeKey)
      .map((m) => m.name);
    const allStringKeys = options.meta
      .filter((m) => this.toJSType(m.type) === 'string' && m.name !== timeKey)
      .map((m) => m.name);
    const dataKeys = options.dataKeys.filter((key) => allNumberKeys.includes(key));
    const labelKeys = options.labelKeys.filter((key) => allStringKeys.includes(key));
    this.timeKey = timeKey;
    this.dataKeys = dataKeys.length > 0 ? dataKeys : allNumberKeys;
    this.labelKeys = labelKeys.length === this.dataKeys.length ? labelKeys : [];
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

  toTimeSeries(extrapolate: boolean): TimeSeries[] {
    if (!this.series.length) {
      return [];
    }

    const metrics = {};

    let lastTimeStamp = this.formatTimeValue(this.series[0][this.timeKey]);

    this.series.forEach((row) => {
      const t = this.formatTimeValue(row[this.timeKey]);

      if (lastTimeStamp < t) {
        Object.values<any[]>(metrics).forEach((dataPoints) => {
          if (dataPoints[dataPoints.length - 1][1] < lastTimeStamp) {
            dataPoints.push([null, lastTimeStamp]);
          }
        });
        lastTimeStamp = t;
      }

      let index = 0;

      Object.entries(row).forEach(([key, val]) => {
        if (this.timeKey === key || this.labelKeys.includes(key) || !this.dataKeys.includes(key)) {
          return;
        }

        const metricKey = this.labelKeys.length > 0 ? row[this.labelKeys[index]] : null;
        index++;

        if (Array.isArray(val)) {
          val.forEach((arr) => {
            this.pushDatapoint(metrics, t, arr[0], arr[1]);
          });
        } else {
          this.pushDatapoint(metrics, t, metricKey ?? key, val as number);
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

  private toJSType(type: string): 'number' | 'string' {
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

  private findEpochCol() {
    const numCols = this.meta
      .filter(({ type }) => !type.includes('Float'))
      .filter(({ type }) => this.toFieldType(type) === FieldType.number)
      .map(({ name }) => name);

    const firstRow = this.series[0];

    if (!firstRow) {
      return null;
    }

    return numCols
      .slice(1)
      .reduce((epochCol, col) => (firstRow[epochCol] < firstRow[col] ? col : epochCol), numCols[0]);
  }

  private findColByFieldType(fieldType: FieldType) {
    return this.meta
      .filter(({ type }) => !type.includes('Float'))
      .find(({ type }) => this.toFieldType(type) === fieldType);
  }

  private formatTimeValue(value: any) {
    // epoch is string
    if (!isNaN(Number(value))) {
      value = Number(value);
    }

    // epoch is in seconds
    if (
      typeof value === 'number' &&
      Math.abs(+Date.now() - +new Date(Number(value))) >= Math.abs(+Date.now() - Number(value) * 1000)
    ) {
      value *= 1000;
    }

    let momentValue = moment(value);

    if (this.isUTC) {
      momentValue = momentValue.utc();
    }

    return momentValue.valueOf();
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

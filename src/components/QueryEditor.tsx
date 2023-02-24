import React, { useEffect, useMemo, useState } from 'react';
import { InlineField, InlineFieldRow, InlineSwitch, Select, stylesFactory, useTheme } from '@grafana/ui';
import { GrafanaTheme, QueryEditorProps, SelectableValue } from '@grafana/data';
import { css } from '@emotion/css';
import { DataSource } from '../datasource';
import { OutputFormat, SUPPORTED_OUTPUT_FORMATS, TinybirdOptions, TinybirdPipe, TinybirdQuery } from '../types';
import { capitalize, pick } from 'lodash';
import { getBackendSrv } from '@grafana/runtime';

export function QueryEditor({
  query,
  onChange,
  datasource,
}: QueryEditorProps<DataSource, TinybirdQuery, TinybirdOptions>) {
  const theme = useTheme();
  const styles = getStyles(theme);
  const [pipes, setPipes] = useState<TinybirdPipe[]>([]);
  const formatAsOptions: Array<SelectableValue<OutputFormat>> = SUPPORTED_OUTPUT_FORMATS.map((f) => ({
    label: capitalize(f),
    value: f,
  }));

  const pipeNameOptions = useMemo(() => pipes.map((pipe: any) => ({ label: pipe.name, value: pipe.name })), [pipes]);

  useEffect(() => {
    const url = new URL(datasource.tinybirdURL);
    url.searchParams.set('token', datasource.tinybirdToken);

    getBackendSrv()
      .get(url.toString())
      .then(({ pipes }) => setPipes(pipes.map((pipe: unknown) => pick(pipe, 'id', 'name'))));
  }, [datasource.tinybirdURL, datasource.tinybirdToken]);

  useEffect(() => {
    if (!pipes.length) {
      return;
    }

    const pipeId = pipes.find((pipe) => pipe.name === query.pipeName)!.id;
    const url = new URL(`${datasource.tinybirdURL}${pipeId}`);
    url.searchParams.set('token', datasource.tinybirdToken);

    getBackendSrv()
      .get(url.toString())
      .then(({ nodes }) =>
        onChange({
          ...query,
          paramOptions: Object.fromEntries(nodes[0].params.map((param: any) => [param.name, param.type])),
        })
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasource.tinybirdToken, datasource.tinybirdURL, pipes, query.pipeName]);

  return (
    <div className={styles.root}>
      <InlineFieldRow>
        <InlineFieldRow>
          <InlineField label="Pipe name" labelWidth={14} tooltip="Tinybird datasource name">
            <Select
              width={50}
              options={pipeNameOptions}
              value={query.pipeName}
              onChange={({ value }) => onChange({ ...query, pipeName: value ?? '' })}
              placeholder="ds"
            />
          </InlineField>
        </InlineFieldRow>

        <InlineField label="Format as" labelWidth={14}>
          <Select
            width={50}
            options={formatAsOptions}
            value={query.format}
            onChange={({ value }) => {
              onChange({ ...query, format: value ?? 'table' });
            }}
            placeholder="Format as"
          />
        </InlineField>

        {query.format === 'timeseries' && (
          <InlineField
            label="Extrapolate"
            labelWidth={14}
            tooltip="Turn on if you don't like when last data point in time series much lower then previous"
          >
            <InlineSwitch
              value={query.extrapolate}
              onChange={({ currentTarget: { value } }) => onChange({ ...query, extrapolate: !!value })}
            />
          </InlineField>
        )}
      </InlineFieldRow>

      <table className={styles.table}>
        <thead className={styles.thead}>
          <tr className={styles.row}>
            {['Name', 'Type', 'Value'].map((_, key) => (
              <th key={key} className={styles.th}>
                {_}
              </th>
            ))}
            <th className={styles.th}></th>
          </tr>
        </thead>
        <tbody className={styles.tbody}>
          {Object.entries(query.paramOptions ?? {}).map(([name, type], rowIdx) => (
            <tr key={rowIdx} className={styles.row}>
              <td className={styles.td}>{name}</td>
              <td className={styles.td}>{type}</td>
              <td className={styles.td}>
                <input
                  className={styles.input}
                  value={query.params[name]}
                  onChange={(e) => onChange({ ...query, params: { ...query.params, [name]: e.currentTarget.value } })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const getStyles = stylesFactory((theme: GrafanaTheme) => {
  return {
    root: css`
      margin-top: 2rem;
    `,
    table: css`
      table-layout: auto;
      border: 1px solid ${theme.colors.formInputBorder};
      border-collapse: separate;
      border-radius: ${theme.border.radius.sm};
      border-spacing: 0;
      border-left: 0;
      width: 100%;
    `,
    thead: css`
      display: table-header-group;
      vertical-align: middle;
      border-color: inherit;
      border-collapse: separate;
      &:first-child tr:first-child th:first-child {
        border-radius: ${theme.border.radius.sm} 0 0 0;
      }
      &:last-child tr:last-child th:first-child {
        border-radius: 0 0 0 ${theme.border.radius.sm};
      }
    `,
    tbody: css`
      &:first-child tr:first-child td:first-child {
        border-radius: ${theme.border.radius.sm} 0 0 0;
      }
      &:last-child tr:last-child td:first-child {
        border-radius: 0 0 0 ${theme.border.radius.sm};
      }
    `,
    input: css`
      outline: none;
      border: 0;
      background: transparent;
      width: 100%;
    `,
    row: css`
      display: table-row;
      vertical-align: inherit;
      border-color: inherit;
    `,
    th: css`
      padding: ${theme.spacing.xs} ${theme.spacing.sm};
      border-left: solid ${theme.colors.formInputBorder} 1px;
      font-size: ${theme.typography.size.sm};
      color: ${theme.colors.textSemiWeak};
      font-weight: ${theme.typography.weight.regular};
      &:last-child {
        border-left: 0;
      }
    `,
    td: css`
      padding: ${theme.spacing.xs} ${theme.spacing.sm};
      border: 1px solid transparent;
      border-left: solid ${theme.colors.formInputBorder} 1px;
      border-top: solid ${theme.colors.formInputBorder} 1px;
      background-color: ${theme.colors.formInputBg};
    `,
  };
});

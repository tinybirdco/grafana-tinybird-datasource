import React, { useEffect, useState } from 'react';
import { Button, Icon, InlineField, InlineFieldRow, InlineSwitch, Select, stylesFactory, useTheme } from '@grafana/ui';
import { GrafanaTheme, QueryEditorProps, SelectableValue } from '@grafana/data';
import { css } from '@emotion/css';
import { DataSource } from '../datasource';
import { OutputFormat, Pair, SUPPORTED_OUTPUT_FORMATS, TinybirdOptions, TinybirdQuery } from '../types';
import { capitalize } from 'lodash';
import { getBackendSrv } from '@grafana/runtime';

export function QueryEditor({
  query,
  onChange,
  datasource,
}: QueryEditorProps<DataSource, TinybirdQuery, TinybirdOptions>) {
  const theme = useTheme();
  const styles = getStyles(theme);
  const params = query.params ?? [];
  const [pipeNameOptions, setPipeNameOptions] = useState<Array<SelectableValue<string>>>([]);
  const formatAsOptions: Array<SelectableValue<OutputFormat>> = SUPPORTED_OUTPUT_FORMATS.map((f) => ({
    label: capitalize(f),
    value: f,
  }));

  const onParamsChange = (params: Array<Pair<string, string>>) => {
    onChange({ ...query, params });
  };

  const updateCell = (colIdx: number, rowIdx: number, value: string) => {
    onParamsChange(
      params.map(([key, val], idx) => {
        if (rowIdx === idx) {
          if (colIdx === 0) {
            return [value, val];
          } else if (colIdx === 1) {
            return [key, value];
          } else {
            return [key, val];
          }
        }
        return [key, val];
      })
    );
  };

  const addRow = (i: number) => {
    onParamsChange([...params.slice(0, i + 1), ['', ''], ...params.slice(i + 1)]);
  };

  const removeRow = (i: number) => {
    onParamsChange([...params.slice(0, i), ...params.slice(i + 1)]);
  };

  useEffect(() => {
    const url = new URL(datasource.tinybirdURL);
    url.searchParams.set('token', datasource.tinybirdToken);

    getBackendSrv()
      .get(url.toString())
      .then(({ pipes }) => pipes.map((pipe: any) => ({ label: pipe.name, value: pipe.name })))
      .then(setPipeNameOptions);
  }, [datasource, datasource.tinybirdURL, datasource.tinybirdToken]);

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
      {params.length === 0 ? (
        <Button
          variant="secondary"
          onClick={() => {
            addRow(0);
          }}
        >
          Add param
        </Button>
      ) : (
        <table className={styles.table}>
          <thead className={styles.thead}>
            <tr className={styles.row}>
              {['Key', 'Value'].map((_, key) => (
                <th key={key} className={styles.th}>
                  {_}
                </th>
              ))}
              <th className={styles.th}></th>
            </tr>
          </thead>
          <tbody className={styles.tbody}>
            {params.map((row, rowIdx) => (
              <tr key={rowIdx} className={styles.row}>
                {row.map((cell, colIdx) => (
                  <td key={colIdx} className={styles.td}>
                    <input
                      value={cell}
                      onChange={(e) => updateCell(colIdx, rowIdx, e.currentTarget.value)}
                      className={styles.input}
                    />
                  </td>
                ))}
                <td className={styles.td}>
                  <div className={styles.actionCell}>
                    <a className={styles.plusIcon} onClick={() => addRow(rowIdx)}>
                      <Icon name="plus" />
                    </a>
                    <a className={styles.minusIcon} onClick={() => removeRow(rowIdx)}>
                      <Icon name="minus" />
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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
      &:last-child {
        border-left: 0;
        width: 32px;
        padding-left: 0;
        padding-right: ${theme.spacing.xs};
      }
    `,
    actionCell: css`
      display: flex;
      & > * {
        margin-right: ${theme.spacing.xs};
      }
      & > *:last-child {
        margin-right: 0;
      }
    `,
    plusIcon: css`
      display: flex;
      background: ${theme.colors.bg2};
      padding: ${theme.spacing.xs} ${theme.spacing.sm};
      align-items: center;
      border-radius: ${theme.border.radius.sm};
    `,
    minusIcon: css`
      display: flex;
      background: ${theme.colors.bg2};
      padding: ${theme.spacing.xs} ${theme.spacing.sm};
      align-items: center;
      border-radius: ${theme.border.radius.sm};
    `,
  };
});

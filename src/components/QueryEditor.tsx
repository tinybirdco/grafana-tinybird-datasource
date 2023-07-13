import React, { useEffect, useMemo, useState } from 'react';
import {
  Icon,
  IconButton,
  InlineField,
  InlineFieldRow,
  InlineSwitch,
  Input,
  Select,
  stylesFactory,
  Tooltip,
  useTheme,
} from '@grafana/ui';
import { GrafanaTheme, QueryEditorProps, SelectableValue } from '@grafana/data';
import { css } from '@emotion/css';
import DataSource from '../datasource';
import {
  DEFAULT_QUERY,
  OutputFormat,
  SUPPORTED_OUTPUT_FORMATS,
  TinybirdOptions,
  TinybirdParam,
  TinybirdPipe,
  TinybirdQuery,
} from '../types';
import { capitalize, isEqual, pickBy, uniqWith } from 'lodash';

export default function QueryEditor({
  app,
  query,
  onChange,
  datasource,
}: QueryEditorProps<DataSource, TinybirdQuery, TinybirdOptions>) {
  const theme = useTheme();
  const styles = getStyles(theme);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [pipes, setPipes] = useState<TinybirdPipe[]>([]);
  const formatAsOptions: Array<SelectableValue<OutputFormat>> = SUPPORTED_OUTPUT_FORMATS.map((f) => ({
    label: capitalize(f),
    value: f,
  }));

  const isAlerting = app === 'unified-alerting';

  const pipeNameOptions = useMemo(() => pipes.map((pipe) => ({ label: pipe.name, value: pipe.name })), [pipes]);

  useEffect(() => {
    if (!datasource.url) {
      return;
    }

    datasource.getPipes().then(setPipes).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasource.url]);

  useEffect(() => {
    if (!pipes.length || !datasource.url) {
      return;
    }

    const pipe = pipes.find((pipe) => pipe.name === query.pipeName);

    if (!pipe) {
      return;
    }

    datasource
      .getNodes(pipe.id)
      .then((nodes) => {
        const paramOptions = Object.fromEntries(
          uniqWith(
            nodes.reduce((acc, node) => [...acc, ...node.params], []),
            isEqual
          ).map(({ name, ...param }) => [name, pickBy(param)])
        ) as Record<string, TinybirdParam>;

        const params =
          !query.params || isEqual(query.params, DEFAULT_QUERY.params)
            ? Object.entries(paramOptions).reduce(
                (acc, [name, param]) => ({ ...acc, [name]: String(param.default ?? '') }),
                {}
              )
            : query.params;

        onChange({
          ...query,
          paramOptions,
          params,
        });
      })
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasource.url, pipes, query.pipeName]);

  return (
    <div className={styles.root}>
      <InlineFieldRow>
        <InlineField label="API Endpoint" labelWidth={15} tooltip="Your published Tinybird API Endpoint">
          <Select
            width={50}
            options={pipeNameOptions}
            value={query.pipeName}
            onChange={({ value }) => {
              if (value) {
                onChange({ ...query, pipeName: value });
              }
            }}
            placeholder="ds"
          />
        </InlineField>

        {!isAlerting ? (
          <InlineField label="Format as" labelWidth={15}>
            <Select
              width={50}
              options={formatAsOptions}
              value={query.format}
              onChange={({ value }) => {
                if (value) {
                  onChange({ ...query, format: value });
                }
              }}
              placeholder="Format as"
            />
          </InlineField>
        ) : (
          <InlineField label="Time key" labelWidth={16} tooltip="Time key of the data">
            <Input
              value={query.timeKey}
              onChange={({ currentTarget: { value } }) => onChange({ ...query, timeKey: value })}
            />
          </InlineField>
        )}

        <div className={styles.cogIconWrapper}>
          {query.format === 'timeseries' && (
            <IconButton
              name="cog"
              variant={isOptionsOpen ? 'primary' : 'secondary'}
              onClick={() => setIsOptionsOpen((value) => !value)}
            />
          )}
        </div>
      </InlineFieldRow>

      {isOptionsOpen && (
        <InlineFieldRow>
          <InlineField
            label="Extrapolate"
            labelWidth={15}
            tooltip="Turn on if you don't like when last data point in time series much lower then previous"
          >
            <InlineSwitch
              value={query.extrapolate}
              onChange={({ currentTarget: { value } }) => onChange({ ...query, extrapolate: !!value })}
            />
          </InlineField>
          <InlineField label="Time key" labelWidth={16} tooltip="Time key of the data">
            <Input
              value={query.timeKey}
              onChange={({ currentTarget: { value } }) => onChange({ ...query, timeKey: value })}
            />
          </InlineField>
          <InlineField label="Data keys" labelWidth={16} tooltip="Comma-separated keys to access values of the data">
            <Input
              value={query.dataKeys}
              onChange={({ currentTarget: { value } }) => onChange({ ...query, dataKeys: value })}
            />
          </InlineField>
          <InlineField label="Label keys" labelWidth={16} tooltip="Comma-separated keys to access labels of the data">
            <Input
              value={query.labelKeys}
              onChange={({ currentTarget: { value } }) => onChange({ ...query, labelKeys: value })}
            />
          </InlineField>
        </InlineFieldRow>
      )}

      <div className={styles.root}>
        {Object.keys(query.paramOptions ?? {}).length > 0 && (
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
              {Object.entries(query.paramOptions).map(([name, { type, description, required }], rowIdx) => (
                <tr key={rowIdx} className={styles.row}>
                  <td className={styles.td}>
                    <div className={styles.nameCol}>
                      {name}
                      {description && (
                        <Tooltip content={description}>
                          <Icon name="info-circle" />
                        </Tooltip>
                      )}
                    </div>
                  </td>
                  <td className={styles.td}>
                    {type}
                    {required ? '*' : ''}
                  </td>
                  <td className={styles.td}>
                    <input
                      className={styles.input}
                      value={query.params[name]}
                      onChange={(e) =>
                        onChange({ ...query, params: { ...query.params, [name]: e.currentTarget.value } })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const getStyles = stylesFactory((theme: GrafanaTheme) => {
  return {
    root: css`
      margin-top: 1.5rem;
    `,
    cogIconWrapper: css`
      display: flex;
      align-items: center;
      position: relative;
      flex: 0 0 auto;
      margin: 0px 4px 4px 4px;
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
    nameCol: css`
      display: flex;
      align-items: center;
      gap: ${theme.spacing.xs};
    `,
  };
});

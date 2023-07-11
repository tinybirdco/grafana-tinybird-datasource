import React, { ChangeEvent, useEffect } from 'react';
import { InlineField, Input, InlineFieldRow } from '@grafana/ui';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { DEFAULT_HOST, TinybirdOptions, TinybirdSecureJsonData } from '../types';

export default function ConfigEditor({
  options,
  onOptionsChange,
}: DataSourcePluginOptionsEditorProps<TinybirdOptions, TinybirdSecureJsonData>) {
  const onOptionChange = (e: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      secureJsonData: {
        ...options.secureJsonData!,
        [e.target.name]:
          e.target.name === 'host' && e.target.value.endsWith('/') ? e.target.value.slice(0, -1) : e.target.value,
      },
    });
  };

  // Set default host
  useEffect(() => {
    onOptionsChange({
      ...options,
      secureJsonData: {
        ...options.secureJsonData!,
        host: options.secureJsonData?.host ?? DEFAULT_HOST,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="gf-form-group">
      <h3 className="page-heading">Tinybird Options</h3>

      <InlineFieldRow>
        <InlineField label="Host" labelWidth={15} tooltip="The URL where your Tinybird Workspace is hosted.">
          <Input
            name="host"
            width={50}
            value={options.secureJsonData?.host}
            onChange={onOptionChange}
            spellCheck={false}
            placeholder={DEFAULT_HOST}
            required
          />
        </InlineField>
      </InlineFieldRow>

      <InlineFieldRow>
        <InlineField label="Token" labelWidth={15} tooltip="Tinybird API token">
          <Input
            name="token"
            width={50}
            value={options.secureJsonData?.token ?? ''}
            onChange={onOptionChange}
            spellCheck={false}
            placeholder="p.ey..."
            required
          />
        </InlineField>
      </InlineFieldRow>
    </div>
  );
}

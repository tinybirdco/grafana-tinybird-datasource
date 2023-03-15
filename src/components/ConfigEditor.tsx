import React, { ChangeEvent } from 'react';
import { InlineField, Input, InlineFieldRow } from '@grafana/ui';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { TinybirdOptions } from '../types';

export default function ConfigEditor({
  options,
  onOptionsChange,
}: DataSourcePluginOptionsEditorProps<TinybirdOptions>) {
  const onOptionChange = (e: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...options.jsonData,
        [e.target.name]: e.target.value,
      },
    });
  };

  return (
    <div className="gf-form-group">
      <h3 className="page-heading">Tinybird Options</h3>

      <InlineFieldRow>
        <InlineField label="Host" labelWidth={14} tooltip="The URL where your Tinybird Workspace is hosted.">
          <Input
            name="host"
            width={50}
            value={options.jsonData.host}
            onChange={onOptionChange}
            spellCheck={false}
            placeholder="https://api.tinybird.co/"
            required
          />
        </InlineField>
      </InlineFieldRow>

      <InlineFieldRow>
        <InlineField label="Token" labelWidth={14} tooltip="Tinybird API token">
          <Input
            name="token"
            width={50}
            value={options.jsonData.token}
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

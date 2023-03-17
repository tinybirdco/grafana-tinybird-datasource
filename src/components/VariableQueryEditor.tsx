import React, { useState } from 'react';
import QueryEditor from 'components/QueryEditor';
import DataSource from 'datasource';
import { TinybirdQuery, DEFAULT_QUERY } from 'types';
import { defaults } from 'lodash';
import { Button, InlineField, InlineFieldRow, Input } from '@grafana/ui';

interface VariableQueryEditorProps {
  datasource: DataSource;
  query: TinybirdQuery;
  onChange: (value: TinybirdQuery, definition: string) => void;
}

export default function VariableQueryEditor({ query, onChange, datasource }: VariableQueryEditorProps) {
  const [state, setState] = useState<TinybirdQuery>(defaults(query, DEFAULT_QUERY));

  const saveQuery = () => {
    onChange(state, JSON.stringify(state, null));
  };

  return (
    <div>
      <InlineFieldRow>
        <InlineField label="Variable key" labelWidth={16} tooltip="Key to access values in data array">
          <Input
            value={state.variableKey}
            onChange={({ currentTarget: { value } }) =>
              setState((currentState) => ({ ...currentState, variableKey: value }))
            }
          />
        </InlineField>
        <Button onClick={saveQuery}>Run</Button>
      </InlineFieldRow>
      <QueryEditor query={state} onChange={setState} datasource={datasource} onRunQuery={() => undefined} />
    </div>
  );
}

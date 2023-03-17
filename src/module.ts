import { DataSourcePlugin } from '@grafana/data';
import DataSource from './datasource';
import ConfigEditor from './components/ConfigEditor';
import QueryEditor from './components/QueryEditor';
import VariableQueryEditor from 'components/VariableQueryEditor';
import { TinybirdQuery, TinybirdOptions } from './types';

export const plugin = new DataSourcePlugin<DataSource, TinybirdQuery, TinybirdOptions>(DataSource)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(QueryEditor)
  .setVariableQueryEditor(VariableQueryEditor);

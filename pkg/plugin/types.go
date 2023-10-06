package plugin

import (
	"net/http"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

type Datasource struct {
	settings   backend.DataSourceInstanceSettings
	httpClient *http.Client
	host       string
}

type TinybirdParam struct {
	Type        string `json:"type"`
	Description string `json:"description"`
	Required    bool   `json:"required"`
	Default     any    `json:"default"`
}

type TinybirdQuery struct {
	Format       string                   `json:"format"`
	PipeName     string                   `json:"pipeName"`
	ParamOptions map[string]TinybirdParam `json:"paramOptions"`
	Params       map[string]string        `json:"params"`
	Extrapolate  bool                     `json:"extrapolate"`
	TimeKey      string                   `json:"timeKey"`
	DataKeys     string                   `json:"dataKeys"`
	LabelKeys    string                   `json:"labelKeys"`
	VariableKey  string                   `json:"variableKey"`
}

type TinybirdMeta struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

type TinybirdResponse struct {
	Error                  string                   `json:"error"`
	Meta                   []TinybirdMeta           `json:"meta"`
	Data                   []map[string]interface{} `json:"data"`
	Rows                   int                      `json:"rows"`
	RowsBeforeLimitAtLeast int                      `json:"rows_before_limit_at_least"`
	Statistics             map[string]int           `json:"statistics"`
}

var timeTypes = map[string]bool{
	"Date":          true,
	"DateTime":      true,
	"DateTime64":    true,
	"DateTime64(3)": true,
	"DateTime64(6)": true,
}

var numberTypes = map[string]bool{
	"UInt8":      true,
	"UInt16":     true,
	"UInt32":     true,
	"UInt64":     true,
	"Int8":       true,
	"Int16":      true,
	"Int32":      true,
	"Int64":      true,
	"Float32":    true,
	"Float64":    true,
	"Decimal":    true,
	"Decimal32":  true,
	"Decimal64":  true,
	"Decimal128": true,
}

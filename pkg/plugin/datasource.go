package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/araddon/dateparse"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/httpclient"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"

	"github.com/grafana/grafana-plugin-sdk-go/data"
)

var (
	_ backend.QueryDataHandler      = (*Datasource)(nil)
	_ backend.CheckHealthHandler    = (*Datasource)(nil)
	_ instancemgmt.InstanceDisposer = (*Datasource)(nil)
)

func NewDatasource(ctx context.Context, settings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	host, hostPresent := settings.DecryptedSecureJSONData["host"]

	if !hostPresent || host == "" {
		return nil, fmt.Errorf("host is required")
	}

	token, tokenPresent := settings.DecryptedSecureJSONData["token"]

	if !tokenPresent || token == "" {
		return nil, fmt.Errorf("token is required")
	}

	host = strings.TrimSuffix(host, "/")
	host = fmt.Sprintf("%s/v0/pipes/", host)

	opts, err := settings.HTTPClientOptions()
	if err != nil {
		return nil, fmt.Errorf("http client options: %w", err)
	}

	opts.Headers["Authorization"] = fmt.Sprintf("Bearer %s", token)

	httpClient, err := httpclient.New(opts)
	if err != nil {
		return nil, fmt.Errorf("httpclient new: %w", err)
	}

	return &Datasource{
		settings,
		httpClient,
		host,
	}, nil
}

func (d *Datasource) Dispose() {
	d.httpClient.CloseIdleConnections()
}

func (d *Datasource) QueryData(ctx context.Context, req *backend.QueryDataRequest) (*backend.QueryDataResponse, error) {
	response := backend.NewQueryDataResponse()

	for _, q := range req.Queries {
		res := d.query(ctx, req.PluginContext, q)
		response.Responses[q.RefID] = res
	}

	return response, nil
}

func (d *Datasource) query(_ context.Context, pCtx backend.PluginContext, query backend.DataQuery) backend.DataResponse {
	defer func() {
		if err := recover(); err != nil {
			log.DefaultLogger.Error("Exception: %v", err)
		}
	}()

	var qm TinybirdQuery

	if err := json.Unmarshal(query.JSON, &qm); err != nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, fmt.Sprintf("json unmarshal: %v", err.Error()))
	}

	if qm.PipeName == "" {
		return backend.ErrDataResponse(backend.StatusBadRequest, "pipe name is required")
	}

	url := fmt.Sprintf("%s%s.json", d.host, qm.PipeName)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, fmt.Sprintf("http new request: %v", err.Error()))
	}

	q := req.URL.Query()
	for key, value := range qm.Params {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}

		if strings.Contains(value, "__from") {
			value = parseTimeVariable(value, query.TimeRange.From)
		}

		if strings.Contains(value, "__to") {
			value = parseTimeVariable(value, query.TimeRange.To)
		}

		q.Add(key, value)
	}

	req.URL.RawQuery = q.Encode()
	res, err := d.httpClient.Do(req)

	if err != nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, fmt.Sprintf("http new request: %v", err.Error()))
	}

	tbResponse := &TinybirdResponse{}
	json.NewDecoder(res.Body).Decode(tbResponse)

	if tbResponse.Error != "" {
		return backend.ErrDataResponse(backend.StatusBadRequest, tbResponse.Error)
	}

	if tbResponse.Data == nil || len(tbResponse.Data) == 0 {
		return backend.ErrDataResponse(backend.StatusBadRequest, "no data")
	}

	timeKey := qm.TimeKey

	if timeKey == "" {
		timeKey = findFirstTimeKey(tbResponse.Meta)
	}

	if timeKey == "" {
		return backend.ErrDataResponse(backend.StatusBadRequest, "no time key")
	}

	var fields []*data.Field

	for _, meta := range tbResponse.Meta {
		meta.Type = unwrapType(meta.Type)

		if numberTypes[meta.Type] {
			fields = append(fields, newField[float64](meta.Name))
		} else if timeTypes[meta.Type] {
			if meta.Name != timeKey {
				continue
			}
			fields = append(fields, newField[time.Time](meta.Name))
		} else {
			fields = append(fields, newField[string](meta.Name))
		}
	}

	frame := data.NewFrame("response", fields...)

	for _, row := range tbResponse.Data {
		var vals []interface{}

		for _, meta := range tbResponse.Meta {
			meta.Type = unwrapType(meta.Type)

			if row[meta.Name] == nil {
				vals = append(vals, nil)
			} else if timeTypes[meta.Type] {
				if meta.Name != timeKey {
					continue
				}
				val, _ := dateparse.ParseLocal(row[meta.Name].(string))
				vals = append(vals, &val)
			} else if numberTypes[meta.Type] {
				val := row[meta.Name].(float64)
				vals = append(vals, &val)
			} else {
				val := row[meta.Name].(string)
				vals = append(vals, &val)
			}
		}

		frame.AppendRow(vals...)
	}

	if frame.TimeSeriesSchema().Type == data.TimeSeriesTypeLong {
		sortByTime(frame, timeKey)

		frame, err = data.LongToWide(frame, &data.FillMissing{Mode: data.FillModeNull})

		if err != nil {
			return backend.ErrDataResponse(backend.StatusBadRequest, err.Error())
		}
	}

	if frame.TimeSeriesSchema().Type == data.TimeSeriesTypeNot {
		return backend.ErrDataResponse(backend.StatusBadRequest, "no time series data")
	}

	return backend.DataResponse{
		Frames: []*data.Frame{frame},
	}
}

func (d *Datasource) CheckHealth(_ context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	tbReq, err := http.NewRequest("GET", d.host, nil)
	if err != nil {
		return nil, err
	}

	res, err := d.httpClient.Do(tbReq)

	if err != nil {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: err.Error(),
		}, nil
	}

	var resBody struct {
		Error string `json:"error"`
	}

	err = json.NewDecoder(res.Body).Decode(&resBody)

	if err != nil {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: err.Error(),
		}, nil
	}

	var status = backend.HealthStatusOk
	var message = "OK"

	if resBody.Error != "" {
		status = backend.HealthStatusError
		message = resBody.Error
	}

	return &backend.CheckHealthResult{
		Status:  status,
		Message: message,
	}, nil
}

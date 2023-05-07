package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/httpclient"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"

	// "github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/grafana/grafana-plugin-sdk-go/data"
)

var (
	_ backend.QueryDataHandler      = (*Datasource)(nil)
	_ backend.CheckHealthHandler    = (*Datasource)(nil)
	_ instancemgmt.InstanceDisposer = (*Datasource)(nil)
)

func NewDatasource(settings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	opts, err := settings.HTTPClientOptions()
	if err != nil {
		return nil, fmt.Errorf("http client options: %w", err)
	}

	cl, err := httpclient.New(opts)
	if err != nil {
		return nil, fmt.Errorf("httpclient new: %w", err)

	}

	var tbOpts struct {
		Host  string `json:"host"`
		Token string `json:"token"`
	}

	json.Unmarshal(settings.JSONData, &tbOpts)

	if tbOpts.Host == "" {
		return nil, fmt.Errorf("tinybirdURL is required")
	}

	if tbOpts.Token == "" {
		return nil, fmt.Errorf("tinybirdToken is required")
	}

	if strings.HasSuffix(tbOpts.Host, "/") {
		tbOpts.Host = strings.TrimSuffix(tbOpts.Host, "/")
	}
	tbOpts.Host = fmt.Sprintf("%s/v0/pipes/", tbOpts.Host)

	return &Datasource{
		settings:   settings,
		httpClient: cl,
		host:       tbOpts.Host,
		token:      tbOpts.Token,
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
	var qm TinybirdQuery

	if err := json.Unmarshal(query.JSON, &qm); err != nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, fmt.Sprintf("json unmarshal: %v", err.Error()))
	}

	if qm.PipeName == "" {
		return backend.ErrDataResponse(backend.StatusBadRequest, "pipe name is required")
	}

	if qm.TimeKey == "" {
		return backend.ErrDataResponse(backend.StatusBadRequest, "time key is required")
	}

	url := fmt.Sprintf("%s%s.json", d.host, qm.PipeName)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, fmt.Sprintf("http new request: %v", err.Error()))
	}

	q := req.URL.Query()
	q.Add("token", d.token)

	for key, value := range qm.Params {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		q.Add(key, value)
	}

	req.URL.RawQuery = q.Encode()
	res, err := d.httpClient.Do(req)

	tbResponse := &TinybirdResponse{}
	json.NewDecoder(res.Body).Decode(tbResponse)

	timeField := makeTimeKeyField(qm.TimeKey, tbResponse.Meta, tbResponse.Data)

	if timeField == nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, "time key not found")
	}

	frames := []*data.Frame{}

	for _, meta := range tbResponse.Meta {
		meta.Type = unwrapNullable(meta.Type)
		if timeTypes[meta.Type] {
			continue
		}

		frame := data.NewFrame(meta.Name, timeField, makeFieldByMeta(meta, tbResponse.Data))
		frames = append(frames, frame)
	}

	return backend.DataResponse{
		Frames: frames,
	}
}

func (d *Datasource) CheckHealth(_ context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	tbReq, err := http.NewRequest("GET", d.host, nil)
	if err != nil {
		return nil, err
	}
	q := tbReq.URL.Query()
	q.Add("token", d.token)
	tbReq.URL.RawQuery = q.Encode()

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

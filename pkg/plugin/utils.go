package plugin

import (
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/araddon/dateparse"
	"github.com/grafana/grafana-plugin-sdk-go/data"
)

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

var timeTypes = map[string]bool{
	"Date":          true,
	"DateTime":      true,
	"DateTime64":    true,
	"DateTime64(3)": true,
	"DateTime64(6)": true,
}

func makeFieldByMeta(meta TinybirdMeta, tbData []map[string]interface{}) *data.Field {
	if numberTypes[meta.Type] {
		return makeFloatDataField(meta.Name, tbData)
	}

	if timeTypes[meta.Type] {
		return makeTimeDataField(meta.Name, tbData)
	}

	return makeStringDataField(meta.Name, tbData)
}

func makeFloatDataField(name string, tbData []map[string]interface{}) *data.Field {
	values := make([]float64, len(tbData))

	for i, v := range tbData {
		if v[name] == nil {
			values[i] = 0
			continue
		}

		values[i] = v[name].(float64)
	}

	return data.NewField(name, map[string]string{
		"column": name,
	}, values)
}

func makeTimeDataField(name string, tbData []map[string]interface{}) *data.Field {
	values := make([]time.Time, len(tbData))

	for i, v := range tbData {
		if v[name] == nil {
			values[i] = time.Time{}
			continue
		}

		values[i], _ = dateparse.ParseLocal(v[name].(string))
	}

	return data.NewField(name, map[string]string{
		"column": name,
	}, values)
}

func makeStringDataField(name string, tbData []map[string]interface{}) *data.Field {
	values := make([]string, len(tbData))

	for i, v := range tbData {
		if v[name] == nil {
			values[i] = ""
			continue
		}

		values[i] = v[name].(string)
	}

	return data.NewField(name, map[string]string{
		"column": name,
	}, values)
}

func makeTimeKeyField(timeKey string, meta []TinybirdMeta, data []map[string]interface{}) *data.Field {
	var timeFieldMeta *TinybirdMeta

	for _, meta := range meta {
		if timeKey == meta.Name {
			meta.Type = unwrapNullable(meta.Type)
			timeFieldMeta = &meta
			break
		}
	}

	if timeFieldMeta == nil {
		return nil
	}

	return makeFieldByMeta(*timeFieldMeta, data)
}

func unwrapNullable(t string) string {
	return regexp.MustCompile(`Nullable\((.*)\)`).ReplaceAllString(t, `$1`)
}

func findFirstTimeKey(meta []TinybirdMeta) string {
	for _, m := range meta {
		if timeTypes[m.Type] {
			return m.Name
		}
	}

	return ""
}

func parseTimeVariable(variable string, value time.Time) string {
	if !strings.Contains(variable, ":") {
		// ${__from}
		return value.String()
	} else if strings.HasSuffix(variable, ":date}") || strings.HasSuffix(variable, ":date:iso}") {
		// ${__from:date}	|| ${__from:date:iso}
		return value.Format(time.RFC3339)
	} else if strings.HasSuffix(variable, ":date:seconds}") {
		// ${__from:date:seconds}
		return strconv.FormatInt(value.Unix(), 10)
	}

	re := regexp.MustCompile(`date\:(.*)\}`)
	formatString := re.FindStringSubmatch(variable)[1]
	formatString = strings.ReplaceAll(formatString, "YYYY", "2006")
	formatString = strings.ReplaceAll(formatString, "MM", "01")
	formatString = strings.ReplaceAll(formatString, "DD", "02")
	formatString = strings.ReplaceAll(formatString, "HH", "15")
	formatString = strings.ReplaceAll(formatString, "mm", "04")
	formatString = strings.ReplaceAll(formatString, "ss", "05")

	return value.Format(formatString)
}

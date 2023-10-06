package plugin

import (
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/experimental"
)

func newField[V interface {
	float64 | string | time.Time
}](name string) *data.Field {
	field := data.NewField(name, nil, []*V{})
	field.Config = &data.FieldConfig{
		DisplayName: name,
	}
	return field
}

func unwrapType(t string) string {
	t = regexp.MustCompile(`Nullable\((.*)\)`).ReplaceAllString(t, `$1`)
	t = regexp.MustCompile(`LowCardinality\((.*)\)`).ReplaceAllString(t, `$1`)
	return t
}

func sortByTime(frame *data.Frame, timeKey string) {
	for _, f := range frame.Fields {
		if f.Name == timeKey {
			sorter := experimental.NewFrameSorter(frame, f)
			sort.Sort(sorter)
			return
		}
	}
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

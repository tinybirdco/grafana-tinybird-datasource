# Tinybird Data Source for Grafana

This plugin enables you to use your published Tinybird APIs with Grafana.

## Configure Grafana

The plugin is not yet available in the Grafana Marketplace and must be installed manually. This requires enabling the Grafana option to install unsigned plugins. To do this, you have two options (you do not need to do both!):

1. Put Grafana into 'development' mode by editing either the `grafana.ini` or `defaults.ini` file. Note: When installing [Grafana 10 from a tar file](https://grafana.com/grafana/download?pg=get&plcmt=selfmanaged-box1-cta1&platform=mac), there is no `grafana.in` and instead there is a `./conf/defaults.ini` file. Either way, edit the following line: `app_mode = development`
2. Or, add the plugin to the whitelist by editing that same file and update this line: `allow_loading_unsigned_plugins = tinybird-tinybird-datasource`

## Install the plugin

1. Find the release bundle in the [GitHub releases](https://github.com/tinybirdco/grafana-tinybird-datasource/releases) and install using `./grafana cli`. For example: `./grafana cli --pluginsDir <YOUR-PLUGIN-PATH> --insecure --pluginUrl https://github.com/tinybirdco/grafana-tinybird-datasource/releases/download/2.0.0/grafana-tinybird-datasource-2.0.0.zip plugins install tinybird-tinybird-datasource`
+ Notes:
  + Your `<YOUR-PLUGIN-PATH>` depends... In some cases, it is `/var/lib/grafana/plugins`. The `defaults.ini` file references a `data/plugins` folder. When running the Grafana CLI from its `bin` folder, setting the plugin path to `../data/plugins` did the trick and Grafana server was able to find and load the plugin. YMMV.
  + You'll know it loaded as expected when you see this `WARN` message when starting Grafana server: `WARN [06-29|14:48:06] Permitting unsigned plugin. This is not recommended logger=plugin.signature.validator pluginID=tinybird-tinybird-datasource`
  + With this release the zip file name has a new pattern: `grafana-tinybird-datasource` instead of `tinybird-tinybird-datasource`
2. Restart Grafana to load the plugin
3. Open the Data Sources page, and add a new Tinybird Data Source.
4. In the Data Source config, set the Tinybird endpoint to use. This is specific to the Tinybird region you are in (e.g. `https://api.tinybird.co` or `https://api.us-east.tinybird.co`)
5. In the Data Source config, set the Tinybird Auth Token to use. This token should have `READ` permissions for the API Endpoints you wish to visualize.
6. Save the Data Source config

## Create your first chart

1. Open a dashboard and add a new panel
2. Select the Tinybird Data Source
3. From the `Pipe` dropdown, select the API Endpoint you wish to visualize
4. From the `Format` dropdown, select the format that is appropriate for your vizualization
5. If your API Endpoint has parameters, they will be automatically discovered and added to the parameters table. If your API Endpoint has params to accept a date range, you can configure them here to accept the [Grafana date range variables](https://grafana.com/docs/grafana/v8.5/variables/variable-types/global-variables/). For example, if your API Endpoint accepts a param `date_from` and `date_to`, you can use the Grafana variables `${__from}` and `${__to}` respectively.

## Auto-discovery of API Endpoint

Configure the Data Source with a Tinybird Auth Token, and it will auto-discover the API Endpoints that the token has permissions to read. When you add a new panel, simlpy select which API Endpoint you want to use from a dropdown list.

## Auto-discovery of API Endpoint Params

When you select an API Endpoint in a panel, it will automatically discover the parameters that are available to pass through. You can choose which parameters to pass a value for, including sending [Grafana variables](https://grafana.com/docs/grafana/v8.5/variables/variable-types/global-variables/).

## Authentication

When configuring the Data Source, you will be asked for an Auth Token. This Auth Token must have `READ` access to all Pipes that you wish to use with the Data Source.

## Optimising Pipes

You should take care to ensure that your Pipes are optimised when adding them to Grafana, as Grafana can cause a lot of requests (e.g. with auto-refreshes).

Here are some sugggestions:

1. Ensure there is a default applied to date range parameters in Tinybird (or a LIMIT on how many rows to return). When you add a new panel to Grafana, it won't apply the date filters by default. If you have no defaults, or date range params are marked as optional, you could scan the entire table and return millions of results. This is a good way to crash your browser.
2. Optimise the sorting keys of your Data Sources in Tinybird, so that queries from Grafana are scanning as little data as possible. Ensure you are applying these filters appropriately in Grafana.

## Development

BE:

1. [Install mage](https://magefile.org/)
2. Build binaries & start docker container

```bash
mage -v && docker compose up
```

FE:

1. Install dependencies

```bash
yarn install
```

2. Run in development mode

```bash
yarn run dev
```

3. Build for production

```bash
yarn run build
```

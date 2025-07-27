========================
CODE SNIPPETS
========================
TITLE: Demonstrate Markdown and HTML Elements in Evidence Pages
DESCRIPTION: This example showcases various Markdown and inline HTML elements that can be used within an Evidence `.md` page. It includes headers, text formatting (italic, bold), links, and image embedding using both Markdown and HTML syntax, demonstrating the flexibility of Evidence's page rendering capabilities.

SOURCE: https://docs.evidence.dev/build-your-first-app

LANGUAGE: Markdown
CODE:
```
## Hello Evidence

This is a new page in Evidence.

### This is a lower level header
This is some *italic* and **bold** text.

This is a [link](https://evidence.dev).

This is an image inserted using Markdown:
![alt text](https://evidence.dev/brand-assets/wordmark-black.png)

This is an image inserted using HTML:
<img src="https://evidence.dev/brand-assets/wordmark-black.png" alt="evidence logo" class="w-72"/>
```

----------------------------------------

TITLE: Create a New Evidence Page with Basic Markdown
DESCRIPTION: This snippet demonstrates how to create a new page in Evidence by adding a basic Markdown structure to a `.md` file within the `src/pages` directory. This content will be rendered as a new page in the Evidence application, visible in the sidebar.

SOURCE: https://docs.evidence.dev/build-your-first-app

LANGUAGE: Markdown
CODE:
```
## Hello Evidence

This is a new page in Evidence.
```

----------------------------------------

TITLE: Create a Bar Chart with a New Markdown Query
DESCRIPTION: This Markdown snippet demonstrates how to create a new Markdown query named `orders_by_month` to aggregate data for visualization. It then shows how to use this query's output to render a `BarChart` component, visualizing orders over time.

SOURCE: https://docs.evidence.dev/build-your-first-app

LANGUAGE: Markdown
CODE:
```
Next, let's visualize orders over the past year using a [Bar Chart](/components/charts/bar-chart). Add the following to your page. Notice that we are creating a new Markdown query called `orders_by_month`:

```
```

----------------------------------------

TITLE: Create and Use Markdown Queries with Data Tables
DESCRIPTION: This Markdown snippet demonstrates how to define and use Markdown queries within an Evidence page. Markdown queries are written in DuckDB dialect, run against the Evidence data cache, and their outputs are directly accessible by components. The example shows an initial query, then refines it to select specific columns and limit results, and finally integrates it with a `DataTable` component for display.

SOURCE: https://docs.evidence.dev/build-your-first-app

LANGUAGE: Markdown
CODE:
```
## Hello Evidence

### Orders Table

```my_query_summary
select * from needful_things.my_query
```
```

LANGUAGE: Markdown
CODE:
```
## Hello Evidence

### Orders Table

```my_query_summary
select * from needful_things.my_query
```

<DataTable data={my_query_summary} />
```

LANGUAGE: Markdown
CODE:
```
```my_query_summary_top100
select
   order_datetime,
   first_name,
   last_name,
   email
from needful_things.my_query
order by order_datetime desc
limit 100
```
```

LANGUAGE: Markdown
CODE:
```
<DataTable data={my_query_summary_top100}>
   <Column id=order_datetime title="Order Date"/>
   <Column id=first_name />
   <Column id=email />
</DataTable>
```

----------------------------------------

TITLE: Define a SQL Source Query for Orders
DESCRIPTION: This SQL snippet defines a source query named `my_query.sql` that selects all columns from the `orders` table. This query is run directly against the data source and populates the Evidence data cache, making the data available for subsequent Markdown queries.

SOURCE: https://docs.evidence.dev/build-your-first-app

LANGUAGE: SQL
CODE:
```
select * from orders
```

----------------------------------------

TITLE: Manually Run Evidence Source Queries
DESCRIPTION: This command is used to manually execute source queries configured in Evidence. Running sources transforms data from various sources into a unified data cache, making it available for use within Evidence pages. It's typically used when the underlying data source changes or for building pages for deployment.

SOURCE: https://docs.evidence.dev/build-your-first-app

LANGUAGE: Shell
CODE:
```
npm run sources
```

----------------------------------------

TITLE: SQL Query for EV Station Count by State
DESCRIPTION: This SQL query calculates the number of EV stations per state from the `us_alt_fuel_stations` dataset. It excludes California, groups the results by state, and orders them in descending order of station count, providing a ranked list of states by EV infrastructure.

SOURCE: https://docs.evidence.dev/build-your-first-app

LANGUAGE: SQL
CODE:
```
select State, count(*) AS ev_station_count from ev_stations.us_alt_fuel_stations
where State not in ('CA')
group by State order by ev_station_count desc
```

----------------------------------------

TITLE: Evidence Project CSV Data Source File Structure
DESCRIPTION: This snippet illustrates the recommended file structure for incorporating a CSV data source into an Evidence project. It shows the placement of the CSV file alongside its associated configuration files (connection.yaml, connection.options.yaml) within a dedicated source directory.

SOURCE: https://docs.evidence.dev/build-your-first-app

LANGUAGE: Filesystem
CODE:
```
sources/
`-- ev_stations/
   |-- connection.yaml
   |-- connection.options.yaml
   `-- us_alt_fuel_stations.csv
```

----------------------------------------

TITLE: Example Tooltip Configuration Array
DESCRIPTION: An example JavaScript array demonstrating how to configure the `tooltip` property with multiple entries, each defining content, formatting, and styling for different data fields within a tooltip.

SOURCE: https://docs.evidence.dev/components/maps/point-map

LANGUAGE: JavaScript
CODE:
```
tooltip={[
    {id: 'zip_code', fmt: 'id', showColumnName: false, valueClass: 'text-xl font-semibold'},
    {id: 'sales', fmt: 'eur', fieldClass: 'text-[grey]', valueClass: 'text-[green]'},
    {id: 'zip_code', showColumnName: false, contentType: 'link', linkLabel: 'Click here', valueClass: 'font-bold mt-1'}
]}
```

----------------------------------------

TITLE: SQL Query for Monthly Order Count
DESCRIPTION: This SQL query retrieves the count of orders per month from a specified table. It groups the results by month, orders them in descending order, and limits the output to the most recent 12 months, suitable for time-series analysis.

SOURCE: https://docs.evidence.dev/build-your-first-app

LANGUAGE: SQL
CODE:
```
select order_month, count(*) as orders from needful_things.my_query
group by order_month order by order_month desc
limit 12
```

----------------------------------------

TITLE: Run Evidence Development Server
DESCRIPTION: This command starts the development server for an Evidence component plugin, allowing developers to test their components locally and inspect the pages they created.

SOURCE: https://docs.evidence.dev/plugins/create-component-plugin

LANGUAGE: bash
CODE:
```
npm run dev
```

----------------------------------------

TITLE: Evidence Bar Chart Component Usage
DESCRIPTION: This snippet demonstrates how to integrate and configure the BarChart component in an Evidence application. It binds the chart to a data source, specifies the x and y axes, applies a date format to the x-axis, and sets custom titles for both axes.

SOURCE: https://docs.evidence.dev/build-your-first-app

LANGUAGE: Evidence Component
CODE:
```
<BarChart
    data={orders_by_month}
    x=order_month
    y=orders
	xFmt="mmm yyyy"
	xAxisTitle="Month"
	yAxisTitle="Orders"
/>
```

----------------------------------------

TITLE: Markdown Syntax Example
DESCRIPTION: Demonstrates basic Markdown features supported by Evidence, including lists, formatting, links, and inline code.

SOURCE: https://docs.evidence.dev/core-concepts/syntax

LANGUAGE: markdown
CODE:
```
---
title: Evidence uses Markdown
---

Markdown can be used to write expressively in text.

- it supports lists,
- **bolding**, _italics_ and `inline code`,
- links to [external sites](https://google.com) and other [Evidence pages](/another/page)

## Images 🖼️

Evidence looks for images in your `static` folder, e.g. `static/my-logo.png`.
![Company Logo](/my-logo.png)
```

----------------------------------------

TITLE: Install Firebase CLI Globally
DESCRIPTION: Installs the Firebase command-line interface globally on your system, enabling interaction with Firebase services from the terminal. This is a prerequisite for deploying to Firebase Hosting.

SOURCE: https://docs.evidence.dev/deployment/self-host/firebase

LANGUAGE: bash
CODE:
```
npm install -g firebase-tools
```

----------------------------------------

TITLE: GitHub Actions Workflow for Deploying Evidence to Hugging Face Spaces
DESCRIPTION: This GitHub Actions workflow automates the build and deployment of an Evidence application to Hugging Face Spaces. It includes steps for checking out the repository, installing Node.js dependencies, building the project, installing the Hugging Face CLI, authenticating with a token, and uploading the 'build' directory to the specified Hugging Face Space. It demonstrates how to use GitHub secrets for sensitive credentials.

SOURCE: https://docs.evidence.dev/deployment/self-host/hugging-face-spaces

LANGUAGE: yaml
CODE:
```
name: Deploy to Hugging Face Space on Merge
on:
  push:
    branches:
      - main
  workflow_dispatch:

jobs:
  build_and_deploy:
    runs-on: ubuntu-latest
    steps:
      # Checkout the repository
      - uses: actions/checkout@v4

      # Install dependencies and build the project
      - run: npm ci && npm run sources && npm run build
        env:
          EVIDENCE_SOURCE__taxi__project_id: ${{ secrets.EVIDENCE_SOURCE__TAXI__PROJECT_ID }}
          EVIDENCE_SOURCE__taxi__client_email: ${{ secrets.EVIDENCE_SOURCE__TAXI__CLIENT_EMAIL }}
          EVIDENCE_SOURCE__taxi__private_key: ${{ secrets.EVIDENCE_SOURCE__TAXI__PRIVATE_KEY }}

      # Deploy to Hugging Face Space
      - name: Install Hugging Face CLI
        run: pip install huggingface-hub

      - name: Authenticate with Hugging Face
        run: huggingface-cli login --token "${{ secrets.HUGGINGFACE_TOKEN }}"

      - name: Deploy to Hugging Face Space
        run: |
          # Update to use your repo
          huggingface-cli upload [your-username]/[your-space-name] ./build --repo-type=space
```

----------------------------------------

TITLE: Install Evidence Component Plugin via npm
DESCRIPTION: This command installs a specific component plugin package from npm into your Evidence project. This is the essential first step before the plugin's components can be registered and used.

SOURCE: https://docs.evidence.dev/plugins/component-plugins

LANGUAGE: bash
CODE:
```
npm install @acme/charting
```

----------------------------------------

TITLE: Basic Frontmatter Configuration Example
DESCRIPTION: Illustrates the fundamental YAML structure required at the very beginning of an Evidence markdown file to define page-level metadata, such as the page title.

SOURCE: https://docs.evidence.dev/reference/markdown

LANGUAGE: yaml
CODE:
```
---
title: Evidence Docs
---
```

----------------------------------------

TITLE: Evidence US Map Component Usage
DESCRIPTION: This snippet demonstrates how to use the USMap component in Evidence to visualize data on a map of the United States. It binds the map to a data source, specifies the state column, enables state abbreviations, and sets the value column for coloring or sizing map regions.

SOURCE: https://docs.evidence.dev/build-your-first-app

LANGUAGE: Evidence Component
CODE:
```
<USMap data={ev_map} state=State abbreviations=true value=ev_station_count/>
```

----------------------------------------

TITLE: Install Evidence Source Plugin via npm
DESCRIPTION: This command installs a new source plugin for Evidence projects using npm, making it available for registration and configuration.

SOURCE: https://docs.evidence.dev/plugins/source-plugins

LANGUAGE: npm
CODE:
```
npm install @cool-new-db/evidence-source-plugin
```

----------------------------------------

TITLE: Start Evidence Development Server
DESCRIPTION: Command to start the Evidence development server, typically used for local development and testing. This is the initial step before configuring new data sources via the web interface.

SOURCE: https://docs.evidence.dev/core-concepts/data-sources/google-sheets

LANGUAGE: shell
CODE:
```
npm run dev
```

----------------------------------------

TITLE: SQL Query Example
DESCRIPTION: Shows how to embed and execute SQL queries using the DuckDB dialect within Evidence markdown files. The query results can be referenced later in the document.

SOURCE: https://docs.evidence.dev/core-concepts/syntax

LANGUAGE: sql
CODE:
```
```sql orders_by_month
select
    date_trunc('month', order_datetime) as order_month,
    count(*) as number_of_orders,
    sum(sales) as sales_usd
from needful_things.orders
group by 1, order by 1 desc
```
```

----------------------------------------

TITLE: Evidence Templating: Loop Example
DESCRIPTION: Demonstrates how to use Evidence's templating syntax for loops to iterate over data, such as the results of a SQL query, and render repeating elements.

SOURCE: https://docs.evidence.dev/core-concepts/syntax

LANGUAGE: Evidence Templating
CODE:
```
{#each orders_by_month as month}

- There were <Value data={month} column=number_of_orders/> orders in <Value data={month} />.

{/each}
```

----------------------------------------

TITLE: Check Node.js and NPM versions (Shell)
DESCRIPTION: Use these commands to verify the currently installed versions of Node.js and NPM on your system. Evidence requires Node.js ≥18.13, 20 or 22, and NPM 7 or above.

SOURCE: https://docs.evidence.dev/guides/system-requirements

LANGUAGE: Shell
CODE:
```
node -v
npm -v
```

----------------------------------------

TITLE: Build Evidence Application Locally
DESCRIPTION: Executes the local build process for the Evidence application. This command installs project dependencies, runs source generation scripts, and compiles the application into static files ready for deployment.

SOURCE: https://docs.evidence.dev/deployment/self-host/firebase

LANGUAGE: bash
CODE:
```
npm i && npm run sources && npm run build
```

----------------------------------------

TITLE: Example of Nested Options with Children in Evidence Datasource
DESCRIPTION: Illustrates how to use the `children` property within Evidence Datasource options to create variable configurations. This example shows `sslmode` being exposed only when `ssl` is true, demonstrating conditional UI rendering based on parent option values.

SOURCE: https://docs.evidence.dev/plugins/create-source-plugin

LANGUAGE: javascript
CODE:
```
ssl: {
    type: 'boolean',
    // ...
    nest: true,
    children: {
        [true]: {
            sslmode: {
                // ...
            }
        }
    }
}
```

----------------------------------------

TITLE: Initialize Firebase Hosting Project
DESCRIPTION: Initializes Firebase Hosting within your project directory, guiding you through configuration steps such as selecting a Firebase project, defining the public directory, and setting up GitHub Actions for automated builds and deployments. This command sets up the necessary Firebase configuration files.

SOURCE: https://docs.evidence.dev/deployment/self-host/firebase

LANGUAGE: bash
CODE:
```
firebase init hosting
```

----------------------------------------

TITLE: Start Evidence Development Server
DESCRIPTION: This command initiates the Evidence development server, enabling local development and testing of the application. It's a common first step when working on an Evidence project locally.

SOURCE: https://docs.evidence.dev/core-concepts/data-sources/bigquery

LANGUAGE: bash
CODE:
```
npm run dev
```

----------------------------------------

TITLE: Basic Dimension Grid Component Usage
DESCRIPTION: This example shows the simplest way to instantiate a DimensionGrid component, taking a data source named 'my_query' as its input. It creates an interactive grid for the specified data.

SOURCE: https://docs.evidence.dev/components/inputs/dimension-grid

LANGUAGE: jsx
CODE:
```
<DimensionGrid data={my_query} />
```

----------------------------------------

TITLE: Start Evidence Development Server
DESCRIPTION: This command initiates the Evidence development server, making the local application accessible for configuration and use. It's the essential first step before configuring data sources or accessing the settings page.

SOURCE: https://docs.evidence.dev/core-concepts/data-sources/mysql

LANGUAGE: shell
CODE:
```
npm run dev
```

----------------------------------------

TITLE: Configure GitLab Pages CI/CD for Evidence Project
DESCRIPTION: This snippet details the essential configuration parameters and commands required for setting up a GitLab CI/CD pipeline to build and deploy an Evidence project to GitLab Pages. It specifies the Node.js version for the build environment, the package installation command, and the sequence of build commands to generate the static site.

SOURCE: https://docs.evidence.dev/deployment/self-host/gitlab-pages

LANGUAGE: shell
CODE:
```
Build image: node:22
Installation steps: npm ci
Build steps:
  npm run sources
  npm run build
  cp -r build public
```

----------------------------------------

TITLE: Markdown Hyperlinks
DESCRIPTION: Provides examples of creating both external and internal links in Markdown, specifying the display text in square brackets and the target URL or path in parentheses.

SOURCE: https://docs.evidence.dev/reference/markdown

LANGUAGE: Markdown
CODE:
```
[External link](https://google.com)

[Internal link](/another/page)
```

----------------------------------------

TITLE: Displaying Info Component Inline
DESCRIPTION: Demonstrates basic inline usage of the Info component to display contextual information, sourcing data from the World Bank. This example shows the component's minimal required `description` prop.

SOURCE: https://docs.evidence.dev/components/ui/info

LANGUAGE: JSX
CODE:
```
Data was sourced from the World Bank <Info description="World Economic Indicators dataset from past 12 months" />
```

----------------------------------------

TITLE: Install Svelte Adapter Static Dependency
DESCRIPTION: Adds the `@sveltejs/adapter-static` package as a development dependency to the project. This adapter is essential for SvelteKit applications that are intended to be built as static sites, which is a requirement for SPA mode deployment.

SOURCE: https://docs.evidence.dev/deployment/configuration/rendering-modes

LANGUAGE: bash
CODE:
```
npm install --save-dev @sveltejs/adapter-static
```

----------------------------------------

TITLE: Start Evidence Development Server
DESCRIPTION: This command initiates the Evidence development server, allowing local access to the application for development and testing. It's a common way to run Evidence during development.

SOURCE: https://docs.evidence.dev/core-concepts/data-sources/csv

LANGUAGE: bash
CODE:
```
npm run dev
```

----------------------------------------

TITLE: Start Evidence Development Server
DESCRIPTION: Initiates the Evidence development server, which is a prerequisite for accessing the application's settings and features. This command is typically executed from the project's root directory.

SOURCE: https://docs.evidence.dev/core-concepts/data-sources/duckdb

LANGUAGE: shell
CODE:
```
npm run dev
```

----------------------------------------

TITLE: Start Evidence Development Server
DESCRIPTION: This command initiates the Evidence development server, making the application accessible locally. It is a prerequisite for configuring data sources and typically executed in the project's root directory.

SOURCE: https://docs.evidence.dev/core-concepts/data-sources/mssql

LANGUAGE: JavaScript
CODE:
```
npm run dev
```

----------------------------------------

TITLE: Evidence Templating: If/Else Example
DESCRIPTION: Shows conditional rendering in Evidence using if/else statements based on data values, allowing for dynamic content display.

SOURCE: https://docs.evidence.dev/core-concepts/syntax

LANGUAGE: Evidence Templating
CODE:
```
{#if orders_by_month[0].sales_usd > orders_by_month[1].sales_usd}

Sales are up month-over-month.

{:else}

Sales are down vs last month. See [category detail](/sales-by-category).

{/if}
```

----------------------------------------

TITLE: Render a Basic Heatmap Component
DESCRIPTION: Shows a fundamental example of rendering the Heatmap component with essential data, x-axis, y-axis, and value properties. It also includes a value formatting option.

SOURCE: https://docs.evidence.dev/components/charts/heatmap

LANGUAGE: JSX
CODE:
```
<Heatmap
    data={orders}
    x=day
    y=category
    value=order_count
    valueFmt=usd
/>
```

----------------------------------------

TITLE: Example Tooltip Configuration for Map Component
DESCRIPTION: Illustrates how to structure the 'tooltip' array property to define multiple fields within a tooltip, including custom formatting, styling, and link content.

SOURCE: https://docs.evidence.dev/components/maps/base-map

LANGUAGE: JSON
CODE:
```
tooltip={[
    {id: 'zip_code', fmt: 'id', showColumnName: false, valueClass: 'text-xl font-semibold'},
    {id: 'sales', fmt: 'eur', fieldClass: 'text-[grey]', valueClass: 'text-[green]'},
    {id: 'zip_code', showColumnName: false, contentType: 'link', linkLabel: 'Click here', valueClass: 'font-bold mt-1'}
]}
```

----------------------------------------

TITLE: Evidence `fmt` Function Usage Example in Markdown
DESCRIPTION: Demonstrates how to use the `fmt` function within a markdown context to format a calculated difference between current and previous year's sales. This example highlights its utility for in-line formatting of dynamic values.

SOURCE: https://docs.evidence.dev/core-concepts/formatting

LANGUAGE: markdown
CODE:
```
Sales are {fmt(sales_per_year[0].total_sales - sales_per_year[1].total_sales, '+#,##0;-#,##0')} vs last year.
```

----------------------------------------

TITLE: Tooltip Configuration Example for Map Component
DESCRIPTION: Illustrates the structure for configuring tooltips, including how to display different data types, apply formatting, and add links, along with custom CSS classes.

SOURCE: https://docs.evidence.dev/components/maps/area-map

LANGUAGE: JavaScript
CODE:
```
tooltip=[
    {id: 'zip_code', fmt: 'id', showColumnName: false, valueClass: 'text-xl font-semibold'},
    {id: 'sales', fmt: 'eur', fieldClass: 'text-[grey]', valueClass: 'text-[green]'},
    {id: 'zip_code', showColumnName: false, contentType: 'link', linkLabel: 'Click here', valueClass: 'font-bold mt-1'}
]
```

----------------------------------------

TITLE: Start Evidence Development Server
DESCRIPTION: This command initiates the Evidence development server, which is necessary for configuring new data sources or making other local changes. It can be run from the project's root directory.

SOURCE: https://docs.evidence.dev/core-concepts/data-sources/snowflake

LANGUAGE: shell
CODE:
```
npm run dev
```

----------------------------------------

TITLE: GitHub Actions Workflow for Deploying Evidence App to GitHub Pages
DESCRIPTION: This GitHub Actions workflow automates the deployment of an Evidence application to GitHub Pages. It checks out the repository, installs Node.js dependencies, builds the Evidence app with the correct base path, uploads the build artifacts, and finally deploys them to GitHub Pages.

SOURCE: https://docs.evidence.dev/deployment/self-host/github-pages

LANGUAGE: yaml
CODE:
```
name: Deploy to GitHub Pages

on:
  push:
    branches: 'main' # or whichever branch you want to deploy from

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Install Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm install

      - name: build
        env:
          BASE_PATH: '/${{ github.event.repository.name }}'
          ## Add and uncomment any environment variables here
          ## EVIDENCE_SOURCE__my_source__username: ${{ secrets.EVIDENCE_SOURCE__MY_SOURCE__USERNAME }}
          ## EVIDENCE_SOURCE__my_source__private_key: ${{ secrets.EVIDENCE_SOURCE__MY_SOURCE__PRIVATE_KEY }}
        run: |
          npm run sources
          npm run build

      - name: Upload Artifacts
        uses: actions/upload-pages-artifact@v3
        with:
          path: 'build/${{ github.event.repository.name }}'

  deploy:
    needs: build
    runs-on: ubuntu-latest

    permissions:
      pages: write
      id-token: write

    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}

    steps:
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
```

----------------------------------------

TITLE: Start Evidence Development Server
DESCRIPTION: This command initiates the Evidence development server, which is a prerequisite for accessing the application's settings page and configuring data sources like Redshift. It runs the development build process.

SOURCE: https://docs.evidence.dev/core-concepts/data-sources/redshift

LANGUAGE: shell
CODE:
```
npm run dev
```

----------------------------------------

TITLE: Manually Setting DateRange Start and End Dates
DESCRIPTION: Shows how to configure the DateRange component with fixed start and end dates using the `start` and `end` properties, bypassing dynamic data binding. This is useful for static date selections or predefined periods.

SOURCE: https://docs.evidence.dev/components/inputs/date-range

LANGUAGE: Evidence Component
CODE:
```
<DateRange
    name=manual_date_range
    start=2019-01-01
    end=2019-12-31
/>
```

----------------------------------------

TITLE: Publish Evidence Component Plugin to npm
DESCRIPTION: This command publishes the component plugin to the npm registry, making it available for others to install and use. Developers must be logged into an npm account and remember to increment the version number in `package.json` before each publish.

SOURCE: https://docs.evidence.dev/plugins/create-component-plugin

LANGUAGE: bash
CODE:
```
npm publish
```

----------------------------------------

TITLE: DateInput with Manually Specified Date Range
DESCRIPTION: Shows how to manually set a fixed start and end date for the DateInput component's range using the `start` and `end` props.

SOURCE: https://docs.evidence.dev/components/inputs/date-input

LANGUAGE: HTML
CODE:
```
<DateInput
    name=manual_date_range
    start=2019-01-01
    end=2019-12-31
    range
/>
```

----------------------------------------

TITLE: Start Evidence Development Server
DESCRIPTION: This command initiates the Evidence development server, which is essential for local development and testing of the Evidence application. It allows users to access the local instance and configure data sources.

SOURCE: https://docs.evidence.dev/core-concepts/data-sources/trino

LANGUAGE: Shell
CODE:
```
npm run dev
```

----------------------------------------

TITLE: Markdown Blockquotes
DESCRIPTION: Shows how to create blockquotes in Markdown using the greater-than symbol (>) at the beginning of each line, including examples of multi-line and nested blockquotes.

SOURCE: https://docs.evidence.dev/reference/markdown

LANGUAGE: Markdown
CODE:
```
> This is a blockquote
>
> It can span multiple lines
>
> > And can be nested
```

----------------------------------------

TITLE: DownloadData Component Usage Example
DESCRIPTION: This snippet demonstrates how to integrate the `DownloadData` component into a React/JSX application. It shows how to pass a data source (e.g., `categories`) and a custom `queryID` for the generated filename.

SOURCE: https://docs.evidence.dev/components/ui/download-data

LANGUAGE: jsx
CODE:
```
<DownloadData data={categories} queryID=my_file/>
```

----------------------------------------

TITLE: Bubble Chart Component Usage Example
DESCRIPTION: This code snippet demonstrates how to use the `<BubbleChart>` component in Evidence. It maps data from `price_vs_volume` to X, Y, series, and size properties, and applies a USD formatting to the X-axis.

SOURCE: https://docs.evidence.dev/components/charts/bubble-chart

LANGUAGE: Evidence (Component)
CODE:
```
<BubbleChart
    data={price_vs_volume}
    x=price
    y=number_of_units
    xFmt=usd0
    series=category
    size=total_sales
/>
```

----------------------------------------

TITLE: Dropdown Populated from Query Data
DESCRIPTION: Illustrates how to create a dropdown component where options are dynamically sourced from a query's results (represented by the `categories` variable). This example focuses on the minimal configuration required for data binding.

SOURCE: https://docs.evidence.dev/components/inputs/dropdown

LANGUAGE: jsx
CODE:
```
<Dropdown
    data={categories}
    name=category2
    value=category_name
/>
```

----------------------------------------

TITLE: Build Evidence Static Site
DESCRIPTION: This command initiates the standard build process for an Evidence application. It generates a static version of your reports, including all pages and their parameterized permutations, and places the output in the `build` directory. This is the default command for preparing your Evidence app for deployment.

SOURCE: https://docs.evidence.dev/deployment/overview

LANGUAGE: Shell
CODE:
```
npm run build
```

----------------------------------------

TITLE: Python Code Snippet
DESCRIPTION: Provides an example of including Python code within a code fence. The code is rendered but not executed by Evidence.

SOURCE: https://docs.evidence.dev/core-concepts/syntax

LANGUAGE: python
CODE:
```
```python
names = ["Alice", "Bob", "Charlie"]
for name in names:
    print("Hello, " + name)
```
```

----------------------------------------

TITLE: ReferenceLine: Create a sloped reference line inline
DESCRIPTION: This example illustrates how to draw a sloped reference line by providing explicit start and end coordinates (x, y, x2, y2). This is useful for visualizing trends, growth trajectories, or specific linear relationships between two points on the chart.

SOURCE: https://docs.evidence.dev/components/charts/annotations

LANGUAGE: JSX
CODE:
```
<LineChart data={orders_by_month} x=month y=sales yFmt=usd0 yAxisTitle="Sales per Month">
    <ReferenceLine x='2019-01-01' y=6500 x2='2021-12-01' y2=12000 label="Growth Trend" labelPosition=belowEnd/>
</LineChart>
```

----------------------------------------

TITLE: Basic Histogram Chart Usage
DESCRIPTION: Illustrates the basic setup for a Histogram chart component, integrating it with a data source.

SOURCE: https://docs.evidence.dev/components/charts/mixed-type-charts

LANGUAGE: JSX
CODE:
```
<Chart data={query_name}>
    <Hist/>
</Chart>
```

----------------------------------------

TITLE: Basic AreaChart Configuration
DESCRIPTION: Demonstrates a fundamental AreaChart setup, visualizing sales data over months with 'month' on the x-axis and 'sales' on the y-axis.

SOURCE: https://docs.evidence.dev/components/charts/area-chart

LANGUAGE: jsx
CODE:
```
<AreaChart
    data={orders_by_month}
    x=month
    y=sales
/>
```

----------------------------------------

TITLE: Displaying BigValue with MoM Comparison
DESCRIPTION: This example shows how to include a month-over-month comparison in the BigValue component. It uses 'order_growth' for the comparison value, formats it as a percentage, and sets 'MoM' as the comparison title.

SOURCE: https://docs.evidence.dev/components/data/big-value

LANGUAGE: JSX
CODE:
```
<BigValue
  data={orders_with_comparisons}
  value=num_orders
  comparison=order_growth
  comparisonFmt=pct1
  comparisonTitle="MoM"
/>
```

----------------------------------------

TITLE: Basic Line Chart Usage
DESCRIPTION: Demonstrates the fundamental setup for a LineChart component, displaying monthly sales data with a single Y-axis and custom titles.

SOURCE: https://docs.evidence.dev/components/charts/line-chart

LANGUAGE: jsx
CODE:
```
<LineChart
    data={orders_by_month}
    x=month
    y=sales_usd0k
    yAxisTitle="Sales per Month"
    title="Monthly Sales"
    subtitle="Includes all categories"
/>
```

----------------------------------------

TITLE: Register Evidence Source Plugin in evidence.config.yaml
DESCRIPTION: This YAML configuration snippet shows how to register an installed source plugin within the `evidence.config.yaml` file, integrating it into the project's data sources.

SOURCE: https://docs.evidence.dev/plugins/source-plugins

LANGUAGE: yaml
CODE:
```
plugins:
    components:
        @evidence-dev/core-components: {}
    datasources:
        @cool-new-db/evidence-source-plugin
```

----------------------------------------

TITLE: Making BigValue Component Clickable with Links
DESCRIPTION: This example demonstrates how to add a clickable link to the BigValue component, allowing users to navigate to another internal or external page when the component is interacted with. It also includes a sparkline and comparison.

SOURCE: https://docs.evidence.dev/components/data/big-value

LANGUAGE: JSX
CODE:
```
<BigValue
  data={orders_with_comparisons}
  value=num_orders
  sparkline=month
  comparison=order_growth
  comparisonFmt=pct1
  comparisonTitle="vs. Last Month"
  link='/components/data/big-value'
/>
```

----------------------------------------

TITLE: Example of Interpolated SQL Query in Evidence
DESCRIPTION: This snippet illustrates the result of a build-time variable being interpolated into an Evidence SQL source query. The `${variable_name}` placeholder is replaced with its actual value from the `.env` file during the build process.

SOURCE: https://docs.evidence.dev/core-concepts/data-sources

LANGUAGE: SQL
CODE:
```
select * from customers
where client_id = 123
```

----------------------------------------

TITLE: Build Command for Evidence on Cloudflare Pages
DESCRIPTION: This command sequence is used to prepare and build an Evidence project for deployment on Cloudflare Pages. It first processes data sources and then compiles the application.

SOURCE: https://docs.evidence.dev/deployment/self-host/cloudflare-pages

LANGUAGE: bash
CODE:
```
npm run sources && npm run build
```

----------------------------------------

TITLE: Generating Templated Pages with Each Loop
DESCRIPTION: This example demonstrates an alternative method for generating links to templated pages using an `{#each}` loop in Evidence. An SQL query provides the data, and the loop iterates through each row to create a markdown link for every customer, dynamically constructing the URL.

SOURCE: https://docs.evidence.dev/core-concepts/templated-pages

LANGUAGE: SQL
CODE:
```
select
    customer_name,
    sum(sales) as sales_usd
from needful_things.orders
group by 1
```

LANGUAGE: Markdown
CODE:
```
{#each customers as customer}

- [{customer.customer_name}](/customers/{customer.customer_name})

{/each}
```

----------------------------------------

TITLE: Evidence Frontmatter Configuration
DESCRIPTION: Demonstrates the use of frontmatter to configure page metadata, including title, description, open graph images, and referencing SQL queries.

SOURCE: https://docs.evidence.dev/core-concepts/syntax

LANGUAGE: yaml
CODE:
```
---
title: Evidence uses Markdown
description: Evidence uses Markdown to write expressively in text.
og:
  image: /my-social-image.png
queries:
  - orders_by_month.sql
---
```

----------------------------------------

TITLE: Horizontal Grouped Bar Chart Configuration
DESCRIPTION: This example illustrates a horizontal grouped bar chart, presenting sales by channel side-by-side for each category. It combines 'swapXY' with 'type=grouped'.

SOURCE: https://docs.evidence.dev/components/charts/bar-chart

LANGUAGE: JSX
CODE:
```
<BarChart
    data={categories_by_channel}
    x=category
    y=sales
    series=channel
    type=grouped
    swapXY=true
/>
```

----------------------------------------

TITLE: Filtering a Query with Dropdown Input
DESCRIPTION: Provides a comprehensive example of how to use a dropdown component to dynamically filter a SQL query. It includes the initial SQL query for data, the dropdown component for user input, and the filtered SQL query that incorporates the dropdown's selected value.

SOURCE: https://docs.evidence.dev/components/inputs/dropdown

LANGUAGE: sql
CODE:
```
select id, order_datetime, category, item, sales  from needful_things.orders
limit 100
```

LANGUAGE: jsx
CODE:
```
<Dropdown
    data={query_name}
    name=name_of_dropdown
    value=column_name
/>

```sql filtered_query
select *
from source_name.table
where column_name like '${inputs.name_of_dropdown.value}'
```

Filtered Row Count: {orders_filtered.length}
```

----------------------------------------

TITLE: Managing Application Data and Builds with npm Commands
DESCRIPTION: This snippet provides common `npm` commands used for managing application data loading and building the application. These commands are essential for ensuring data is available for querying and for preparing the application for deployment. Using the debug flag can provide more detailed logs for troubleshooting data loading issues.

SOURCE: https://docs.evidence.dev/guides/troubleshooting

LANGUAGE: Shell
CODE:
```
npm run sources
```

LANGUAGE: Shell
CODE:
```
npm run sources -- --debug
```

LANGUAGE: Shell
CODE:
```
npm run build
```

----------------------------------------

TITLE: Register Component Plugins in evidence.config.yaml
DESCRIPTION: This YAML configuration snippet registers installed component plugins within the Evidence project's `evidence.config.yaml` file. Once registered, the components provided by these plugins become available for use in markdown files.

SOURCE: https://docs.evidence.dev/plugins/component-plugins

LANGUAGE: yaml
CODE:
```
plugins:
    components:
        @evidence-dev/core-components: {}
        @acme/charting: {}
```

----------------------------------------

TITLE: Example File Structure for Templated Pages
DESCRIPTION: This snippet illustrates the typical directory structure created by Evidence for templated pages, showing how a `[parameter].md` file and an `index.md` file are organized within a parameter-named folder. This structure facilitates the generation of multiple pages from a single template.

SOURCE: https://docs.evidence.dev/core-concepts/templated-pages

LANGUAGE: Text
CODE:
```
pages/
`-- customers/
    |-- [customer].md
    `-- index.md
```

----------------------------------------

TITLE: Reference SQL Query Results in Evidence Component
DESCRIPTION: After defining an inline SQL query, its results can be passed to an Evidence component. This example shows how to use the `data` prop of a `<LineChart>` component to consume the results of the `sales_by_category` query.

SOURCE: https://docs.evidence.dev/core-concepts/queries

LANGUAGE: html
CODE:
```
<LineChart data={sales_by_category}/>
```

----------------------------------------

TITLE: Basic Modal Usage with Long Content
DESCRIPTION: Demonstrates how to create a simple modal with a title and button text, containing a large block of text content. This example illustrates the default behavior and content handling of the Modal component.

SOURCE: https://docs.evidence.dev/components/ui/modal

LANGUAGE: JSX
CODE:
```
<Modal title="Title" buttonText='Open Modal'>

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

</Modal>
```

----------------------------------------

TITLE: Bar Chart with Custom Color Palette
DESCRIPTION: This example demonstrates how to apply a custom color palette to the bar chart. An array of hexadecimal color codes is passed to the 'colorPalette' prop.

SOURCE: https://docs.evidence.dev/components/charts/bar-chart

LANGUAGE: JSX
CODE:
```
<BarChart
    data={orders_by_category_2021}
    x=month
    y=sales
    series=category
    colorPalette={[
        '#cf0d06',
        '#eb5752',
        '#e88a87',
        '#fcdad9',
        ]}
/>
```

----------------------------------------

TITLE: Configure SvelteKit Static Adapter
DESCRIPTION: Creates or updates the `svelte.config.js` file at the root of the project to configure SvelteKit. This configuration specifies the use of the static adapter and sets a fallback to `index.html`, ensuring that all client-side routes are handled correctly in an SPA.

SOURCE: https://docs.evidence.dev/deployment/configuration/rendering-modes

LANGUAGE: javascript
CODE:
```
import adapter from '@sveltejs/adapter-static';

/** @type {import("@sveltejs/kit").Config} */
export default {
    kit: {
        adapter: adapter({
            fallback: 'index.html'
        })
    }
};
```

----------------------------------------

TITLE: Chart with Annotations (ReferenceLine, ReferenceArea)
DESCRIPTION: Example of a mixed-type chart incorporating a Line series along with ReferenceLine and ReferenceArea components for adding annotations based on data or specific ranges.

SOURCE: https://docs.evidence.dev/components/charts/mixed-type-charts

LANGUAGE: JSX
CODE:
```
<Chart data={sales_data} x=date y=sales>
  <Line y=sales/>
  <ReferenceLine data={target_data} y=target label=name/>
  <ReferenceArea xMin='2020-03-14' xMax='2020-05-01'/>
</Chart>
```

----------------------------------------

TITLE: Horizontal Stacked Bar Chart Configuration
DESCRIPTION: This example combines horizontal orientation with stacking, displaying sales by category and channel. The 'swapXY' prop is true, and 'series' defines the stacking dimension.

SOURCE: https://docs.evidence.dev/components/charts/bar-chart

LANGUAGE: JSX
CODE:
```
<BarChart
    data={categories_by_channel}
    x=category
    y=sales
    series=channel
    swapXY=true
/>
```

----------------------------------------

TITLE: Stacked Bar Chart Configuration
DESCRIPTION: This example shows how to create a stacked bar chart, where sales data is segmented by category within each month. The 'series' prop is used to define the stacking dimension.

SOURCE: https://docs.evidence.dev/components/charts/bar-chart

LANGUAGE: JSX
CODE:
```
<BarChart
    data={orders_by_category_2021}
    x=month
    y=sales
    series=category
/>
```

----------------------------------------

TITLE: PointMap Input Value (Full Row)
DESCRIPTION: Example of the JSON structure representing the full row of data that is captured when a point on the `PointMap` (configured as an input) is clicked. This shows all columns and their boolean values indicating presence.

SOURCE: https://docs.evidence.dev/components/maps/point-map

LANGUAGE: JSON
CODE:
```
{
  "id": true,
  "point_name": true,
  "lat": true,
  "long": true,
  "sales": true,
  "link_col": true
}
```

----------------------------------------

TITLE: TextInput Component with Placeholder Text
DESCRIPTION: Illustrates how to include placeholder text within the TextInput field, which provides a hint to the user and disappears when the user starts typing, using the 'placeholder' property.

SOURCE: https://docs.evidence.dev/components/inputs/text-input

LANGUAGE: HTML
CODE:
```
<TextInput
    name=name_of_input
    title="Freetext Search"
    placeholder="Start typing"
/>

Selected: {inputs.text_input3}
```

----------------------------------------

TITLE: Grouped Bar Chart Configuration
DESCRIPTION: This example demonstrates a grouped bar chart, where categories are displayed side-by-side for each month instead of stacked. The 'type' prop is set to 'grouped' to achieve this layout.

SOURCE: https://docs.evidence.dev/components/charts/bar-chart

LANGUAGE: JSX
CODE:
```
<BarChart
    data={orders_by_category_2021}
    x=month
    y=sales
    series=category
    type=grouped
/>
```

----------------------------------------

TITLE: NGINX Configuration for SPA URL Rewriting
DESCRIPTION: Provides an example NGINX server block configuration for self-hosting a Single Page Application (SPA). It sets the document root to the project's build directory and uses the `try_files` directive to redirect all unhandled URLs to `index.html`, which is crucial for client-side routing to function correctly.

SOURCE: https://docs.evidence.dev/deployment/configuration/rendering-modes

LANGUAGE: nginx
CODE:
```
root /path/to/your/project/build/;

location / {
    try_files $uri $uri/ $uri.html /index.html;
}
```

----------------------------------------

TITLE: PointMap Custom Tooltip on Click with Link
DESCRIPTION: Configures a custom tooltip for the PointMap component that appears on click. This example includes a column that is rendered as a clickable link, allowing drilldown functionality directly from the tooltip.

SOURCE: https://docs.evidence.dev/components/maps/point-map

LANGUAGE: JSX
CODE:
```
<PointMap
    data={la_locations}
    lat=lat
    long=long
    value=sales
    valueFmt=usd
    pointName=point_name
    height=200
    tooltipType=click
    tooltip={[
        {id: 'point_name', showColumnName: false, valueClass: 'text-xl font-semibold'},
        {id: 'sales', fmt: 'eur', fieldClass: 'text-[grey]', valueClass: 'text-[green]'},
        {id: 'link_col', showColumnName: false, contentType: 'link', linkLabel: 'Click here', valueClass: 'font-bold mt-1'}
    ]}
/>
```

----------------------------------------

TITLE: Markdown Image Embedding
DESCRIPTION: Demonstrates how to embed images in Markdown using an exclamation mark followed by alt text in square brackets and the image source in parentheses, including examples for online images and local static files.

SOURCE: https://docs.evidence.dev/reference/markdown

LANGUAGE: Markdown
CODE:
```
![An online image](https://i.imgur.com/xyI27iZ.gif)

![An image stored in the project's static folder](/my-image.png)
```

----------------------------------------

TITLE: Custom Basemap Configuration in BaseMap
DESCRIPTION: Illustrates how to specify a custom basemap URL and attribution text for the BaseMap component. This allows users to integrate different map tile providers, as shown with an OpenStreetMap example.

SOURCE: https://docs.evidence.dev/components/maps/base-map

LANGUAGE: jsx
CODE:
```
<BaseMap basemap={`https://tile.openstreetmap.org/{z}/{x}/{y}.png`} attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'>
    <Points
        data={la_locations}
        lat=lat
        long=long
        value=sales
        valueFmt=usd
        pointName=point_name
        color=violet
        borderColor=black
        borderWidth=2
    />
</BaseMap>
```

----------------------------------------

TITLE: Netlify Deployment Configuration for Evidence Apps
DESCRIPTION: This section outlines the necessary build settings and environment variable formats for deploying an Evidence project on Netlify. It includes the required build command, publish directory, and the specific naming convention for Evidence source environment variables.

SOURCE: https://docs.evidence.dev/deployment/self-host/netlify

LANGUAGE: APIDOC
CODE:
```
Netlify Build Settings:
  Build command: npm run sources && npm run build
  Publish directory: build

Netlify Environment Variables:
  Key format: EVIDENCE_SOURCE__[your_source]__[option_name]
  Note: Values are base64 encoded and need decoding.
  Example: EVIDENCE_SOURCE__MYDB__HOST
```

----------------------------------------

TITLE: Histogram with Custom X-Axis Title
DESCRIPTION: This example shows how to customize the x-axis title of the Histogram component. It applies a custom label to the x-axis for better readability, using the 'xAxisTitle' prop.

SOURCE: https://docs.evidence.dev/components/charts/histogram

LANGUAGE: Evidence Component
CODE:
```
<Histogram
    data={orders_week}
    x=sales
    xAxisTitle="Weekly Sales"
/>
```

----------------------------------------

TITLE: Configure Slider with Custom Min, Max, and Step Values
DESCRIPTION: This example shows how to define custom `min`, `max`, and `step` properties for the Slider. This allows precise control over the slider's numerical range and the incremental value when adjusted.

SOURCE: https://docs.evidence.dev/components/inputs/slider

LANGUAGE: JSX
CODE:
```
<Slider
    title="Months"
    name=monthsWithSteps
    min=0
    max=36
    step=12
/>
```

----------------------------------------

TITLE: Adding a Sparkline to BigValue Component
DESCRIPTION: This example demonstrates how to include a small inline chart (sparkline) within the BigValue component, providing a quick visual trend of the displayed metric over a specified period, such as 'month'.

SOURCE: https://docs.evidence.dev/components/data/big-value

LANGUAGE: JSX
CODE:
```
<BigValue
  data={orders_with_comparisons}
  value=sales
  sparkline=month
/>
```

----------------------------------------

TITLE: Evidence Reserved Language Code Fences
DESCRIPTION: Demonstrates the use of code fences with reserved language names (e.g., 'python', 'r') in Evidence. These code blocks will render the code as text rather than executing it, useful for displaying code examples.

SOURCE: https://docs.evidence.dev/reference/markdown

LANGUAGE: python
CODE:
```
names = ["Alice", "Bob", "Charlie"]

for name in names:
    print("Hello, " + name)
```

LANGUAGE: r
CODE:
```
names <- c("Alice", "Bob", "Charlie")

for (name in names) {
    print(paste("Hello, ", names))
}
```

----------------------------------------

TITLE: Adding Multiple Layers to BaseMap
DESCRIPTION: Demonstrates how to integrate multiple map layers, specifically Areas and Bubbles, within a single BaseMap component. This example shows how to pass data, column mappings, and styling properties to each layer.

SOURCE: https://docs.evidence.dev/components/maps/base-map

LANGUAGE: jsx
CODE:
```
<BaseMap>
  <Areas
    data={la_zip_sales}
    areaCol=zip_code
    geoJsonUrl="path/to/your/geoJSON"
    geoId=ZCTA5CE10
    value=sales
    valueFmt=usd
  />
  <Bubbles
    data={la_locations}
    lat=lat
    long=long
    size=sales
    sizeFmt=usd
    value=sales
    valueFmt=usd
    pointName=point_name
    colorPalette={['yellow','orange','red','darkred']}
    opacity=0.5
  />
</BaseMap>
```

----------------------------------------

TITLE: SankeyDiagram Multi-level Data Preparation and Display
DESCRIPTION: Explains how to prepare data for a multi-level Sankey diagram using SQL `UNION ALL` to combine different levels of flow. The `sourceCol` and `targetCol` must represent the connections between levels. The example then shows how to render this multi-level data using the SankeyDiagram component.

SOURCE: https://docs.evidence.dev/components/charts/sankey-diagram

LANGUAGE: sql
CODE:
```
select
    channel as source,
    'all_traffic' as target,
    count(user_id) as count
from events.web_events
group by 1,2

union all

select
    'all_traffic' as source,
    page_route as target,
    count(user_id) as count
from events.web_events
group by 1, 2
```

LANGUAGE: jsx
CODE:
```
<SankeyDiagram
    data={traffic_data}
    title="Sankey"
    subtitle="A simple sankey chart"
    sourceCol=source
    targetCol=target
    valueCol=count
/>
```

----------------------------------------

TITLE: Set Slider Size to Medium
DESCRIPTION: This example demonstrates how to adjust the slider's visual length to a 'medium' size using the `size` property. This helps in fitting the component within different layout constraints.

SOURCE: https://docs.evidence.dev/components/inputs/slider

LANGUAGE: JSX
CODE:
```
<Slider
    title="Months Medium"
    name=monthsMedium
    defaultValue=4
    min=0
    max=36
    size=medium
/>
```

----------------------------------------

TITLE: Delta Component Symbol Position
DESCRIPTION: Examples showing how to adjust the position of the delta symbol (e.g., the up/down arrow) relative to the value, placing it on the left side. This can be combined with or without chip styling.

SOURCE: https://docs.evidence.dev/components/data/delta

LANGUAGE: JSX
CODE:
```
<Delta data={growth} column=positive fmt=pct1 symbolPosition=left/>
```

LANGUAGE: JSX
CODE:
```
<Delta data={growth} column=positive fmt=pct1 chip=true symbolPosition=left/>
```

----------------------------------------

TITLE: Full Width Tabs Example
DESCRIPTION: This snippet demonstrates how to configure the <Tabs> component to span the full width of its container by setting the `fullWidth` prop to `true`. This is useful for creating layouts where the tab navigation occupies the entire available horizontal space.

SOURCE: https://docs.evidence.dev/components/ui/tabs

LANGUAGE: HTML
CODE:
```
<Tabs fullWidth=true>
    <Tab label="First Tab">
        Content of the First Tab
    </Tab>
    <Tab label="Second Tab">
        Content of the Second Tab
    </Tab>
</Tabs>
```
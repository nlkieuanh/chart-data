// traffic-geo-function.js
// Geo Chart with Chart.js Geo Plugin (no switch mode)

async function orgLoadAndCreateGeoChart(canvasId, jsonUrl) {
  const ctx = document.getElementById(canvasId).getContext("2d");

  // Fetch data
  const response = await fetch(jsonUrl);
  const data = await response.json();

  // Load world map from chartjs-chart-geo
  const world = await fetch("https://unpkg.com/world-atlas/countries-50m.json")
    .then((r) => r.json())
    .then((topojsonData) =>
      ChartGeo.topojson.feature(topojsonData, topojsonData.objects.countries).features
    );

  // Map short country codes/names to full map names
  function countryNameMap(code) {
    const map = {
      US: "United States of America",
      UK: "United Kingdom",
      Germany: "Germany",
      India: "India",
      Japan: "Japan",
    };
    return map[code] || code;
  }

  // Transform data into dataset
  function buildDataset(entity) {
    return {
      label: entity.name,
      data: entity.countries.map((c) => ({
        feature: world.find((f) => f.properties.name === countryNameMap(c.name)),
        value: c.value,
      })),
      backgroundColor: entity.color,
      borderWidth: 0.5,
    };
  }

  // Always show yourCompany + all competitors
  const datasets = [buildDataset(data.yourCompany), ...data.competitors.map(buildDataset)];

  // Destroy old chart if exists
  if (window.geoChartInstance) {
    window.geoChartInstance.destroy();
  }

  // Create chart
  window.geoChartInstance = new Chart(ctx, {
    type: "choropleth",
    data: {
      labels: world.map((d) => d.properties.name),
      datasets: datasets,
    },
    options: {
      showOutline: true,
      showGraticule: true,
      scales: {
        projection: {
          axis: "x",
          projection: "equalEarth",
        },
        color: {
          axis: "x",
          interpolate: "blues",
          legend: {
            position: "bottom-right",
          },
        },
      },
      plugins: {
        legend: {
          position: "bottom",
        },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              return `${ctx.dataset.label} - ${ctx.raw.feature.properties.name}: ${ctx.raw.value}`;
            },
          },
        },
      },
    },
  });
}

// ===== Common Utilities =====
function chartHexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ===== Detect & Process Data =====
function chartProcessData(data, mode = "direct") {
  const datasets = [];

  // --- CASE: Geo Distribution (ECharts map) ---
  if (data.competitors && data.competitors[0].countries) {
    return { type: "geo", competitors: data.competitors };
  }

  // --- CASE: Time series (overview / headcount / channels by period) ---
  if (data.periods) {
    if (mode === "direct") {
      const key = data.yourCompany.headcount
        ? "headcount"
        : data.yourCompany.traffic
        ? "traffic"
        : null;

      if (key) {
        datasets.push({
          label: data.yourCompany.name,
          data: data.yourCompany[key],
          borderColor: data.yourCompany.color,
          backgroundColor: chartHexToRgba(data.yourCompany.color, 0.2),
          borderWidth: 3,
          fill: false,
          pointRadius: 4,
        });
        data.competitors.forEach((c) => {
          datasets.push({
            label: c.name,
            data: c[key],
            borderColor: c.color,
            backgroundColor: chartHexToRgba(c.color, 0.15),
            borderWidth: 2,
            borderDash: [3, 3],
            fill: false,
            pointRadius: 3,
          });
        });
      }
    } else if (mode === "consolidated" && data.consolidatedCompetitors) {
      const key = data.consolidatedCompetitors.headcount
        ? "headcount"
        : "traffic";
      datasets.push({
        label: data.yourCompany.name,
        data: data.yourCompany[key],
        borderColor: data.yourCompany.color,
        backgroundColor: chartHexToRgba(data.yourCompany.color, 0.2),
        borderWidth: 3,
        fill: false,
        pointRadius: 4,
      });
      datasets.push({
        label: data.consolidatedCompetitors.name,
        data: data.consolidatedCompetitors[key],
        borderColor: data.consolidatedCompetitors.color,
        backgroundColor: chartHexToRgba(
          data.consolidatedCompetitors.color,
          0.15
        ),
        borderDash: [5, 5],
        fill: false,
        pointRadius: 4,
      });
    }
    return { type: "line", labels: data.periods, datasets };
  }

  // --- CASE: Sources (bar vs dual doughnut) ---
  if (data.yourCompany.sources) {
    const categories = Object.keys(data.yourCompany.sources);

    if (mode === "direct") {
      const datasets = [
        {
          label: data.yourCompany.name,
          data: Object.values(data.yourCompany.sources),
          backgroundColor: data.yourCompany.color,
        },
      ];
      data.competitors.forEach((c) => {
        datasets.push({
          label: c.name,
          data: Object.values(c.sources),
          backgroundColor: c.color,
        });
      });
      return { type: "bar", labels: categories, datasets };
    } else if (mode === "consolidated" && data.consolidatedCompetitors) {
      return {
        type: "doughnut-dual",
        company: {
          labels: categories,
          datasets: [
            {
              label: data.yourCompany.name,
              data: Object.values(data.yourCompany.sources),
              backgroundColor: ["#3366cc", "#109618", "#ff9900", "#dc3912"],
            },
          ],
        },
        consolidated: {
          labels: categories,
          datasets: [
            {
              label: data.consolidatedCompetitors.name,
              data: Object.values(data.consolidatedCompetitors.sources),
              backgroundColor: ["#3366cc", "#109618", "#ff9900", "#dc3912"],
            },
          ],
        },
      };
    }
  }

  // --- CASE: Devices (bar) ---
  if (data.yourCompany.devices) {
    const categories = Object.keys(data.yourCompany.devices);
    if (mode === "direct") {
      datasets.push({
        label: data.yourCompany.name,
        data: Object.values(data.yourCompany.devices),
        backgroundColor: data.yourCompany.color,
      });
      data.competitors.forEach((c) => {
        datasets.push({
          label: c.name,
          data: Object.values(c.devices),
          backgroundColor: c.color,
        });
      });
    } else if (mode === "consolidated" && data.consolidatedCompetitors) {
      datasets.push({
        label: data.consolidatedCompetitors.name,
        data: Object.values(data.consolidatedCompetitors.devices),
        backgroundColor: data.consolidatedCompetitors.color,
      });
    }
    return { type: "bar", labels: categories, datasets };
  }

  // --- CASE: Engagement Metrics (radar) ---
  if (data.metrics) {
    if (mode === "direct") {
      datasets.push({
        label: data.yourCompany.name,
        data: data.yourCompany.values,
        borderColor: data.yourCompany.color,
        backgroundColor: chartHexToRgba(data.yourCompany.color, 0.3),
      });
      data.competitors.forEach((c) => {
        datasets.push({
          label: c.name,
          data: c.values,
          borderColor: c.color,
          backgroundColor: chartHexToRgba(c.color, 0.3),
        });
      });
    } else if (mode === "consolidated" && data.consolidatedCompetitors) {
      datasets.push({
        label: data.consolidatedCompetitors.name,
        data: data.consolidatedCompetitors.values,
        borderColor: data.consolidatedCompetitors.color,
        backgroundColor: chartHexToRgba(
          data.consolidatedCompetitors.color,
          0.3
        ),
      });
    }
    return { type: "radar", labels: data.metrics, datasets };
  }

  // --- CASE: Channels snapshot (stacked horizontal) ---
  if (data.yourCompany.channels && !data.periods) {
    const categories = Object.keys(data.yourCompany.channels);
    let datasets = categories.map((cat) => ({
      label: cat,
      data: [
        data.yourCompany.channels[cat],
        ...data.competitors.map((c) => c.channels[cat]),
      ],
    }));
    return {
      type: "bar",
      labels: [data.yourCompany.name, ...data.competitors.map((c) => c.name)],
      datasets,
      options: { indexAxis: "y", responsive: true, scales: { x: { stacked: true }, y: { stacked: true } } }
    };
  }

  return null;
}

// ===== Chart Renderer =====
function chartCreate(canvasId, data, mode) {
  const canvas = document.getElementById(canvasId);

  // CASE: Geo chart (ECharts)
  if (data.type === "geo") {
    if (window[canvasId + "Chart"]) {
      window[canvasId + "Chart"].dispose?.();
      window[canvasId + "Chart"] = null;
    }
    const myChart = echarts.init(canvas);
    const series = data.competitors.map((c) => ({
      name: c.name,
      type: "map",
      map: "world",
      roam: true,
      emphasis: { label: { show: true } },
      data: c.countries.map((country) => ({
        name: country.name,
        value: country.value,
      })),
    }));
    const option = {
      title: { text: "Traffic Geo", left: "center" },
      tooltip: { trigger: "item" },
      legend: { orient: "horizontal", bottom: 10, selectedMode: "multiple" },
      visualMap: {
        min: 0,
        max: 8000,
        left: "left",
        top: "bottom",
        text: ["High", "Low"],
        calculable: true,
      },
      series: series,
    };
    myChart.setOption(option);
    window[canvasId + "Chart"] = myChart;
    return;
  }

  // CASE: Dual Doughnut (Sources consolidated)
  if (data.type === "doughnut-dual") {
    const container = document.getElementById(canvasId).parentNode;
    container.innerHTML = `
      <div style="display:flex;gap:20px;width:100%;height:100%;">
        <canvas id="${canvasId}-company"></canvas>
        <canvas id="${canvasId}-consolidated"></canvas>
      </div>
    `;
    const ctx1 = document
      .getElementById(`${canvasId}-company`)
      .getContext("2d");
    const ctx2 = document
      .getElementById(`${canvasId}-consolidated`)
      .getContext("2d");
    new Chart(ctx1, { type: "doughnut", data: data.company });
    new Chart(ctx2, { type: "doughnut", data: data.consolidated });
    return;
  }

  // CASE: Other charts (Chart.js)
  const ctx = canvas.getContext("2d");
  if (window[canvasId + "Chart"]) {
    window[canvasId + "Chart"].destroy();
  }
  const config = {
    type: data.type,
    data: { labels: data.labels, datasets: data.datasets },
    options: data.options || {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top", labels: { usePointStyle: true } },
      },
    },
  };
  window[canvasId + "Chart"] = new Chart(ctx, config);
}

// ===== Load JSON + Init =====
async function chartLoadAndCreate(canvasId, jsonUrl, mode = "direct") {
  try {
    const res = await fetch(jsonUrl);
    const data = await res.json();
    const processed = chartProcessData(data, mode);
    if (processed) {
      chartCreate(canvasId, processed, mode);
    }
  } catch (err) {
    console.error("Error loading chart:", err);
  }
}

function initChart(wrapper, jsonUrl) {
  const canvas = wrapper.querySelector("canvas, div[id$='Chart']");
  if (!canvas) return;
  const chartId = canvas.id;

  const btnDirect = wrapper.querySelector(".btn-direct");
  const btnConsolidate = wrapper.querySelector(".btn-consolidate");

  chartLoadAndCreate(chartId, jsonUrl, "direct");
  if (btnDirect) btnDirect.classList.add("is-active");

  if (btnDirect) {
    btnDirect.addEventListener("click", (e) => {
      e.preventDefault();
      chartLoadAndCreate(chartId, jsonUrl, "direct");
      btnDirect.classList.add("is-active");
      btnConsolidate?.classList.remove("is-active");
    });
  }

  if (btnConsolidate) {
    btnConsolidate.addEventListener("click", (e) => {
      e.preventDefault();
      chartLoadAndCreate(chartId, jsonUrl, "consolidated");
      btnConsolidate.classList.add("is-active");
      btnDirect?.classList.remove("is-active");
    });
  }
}

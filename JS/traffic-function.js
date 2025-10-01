// ===== Utility =====
function chartHexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ===== Process Data =====
function chartProcessData(data, mode = "direct") {
  // --- Overview (line chart) ---
  if (data.periods && data.yourCompany.traffic) {
    if (mode === "direct") {
      const datasets = [
        {
          label: data.yourCompany.name,
          data: data.yourCompany.traffic,
          borderColor: data.yourCompany.color,
          backgroundColor: chartHexToRgba(data.yourCompany.color, 0.2),
          borderWidth: 3,
          fill: false,
        },
        ...data.competitors.map((c) => ({
          label: c.name,
          data: c.traffic,
          borderColor: c.color,
          borderDash: [3, 3],
          fill: false,
        })),
      ];
      return { type: "line", labels: data.periods, datasets };
    } else {
      const datasets = [
        {
          label: data.yourCompany.name,
          data: data.yourCompany.traffic,
          borderColor: data.yourCompany.color,
          borderWidth: 3,
          fill: false,
        },
        {
          label: data.consolidatedCompetitors.name,
          data: data.consolidatedCompetitors.traffic,
          borderColor: data.consolidatedCompetitors.color,
          borderDash: [5, 5],
          fill: false,
        },
      ];
      return { type: "line", labels: data.periods, datasets };
    }
  }

  // --- Sources (bar vs dual doughnut) ---
  if (data.yourCompany.sources) {
    const categories = Object.keys(data.yourCompany.sources);

    if (mode === "direct") {
      const datasets = [
        {
          label: data.yourCompany.name,
          data: Object.values(data.yourCompany.sources),
          backgroundColor: data.yourCompany.color,
        },
        ...data.competitors.map((c) => ({
          label: c.name,
          data: Object.values(c.sources),
          backgroundColor: c.color,
        })),
      ];
      return { type: "bar", labels: categories, datasets };
    } else {
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

  // --- Channels (stacked horizontal vs dual doughnut) ---
  if (data.yourCompany.channels && !data.periods) {
    const categories = Object.keys(data.yourCompany.channels);

    if (mode === "direct") {
      const datasets = categories.map((cat, i) => ({
        label: cat,
        data: [
          data.yourCompany.channels[cat],
          ...data.competitors.map((c) => c.channels[cat]),
        ],
        backgroundColor: ["#3366cc", "#109618", "#ff9900", "#dc3912"][i % 4],
      }));
      return {
        type: "bar",
        labels: [data.yourCompany.name, ...data.competitors.map((c) => c.name)],
        datasets,
        options: {
          indexAxis: "y",
          scales: { x: { stacked: true }, y: { stacked: true } },
        },
      };
    } else {
      return {
        type: "doughnut-dual",
        company: {
          labels: categories,
          datasets: [
            {
              label: data.yourCompany.name,
              data: Object.values(data.yourCompany.channels),
              backgroundColor: ["#3366cc", "#109618", "#ff9900", "#dc3912"],
            },
          ],
        },
        consolidated: {
          labels: categories,
          datasets: [
            {
              label: data.consolidatedCompetitors.name,
              data: Object.values(data.consolidatedCompetitors.channels),
              backgroundColor: ["#3366cc", "#109618", "#ff9900", "#dc3912"],
            },
          ],
        },
      };
    }
  }

  // --- Geo (choropleth) ---
  if (data.competitors && data.competitors[0].countries) {
    return { type: "geo", competitors: data.competitors };
  }

  return null;
}

// ===== Chart Create =====
function chartCreate(canvasId, data, mode) {
  const canvas = document.getElementById(canvasId);

  // Geo chart (choropleth)
  if (data.type === "geo") {
    if (window[canvasId + "Chart"]) {
      window[canvasId + "Chart"].destroy();
    }
    fetch("https://cdn.jsdelivr.net/npm/world-atlas/countries-110m.json")
      .then((r) => r.json())
      .then((topology) => {
        const countries = ChartGeo.topojson.feature(
          topology,
          topology.objects.countries
        ).features;

        const datasets = data.competitors.map((c) => ({
          label: c.name,
          data: c.countries.map((ct) => {
            const feature = countries.find(
              (f) => f.properties.name === ct.name
            );
            return { feature, value: ct.value };
          }),
          backgroundColor: c.color,
        }));

        const chart = new Chart(canvas.getContext("2d"), {
          type: "choropleth",
          data: { labels: countries.map((d) => d.properties.name), datasets },
          options: {
            showOutline: true,
            showGraticule: true,
            scales: {
              projection: { axis: "x", projection: "equalEarth" },
              color: { quantize: 5 },
            },
            plugins: {
              legend: { position: "top", labels: { usePointStyle: true } },
              tooltip: {
                callbacks: {
                  label: function (ctx) {
                    return (
                      ctx.dataset.label +
                      ": " +
                      ctx.raw.feature.properties.name +
                      " - " +
                      ctx.raw.value.toLocaleString()
                    );
                  },
                },
              },
            },
          },
        });

        window[canvasId + "Chart"] = chart;
      });
    return;
  }

  // Dual doughnut
  if (data.type === "doughnut-dual") {
    const container = document.getElementById(canvasId).parentNode;
    container.innerHTML = `
      <div style="display:flex;gap:20px;width:100%;height:100%;">
        <canvas id="${canvasId}-company"></canvas>
        <canvas id="${canvasId}-consolidated"></canvas>
      </div>
    `;
    new Chart(document.getElementById(`${canvasId}-company`), {
      type: "doughnut",
      data: data.company,
    });
    new Chart(document.getElementById(`${canvasId}-consolidated`), {
      type: "doughnut",
      data: data.consolidated,
    });
    return;
  }

  // Other (line, bar, stacked)
  if (window[canvasId + "Chart"]) {
    window[canvasId + "Chart"].destroy();
  }
  const config = {
    type: data.type,
    data: { labels: data.labels, datasets: data.datasets },
    options: data.options || {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "top" } },
    },
  };
  window[canvasId + "Chart"] = new Chart(canvas.getContext("2d"), config);
}

// ===== Load JSON & Init =====
async function chartLoadAndCreate(canvasId, jsonUrl, mode = "direct") {
  try {
    const res = await fetch(jsonUrl);
    const data = await res.json();
    const processed = chartProcessData(data, mode);
    if (processed) chartCreate(canvasId, processed, mode);
  } catch (err) {
    console.error("Error loading chart:", err);
  }
}

function initChart(wrapper, jsonUrl) {
  const canvas = wrapper.querySelector("canvas");
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

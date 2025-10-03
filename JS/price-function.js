// ==================================================
// Price Chart Functions for Webflow
// Prefix: price
// ==================================================

// ========== Utility Functions (ALWAYS KEEP THESE FIRST) ==========
function priceHexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function priceToPercent(arr) {
  const total = arr.reduce((sum, v) => sum + v, 0);
  return arr.map(v => total > 0 ? +(v / total * 100).toFixed(1) : 0);
}

function priceComputeConsolidated(data) {
  if (!data.competitors || !data.competitors.length) return null;
  const length = data.competitors[0].values.length;
  const avg = Array(length).fill(0);
  data.competitors.forEach(c => c.values.forEach((v, i) => { avg[i] += v; }));
  return {
    name: "Average Competitors",
    color: "#999999",
    values: avg.map(v => +(v / data.competitors.length).toFixed(1))
  };
}

// ========== Init ==========
function priceInitChart(wrapper, dataUrl) {
  const rootCanvas = wrapper.querySelector("canvas");

  fetch(dataUrl)
    .then(res => res.json())
    .then(data => {
      const type = data.chartType || "line";
      let currentMode = "direct";   // direct vs consolidate
      let currentValue = "absolute"; // absolute vs percent

      // Active state helper
      function setActive(group, activeBtn) {
        group.forEach(b => { if (b) b.classList.remove("is-active"); });
        if (activeBtn) activeBtn.classList.add("is-active");
      }

      // Consolidated competitor line
      data.consolidatedCompetitors = priceComputeConsolidated(data);

      function renderChart() {
        const ctx = rootCanvas.getContext("2d");
        if (type === "line") priceCreateLineChart(ctx, data, currentMode, currentValue);
      }

      // Buttons
      const btnDirect = wrapper.querySelector(".btn-direct");
      const btnConsolidate = wrapper.querySelector(".btn-consolidate");
      const btnAbs = wrapper.querySelector(".btn-absolute");
      const btnPct = wrapper.querySelector(".btn-percent");

      const modeBtns = [btnDirect, btnConsolidate];
      const valueBtns = [btnAbs, btnPct];

      if (btnDirect) btnDirect.addEventListener("click", () => {
        currentMode = "direct"; currentValue = "absolute"; renderChart();
        setActive(modeBtns, btnDirect); setActive(valueBtns, btnAbs);
      });
      if (btnConsolidate) btnConsolidate.addEventListener("click", () => {
        currentMode = "consolidate"; currentValue = "absolute"; renderChart();
        setActive(modeBtns, btnConsolidate); setActive(valueBtns, btnAbs);
      });
      if (btnAbs) btnAbs.addEventListener("click", () => {
        currentValue = "absolute"; renderChart(); setActive(valueBtns, btnAbs);
      });
      if (btnPct) btnPct.addEventListener("click", () => {
        currentValue = "percent"; renderChart(); setActive(valueBtns, btnPct);
      });

      renderChart();
      setActive(modeBtns, btnDirect);
      setActive(valueBtns, btnAbs);
    })
    .catch(err => console.error("Error loading price data:", err));
}

// ========== Line Chart ==========
function priceCreateLineChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();
  const getValues = arr => valueType === "percent" ? priceToPercent(arr) : arr;

  const datasets = [];
  if (mode === "direct") {
    datasets.push({
      label: data.yourCompany.name,
      data: getValues(data.yourCompany.values),
      borderColor: data.yourCompany.color,
      backgroundColor: priceHexToRgba(data.yourCompany.color, 0.3),
      borderWidth: 2,
      fill: false,
      tension: 0.3
    });
    data.competitors.forEach(c => {
      datasets.push({
        label: c.name,
        data: getValues(c.values),
        borderColor: c.color,
        backgroundColor: priceHexToRgba(c.color, 0.3),
        borderDash: [4, 2],
        fill: false,
        tension: 0.3
      });
    });
  } else {
    datasets.push({
      label: data.yourCompany.name,
      data: getValues(data.yourCompany.values),
      borderColor: data.yourCompany.color,
      backgroundColor: priceHexToRgba(data.yourCompany.color, 0.3),
      borderWidth: 2,
      fill: false,
      tension: 0.3
    });
    datasets.push({
      label: data.consolidatedCompetitors.name,
      data: getValues(data.consolidatedCompetitors.values),
      borderColor: data.consolidatedCompetitors.color,
      borderDash: [6, 3],
      borderWidth: 2,
      fill: false,
      tension: 0.3
    });
  }

  window[ctx.canvas.id + "Chart"] = new Chart(ctx, {
    type: "line",
    data: { labels: data.periods, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (context) => {
              const val = context.raw;
              return valueType === "percent"
                ? `${context.dataset.label}: ${val}%`
                : `${context.dataset.label}: $${val}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: v => valueType === "percent" ? v + "%" : v
          },
          max: valueType === "percent" ? 100 : undefined
        }
      }
    }
  });
}

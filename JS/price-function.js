// ==================================================
// Price & Shipping Chart Functions for Webflow
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

function priceComputeConsolidatedRadar(data) {
  if (!data.competitors || !data.competitors.length) return null;
  const metrics = Object.keys(data.competitors[0].radar);
  const avgRadar = {};
  metrics.forEach(m => {
    let sum = 0, count = 0;
    data.competitors.forEach(c => {
      if (c.radar[m] !== undefined) { sum += c.radar[m]; count++; }
    });
    avgRadar[m] = count > 0 ? +(sum / count).toFixed(1) : 0;
  });
  return {
    name: "Average Competitors",
    color: "#999999",
    radar: avgRadar
  };
}

// ========== NEW: Normalize Radar Metrics (scale to 0-100) ==========
function priceNormalizeRadar(company) {
  if (!company.radar) return company;
  const raw = company.radar;
  return {
    ...company,
    radar: {
      // Delivery Time: giả định 2 ngày = tốt nhất (100), 7 ngày = tệ (0)
      "Average Delivery Time": Math.max(0, Math.min(100, (7 - raw["Average Delivery Time"]) / 5 * 100)),
      // On-time Delivery Rate: giữ nguyên %
      "On-time Delivery Rate": Math.max(0, Math.min(100, raw["On-time Delivery Rate"])),
      // Damage/Loss Rate: 0% = tốt nhất (100), 10% = tệ (0)
      "Damage/Loss Rate": Math.max(0, Math.min(100, (10 - raw["Damage/Loss Rate"]) / 10 * 100)),
      // Average Shipping Cost: giả định 2$ = tốt nhất, 8$ = tệ
      "Average Shipping Cost": Math.max(0, Math.min(100, (8 - raw["Average Shipping Cost"]) / 6 * 100)),
      // Customer Ratings: scale 1–5 sao thành %
      "Customer Shipping Ratings": Math.max(0, Math.min(100, (raw["Customer Shipping Ratings"] / 5) * 100))
    }
  };
}

// ========== Init ==========
function priceInitChart(wrapper, dataUrl) {
  const rootCanvas = wrapper.querySelector("canvas");

  fetch(dataUrl)
    .then(res => res.json())
    .then(data => {
      const type = data.chartType || "line";
      let currentMode = "direct";
      let currentValue = "absolute";

      function setActive(group, activeBtn) {
        group.forEach(b => { if (b) b.classList.remove("is-active"); });
        if (activeBtn) activeBtn.classList.add("is-active");
      }

      // ===== SHIPPING SPECIAL =====
      if (type === "shipping") {
        const grid = document.createElement("div");
        grid.className = "chart-grid";
        rootCanvas.replaceWith(grid);

        function renderCharts() {
          grid.replaceChildren();

          // Line chart
          const lineWrap = document.createElement("div");
          lineWrap.classList.add("chart-line-full");
          const lineCanvas = document.createElement("canvas");
          lineCanvas.id = "shipping-line";
          lineWrap.appendChild(lineCanvas);
          grid.appendChild(lineWrap);

          const ctx = lineCanvas.getContext("2d");
          data.consolidatedCompetitors = priceComputeConsolidated(data);
          priceCreateLineChart(ctx, data, currentMode, currentValue);

          // Radar grid
          const radarGrid = document.createElement("div");
          radarGrid.className = "radar-grid";
          grid.appendChild(radarGrid);

          if (currentMode === "direct") {
            priceCreateRadarBlock(radarGrid, data.yourCompany);
            data.competitors.forEach(c => priceCreateRadarBlock(radarGrid, c));
          } else {
            priceCreateRadarBlock(radarGrid, data.yourCompany);
            const avg = priceComputeConsolidatedRadar(data);
            priceCreateRadarBlock(radarGrid, avg);
          }
        }

        const btnDirect = wrapper.closest(".chart-canvas").querySelector(".btn-direct");
        const btnConsolidate = wrapper.closest(".chart-canvas").querySelector(".btn-consolidate");
        const btnAbs = wrapper.closest(".chart-canvas").querySelector(".btn-absolute");
        const btnPct = wrapper.closest(".chart-canvas").querySelector(".btn-percent");

        const modeBtns = [btnDirect, btnConsolidate];
        const valueBtns = [btnAbs, btnPct];

        if (btnDirect) btnDirect.addEventListener("click", () => {
          currentMode = "direct"; currentValue = "absolute"; renderCharts();
          setActive(modeBtns, btnDirect); setActive(valueBtns, btnAbs);
        });
        if (btnConsolidate) btnConsolidate.addEventListener("click", () => {
          currentMode = "consolidate"; currentValue = "absolute"; renderCharts();
          setActive(modeBtns, btnConsolidate); setActive(valueBtns, btnAbs);
        });
        if (btnAbs) btnAbs.addEventListener("click", () => {
          currentValue = "absolute"; renderCharts(); setActive(valueBtns, btnAbs);
        });
        if (btnPct) btnPct.addEventListener("click", () => {
          currentValue = "percent"; renderCharts(); setActive(valueBtns, btnPct);
        });

        renderCharts();
        setActive(modeBtns, btnDirect);
        setActive(valueBtns, btnAbs);
        return;
      }

      // ===== OTHER CHART TYPES (Average Price) =====
      data.consolidatedCompetitors = priceComputeConsolidated(data);

      function renderChart() {
        const ctx = rootCanvas.getContext("2d");
        if (type === "line") priceCreateLineChart(ctx, data, currentMode, currentValue);
      }

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
    .catch(err => console.error("Error loading price/shipping data:", err));
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
                : `${context.dataset.label}: ${val}`;
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

// ========== Radar Chart Block ==========
function priceCreateRadarBlock(container, company) {
  const normalized = priceNormalizeRadar(company); // ✅ chuẩn hoá trước khi render

  const block = document.createElement("div");
  block.classList.add("company-chart");

  const title = document.createElement("h4");
  title.innerText = normalized.name;
  block.appendChild(title);

  const inner = document.createElement("div");
  inner.classList.add("chart-inner");
  inner.style.height = "280px";
  const canvas = document.createElement("canvas");
  canvas.id = "radar-" + normalized.name.replace(/\s+/g, "-");
  inner.appendChild(canvas);
  block.appendChild(inner);
  container.appendChild(block);

  priceRenderRadarChart(canvas, normalized);
}

// ========== Radar Chart ==========
function priceRenderRadarChart(canvas, company) {
  if (window[canvas.id + "Chart"]) window[canvas.id + "Chart"].destroy();
  const labels = Object.keys(company.radar);
  const values = Object.values(company.radar);

  window[canvas.id + "Chart"] = new Chart(canvas.getContext("2d"), {
    type: "radar",
    data: {
      labels,
      datasets: [{
        label: company.name,
        data: values,
        backgroundColor: priceHexToRgba(company.color, 0.2),
        borderColor: company.color,
        borderWidth: 2,
        pointBackgroundColor: company.color
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { r: { beginAtZero: true, max: 100 } }
    }
  });
}

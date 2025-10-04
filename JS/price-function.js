// ==================================================
// Price Chart Functions (Line Chart Only)
// Prefix: price
// ==================================================

// ==================================================
// 1. UTILITY FUNCTIONS
// ==================================================

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

// ==================================================
// 2. DATA PROCESSING FUNCTIONS
// ==================================================

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

// ==================================================
// 3. CHART CREATION FUNCTIONS
// ==================================================

function priceCreateLineChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();
  const getValues = arr => valueType === "percent" ? priceToPercent(arr) : arr;

  const datasets = [];
  const items = (mode === "direct") ?
    [data.yourCompany, ...data.competitors] :
    [data.yourCompany, data.consolidatedCompetitors];

  items.forEach((item, index) => {
    if (!item) return;
    datasets.push({
      label: item.name,
      data: getValues(item.values),
      borderColor: item.color,
      backgroundColor: priceHexToRgba(item.color, 0.3),
      borderWidth: 2,
      borderDash: (index === 0) ? [] : (mode === "consolidate" ? [6, 3] : [4, 2]),
      fill: false,
      tension: 0.3
    });
  });

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
          ticks: { callback: v => valueType === "percent" ? v + "%" : v },
          max: valueType === "percent" ? 100 : undefined
        }
      }
    }
  });
}

// ==================================================
// 4. MAIN LOGIC
// ==================================================

function priceSetupButtons(wrapper, renderFn, modeBtns, valueBtns) {
    let currentMode = "direct";
    let currentValue = "absolute";

    function setActive(group, activeBtn) {
        group.forEach(b => { if (b) b.classList.remove("is-active"); });
        if (activeBtn) activeBtn.classList.add("is-active");
    }

    const btnDirect = wrapper.querySelector(".btn-direct");
    const btnConsolidate = wrapper.querySelector(".btn-consolidate");
    const btnAbs = wrapper.querySelector(".btn-absolute");
    const btnPct = wrapper.querySelector(".btn-percent");

    if (btnDirect) btnDirect.addEventListener("click", () => {
        currentMode = "direct"; currentValue = "absolute"; renderFn(currentMode, currentValue);
        setActive(modeBtns, btnDirect); setActive(valueBtns, btnAbs);
    });
    if (btnConsolidate) btnConsolidate.addEventListener("click", () => {
        currentMode = "consolidate"; currentValue = "absolute"; renderFn(currentMode, currentValue);
        setActive(modeBtns, btnConsolidate); setActive(valueBtns, btnAbs);
    });
    if (btnAbs) btnAbs.addEventListener("click", () => {
        currentValue = "absolute"; renderFn(currentMode, currentValue); setActive(valueBtns, btnAbs);
    });
    if (btnPct) btnPct.addEventListener("click", () => {
        currentValue = "percent"; renderFn(currentMode, currentValue); setActive(valueBtns, btnPct);
    });

    renderFn(currentMode, currentValue);
    setActive(modeBtns, btnDirect);
    setActive(valueBtns, btnAbs);
}


function priceInitChart(wrapper, dataUrl) {
  fetch(dataUrl)
    .then(res => res.json())
    .then(data => {
      // Force chart type to 'line' as requested
      const chartType = "line"; 
      const rootCanvas = wrapper.querySelector("canvas");

      const controlsWrapper = wrapper.closest(".chart-canvas") || wrapper;
      const btnDirect = controlsWrapper.querySelector(".btn-direct");
      const btnConsolidate = controlsWrapper.querySelector(".btn-consolidate");
      const btnAbs = controlsWrapper.querySelector(".btn-absolute");
      const btnPct = controlsWrapper.querySelector(".btn-percent");
      const modeBtns = [btnDirect, btnConsolidate];
      const valueBtns = [btnAbs, btnPct];

      data.consolidatedCompetitors = priceComputeConsolidated(data);

      if (chartType === "line" && rootCanvas) {
        const lineRenderFn = (mode, valueType) => {
          const ctx = rootCanvas.getContext("2d");
          priceCreateLineChart(ctx, data, mode, valueType);
        };
        priceSetupButtons(controlsWrapper, lineRenderFn, modeBtns, valueBtns);
      }
    })
    .catch(err => console.error("Error loading price data:", err));
}

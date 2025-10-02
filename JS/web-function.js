// Common Chart Functions for Webflow
// Utility prefix: chart
// Web-specific prefix: web

// ========== Utility Functions ==========
function chartHexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function chartToPercent(arr) {
  const total = arr.reduce((sum, v) => sum + v, 0);
  return arr.map(v => total > 0 ? +(v / total * 100).toFixed(1) : 0);
}

// ========== Web Init ==========
function webInitChart(wrapper, dataUrl) {
  const canvas = wrapper.querySelector("canvas");
  const ctx = canvas.getContext("2d");

  fetch(dataUrl)
    .then(res => res.json())
    .then(data => {
      let currentMode = "direct";     // direct | consolidate
      let currentValue = "absolute";  // absolute | percent

      function renderChart() {
        webCreateMirrorBarChart(ctx, data, currentMode, currentValue);
      }

      // buttons
      const btnDirect = wrapper.querySelector(".btn-direct");
      const btnConsolidate = wrapper.querySelector(".btn-consolidate");
      const btnAbs = wrapper.querySelector(".btn-absolute");
      const btnPct = wrapper.querySelector(".btn-percent");

      const modeBtns = [btnDirect, btnConsolidate];
      const valueBtns = [btnAbs, btnPct];

      function setActive(group, activeBtn) {
        group.forEach(b => { if (b) b.classList.remove("is-active"); });
        if (activeBtn) activeBtn.classList.add("is-active");
      }

      // mode events
      if (btnDirect) btnDirect.addEventListener("click", () => {
        currentMode = "direct";
        currentValue = "absolute";
        renderChart();
        setActive(modeBtns, btnDirect);
        setActive(valueBtns, btnAbs);
      });

      if (btnConsolidate) btnConsolidate.addEventListener("click", () => {
        currentMode = "consolidate";
        currentValue = "absolute";
        renderChart();
        setActive(modeBtns, btnConsolidate);
        setActive(valueBtns, btnAbs);
      });

      // value events
      if (btnAbs) btnAbs.addEventListener("click", () => {
        currentValue = "absolute";
        renderChart();
        setActive(valueBtns, btnAbs);
      });

      if (btnPct) btnPct.addEventListener("click", () => {
        currentValue = "percent";
        renderChart();
        setActive(valueBtns, btnPct);
      });

      // default render
      renderChart();
      setActive(modeBtns, btnDirect);
      setActive(valueBtns, btnAbs);
    })
    .catch(err => console.error("Error loading chart data:", err));
}

// ========== Mirror Bar Chart (Desktop vs Mobile) ==========
function webCreateMirrorBarChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();

  const periods = data.periods; // ["Desktop","Mobile"]

  function getValues(valuesObj) {
    return periods.map(p => valuesObj[p] || 0);
  }

  const labels = mode === "direct"
    ? [data.yourCompany, ...data.competitors].map(c => c.name)
    : [data.yourCompany.name, data.consolidatedCompetitors.name];

  // Desktop (âm), Mobile (dương)
  const desktopData = mode === "direct"
    ? [data.yourCompany, ...data.competitors].map(c => -(getValues(c.values)[0]))
    : [-(getValues(data.yourCompany.values)[0]), -(getValues(data.consolidatedCompetitors.values)[0])];

  const mobileData = mode === "direct"
    ? [data.yourCompany, ...data.competitors].map(c => getValues(c.values)[1])
    : [getValues(data.yourCompany.values)[1], getValues(data.consolidatedCompetitors.values)[1]];

  // Nếu chuyển sang % thì normalize về tổng Desktop+Mobile
  function normalize(dataArr) {
    const absVals = dataArr.map(v => Math.abs(v));
    return chartToPercent(absVals).map((v, i) => dataArr[i] < 0 ? -v : v);
  }

  const finalDesktop = valueType === "percent" ? normalize(desktopData) : desktopData;
  const finalMobile = valueType === "percent" ? normalize(mobileData) : mobileData;

  window[ctx.canvas.id + "Chart"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Desktop",
          data: finalDesktop,
          backgroundColor: chartHexToRgba("#3366cc", 0.7),
          stack: "Stack 0"
        },
        {
          label: "Mobile",
          data: finalMobile,
          backgroundColor: chartHexToRgba("#ff9900", 0.7),
          stack: "Stack 0"
        }
      ]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top" },
        datalabels: {
          anchor: "center",
          align: "center",
          color: "#fff",
          font: { size: 12, weight: "bold" },
          formatter: function(value) {
            if (value === 0) return "";
            return Math.abs(value) + (valueType === "percent" ? "%" : "/5");
          }
        }
      },
      scales: {
        x: {
          min: valueType === "percent" ? -100 : -5,
          max: valueType === "percent" ? 100 : 5,
          stacked: true,
          ticks: {
            callback: function(value) {
              return Math.abs(value);
            }
          }
        },
        y: {
          stacked: true
        }
      }
    },
    plugins: [ChartDataLabels]
  });
}

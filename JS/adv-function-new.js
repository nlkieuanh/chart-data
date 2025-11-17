/***********************************************************
 * ADV FUNCTION NEW — SINGLE JSON LOAD + REDRAW
 * - New JSON structure (adv-channel-new.json)
 * - Default = last 7 days
 * - Date filter via window._advCurrentChart.setDateRange()
 * - Mode / Value switch via Webflow classes
 ***********************************************************/

/* ---------- Helpers ---------- */

function advToISODate(d) {
  if (!(d instanceof Date)) return "";
  return d.toISOString().split("T")[0];
}

function advHexToRgba(hex, alpha) {
  if (!hex || hex[0] !== "#" || hex.length < 7) return "rgba(0,0,0," + alpha + ")";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
}

/* ============================================================
   1. Load JSON once
   ============================================================ */

async function advLoadNewJSON(url) {
  const res = await fetch(url);
  if (!res.ok) {
    console.error("[ADV] JSON fetch failed:", res.status, res.statusText);
    throw new Error("JSON fetch failed");
  }
  const json = await res.json();
  return json;
}

/* ============================================================
   2. Filter date range → indexes
   ============================================================ */

function advFilterDateRange(dates, startDate, endDate) {
  if (!Array.isArray(dates)) {
    console.error("[ADV] advFilterDateRange: dates is not an array:", dates);
    return [];
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  return dates.reduce(function (acc, d, i) {
    const dd = new Date(d);
    if (dd >= start && dd <= end) acc.push(i);
    return acc;
  }, []);
}

/* ============================================================
   3. Extract metric series
   ============================================================ */

function advGetMetricSeries(json, channelId, companyId, metric, dateIndexes) {
  const channels = json.channels || [];
  const channel = channels.find(function (c) { return c.id === channelId; });
  if (!channel) {
    console.warn("[ADV] Channel not found:", channelId);
    return [];
  }

  const companies = channel.companies || [];
  const company = companies.find(function (c) { return c.id === companyId; });
  if (!company) {
    console.warn("[ADV] Company not found:", companyId, "in channel", channelId);
    return [];
  }

  const fullArray = company[metric] || [];
  if (!Array.isArray(fullArray)) {
    console.warn("[ADV] Metric array invalid for", channelId, companyId, metric);
    return [];
  }

  if (!dateIndexes.length) return fullArray;

  return dateIndexes.map(function (i) { return fullArray[i]; });
}

/* ============================================================
   4. Consolidate & percent helpers
   ============================================================ */

function advConsolidateChannels(seriesList) {
  if (!seriesList.length) return [];
  const length = seriesList[0].length;
  const result = new Array(length).fill(0);

  seriesList.forEach(function (arr) {
    arr.forEach(function (v, i) {
      result[i] += v;
    });
  });

  return result;
}

function advToPercent(values, total) {
  return values.map(function (v, i) {
    const t = total[i] || 0;
    return t === 0 ? 0 : (v / t) * 100;
  });
}

/* ============================================================
   5. Build payload (supports mode + value type)
   ============================================================ */

function advBuildChartPayload(options) {
  const json = options.json;
  const channelIds = options.channelIds;
  const dateIndexes = options.dateIndexes;
  const metric = options.metric || "netRevenue";
  const mode = options.mode || "direct";       // direct | consolidate
  const valueType = options.valueType || "absolute";

  const dates = json.dates || [];
  const periods = dateIndexes.map(function (i) { return dates[i]; });
  const yourCompanyId = "your-company";

  var yourCompanySeries = [];
  var competitorSeries = [];

  /* DIRECT MODE */
  if (mode === "direct") {
    const firstChannel = channelIds[0];
    yourCompanySeries = advGetMetricSeries(json, firstChannel, yourCompanyId, metric, dateIndexes);

    competitorSeries = [];
    channelIds.forEach(function (ch) {
      const channel = (json.channels || []).find(function (c) { return c.id === ch; });
      if (!channel) return;

      (channel.companies || []).forEach(function (comp) {
        if (comp.id === yourCompanyId) return;
        competitorSeries.push({
          name: comp.name,
          color: comp.color,
          values: advGetMetricSeries(json, ch, comp.id, metric, dateIndexes)
        });
      });
    });
  }

  /* CONSOLIDATE MODE */
  if (mode === "consolidate") {
    const yourList = channelIds.map(function (ch) {
      return advGetMetricSeries(json, ch, yourCompanyId, metric, dateIndexes);
    }).filter(function (arr) { return arr.length; });

    if (yourList.length) {
      yourCompanySeries = advConsolidateChannels(yourList);
    }

    const compGroups = {};
    channelIds.forEach(function (ch) {
      const channel = (json.channels || []).find(function (c) { return c.id === ch; });
      if (!channel) return;

      (channel.companies || []).forEach(function (comp) {
        if (comp.id === yourCompanyId) return;
        if (!compGroups[comp.id]) {
          compGroups[comp.id] = {
            name: comp.name,
            color: comp.color,
            list: []
          };
        }
        const series = advGetMetricSeries(json, ch, comp.id, metric, dateIndexes);
        if (series.length) compGroups[comp.id].list.push(series);
      });
    });

    competitorSeries = Object.keys(compGroups).map(function (key) {
      const group = compGroups[key];
      return {
        name: group.name,
        color: group.color,
        values: advConsolidateChannels(group.list)
      };
    });
  }

  /* VALUE TYPE = percent */
  if (valueType === "percent" && yourCompanySeries.length) {
    const total = yourCompanySeries.map(function (_, i) {
      var sum = yourCompanySeries[i];
      competitorSeries.forEach(function (c) { sum += c.values[i]; });
      return sum;
    });

    yourCompanySeries = advToPercent(yourCompanySeries, total);
    competitorSeries = competitorSeries.map(function (comp) {
      return {
        name: comp.name,
        color: comp.color,
        values: advToPercent(comp.values, total)
      };
    });
  }

  return {
    chartType: "line",
    periods: periods,
    yourCompany: {
      name: "Your Company",
      color: "#3366cc",
      values: yourCompanySeries
    },
    competitors: competitorSeries
  };
}

/* ============================================================
   6. Render Chart.js
   ============================================================ */

function advRenderLineChart(canvas, payload, valueType) {
  if (!window.Chart) {
    console.error("[ADV] Chart.js is not loaded.");
    return;
  }

  const ctx = canvas.getContext("2d");

  if (canvas._advChartInstance) {
    canvas._advChartInstance.destroy();
  }

  const labels = payload.periods || [];
  const datasets = [];

  if (payload.yourCompany && Array.isArray(payload.yourCompany.values)) {
    const c = payload.yourCompany;
    datasets.push({
      label: c.name,
      data: c.values,
      borderColor: c.color,
      backgroundColor: advHexToRgba(c.color, 0.15),
      borderWidth: 2,
      tension: 0.3,
      pointRadius: 0,
      fill: true
    });
  }

  (payload.competitors || []).forEach(function (comp) {
    datasets.push({
      label: comp.name,
      data: comp.values,
      borderColor: comp.color,
      backgroundColor: advHexToRgba(comp.color, 0.1),
      borderWidth: 1.5,
      tension: 0.3,
      pointRadius: 0,
      fill: false
    });
  });

  canvas._advChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          position: "bottom"
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const label = context.dataset.label || "";
              const v = context.parsed.y;
              if (valueType === "percent") {
                return label + ": " + v.toFixed(1) + "%";
              }
              return label + ": " + v.toLocaleString();
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: valueType === "percent" ? 100 : undefined,
          ticks: {
            callback: function (v) {
              if (valueType === "percent") return v + "%";
              return v;
            }
          }
        }
      }
    }
  });
}

/* ============================================================
   7. Init chart (Webflow entry)
   ============================================================ */

function advInitChart(wrapper, jsonUrl) {
  const canvas = wrapper.querySelector("canvas");
  if (!canvas) {
    console.error("[ADV] Canvas not found inside wrapper.");
    return;
  }

  // State inside this chart instance
  let jsonData = null;
  let selectedChannels = ["facebook"]; // later: checkbox
  let startDate = null;
  let endDate = null;
  let metric = "netRevenue";
  let mode = "direct";        // direct | consolidate
  let valueType = "absolute"; // absolute | percent

  // Load JSON once, then render
  advLoadNewJSON(jsonUrl)
    .then(function (json) {
      jsonData = json;

      const allDates = jsonData.dates || [];
      if (!allDates.length) {
        console.error("[ADV] json.dates is missing or empty in", jsonUrl);
        return;
      }

      // Save bounds for external date UI
      window._advDateBounds = {
        min: allDates[0],
        max: allDates[allDates.length - 1]
      };

      // First render
      renderChart();
    })
    .catch(function (err) {
      console.error("[ADV] Failed to load JSON:", err);
    });

  // Expose controller for date dropdown script
  window._advCurrentChart = {
    setDateRange: function (start, end) {
      if (start) startDate = start;
      if (end) endDate = end;
      renderChart();
    }
  };

  /* ---------- Mode / Value switch using Webflow classes ---------- */

  function connectModeSwitch() {
    const modeWrapper = wrapper.querySelector(".chart-switch-mode-btn");
    const valueWrapper = wrapper.querySelector(".chart-switch-value-btn");

    if (modeWrapper) {
      const btnDirect = modeWrapper.querySelector(".btn-direct");
      const btnConsolidate = modeWrapper.querySelector(".btn-consolidate");

      if (btnDirect) {
        btnDirect.addEventListener("click", function () {
          mode = "direct";
          setActive(btnDirect, [btnConsolidate]);
          renderChart();
        });
      }

      if (btnConsolidate) {
        btnConsolidate.addEventListener("click", function () {
          mode = "consolidate";
          setActive(btnConsolidate, [btnDirect]);
          renderChart();
        });
      }
    }

    if (valueWrapper) {
      const btnAbsolute = valueWrapper.querySelector(".btn-absolute");
      const btnPercent = valueWrapper.querySelector(".btn-percent");

      if (btnAbsolute) {
        btnAbsolute.addEventListener("click", function () {
          valueType = "absolute";
          setActive(btnAbsolute, [btnPercent]);
          renderChart();
        });
      }

      if (btnPercent) {
        btnPercent.addEventListener("click", function () {
          valueType = "percent";
          setActive(btnPercent, [btnAbsolute]);
          renderChart();
        });
      }
    }
  }

  function setActive(activeEl, others) {
    if (!activeEl) return;
    activeEl.classList.add("is-active");
    (others || []).forEach(function (el) {
      if (el) el.classList.remove("is-active");
    });
  }

  // Placeholder for future channel checkbox
  function connectChannelCheckbox() {
    const checkboxes = document.querySelectorAll("[data-adv-channel]");
    if (!checkboxes.length) return;

    checkboxes.forEach(function (cb) {
      cb.addEventListener("change", function () {
        selectedChannels = Array.from(
          document.querySelectorAll("[data-adv-channel]:checked")
        ).map(function (el) { return el.getAttribute("data-adv-channel"); });

        if (!selectedChannels.length) {
          selectedChannels = ["facebook"];
        }
        renderChart();
      });
    });

    const initSelected = Array.from(
      document.querySelectorAll("[data-adv-channel]:checked")
    ).map(function (el) { return el.getAttribute("data-adv-channel"); });

    if (initSelected.length) {
      selectedChannels = initSelected;
    }
  }

  /* ---------- Render with current state ---------- */

  function renderChart() {
    if (!jsonData) return;

    const allDates = jsonData.dates || [];
    if (!allDates.length) {
      console.error("[ADV] json.dates is missing or empty.");
      return;
    }

    // Default last 7 days
    let s = startDate;
    let e = endDate;
    if (!s || !e) {
      const endObj = new Date(allDates[allDates.length - 1]);
      const startObj = new Date(endObj);
      startObj.setDate(startObj.getDate() - 6);
      s = advToISODate(startObj);
      e = advToISODate(endObj);
    }

    const dateIndexes = advFilterDateRange(allDates, s, e);
    if (!dateIndexes.length) {
      console.warn("[ADV] No dates in selected range:", s, "→", e);
      return;
    }

    const payload = advBuildChartPayload({
      json: jsonData,
      channelIds: selectedChannels,
      dateIndexes: dateIndexes,
      metric: metric,
      mode: mode,
      valueType: valueType
    });

    advRenderLineChart(canvas, payload, valueType);
  }

  // Bind UI listeners
  connectChannelCheckbox(); // safe even if no checkbox yet
  connectModeSwitch();
}

/* Expose globally */
window.advInitChart = advInitChart;

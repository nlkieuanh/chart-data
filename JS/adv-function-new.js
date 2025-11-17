/***********************************************************
 * ADV FUNCTION NEW — FULL ENGINE (WITH CHART RENDER)
 * New JSON structure + date range filter (default = last 7d)
 ***********************************************************/

/* ===== Helpers ===== */
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
   1. Load JSON (with simple cache)
   ============================================================ */
async function advLoadNewJSON(url) {
  // use cache if same url
  if (window._advLastJson && window._advLastJsonUrl === url) {
    return window._advLastJson;
  }

  const res = await fetch(url);
  if (!res.ok) {
    console.error("[ADV] JSON fetch failed:", res.status, res.statusText);
    throw new Error("JSON fetch failed");
  }
  const json = await res.json();
  window._advLastJson = json;
  window._advLastJsonUrl = url;
  return json;
}


/* ============================================================
   2. Filter date range → return index array
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
   3. Extract metric series for (channel + company + metric)
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
   4. Simple payload builder (1 channel, direct, absolute)
   ============================================================ */
function advBuildChartPayloadSimple(json, channelId, dateIndexes, metric) {
  const dates = json.dates || [];
  const periods = dateIndexes.map(function (i) { return dates[i]; });
  const yourCompanyId = "your-company";

  const yourValues = advGetMetricSeries(json, channelId, yourCompanyId, metric, dateIndexes);

  const competitors = [];
  const channel = (json.channels || []).find(function (c) { return c.id === channelId; });
  if (channel) {
    (channel.companies || []).forEach(function (comp) {
      if (comp.id === yourCompanyId) return;
      competitors.push({
        name: comp.name,
        color: comp.color,
        values: advGetMetricSeries(json, channelId, comp.id, metric, dateIndexes)
      });
    });
  }

  return {
    chartType: "line",
    periods: periods,
    yourCompany: {
      name: "Your Company",
      color: "#3366cc",
      values: yourValues
    },
    competitors: competitors
  };
}


/* ============================================================
   5. Render Chart.js
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
   6. Main render function (used by advInitChart + date UI)
   ============================================================ */
async function advRenderNewChart(opts) {
  try {
    const canvas = opts.canvas;
    const jsonUrl = opts.jsonUrl;
    const channelIds = opts.channelIds || ["facebook"];
    const metric = opts.metric || "netRevenue";
    const valueType = opts.valueType || "absolute";

    const json = await advLoadNewJSON(jsonUrl);

    const allDates = json.dates || [];
    if (!allDates.length) {
      console.error("[ADV] json.dates is missing or empty.");
      return;
    }

    // Save bounds for date dropdown script
    window._advDateBounds = {
      min: allDates[0],
      max: allDates[allDates.length - 1]
    };

    // Default last 7 days if no start/end provided
    let s = opts.startDate;
    let e = opts.endDate;

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

    const firstChannel = channelIds[0] || "facebook";
    const payload = advBuildChartPayloadSimple(json, firstChannel, dateIndexes, metric);

    advRenderLineChart(canvas, payload, valueType);
  } catch (err) {
    console.error("[ADV] advRenderNewChart error:", err);
  }
}


/* ============================================================
   7. Init chart (called from Webflow)
   ============================================================ */
function advInitChart(wrapper, jsonUrl) {
  const canvas = wrapper.querySelector("canvas");
  if (!canvas) {
    console.error("[ADV] Canvas not found inside wrapper.");
    return;
  }

  let selectedChannels = ["facebook"]; // default (chưa làm checkbox)
  let startDate = null;               // null → auto last 7 days
  let endDate = null;
  let metric = "netRevenue";
  let mode = "direct";        // reserved for later
  let valueType = "absolute"; // reserved for later

  // Expose controller for date UI
  window._advCurrentChart = {
    setDateRange: function (start, end) {
      if (start) startDate = start;
      if (end) endDate = end;
      advRenderNewChart({
        canvas: canvas,
        jsonUrl: jsonUrl,
        channelIds: selectedChannels,
        startDate: startDate,
        endDate: endDate,
        metric: metric,
        valueType: valueType
      });
    }
  };

  // First render (default = last 7 days)
  advRenderNewChart({
    canvas: canvas,
    jsonUrl: jsonUrl,
    channelIds: selectedChannels,
    startDate: startDate,
    endDate: endDate,
    metric: metric,
    valueType: valueType
  });
}

/* Expose globally */
window.advInitChart = advInitChart;
window.advRenderNewChart = advRenderNewChart;

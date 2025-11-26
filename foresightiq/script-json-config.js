/***********************************************************
 * ADV HELPERS (SAFE + PLATFORM READY)
 ***********************************************************/

/* ---------- Date format ---------- */
function advToISODate(d) {
  if (!(d instanceof Date)) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

/* ---------- Color convert ---------- */
function advHexToRgba(hex, alpha) {
  if (!hex || hex[0] !== "#" || hex.length < 7) return "rgba(0,0,0," + alpha + ")";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ---------- Sum subset ---------- */
function advSumSubset(arr, indexes) {
  if (!Array.isArray(arr)) return 0;
  if (!indexes || !indexes.length) {
    return arr.reduce((acc, v) => acc + (Number(v) || 0), 0);
  }
  return indexes.reduce((acc, idx) => acc + (Number(arr[idx]) || 0), 0);
}

/* ---------- Base metrics ---------- */
function advGetBaseMetricsConfig(json) {
  if (!json || typeof json !== "object") return [];

  let baseMetrics = [];
  if (Array.isArray(json.baseMetrics) && json.baseMetrics.length) {
    baseMetrics = json.baseMetrics.slice();
  } else {
    const channels = json.channels || [];
    if (channels.length && channels[0].companies && channels[0].companies[0]) {
      const firstCompany = channels[0].companies[0];
      baseMetrics = Object.keys(firstCompany).filter(k => Array.isArray(firstCompany[k]));
    }
  }

  const labelsMap = json.meta?.metricLabels || {};

  return baseMetrics.map(metricId => {
    const id = String(metricId);
    const lower = id.toLowerCase();
    let format = "number";

    if (lower.includes("rate") || lower.includes("roas") || lower === "cvr") {
      format = "percent";
    } else if (
      lower.includes("revenue") ||
      lower.includes("rev") ||
      lower.includes("spend") ||
      lower.includes("cpo") ||
      lower.includes("cac")
    ) {
      format = "decimal";
    } else {
      format = "int";
    }

    return {
      id,
      key: id,
      label: labelsMap[id] || id,
      format
    };
  });
}

/* ---------- Format metric ---------- */
function advFormatMetricValue(conf, value) {
  const v = Number(value) || 0;
  if (!conf || !conf.format) return v.toFixed(2);

  if (conf.format === "percent") return v.toFixed(2) + "%";
  if (conf.format === "int") return Math.round(v).toLocaleString();
  return v.toFixed(2);
}

/***********************************************************
 * LOAD JSON — cached + safe (platform-ready)
 ***********************************************************/
const ADV_JSON_CACHE = {};

async function advLoadNewJSON(url) {
  if (!url) return null;

  if (ADV_JSON_CACHE[url]) return ADV_JSON_CACHE[url];

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Fetch failed: " + res.status);
    const json = await res.json();
    ADV_JSON_CACHE[url] = json;
    return json;
  } catch (e) {
    console.error("[ADV] Failed loading JSON:", url, e);
    return null;
  }
}

/***********************************************************
 * DATE RANGE
 ***********************************************************/
function advFilterDateRange(dates, startDate, endDate) {
  if (!Array.isArray(dates)) return [];

  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;

  if (!start || !end) return dates.map((_, i) => i);

  return dates.reduce((acc, d, i) => {
    const dd = new Date(d);
    if (dd >= start && dd <= end) acc.push(i);
    return acc;
  }, []);
}

/***********************************************************
 * GET SERIES SAFE
 ***********************************************************/
function advGetMetricSeries(json, channelId, companyId, metric, dateIndexes) {
  const channels = json.channels || [];
  const channel = channels.find(c => c.id === channelId);
  if (!channel) return [];

  const companies = channel.companies || [];
  const company = companies.find(c => c.id === companyId);
  if (!company) return [];

  const arr = company[metric] || [];
  if (!Array.isArray(arr)) return [];

  if (!dateIndexes || !dateIndexes.length) return arr.slice();

  return dateIndexes.map(i => arr[i] ?? 0);
}

/***********************************************************
 * CONSOLIDATE SERIES
 ***********************************************************/
function advConsolidateChannels(seriesList) {
  if (!seriesList.length) return [];
  const len = seriesList[0].length;
  const res = new Array(len).fill(0);

  seriesList.forEach(arr => {
    arr.forEach((v, i) => {
      res[i] += (v || 0);
    });
  });
  return res;
}

function advToPercent(values, total) {
  return values.map((v, i) => {
    const t = total[i] || 0;
    return t === 0 ? 0 : (v / t) * 100;
  });
}
/***********************************************************
 * ADV CHART PAYLOAD BUILDER — platform-ready + safe
 ***********************************************************/
function advBuildChartPayload(options) {
  const json = options.json;
  const channelIds = options.channelIds || [];
  const dateIndexes = options.dateIndexes || [];
  const metric = options.metric || "netRevenue";
  const mode = options.mode || "direct";
  const valueType = options.valueType || "absolute";

  if (!json || !Array.isArray(json.channels)) {
    return {
      chartType: "line",
      periods: [],
      yourCompany: { name: "", color: "#3366cc", values: [] },
      competitors: []
    };
  }

  const dates = json.dates || [];
  const periods = dateIndexes.map(i => dates[i]).filter(Boolean);

  let seriesMap = {};

  /* ------------------ DIRECT MODE ------------------ */
  if (mode === "direct") {
    const ch = json.channels.find(c => c.id === channelIds[0]);
    if (ch) {
      (ch.companies || []).forEach(comp => {
        const values = advGetMetricSeries(json, ch.id, comp.id, metric, dateIndexes);
        seriesMap[comp.id] = {
          name: comp.name,
          color: comp.color || "#666",
          values: values
        };
      });
    }
  }

  /* ------------------ CONSOLIDATE MODE ------------------ */
  else {
    (json.channels || []).forEach(ch => {
      if (!channelIds.includes(ch.id)) return;
      (ch.companies || []).forEach(comp => {
        const arr = advGetMetricSeries(json, ch.id, comp.id, metric, dateIndexes);
        if (!arr.length) return;
        if (!seriesMap[comp.id]) {
          seriesMap[comp.id] = {
            name: comp.name,
            color: comp.color || "#666",
            values: arr.slice()
          };
        } else {
          arr.forEach((v, i) => {
            seriesMap[comp.id].values[i] = (seriesMap[comp.id].values[i] || 0) + (v || 0);
          });
        }
      });
    });
  }

  /* ------------------ PERCENT MODE ------------------ */
  let seriesList = Object.values(seriesMap);
  if (valueType === "percent" && seriesList.length) {
    const len = seriesList[0].values.length;
    const totals = new Array(len).fill(0);

    seriesList.forEach(s => {
      s.values.forEach((v, i) => (totals[i] += v || 0));
    });

    seriesList = seriesList.map(s => ({
      ...s,
      values: advToPercent(s.values, totals)
    }));
  }

  /* ------------------ SPLIT YOUR COMPANY ------------------ */
  const your = seriesList.find(s => s.name === "Your Company") || seriesList[0] || null;
  const competitors = your ? seriesList.filter(s => s !== your) : seriesList;

  return {
    chartType: "line",
    periods: periods,
    yourCompany: your || { name: "", color: "#3366cc", values: [] },
    competitors
  };
}

/***********************************************************
 * ADV RENDER CHART.JS — platform-safe + destroy old instance
 ***********************************************************/
function advRenderLineChart(canvas, payload, valueType) {
  if (!window.Chart) {
    console.error("[ADV] Chart.js missing");
    return;
  }

  const ctx = canvas.getContext("2d");

  if (canvas._advChartInstance) {
    canvas._advChartInstance.destroy();
  }

  const datasets = [];

  if (payload.yourCompany && payload.yourCompany.values?.length) {
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

  (payload.competitors || []).forEach(comp => {
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
      labels: payload.periods,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: ctx => {
              const label = ctx.dataset.label || "";
              const v = ctx.parsed.y;
              if (valueType === "percent") return `${label}: ${v.toFixed(1)}%`;
              return `${label}: ${v.toLocaleString()}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: valueType === "percent" ? 100 : undefined,
          ticks: {
            callback: v => (valueType === "percent" ? `${v}%` : v)
          }
        }
      }
    }
  });
}

/***********************************************************
 * ADV INIT CHART — Platform-ready + fully scoped
 ***********************************************************/
function advInitChart(wrapper, jsonUrl) {
  const canvas = wrapper.querySelector("canvas") || (function () {
    const c = document.createElement("canvas");
    wrapper.innerHTML = "";
    wrapper.appendChild(c);
    return c;
  })();

  const card = wrapper.closest(".card-block-wrap");
  if (!card) return;

  if (!card._advTabControllers) card._advTabControllers = [];
  if (!card._advTabControllers.includes(wrapper)) {
    card._advTabControllers.push(wrapper);
  }

  const tableRender =
    wrapper.closest(".tab-content-flex")?.querySelector(".table-render") ||
    wrapper.closest(".w-tab-pane")?.querySelector(".table-render") ||
    card.querySelector(".table-render");

  let jsonData = null;
  let dateStart = null;
  let dateEnd = null;
  let selectedChannels = [];
  let currentCompanyId = null;
  let selectedMetric = "netRevenue";
  let mode = "direct";
  let valueType = "absolute";

  /* -------- LOAD JSON -------- */
  advLoadNewJSON(jsonUrl).then(json => {
    if (!json) return;
    jsonData = json;

    const allDates = json.dates || [];
    const channels = json.channels || [];
    if (!allDates.length || !channels.length) return;

    /* ---- Default date range ---- */
    const endObj = new Date(allDates[allDates.length - 1]);
    const startObj = new Date(endObj);
    startObj.setDate(startObj.getDate() - 6);

    dateStart = advToISODate(startObj);
    dateEnd = advToISODate(endObj);

    /* ---- Init dropdowns ---- */
    const firstChannel = channels[0];
    if (firstChannel) {
      const companies = firstChannel.companies || [];
      const compList = companies.map(c => ({ id: c.id, name: c.name }));
      if (compList.length) {
        advInitCompanyDropdown(card, compList);
        currentCompanyId = compList[0].id;
      }
    }

    const metricList = advGetBaseMetricsConfig(json).map(m => m.id);
    const metricLabels = json.meta?.metricLabels || {};
    advInitMetricDropdown(card, metricList, metricLabels);
    if (!metricList.includes(selectedMetric)) {
      selectedMetric = metricList[0] || "netRevenue";
    }

    /* ---- Default channel ---- */
    selectedChannels = [channels[0]?.id];

    /* ---- Render initial ---- */
    renderAll(true);

    connectModeSwitch();
  });

  /* ---------------- CONTROLLER (Expose to dropdowns) ---------------- */
  const controller = {
    setDateRange(start, end) {
      dateStart = start;
      dateEnd = end;
      renderAll();
    },
    setChannels(arr) {
      selectedChannels = Array.isArray(arr) ? arr : [];
      renderAll();
    },
    setCompany(id) {
      currentCompanyId = id;
      renderAll();
    },
    setMetric(id) {
      selectedMetric = id;
      renderAll();
    }
  };

  wrapper._advController = controller;

  /* ---------------- RENDER FUNCTIONS ---------------- */
  function renderAll(rebuildTable) {
    if (!jsonData) return;

    const dates = jsonData.dates || [];
    const idx = advFilterDateRange(dates, dateStart, dateEnd);

    if (!selectedChannels.length && jsonData.channels?.length) {
      selectedChannels = [jsonData.channels[0].id];
    }

    /* ---- Chart ---- */
    const payload = advBuildChartPayload({
      json: jsonData,
      channelIds: selectedChannels,
      dateIndexes: idx,
      metric: selectedMetric,
      mode,
      valueType
    });

    advRenderLineChart(canvas, payload, valueType);

    /* ---- Table ---- */
    if (rebuildTable && tableRender && typeof tableRender._advRebuildTable === "function") {
      tableRender._advRebuildTable(currentCompanyId, idx, selectedChannels);
    }
  }

  /* ---------------- MODE SWITCH (direct / consolidate) ---------------- */
  function connectModeSwitch() {
    const modeWrap = wrapper.querySelector(".chart-switch-mode-btn");
    const valueWrap = wrapper.querySelector(".chart-switch-value-btn");
    if (modeWrap) {
      const btnDir = modeWrap.querySelector(".btn-direct");
      const btnCon = modeWrap.querySelector(".btn-consolidate");
      btnDir?.addEventListener("click", () => {
        mode = "direct";
        btnDir.classList.add("is-active");
        btnCon?.classList.remove("is-active");
        renderAll();
      });
      btnCon?.addEventListener("click", () => {
        mode = "consolidate";
        btnCon.classList.add("is-active");
        btnDir?.classList.remove("is-active");
        renderAll();
      });
    }

    if (valueWrap) {
      const btnAbs = valueWrap.querySelector(".btn-absolute");
      const btnPct = valueWrap.querySelector(".btn-percent");
      btnAbs?.addEventListener("click", () => {
        valueType = "absolute";
        btnAbs.classList.add("is-active");
        btnPct?.classList.remove("is-active");
        renderAll();
      });
      btnPct?.addEventListener("click", () => {
        valueType = "percent";
        btnPct.classList.add("is-active");
        btnAbs?.classList.remove("is-active");
        renderAll();
      });
    }
  }
}

window.advInitChart = advInitChart;
/***********************************************************
 * ADV COMPANY DROPDOWN — SCOPED PER CARD
 ***********************************************************/
function advInitCompanyDropdown(scopeEl, companies) {
  if (!Array.isArray(companies) || !companies.length) return;

  const wrappers = scopeEl.querySelectorAll(".company-dd-link-select");
  wrappers.forEach(wrapper => {
    const scriptHolder = wrapper.querySelector(".company-select-script");
    const listContainer = scriptHolder ? scriptHolder.parentElement : wrapper;

    // Clear old items
    Array.from(listContainer.children).forEach(child => {
      if (child !== scriptHolder) child.remove();
    });

    companies.forEach(comp => {
      const item = document.createElement("div");
      item.className = "filter-dropdown-item";
      item.setAttribute("data-dropdown", comp.id);

      const text = document.createElement("div");
      text.className = "dropdown-item-text";
      text.textContent = comp.name;

      item.appendChild(text);
      listContainer.appendChild(item);
    });

    // Set default label
    const label = wrapper.querySelector(".company-dd-selected");
    if (label && companies[0]) {
      label.textContent = companies[0].name;
    }
  });
}

/***********************************************************
 * ADV APPLY COMPANY SELECTION
 ***********************************************************/
function advApplyCompanySelection(item) {
  if (!item) return;

  const wrapper = item.closest(".company-dd-link-select");
  if (!wrapper) return;

  const selectedCompany = item.getAttribute("data-dropdown");
  const selectedLabel = (item.querySelector(".dropdown-item-text")?.textContent || "").trim();

  const labelEl = wrapper.querySelector(".company-dd-selected");
  if (labelEl) labelEl.textContent = selectedLabel;

  // Find the nearest card-block-wrap
  const card = wrapper.closest(".card-block-wrap");
  if (!card) return;

  // Find all charts in this card
  const charts = card._advTabControllers || [];

  charts.forEach(chartWrapper => {
    const ctrl = chartWrapper?._advController;
    if (ctrl && typeof ctrl.setCompany === "function") {
      ctrl.setCompany(selectedCompany);
    }
  });
}

/***********************************************************
 * ADV METRIC DROPDOWN — SCOPED PER CARD
 ***********************************************************/
function advInitMetricDropdown(scopeEl, metrics, labelsMap) {
  if (!Array.isArray(metrics) || !metrics.length) return;

  const wrappers = scopeEl.querySelectorAll(".chart-metric-dd-select");
  wrappers.forEach(wrapper => {
    const scriptHolder = wrapper.querySelector(".chart-metric-select-script");
    const listContainer = scriptHolder ? scriptHolder.parentElement : wrapper;

    // Clear old items
    Array.from(listContainer.children).forEach(child => {
      if (child !== scriptHolder) child.remove();
    });

    metrics.forEach(metricId => {
      const item = document.createElement("div");
      item.className = "filter-dropdown-item";
      item.setAttribute("data-dropdown", metricId);

      const text = document.createElement("div");
      text.className = "dropdown-item-text";
      text.textContent = labelsMap[metricId] || metricId;

      item.appendChild(text);
      listContainer.appendChild(item);
    });

    // Default label
    const label = wrapper.querySelector(".chart-metric-dd-selected");
    if (label && metrics[0]) {
      label.textContent = labelsMap[metrics[0]] || metrics[0];
    }
  });
}

/***********************************************************
 * ADV APPLY METRIC SELECTION
 ***********************************************************/
function advApplyMetricSelection(item) {
  if (!item) return;

  const wrapper = item.closest(".chart-metric-dd-select");
  if (!wrapper) return;

  const selectedMetric = item.getAttribute("data-dropdown");
  const selectedLabel = (item.querySelector(".dropdown-item-text")?.textContent || "").trim();

  const labelEl = wrapper.querySelector(".chart-metric-dd-selected");
  if (labelEl) labelEl.textContent = selectedLabel;

  // Find card
  const card = wrapper.closest(".card-block-wrap");
  if (!card) return;

  // All tab chart controllers under card
  const charts = card._advTabControllers || [];

  charts.forEach(chartWrapper => {
    const ctrl = chartWrapper?._advController;
    if (ctrl && typeof ctrl.setMetric === "function") {
      ctrl.setMetric(selectedMetric);
    }
  });
}

/***********************************************************
 * GLOBAL CLICK HANDLER FOR DROPDOWNS
 ***********************************************************/
document.addEventListener("click", function (event) {

  /* -------- COMPANY DROPDOWN -------- */
  const compItem = event.target.closest(".company-dd-link-select [data-dropdown]");
  if (compItem) {
    advApplyCompanySelection(compItem);

    const dd = compItem.closest(".dropdown, .w-dropdown");
    if (dd && window.$) $(dd).triggerHandler("w-close.w-dropdown");
    return; // stop to avoid falling through
  }

  /* -------- METRIC DROPDOWN -------- */
  const metricItem = event.target.closest(".chart-metric-dd-select [data-dropdown]");
  if (metricItem) {
    advApplyMetricSelection(metricItem);

    const dd = metricItem.closest(".dropdown, .w-dropdown");
    if (dd && window.$) $(dd).triggerHandler("w-close.w-dropdown");
  }
});
/***********************************************************
 * ADV DATE RANGE ENGINE — FULLY SCOPED + PLATFORM READY
 ***********************************************************/
(function () {

  /* ---- Find controllers inside card ---- */
  function getControllers(wrapper) {
    const card = wrapper.closest(".card-block-wrap");
    if (!card || !Array.isArray(card._advTabControllers)) return [];
    return card._advTabControllers
      .map(w => w?._advController)
      .filter(Boolean);
  }

  /* ---- Resolve date bounds ---- */
  function getBoundsOrFallback(wrapper) {
    const card = wrapper.closest(".card-block-wrap");
    const bounds = card?._advDateBounds;
    if (bounds && bounds.min && bounds.max) {
      return {
        min: new Date(bounds.min),
        max: new Date(bounds.max)
      };
    }
    // fallback: current month
    const now = new Date();
    return {
      min: new Date(now.getFullYear(), now.getMonth(), 1),
      max: now
    };
  }

  /* ---- Apply quick range selection ---- */
  function applyDateRangeSelection(item) {
    if (!item) return;

    const wrapper = item.closest(".date-range-dd-select");
    if (!wrapper) return;

    const value = item.getAttribute("data-dropdown");
    const labelEl = wrapper.querySelector(".date-range-dd-selected");

    const text = item.querySelector(".dropdown-item-text")?.textContent?.trim() || "";
    if (labelEl && text) labelEl.textContent = text;

    const ctrls = getControllers(wrapper);
    if (!ctrls.length) return;

    const bounds = getBoundsOrFallback(wrapper);
    let start, end;

    if (value === "default") {
      end = new Date(bounds.max);
      start = new Date(end);
      start.setDate(start.getDate() - 6);
    }
    else if (value === "lastMonth") {
      end = new Date(bounds.max);
      start = new Date(end);
      start.setDate(start.getDate() - 29);
    }
    else {
      return;
    }

    const startISO = advToISODate(start);
    const endISO = advToISODate(end);

    ctrls.forEach(c => c.setDateRange(startISO, endISO));
  }

  /* ---- Flatpickr input handler ---- */
  function onFlatpickrChange(selectedDates, dateStr, instance) {
    const input = instance.input;
    const wrapper = input.closest(".date-range-dd-select");
    if (!wrapper) return;

    const ctrls = getControllers(wrapper);
    if (!ctrls.length) return;

    const labelEl = wrapper.querySelector(".date-range-dd-selected");
    if (!labelEl) return;

    if (!selectedDates || !selectedDates.length) return;

    const opt = { day: "2-digit", month: "short", year: "numeric" };

    if (selectedDates.length === 1) {
      labelEl.textContent =
        selectedDates[0].toLocaleDateString(undefined, opt) + " …";
      return;
    }

    const start = selectedDates[0];
    const end = selectedDates[1];

    const startTxt = start.toLocaleDateString(undefined, opt);
    const endTxt = end.toLocaleDateString(undefined, opt);

    labelEl.textContent = `${startTxt} – ${endTxt}`;

    const startISO = advToISODate(start);
    const endISO = advToISODate(end);

    ctrls.forEach(c => c.setDateRange(startISO, endISO));
  }

  /* ---- Init on DOM Ready ---- */
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".date-range-dd-select").forEach(wrapper => {

      // Set default label
      const def = wrapper.querySelector('[data-dropdown="default"]')
        || wrapper.querySelector("[data-dropdown]");

      if (def) {
        const txt = def.querySelector(".dropdown-item-text")?.textContent?.trim() || "";
        const lab = wrapper.querySelector(".date-range-dd-selected");
        if (lab && txt) lab.textContent = txt;
      }

      // Setup Flatpickr
      const input =
        wrapper.querySelector("#customRange") ||
        wrapper.querySelector(".date-range-input");

      if (input && typeof flatpickr === "function") {
        flatpickr(input, {
          mode: "range",
          dateFormat: "Y-m-d",
          allowInput: true,
          altInput: true,
          altFormat: "d M Y",
          onChange: onFlatpickrChange
        });
      }
    });
  });

  /* ---- Global click listener for quick ranges ---- */
  document.addEventListener("click", function (event) {
    const item = event.target.closest(".date-range-dd-select [data-dropdown]");
    if (!item || item.tagName === "INPUT") return;

    applyDateRangeSelection(item);

    const dd = item.closest(".dropdown, .w-dropdown");
    if (dd && window.$) $(dd).triggerHandler("w-close.w-dropdown");
  });

})();
/***********************************************************
 * ADV TABLE ENGINE — FULLY SCOPED + PLATFORM READY
 ***********************************************************/
(function () {

  function advInitTable(wrapper, jsonUrl) {
    if (!wrapper || !jsonUrl) return;

    const card = wrapper.closest(".card-block-wrap");
    if (!card) return;

    fetch(jsonUrl)
      .then(r => r.json())
      .then(json => {
        if (!json || !json.channels?.length) return;

        const channels = json.channels;
        const metricsConfig = advGetBaseMetricsConfig(json);
        if (!metricsConfig.length) return;

        // Table root
        const tableWrapper =
          wrapper.querySelector(".adv-channel-table-wrapper") || wrapper;

        const table =
          tableWrapper.querySelector(".adv-channel-table") ||
          (function () {
            const t = document.createElement("table");
            t.className = "adv-channel-table";
            tableWrapper.appendChild(t);
            return t;
          })();

        table.innerHTML = "";

        /* -------- Build header -------- */
        const thead = document.createElement("thead");
        const trH = document.createElement("tr");

        const th1 = document.createElement("th");
        trH.appendChild(th1);

        const dimLabel = json.meta?.dimensionLabel || "Category";
        const thName = document.createElement("th");
        thName.textContent = dimLabel;
        trH.appendChild(thName);

        metricsConfig.forEach(conf => {
          const th = document.createElement("th");
          th.textContent = conf.label;
          trH.appendChild(th);
        });

        thead.appendChild(trH);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        table.appendChild(tbody);

        /* -------- Default date range -------- */
        const dates = json.dates || [];
        const endObj = new Date(dates[dates.length - 1]);
        const startObj = new Date(endObj);
        startObj.setDate(startObj.getDate() - 6);

        const defaultIndexes = dates.reduce((acc, d, i) => {
          const dd = new Date(d);
          if (dd >= startObj && dd <= endObj) acc.push(i);
          return acc;
        }, []);

        let currentSelectedChannels = [];

        /* -------- BUILD TABLE ROWS -------- */
        function buildRows(companyId, dateIndexes, selectedChannels) {
          const idx = Array.isArray(dateIndexes) && dateIndexes.length
            ? dateIndexes
            : defaultIndexes;

          currentSelectedChannels = Array.isArray(selectedChannels)
            ? selectedChannels.slice()
            : [];

          tbody.innerHTML = "";

          let newlyChecked = [];

          channels.forEach((channel, index) => {
            const companies = channel.companies || [];
            const comp =
              companies.find(c => c.id === companyId) ||
              companies[0];

            if (!comp) return;

            // Build metric sums
            let ctx = {};
            metricsConfig.forEach(conf => {
              ctx[conf.id] = advSumSubset(comp[conf.key] || [], idx);
            });

            // Channel checkbox state
            let isChecked = currentSelectedChannels.includes(channel.id);
            if (!currentSelectedChannels.length && index === 0) {
              isChecked = true;
            }
            if (isChecked) newlyChecked.push(channel.id);

            // Row HTML
            const tr = document.createElement("tr");
            tr.innerHTML = `
              <td><input type="checkbox" class="adv-channel-checkbox"
                 data-adv-channel="${channel.id}" ${isChecked ? "checked" : ""}></td>
              <td>${channel.label || channel.id}</td>
            `;

            metricsConfig.forEach(conf => {
              const val = ctx[conf.id] || 0;
              const td = document.createElement("td");
              td.innerHTML = advFormatMetricValue(conf, val);
              tr.appendChild(td);
            });

            tbody.appendChild(tr);
          });

          /* ---- Sync back to chart ---- */
          const chartWrapper =
            wrapper.closest(".tab-content-flex")?.querySelector(".chart-canvas") ||
            wrapper.closest(".w-tab-pane")?.querySelector(".chart-canvas") ||
            card.querySelector(".chart-canvas");

          const ctrl = chartWrapper?._advController;
          if (ctrl && newlyChecked.length) {
            ctrl.setChannels(newlyChecked);
          }
        }

        wrapper._advRebuildTable = buildRows;

        /* ---- Initial build ---- */
        const defCompany =
          json.channels[0]?.companies?.[0]?.id || "your-company";
        const defChannel = json.channels[0]?.id ? [json.channels[0].id] : [];

        buildRows(defCompany, defaultIndexes, defChannel);

        /* ---- Checkbox sync ---- */
        if (!wrapper._advCheckboxBound) {
          wrapper._advCheckboxBound = true;

          wrapper.addEventListener("change", e => {
            const cb = e.target.closest(".adv-channel-checkbox");
            if (!cb) return;

            const tbodyEl = cb.closest("tbody");
            const boxes = Array.from(tbodyEl.querySelectorAll(".adv-channel-checkbox"));

            let selected = [];
            if (cb.checked) {
              boxes.forEach(box => (box.checked = box === cb));
              selected = [cb.getAttribute("data-adv-channel")];
            } else {
              const checked = boxes.filter(b => b.checked);
              if (checked.length) {
                selected = [checked[0].getAttribute("data-adv-channel")];
              } else {
                boxes[0].checked = true;
                selected = [boxes[0].getAttribute("data-adv-channel")];
              }
            }

            const card = wrapper.closest(".card-block-wrap");
            const charts = card._advTabControllers || [];
            charts.forEach(w => {
              const ctrl = w?._advController;
              ctrl?.setChannels(selected);
            });
          });
        }
      })
      .catch(err => {
        console.error("[ADV TABLE] Failed:", jsonUrl, err);
      });
  }

  window.advInitTable = advInitTable;

})();
/* ============================================================
   5. PLATFORM FILTER (FINAL VERSION)
   ============================================================ */

/* ---- Utility: Always find correct Webflow TAB PANE ---- */
function advFindTabPane(card, tabName) {
  // Always target real tab pane, not tab link
  let pane = card.querySelector(`.w-tab-pane[data-w-tab="${tabName}"]`);
  if (pane) return pane;

  // Fallback if Webflow changes structure:
  const links = Array.from(card.querySelectorAll('.w-tab-link'));
  const panes = Array.from(card.querySelectorAll('.w-tab-pane'));
  const match = links.find(l => l.getAttribute('data-w-tab') === tabName);

  if (match) {
    const index = links.indexOf(match);
    return panes[index] || null;
  }
  return null;
}

/* ---- Utility: Get chart/table wrappers inside tab pane ---- */
function advGetChartWrappers(tabPane) {
  if (!tabPane) return [];
  return Array.from(
    tabPane.querySelectorAll(".chart-canvas, .tab-content-flex .chart-canvas")
  );
}

function advGetTableWrappers(tabPane) {
  if (!tabPane) return [];
  return Array.from(
    tabPane.querySelectorAll(".table-render, .tab-content-flex .table-render")
  );
}

/* ============================================================
   Apply platform to one card-block-wrap
   ============================================================ */
async function advApplyPlatformToBlock(card, platform) {
  if (!card) return;

  const configEl = card.querySelector(".adv-config");
  if (!configEl) return;

  let config = {};
  try {
    config = JSON.parse(configEl.textContent.trim());
  } catch (err) {
    console.error("[ADV] Cannot parse adv-config:", err);
    return;
  }

  const platforms = config.platforms || {};
  const pf = platforms[platform];
  if (!pf) {
    console.error("[ADV] Platform not found:", platform);
    return;
  }

  const competitorsUrl = pf.competitors;
  const bicUrl = pf.bic;

  if (!competitorsUrl || !bicUrl) {
    console.error("[ADV] Missing JSON URLs for platform:", platform);
    return;
  }

  /* ---- Find correct tab panes ---- */
  const competitorsTab = advFindTabPane(card, "competitors");
  const bicTab = advFindTabPane(card, "best-in-class");

  /* ---- Init charts ---- */
  advGetChartWrappers(competitorsTab).forEach(w => advInitChart(w, competitorsUrl));
  advGetChartWrappers(bicTab).forEach(w => advInitChart(w, bicUrl));

  /* ---- Init tables ---- */
  advGetTableWrappers(competitorsTab).forEach(w => advInitTable(w, competitorsUrl));
  advGetTableWrappers(bicTab).forEach(w => advInitTable(w, bicUrl));
}

/* ============================================================
   5B. AUTO-INIT FOR ALL CARD-BLOCK-WRAP (FINAL)
   ============================================================ */
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".card-block-wrap").forEach(card => {

    const configEl = card.querySelector(".adv-config");
    if (!configEl) return;

    let config = {};
    try {
      config = JSON.parse(configEl.textContent.trim());
    } catch (err) {
      console.error("[ADV] Bad adv-config:", err);
      return;
    }

    /* ----------------------------------------------------
       Detect DEFAULT platform from data-dropdown="default"
    ---------------------------------------------------- */
    const platformDD = card.querySelector(".platform-dd-select");
    let defaultPlatform = null;

    const defaultItem = platformDD
      ? platformDD.querySelector('[data-dropdown="default"]')
      : null;

    if (defaultItem) {
      // Use real platform name in JSON config
      // "default" always maps to "facebook" unless customized
      defaultPlatform = "facebook";
    } else {
      // fallback: use first key from config.platforms
      defaultPlatform = Object.keys(config.platforms || {})[0];
    }

    if (!defaultPlatform) {
      console.error("[ADV] No platform found in config");
      return;
    }

    /* ---- Load JSON for default platform ---- */
    advApplyPlatformToBlock(card, defaultPlatform);

    /* ---- Update UI label ---- */
    if (platformDD && defaultItem) {
      const labelEl = platformDD.querySelector(".platform-dd-selected");
      const textEl = defaultItem.querySelector(".dropdown-item-text");

      if (labelEl && textEl) {
        labelEl.textContent = textEl.textContent.trim();
      }
    }

    /* ============================================================
       Platform dropdown click handler (final)
       ============================================================ */
    if (platformDD) {
      platformDD.addEventListener("click", function (ev) {
        const item = ev.target.closest("[data-dropdown]");
        if (!item) return;

        let ddValue = item.getAttribute("data-dropdown");
        let platformToLoad = ddValue === "default" ? "facebook" : ddValue;

        /* Update UI label */
        const labelEl = platformDD.querySelector(".platform-dd-selected");
        const textEl = item.querySelector(".dropdown-item-text");
        if (labelEl && textEl) {
          labelEl.textContent = textEl.textContent.trim();
        }

        /* Load correct JSON */
        advApplyPlatformToBlock(card, platformToLoad);

        /* Close Webflow dropdown */
        const dd = item.closest(".dropdown, .w-dropdown");
        if (dd && window.$) $(dd).triggerHandler("w-close.w-dropdown");
      });
    }
  });
});

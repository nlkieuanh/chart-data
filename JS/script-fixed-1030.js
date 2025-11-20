/***********************************************************
 * ADV FUNCTION CORE (Helpers + Chart Payload + Chart Render)
 * — Stable / unchanged logic
 ***********************************************************/

/* ---------- Helpers ---------- */

function advToISODate(d) {
  if (!(d instanceof Date)) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function advHexToRgba(hex, alpha) {
  if (!hex || hex[0] !== "#" || hex.length < 7) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function advSumSubset(arr, indexes) {
  if (!Array.isArray(arr)) return 0;
  if (!indexes || !indexes.length) {
    return arr.reduce((a, v) => a + (Number(v) || 0), 0);
  }
  return indexes.reduce((a, idx) => a + (Number(arr[idx]) || 0), 0);
}

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

  const labelsMap = (json.meta && json.meta.metricLabels) || {};

  return baseMetrics.map(id => {
    const lower = id.toLowerCase();
    let format = "number";

    if (
      lower.includes("rate") ||
      lower.includes("roas") ||
      lower === "cvr"
    ) {
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

function advFormatMetricValue(conf, value) {
  const v = Number(value) || 0;
  if (!conf || !conf.format) return v.toFixed(2);

  if (conf.format === "percent") return v.toFixed(2) + "%";
  if (conf.format === "int") return Math.round(v).toLocaleString();
  return v.toFixed(2);
}

/* ============================================================
   JSON LOADING
============================================================ */

async function advLoadNewJSON(url) {
  const res = await fetch(url);
  if (!res.ok) {
    console.error("[ADV] JSON fetch failed:", res.status, res.statusText);
    throw new Error("JSON fetch failed");
  }
  return res.json();
}

/* ============================================================
   DATE RANGE → INDEXES
============================================================ */

function advFilterDateRange(dates, startDate, endDate) {
  if (!Array.isArray(dates)) return [];

  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;

  if (!start || !end) return dates.map((_, i) => i);

  return dates.reduce((a, d, i) => {
    const dd = new Date(d);
    if (dd >= start && dd <= end) a.push(i);
    return a;
  }, []);
}

/* ============================================================
   METRIC SERIES EXTRACTION
============================================================ */

function advGetMetricSeries(json, channelId, companyId, metric, dateIndexes) {
  const channels = json.channels || [];
  const channel = channels.find(c => c.id === channelId);
  if (!channel) return [];

  const companies = channel.companies || [];
  const company = companies.find(c => c.id === companyId);
  if (!company) return [];

  const fullArray = company[metric] || [];
  if (!Array.isArray(fullArray)) return [];

  if (!dateIndexes || !dateIndexes.length) return fullArray;

  return dateIndexes.map(i => fullArray[i]);
}

/* ============================================================
   CONSOLIDATION
============================================================ */

function advConsolidateChannels(seriesList) {
  if (!seriesList.length) return [];
  const len = seriesList[0].length;
  const result = Array(len).fill(0);

  seriesList.forEach(arr => {
    arr.forEach((v, i) => {
      result[i] += v;
    });
  });

  return result;
}

function advToPercent(values, total) {
  return values.map((v, i) => {
    const t = total[i] || 0;
    return t === 0 ? 0 : (v / t) * 100;
  });
}

/* ============================================================
   CHART PAYLOAD BUILDER
============================================================ */

function advBuildChartPayload(options) {
  const { json, channelIds, dateIndexes, metric, mode, valueType } = {
    metric: "netRevenue",
    mode: "direct",
    valueType: "absolute",
    ...options
  };

  const periods = dateIndexes.map(i => json.dates[i]);
  const seriesMap = {};

  if (mode === "direct") {
    const ch = json.channels.find(c => c.id === channelIds[0]);
    if (ch) {
      ch.companies.forEach(comp => {
        seriesMap[comp.id] = {
          name: comp.name,
          color: comp.color,
          values: advGetMetricSeries(json, ch.id, comp.id, metric, dateIndexes)
        };
      });
    }
  } else {
    json.channels.forEach(ch => {
      if (!channelIds.includes(ch.id)) return;

      ch.companies.forEach(comp => {
        const vals = advGetMetricSeries(json, ch.id, comp.id, metric, dateIndexes);
        if (!vals.length) return;

        if (!seriesMap[comp.id]) {
          seriesMap[comp.id] = { name: comp.name, color: comp.color, values: vals.slice() };
        } else {
          vals.forEach((v, i) => {
            seriesMap[comp.id].values[i] += v || 0;
          });
        }
      });
    });
  }

  let seriesList = Object.values(seriesMap);

  if (valueType === "percent" && seriesList.length) {
    const len = seriesList[0].values.length;
    const tot = Array(len).fill(0);

    seriesList.forEach(s => {
      s.values.forEach((v, i) => tot[i] += v || 0);
    });

    seriesList = seriesList.map(s => ({
      name: s.name,
      color: s.color,
      values: advToPercent(s.values, tot)
    }));
  }

  const yourCompany =
    seriesList.find(s => s.name === "Your Company") ||
    seriesList[0] ||
    { name: "", color: "#3366cc", values: [] };

  const competitors = seriesList.filter(s => s !== yourCompany);

  return { chartType: "line", periods, yourCompany, competitors };
}

/* ============================================================
   CHART RENDERER (Chart.js)
============================================================ */

function advRenderLineChart(canvas, payload, valueType) {
  if (!window.Chart) return;

  const ctx = canvas.getContext("2d");
  if (canvas._advChartInstance) canvas._advChartInstance.destroy();

  const datasets = [];

  if (payload.yourCompany.values.length) {
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

  payload.competitors.forEach(comp => {
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
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              const lbl = ctx.dataset.label || "";
              const v = ctx.parsed.y;
              if (valueType === "percent") return `${lbl}: ${v.toFixed(1)}%`;
              return `${lbl}: ${v.toLocaleString()}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: valueType === "percent" ? 100 : undefined,
          ticks: {
            callback: v => (valueType === "percent" ? v + "%" : v)
          }
        }
      }
    }
  });
}
/***********************************************************
 * PART 2 — CHART INITIALIZER + CONTROLLER
 * (metric + date range + channel event sync)
 ***********************************************************/

function advInitChart(wrapper, jsonUrl) {
  const canvas = wrapper.querySelector("canvas");
  if (!canvas) {
    console.error("[ADV] Canvas missing in wrapper");
    return;
  }

  const card = wrapper.closest(".card-block-wrap");

  // Local instance state
  let jsonData = null;
  let selectedChannelId = null;       // single channel selected
  let metric = "netRevenue";
  let mode = "direct";
  let valueType = "absolute";
  let startDate = null;
  let endDate = null;

  /* ---------------------------------------------------------
     Default 7-day window helper
  --------------------------------------------------------- */
  function getDefaultDateRange(dates) {
    const endObj = new Date(dates[dates.length - 1]);
    const startObj = new Date(endObj);
    startObj.setDate(startObj.getDate() - 6);
    return {
      start: advToISODate(startObj),
      end: advToISODate(endObj)
    };
  }

  /* ---------------------------------------------------------
     Core render chart
  --------------------------------------------------------- */
  function renderChart(dateIndexes) {
    if (!jsonData) return;

    const payload = advBuildChartPayload({
      json: jsonData,
      channelIds: [selectedChannelId],
      dateIndexes,
      metric,
      mode,
      valueType
    });

    advRenderLineChart(canvas, payload, valueType);
  }

  /* ---------------------------------------------------------
     Render chart using current state (metric, date range…)
  --------------------------------------------------------- */
  function renderChartWithState() {
    if (!jsonData) return;
    const allDates = jsonData.dates;
    const dateIndexes = advFilterDateRange(allDates, startDate, endDate);
    renderChart(dateIndexes);
  }

  /* ---------------------------------------------------------
     Initialize JSON
  --------------------------------------------------------- */
  advLoadNewJSON(jsonUrl)
    .then(json => {
      jsonData = json;

      const channels = json.channels || [];
      if (!channels.length) return;

      // Default channel: first row
      selectedChannelId = channels[0].id;

      // Default date range
      const d = getDefaultDateRange(json.dates);
      startDate = d.start;
      endDate = d.end;

      // Expose min/max date for external date UI
      card._advDateBounds = {
        min: json.dates[0],
        max: json.dates[json.dates.length - 1]
      };

      // Render once
      renderChartWithState();

      setupMetricDropdown(json);
      setupModeValueSwitch();
    });
  
  /* ---------------------------------------------------------
     Metric dropdown builder
  --------------------------------------------------------- */
  function setupMetricDropdown(json) {
    const metrics = Array.isArray(json.baseMetrics) ? json.baseMetrics : [];
    const labels = (json.meta && json.meta.metricLabels) || {};

    wrapper.querySelectorAll(".chart-metric-dd-select").forEach(dd => {
      const scriptHolder = dd.querySelector(".chart-metric-select-script");
      const list = scriptHolder ? scriptHolder.parentElement : dd;

      Array.from(list.children).forEach(n => {
        if (n !== scriptHolder) n.remove();
      });

      metrics.forEach(m => {
        const item = document.createElement("div");
        item.className = "filter-dropdown-item";
        item.setAttribute("data-dropdown", m);

        const t = document.createElement("div");
        t.className = "dropdown-item-text";
        t.textContent = labels[m] || m;

        item.appendChild(t);
        list.appendChild(item);
      });

      const lbl = dd.querySelector(".chart-metric-dd-selected");
      if (lbl && metrics[0]) lbl.textContent = labels[metrics[0]] || metrics[0];
    });
  }

  /* ---------------------------------------------------------
     Metric dropdown handler (global delegation)
  --------------------------------------------------------- */
  document.addEventListener("click", function (ev) {
    const item = ev.target.closest(".chart-metric-dd-select [data-dropdown]");
    if (!item) return;

    const val = item.getAttribute("data-dropdown");
    const text = item.innerText.trim();

    const dd = item.closest(".chart-metric-dd-select");
    const lbl = dd.querySelector(".chart-metric-dd-selected");
    if (lbl) lbl.textContent = text;

    metric = val;
    renderChartWithState();

    const dropdown = item.closest(".dropdown, .w-dropdown");
    if (dropdown && window.$) $(dropdown).triggerHandler("w-close.w-dropdown");
  });

  /* ---------------------------------------------------------
     Mode + Value switch (absolute/percent + direct/consolidate)
  --------------------------------------------------------- */
  function setupModeValueSwitch() {
    const modeWrap = wrapper.querySelector(".chart-switch-mode-btn");
    if (modeWrap) {
      const btnDirect = modeWrap.querySelector(".btn-direct");
      const btnCons = modeWrap.querySelector(".btn-consolidate");

      if (btnDirect) {
        btnDirect.addEventListener("click", () => {
          mode = "direct";
          btnDirect.classList.add("is-active");
          if (btnCons) btnCons.classList.remove("is-active");
          renderChartWithState();
        });
      }
      if (btnCons) {
        btnCons.addEventListener("click", () => {
          mode = "consolidate";
          btnCons.classList.add("is-active");
          if (btnDirect) btnDirect.classList.remove("is-active");
          renderChartWithState();
        });
      }
    }

    const valWrap = wrapper.querySelector(".chart-switch-value-btn");
    if (valWrap) {
      const btnAbs = valWrap.querySelector(".btn-absolute");
      const btnPct = valWrap.querySelector(".btn-percent");

      if (btnAbs) {
        btnAbs.addEventListener("click", () => {
          valueType = "absolute";
          btnAbs.classList.add("is-active");
          if (btnPct) btnPct.classList.remove("is-active");
          renderChartWithState();
        });
      }
      if (btnPct) {
        btnPct.addEventListener("click", () => {
          valueType = "percent";
          btnPct.classList.add("is-active");
          if (btnAbs) btnAbs.classList.remove("is-active");
          renderChartWithState();
        });
      }
    }
  }

  /* ---------------------------------------------------------
     CARD CONTROLLER exposed to Webflow filters (date+channel)
  --------------------------------------------------------- */
  const controller = {
    setDateRange(start, end) {
      if (start) startDate = start;
      if (end) endDate = end;

      if (!jsonData) return;

      const allDates = jsonData.dates;
      const dateIndexes = advFilterDateRange(allDates, startDate, endDate);

      renderChart(dateIndexes);

      // update table if exists
      if (card._advRenderTable) {
        card._advRenderTable(card._advSelectedCompanyId, dateIndexes, selectedChannelId);
      }
    },

    setChannels(arr) {
      if (Array.isArray(arr) && arr.length) {
        selectedChannelId = arr[0];
      }
      renderChartWithState();

      // update table
      if (card._advRenderTable) {
        const allDates = jsonData.dates;
        const idx = advFilterDateRange(allDates, startDate, endDate);
        card._advRenderTable(card._advSelectedCompanyId, idx, selectedChannelId);
      }
    },

    setMetric(metricId) {
      metric = metricId;
      renderChartWithState();
    },

    setCompany(companyId) {
      // table only, chart does NOT re-render
      card._advSelectedCompanyId = companyId;

      if (card._advRenderTable) {
        const allDates = jsonData.dates;
        const idx = advFilterDateRange(allDates, startDate, endDate);
        card._advRenderTable(companyId, idx, selectedChannelId);
      }
    }
  };

  card._advController = controller;
}
window.advInitChart = advInitChart;

/***********************************************************
 * PART 2B — DATE RANGE DROPDOWN + FLATPICKR
 ***********************************************************/

(function () {
  function getController(wrapper) {
    const card = wrapper.closest(".card-block-wrap");
    return card && card._advController;
  }

  function getBounds(wrapper) {
    const card = wrapper.closest(".card-block-wrap");
    const b = card && card._advDateBounds;
    if (!b) return null;
    return {
      min: new Date(b.min),
      max: new Date(b.max)
    };
  }

  /* Dropdown preset selection */
  function applyPreset(item) {
    const wrap = item.closest(".date-range-dd-select");
    const ctrl = getController(wrap);
    const bounds = getBounds(wrap);
    if (!ctrl || !bounds) return;

    const type = item.getAttribute("data-dropdown");
    const label = item.querySelector(".dropdown-item-text").innerText.trim();
    const out = wrap.querySelector(".date-range-dd-selected");
    if (out) out.textContent = label;

    if (type === "default") {
      const end = bounds.max;
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      ctrl.setDateRange(advToISODate(start), advToISODate(end));
    }

    if (type === "lastMonth") {
      const end = bounds.max;
      const start = new Date(end);
      start.setDate(start.getDate() - 29);
      ctrl.setDateRange(advToISODate(start), advToISODate(end));
    }
  }

  /* Flatpickr custom range */
  function onFlatpickrChange(selectedDates, dateStr, inst) {
    const input = inst.input;
    const wrap = input.closest(".date-range-dd-select");
    const ctrl = getController(wrap);
    const lbl = wrap.querySelector(".date-range-dd-selected");
    if (!ctrl || !lbl) return;

    if (selectedDates.length === 1) {
      lbl.textContent = selectedDates[0].toLocaleDateString(undefined, { day: "2-digit", month: "short" }) + " …";
      return;
    }

    if (selectedDates.length === 2) {
      const s = selectedDates[0];
      const e = selectedDates[1];

      lbl.textContent =
        s.toLocaleDateString(undefined, { day: "2-digit", month: "short" }) +
        " – " +
        e.toLocaleDateString(undefined, { day: "2-digit", month: "short" });

      ctrl.setDateRange(advToISODate(s), advToISODate(e));
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".date-range-dd-select").forEach(wrap => {
      const def = wrap.querySelector('[data-dropdown="default"]');
      const lbl = wrap.querySelector(".date-range-dd-selected");
      if (def && lbl) {
        const t = def.querySelector(".dropdown-item-text").innerText.trim();
        lbl.textContent = t;
      }

      const input = wrap.querySelector(".date-range-input");
      if (input && window.flatpickr) {
        flatpickr(input, {
          mode: "range",
          dateFormat: "Y-m-d",
          altInput: true,
          altFormat: "d M Y",
          onChange: onFlatpickrChange
        });
      }
    });
  });

  document.addEventListener("click", function (ev) {
    const item = ev.target.closest(".date-range-dd-select [data-dropdown]");
    if (!item) return;

    if (item.tagName !== "INPUT") {
      applyPreset(item);
      const dd = item.closest(".dropdown, .w-dropdown");
      if (dd && window.$) $(dd).triggerHandler("w-close.w-dropdown");
    }
  });
})();
/***********************************************************
 * PART 3 — ADV TABLE ENGINE (single checkbox, no conflicts)
 ***********************************************************/

function advRenderChannelTable(json, tbody, selectedChannelId, dateIndexes, companyId) {
  if (!tbody || !json) return;

  const channels = json.channels || [];
  const dates = json.dates || [];
  if (!channels.length || !dates.length) return;

  const metricsConfig = advGetBaseMetricsConfig(json);

  const idx = Array.isArray(dateIndexes) && dateIndexes.length
    ? dateIndexes
    : dates.map((_, i) => i);

  tbody.innerHTML = "";

  channels.forEach((channel, index) => {
    const companies = channel.companies || [];
    const company =
      companies.find(c => c.id === companyId) ||
      companies.find(c => c.id === "your-company") ||
      companies[0];

    if (!company) return;

    const ctx = {};
    metricsConfig.forEach(conf => {
      const arr = company[conf.key] || [];
      ctx[conf.id] = advSumSubset(arr, idx);
    });

    const isChecked = selectedChannelId === channel.id;

    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>
        <input 
           type="checkbox" 
           class="adv-channel-checkbox"
           data-adv-channel="${channel.id}"
           ${isChecked ? "checked" : ""}
        >
      </td>
      <td>${channel.label || channel.id}</td>` +
      metricsConfig
        .map(conf => `<td>${advFormatMetricValue(conf, ctx[conf.id])}</td>`)
        .join("");

    tbody.appendChild(tr);
  });
}


/***********************************************************
 * TABLE INIT — build skeleton + expose render function
 ***********************************************************/

function advInitTable(wrapper, jsonUrl) {
  if (!wrapper) return;
  const card = wrapper.closest(".card-block-wrap");

  fetch(jsonUrl)
    .then(res => res.json())
    .then(json => {
      const channels = json.channels || [];
      if (!channels.length) return;

      const metricsConfig = advGetBaseMetricsConfig(json);

      /* -----------------------------------------------------
         Build table skeleton
      ----------------------------------------------------- */
      const table =
        wrapper.querySelector(".adv-channel-table") ||
        (function () {
          const t = document.createElement("table");
          t.className = "adv-channel-table";
          wrapper.appendChild(t);
          return t;
        })();

      table.innerHTML = "";

      const thead = document.createElement("thead");
      const hr = document.createElement("tr");

      hr.innerHTML =
        `<th></th><th>Channel</th>` +
        metricsConfig.map(m => `<th>${m.label}</th>`).join("");

      thead.appendChild(hr);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");
      table.appendChild(tbody);

      /* -----------------------------------------------------
         Determine defaults
      ----------------------------------------------------- */
      const firstChannelId = channels[0].id;
      const firstCompany = channels[0].companies[0];
      const firstCompanyId = firstCompany.id;

      const dates = json.dates || [];
      const end = new Date(dates[dates.length - 1]);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);

      const defaultIndexes = dates
        .map((d, i) => {
          const dd = new Date(d);
          return dd >= start && dd <= end ? i : -1;
        })
        .filter(i => i >= 0);

      // Save default company for controller
      card._advSelectedCompanyId = firstCompanyId;

      /* -----------------------------------------------------
         Table render function exposed to the chart controller
      ----------------------------------------------------- */

      card._advRenderTable = function (
        companyId,
        dateIndexes,
        selectedChannelId
      ) {
        advRenderChannelTable(
          json,
          tbody,
          selectedChannelId || firstChannelId,
          dateIndexes || defaultIndexes,
          companyId || firstCompanyId
        );
      };

      /* -----------------------------------------------------
         Initial table render
      ----------------------------------------------------- */
      card._advRenderTable(firstCompanyId, defaultIndexes, firstChannelId);

      /* -----------------------------------------------------
         Checkbox → update chart channel
      ----------------------------------------------------- */
      tbody.addEventListener("change", function (e) {
        const cb = e.target.closest(".adv-channel-checkbox");
        if (!cb) return;

        const channelId = cb.dataset.advChannel;

        // Always enforce single-select
        tbody.querySelectorAll(".adv-channel-checkbox").forEach(x => {
          x.checked = x === cb;
        });

        const ctrl = card._advController;
        if (ctrl && typeof ctrl.setChannels === "function") {
          ctrl.setChannels([channelId]);
        }
      });
    })
    .catch(err => console.error("[ADV] init table error:", err));
}

window.advInitTable = advInitTable;

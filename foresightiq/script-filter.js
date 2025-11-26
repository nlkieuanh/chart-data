/***********************************************************
 * ADV DASHBOARD — FULL V4
 * - Stable state handling
 * - Platform switching without resetting filters
 * - Correct Webflow tab mapping
 * - Safe data resilience
 ***********************************************************/

/* 1---------- Helpers ---------- */

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
  if (!indexes?.length)
    return arr.reduce((acc, v) => acc + (Number(v) || 0), 0);

  return indexes.reduce((acc, idx) => acc + (Number(arr[idx]) || 0), 0);
}

/* ---------- Base Metrics Extraction ---------- */
function advGetBaseMetricsConfig(json) {
  if (!json || typeof json !== "object") return [];

  let base = [];
  if (Array.isArray(json.baseMetrics) && json.baseMetrics.length) {
    base = json.baseMetrics.slice();
  } else {
    const channels = json.channels || [];
    if (
      channels.length &&
      channels[0].companies &&
      channels[0].companies[0]
    ) {
      const comp = channels[0].companies[0];
      base = Object.keys(comp).filter(key => Array.isArray(comp[key]));
    }
  }

  const labelsMap = json.meta?.metricLabels || {};

  return base.map(metricId => {
    const id = String(metricId);
    const lower = id.toLowerCase();
    let format = "number";

    if (lower.includes("rate") || lower.includes("roas") || lower === "cvr")
      format = "percent";
    else if (
      lower.includes("revenue") ||
      lower.includes("rev") ||
      lower.includes("spend") ||
      lower.includes("cpo") ||
      lower.includes("cac")
    )
      format = "decimal";
    else format = "int";

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
  if (!conf?.format) return v.toFixed(2);

  if (conf.format === "percent") return v.toFixed(2) + "%";
  if (conf.format === "int") return Math.round(v).toLocaleString();

  return v.toFixed(2);
}

/* ---------- JSON Loader ---------- */
async function advLoadNewJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("JSON fetch failed " + url);
  return await res.json();
}

/* ---------- Date Range Filter ---------- */
function advFilterDateRange(dates, start, end) {
  if (!Array.isArray(dates)) return [];

  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;

  if (!s || !e) return dates.map((_, i) => i);

  return dates.reduce((acc, d, i) => {
    const dd = new Date(d);
    if (dd >= s && dd <= e) acc.push(i);
    return acc;
  }, []);
}

/* ---------- Extract Metric Series ---------- */
function advGetMetricSeries(json, channelId, companyId, metric, idxs) {
  const ch = (json.channels || []).find(c => c.id === channelId);
  if (!ch) return [];

  const comp = (ch.companies || []).find(c => c.id === companyId);
  if (!comp) return [];

  const full = comp[metric] || [];
  if (!Array.isArray(full)) return [];

  if (!idxs?.length) return full;
  return idxs.map(i => full[i]);
}

/* ---------- Consolidation ---------- */
function advConsolidateChannels(list) {
  if (!list.length) return [];
  const len = list[0].length;
  const res = new Array(len).fill(0);
  list.forEach(arr => arr.forEach((v, i) => (res[i] += v)));
  return res;
}

function advToPercent(values, total) {
  return values.map((v, i) => {
    const t = total[i] || 0;
    return t === 0 ? 0 : (v / t) * 100;
  });
}
/* 2============================================================
   BUILD CHART PAYLOAD
============================================================ */
function advBuildChartPayload(options) {
  const { json, channelIds, dateIndexes, metric, mode, valueType } = options;

  const dates = json.dates || [];
  const periods = dateIndexes.map(i => dates[i]);

  const seriesMap = {};

  if (mode === "direct") {
    const first = channelIds[0];
    const ch = (json.channels || []).find(c => c.id === first);

    if (ch) {
      (ch.companies || []).forEach(comp => {
        const vals = advGetMetricSeries(json, first, comp.id, metric, dateIndexes);
        seriesMap[comp.id] = {
          name: comp.name,
          color: comp.color,
          values: vals
        };
      });
    }
  } else {
    (json.channels || []).forEach(ch => {
      if (!channelIds.includes(ch.id)) return;

      (ch.companies || []).forEach(comp => {
        const vals = advGetMetricSeries(json, ch.id, comp.id, metric, dateIndexes);
        if (!vals.length) return;

        if (!seriesMap[comp.id]) {
          seriesMap[comp.id] = {
            name: comp.name,
            color: comp.color,
            values: vals.slice()
          };
        } else {
          const merged = seriesMap[comp.id].values;
          vals.forEach((v, i) => (merged[i] = (merged[i] || 0) + (v || 0)));
        }
      });
    });
  }

  let seriesList = Object.values(seriesMap);

  if (valueType === "percent" && seriesList.length) {
    const len = seriesList[0].values.length;
    const total = new Array(len).fill(0);

    seriesList.forEach(s => s.values.forEach((v, i) => (total[i] += v || 0)));

    seriesList = seriesList.map(s => ({
      name: s.name,
      color: s.color,
      values: advToPercent(s.values, total)
    }));
  }

  const yourCompany =
    seriesList.find(s => s.name === "Your Company") ||
    seriesList[0] ||
    { name: "", color: "#3366cc", values: [] };

  const competitors = seriesList.filter(s => s !== yourCompany);

  return {
    periods,
    chartType: "line",
    yourCompany,
    competitors
  };
}

/* ============================================================
   RENDER CHART
============================================================ */
function advRenderLineChart(canvas, payload, valueType) {
  if (!window.Chart) return;

  const ctx = canvas.getContext("2d");

  if (canvas._advChartInstance) canvas._advChartInstance.destroy();

  const datasets = [];

  if (payload.yourCompany?.values?.length) {
    datasets.push({
      label: payload.yourCompany.name,
      data: payload.yourCompany.values,
      borderColor: payload.yourCompany.color,
      backgroundColor: advHexToRgba(payload.yourCompany.color, 0.15),
      borderWidth: 2,
      tension: 0.3,
      pointRadius: 0,
      fill: true
    });
  }

  (payload.competitors || []).forEach(c => {
    datasets.push({
      label: c.name,
      data: c.values,
      borderColor: c.color,
      backgroundColor: advHexToRgba(c.color, 0.1),
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
            callback: v => (valueType === "percent" ? v + "%" : v)
          }
        }
      }
    }
  });
}

/* ============================================================
   COMPANY & METRIC DROPDOWN INIT
============================================================ */
function advInitCompanyDropdown(scopeEl, companies) {
  if (!Array.isArray(companies) || !companies.length) return;

  scopeEl.querySelectorAll(".company-dd-link-select").forEach(wrapper => {
    const scriptHolder = wrapper.querySelector(".company-select-script");
    const list = scriptHolder ? scriptHolder.parentElement : wrapper;

    [...list.children].forEach(ch => {
      if (ch !== scriptHolder) list.removeChild(ch);
    });

    companies.forEach(comp => {
      const item = document.createElement("div");
      item.className = "filter-dropdown-item";
      item.dataset.dropdown = comp.id;

      const txt = document.createElement("div");
      txt.className = "dropdown-item-text";
      txt.textContent = comp.name;

      item.appendChild(txt);
      list.appendChild(item);
    });

    const label = wrapper.querySelector(".company-dd-selected");
    if (label) label.textContent = companies[0].name;
  });
}

function advApplyCompanySelection(item) {
  const wrapper = item.closest(".company-dd-link-select");
  if (!wrapper) return;

  const company = item.dataset.dropdown;
  const textEl = item.querySelector(".dropdown-item-text");
  const name = textEl?.textContent.trim() || "";

  const label = wrapper.querySelector(".company-dd-selected");
  if (label) label.textContent = name;

  const tab = item.closest(".w-tab-pane") || item.closest(".card-block-wrap");
  const chartWrapper = tab.querySelector(".chart-canvas");
  const ctrl = chartWrapper?._advController;

  if (ctrl) ctrl.setCompany(company);
}

function advInitMetricDropdown(scopeEl, metrics, labelsMap) {
  if (!metrics?.length) return;

  scopeEl.querySelectorAll(".chart-metric-dd-select").forEach(wrapper => {
    const scriptHolder = wrapper.querySelector(".chart-metric-select-script");
    const list = scriptHolder ? scriptHolder.parentElement : wrapper;

    [...list.children].forEach(ch => {
      if (ch !== scriptHolder) list.removeChild(ch);
    });

    metrics.forEach(mid => {
      const item = document.createElement("div");
      item.className = "filter-dropdown-item";
      item.dataset.dropdown = mid;

      const txt = document.createElement("div");
      txt.className = "dropdown-item-text";
      txt.textContent = labelsMap[mid] || mid;

      item.appendChild(txt);
      list.appendChild(item);
    });

    const label = wrapper.querySelector(".chart-metric-dd-selected");
    if (label) label.textContent = labelsMap[metrics[0]] || metrics[0];
  });
}

function advApplyMetricSelection(item) {
  const wrapper = item.closest(".chart-metric-dd-select");
  if (!wrapper) return;

  const mid = item.dataset.dropdown;
  const name = item.querySelector(".dropdown-item-text")?.textContent.trim();

  const label = wrapper.querySelector(".chart-metric-dd-selected");
  if (label) label.textContent = name;

  const tab = item.closest(".w-tab-pane") || item.closest(".card-block-wrap");
  const chartWrapper = tab.querySelector(".chart-canvas");
  const ctrl = chartWrapper?._advController;

  if (ctrl) ctrl.setMetric(mid);
}

/* CLICK HANDLERS for metric/company */
document.addEventListener("click", ev => {
  const compItem = ev.target.closest(".company-dd-link-select [data-dropdown]");
  if (compItem) {
    advApplyCompanySelection(compItem);
    const dd = compItem.closest(".dropdown,.w-dropdown");
    if (dd && window.$) $(dd).triggerHandler("w-close.w-dropdown");
    return;
  }

  const metricItem = ev.target.closest(".chart-metric-dd-select [data-dropdown]");
  if (metricItem) {
    advApplyMetricSelection(metricItem);
    const dd = metricItem.closest(".dropdown,.w-dropdown");
    if (dd && window.$) $(dd).triggerHandler("w-close.w-dropdown");
  }
});
/* ============================================================
   11. DYNAMIC CHANNEL TABLE PER TAB — FULL V4
   ============================================================ */
(function () {

  function advInitTable(wrapper, jsonUrl) {
    if (!wrapper || !jsonUrl) return;

    const card = wrapper.closest(".card-block-wrap") || document;

    fetch(jsonUrl)
      .then(res => res.json())
      .then(json => {
        const channels = json.channels || [];
        if (!channels.length) {
          console.warn("[ADV] No channels in JSON:", jsonUrl);
          return;
        }

        const metricsConfig = advGetBaseMetricsConfig(json);
        if (!metricsConfig.length) {
          console.warn("[ADV] No base metrics in JSON:", jsonUrl);
          return;
        }

        const tableWrapper =
          wrapper.querySelector(".adv-channel-table-wrapper") ||
          wrapper;

        let table =
          tableWrapper.querySelector(".adv-channel-table") ||
          (function () {
            const t = document.createElement("table");
            t.className = "adv-channel-table";
            tableWrapper.appendChild(t);
            return t;
          })();

        table.innerHTML = "";

        /* ----- Build header ----- */
        const thead = document.createElement("thead");
        const headRow = document.createElement("tr");

        const thEmpty = document.createElement("th");
        headRow.appendChild(thEmpty);

        const dim = json.meta?.dimensionLabel || "Category";

        const thName = document.createElement("th");
        thName.textContent = dim;
        headRow.appendChild(thName);

        metricsConfig.forEach(conf => {
          const th = document.createElement("th");
          th.textContent = conf.label;
          headRow.appendChild(th);
        });

        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        table.appendChild(tbody);

        /* ----- Default Date Range = last 7 days (ONLY FIRST INIT) ----- */
        const dates = json.dates || [];
        const end = new Date(dates[dates.length - 1]);
        const start = new Date(end);
        start.setDate(start.getDate() - 6);

        const defaultIndexes = dates.reduce((acc, d, i) => {
          const dd = new Date(d);
          if (dd >= start && dd <= end) acc.push(i);
          return acc;
        }, []);

        let currentSelectedChannels = [];

        /* ============================================================
           BUILD ROWS (used by chart controllers)
        ============================================================ */
        function buildRows(companyId, customIndexes, selectedChannels) {
          const dateIndexes =
            Array.isArray(customIndexes) && customIndexes.length
              ? customIndexes
              : defaultIndexes;

          currentSelectedChannels = Array.isArray(selectedChannels)
            ? selectedChannels.slice()
            : [];

          tbody.innerHTML = "";
          const newlyCheckedIds = [];

          channels.forEach((channel, index) => {
            const companies = channel.companies || [];
            const company =
              companies.find(c => c.id === companyId) || companies[0];
            if (!company) return;

            const ctx = {};
            metricsConfig.forEach(conf => {
              const arr = company[conf.key];
              ctx[conf.id] = advSumSubset(arr, dateIndexes);
            });

            let isChecked =
              currentSelectedChannels.indexOf(channel.id) !== -1;

            if (currentSelectedChannels.length === 0 && index === 0)
              isChecked = true;

            if (isChecked && !newlyCheckedIds.includes(channel.id))
              newlyCheckedIds.push(channel.id);

            const tr = document.createElement("tr");

            let html =
              `<td><input type="checkbox" class="adv-channel-checkbox" 
                data-adv-channel="${channel.id}" ${isChecked ? "checked" : ""}></td>`;

            html += `<td>${channel.label || channel.id}</td>`;

            metricsConfig.forEach(conf => {
              const val = ctx[conf.id] || 0;
              html += `<td>${advFormatMetricValue(conf, val)}</td>`;
            });

            tr.innerHTML = html;
            tbody.appendChild(tr);
          });

          /* Sync with chart */
          const chartWrapper =
            wrapper.closest(".tab-content-flex")
              ? wrapper.closest(".tab-content-flex").querySelector(".chart-canvas")
              : (wrapper.closest(".w-tab-pane") ||
                  wrapper.closest(".card-block-wrap"))
                .querySelector(".chart-canvas");

          const ctrl = chartWrapper?._advController;
          if (ctrl && newlyCheckedIds.length) ctrl.setChannels(newlyCheckedIds);
        }

        wrapper._advRebuildTable = buildRows;

        /* ----- First time: build with default values ----- */
        const selectedCompanyId =
          channels[0].companies?.[0]?.id || "your-company";

        const initialChannelId = channels[0] ? [channels[0].id] : [];

        buildRows(selectedCompanyId, defaultIndexes, initialChannelId);
      })
      .catch(err => console.error("[ADV] Init table failed:", err));
  }

  window.advInitTable = advInitTable;
})();


/* 3============================================================
   10. DATE RANGE DROPDOWN (FLATPICKR) — FULL V4
   ============================================================ */

(function () {
  /* ---------- Get Date Bounds from Card State ---------- */
  function getBoundsOrFallback(wrapper) {
    const card = wrapper.closest(".card-block-wrap");
    const bounds = card && card._advDateBounds;

    if (bounds?.min && bounds?.max) {
      return {
        min: new Date(bounds.min),
        max: new Date(bounds.max)
      };
    }

    const now = new Date();
    return {
      min: new Date(now.getFullYear(), now.getMonth(), 1),
      max: now
    };
  }

  /* ---------- Get All Chart Controllers of This Card ---------- */
  function getControllers(wrapper) {
    const card = wrapper.closest(".card-block-wrap");
    if (!card) return [];
    return (card._advTabControllers || [])
      .map(w => w._advController)
      .filter(Boolean);
  }

  /* ---------- Apply Pre-defined Date Range Dropdown ---------- */
  function applyDateRangeSelection(item) {
    if (!item) return;

    const wrapper = item.closest(".date-range-dd-select");
    if (!wrapper) return;

    const ddValue = item.dataset.dropdown;
    const textEl = item.querySelector(".dropdown-item-text");
    const labelEl = wrapper.querySelector(".date-range-dd-selected");

    if (labelEl && textEl) {
      labelEl.textContent = textEl.textContent.trim();
    }

    const ctrls = getControllers(wrapper);
    const bounds = getBoundsOrFallback(wrapper);

    if (!ctrls.length) return;

    if (ddValue === "default") {
      // default = last 7 days
      const end = new Date(bounds.max);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);

      const s = advToISODate(start);
      const e = advToISODate(end);

      ctrls.forEach(c => c.setDateRange(s, e));
      return;
    }

    if (ddValue === "lastMonth") {
      const end = new Date(bounds.max);
      const start = new Date(end);
      start.setDate(start.getDate() - 29);

      const s = advToISODate(start);
      const e = advToISODate(end);

      ctrls.forEach(c => c.setDateRange(s, e));
      return;
    }
  }

  /* ---------- Handle Flatpickr Manual User Input ---------- */
  function onFlatpickrChange(selected, dateStr, fp) {
    const input = fp.input;
    const wrapper = input.closest(".date-range-dd-select");
    if (!wrapper) return;

    const labelEl = wrapper.querySelector(".date-range-dd-selected");
    const ctrls = getControllers(wrapper);
    if (!labelEl || !ctrls.length) return;

    if (!selected || selected.length === 0) return;

    const fmt = { day: "2-digit", month: "short", year: "numeric" };

    if (selected.length === 1) {
      const t1 = selected[0].toLocaleDateString(undefined, fmt);
      labelEl.textContent = t1 + " …";
      return;
    }

    const start = selected[0];
    const end = selected[1];

    const t1 = start.toLocaleDateString(undefined, fmt);
    const t2 = end.toLocaleDateString(undefined, fmt);

    labelEl.textContent = `${t1} – ${t2}`;

    const sISO = advToISODate(start);
    const eISO = advToISODate(end);

    ctrls.forEach(c => c.setDateRange(sISO, eISO));
  }

  /* ---------- INIT UI ON PAGE LOAD ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".date-range-dd-select").forEach(wrapper => {
      const defItem =
        wrapper.querySelector('[data-dropdown="default"]') ||
        wrapper.querySelector("[data-dropdown]");

      const labelEl = wrapper.querySelector(".date-range-dd-selected");

      if (defItem && labelEl) {
        const txt = defItem.querySelector(".dropdown-item-text");
        if (txt) labelEl.textContent = txt.textContent.trim();
      }

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

  /* ---------- CLICK HANDLER FOR PRESET ITEMS ---------- */
  document.addEventListener("click", function (ev) {
    const item = ev.target.closest(".date-range-dd-select [data-dropdown]");
    if (!item) return;

    if (item.tagName === "INPUT" || item.tagName === "TEXTAREA") return;

    applyDateRangeSelection(item);

    const dd = item.closest(".dropdown,.w-dropdown");
    if (dd && window.$) $(dd).triggerHandler("w-close.w-dropdown");
  });
})();
/* 4 ============================================================
   9. INIT CHART (PER TAB WRAPPER) — FULL V4 WITH STATE
   ============================================================ */

function advInitChart(wrapper, jsonUrl) {
  const canvas = wrapper.querySelector("canvas");
  if (!canvas) {
    console.error("[ADV] Canvas not found");
    return;
  }

  const card = wrapper.closest(".card-block-wrap") || document;

  // Register this wrapper as one chart-controller source
  if (!card._advTabControllers) card._advTabControllers = [];
  if (!card._advTabControllers.includes(wrapper)) {
    card._advTabControllers.push(wrapper);
  }

  // Find table wrapper belonging to the same tab
  const tableRender =
    wrapper.closest(".tab-content-flex")
      ? wrapper.closest(".tab-content-flex").querySelector(".table-render")
      : (wrapper.closest(".w-tab-pane") ||
          wrapper.closest(".card-block-wrap")
        ).querySelector(".table-render");

  let jsonData = null;

  // Dynamic states inside chart instance
  let selectedChannels = [];
  let metric = "netRevenue";
  let valueType = "absolute";
  let mode = "direct";
  let currentCompanyId = null;

  // Global state (first load only)
  let startDate = null;
  let endDate = null;

  /* ----- Date Range Default Calculation ----- */
  function getDefaultDateRange(dates) {
    const endObj = new Date(dates[dates.length - 1]);
    const startObj = new Date(endObj);
    startObj.setDate(startObj.getDate() - 6); // last 7 days
    return {
      start: advToISODate(startObj),
      end: advToISODate(endObj)
    };
  }

  /* ---------- JSON LOAD ---------- */
  advLoadNewJSON(jsonUrl)
    .then(json => {
      jsonData = json;

      const allDates = jsonData.dates || [];
      const channels = jsonData.channels || [];

      if (!allDates.length || !channels.length) {
        console.error("[ADV] Missing dates or channels");
        return;
      }

      /* ============================================================
         LOAD DATE RANGE FROM STATE IF AVAILABLE
         OTHERWISE FIRST-LOAD → DEFAULT LAST 7 DAYS
         ============================================================ */
      if (
        card._advState?.startDate &&
        card._advState?.endDate
      ) {
        startDate = card._advState.startDate;
        endDate = card._advState.endDate;
      } else {
        const def = getDefaultDateRange(allDates);
        startDate = def.start;
        endDate = def.end;
      }

      /* Save min/max bounds so date-range dropdown knows range */
      card._advDateBounds = {
        min: allDates[0],
        max: allDates[allDates.length - 1]
      };

      /* ---------- Company dropdown init ---------- */
      const firstChannel = channels[0];
      if (firstChannel?.companies?.length) {
        const companies = firstChannel.companies.map(c => ({
          id: c.id,
          name: c.name
        }));

        advInitCompanyDropdown(
          wrapper.closest(".w-tab-pane") ||
            wrapper.closest(".tab-content-flex") ||
            card,
          companies
        );

        // Restore company from state if available
        if (card._advState?.company) {
          currentCompanyId = card._advState.company;
        } else {
          currentCompanyId = companies[0].id;
        }
      }

      /* ---------- Metric dropdown init ---------- */
      let metricList = [];
      if (jsonData.baseMetrics?.length) {
        metricList = jsonData.baseMetrics.slice();
      } else if (firstChannel?.companies?.length) {
        metricList = Object.keys(firstChannel.companies[0])
          .filter(k => Array.isArray(firstChannel.companies[0][k]));
      }

      const metricLabels = jsonData.meta?.metricLabels || {};

      advInitMetricDropdown(
        wrapper.closest(".w-tab-pane") ||
          wrapper.closest(".tab-content-flex") ||
          card,
        metricList,
        metricLabels
      );

      // Restore metric if state exists
      if (card._advState?.metric && metricList.includes(card._advState.metric)) {
        metric = card._advState.metric;
      } else {
        metric = metricList[0] || "netRevenue";
      }

      /* ---------- Restore channels if saved ---------- */
      if (card._advState?.channels?.length) {
        selectedChannels = card._advState.channels.slice();
      } else {
        selectedChannels = [channels[0].id];
      }

      /* ---------- Render everything with restored state ---------- */
      renderChartAndTable(true);

      /* ---------- Table Checkboxes ---------- */
      connectTableCheckbox();

      /* ---------- Switches (mode/valueType) ---------- */
      connectModeSwitch();
    })
    .catch(err => console.error("[ADV] JSON load error", err));

  /* ============================================================
       CONTROLLER EXPOSED TO OUTSIDE
   ============================================================ */
  const controller = {
    setDateRange(start, end) {
      startDate = start;
      endDate = end;

      // Save to global state
      if (card._advState) {
        card._advState.startDate = start;
        card._advState.endDate = end;
      }

      if (!jsonData) return;

      const allDates = jsonData.dates || [];
      const idxs = advFilterDateRange(allDates, startDate, endDate);

      renderChart(idxs);

      if (tableRender?._advRebuildTable) {
        tableRender._advRebuildTable(currentCompanyId, idxs, selectedChannels);
      }
    },

    setChannels(ch) {
      if (Array.isArray(ch) && ch.length) {
        selectedChannels = ch.slice();
      }

      if (card._advState) {
        card._advState.channels = selectedChannels.slice();
      }

      renderChartAndTable();
    },

    setCompany(cid) {
      currentCompanyId = cid;

      if (card._advState) {
        card._advState.company = cid;
      }

      if (!jsonData) return;

      const allDates = jsonData.dates || [];
      const idxs = advFilterDateRange(allDates, startDate, endDate);

      if (tableRender?._advRebuildTable) {
        tableRender._advRebuildTable(cid, idxs, selectedChannels);
      }
    },

    setMetric(mid) {
      metric = mid;

      if (card._advState) {
        card._advState.metric = mid;
      }

      renderChartAndTable();
    },

    // State reflection (used by platform restore)
    get _advStartDate() {
      return startDate;
    },
    get _advEndDate() {
      return endDate;
    },
    get _advMetric() {
      return metric;
    },
    get _advCompany() {
      return currentCompanyId;
    },
    get _advChannels() {
      return selectedChannels;
    }
  };

  wrapper._advController = controller;

  /* ============================================================
       INTERNAL RENDER FUNCTIONS
   ============================================================ */

  function renderChart(dateIndexes) {
    if (!jsonData) return;

    if (!dateIndexes?.length) {
      const all = jsonData.dates || [];
      dateIndexes = all.map((_, i) => i);
    }

    const payload = advBuildChartPayload({
      json: jsonData,
      channelIds: selectedChannels,
      dateIndexes,
      metric,
      mode,
      valueType
    });

    advRenderLineChart(canvas, payload, valueType);
  }

  function renderChartAndTable(rebuildTable) {
    if (!jsonData) return;

    const allDates = jsonData.dates || [];
    const idxs = advFilterDateRange(allDates, startDate, endDate);

    renderChart(idxs);

    if (rebuildTable && tableRender?._advRebuildTable) {
      tableRender._advRebuildTable(currentCompanyId, idxs, selectedChannels);
    }
  }

  /* ============================================================
       TABLE CHECKBOX (SELECT CHANNEL)
   ============================================================ */
  function connectTableCheckbox() {
    if (!tableRender || tableRender._advCheckboxBound) return;

    tableRender._advCheckboxBound = true;

    tableRender.addEventListener("change", ev => {
      const cb = ev.target.closest(".adv-channel-checkbox");
      if (!cb || !tableRender.contains(cb)) return;

      const tbody = cb.closest("tbody");
      if (!tbody) return;

      const channelId = cb.dataset.advChannel;
      if (!channelId) return;

      const boxes = [...tbody.querySelectorAll(".adv-channel-checkbox")];

      if (cb.checked) {
        boxes.forEach(b => (b.checked = b === cb));
        selectedChannels = [channelId];
      } else {
        const checked = boxes.filter(b => b.checked);
        if (checked.length) {
          selectedChannels = [checked[0].dataset.advChannel];
        } else if (boxes[0]) {
          boxes[0].checked = true;
          selectedChannels = [boxes[0].dataset.advChannel];
        }
      }

      if (card._advState) {
        card._advState.channels = selectedChannels.slice();
      }

      renderChartAndTable();
    });
  }

  /* ============================================================
       MODE SWITCH (DIRECT / CONSOLIDATE)
       VALUE TYPE (ABSOLUTE / %)
   ============================================================ */
  function connectModeSwitch() {
    const modeWrap = wrapper.querySelector(".chart-switch-mode-btn");
    const valueWrap = wrapper.querySelector(".chart-switch-value-btn");

    if (modeWrap) {
      const btnDirect = modeWrap.querySelector(".btn-direct");
      const btnConsolidate = modeWrap.querySelector(".btn-consolidate");

      if (btnDirect)
        btnDirect.addEventListener("click", () => {
          mode = "direct";
          btnDirect.classList.add("is-active");
          btnConsolidate?.classList.remove("is-active");
          renderChartAndTable();
        });

      if (btnConsolidate)
        btnConsolidate.addEventListener("click", () => {
          mode = "consolidate";
          btnConsolidate.classList.add("is-active");
          btnDirect?.classList.remove("is-active");
          renderChartAndTable();
        });
    }

    if (valueWrap) {
      const btnAbs = valueWrap.querySelector(".btn-absolute");
      const btnPct = valueWrap.querySelector(".btn-percent");

      if (btnAbs)
        btnAbs.addEventListener("click", () => {
          valueType = "absolute";
          btnAbs.classList.add("is-active");
          btnPct?.classList.remove("is-active");
          renderChartAndTable();
        });

      if (btnPct)
        btnPct.addEventListener("click", () => {
          valueType = "percent";
          btnPct.classList.add("is-active");
          btnAbs?.classList.remove("is-active");
          renderChartAndTable();
        });
    }
  }
}
/* 5============================================================
   5. PLATFORM FILTER — FULL V4 (STATE-PRESERVED)
   ============================================================ */

/* ---------- Find Correct Tab Pane ---------- */
function advFindTabPane(card, tabName) {
  let pane = card.querySelector(`.w-tab-pane[data-w-tab="${tabName}"]`);
  if (pane) return pane;

  const links = [...card.querySelectorAll('.w-tab-link')];
  const panes = [...card.querySelectorAll('.w-tab-pane')];

  const match = links.find(l => l.getAttribute('data-w-tab') === tabName);
  if (match) {
    const index = links.indexOf(match);
    return panes[index] || null;
  }
  return null;
}

/* ---------- Get wrappers inside tab ---------- */
function advGetChartWrappers(tabPane) {
  if (!tabPane) return [];
  return [...tabPane.querySelectorAll(".chart-canvas, .tab-content-flex .chart-canvas")];
}

function advGetTableWrappers(tabPane) {
  if (!tabPane) return [];
  return [...tabPane.querySelectorAll(".table-render, .tab-content-flex .table-render")];
}

/* ============================================================
   APPLY PLATFORM TO CARD (LOAD NEW JSON)
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

  const pf = config.platforms?.[platform];
  if (!pf) {
    console.error("[ADV] Platform not found:", platform);
    return;
  }

  const competitorsUrl = pf.competitors;
  const bicUrl = pf.bic;

  if (!competitorsUrl || !bicUrl) {
    console.error("[ADV] Missing competitors/bic JSON for platform:", platform);
    return;
  }

  /* --- Find correct tab panes --- */
  const competitorsTab = advFindTabPane(card, "competitors");
  const bicTab = advFindTabPane(card, "best-in-class");

  /* --- Init charts --- */
  advGetChartWrappers(competitorsTab).forEach(w => advInitChart(w, competitorsUrl));
  advGetChartWrappers(bicTab).forEach(w => advInitChart(w, bicUrl));

  /* --- Init tables --- */
  advGetTableWrappers(competitorsTab).forEach(w => advInitTable(w, competitorsUrl));
  advGetTableWrappers(bicTab).forEach(w => advInitTable(w, bicUrl));
}

/* ============================================================
   AUTO-INIT PLATFORM FOR ALL CARDS
   ============================================================ */
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".card-block-wrap").forEach(card => {

    /* ---- Create state store if not exist ---- */
    if (!card._advState) {
      card._advState = {
        startDate: null,
        endDate: null,
        metric: null,
        company: null,
        channels: null
      };
    }

    const configEl = card.querySelector(".adv-config");
    if (!configEl) return;

    let config = {};
    try {
      config = JSON.parse(configEl.textContent.trim());
    } catch (err) {
      console.error("[ADV] adv-config parse error:", err);
      return;
    }

    const platformDD = card.querySelector(".platform-dd-select");

    /* ============================================================
       DETECT DEFAULT PLATFORM FROM data-dropdown="default"
    ============================================================ */
    let defaultPlatform = null;
    const defaultItem =
      platformDD?.querySelector('[data-dropdown="default"]') || null;

    if (defaultItem) {
      defaultPlatform = "facebook"; // Your desired default
    } else {
      defaultPlatform = Object.keys(config.platforms || {})[0];
    }

    if (!defaultPlatform) {
      console.error("[ADV] No platform found in config");
      return;
    }

    /* ============================================================
       1) FIRST LOAD — APPLY PLATFORM ONCE
    ============================================================ */
    advApplyPlatformToBlock(card, defaultPlatform);

    /* Set UI label */
    if (platformDD && defaultItem) {
      const label = platformDD.querySelector(".platform-dd-selected");
      const txt = defaultItem.querySelector(".dropdown-item-text");
      if (label && txt) label.textContent = txt.textContent.trim();
    }

    /* ============================================================
       PLATFORM CLICK HANDLER — WITH FULL STATE CAPTURE/RESTORE
    ============================================================ */
    if (platformDD) {
      platformDD.addEventListener("click", function (ev) {
        const item = ev.target.closest("[data-dropdown]");
        if (!item) return;

        let ddValue = item.getAttribute("data-dropdown");
        let platformToLoad = ddValue === "default" ? "facebook" : ddValue;

        /* --------------------------------------------------------
           1) CAPTURE CURRENT STATE BEFORE PLATFORM SWITCH
        -------------------------------------------------------- */
        const state = card._advState;
        const ctrls = (card._advTabControllers || [])
          .map(w => w._advController)
          .filter(Boolean);

        if (ctrls.length) {
          const c = ctrls[0];
          state.startDate = c._advStartDate || null;
          state.endDate = c._advEndDate || null;
          state.metric = c._advMetric || null;
          state.company = c._advCompany || null;
          state.channels = c._advChannels || null;
        }

        /* --------------------------------------------------------
           Update UI label
        -------------------------------------------------------- */
        const label = platformDD.querySelector(".platform-dd-selected");
        const txt = item.querySelector(".dropdown-item-text");
        if (label && txt) label.textContent = txt.textContent.trim();

        /* --------------------------------------------------------
           2) APPLY PLATFORM (LOAD NEW JSON)
        -------------------------------------------------------- */
        advApplyPlatformToBlock(card, platformToLoad);

        /* --------------------------------------------------------
           3) RESTORE STATE AFTER PLATFORM SWITCH
        -------------------------------------------------------- */
        setTimeout(() => {
          const st = card._advState;

          const controllers = (card._advTabControllers || [])
            .map(w => w._advController)
            .filter(Boolean);

          controllers.forEach(ctrl => {
            if (!ctrl) return;

            if (st.metric) ctrl.setMetric(st.metric);
            if (st.company) ctrl.setCompany(st.company);
            if (st.channels?.length) ctrl.setChannels(st.channels);
            if (st.startDate && st.endDate)
              ctrl.setDateRange(st.startDate, st.endDate);
          });
        }, 80);

        /* Close WF dropdown */
        const dd = item.closest(".dropdown,.w-dropdown");
        if (dd && window.$) $(dd).triggerHandler("w-close.w-dropdown");
      });
    }
  });
});

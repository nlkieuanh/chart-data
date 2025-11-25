/***********************************************************
 * PART 1 — HELPERS + JSON LOADER (WITH PLATFORM SUPPORT)
 ***********************************************************/

/* ---------- Helpers ---------- */

function advToISODate(d) {
  if (!(d instanceof Date)) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function advHexToRgba(hex, alpha) {
  if (!hex || hex[0] !== "#" || hex.length < 7) return "rgba(0,0,0," + alpha + ")";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
}

function advSumSubset(arr, indexes) {
  if (!Array.isArray(arr)) return 0;
  if (!indexes || !indexes.length) {
    return arr.reduce((acc, v) => acc + (Number(v) || 0), 0);
  }
  return indexes.reduce((acc, idx) => acc + (Number(arr[idx]) || 0), 0);
}

/* ---------- Base Metric Config ---------- */

function advGetBaseMetricsConfig(json) {
  if (!json || typeof json !== "object") return [];

  let baseMetrics = [];
  if (Array.isArray(json.baseMetrics)) {
    baseMetrics = json.baseMetrics.slice();
  } else {
    const channels = json.channels || [];
    if (channels.length && channels[0].companies && channels[0].companies[0]) {
      const c0 = channels[0].companies[0];
      baseMetrics = Object.keys(c0).filter(k => Array.isArray(c0[k]));
    }
  }

  const labelsMap = (json.meta && json.meta.metricLabels) || {};

  return baseMetrics.map(id => {
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

    return { id, key: id, label: labelsMap[id] || id, format };
  });
}

function advFormatMetricValue(conf, value) {
  const v = Number(value) || 0;
  if (!conf || !conf.format) return v.toFixed(2);
  if (conf.format === "percent") return v.toFixed(2) + "%";
  if (conf.format === "int") return Math.round(v).toLocaleString();
  return v.toFixed(2);
}

/* ---------- JSON LOADER (fetch once) ---------- */

async function advLoadNewJSON(url) {
  const res = await fetch(url);
  if (!res.ok) {
    console.error("[ADV] JSON fetch failed:", res.status, res.statusText);
    throw new Error("JSON fetch failed");
  }
  return res.json();
}

/***********************************************************
 * END PART 1
 ***********************************************************/
/***********************************************************
 * PART 2 — CHART ENGINE (WITH PLATFORM SUPPORT)
 ***********************************************************/

function advFilterDateRange(dates, startDate, endDate) {
  if (!Array.isArray(dates)) return [];
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  if (!start || !end) return dates.map((_, i) => i);

  return dates.reduce((out, d, i) => {
    const dd = new Date(d);
    if (dd >= start && dd <= end) out.push(i);
    return out;
  }, []);
}

function advGetMetricSeries(json, channelId, companyId, metric, dateIndexes) {
  const channel = (json.channels || []).find(c => c.id === channelId);
  if (!channel) return [];

  const company = (channel.companies || []).find(c => c.id === companyId);
  if (!company) return [];

  const arr = company[metric] || [];
  if (!Array.isArray(arr)) return [];

  return dateIndexes.map(i => arr[i]);
}

function advConsolidateChannels(list) {
  if (!list.length) return [];
  const len = list[0].length;
  const out = new Array(len).fill(0);
  list.forEach(arr => {
    arr.forEach((v, i) => (out[i] += v || 0));
  });
  return out;
}

function advToPercent(values, total) {
  return values.map((v, i) => {
    const t = total[i] || 0;
    return t === 0 ? 0 : (v / t) * 100;
  });
}

function advBuildChartPayload(options) {
  const { json, channelIds, dateIndexes, metric, mode, valueType } = options;

  const periods = dateIndexes.map(i => (json.dates || [])[i]);
  const seriesMap = {};

  if (mode === "direct") {
    const ch = (json.channels || []).find(c => c.id === channelIds[0]);
    if (ch) {
      (ch.companies || []).forEach(c => {
        seriesMap[c.id] = {
          name: c.name,
          color: c.color,
          values: advGetMetricSeries(json, ch.id, c.id, metric, dateIndexes)
        };
      });
    }
  } else {
    (json.channels || []).forEach(ch => {
      if (!channelIds.includes(ch.id)) return;
      (ch.companies || []).forEach(c => {
        const arr = advGetMetricSeries(json, ch.id, c.id, metric, dateIndexes);
        if (!arr.length) return;
        if (!seriesMap[c.id]) {
          seriesMap[c.id] = { name: c.name, color: c.color, values: arr.slice() };
        } else {
          arr.forEach((v, i) => (seriesMap[c.id].values[i] += v || 0));
        }
      });
    });
  }

  let seriesList = Object.values(seriesMap);

  if (valueType === "percent" && seriesList.length) {
    const len = seriesList[0].values.length;
    const total = new Array(len).fill(0);
    seriesList.forEach(s => {
      s.values.forEach((v, i) => (total[i] += v || 0));
    });
    seriesList = seriesList.map(s => ({
      name: s.name,
      color: s.color,
      values: advToPercent(s.values, total)
    }));
  }

  const yc = seriesList.find(s => s.name === "Your Company") || seriesList[0] || null;
  const competitors = yc ? seriesList.filter(s => s !== yc) : seriesList;

  return {
    chartType: "line",
    periods,
    yourCompany: yc || { name: "", color: "#3366cc", values: [] },
    competitors
  };
}

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

  payload.competitors.forEach(c => {
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
    data: { labels: payload.periods, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: ctx => {
              const v = ctx.parsed.y;
              return valueType === "percent"
                ? `${ctx.dataset.label}: ${v.toFixed(1)}%`
                : `${ctx.dataset.label}: ${v.toLocaleString()}`;
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
 * END PART 2
 ***********************************************************/
/***********************************************************
 * PART 3 — COMPANY / METRIC / PLATFORM DROPDOWNS
 ***********************************************************/

/* ============================================================
   COMPANY DROPDOWN
   ============================================================ */

function advInitCompanyDropdown(scopeEl, companies) {
  if (!Array.isArray(companies) || !companies.length) return;

  scopeEl.querySelectorAll(".company-dd-link-select").forEach(wrapper => {
    const scriptHolder = wrapper.querySelector(".company-select-script");
    const listContainer = scriptHolder ? scriptHolder.parentElement : wrapper;

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

    const label = wrapper.querySelector(".company-dd-selected");
    if (label && companies[0]) label.textContent = companies[0].name;
  });
}

function advApplyCompanySelection(item) {
  if (!item) return;

  const wrapper = item.closest(".company-dd-link-select");
  if (!wrapper) return;

  const value = item.getAttribute("data-dropdown");
  const selectedText = (item.querySelector(".dropdown-item-text") || item).textContent.trim();

  const target = wrapper.querySelector(".company-dd-selected");
  if (target) target.textContent = selectedText;

  const tabSwitch = document.querySelector(`[data-w-tab="${value}"]`);
  if (tabSwitch) tabSwitch.click();

  const tabRoot =
    item.closest(".w-tab-pane") ||
    item.closest(".competitors-tab") ||
    item.closest(".best-in-class-tab") ||
    item.closest(".tab-content-flex") ||
    item.closest(".card-block-wrap");

  if (!tabRoot) return;

  const chartWrapper = tabRoot.querySelector(".chart-canvas");
  const ctrl = chartWrapper && chartWrapper._advController;

  if (ctrl && typeof ctrl.setCompany === "function") {
    ctrl.setCompany(value);
  }
}

/* ============================================================
   METRIC DROPDOWN
   ============================================================ */

function advInitMetricDropdown(scopeEl, metrics, labelsMap) {
  if (!Array.isArray(metrics) || !metrics.length) return;

  scopeEl.querySelectorAll(".chart-metric-dd-select").forEach(wrapper => {
    const scriptHolder = wrapper.querySelector(".chart-metric-select-script");
    const listContainer = scriptHolder ? scriptHolder.parentElement : wrapper;

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

    const label = wrapper.querySelector(".chart-metric-dd-selected");
    if (label && metrics[0]) {
      label.textContent = labelsMap[metrics[0]] || metrics[0];
    }
  });
}

function advApplyMetricSelection(item) {
  if (!item) return;

  const wrapper = item.closest(".chart-metric-dd-select");
  if (!wrapper) return;

  const value = item.getAttribute("data-dropdown");
  const selectedText = (item.querySelector(".dropdown-item-text") || item).textContent.trim();

  const target = wrapper.querySelector(".chart-metric-dd-selected");
  if (target) target.textContent = selectedText;

  const tabSwitch = document.querySelector(`[data-w-tab="${value}"]`);
  if (tabSwitch) tabSwitch.click();

  const tabRoot =
    item.closest(".w-tab-pane") ||
    item.closest(".competitors-tab") ||
    item.closest(".best-in-class-tab") ||
    item.closest(".tab-content-flex") ||
    item.closest(".card-block-wrap");

  if (!tabRoot) return;

  const chartWrapper = tabRoot.querySelector(".chart-canvas");
  const ctrl = chartWrapper && chartWrapper._advController;

  if (ctrl && typeof ctrl.setMetric === "function") {
    ctrl.setMetric(value);
  }
}

/* ============================================================
   PLATFORM DROPDOWN (NEW)
   ============================================================ */

function advInitPlatformDropdown(card, config, defaultPlatform) {
  const wrappers = card.querySelectorAll(".platform-dd-select");
  if (!wrappers.length) return;

  wrappers.forEach(wrapper => {
    const label = wrapper.querySelector(".platform-dd-selected");
    if (label) label.textContent = defaultPlatform;

    const items = wrapper.querySelectorAll("[data-dropdown]");
    items.forEach(i => i.classList.remove("is-active"));

    const activeItem = wrapper.querySelector(`[data-dropdown="${defaultPlatform}"]`);
    if (activeItem) activeItem.classList.add("is-active");
  });
}

function advApplyPlatformSelection(item) {
  const platform = item.getAttribute("data-dropdown");
  if (!platform) return;

  const card = item.closest(".card-block-wrap");
  if (!card) return;

  const configEl = card.querySelector(".adv-config");
  if (!configEl) {
    console.error("[ADV] Missing .adv-config in card-block-wrap");
    return;
  }

  let config = null;
  try {
    config = JSON.parse(configEl.textContent.trim());
  } catch (e) {
    console.error("[ADV] Invalid JSON in .adv-config");
    return;
  }

  const urls = config.platforms[platform];
  if (!urls) {
    console.error("[ADV] Platform not found:", platform);
    return;
  }

  const compsTab = card.querySelector('.w-tab-pane[data-w-tab="competitors"]');
  const bicTab   = card.querySelector('.w-tab-pane[data-w-tab="best-in-class"]');

  if (compsTab) loadPlatformToTab(compsTab, urls.competitors);
  if (bicTab)   loadPlatformToTab(bicTab, urls.bic);

  const label = item.closest(".platform-dd-select")?.querySelector(".platform-dd-selected");
  if (label) label.textContent = platform;

  function loadPlatformToTab(tabEl, jsonUrl) {
    const chartWrapper = tabEl.querySelector(".chart-canvas");
    const tableWrapper = tabEl.querySelector(".table-render");

    if (chartWrapper?._advInitSource !== jsonUrl) {
      chartWrapper?._advController?.reloadJSON(jsonUrl);
      chartWrapper._advInitSource = jsonUrl;
    }

    if (tableWrapper?._advInitSource !== jsonUrl) {
      window.advInitTable(tableWrapper, jsonUrl);
      tableWrapper._advInitSource = jsonUrl;
    }
  }
}

/* ============================================================
   CLICK HANDLER (COMPANY + METRIC + PLATFORM)
   ============================================================ */

document.addEventListener("click", function (event) {
  const companyItem = event.target.closest(".company-dd-link-select [data-dropdown]");
  if (companyItem) {
    advApplyCompanySelection(companyItem);
    const dd = companyItem.closest(".dropdown, .w-dropdown");
    if (dd && window.$) $(dd).triggerHandler("w-close.w-dropdown");
    return;
  }

  const metricItem = event.target.closest(".chart-metric-dd-select [data-dropdown]");
  if (metricItem) {
    advApplyMetricSelection(metricItem);
    const dd = metricItem.closest(".dropdown, .w-dropdown");
    if (dd && window.$) $(dd).triggerHandler("w-close.w-dropdown");
    return;
  }

  const platformItem = event.target.closest(".platform-dd-select [data-dropdown]");
  if (platformItem) {
    advApplyPlatformSelection(platformItem);
    const dd = platformItem.closest(".dropdown, .w-dropdown");
    if (dd && window.$) $(dd).triggerHandler("w-close.w-dropdown");
    return;
  }
});

/***********************************************************
 * END PART 3
 ***********************************************************/
/***********************************************************
 * PART 4 — CHART + TABLE INITIALIZER (WITH PLATFORM SUPPORT)
 ***********************************************************/

/* ============================================================
   advInitChart — per-tab chart controller
   ============================================================ */

function advInitChart(wrapper, jsonUrl) {
  const canvas = wrapper.querySelector("canvas");
  if (!canvas) {
    console.error("[ADV] Canvas not found inside wrapper.");
    return;
  }

  const card = wrapper.closest(".card-block-wrap") || document;

  if (!card._advTabControllers) card._advTabControllers = [];
  if (!card._advTabControllers.includes(wrapper)) {
    card._advTabControllers.push(wrapper);
  }

  const tableRender = wrapper.closest(".tab-content-flex")
    ? wrapper.closest(".tab-content-flex").querySelector(".table-render")
    : (wrapper.closest(".w-tab-pane") || wrapper.closest(".card-block-wrap")).querySelector(".table-render");

  let jsonData = null;
  let selectedChannels = [];
  let startDate = null;
  let endDate = null;
  let metric = "netRevenue";
  let mode = "direct";
  let valueType = "absolute";
  let currentCompanyId = null;
  let currentJsonURL = jsonUrl;

  function getDefaultDateRange(dates) {
    if (!dates || !dates.length) return { start: null, end: null };
    const endObj = new Date(dates[dates.length - 1]);
    const startObj = new Date(endObj);
    startObj.setDate(startObj.getDate() - 6);
    return {
      start: advToISODate(startObj),
      end: advToISODate(endObj)
    };
  }

  /* ---------------- LOAD JSON ---------------- */

  function loadJSON(url) {
    currentJsonURL = url;

    return advLoadNewJSON(url)
      .then(json => {
        jsonData = json;

        const allDates = jsonData.dates || [];
        const channels = jsonData.channels || [];
        if (!allDates.length || !channels.length) {
          console.error("[ADV] json.dates or json.channels missing/empty:", url);
          return;
        }

        const defaultRange = getDefaultDateRange(allDates);
        startDate = defaultRange.start;
        endDate = defaultRange.end;

        card._advDateBounds = {
          min: allDates[0],
          max: allDates[allDates.length - 1]
        };

        const firstChannel = channels[0];
        if (firstChannel?.companies?.length) {
          const companyList = firstChannel.companies.map(c => ({
            id: c.id,
            name: c.name
          }));

          advInitCompanyDropdown(
            wrapper.closest(".w-tab-pane") ||
            wrapper.closest(".tab-content-flex") ||
            card,
            companyList
          );

          if (!currentCompanyId) {
            currentCompanyId = companyList[0].id;
          }
        }

        let metricList = [];
        if (Array.isArray(jsonData.baseMetrics) && jsonData.baseMetrics.length) {
          metricList = jsonData.baseMetrics.slice();
        } else if (firstChannel?.companies?.[0]) {
          metricList = Object.keys(firstChannel.companies[0]).filter(k =>
            Array.isArray(firstChannel.companies[0][k])
          );
        }

        const metricLabels =
          (jsonData.meta && jsonData.meta.metricLabels)
            ? jsonData.meta.metricLabels
            : {};

        if (metricList.length) {
          advInitMetricDropdown(
            wrapper.closest(".w-tab-pane") ||
            wrapper.closest(".tab-content-flex") ||
            card,
            metricList,
            metricLabels
          );

          if (!metricList.includes(metric)) {
            metric = metricList[0];
          }
        }

        selectedChannels = [channels[0].id];

        renderChartAndTable(true);
        connectTableCheckbox();
        connectModeSwitch();
      })
      .catch(err => console.error("[ADV] Load JSON failed:", err));
  }

  /* ------------------- CONTROLLER ------------------- */

  const controller = {
    setDateRange(start, end) {
      if (start) startDate = start;
      if (end) endDate = end;

      if (!jsonData) return;
      const allDates = jsonData.dates || [];
      if (!allDates.length) return;

      const indexes = advFilterDateRange(allDates, startDate, endDate);
      renderChart(indexes);

      if (tableRender?._advRebuildTable) {
        tableRender._advRebuildTable(currentCompanyId, indexes, selectedChannels);
      }
    },

    setChannels(channelIds) {
      if (Array.isArray(channelIds) && channelIds.length) {
        selectedChannels = channelIds.slice();
      }
      renderChartAndTable();
    },

    setCompany(companyId) {
      currentCompanyId = companyId;

      if (!jsonData) return;
      const allDates = jsonData.dates || [];
      const indexes = advFilterDateRange(allDates, startDate, endDate);

      if (tableRender?._advRebuildTable) {
        tableRender._advRebuildTable(companyId, indexes, selectedChannels);
      }
    },

    setMetric(metricId) {
      metric = metricId;
      renderChartAndTable();
    },

    reloadJSON(url) {
      loadJSON(url);
    }
  };

  wrapper._advController = controller;

  /* ---------------- WIRING BUTTONS ---------------- */

  function connectModeSwitch() {
    const modeWrapper = wrapper.querySelector(".chart-switch-mode-btn");
    const valueWrapper = wrapper.querySelector(".chart-switch-value-btn");

    if (modeWrapper) {
      const btnDirect = modeWrapper.querySelector(".btn-direct");
      const btnConsolidate = modeWrapper.querySelector(".btn-consolidate");

      btnDirect?.addEventListener("click", () => {
        mode = "direct";
        btnDirect.classList.add("is-active");
        btnConsolidate?.classList.remove("is-active");
        renderChartAndTable();
      });

      btnConsolidate?.addEventListener("click", () => {
        mode = "consolidate";
        btnConsolidate.classList.add("is-active");
        btnDirect?.classList.remove("is-active");
        renderChartAndTable();
      });
    }

    if (valueWrapper) {
      const btnAbs = valueWrapper.querySelector(".btn-absolute");
      const btnPct = valueWrapper.querySelector(".btn-percent");

      btnAbs?.addEventListener("click", () => {
        valueType = "absolute";
        btnAbs.classList.add("is-active");
        btnPct?.classList.remove("is-active");
        renderChartAndTable();
      });

      btnPct?.addEventListener("click", () => {
        valueType = "percent";
        btnPct.classList.add("is-active");
        btnAbs?.classList.remove("is-active");
        renderChartAndTable();
      });
    }
  }

  function connectTableCheckbox() {
    if (!tableRender || tableRender._advCheckboxBound) return;
    tableRender._advCheckboxBound = true;

    tableRender.addEventListener("change", evt => {
      const cb = evt.target.closest(".adv-channel-checkbox");
      if (!cb || !tableRender.contains(cb)) return;

      const tbody = cb.closest("tbody");
      if (!tbody) return;

      const channelId = cb.dataset.advChannel;
      const boxes = Array.from(tbody.querySelectorAll(".adv-channel-checkbox"));

      if (cb.checked) {
        boxes.forEach(el => (el.checked = el === cb));
        selectedChannels = [channelId];
      } else {
        const stillChecked = boxes.filter(el => el.checked);
        if (stillChecked.length) {
          selectedChannels = [stillChecked[0].dataset.advChannel];
        } else {
          boxes[0].checked = true;
          selectedChannels = [boxes[0].dataset.advChannel];
        }
      }

      renderChartAndTable();
    });
  }

  /* ---------------- RENDER CHART ---------------- */

  function renderChart(indexes) {
    if (!jsonData || !indexes?.length) return;

    const payload = advBuildChartPayload({
      json: jsonData,
      channelIds: selectedChannels,
      dateIndexes: indexes,
      metric,
      mode,
      valueType
    });

    advRenderLineChart(canvas, payload, valueType);
  }

  /* ---------------- REBUILD CHART + TABLE ---------------- */

  function renderChartAndTable(shouldRebuild) {
    if (!jsonData) return;

    const allDates = jsonData.dates || [];
    const indexes = advFilterDateRange(allDates, startDate, endDate);

    if (!selectedChannels.length && jsonData.channels?.length) {
      selectedChannels = [jsonData.channels[0].id];
    }

    renderChart(indexes);

    if (shouldRebuild && tableRender?._advRebuildTable) {
      if (!currentCompanyId) {
        const firstCompany = jsonData.channels[0].companies[0];
        currentCompanyId = firstCompany.id;
      }
      tableRender._advRebuildTable(currentCompanyId, indexes, selectedChannels);
    }
  }

  loadJSON(jsonUrl);
}

/* ============================================================
   advInitTable — dynamic table per tab
   ============================================================ */

(function () {
  function advInitTable(wrapper, jsonUrl) {
    if (!wrapper || !jsonUrl) return;

    const card = wrapper.closest(".card-block-wrap") || document;

    fetch(jsonUrl)
      .then(r => r.json())
      .then(json => {
        const channels = json.channels || [];
        if (!channels.length) return;

        const metricsConfig = advGetBaseMetricsConfig(json);
        if (!metricsConfig.length) return;

        const tableWrapper = wrapper.querySelector(".adv-channel-table-wrapper") || wrapper;

        let table = tableWrapper.querySelector(".adv-channel-table");
        if (!table) {
          table = document.createElement("table");
          table.className = "adv-channel-table";
          tableWrapper.appendChild(table);
        }

        table.innerHTML = "";

        const thead = document.createElement("thead");
        const row = document.createElement("tr");

        row.appendChild(document.createElement("th"));

        const dl = json.meta?.dimensionLabel || "Category";
        const nameTh = document.createElement("th");
        nameTh.textContent = dl;
        row.appendChild(nameTh);

        metricsConfig.forEach(conf => {
          const th = document.createElement("th");
          th.textContent = conf.label;
          row.appendChild(th);
        });

        thead.appendChild(row);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        table.appendChild(tbody);

        const dates = json.dates || [];
        const end = new Date(dates[dates.length - 1]);
        const start = new Date(end);
        start.setDate(start.getDate() - 6);

        const defaultIdx = dates.reduce((acc, d, i) => {
          const dd = new Date(d);
          if (dd >= start && dd <= end) acc.push(i);
          return acc;
        }, []);

        function buildRows(companyId, customIndexes, selectedChannels) {
          const idx = customIndexes?.length ? customIndexes : defaultIdx;
          const sel = Array.isArray(selectedChannels) ? selectedChannels.slice() : [];

          tbody.innerHTML = "";
          const newlyChecked = [];

          channels.forEach((channel, i) => {
            const company =
              channel.companies.find(c => c.id === companyId) ||
              channel.companies[0];

            const ctx = {};
            metricsConfig.forEach(conf => {
              ctx[conf.id] = advSumSubset(company[conf.key], idx);
            });

            let isChecked = sel.includes(channel.id);
            if (sel.length === 0 && i === 0) isChecked = true;

            if (isChecked) newlyChecked.push(channel.id);

            const tr = document.createElement("tr");

            const cb = `
              <td>
                <input type="checkbox"
                class="adv-channel-checkbox"
                data-adv-channel="${channel.id}"
                ${isChecked ? "checked" : ""}>
              </td>
            `;

            let html = cb + `<td>${channel.label || channel.id}</td>`;

            metricsConfig.forEach(conf => {
              html += `<td>${advFormatMetricValue(conf, ctx[conf.id])}</td>`;
            });

            tr.innerHTML = html;
            tbody.appendChild(tr);
          });

          const chartWrapper = wrapper.closest(".tab-content-flex")
            ? wrapper.closest(".tab-content-flex").querySelector(".chart-canvas")
            : (wrapper.closest(".w-tab-pane") || wrapper.closest(".card-block-wrap")).querySelector(".chart-canvas");

          const ctrl = chartWrapper?._advController;
          if (ctrl?.setChannels && newlyChecked.length) {
            ctrl.setChannels(newlyChecked);
          }
        }

        wrapper._advRebuildTable = buildRows;

        const defaultCompany =
          channels[0].companies?.[0]?.id || "your-company";

        buildRows(defaultCompany, defaultIdx, [channels[0].id]);
      })
      .catch(err => console.error("[ADV] Table load error:", err));
  }

  window.advInitTable = advInitTable;
})();

/***********************************************************
 * END PART 4
 ***********************************************************/
/***********************************************************
 * PART 5 — GLOBAL INITIALIZER
 ***********************************************************/

document.addEventListener("DOMContentLoaded", function () {
  const cards = document.querySelectorAll(".card-block-wrap");
  if (!cards.length) return;

  cards.forEach(card => {
    const configEl = card.querySelector(".adv-config");
    if (!configEl) {
      console.error("[ADV] Missing .adv-config in card-block-wrap");
      return;
    }

    let config = null;
    try {
      config = JSON.parse(configEl.textContent.trim());
    } catch (e) {
      console.error("[ADV] Invalid JSON in .adv-config");
      return;
    }

    const defaultPlatform = config.defaultPlatform || "facebook";
    const platforms = config.platforms || {};

    if (!platforms[defaultPlatform]) {
      console.error("[ADV] Platform config missing:", defaultPlatform);
      return;
    }

    /* ---------------------------------------
       INIT platform dropdown (set label)
    --------------------------------------- */
    advInitPlatformDropdown(card, config, defaultPlatform);

    /* ---------------------------------------
       Load URLs for this card + platform
    --------------------------------------- */
    const urls = platforms[defaultPlatform];
    const competitorsURL = urls.competitors;
    const bicURL = urls.bic;

    /* ---------------------------------------
       Locate the two tab panes
    --------------------------------------- */
    const competitorsTab =
      card.querySelector('.w-tab-pane[data-w-tab="competitors"]');

    const bicTab =
      card.querySelector('.w-tab-pane[data-w-tab="best-in-class"]');

    /* ---------------------------------------
       Init competitors tab
    --------------------------------------- */
    if (competitorsTab) {
      const chartWrapper = competitorsTab.querySelector(".chart-canvas");
      const tableWrapper = competitorsTab.querySelector(".table-render");

      if (chartWrapper && competitorsURL) {
        chartWrapper._advInitSource = competitorsURL;
        advInitChart(chartWrapper, competitorsURL);
      }

      if (tableWrapper && competitorsURL) {
        tableWrapper._advInitSource = competitorsURL;
        advInitTable(tableWrapper, competitorsURL);
      }
    }

    /* ---------------------------------------
       Init BIC tab
    --------------------------------------- */
    if (bicTab) {
      const chartWrapper = bicTab.querySelector(".chart-canvas");
      const tableWrapper = bicTab.querySelector(".table-render");

      if (chartWrapper && bicURL) {
        chartWrapper._advInitSource = bicURL;
        advInitChart(chartWrapper, bicURL);
      }

      if (tableWrapper && bicURL) {
        tableWrapper._advInitSource = bicURL;
        advInitTable(tableWrapper, bicURL);
      }
    }
  });
});

/***********************************************************
 * END PART 5
 ***********************************************************/

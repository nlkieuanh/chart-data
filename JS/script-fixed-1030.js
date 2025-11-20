/***********************************************************
 * ADV FUNCTION TABLE + CHART (multi-card-block-wrap version)
 * - Each card-block-wrap is completely isolated
 * - Chart & table share the same JSON
 * - Metric dropdown = chart only
 * - Company dropdown = table only
 * - Checkbox = single select, drives chart + table sync
 * - Date range = affects chart + table
 ***********************************************************/

/* ------------------- Helpers ------------------- */

function advToISODate(d) {
  if (!(d instanceof Date)) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
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
    return arr.reduce((acc, v) => acc + (Number(v) || 0), 0);
  }
  return indexes.reduce((acc, idx) => acc + (Number(arr[idx]) || 0), 0);
}

function advLoadNewJSON(url) {
  return fetch(url).then(res => {
    if (!res.ok) throw new Error("JSON fetch failed: " + url);
    return res.json();
  });
}

/* ---------------- Metric config (auto detect) ---------------- */

function advGetBaseMetricsConfig(json) {
  if (!json || typeof json !== "object") return [];

  let base = [];
  if (Array.isArray(json.baseMetrics) && json.baseMetrics.length) {
    base = json.baseMetrics.slice();
  } else {
    const channels = json.channels || [];
    if (channels.length && channels[0].companies && channels[0].companies[0]) {
      const sample = channels[0].companies[0];
      base = Object.keys(sample).filter(k => Array.isArray(sample[k]));
    }
  }

  const labels = (json.meta && json.meta.metricLabels) || {};

  return base.map(id => {
    const lower = id.toLowerCase();
    let format = "number";
    if (lower.includes("rate") || lower.includes("roas") || lower === "cvr") {
      format = "percent";
    } else if (
      lower.includes("rev") ||
      lower.includes("revenue") ||
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
      label: labels[id] || id,
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
   1. Filter date range → indexes
   ============================================================ */

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

/* ============================================================
   2. Extract metric series
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
   3. Build chart payload (mode = direct only, because single channel)
   ============================================================ */

function advBuildChartPayload(options) {
  const { json, channelId, dateIndexes, metric, valueType } = options;

  const dates = json.dates || [];
  const periods = dateIndexes.map(i => dates[i]);

  const channel = json.channels.find(c => c.id === channelId);
  if (!channel) return { periods: [], yourCompany: null, competitors: [] };

  const seriesList = channel.companies.map(comp => {
    const values = advGetMetricSeries(json, channelId, comp.id, metric, dateIndexes);
    return { name: comp.name, color: comp.color, values };
  });

  if (valueType === "percent" && seriesList.length) {
    const length = seriesList[0].values.length;
    const total = new Array(length).fill(0);

    seriesList.forEach(s => s.values.forEach((v, i) => (total[i] += v || 0)));

    seriesList.forEach(s => {
      s.values = s.values.map((v, i) => (total[i] ? (v / total[i]) * 100 : 0));
    });
  }

  let yourCompany =
    seriesList.find(s => s.name === "Your Company") ||
    seriesList[0] ||
    null;

  const competitors = yourCompany
    ? seriesList.filter(s => s !== yourCompany)
    : seriesList;

  return { periods, yourCompany, competitors };
}

/* ============================================================
   4. Render Chart.js
   ============================================================ */

function advRenderLineChart(canvas, payload, valueType) {
  if (!window.Chart) return;

  const ctx = canvas.getContext("2d");
  if (canvas._advChartInstance) canvas._advChartInstance.destroy();

  const datasets = [];

  if (payload.yourCompany) {
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
    data: { labels: payload.periods, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: function (context) {
              const label = context.dataset.label || "";
              const v = context.parsed.y;
              return valueType === "percent"
                ? `${label}: ${v.toFixed(1)}%`
                : `${label}: ${v.toLocaleString()}`;
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
              return valueType === "percent" ? v + "%" : v;
            }
          }
        }
      }
    }
  });
}

/* ============================================================
   5. Render TABLE (company determines row data)
   ============================================================ */

function advRenderChannelTable(json, tbody, selectedChannelId, dateIndexes, companyId) {
  if (!tbody || !json) return;

  const channels = json.channels || [];
  const metricsConfig = advGetBaseMetricsConfig(json);

  tbody.innerHTML = "";

  channels.forEach((channel, index) => {
    const companies = channel.companies || [];
    const company =
      companies.find(c => c.id === companyId) ||
      companies[0];

    if (!company) return;

    const ctx = {};
    metricsConfig.forEach(conf => {
      ctx[conf.id] = advSumSubset(company[conf.key], dateIndexes);
    });

    const isChecked = channel.id === selectedChannelId;

    const tr = document.createElement("tr");
    let html = `
      <td>
        <input type="checkbox" 
               class="adv-channel-checkbox" 
               data-adv-channel="${channel.id}"
               ${isChecked ? "checked" : ""}/>
      </td>
      <td>${channel.label || channel.id}</td>
    `;

    metricsConfig.forEach(conf => {
      html += `<td>${advFormatMetricValue(conf, ctx[conf.id])}</td>`;
    });

    tr.innerHTML = html;
    tbody.appendChild(tr);
  });
}
/* ============================================================
   6. Init CHART (per card-block-wrap)
   ============================================================ */

function advInitChart(wrapper, jsonUrl) {
  const canvas = wrapper.querySelector("canvas");
  if (!canvas) return;

  const card = wrapper.closest(".card-block-wrap");
  if (!card) return;

  let jsonData = null;
  let selectedChannelId = null;
  let metric = null;
  let valueType = "absolute";
  let startDate = null;
  let endDate = null;
  let currentCompanyId = null;

  const tbody = card.querySelector(".adv-channel-table tbody");

  function getDefaultRange(dates) {
    const end = new Date(dates[dates.length - 1]);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    return { start: advToISODate(start), end: advToISODate(end) };
  }

  advLoadNewJSON(jsonUrl).then(json => {
    jsonData = json;

    const channels = json.channels || [];
    const dates = json.dates || [];

    if (!channels.length || !dates.length) return;

    const def = getDefaultRange(dates);
    startDate = def.start;
    endDate = def.end;

    card._advDateBounds = { min: dates[0], max: dates[dates.length - 1] };

    selectedChannelId = channels[0].id;

    const metricList = json.baseMetrics || [];
    metric = metricList[0] || metricList[0];

    const firstCompany = channels[0].companies[0];
    currentCompanyId = firstCompany.id;

    renderChartAndTable();
    connectCheckbox();
    connectModeSwitch();
  });

  function renderChartAndTable() {
    if (!jsonData) return;

    const dates = jsonData.dates || [];
    const dateIndexes = advFilterDateRange(dates, startDate, endDate);

    const payload = advBuildChartPayload({
      json: jsonData,
      channelId: selectedChannelId,
      dateIndexes,
      metric,
      valueType
    });

    advRenderLineChart(canvas, payload, valueType);

    if (tbody) {
      advRenderChannelTable(jsonData, tbody, selectedChannelId, dateIndexes, currentCompanyId);
    }
  }

  function connectCheckbox() {
    if (!tbody) return;

    tbody.addEventListener("change", function (e) {
      const cb = e.target.closest(".adv-channel-checkbox");
      if (!cb) return;

      const id = cb.getAttribute("data-adv-channel");
      if (!id) return;

      tbody.querySelectorAll(".adv-channel-checkbox").forEach(box => {
        box.checked = box === cb;
      });

      selectedChannelId = id;
      renderChartAndTable();
    });
  }

  function connectModeSwitch() {
    const modeWrap = card.querySelector(".chart-switch-value-btn");
    if (!modeWrap) return;

    const btnAbs = modeWrap.querySelector(".btn-absolute");
    const btnPct = modeWrap.querySelector(".btn-percent");

    if (btnAbs) {
      btnAbs.addEventListener("click", () => {
        valueType = "absolute";
        btnAbs.classList.add("is-active");
        if (btnPct) btnPct.classList.remove("is-active");
        renderChartAndTable();
      });
    }

    if (btnPct) {
      btnPct.addEventListener("click", () => {
        valueType = "percent";
        btnPct.classList.add("is-active");
        if (btnAbs) btnAbs.classList.remove("is-active");
        renderChartAndTable();
      });
    }
  }

  card._advController = {
    setDateRange(start, end) {
      startDate = start;
      endDate = end;

      const dates = jsonData.dates || [];
      const dateIndexes = advFilterDateRange(dates, startDate, endDate);

      renderChartAndTable();
    },
    setCompany(id) {
      currentCompanyId = id;

      const dates = jsonData.dates || [];
      const dateIndexes = advFilterDateRange(dates, startDate, endDate);

      if (tbody) {
        advRenderChannelTable(jsonData, tbody, selectedChannelId, dateIndexes, currentCompanyId);
      }
    },
    setMetric(id) {
      metric = id;
      renderChartAndTable();
    }
  };
}

/* ============================================================
   7. Init TABLE (per card-block-wrap)
   ============================================================ */

function advInitTable(wrapper, jsonUrl) {
  const card = wrapper.closest(".card-block-wrap");
  if (!card) return;

  const tableWrapper = wrapper.querySelector(".adv-channel-table-wrapper");
  const table =
    tableWrapper.querySelector(".adv-channel-table") ||
    (function () {
      const t = document.createElement("table");
      t.className = "adv-channel-table";
      tableWrapper.appendChild(t);
      return t;
    })();

  table.innerHTML = `
    <thead><tr>
      <th></th>
      <th>Channel</th>
    </tr></thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");

  advLoadNewJSON(jsonUrl).then(json => {
    const metrics = advGetBaseMetricsConfig(json);
    const head = table.querySelector("thead tr");

    metrics.forEach(m => {
      const th = document.createElement("th");
      th.textContent = m.label;
      head.appendChild(th);
    });

    const channels = json.channels || [];
    let companyList = [];

    if (channels.length && channels[0].companies.length) {
      companyList = channels[0].companies.map(c => ({ id: c.id, name: c.name }));
    }

    initCompanyDropdown(card, companyList);

    const ctrl = card._advController;

    if (ctrl) {
      ctrl._tableJSON = json;
      ctrl._tableMetrics = metrics;
    }

    const firstCompany = companyList[0] ? companyList[0].id : null;

    if (ctrl && firstCompany) {
      ctrl.setCompany(firstCompany);
    }
  });

  function initCompanyDropdown(card, list) {
    const boxes = card.querySelectorAll(".company-dd-link-select");
    if (!boxes.length) return;

    boxes.forEach(box => {
      const scriptHolder = box.querySelector(".company-select-script");
      const container = scriptHolder ? scriptHolder.parentElement : box;

      Array.from(container.children).forEach(c => {
        if (c !== scriptHolder) c.remove();
      });

      list.forEach(c => {
        const item = document.createElement("div");
        item.className = "filter-dropdown-item";
        item.setAttribute("data-dropdown", c.id);
        item.innerHTML = `<div class="dropdown-item-text">${c.name}</div>`;
        container.appendChild(item);
      });

      const label = box.querySelector(".company-dd-selected");
      if (label && list[0]) label.textContent = list[0].name;
    });
  }
}

/* ============================================================
   8. Dropdown click handlers (company + metric)
   ============================================================ */

document.addEventListener("click", function (e) {
  const companyItem = e.target.closest(".company-dd-link-select [data-dropdown]");
  if (companyItem) {
    const id = companyItem.getAttribute("data-dropdown");
    const box = companyItem.closest(".company-dd-link-select");
    const label = box.querySelector(".company-dd-selected");
    const card = box.closest(".card-block-wrap");
    const ctrl = card._advController;

    if (label) label.textContent = companyItem.textContent.trim();
    if (ctrl) ctrl.setCompany(id);

    return;
  }

  const metricItem = e.target.closest(".chart-metric-dd-select [data-dropdown]");
  if (metricItem) {
    const id = metricItem.getAttribute("data-dropdown");
    const box = metricItem.closest(".chart-metric-dd-select");
    const label = box.querySelector(".chart-metric-dd-selected");
    const card = box.closest(".card-block-wrap");
    const ctrl = card._advController;

    if (label) label.textContent = metricItem.textContent.trim();
    if (ctrl) ctrl.setMetric(id);
  }
});

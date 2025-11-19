/***********************************************************
 * ADV FUNCTION TABLE + CHART (metric + company + channel)
 * Fully fixed version: tableV2 only, proper company switching,
 * no Vietnamese comments
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
    return arr.reduce(function (acc, v) { return acc + (Number(v) || 0); }, 0);
  }
  return indexes.reduce(function (acc, idx) {
    var v = arr[idx];
    return acc + (Number(v) || 0);
  }, 0);
}

function advGetBaseMetricsConfig(json) {
  if (!json || typeof json !== "object") return [];

  var baseMetrics = [];
  if (Array.isArray(json.baseMetrics) && json.baseMetrics.length) {
    baseMetrics = json.baseMetrics.slice();
  } else {
    var channels = json.channels || [];
    if (channels.length && channels[0].companies && channels[0].companies[0]) {
      var firstCompany = channels[0].companies[0];
      baseMetrics = Object.keys(firstCompany).filter(function (key) {
        return Array.isArray(firstCompany[key]);
      });
    }
  }

  var meta = json.meta || {};
  var labelsMap = meta.metricLabels || {};

  return baseMetrics.map(function (metricId) {
    var id = String(metricId);
    var lower = id.toLowerCase();
    var format = "number";

    if (
      lower.indexOf("rate") !== -1 ||
      lower.indexOf("roas") !== -1 ||
      lower === "cvr"
    ) {
      format = "percent";
    } else if (
      lower.indexOf("revenue") !== -1 ||
      lower.indexOf("rev") !== -1 ||
      lower.indexOf("spend") !== -1 ||
      lower.indexOf("cpo") !== -1 ||
      lower.indexOf("cac") !== -1
    ) {
      format = "decimal";
    } else {
      format = "int";
    }

    return {
      id: id,
      key: id,
      label: labelsMap[id] || id,
      format: format
    };
  });
}

function advFormatMetricValue(conf, value) {
  var v = Number(value) || 0;
  if (!conf || !conf.format) return v.toFixed(2);
  if (conf.format === "percent") return v.toFixed(2) + "%";
  if (conf.format === "int") return Math.round(v).toLocaleString();
  return v.toFixed(2);
}

/* ---------- Load JSON ---------- */

async function advLoadNewJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("JSON fetch failed");
  return res.json();
}

/* ---------- Filter date ---------- */

function advFilterDateRange(dates, startDate, endDate) {
  if (!Array.isArray(dates)) return [];
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  if (!start || !end) return dates.map((_, i) => i);
  return dates.reduce(function (acc, d, i) {
    const dd = new Date(d);
    if (dd >= start && dd <= end) acc.push(i);
    return acc;
  }, []);
}

/* ---------- Extract metric series ---------- */

function advGetMetricSeries(json, channelId, companyId, metric, dateIndexes) {
  const channels = json.channels || [];
  const channel = channels.find(function (c) { return c.id === channelId; });
  if (!channel) return [];

  const companies = channel.companies || [];
  const company = companies.find(function (c) { return c.id === companyId; });
  if (!company) return [];

  const fullArray = company[metric] || [];
  if (!Array.isArray(fullArray)) return [];
  if (!dateIndexes || !dateIndexes.length) return fullArray;

  return dateIndexes.map(function (i) { return fullArray[i]; });
}

/* ---------- Consolidate ---------- */

function advConsolidateChannels(list) {
  if (!list.length) return [];
  const len = list[0].length;
  const out = new Array(len).fill(0);
  list.forEach(function (arr) {
    arr.forEach(function (v, i) {
      out[i] += v;
    });
  });
  return out;
}

function advToPercent(values, total) {
  return values.map(function (v, i) {
    const t = total[i] || 0;
    return t === 0 ? 0 : (v / t) * 100;
  });
}

/* ---------- Build chart payload ---------- */

function advBuildChartPayload(options) {
  const json = options.json;
  const channelIds = options.channelIds;
  const dateIndexes = options.dateIndexes;
  const metric = options.metric || "netRevenue";
  const mode = options.mode || "direct";
  const valueType = options.valueType || "absolute";

  const dates = json.dates || [];
  const periods = dateIndexes.map(function (i) { return dates[i]; });

  var seriesMap = {};

  if (mode === "direct") {
    const firstChannelId = channelIds[0];
    const channel = (json.channels || []).find(function (c) { return c.id === firstChannelId; });
    if (channel) {
      (channel.companies || []).forEach(function (comp) {
        const values = advGetMetricSeries(json, firstChannelId, comp.id, metric, dateIndexes);
        seriesMap[comp.id] = {
          name: comp.name,
          color: comp.color,
          values: values
        };
      });
    }
  } else {
    (json.channels || []).forEach(function (ch) {
      if (channelIds.indexOf(ch.id) === -1) return;
      (ch.companies || []).forEach(function (comp) {
        const values = advGetMetricSeries(json, ch.id, comp.id, metric, dateIndexes);
        if (!values.length) return;
        if (!seriesMap[comp.id]) {
          seriesMap[comp.id] = {
            name: comp.name,
            color: comp.color,
            values: values.slice()
          };
        } else {
          const merged = seriesMap[comp.id].values;
          values.forEach(function (v, idx) {
            merged[idx] = (merged[idx] || 0) + (v || 0);
          });
        }
      });
    });
  }

  var list = Object.keys(seriesMap).map(function (key) { return seriesMap[key]; });

  if (valueType === "percent" && list.length) {
    const len = list[0].values.length;
    const total = new Array(len).fill(0);
    list.forEach(function (s) {
      s.values.forEach(function (v, i) { total[i] += v || 0; });
    });
    list = list.map(function (s) {
      return {
        name: s.name,
        color: s.color,
        values: advToPercent(s.values, total)
      };
    });
  }

  var yourCompany = list.find(function (s) { return s.name === "Your Company"; }) || list[0] || null;
  var competitors = yourCompany ? list.filter(function (s) { return s !== yourCompany; }) : list;

  return {
    chartType: "line",
    periods: periods,
    yourCompany: yourCompany || { name: "", color: "#3366cc", values: [] },
    competitors: competitors
  };
}

/* ---------- Render Chart.js ---------- */

function advRenderLineChart(canvas, payload, valueType) {
  if (!window.Chart) return;

  const ctx = canvas.getContext("2d");
  if (canvas._advChartInstance) canvas._advChartInstance.destroy();

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
    data: { labels: labels, datasets: datasets },
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
                ? label + ": " + v.toFixed(1) + "%"
                : label + ": " + v.toLocaleString();
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

/* ---------- ADV INIT CHART: FIXED VERSION ---------- */

function advInitChart(wrapper, jsonUrl) {
  const canvas = wrapper.querySelector("canvas");
  if (!canvas) return;

  const card = wrapper.closest(".card-block-wrap") || document;
  const table = card.querySelector(".adv-channel-table") || card.querySelector("#adv-channel-table");
  const tbody = table ? table.querySelector("tbody") : null;

  let jsonData = null;
  let selectedChannels = [];
  let startDate = null;
  let endDate = null;
  let metric = "netRevenue";
  let mode = "direct";
  let valueType = "absolute";
  let currentCompanyId = null;

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

  advLoadNewJSON(jsonUrl)
    .then(function (json) {
      jsonData = json;
      const allDates = jsonData.dates || [];
      const channels = jsonData.channels || [];
      if (!allDates.length || !channels.length) return;

      const defaultRange = getDefaultDateRange(allDates);
      startDate = defaultRange.start;
      endDate = defaultRange.end;

      card._advDateBounds = {
        min: allDates[0],
        max: allDates[allDates.length - 1]
      };

      const firstChannel = channels[0];
      if (firstChannel && firstChannel.companies && firstChannel.companies.length) {
        const list = firstChannel.companies.map(function (c) {
          return { id: c.id, name: c.name };
        });
        advInitCompanyDropdown(card, list);
        if (!currentCompanyId) currentCompanyId = list[0].id;
      }

      var metricList = [];
      if (jsonData.baseMetrics && jsonData.baseMetrics.length) {
        metricList = jsonData.baseMetrics.slice();
      } else if (firstChannel && firstChannel.companies[0]) {
        metricList = Object.keys(firstChannel.companies[0]).filter(function (k) {
          return Array.isArray(firstChannel.companies[0][k]);
        });
      }

      var labels = {
        netRevenue: "Net Revenue",
        spend: "Spend",
        orders: "Orders",
        newCustomers: "New Customers",
        sessions: "Sessions"
      };

      if (metricList.length) {
        advInitMetricDropdown(card, metricList, labels);
        if (metricList.indexOf(metric) === -1) metric = metricList[0];
      }

      selectedChannels = [channels[0].id];

      renderChartOnly();
      connectTableCheckbox();
      connectModeSwitch();
    });

  function renderChartOnly() {
    if (!jsonData) return;
    const allDates = jsonData.dates || [];
    const dateIndexes = advFilterDateRange(allDates, startDate, endDate);
    if (!selectedChannels.length && jsonData.channels.length) {
      selectedChannels = [jsonData.channels[0].id];
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

  const controller = {
    setDateRange: function (start, end) {
      if (start) startDate = start;
      if (end) endDate = end;
      if (!jsonData) return;
      const allDates = jsonData.dates || [];
      const dateIndexes = advFilterDateRange(allDates, startDate, endDate);
      renderChartOnly();
      if (typeof card._advRebuildTable === "function") {
        card._advRebuildTable(currentCompanyId, dateIndexes, selectedChannels);
      }
    },
    setChannels: function (arr) {
      if (Array.isArray(arr) && arr.length) selectedChannels = arr.slice(0, 1);
      renderChartOnly();
    },
    setCompany: function (companyId) {
      currentCompanyId = companyId;
      if (!jsonData) return;
      const allDates = jsonData.dates || [];
      const dateIndexes = advFilterDateRange(allDates, startDate, endDate);
      if (typeof card._advRebuildTable === "function") {
        card._advRebuildTable(companyId, dateIndexes, selectedChannels);
      }
    },
    setMetric: function (metricId) {
      metric = metricId;
      renderChartOnly();
    }
  };

  card._advController = controller;

  function connectModeSwitch() {
    const modeWrapper = wrapper.querySelector(".chart-switch-mode-btn");
    const valueWrapper = wrapper.querySelector(".chart-switch-value-btn");

    if (modeWrapper) {
      const btnDirect = modeWrapper.querySelector(".btn-direct");
      const btnConsolidate = modeWrapper.querySelector(".btn-consolidate");

      if (btnDirect) {
        btnDirect.addEventListener("click", function () {
          mode = "direct";
          btnDirect.classList.add("is-active");
          btnConsolidate.classList.remove("is-active");
          renderChartOnly();
        });
      }

      if (btnConsolidate) {
        btnConsolidate.addEventListener("click", function () {
          mode = "consolidate";
          btnConsolidate.classList.add("is-active");
          btnDirect.classList.remove("is-active");
          renderChartOnly();
        });
      }
    }

    if (valueWrapper) {
      const btnAbsolute = valueWrapper.querySelector(".btn-absolute");
      const btnPercent = valueWrapper.querySelector(".btn-percent");

      if (btnAbsolute) {
        btnAbsolute.addEventListener("click", function () {
          valueType = "absolute";
          btnAbsolute.classList.add("is-active");
          btnPercent.classList.remove("is-active");
          renderChartOnly();
        });
      }

      if (btnPercent) {
        btnPercent.addEventListener("click", function () {
          valueType = "percent";
          btnPercent.classList.add("is-active");
          btnAbsolute.classList.remove("is-active");
          renderChartOnly();
        });
      }
    }
  }

  function connectTableCheckbox() {
    if (!tbody) return;

    tbody.addEventListener("change", function (event) {
      var cb = event.target.closest(".adv-channel-checkbox");
      if (!cb) return;
      var channelId = cb.getAttribute("data-adv-channel");
      if (!channelId) return;

      var boxes = Array.prototype.slice.call(
        tbody.querySelectorAll(".adv-channel-checkbox")
      );

      if (cb.checked) {
        boxes.forEach(function (el) {
          el.checked = el === cb;
        });
        selectedChannels = [channelId];
      } else {
        var stillChecked = boxes.filter(function (el) {
          return el.checked;
        });
        if (stillChecked.length) {
          var id = stillChecked[0].getAttribute("data-adv-channel");
          selectedChannels = id ? [id] : [];
        } else {
          var first = boxes[0];
          if (first) {
            first.checked = true;
            var firstId = first.getAttribute("data-adv-channel");
            selectedChannels = firstId ? [firstId] : [];
          } else {
            selectedChannels = [];
          }
        }
      }
      renderChartOnly();
    });
  }
}

window.advInitChart = advInitChart;

/* ---------- DATE RANGE UI ---------- */

(function () {
  function getBoundsOrFallback(wrapper) {
    var card = wrapper.closest(".card-block-wrap");
    var bounds = card && card._advDateBounds;
    if (bounds && bounds.min && bounds.max) {
      return { min: new Date(bounds.min), max: new Date(bounds.max) };
    }
    var now = new Date();
    return {
      min: new Date(now.getFullYear(), now.getMonth(), 1),
      max: now
    };
  }

  function getController(wrapper) {
    var card = wrapper.closest(".card-block-wrap");
    return card && card._advController;
  }

  function applyDateRangeSelection(item) {
    if (!item) return;

    var wrapper = item.closest(".date-range-dd-select");
    if (!wrapper) return;

    var value = item.getAttribute("data-dropdown");
    var textEl = item.querySelector(".dropdown-item-text") || item;
    var selectedText = (textEl.textContent || "").trim();

    var labelEl = wrapper.querySelector(".date-range-dd-selected");
    if (labelEl && selectedText) labelEl.textContent = selectedText;

    var tab = document.querySelector('[data-w-tab="' + value + '"]');
    if (tab) tab.click();

    var ctrl = getController(wrapper);
    var bounds = getBoundsOrFallback(wrapper);
    if (!ctrl) return;

    if (value === "default") {
      var end = bounds.max;
      var start = new Date(end);
      start.setDate(start.getDate() - 6);
      ctrl.setDateRange(advToISODate(start), advToISODate(end));
    }

    if (value === "lastMonth") {
      var end2 = bounds.max;
      var start2 = new Date(end2);
      start2.setDate(start2.getDate() - 29);
      ctrl.setDateRange(advToISODate(start2), advToISODate(end2));
    }
  }

  function onFlatpickrChange(selectedDates, dateStr, instance) {
    var input = instance.input;
    var wrapper = input.closest(".date-range-dd-select");
    if (!wrapper) return;

    var labelEl = wrapper.querySelector(".date-range-dd-selected");
    var ctrl = getController(wrapper);
    if (!labelEl) return;
    if (!selectedDates || selectedDates.length === 0) return;

    var opt = { day: "2-digit", month: "short", year: "numeric" };

    if (selectedDates.length === 1) {
      var t = selectedDates[0].toLocaleDateString(undefined, opt);
      labelEl.textContent = t + " …";
      return;
    }

    var s = selectedDates[0];
    var e = selectedDates[1];
    var st = s.toLocaleDateString(undefined, opt);
    var et = e.toLocaleDateString(undefined, opt);
    labelEl.textContent = st + " – " + et;

    if (ctrl) ctrl.setDateRange(advToISODate(s), advToISODate(e));
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".date-range-dd-select").forEach(function (wrapper) {
      var def =
        wrapper.querySelector('[data-dropdown="default"]') ||
        wrapper.querySelector("[data-dropdown]");

      if (def) {
        var t = def.querySelector(".dropdown-item-text") || def;
        var label = wrapper.querySelector(".date-range-dd-selected");
        if (label && t) label.textContent = (t.textContent || "").trim();
      }

      var input =
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

  document.addEventListener("click", function (e) {
    var item = e.target.closest(".date-range-dd-select [data-dropdown]");
    if (!item) return;
    if (item.tagName === "INPUT" || item.tagName === "TEXTAREA") return;
    applyDateRangeSelection(item);
    var dd = item.closest(".dropdown, .w-dropdown");
    if (dd && window.$) $(dd).triggerHandler("w-close.w-dropdown");
  });
})();

/* ---------- ADV INIT TABLE ---------- */

(function () {
  function advInitTable(wrapper, jsonUrl) {
    if (!wrapper || !jsonUrl) return;

    var card = wrapper.closest(".card-block-wrap") || document;

    fetch(jsonUrl)
      .then(function (res) { return res.json(); })
      .then(function (json) {
        var channels = json.channels || [];
        if (!channels.length) return;

        var metricsConfig = advGetBaseMetricsConfig(json);
        if (!metricsConfig.length) return;

        var tableWrapper =
          wrapper.querySelector(".adv-channel-table-wrapper") || wrapper;

        var table =
          tableWrapper.querySelector(".adv-channel-table") ||
          (function () {
            var t = document.createElement("table");
            t.className = "adv-channel-table";
            tableWrapper.appendChild(t);
            return t;
          })();

        table.innerHTML = "";

        var thead = document.createElement("thead");
        var headRow = document.createElement("tr");

        var th0 = document.createElement("th");
        headRow.appendChild(th0);

        var th1 = document.createElement("th");
        th1.textContent = "Channel";
        headRow.appendChild(th1);

        metricsConfig.forEach(function (conf) {
          var th = document.createElement("th");
          th.textContent = conf.label;
          headRow.appendChild(th);
        });

        thead.appendChild(headRow);
        table.appendChild(thead);

        var tbody = document.createElement("tbody");
        table.appendChild(tbody);

        var dates = json.dates || [];
        var end = new Date(dates[dates.length - 1]);
        var start = new Date(end);
        start.setDate(start.getDate() - 6);
        var defaultIndexes = dates.reduce(function (acc, d, i) {
          var dd = new Date(d);
          if (dd >= start && dd <= end) acc.push(i);
          return acc;
        }, []);

        var currentSelectedChannels = [];

        function buildRows(companyId, customIndexes, selectedChannels) {
          var dateIndexes =
            Array.isArray(customIndexes) && customIndexes.length
              ? customIndexes
              : defaultIndexes;

          currentSelectedChannels = selectedChannels || [];

          tbody.innerHTML = "";
          var checkedIds = [];

          channels.forEach(function (channel, index) {
            var companies = channel.companies || [];
            var company =
              companies.find(function (c) { return c.id === companyId; }) ||
              companies[0];
            if (!company) return;

            var ctx = {};
            metricsConfig.forEach(function (conf) {
              var arr = company[conf.key];
              ctx[conf.id] = advSumSubset(arr, dateIndexes);
            });

            var isChecked =
              (currentSelectedChannels.length === 0 && index === 0) ||
              currentSelectedChannels.indexOf(channel.id) !== -1;

            if (isChecked && checkedIds.indexOf(channel.id) === -1) {
              checkedIds.push(channel.id);
            }

            var tr = document.createElement("tr");
            var html =
              '<td><input type="checkbox" class="adv-channel-checkbox" data-adv-channel="' +
              channel.id +
              '"' +
              (isChecked ? " checked" : "") +
              " /></td>";

            html += "<td>" + (channel.label || channel.id) + "</td>";

            metricsConfig.forEach(function (conf) {
              var v = ctx[conf.id] || 0;
              html += "<td>" + advFormatMetricValue(conf, v) + "</td>";
            });

            tr.innerHTML = html;
            tbody.appendChild(tr);
          });

          var ctrl = card._advController;
          if (ctrl && typeof ctrl.setChannels === "function" && checkedIds.length) {
            ctrl.setChannels(checkedIds);
          }
        }

        card._advRebuildTable = buildRows;

        var defaultCompany = (function () {
          var c0 = channels[0].companies || [];
          return (c0[0] && c0[0].id) || "your-company";
        })();

        buildRows(defaultCompany, defaultIndexes, [channels[0].id]);
      });
  }

  window.advInitTable = advInitTable;
})();

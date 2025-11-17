
/***********************************************************
 * ADV FUNCTION TABLE + CHART (metric + company + channel)
 * - Works with adv-channel-new.json
 * - Chart: all companies for selected channel(s), per date range
 * - Table: one company at a time (selected via dropdown), per date range
 * - Shared date filter (via _advCurrentChart.setDateRange)
 * - Shared channel selection (checkbox in table)
 * - Metric dropdown to choose which metric to plot in chart
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
   5. Build payload (mode + value type, all companies)
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

  var seriesMap = {}; // key = companyId, value = { name, color, values[] }

  if (mode === "direct") {
    // Direct: take the first selected channel only, all companies of that channel
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
    // Consolidate: sum across all selected channels per company
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

  var seriesList = Object.keys(seriesMap).map(function (key) {
    return seriesMap[key];
  });

  if (valueType === "percent" && seriesList.length) {
    // Percent by day across all companies
    const length = seriesList[0].values.length;
    const totalPerIndex = new Array(length).fill(0);

    seriesList.forEach(function (s) {
      s.values.forEach(function (v, i) {
        totalPerIndex[i] += v || 0;
      });
    });

    seriesList = seriesList.map(function (s) {
      return {
        name: s.name,
        color: s.color,
        values: advToPercent(s.values, totalPerIndex)
      };
    });
  }

  // Choose "Your Company" as primary if exists
  var yourCompany = seriesList.find(function (s) { return s.name === "Your Company"; }) || seriesList[0] || null;
  var competitors = [];
  if (yourCompany) {
    competitors = seriesList.filter(function (s) { return s !== yourCompany; });
  } else {
    competitors = seriesList;
  }

  return {
    chartType: "line",
    periods: periods,
    yourCompany: yourCompany || { name: "", color: "#3366cc", values: [] },
    competitors: competitors
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

  if (payload.yourCompany && Array.isArray(payload.yourCompany.values) && payload.yourCompany.values.length) {
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
   7. Render TABLE (per company, per channel, per date range)
   ============================================================ */

function advRenderChannelTable(json, tbody, selectedChannels, dateIndexes, companyId) {
  if (!tbody) return;
  const channels = json.channels || [];
  const dates = json.dates || [];
  if (!dates.length) return;

  const rowsHtml = channels.map(function (channel) {
    const companies = channel.companies || [];
    var company = companies.find(function (c) { return c.id === companyId; });
    if (!company) {
      company = companies.find(function (c) { return c.id === "your-company"; });
    }
    if (!company) return "";

    const netRevenue = advSumSubset(company.netRevenue, dateIndexes);
    const spend = advSumSubset(company.spend, dateIndexes);
    const orders = advSumSubset(company.orders, dateIndexes);
    const newCustomers = advSumSubset(company.newCustomers, dateIndexes);
    const sessions = advSumSubset(company.sessions, dateIndexes);

    const cpo = orders ? spend / orders : 0;
    const cac = newCustomers ? spend / newCustomers : 0;
    const cvr = sessions ? (orders / sessions) * 100 : 0;
    const rps = sessions ? netRevenue / sessions : 0;

    const isChecked = selectedChannels.indexOf(channel.id) !== -1;
    const checkedAttr = isChecked ? "checked" : "";

    return (
      "<tr>" +
      '<td><input type="checkbox" class="adv-channel-checkbox" data-adv-channel="' + channel.id + '" ' + checkedAttr + " /></td>" +
      "<td>" + channel.label + "</td>" +
      "<td>" + netRevenue.toFixed(2) + "</td>" +
      "<td>" + spend.toFixed(2) + "</td>" +
      "<td>" + orders.toLocaleString() + "</td>" +
      "<td>" + cpo.toFixed(2) + "</td>" +
      "<td>" + newCustomers.toLocaleString() + "</td>" +
      "<td>" + cac.toFixed(2) + "</td>" +
      "<td>" + sessions.toLocaleString() + "</td>" +
      "<td>" + cvr.toFixed(2) + "%</td>" +
      "<td>" + rps.toFixed(2) + "</td>" +
      "</tr>"
    );
  }).join("");

  tbody.innerHTML = rowsHtml;
}

/* ============================================================
   8. Company & Metric dropdowns (build items from JSON)
   ============================================================ */

function advInitCompanyDropdown(companies) {
  if (!Array.isArray(companies) || !companies.length) return;

  document.querySelectorAll(".company-dd-link-select").forEach(function (wrapper) {
    var scriptHolder = wrapper.querySelector(".company-select-script");
    var listContainer = scriptHolder ? scriptHolder.parentElement : wrapper;

    Array.prototype.slice.call(listContainer.children).forEach(function (child) {
      if (child === scriptHolder) return;
      listContainer.removeChild(child);
    });

    companies.forEach(function (comp) {
      var item = document.createElement("div");
      item.className = "filter-dropdown-item";
      item.setAttribute("data-dropdown", comp.id);

      var text = document.createElement("div");
      text.className = "dropdown-item-text";
      text.textContent = comp.name;

      item.appendChild(text);
      listContainer.appendChild(item);
    });

    var label = wrapper.querySelector(".company-dd-selected");
    if (label && companies[0]) {
      label.textContent = companies[0].name;
    }
  });
}

function advApplyCompanySelection(item) {
  if (!item) return;

  var wrapper = item.closest(".company-dd-link-select");
  if (!wrapper) return;

  var value = item.getAttribute("data-dropdown");
  var textEl = item.querySelector(".dropdown-item-text") || item;
  var selectedText = (textEl.textContent || "").trim();

  var target = wrapper.querySelector(".company-dd-selected");
  if (target) target.textContent = selectedText;

  var tab = document.querySelector('[data-w-tab="' + value + '"]');
  if (tab) tab.click();

  if (window._advCurrentChart && typeof window._advCurrentChart.setCompany === "function") {
    window._advCurrentChart.setCompany(value);
  }
}

// Metric dropdown

function advInitMetricDropdown(metrics, labelsMap) {
  if (!Array.isArray(metrics) || !metrics.length) return;

  document.querySelectorAll(".chart-metric-dd-select").forEach(function (wrapper) {
    var scriptHolder = wrapper.querySelector(".chart-metric-select-script");
    var listContainer = scriptHolder ? scriptHolder.parentElement : wrapper;

    Array.prototype.slice.call(listContainer.children).forEach(function (child) {
      if (child === scriptHolder) return;
      listContainer.removeChild(child);
    });

    metrics.forEach(function (metricId) {
      var item = document.createElement("div");
      item.className = "filter-dropdown-item";
      item.setAttribute("data-dropdown", metricId);

      var text = document.createElement("div");
      text.className = "dropdown-item-text";
      text.textContent = labelsMap[metricId] || metricId;

      item.appendChild(text);
      listContainer.appendChild(item);
    });

    var label = wrapper.querySelector(".chart-metric-dd-selected");
    if (label && metrics[0]) {
      label.textContent = labelsMap[metrics[0]] || metrics[0];
    }
  });
}

function advApplyMetricSelection(item) {
  if (!item) return;

  var wrapper = item.closest(".chart-metric-dd-select");
  if (!wrapper) return;

  var value = item.getAttribute("data-dropdown");
  var textEl = item.querySelector(".dropdown-item-text") || item;
  var selectedText = (textEl.textContent || "").trim();

  var target = wrapper.querySelector(".chart-metric-dd-selected");
  if (target) target.textContent = selectedText;

  var tab = document.querySelector('[data-w-tab="' + value + '"]');
  if (tab) tab.click();

  if (window._advCurrentChart && typeof window._advCurrentChart.setMetric === "function") {
    window._advCurrentChart.setMetric(value);
  }
}

// Global click handler for company + metric dropdowns
document.addEventListener("click", function (event) {
  var companyItem = event.target.closest(".company-dd-link-select [data-dropdown]");
  if (companyItem) {
    advApplyCompanySelection(companyItem);
    var dd1 = companyItem.closest(".dropdown, .w-dropdown");
    if (dd1 && window.$) {
      $(dd1).triggerHandler("w-close.w-dropdown");
    }
    return;
  }

  var metricItem = event.target.closest(".chart-metric-dd-select [data-dropdown]");
  if (metricItem) {
    advApplyMetricSelection(metricItem);
    var dd2 = metricItem.closest(".dropdown, .w-dropdown");
    if (dd2 && window.$) {
      $(dd2).triggerHandler("w-close.w-dropdown");
    }
  }
});

/* ============================================================
   9. Init chart + table (Webflow entry)
   ============================================================ */

function advInitChart(wrapper, jsonUrl) {
  const canvas = wrapper.querySelector("canvas");
  if (!canvas) {
    console.error("[ADV] Canvas not found inside wrapper.");
    return;
  }

  const table = document.getElementById("adv-channel-table");
  const tbody = table ? table.querySelector("tbody") : null;

  // State inside this chart instance
  let jsonData = null;
  let selectedChannels = [];     // single channel at a time
  let startDate = null;
  let endDate = null;
  let metric = "netRevenue";
  let mode = "direct";           // direct | consolidate
  let valueType = "absolute";    // absolute | percent
  let currentCompanyId = null;   // for table only

  advLoadNewJSON(jsonUrl)
    .then(function (json) {
      jsonData = json;

      const allDates = jsonData.dates || [];
      const channels = jsonData.channels || [];
      if (!allDates.length || !channels.length) {
        console.error("[ADV] json.dates or json.channels is missing/empty in", jsonUrl);
        return;
      }

      // Save bounds for external date UI
      window._advDateBounds = {
        min: allDates[0],
        max: allDates[allDates.length - 1]
      };

      // Company list from first channel
      const firstChannel = channels[0];
      if (firstChannel && Array.isArray(firstChannel.companies) && firstChannel.companies.length) {
        const companyList = firstChannel.companies.map(function (c) {
          return { id: c.id, name: c.name };
        });
        advInitCompanyDropdown(companyList);
        if (!currentCompanyId) {
          currentCompanyId = companyList[0].id;
        }
      }

      // Metric list from json.baseMetrics or infer from first company
      var metricList = [];
      if (Array.isArray(jsonData.baseMetrics) && jsonData.baseMetrics.length) {
        metricList = jsonData.baseMetrics.slice();
      } else if (firstChannel && firstChannel.companies && firstChannel.companies[0]) {
        metricList = Object.keys(firstChannel.companies[0]).filter(function (key) {
          return Array.isArray(firstChannel.companies[0][key]);
        });
      }

      var metricLabels = {
        netRevenue: "Net Revenue",
        spend: "Spend",
        orders: "Orders",
        newCustomers: "New Customers",
        sessions: "Sessions"
      };

      if (metricList.length) {
        advInitMetricDropdown(metricList, metricLabels);
        if (metricList.indexOf(metric) === -1) {
          metric = metricList[0];
        }
      }

      // Default selected channel = first channel only
      selectedChannels = [channels[0].id];

      // Initial render and bindings
      renderChartAndTable();
      connectTableCheckbox();
      connectModeSwitch();
    })
    .catch(function (err) {
      console.error("[ADV] Failed to load JSON:", err);
    });

  // Expose controller for external UI (date + channels + company + metric)
  window._advCurrentChart = {
    setDateRange: function (start, end) {
      if (start) startDate = start;
      if (end) endDate = end;
      renderChartAndTable();
    },
    setChannels: function (channelIds) {
      if (Array.isArray(channelIds) && channelIds.length) {
        selectedChannels = channelIds.slice(0, 1); // keep first only
      }
      renderChartAndTable();
    },
    setCompany: function (companyId) {
      currentCompanyId = companyId;
      renderChartAndTable();
    },
    setMetric: function (metricId) {
      metric = metricId;
      renderChartAndTable();
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
          renderChartAndTable();
        });
      }

      if (btnConsolidate) {
        btnConsolidate.addEventListener("click", function () {
          mode = "consolidate";
          setActive(btnConsolidate, [btnDirect]);
          renderChartAndTable();
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
          renderChartAndTable();
        });
      }

      if (btnPercent) {
        btnPercent.addEventListener("click", function () {
          valueType = "percent";
          setActive(btnPercent, [btnAbsolute]);
          renderChartAndTable();
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

  /* ---------- Checkbox listener on table (single select) ---------- */

  function connectTableCheckbox() {
    if (!tbody) return;

    tbody.addEventListener("change", function (event) {
      const cb = event.target.closest(".adv-channel-checkbox");
      if (!cb) return;

      const channelId = cb.getAttribute("data-adv-channel");
      if (!channelId) return;

      if (cb.checked) {
        Array.prototype.slice.call(
          tbody.querySelectorAll(".adv-channel-checkbox")
        ).forEach(function (el) {
          if (el !== cb) el.checked = false;
        });
        selectedChannels = [channelId];
      } else {
        // prevent zero checked, keep this one
        cb.checked = true;
        selectedChannels = [channelId];
      }

      renderChartAndTable();
    });
  }

  /* ---------- Render with current state ---------- */

  function renderChartAndTable() {
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

    const channels = jsonData.channels || [];
    if (!selectedChannels.length && channels.length) {
      selectedChannels = [channels[0].id];
    }

    // Chart: all companies (per selected channel, per date range)
    const payload = advBuildChartPayload({
      json: jsonData,
      channelIds: selectedChannels,
      dateIndexes: dateIndexes,
      metric: metric,
      mode: mode,
      valueType: valueType
    });

    advRenderLineChart(canvas, payload, valueType);

    // Table: currentCompanyId
    if (tbody) {
      if (!currentCompanyId && channels.length && channels[0].companies && channels[0].companies.length) {
        currentCompanyId = channels[0].companies[0].id;
      }
      advRenderChannelTable(jsonData, tbody, selectedChannels, dateIndexes, currentCompanyId);
    }
  }
}

/* Expose globally */
window.advInitChart = advInitChart;

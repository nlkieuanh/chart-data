/***********************************************************
 * ADV FUNCTION TABLE + CHART (metric + company + channel)
 * - Works with adv-channel-new.json
 * - Chart: all companies for selected channel(s), per date range
 * - Table: one company at a time (selected via dropdown), per date range
 * - Shared date filter (via _advCurrentChart.setDateRange)
 * - Shared channel selection (checkbox in table)
 * - Metric dropdown to choose which metric to plot in chart
 *
 * **UPDATE:** Logic for setDateRange updated to filter both Chart and Table.
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
  if (!conf || !conf.format) {
    return v.toFixed(2);
  }

  if (conf.format === "percent") {
    return v.toFixed(2) + "%";
  }

  if (conf.format === "int") {
    return Math.round(v).toLocaleString();
  }

  // default: decimal
  return v.toFixed(2);
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

  // Ensure startDate and endDate are valid Date objects for comparison
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;

  // If no date range is set, return all indexes
  if (!start || !end) {
    return dates.map((_, i) => i);
  }

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

  // If dateIndexes is not provided or empty, return the full array
  if (!dateIndexes || !dateIndexes.length) return fullArray;

  // Return the subset of the array based on dateIndexes
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
  if (!tbody || !json) return;

  var channels = json.channels || [];
  var dates = json.dates || [];
  if (!dates.length || !channels.length) return;

  var metricsConfig = advGetBaseMetricsConfig(json);

  var dateIdx = [];
  if (Array.isArray(dateIndexes) && dateIndexes.length) {
    dateIdx = dateIndexes.slice();
  } else {
    // Fallback to all dates if dateIndexes is not provided/invalid
    dateIdx = dates.map(function (_, i) { return i; });
  }

  if (!Array.isArray(selectedChannels)) {
    selectedChannels = [];
  }

  var rowsHtml = channels.map(function (channel, index) {
    var companies = channel.companies || [];
    var company =
      companies.find(function (c) { return c.id === companyId; }) ||
      companies.find(function (c) { return c.id === "your-company"; }) ||
      companies[0];

    if (!company) return "";

    var ctx = {};
    metricsConfig.forEach(function (conf) {
      var arr = company[conf.key];
      // Sử dụng dateIdx đã được filter
      ctx[conf.id] = advSumSubset(arr, dateIdx); 
    });

    // Checkbox logic for single selection/default selection
    var isChecked =
      selectedChannels.length === 0
        ? index === 0
        : selectedChannels.indexOf(channel.id) !== -1;
    var checkedAttr = isChecked ? " checked" : "";

    var html =
      "<tr>" +
      '<td><input type="checkbox" class="adv-channel-checkbox" data-adv-channel="' +
      channel.id +
      '"' +
      checkedAttr +
      " /></td>" +
      "<td>" + (channel.label || channel.id) + "</td>";

    metricsConfig.forEach(function (conf) {
      var val = ctx[conf.id] || 0;
      html += "<td>" + advFormatMetricValue(conf, val) + "</td>";
    });

    html += "</tr>";
    return html;
  }).join("");

  tbody.innerHTML = rowsHtml;
}


/* ============================================================
   8. Company & Metric dropdowns (build items from JSON)
   ============================================================ */

function advInitCompanyDropdown(cardEl, companies) {
  if (!Array.isArray(companies) || !companies.length) return;

  cardEl.querySelectorAll(".company-dd-link-select").forEach(function (wrapper) {
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

  var card = wrapper.closest(".card-block-wrap");
  var ctrl = card && card._advController;
  // removed setChannels auto-call
          }
        }

        // --- EDITED: Expose the Rebuild function ---
        card._advRebuildTable = buildRows;

        var selectedCompanyId = (function () {
          var companies0 = channels[0].companies || [];
          return (companies0[0] && companies0[0].id) || "your-company";
        })();

        // Initial render: uses full date range, first company
        buildRows(selectedCompanyId, defaultIndexes, [channels[0].id]);
      })
      .catch(function (err) {
        console.error("[ADV] Failed to init table:", err);
      });
  }

  window.advInitTable = advInitTable;
})();

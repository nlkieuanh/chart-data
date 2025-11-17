/***********************************************************
 * ADV FUNCTION NEW — FULL ENGINE
 * Supports: new JSON structure, date range, channel filter,
 * consolidate, percent, preserves old chart rendering logic.
 ***********************************************************/

/* ========== Helpers ========== */
function advToISODate(d) {
  if (!(d instanceof Date)) return "";
  return d.toISOString().split("T")[0];
}

/* ============================================================
   1. Load JSON new structure
   ============================================================ */
async function advLoadNewJSON(url) {
  const res = await fetch(url);
  return await res.json();
}


/* ============================================================
   2. Filter date range → return index array
   ============================================================ */
function advFilterDateRange(dates, startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  return dates.reduce((acc, d, i) => {
    const dd = new Date(d);
    if (dd >= start && dd <= end) acc.push(i);
    return acc;
  }, []);
}


/* ============================================================
   3. Extract metric series for (channel + company + metric)
   ============================================================ */
function advGetMetricSeries(json, channelId, companyId, metric, dateIndexes) {
  const channel = json.channels.find(c => c.id === channelId);
  if (!channel) return [];

  const company = channel.companies.find(c => c.id === companyId);
  if (!company) return [];

  const fullArray = company[metric] || [];
  if (!dateIndexes.length) return fullArray;

  return dateIndexes.map(i => fullArray[i]);
}


/* ============================================================
   4. Consolidate multiple channels (sum arrays)
   ============================================================ */
function advConsolidateChannels(seriesList) {
  if (!seriesList.length) return [];
  const length = seriesList[0].length;
  const result = new Array(length).fill(0);

  seriesList.forEach(arr => {
    arr.forEach((v, i) => result[i] += v);
  });

  return result;
}


/* ============================================================
   5. Convert absolute → percent
   ============================================================ */
function advToPercent(values, total) {
  return values.map((v, i) => {
    const t = total[i] || 0;
    return t === 0 ? 0 : (v / t) * 100;
  });
}


/* ============================================================
   6. Adapter: Convert NEW JSON → OLD CHART FORMAT
   ============================================================ */
function advBuildChartPayload({
  json,
  channelIds,
  dateIndexes,
  metric = "netRevenue",
  mode = "direct",       // direct | consolidate
  valueType = "absolute" // absolute | percent
}) {
  const periods = dateIndexes.map(i => json.dates[i]);
  const yourCompanyId = "your-company";

  let yourCompanySeries = [];
  let competitorSeries = [];

  /* DIRECT MODE */
  if (mode === "direct") {
    const firstChannel = channelIds[0];
    yourCompanySeries = advGetMetricSeries(json, firstChannel, yourCompanyId, metric, dateIndexes);

    competitorSeries = channelIds.map(ch => {
      const channel = json.channels.find(c => c.id === ch);
      if (!channel) return [];
      return channel.companies
        .filter(c => c.id !== yourCompanyId)
        .map(comp => ({
          name: comp.name,
          color: comp.color,
          values: advGetMetricSeries(json, ch, comp.id, metric, dateIndexes)
        }));
    }).flat();
  }

  /* CONSOLIDATE MODE */
  if (mode === "consolidate") {
    const yourSeriesList = channelIds.map(ch =>
      advGetMetricSeries(json, ch, yourCompanyId, metric, dateIndexes)
    ).filter(arr => arr.length);

    if (yourSeriesList.length) {
      yourCompanySeries = advConsolidateChannels(yourSeriesList);
    }

    const compGroups = {};
    channelIds.forEach(ch => {
      const channel = json.channels.find(c => c.id === ch);
      if (!channel) return;

      channel.companies.forEach(comp => {
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

    competitorSeries = Object.values(compGroups).map(group => ({
      name: group.name,
      color: group.color,
      values: advConsolidateChannels(group.list)
    }));
  }

  /* VALUE TYPE = percent */
  if (valueType === "percent" && yourCompanySeries.length) {
    const total = yourCompanySeries.map((_, i) => {
      let s = yourCompanySeries[i];
      competitorSeries.forEach(c => s += c.values[i]);
      return s;
    });

    yourCompanySeries = advToPercent(yourCompanySeries, total);
    competitorSeries = competitorSeries.map(comp => ({
      ...comp,
      values: advToPercent(comp.values, total)
    }));
  }

  /* Final payload compatible with old chart system */
  return {
    chartType: "line", // can be changed by UI selection
    periods,
    yourCompany: {
      name: "Your Company",
      color: "#3366cc",
      values: yourCompanySeries
    },
    competitors: competitorSeries
  };
}


/* ============================================================
   7. MAIN RENDER FUNCTION (called by advInitChart)
   ============================================================ */
async function advRenderNewChart({
  jsonUrl,
  channelIds,
  startDate,
  endDate,
  metric,
  mode,
  valueType
}) {
  const json = await advLoadNewJSON(jsonUrl);

  // Save bounds so date dropdown script can use them
  if (json && Array.isArray(json.dates) && json.dates.length) {
    window._advDateBounds = {
      min: json.dates[0],
      max: json.dates[json.dates.length - 1]
    };
  }

  // Default: last 7 days from max date if start/end not provided
  let s = startDate;
  let e = endDate;

  if (!s || !e) {
    const allDates = json.dates || [];
    if (allDates.length) {
      const endObj = new Date(allDates[allDates.length - 1]);
      const startObj = new Date(endObj);
      startObj.setDate(startObj.getDate() - 6); // last 7 days
      s = advToISODate(startObj);
      e = advToISODate(endObj);
    }
  }

  const dateIndexes = advFilterDateRange(json.dates, s, e);

  const payload = advBuildChartPayload({
    json,
    channelIds,
    dateIndexes,
    metric,
    mode,
    valueType
  });

  if (window.drawChart) {
    window.drawChart(payload);
  } else {
    console.warn("drawChart(payload) is not defined.");
  }
}


/* ============================================================
   8. ADV INIT CHART — WEBFLOW ENTRY POINT
   ============================================================ */
function advInitChart(wrapper, jsonUrl) {
  const canvas = wrapper.querySelector("canvas");
  if (!canvas) {
    console.error("Canvas not found inside wrapper.");
    return;
  }

  // Default config
  let selectedChannels = ["facebook"]; // fallback, later can be checkbox
  let startDate = null;               // null = auto last 7 days
  let endDate = null;                 // null = auto last 7 days
  let metric = "netRevenue";
  let mode = "direct";        // direct | consolidate
  let valueType = "absolute"; // absolute | percent

  // Expose controller for date dropdown UI
  window._advCurrentChart = {
    setDateRange: function (start, end) {
      if (start) startDate = start;
      if (end) endDate = end;
      refreshChart();
    }
  };

  /* ------------- MODE / VALUE SWITCH USING WEBFLOW CLASSES ------------- */
  function connectModeSwitch() {
    const modeWrapper = wrapper.querySelector(".chart-switch-mode-btn");
    const valueWrapper = wrapper.querySelector(".chart-switch-value-btn");

    // Mode: direct / consolidate
    if (modeWrapper) {
      const btnDirect = modeWrapper.querySelector(".btn-direct");
      const btnConsolidate = modeWrapper.querySelector(".btn-consolidate");

      if (btnDirect) {
        btnDirect.addEventListener("click", function () {
          mode = "direct";
          setActive(btnDirect, [btnConsolidate]);
          refreshChart();
        });
      }

      if (btnConsolidate) {
        btnConsolidate.addEventListener("click", function () {
          mode = "consolidate";
          setActive(btnConsolidate, [btnDirect]);
          refreshChart();
        });
      }
    }

    // Value: absolute / percent
    if (valueWrapper) {
      const btnAbsolute = valueWrapper.querySelector(".btn-absolute");
      const btnPercent = valueWrapper.querySelector(".btn-percent");

      if (btnAbsolute) {
        btnAbsolute.addEventListener("click", function () {
          valueType = "absolute";
          setActive(btnAbsolute, [btnPercent]);
          refreshChart();
        });
      }

      if (btnPercent) {
        btnPercent.addEventListener("click", function () {
          valueType = "percent";
          setActive(btnPercent, [btnAbsolute]);
          refreshChart();
        });
      }
    }
  }

  // Small helper to toggle active class
  function setActive(activeEl, others) {
    activeEl.classList.add("is-active");
    (others || []).forEach(el => {
      if (el) el.classList.remove("is-active");
    });
  }

  /* ------------- CHANNEL CHECKBOX (OPTIONAL, LATER) ------------- */
  function connectChannelCheckbox() {
    const checkboxes = document.querySelectorAll("[data-adv-channel]");
    if (!checkboxes.length) return;

    checkboxes.forEach(cb => {
      cb.addEventListener("change", () => {
        selectedChannels = Array.from(
          document.querySelectorAll("[data-adv-channel]:checked")
        ).map(el => el.getAttribute("data-adv-channel"));
        if (!selectedChannels.length) {
          selectedChannels = ["facebook"];
        }
        refreshChart();
      });
    });

    const initSelected = Array.from(
      document.querySelectorAll("[data-adv-channel]:checked")
    ).map(el => el.getAttribute("data-adv-channel"));
    if (initSelected.length) {
      selectedChannels = initSelected;
    }
  }

  /* ------------- RENDER CHART ------------- */
  function refreshChart() {
    advRenderNewChart({
      jsonUrl,
      channelIds: selectedChannels,
      startDate,
      endDate,
      metric,
      mode,
      valueType
    });
  }

  /* ------------- INIT FLOW ------------- */
  connectChannelCheckbox(); // safe even if you have no checkbox yet
  connectModeSwitch();
  refreshChart();
}


/* Expose to global */
window.advInitChart = advInitChart;
window.advRenderNewChart = advRenderNewChart;

<script>
(function () {
  function formatDateISO(d) {
    return d.toISOString().split("T")[0];
  }

  function getBoundsOrFallback(wrapper) {

    const card = wrapper.closest(".card-block-wrap");
    const bounds = card && card._advDateBounds;

    if (bounds && bounds.min && bounds.max) {
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

  function getController(wrapper) {
    const card = wrapper.closest(".card-block-wrap");
    return card && card._advController;
  }

  function applySelection(item) {
    if (!item) return;

    const wrapper = item.closest(".date-range-dd-select");
    if (!wrapper) return;

    const value = item.getAttribute("data-dropdown");
    const textEl = item.querySelector(".dropdown-item-text") || item;
    const selectedText = (textEl.textContent || "").trim();

    const labelEl = wrapper.querySelector(".date-range-dd-selected");
    if (labelEl) labelEl.textContent = selectedText;

    const tab = document.querySelector('[data-w-tab="' + value + '"]');
    if (tab) tab.click();

    const chartCtrl = getController(wrapper);
    const bounds = getBoundsOrFallback(wrapper);
    if (!chartCtrl) return;

    // default = last 7 days
    if (value === "default") {
      const end = bounds.max;
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      chartCtrl.setDateRange(formatDateISO(start), formatDateISO(end));
    }

    // last month
    if (value === "lastMonth") {
      const end = new Date(bounds.max.getFullYear(), bounds.max.getMonth(), 0); 
      const start = new Date(end.getFullYear(), end.getMonth(), 1);            
      chartCtrl.setDateRange(formatDateISO(start), formatDateISO(end));
    }

    // customRange
  }

  function onChange(selectedDates, dateStr, instance) {
    const input = instance.input;
    const wrapper = input.closest(".date-range-dd-select");
    if (!wrapper) return;

    const labelEl = wrapper.querySelector(".date-range-dd-selected");
    const chartCtrl = getController(wrapper);
    if (!labelEl || !chartCtrl) return;

    const fmt = { day: "2-digit", month: "short", year: "numeric" };

    if (selectedDates.length === 0) return;

    if (selectedDates.length === 1) {
      const d = selectedDates[0];
      labelEl.textContent = d.toLocaleDateString(undefined, fmt);
      return;
    }

    const start = selectedDates[0];
    const end = selectedDates[1];

    labelEl.textContent =
      start.toLocaleDateString(undefined, fmt) +
      " – " +
      end.toLocaleDateString(undefined, fmt);

    chartCtrl.setDateRange(formatDateISO(start), formatDateISO(end));
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".date-range-dd-select").forEach(function (wrapper) {
      const defItem =
        wrapper.querySelector('[data-dropdown="default"]') ||
        wrapper.querySelector("[data-dropdown]");
     
      if (defItem) {
        const textEl = defItem.querySelector(".dropdown-item-text") || defItem;
        const labelEl = wrapper.querySelector(".date-range-dd-selected");
        if (labelEl && textEl) {
          labelEl.textContent = (textEl.textContent || "").trim();
        }
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
          onChange: onChange
        });
      }
    });
  });

  document.addEventListener("click", function (event) {
    const item = event.target.closest(".date-range-dd-select [data-dropdown]");
    if (!item) return;

    if (item.tagName === "INPUT" || item.tagName === "TEXTAREA") return;

    applySelection(item);

    const dd = item.closest(".dropdown, .w-dropdown");
    if (dd && window.$) {
      $(dd).triggerHandler("w-close.w-dropdown");
    }
  });
})();
</script>

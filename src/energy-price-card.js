/**
 * Energy Price Card for Home Assistant
 *
 * Shows the current electricity price (GBP) based on a fixed schedule of
 * time bands, and switches automatically when a band starts or ends.
 *
 * Example config:
 *
 *   type: custom:energy-price-card
 *   title: Electricity
 *   default_price: 24.5        # pence/kWh when no band matches
 *   rates:
 *     - start: "17:00"
 *       end: "19:00"
 *       price: 41
 *       label: Peak
 *     - start: "00:30"
 *       end: "05:30"
 *       price: 7.5
 *       label: Off-peak
 *
 * Bands are checked top to bottom and the first match wins, so put more
 * specific bands (e.g. weekday-only) above general ones.
 */

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DEFAULT_THRESHOLDS = { low: 15, high: 30 };

function parseTime(value, field) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) throw new Error(`${field} must be in HH:MM format, got "${value}"`);
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (minutes > 1440 || Number(match[2]) > 59) {
    throw new Error(`${field} is not a valid time: "${value}"`);
  }
  return minutes;
}

function parseDays(days) {
  if (days === undefined) return null;
  const list = Array.isArray(days) ? days : String(days).split(",");
  return new Set(
    list.map((d) => {
      const idx = DAY_NAMES.indexOf(String(d).trim().toLowerCase().slice(0, 3));
      if (idx === -1) throw new Error(`Unknown day "${d}" (use mon, tue, wed...)`);
      return idx;
    })
  );
}

function minutesOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function previousDay(day) {
  return (day + 6) % 7;
}

class EnergyPriceCard extends HTMLElement {
  setConfig(config) {
    const rateList = Array.isArray(config.rates) ? config.rates : [];
    if (rateList.length === 0 && config.default_price === undefined) {
      throw new Error("Add at least one rate or a default price");
    }

    const rates = rateList.map((rate, i) => {
      if (typeof rate.price !== "number") {
        throw new Error(`rates[${i}].price must be a number (pence per kWh)`);
      }
      return {
        start: parseTime(rate.start, `rates[${i}].start`),
        end: parseTime(rate.end, `rates[${i}].end`),
        price: rate.price,
        label: rate.label ?? "",
        color: rate.color,
        days: parseDays(rate.days),
      };
    });

    this._config = {
      title: config.title ?? "Electricity Price",
      default_price: config.default_price ?? null,
      default_label: config.default_label ?? "Standard",
      display: config.display === "pounds" ? "pounds" : "pence",
      decimals: config.decimals,
      thresholds: { ...DEFAULT_THRESHOLDS, ...(config.thresholds ?? {}) },
      show_next: config.show_next !== false,
      show_schedule: config.show_schedule === true,
      show_peak: config.show_peak !== false,
      show_cheapest: config.show_cheapest !== false,
      peak_hours: config.peak_hours ?? 48,
      rates,
    };

    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._render();
  }

  // Not used for the price itself, but HA expects cards to accept it.
  set hass(hass) {
    this._hass = hass;
  }

  connectedCallback() {
    this._render();
    this._scheduleTick();
  }

  disconnectedCallback() {
    clearTimeout(this._timer);
  }

  getCardSize() {
    return this._config?.show_schedule ? 4 : 2;
  }

  static getConfigElement() {
    return document.createElement("energy-price-card-editor");
  }

  static getStubConfig() {
    return {
      title: "Electricity",
      default_price: 24.5,
      rates: [
        { start: "17:00", end: "19:00", price: 41, label: "Peak" },
        { start: "00:30", end: "05:30", price: 7.5, label: "Off-peak" },
      ],
    };
  }

  // Re-render at the start of every minute so changes land on time.
  _scheduleTick() {
    clearTimeout(this._timer);
    const now = new Date();
    const msToNextMinute = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
    this._timer = setTimeout(() => {
      this._render();
      this._scheduleTick();
    }, msToNextMinute + 50);
  }

  _rateMatches(rate, date) {
    const mins = minutesOfDay(date);
    const day = date.getDay();
    const dayOk = (d) => rate.days === null || rate.days.has(d);

    if (rate.start === rate.end) return dayOk(day); // all day
    if (rate.start < rate.end) {
      return dayOk(day) && mins >= rate.start && mins < rate.end;
    }
    // Overnight band, e.g. 23:00 -> 06:00. Days refer to the starting day.
    if (mins >= rate.start) return dayOk(day);
    if (mins < rate.end) return dayOk(previousDay(day));
    return false;
  }

  _rateAt(date) {
    const rate = this._config.rates.find((r) => this._rateMatches(r, date));
    if (rate) return rate;
    if (this._config.default_price === null) return null;
    return { price: this._config.default_price, label: this._config.default_label };
  }

  // Every band start/end after `now`, covering at least `days` days, sorted.
  _boundaries(now, days) {
    const candidates = [];
    for (let offset = 0; offset <= days; offset++) {
      for (const rate of this._config.rates) {
        for (const mins of [rate.start, rate.end]) {
          const d = new Date(now);
          d.setHours(0, 0, 0, 0);
          d.setDate(d.getDate() + offset);
          d.setMinutes(mins);
          if (d > now) candidates.push(d);
        }
      }
    }
    return candidates.sort((a, b) => a - b);
  }

  // Find the next moment the price actually changes by checking every
  // band boundary over the coming week.
  _nextChange(now, current) {
    const currentPrice = current?.price ?? null;
    for (const when of this._boundaries(now, 7)) {
      const rate = this._rateAt(when);
      if ((rate?.price ?? null) !== currentPrice) return { when, rate };
    }
    return null;
  }

  // Highest (or lowest) price between now and `hours` ahead, and when it
  // first starts. `better(a, b)` is true when price a beats price b.
  _extremeAhead(now, current, hours, better) {
    const limit = new Date(now.getTime() + hours * 3600 * 1000);
    let best = current ? { when: now, rate: current } : null;
    for (const when of this._boundaries(now, Math.ceil(hours / 24) + 1)) {
      if (when >= limit) break;
      const rate = this._rateAt(when);
      if (rate && (!best || better(rate.price, best.rate.price))) best = { when, rate };
    }
    return best;
  }

  _aheadHtml(title, found, now) {
    if (!found) return "";
    return `<div class="peak">
           <span>${title} in next ${this._config.peak_hours}h</span>
           <span>
             <strong style="color:${this._colorFor(found.rate)}">${this._formatPrice(found.rate.price)}</strong>
             ${found.when === now ? "now" : `at ${this._formatTime(found.when, now)}`}
             ${found.rate.label ? `(${found.rate.label})` : ""}
           </span>
         </div>`;
  }

  _formatPrice(price) {
    if (price === null || price === undefined) return "—";
    const { display, decimals } = this._config;
    if (display === "pounds") {
      return `£${(price / 100).toFixed(decimals ?? 2)}`;
    }
    const dp = decimals ?? (Number.isInteger(price) ? 0 : 2);
    return `${price.toFixed(dp)}p`;
  }

  _formatTime(date, now) {
    const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const sameDay = date.toDateString() === now.toDateString();
    if (sameDay) return time;
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    if (date.toDateString() === tomorrow.toDateString()) return `${time} tomorrow`;
    return `${date.toLocaleDateString([], { weekday: "short" })} ${time}`;
  }

  _colorFor(rate) {
    if (!rate) return "var(--disabled-text-color, grey)";
    if (rate.color) return rate.color;
    const { low, high } = this._config.thresholds;
    if (rate.price < low) return "var(--success-color, #43a047)";
    if (rate.price >= high) return "var(--error-color, #db4437)";
    return "var(--warning-color, #ffa600)";
  }

  _minsToText(mins) {
    const h = String(Math.floor(mins / 60)).padStart(2, "0");
    const m = String(mins % 60).padStart(2, "0");
    return `${h}:${m}`;
  }

  _render() {
    if (!this._config || !this.shadowRoot) return;

    const now = new Date();
    const current = this._rateAt(now);
    const next = this._config.show_next ? this._nextChange(now, current) : null;
    const color = this._colorFor(current);

    const nextHtml = next
      ? `<div class="next">
           Until ${this._formatTime(next.when, now)}, then
           <span style="color:${this._colorFor(next.rate)}">${this._formatPrice(next.rate?.price)}</span>
           ${next.rate?.label ? `(${next.rate.label})` : ""}
         </div>`
      : "";

    const { show_peak, show_cheapest, peak_hours } = this._config;
    const peakHtml = show_peak
      ? this._aheadHtml("Highest", this._extremeAhead(now, current, peak_hours, (a, b) => a > b), now)
      : "";
    const cheapestHtml = show_cheapest
      ? this._aheadHtml("Lowest", this._extremeAhead(now, current, peak_hours, (a, b) => a < b), now)
      : "";

    const scheduleHtml = this._config.show_schedule
      ? `<table class="schedule">
           ${this._config.rates
             .map(
               (r) => `<tr class="${r === current ? "active" : ""}">
                 <td>${this._minsToText(r.start)}–${this._minsToText(r.end)}</td>
                 <td>${r.label}</td>
                 <td class="price" style="color:${this._colorFor(r)}">${this._formatPrice(r.price)}</td>
               </tr>`
             )
             .join("")}
           ${
             this._config.default_price !== null
               ? `<tr class="${current && !this._config.rates.includes(current) ? "active" : ""}">
                    <td>Other times</td><td>${this._config.default_label}</td>
                    <td class="price" style="color:${this._colorFor({ price: this._config.default_price })}">
                      ${this._formatPrice(this._config.default_price)}
                    </td>
                  </tr>`
               : ""
           }
         </table>`
      : "";

    this.shadowRoot.innerHTML = `
      <style>
        ha-card { padding: 16px; }
        .header { display: flex; justify-content: space-between; align-items: baseline; }
        .title { font-size: 1.1em; color: var(--secondary-text-color); }
        .label { font-size: 0.9em; padding: 2px 8px; border-radius: 10px;
                 background: color-mix(in srgb, ${color} 20%, transparent); color: ${color}; }
        .price-big { font-size: 3em; font-weight: 600; line-height: 1.2; color: ${color}; }
        .unit { font-size: 0.4em; font-weight: 400; color: var(--secondary-text-color); }
        .next { color: var(--secondary-text-color); margin-top: 4px; }
        .peak { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px;
                margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--divider-color);
                color: var(--secondary-text-color); }
        .schedule { width: 100%; margin-top: 12px; border-collapse: collapse; font-size: 0.9em; }
        .schedule td { padding: 4px 2px; border-top: 1px solid var(--divider-color); }
        .schedule .price { text-align: right; font-weight: 600; }
        .schedule tr.active td { background: var(--secondary-background-color); }
      </style>
      <ha-card>
        <div class="header">
          <div class="title">${this._config.title}</div>
          ${current?.label ? `<div class="label">${current.label}</div>` : ""}
        </div>
        <div class="price-big">
          ${this._formatPrice(current?.price)}<span class="unit"> /kWh</span>
        </div>
        ${nextHtml}
        ${peakHtml}
        ${cheapestHtml}
        ${scheduleHtml}
      </ha-card>
    `;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Visual editor shown in the dashboard "Edit card" dialog.
 *
 * Text and number fields update the config in place without re-rendering,
 * so the cursor isn't lost while typing. Only structural changes (adding,
 * removing or reordering bands) rebuild the form.
 */
class EnergyPriceCardEditor extends HTMLElement {
  setConfig(config) {
    // Ignore the echo of our own change coming back from HA.
    if (this._lastSent && JSON.stringify(config) === this._lastSent) return;

    const copy = JSON.parse(JSON.stringify(config));
    copy.rates = (copy.rates ?? []).map((rate) => ({
      ...rate,
      days: rate.days === undefined ? undefined : this._normaliseDays(rate.days),
    }));
    this._config = copy;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
  }

  _normaliseDays(days) {
    const list = Array.isArray(days) ? days : String(days).split(",");
    return list.map((d) => String(d).trim().toLowerCase().slice(0, 3));
  }

  _emit() {
    const config = { ...this._config };
    config.rates = config.rates.map((rate) => {
      const clean = { ...rate };
      // No days ticked, or all of them, means every day.
      if (!clean.days || clean.days.length === 0 || clean.days.length === 7) delete clean.days;
      if (!clean.label) delete clean.label;
      if (!clean.color) delete clean.color;
      return clean;
    });

    this._lastSent = JSON.stringify(config);
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config },
        bubbles: true,
        composed: true,
      })
    );
  }

  _setOption(key, value, defaultValue) {
    if (value === "" || value === null || value === undefined || value === defaultValue) {
      delete this._config[key];
    } else {
      this._config[key] = value;
    }
  }

  _onInput(ev) {
    const el = ev.target;
    const key = el.dataset.key;
    if (!key) return;

    const number = el.value === "" ? undefined : Number(el.value);
    if (el.type === "number" && el.value !== "" && Number.isNaN(number)) return;

    if (key.startsWith("rate.")) {
      const [, index, field, day] = key.split(".");
      const rate = this._config.rates[Number(index)];
      if (field === "days") {
        const days = new Set(rate.days ?? []);
        el.checked ? days.add(day) : days.delete(day);
        rate.days = DAY_NAMES.slice(1).concat("sun").filter((d) => days.has(d));
      } else if (field === "price") {
        rate.price = number ?? 0;
      } else {
        rate[field] = el.value;
      }
    } else if (key.startsWith("thresholds.")) {
      const field = key.split(".")[1];
      const thresholds = { ...(this._config.thresholds ?? {}) };
      if (number === undefined || number === DEFAULT_THRESHOLDS[field]) delete thresholds[field];
      else thresholds[field] = number;
      this._setOption("thresholds", Object.keys(thresholds).length ? thresholds : undefined);
    } else if (key === "show_next") {
      this._setOption(key, el.checked, true);
    } else if (key === "show_peak" || key === "show_cheapest") {
      this._setOption(key, el.checked, true);
    } else if (key === "peak_hours") {
      this._setOption(key, number, 48);
    } else if (key === "show_schedule") {
      this._setOption(key, el.checked, false);
    } else if (key === "display") {
      this._setOption(key, el.value, "pence");
    } else if (el.type === "number") {
      this._setOption(key, number);
    } else {
      this._setOption(key, el.value);
    }

    this._emit();
  }

  _onClick(ev) {
    const button = ev.target.closest("button[data-action]");
    if (!button) return;
    const index = Number(button.dataset.index);
    const rates = this._config.rates;

    switch (button.dataset.action) {
      case "add":
        rates.push({ start: "17:00", end: "19:00", price: 0, label: "" });
        break;
      case "remove":
        rates.splice(index, 1);
        break;
      case "up":
        if (index > 0) [rates[index - 1], rates[index]] = [rates[index], rates[index - 1]];
        break;
      case "down":
        if (index < rates.length - 1) [rates[index + 1], rates[index]] = [rates[index], rates[index + 1]];
        break;
    }

    this._render();
    this._emit();
  }

  _renderRate(rate, i, total) {
    const days = new Set(rate.days ?? []);
    const dayBoxes = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
      .map(
        (d) => `<label class="day">
          <input type="checkbox" data-key="rate.${i}.days.${d}" ${days.has(d) ? "checked" : ""}>
          ${d[0].toUpperCase() + d.slice(1)}
        </label>`
      )
      .join("");

    return `
      <div class="rate">
        <div class="rate-head">
          <strong>Band ${i + 1}</strong>
          <span>
            <button data-action="up" data-index="${i}" title="Move up" ${i === 0 ? "disabled" : ""}>▲</button>
            <button data-action="down" data-index="${i}" title="Move down" ${i === total - 1 ? "disabled" : ""}>▼</button>
            <button data-action="remove" data-index="${i}" title="Remove" class="danger">✕</button>
          </span>
        </div>
        <div class="grid">
          <label>Start<input type="time" data-key="rate.${i}.start" value="${escapeHtml(rate.start)}"></label>
          <label>End<input type="time" data-key="rate.${i}.end" value="${escapeHtml(rate.end)}"></label>
          <label>Price (p/kWh)<input type="number" step="0.01" data-key="rate.${i}.price" value="${escapeHtml(rate.price)}"></label>
          <label>Label<input type="text" data-key="rate.${i}.label" value="${escapeHtml(rate.label)}" placeholder="e.g. Peak"></label>
          <label class="wide">Colour<input type="text" data-key="rate.${i}.color" value="${escapeHtml(rate.color)}" placeholder="auto (or e.g. purple, #ff0000)"></label>
        </div>
        <div class="days">${dayBoxes}</div>
        <div class="hint">No days ticked = every day. Bands that run past midnight are fine (e.g. 23:30 → 05:30).</div>
      </div>`;
  }

  _render() {
    if (!this._config) return;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.addEventListener("input", (ev) => this._onInput(ev));
      this.shadowRoot.addEventListener("change", (ev) => this._onInput(ev));
      this.shadowRoot.addEventListener("click", (ev) => this._onClick(ev));
    }

    const c = this._config;
    const thresholds = { ...DEFAULT_THRESHOLDS, ...(c.thresholds ?? {}) };
    const rates = c.rates.map((r, i) => this._renderRate(r, i, c.rates.length)).join("");

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .section { margin-bottom: 16px; }
        h3 { font-size: 1em; margin: 16px 0 8px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; }
        .wide { grid-column: 1 / -1; }
        label { display: flex; flex-direction: column; font-size: 0.85em;
                color: var(--secondary-text-color); gap: 4px; }
        label.check { flex-direction: row; align-items: center; color: var(--primary-text-color); }
        input[type=text], input[type=number], input[type=time], select {
          font: inherit; font-size: 1rem; padding: 8px; border-radius: 4px;
          border: 1px solid var(--divider-color, #ccc);
          background: var(--card-background-color, #fff); color: var(--primary-text-color);
        }
        .rate { border: 1px solid var(--divider-color, #ccc); border-radius: 8px;
                padding: 12px; margin-bottom: 12px; }
        .rate-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .days { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 10px; }
        .day { flex-direction: row; align-items: center; gap: 2px; color: var(--primary-text-color); }
        .hint { font-size: 0.8em; color: var(--secondary-text-color); margin-top: 6px; }
        button { font: inherit; cursor: pointer; border-radius: 4px; padding: 4px 8px;
                 border: 1px solid var(--divider-color, #ccc);
                 background: var(--secondary-background-color); color: var(--primary-text-color); }
        button:disabled { opacity: 0.4; cursor: default; }
        button.danger { color: var(--error-color, #db4437); }
        button.add { width: 100%; padding: 8px; background: var(--primary-color); color: var(--text-primary-color, #fff); border: none; }
      </style>

      <div class="section grid">
        <label class="wide">Title<input type="text" data-key="title" value="${escapeHtml(c.title)}" placeholder="Electricity Price"></label>
        <label>Default price (p/kWh)<input type="number" step="0.01" data-key="default_price" value="${escapeHtml(c.default_price)}" placeholder="used outside bands"></label>
        <label>Default label<input type="text" data-key="default_label" value="${escapeHtml(c.default_label)}" placeholder="Standard"></label>
        <label>Show price as
          <select data-key="display">
            <option value="pence" ${c.display !== "pounds" ? "selected" : ""}>Pence (41p)</option>
            <option value="pounds" ${c.display === "pounds" ? "selected" : ""}>Pounds (£0.41)</option>
          </select>
        </label>
        <label>Decimal places<input type="number" min="0" max="4" data-key="decimals" value="${escapeHtml(c.decimals)}" placeholder="auto"></label>
        <label>Green below (p)<input type="number" step="0.01" data-key="thresholds.low" value="${thresholds.low}"></label>
        <label>Red from (p)<input type="number" step="0.01" data-key="thresholds.high" value="${thresholds.high}"></label>
        <label class="check"><input type="checkbox" data-key="show_next" ${c.show_next !== false ? "checked" : ""}>Show next price change</label>
        <label class="check"><input type="checkbox" data-key="show_peak" ${c.show_peak !== false ? "checked" : ""}>Show highest upcoming price</label>
        <label class="check"><input type="checkbox" data-key="show_cheapest" ${c.show_cheapest !== false ? "checked" : ""}>Show lowest upcoming price</label>
        <label>Look ahead (hours)<input type="number" min="1" max="168" data-key="peak_hours" value="${escapeHtml(c.peak_hours ?? 48)}"></label>
        <label class="check"><input type="checkbox" data-key="show_schedule" ${c.show_schedule ? "checked" : ""}>Show full schedule</label>
      </div>

      <h3>Price bands</h3>
      <div class="hint" style="margin-bottom:8px">Checked top to bottom — the first matching band wins.</div>
      ${rates}
      <button class="add" data-action="add">+ Add price band</button>
    `;
  }
}

customElements.define("energy-price-card", EnergyPriceCard);
customElements.define("energy-price-card-editor", EnergyPriceCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "energy-price-card",
  name: "Energy Price Card",
  preview: true,
  description: "Shows the current electricity price from a time-of-use schedule.",
});

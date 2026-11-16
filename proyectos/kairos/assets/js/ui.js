/* ============================================================
   kairós · ui.js
   Utilidades de interfaz: tema, fechas, toasts y modales
   ============================================================ */
(function () {
  "use strict";

  const K = (window.K = window.K || {});
  const store = K.store;

  /* ---------- fechas ---------- */

  const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const DAYS_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

  function cap(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : str; }

  function parse(iso) {
    if (!iso) return null;
    if (iso instanceof Date) return iso;
    return store.fromISO(iso);
  }

  function longDate(value) {
    const d = parse(value) || new Date();
    return cap(DAYS[d.getDay()] + ", " + d.getDate() + " de " + MONTHS[d.getMonth()]);
  }

  function shortDate(value) {
    const d = parse(value);
    if (!d) return "";
    return d.getDate() + " " + MONTHS_SHORT[d.getMonth()];
  }

  function monthName(value) {
    const d = parse(value) || new Date();
    return cap(MONTHS[d.getMonth()] + " " + d.getFullYear());
  }

  function weekdayShort(value) {
    const d = parse(value) || new Date();
    return DAYS_SHORT[d.getDay()];
  }

  function diffDays(iso) {
    if (!iso) return null;
    const a = store.fromISO(store.todayISO());
    const b = store.fromISO(iso);
    return Math.round((b - a) / 86400000);
  }

  function dueInfo(iso, completed) {
    if (!iso) return { label: "Sin fecha", cls: "" };
    const d = diffDays(iso);
    if (d === 0) return { label: "Hoy", cls: "is-today" };
    if (d === 1) return { label: "Mañana", cls: "is-tomorrow" };
    if (d === -1) return { label: "Ayer", cls: "is-overdue" };
    if (d < -1) return { label: "Hace " + Math.abs(d) + " días", cls: "is-overdue" };
    if (d > 1 && d < 7) return { label: cap(DAYS[parse(iso).getDay()]), cls: "" };
    return { label: shortDate(iso), cls: "" };
  }

  function timeLabel(time) {
    if (!time) return "";
    const parts = String(time).split(":");
    if (parts.length < 2) return time;
    return parts[0] + ":" + parts[1];
  }

  function greeting() {
    const h = new Date().getHours();
    if (h < 6) return "Buenas noches";
    if (h < 12) return "Buenos días";
    if (h < 20) return "Buenas tardes";
    return "Buenas noches";
  }

  function duration(minutes) {
    const m = Math.max(0, Math.round(minutes || 0));
    if (m < 60) return m + " min";
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? h + " h " + rest + " min" : h + " h";
  }

  function relativeCompleted(isoString) {
    const date = store.dateOfISO(isoString);
    if (!date) return "";
    const d = diffDays(date);
    if (d === 0) return "Hoy";
    if (d === -1) return "Ayer";
    return shortDate(date);
  }

  /* ---------- tema ---------- */

  const THEME_KEY = "kairos.theme";

  function systemTheme() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(preference) {
    const pref = preference || localStorage.getItem(THEME_KEY) || "light";
    const resolved = pref === "system" ? systemTheme() : pref;
    document.documentElement.setAttribute("data-theme", resolved);
    try { localStorage.setItem(THEME_KEY, pref); } catch (e) { /* almacenamiento no disponible */ }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", resolved === "dark" ? "#131310" : "#f4f0e8");
    return resolved;
  }

  K.theme = {
    apply: applyTheme,
    current: function () {
      try { return localStorage.getItem(THEME_KEY) || "light"; } catch (e) { return "light"; }
    },
    resolved: function () {
      return document.documentElement.getAttribute("data-theme") || "light";
    },
    init: function () {
      applyTheme();
      if (window.matchMedia) {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
          if (K.theme.current() === "system") applyTheme("system");
        });
      }
    }
  };

  /* ---------- utilidades ---------- */

  function escapeHTML(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function initials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "K";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function debounce(fn, wait) {
    let timer = null;
    return function () {
      const args = arguments;
      const ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }

  function ringMarkup(percent, options) {
    const opts = options || {};
    const size = opts.size || 100;
    const stroke = opts.stroke || 8;
    const radius = 50 - stroke / 2;
    const circumference = 2 * Math.PI * radius;
    const pct = Math.max(0, Math.min(100, Number(percent) || 0));
    const offset = circumference - (pct / 100) * circumference;
    const track = opts.trackClass || "ring-track";
    const fill = opts.fillClass || "ring-fill";
    return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">
      <circle class="${track}" cx="50" cy="50" r="${radius}" fill="none" stroke-width="${stroke}"></circle>
      <circle class="${fill}" cx="50" cy="50" r="${radius}" fill="none" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"></circle>
    </svg>`;
  }

  K.ui = {
    longDate: longDate,
    shortDate: shortDate,
    monthName: monthName,
    weekdayShort: weekdayShort,
    dueInfo: dueInfo,
    diffDays: diffDays,
    timeLabel: timeLabel,
    greeting: greeting,
    duration: duration,
    relativeCompleted: relativeCompleted,
    escape: escapeHTML,
    initials: initials,
    debounce: debounce,
    ring: ringMarkup,
    months: MONTHS,
    monthsShort: MONTHS_SHORT,
    days: DAYS,
    daysShort: DAYS_SHORT
  };

  /* ---------- toasts ---------- */

  function toast(message, options) {
    const opts = options || {};
    let root = document.getElementById("toastRoot");
    if (!root) {
      root = document.createElement("div");
      root.id = "toastRoot";
      root.className = "toast-root";
      root.setAttribute("aria-live", "polite");
      document.body.appendChild(root);
    }
    while (root.children.length >= 3) root.firstElementChild.remove();

    const el = document.createElement("div");
    el.className = "toast" + (opts.type === "success" ? " is-success" : opts.type === "error" ? " is-error" : "");
    el.setAttribute("role", "status");
    const iconName = opts.icon || (opts.type === "success" ? "check" : opts.type === "error" ? "alert" : "sparkle");
    el.innerHTML = `
      <span class="toast-icon">${K.icon(iconName)}</span>
      <span class="toast-msg">${escapeHTML(message)}</span>
      ${opts.actionLabel ? `<button type="button" data-toast-action>${escapeHTML(opts.actionLabel)}</button>` : ""}
      <button type="button" class="icon-btn" data-toast-close aria-label="Cerrar aviso">${K.icon("x")}</button>`;

    let dismissed = false;
    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      el.classList.add("is-leaving");
      setTimeout(function () { el.remove(); }, 240);
    }
    el.querySelector("[data-toast-close]").addEventListener("click", dismiss);
    const action = el.querySelector("[data-toast-action]");
    if (action) {
      action.addEventListener("click", function () {
        if (typeof opts.onAction === "function") opts.onAction();
        dismiss();
      });
    }
    root.appendChild(el);
    setTimeout(dismiss, opts.duration || 3600);
    return { dismiss: dismiss };
  }

  K.toast = toast;

  /* ---------- modales ---------- */

  const modalStack = [];

  function lockScroll() {
    if (modalStack.length === 1) document.body.classList.add("modal-open");
  }
  function unlockScroll() {
    if (!modalStack.length) document.body.classList.remove("modal-open");
  }

  function openModal(config) {
    const cfg = config || {};
    const root = document.getElementById("modalRoot") || document.body;
    const previousFocus = document.activeElement;

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal ${cfg.size === "sm" ? "modal--sm" : ""}" role="dialog" aria-modal="true"
           aria-labelledby="modalTitle" ${cfg.maxWidth ? `style="max-width:${cfg.maxWidth}px"` : ""}>
        <div class="modal-head">
          <div>
            <h2 id="modalTitle">${cfg.title || ""}</h2>
            ${cfg.subtitle ? `<p>${cfg.subtitle}</p>` : ""}
          </div>
          <button type="button" class="icon-btn" data-modal-close aria-label="Cerrar">${K.icon("x")}</button>
        </div>
        <div class="modal-body">${cfg.body || ""}</div>
        ${cfg.foot ? `<div class="modal-head" style="padding-top:0;padding-bottom:22px">${cfg.foot}</div>` : ""}
      </div>`;

    let closed = false;
    const entry = { close: close };
    modalStack.push(entry);
    lockScroll();
    root.appendChild(backdrop);
    document.body.classList.add("modal-open");

    function close() {
      if (closed) return;
      closed = true;
      backdrop.style.animation = "fade-in 150ms reverse";
      const panel = backdrop.querySelector(".modal");
      if (panel) panel.style.animation = "modal-in 150ms reverse";
      setTimeout(function () {
        backdrop.remove();
        const idx = modalStack.indexOf(entry);
        if (idx !== -1) modalStack.splice(idx, 1);
        unlockScroll();
        if (previousFocus && previousFocus.focus) previousFocus.focus();
        if (typeof cfg.onClose === "function") cfg.onClose();
      }, 140);
    }

    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) close();
    });
    backdrop.querySelectorAll("[data-modal-close]").forEach(function (btn) {
      btn.addEventListener("click", close);
    });

    backdrop.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = Array.from(backdrop.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])'
      )).filter(function (el) { return el.offsetParent !== null; });
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    setTimeout(function () {
      const focusTarget = backdrop.querySelector("[autofocus], input:not([type=hidden]), textarea, select, button");
      if (focusTarget) focusTarget.focus();
      if (typeof cfg.onMount === "function") cfg.onMount(backdrop, close);
    }, 30);

    return entry;
  }

  function confirmDialog(config) {
    return new Promise(function (resolve) {
      let settled = false;
      let modal;
      const opts = config || {};
      modal = openModal({
        size: "sm",
        title: opts.title || "¿Confirmar?",
        subtitle: opts.subtitle || "",
        body: `<p style="font-size:13px;line-height:1.6;color:var(--ink-2)">${opts.message || ""}</p>`,
        foot: `<div class="modal-foot" style="padding:0">
            <button type="button" class="btn btn-ghost btn-sm" data-cancel>${opts.cancelLabel || "Cancelar"}</button>
            <button type="button" class="btn ${opts.danger ? "btn-accent" : "btn-primary"} btn-sm" data-confirm>${opts.confirmLabel || "Confirmar"}</button>
          </div>`,
        onMount: function (backdrop, close) {
          backdrop.querySelector("[data-cancel]").addEventListener("click", function () { settled = true; resolve(false); close(); });
          backdrop.querySelector("[data-confirm]").addEventListener("click", function () { settled = true; resolve(true); close(); });
        },
        onClose: function () { if (!settled) resolve(false); }
      });
      return modal;
    });
  }

  K.openModal = openModal;
  K.confirm = confirmDialog;
})();

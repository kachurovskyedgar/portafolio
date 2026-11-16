/* ============================================================
   kairós · app.js
   Router, vistas, interacciones y temporizador de enfoque
   ============================================================ */
(function () {
  "use strict";

  const K = window.K;
  const store = K.store;
  const ui = K.ui;

  const initialUser = store.currentUser();
  if (!initialUser) {
    window.location.replace("acceso.html");
    return;
  }

  let user = initialUser;

  /* ---------- estado ---------- */

  const PAGES = {
    hoy: { title: "Hoy" },
    proximas: { title: "Próximas" },
    todas: { title: "Todas las tareas" },
    completadas: { title: "Completadas" },
    calendario: { title: "Calendario" },
    enfoque: { title: "Enfoque" },
    estadisticas: { title: "Estadísticas" }
  };

  const LIST_VIEWS = ["hoy", "proximas", "todas", "completadas", "calendario"];

  function hashView() {
    const raw = (window.location.hash || "").replace("#", "").trim();
    return PAGES[raw] ? raw : "hoy";
  }

  function defaultFocus() {
    return {
      mode: "focus",
      preset: 25,
      duration: 25 * 60,
      remaining: 25 * 60,
      running: false,
      endAt: null,
      taskId: null
    };
  }

  const focusKey = "kairos.focus." + user.id;

  function loadFocus() {
    try {
      const raw = localStorage.getItem(focusKey);
      if (!raw) return defaultFocus();
      const parsed = JSON.parse(raw);
      const state = Object.assign(defaultFocus(), parsed);
      state.preset = state.mode === "break" ? 5 : Number(state.preset) || 25;
      state.duration = (state.mode === "break" ? 5 : state.preset) * 60;
      state.remaining = Math.max(0, Math.min(state.duration, Number(state.remaining) || state.duration));
      if (state.running && state.endAt) {
        const remaining = Math.ceil((state.endAt - Date.now()) / 1000);
        if (remaining <= 0) {
          state.running = false;
          state.endAt = null;
          state.remaining = state.duration;
        } else {
          state.remaining = remaining;
        }
      }
      return state;
    } catch (e) {
      return defaultFocus();
    }
  }

  const state = {
    view: hashView(),
    search: "",
    status: "pending",
    priority: "all",
    project: "all",
    sort: "smart",
    calMonth: store.todayISO().slice(0, 7) + "-01",
    selectedDay: store.todayISO(),
    focus: loadFocus()
  };

  const els = {
    viewInner: document.getElementById("viewInner"),
    viewRoot: document.getElementById("viewRoot"),
    viewTitle: document.getElementById("viewTitle"),
    viewDate: document.getElementById("viewDate"),
    search: document.getElementById("searchInput"),
    userName: document.getElementById("userName"),
    userEmail: document.getElementById("userEmail"),
    userAvatar: document.getElementById("userAvatar"),
    userMenu: document.getElementById("userMenu"),
    userCard: document.getElementById("userCard"),
    projectNav: document.getElementById("projectNav"),
    streakCard: document.getElementById("streakCard"),
    notifBtn: document.getElementById("notifBtn"),
    notifBadge: document.getElementById("notifBadge"),
    notifPanel: document.getElementById("notifPanel"),
    notifBody: document.getElementById("notifBody"),
    notifCount: document.getElementById("notifCount"),
    themeToggle: document.getElementById("themeToggle"),
    sidebar: document.getElementById("sidebar"),
    sidebarBackdrop: document.getElementById("sidebarBackdrop"),
    menuBtn: document.getElementById("menuBtn"),
    sidebarClose: document.getElementById("sidebarClose")
  };

  let cache = { projects: null, map: null };
  let audioCtx = null;
  let lastDay = store.todayISO();

  /* ---------- helpers ---------- */

  function getProjects() {
    if (!cache.projects) {
      cache.projects = store.projects(user.id);
      cache.map = {};
      cache.projects.forEach(function (p) { cache.map[p.id] = p; });
    }
    return cache.projects;
  }

  function getProject(id) {
    if (!id) return null;
    getProjects();
    return cache.map[id] || null;
  }

  function invalidate() { cache.projects = null; cache.map = null; }

  function allTasks() { return store.tasks(user.id); }
  function pendingTasks() { return allTasks().filter(function (t) { return !t.completed; }); }
  function todayTasks() { return allTasks().filter(function (t) { return t.due === store.todayISO(); }); }

  function matchesSearch(t) {
    const q = state.search.trim().toLowerCase();
    if (!q) return true;
    const p = getProject(t.projectId);
    return (t.title + " " + (t.notes || "") + " " + (p ? p.name : "")).toLowerCase().indexOf(q) !== -1;
  }

  const PRIORITY_WEIGHT = { alta: 0, media: 1, baja: 2 };

  function sortTasks(list, mode) {
    const arr = list.slice();
    const byDue = function (a, b) {
      if (!a.due && !b.due) return 0;
      if (!a.due) return 1;
      if (!b.due) return -1;
      return a.due.localeCompare(b.due);
    };
    const byTime = function (a, b) { return (a.time || "99:99").localeCompare(b.time || "99:99"); };

    if (mode === "priority") {
      arr.sort(function (a, b) {
        return (PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]) || byDue(a, b) || byTime(a, b);
      });
    } else if (mode === "due") {
      arr.sort(function (a, b) { return byDue(a, b) || (PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]) || byTime(a, b); });
    } else if (mode === "created") {
      arr.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
    } else if (mode === "title") {
      arr.sort(function (a, b) { return a.title.localeCompare(b.title, "es"); });
    } else if (mode === "completed") {
      arr.sort(function (a, b) { return String(b.completedAt || "").localeCompare(String(a.completedAt || "")); });
    } else {
      arr.sort(function (a, b) {
        return byDue(a, b) || (PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]) || byTime(a, b);
      });
    }
    return arr;
  }

  function completedToday() {
    const today = store.todayISO();
    return allTasks()
      .filter(function (t) { return t.completed && store.dateOfISO(t.completedAt) === today; })
      .sort(function (a, b) { return String(b.completedAt).localeCompare(String(a.completedAt)); });
  }

  function focusMinutesToday() {
    return store.focusLogs(user.id)
      .filter(function (f) { return f.date === store.todayISO(); })
      .reduce(function (sum, f) { return sum + (Number(f.minutes) || 0); }, 0);
  }

  function streak() {
    const days = {};
    allTasks().forEach(function (t) {
      if (t.completed && t.completedAt) {
        const d = store.dateOfISO(t.completedAt);
        if (d) days[d] = true;
      }
    });
    let d = store.todayISO();
    if (!days[d]) d = store.addDaysISO(d, -1);
    let count = 0;
    while (days[d] && count < 400) {
      count++;
      d = store.addDaysISO(d, -1);
    }
    return count;
  }

  function last7() {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const iso = store.addDaysISO(store.todayISO(), -i);
      const completed = allTasks().filter(function (t) {
        return t.completed && store.dateOfISO(t.completedAt) === iso;
      }).length;
      const focus = store.focusLogs(user.id)
        .filter(function (f) { return f.date === iso; })
        .reduce(function (s, f) { return s + (Number(f.minutes) || 0); }, 0);
      out.push({ iso: iso, completed: completed, focus: focus, weekday: ui.weekdayShort(iso), day: store.fromISO(iso).getDate() });
    }
    return out;
  }

  function firstName() {
    return String(user.name || "tú").split(/\s+/)[0];
  }

  function escape(str) { return ui.escape(str); }

  function hexA(hex, alpha) {
    const h = String(hex || "#847c6c").replace("#", "");
    const full = h.length === 3 ? h.split("").map(function (c) { return c + c; }).join("") : h;
    const r = parseInt(full.slice(0, 2), 16) || 0;
    const g = parseInt(full.slice(2, 4), 16) || 0;
    const b = parseInt(full.slice(4, 6), 16) || 0;
    return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
  }

  function focusSessionTaskTitle(taskId) {
    const t = taskId ? store.task(taskId) : null;
    return t ? t.title : "Sesión libre";
  }

  /* ---------- render de la estructura ---------- */

  function refresh() {
    invalidate();
    renderAll();
  }

  function renderAll() {
    renderChrome();
    renderView();
  }

  function renderChrome() {
    const all = allTasks();
    const pending = all.filter(function (t) { return !t.completed; });
    const today = store.todayISO();

    els.userName.textContent = user.name;
    els.userEmail.textContent = user.email;
    els.userAvatar.textContent = ui.initials(user.name);
    const menuName = document.getElementById("userMenuName");
    const menuEmail = document.getElementById("userMenuEmail");
    if (menuName) menuName.textContent = user.name;
    if (menuEmail) menuEmail.textContent = user.email;

    const counts = {
      today: pending.filter(function (t) { return t.due && t.due <= today; }).length,
      upcoming: pending.filter(function (t) { return t.due && t.due > today; }).length,
      pending: pending.length
    };
    document.querySelectorAll("[data-count]").forEach(function (el) {
      const key = el.getAttribute("data-count");
      el.textContent = counts[key] ? counts[key] : "";
    });

    /* racha */
    const currentStreak = streak();
    const series = last7();
    if (els.streakCard) {
      els.streakCard.innerHTML =
        '<div class="streak-head">' + K.icon("flame") + ' <span>Racha</span><b>' + currentStreak + ' d</b></div>' +
        '<div class="streak-days">' + series.map(function (s) {
          return '<i class="' + (s.completed > 0 ? "on" : "") + '" title="' + escape(ui.shortDate(s.iso)) + ': ' + s.completed + ' completadas"></i>';
        }).join("") + "</div>" +
        "<small>" + (currentStreak > 0 ? "Sigue así. La constancia suma." : "Completa una tarea para empezar.") + "</small>";
    }

    /* proyectos */
    if (els.projectNav) {
      const projects = getProjects();
      let html = '<button type="button" class="project-item ' + (state.project === "all" ? "is-active" : "") + '" data-project="all">' +
        K.icon("layers", "project-icon", 14) +
        '<span class="project-name">Todos los espacios</span>' +
        '<span class="project-count">' + pending.length + "</span></button>";
      projects.forEach(function (p) {
        const count = pending.filter(function (t) { return t.projectId === p.id; }).length;
        html += '<button type="button" class="project-item ' + (state.project === p.id ? "is-active" : "") + '" data-project="' + p.id + '">' +
          '<span class="dot" style="background:' + p.color + '"></span>' +
          '<span class="project-name">' + escape(p.name) + "</span>" +
          '<span class="project-count">' + count + "</span></button>";
      });
      els.projectNav.innerHTML = html;
    }

    /* navegación activa */
    document.querySelectorAll("[data-view]").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-view") === state.view);
    });

    const page = PAGES[state.view] || PAGES.hoy;
    els.viewTitle.textContent = page.title;
    els.viewDate.textContent = ui.longDate(store.todayISO()) + " · " + counts.today + " para hoy";

    renderNotifications();
    syncThemeIcon();
    document.title = page.title + " · Kairós";
  }

  function renderNotifications() {
    const items = store.notifications(user.id);
    els.notifBtn.classList.toggle("has-notifs", items.length > 0);
    els.notifBadge.textContent = items.length > 9 ? "9+" : String(items.length);
    els.notifCount.textContent = items.length ? items.length + " por revisar" : "Todo al día";

    if (!items.length) {
      els.notifBody.innerHTML = '<div class="notif-empty">No tienes recordatorios pendientes.<br>Disfruta el momento.</div>';
      return;
    }

    els.notifBody.innerHTML = items.slice(0, 8).map(function (item) {
      const t = item.task;
      let cls = "";
      let icon = "alert";
      let label = "";
      if (item.kind === "overdue") {
        label = "Atrasada · " + ui.dueInfo(t.due).label;
      } else if (item.kind === "today") {
        cls = "is-today";
        icon = "clock";
        label = "Para hoy" + (t.time ? " · " + ui.timeLabel(t.time) : "");
      } else {
        cls = "is-next";
        icon = "calendar";
        label = "Mañana" + (t.time ? " · " + ui.timeLabel(t.time) : "");
      }
      return '<button type="button" class="notif-item" data-action="edit-task" data-id="' + t.id + '">' +
        '<span class="notif-icon ' + cls + '">' + K.icon(icon) + "</span>" +
        '<span><strong>' + escape(t.title) + "</strong><small>" + label + "</small></span></button>";
    }).join("");
  }

  function renderView() {
    const builders = {
      hoy: viewToday,
      proximas: viewUpcoming,
      todas: viewAll,
      completadas: viewDone,
      calendario: viewCalendar,
      enfoque: viewFocus,
      estadisticas: viewStats
    };
    const builder = builders[state.view] || builders.hoy;
    els.viewInner.innerHTML = builder();
    const page = PAGES[state.view] || PAGES.hoy;
    document.title = page.title + " · Kairós";
    if (state.view === "enfoque") updateTimerUI();
  }

  /* ---------- piezas compartidas ---------- */

  function priorityChip(priority) {
    return '<span class="chip priority-' + priority + '"><span class="dot"></span>' +
      (priority === "alta" ? "Alta" : priority === "media" ? "Media" : "Baja") + "</span>";
  }

  function projectChip(project) {
    if (!project) return "";
    return '<span class="chip"><span class="project-dot" style="background:' + project.color + '"></span>' + escape(project.name) + "</span>";
  }

  function taskRow(t, options) {
    const opts = options || {};
    const project = getProject(t.projectId);
    const due = t.due ? ui.dueInfo(t.due) : null;
    const isOverdue = !t.completed && t.due && t.due < store.todayISO();
    const checkDone = (t.checklist || []).filter(function (c) { return c.done; }).length;
    const totalCheck = (t.checklist || []).length;
    let meta = "";

    if (opts.completedView) {
      meta += '<span class="chip">' + K.icon("check") + "Completada " + ui.relativeCompleted(t.completedAt).toLowerCase() + "</span>";
    } else if (due) {
      meta += '<span class="chip ' + due.cls + '">' + K.icon("calendar") + due.label + "</span>";
    }
    if (t.time) meta += '<span class="chip">' + K.icon("clock") + ui.timeLabel(t.time) + "</span>";
    if (!opts.completedView) meta += priorityChip(t.priority);
    meta += projectChip(project);
    if (totalCheck) {
      meta += '<span class="chip">' + K.icon("check") + '<span class="checklist">' + checkDone + "/" + totalCheck + "</span></span>";
    }

    const actions = opts.completedView
      ? '<button type="button" class="icon-btn" data-action="restore-task" data-id="' + t.id + '" title="Restaurar tarea" aria-label="Restaurar tarea">' + K.icon("rotate") + "</button>" +
        '<button type="button" class="icon-btn delete" data-action="delete-task" data-id="' + t.id + '" title="Eliminar" aria-label="Eliminar tarea">' + K.icon("trash") + "</button>"
      : '<button type="button" class="icon-btn" data-action="focus-task" data-id="' + t.id + '" title="Enfocar 25 minutos" aria-label="Enfocar esta tarea">' + K.icon("target") + "</button>" +
        '<button type="button" class="icon-btn" data-action="edit-task" data-id="' + t.id + '" title="Editar" aria-label="Editar tarea">' + K.icon("pencil") + "</button>" +
        '<button type="button" class="icon-btn delete" data-action="delete-task" data-id="' + t.id + '" title="Eliminar" aria-label="Eliminar tarea">' + K.icon("trash") + "</button>";

    return '<article class="task ' + (t.completed ? "is-done " : "") + (isOverdue ? "is-overdue " : "") +
      (state.focus.taskId === t.id && state.focus.running ? "is-focusing" : "") + '" data-task-id="' + t.id + '">' +
      '<button type="button" class="task-check" data-action="toggle-task" data-id="' + t.id + '" aria-pressed="' + t.completed + '" aria-label="' +
        (t.completed ? "Marcar como pendiente: " : "Completar: ") + escape(t.title) + '">' + K.icon("check") + "</button>" +
      '<div class="task-body">' +
        '<div class="task-title">' + escape(t.title) + "</div>" +
        (t.notes ? '<div class="task-note">' + escape(t.notes) + "</div>" : "") +
        '<div class="task-meta">' + meta + "</div>" +
      "</div>" +
      '<div class="task-actions">' + actions + "</div>" +
      "</article>";
  }

  function taskGroup(title, list, options) {
    if (!list.length) return "";
    const opts = options || {};
    return '<section class="task-group">' +
      '<div class="group-head ' + (opts.overdue ? "is-overdue" : "") + '">' +
        "<h2>" + title + '</h2><span class="group-count">' + list.length + '</span><span class="group-line"></span>' +
        (opts.action || "") +
      "</div>" +
      '<div class="task-list">' + list.map(function (t) { return taskRow(t, opts); }).join("") + "</div>" +
      "</section>";
  }

  function emptyState(icon, title, text, cta) {
    return '<div class="empty">' +
      '<div class="empty-art">' + K.icon(icon) + "</div>" +
      "<h3>" + title + "</h3><p>" + text + "</p>" +
      (cta || "") + "</div>";
  }

  function quickAddHTML(date, placeholder) {
    const defaultProject = state.project !== "all" ? state.project : "";
    return '<form class="quick-add" data-quick-date="' + (date || "") + '" data-project-id="' + defaultProject + '">' +
      K.icon("plus") +
      '<input type="text" name="quickTitle" maxlength="180" placeholder="' + (placeholder || "Escribe una tarea y pulsa Enter…") + '" aria-label="Título de la nueva tarea" autocomplete="off">' +
      '<span class="kbd">Enter</span>' +
      '<button type="submit" aria-label="Agregar tarea">' + K.icon("arrow-right") + "</button></form>";
  }

  function statCard(icon, tone, label, value, sub) {
    return '<div class="stat-card">' +
      '<span class="stat-icon ' + (tone || "") + '">' + K.icon(icon) + "</span>" +
      '<span class="stat-copy"><span class="stat-label">' + label + '</span><span class="stat-value">' + value + '</span><span class="stat-sub">' + sub + "</span></span></div>";
  }

  function panelHead(title, icon, action) {
    return '<div class="panel-head"><h2>' + (icon ? K.icon(icon) : "") + title + "</h2>" + (action || "") + "</div>";
  }

  function weekBarsHTML(series) {
    const max = Math.max(1, Math.max.apply(null, series.map(function (s) { return s.completed; })));
    return '<div class="week-chart">' + series.map(function (s) {
      const h = s.completed ? Math.max(12, Math.round((s.completed / max) * 100)) : 4;
      return '<div class="week-col" title="' + escape(ui.longDate(s.iso)) + ": " + s.completed + ' completadas">' +
        '<div class="week-bar ' + (s.completed ? "has " : "") + (s.iso === store.todayISO() ? "is-today" : "") + '" style="height:' + h + '%"></div>' +
        '<span class="week-day">' + escape(s.weekday.slice(0, 1)) + "</span></div>";
    }).join("") + "</div>";
  }

  /* ---------- vista: Hoy ---------- */

  function viewToday() {
    const today = store.todayISO();
    const all = allTasks().filter(matchesSearch);
    const pending = all.filter(function (t) { return !t.completed; });
    const overdue = sortTasks(pending.filter(function (t) { return t.due && t.due < today; }), "smart");
    const todayList = sortTasks(pending.filter(function (t) { return t.due === today; }), "smart");
    const doneToday = all.filter(function (t) { return t.completed && store.dateOfISO(t.completedAt) === today; })
      .sort(function (a, b) { return String(b.completedAt).localeCompare(String(a.completedAt)); });

    const totalToday = todayList.length + doneToday.length;
    const pct = totalToday ? Math.round((doneToday.length / totalToday) * 100) : 0;
    const currentStreak = streak();
    const focusMin = focusMinutesToday();
    const focusSessions = store.focusLogs(user.id).filter(function (f) { return f.date === today; }).length;

    let sub = "";
    if (overdue.length && todayList.length) {
      sub = "Tienes <strong>" + overdue.length + " atrasada" + (overdue.length > 1 ? "s" : "") + "</strong> y <strong>" +
        todayList.length + " para hoy</strong>. Empieza por lo que más pesa y no abras diez frentes a la vez.";
    } else if (todayList.length) {
      sub = "<strong>" + todayList.length + " tarea" + (todayList.length > 1 ? "s" : "") + " para hoy</strong>. Una a la vez: el orden importa más que la prisa.";
    } else if (overdue.length) {
      sub = "No tienes pendientes para hoy, pero <strong>" + overdue.length + " quedaron atrás</strong>. Buen momento para cerrar el círculo.";
    } else if (doneToday.length) {
      sub = "Todo lo de hoy está hecho. <strong>Has cumplido tu plan</strong>: ahora sí puedes descansar sin culpa.";
    } else {
      sub = "El día está libre. Captura lo que tengas en mente o <strong>protege un bloque de enfoque</strong> para adelantar.";
    }

    const next = (overdue.concat(todayList))[0] ||
      sortTasks(pending.filter(function (t) { return t.due && t.due > today; }), "smart")[0] || null;

    const projectProgress = getProjects().map(function (p) {
      const tasks = allTasks().filter(function (t) { return t.projectId === p.id; });
      const done = tasks.filter(function (t) { return t.completed; }).length;
      return { project: p, total: tasks.length, done: done };
    }).filter(function (p) { return p.total > 0; }).sort(function (a, b) { return b.total - a.total; }).slice(0, 4);

    return '<div class="view-inner">' +
      '<section class="today-hero">' +
        '<div class="today-copy">' +
          '<span class="eyebrow">Tu día, en orden</span>' +
          "<h1>" + ui.greeting() + ", <em>" + escape(firstName()) + "</em>.</h1>" +
          '<p class="today-sub">' + sub + "</p>" +
          '<div class="today-meta">' +
            "<span>" + K.icon("calendar") + ui.longDate(today) + "</span>" +
            "<span>" + K.icon("target") + (focusMin ? ui.duration(focusMin) + " de enfoque" : "Sin sesiones de enfoque") + "</span>" +
            "<span>" + K.icon("flame") + (currentStreak ? "Racha de " + currentStreak + " día" + (currentStreak > 1 ? "s" : "") : "Empieza tu racha") + "</span>" +
          "</div>" +
        "</div>" +
        '<div class="hero-progress">' +
          '<div class="hero-ring">' + ui.ring(pct, { size: 82, stroke: 7 }) +
            '<span class="ring-label">' + pct + '%<small>HECHO</small></span></div>' +
          '<div class="hero-progress-copy">' +
            "<strong>" + doneToday.length + " de " + totalToday + " completadas</strong>" +
            "<small>" + (totalToday === 0 ? "Sin tareas para hoy" : pct >= 100 ? "Día despejado" : focusSessions + " sesión" + (focusSessions === 1 ? "" : "es") + " de enfoque") + "</small>" +
            '<span class="mini-avail"><i></i>' + (pct >= 50 ? "Buen ritmo" : "A tu ritmo") + "</span>" +
          "</div>" +
        "</div>" +
      "</section>" +

      '<div class="stat-grid">' +
        statCard("sun", "accent", "Para hoy", String(todayList.length), totalToday ? totalToday + " en el plan" : "Nada agendado") +
        statCard("alert", "danger", "Atrasadas", String(overdue.length), overdue.length ? "Requieren atención" : "Todo al día") +
        statCard("flame", "butter", "Racha", currentStreak + ' <small>días</small>', "Constancia acumulada") +
        statCard("target", "sage", "Enfoque hoy", ui.duration(focusMin).replace(" ", "&nbsp;"), focusSessions + " sesión" + (focusSessions === 1 ? "" : "es")) +
      "</div>" +

      '<div class="dash-grid">' +
        '<div class="dash-main">' +
          quickAddHTML(today) +
          taskGroup("Atrasadas", overdue, { overdue: true, action: overdue.length ? '<button type="button" class="group-action" data-action="go-view" data-view="todas">Gestionar</button>' : "" }) +
          taskGroup("Para hoy", todayList, { action: todayList.length ? '<button type="button" class="group-action" data-action="new-task">+ Añadir</button>' : "" }) +
          taskGroup("Completadas hoy", doneToday.slice(0, 4), {
            completedView: true,
            action: doneToday.length > 4 ? '<button type="button" class="group-action" data-action="go-view" data-view="completadas">Ver todas</button>' : ""
          }) +
          (!overdue.length && !todayList.length && !doneToday.length
            ? emptyState("coffee", "Un lienzo en blanco", "No hay tareas para hoy. Crea una o aprovecha para planificar la semana con calma.",
                '<button type="button" class="btn btn-primary btn-sm" data-action="new-task">' + K.icon("plus") + " Nueva tarea</button>")
            : "") +
        "</div>" +

        '<aside class="dash-aside">' +
          '<div class="panel next-card">' +
            '<div class="next-top">' +
              panelHead("Siguiente", "sparkle") +
              (next
                ? '<div class="next-title">' + escape(next.title) + "</div>" +
                  '<div class="next-meta">' + priorityChip(next.priority) +
                    (next.due ? '<span class="chip ' + ui.dueInfo(next.due).cls + '">' + K.icon("calendar") + ui.dueInfo(next.due).label + "</span>" : "") +
                    (next.time ? '<span class="chip">' + K.icon("clock") + ui.timeLabel(next.time) + "</span>" : "") +
                  "</div>"
                : '<div class="next-title">Todo al día</div><p style="font-size:11.5px;color:var(--ink-3);margin-top:4px">No hay pendientes inmediatos. Buen momento para planificar.</p>') +
            "</div>" +
            (next
              ? '<div class="next-actions">' +
                  '<button type="button" class="btn btn-primary btn-sm" data-action="focus-task" data-id="' + next.id + '">' + K.icon("target") + " Enfocar 25 min</button>" +
                  '<button type="button" class="btn btn-ghost btn-sm" data-action="edit-task" data-id="' + next.id + '">Abrir</button>' +
                "</div>"
              : "") +
          "</div>" +

          '<div class="panel">' +
            panelHead("Esta semana", "chart", '<button type="button" class="panel-link" data-action="go-view" data-view="estadisticas">Detalle</button>') +
            weekBarsHTML(last7()) +
            '<div class="week-sum"><strong>' + last7().reduce(function (s, d) { return s + d.completed; }, 0) + '</strong><span>tareas completadas en 7 días</span></div>' +
          "</div>" +

          (projectProgress.length
            ? '<div class="panel">' + panelHead("Espacios", "layers") +
              '<div class="space-bars">' + projectProgress.map(function (item) {
                const percent = item.total ? Math.round((item.done / item.total) * 100) : 0;
                return '<div class="space-bar-row">' +
                  '<div class="space-bar-label"><span><i style="background:' + item.project.color + '"></i>' + escape(item.project.name) + "</span><b>" + item.done + "/" + item.total + "</b></div>" +
                  '<div class="space-track"><i style="width:' + percent + "%;background:" + item.project.color + '"></i></div></div>';
              }).join("") + "</div></div>"
            : "") +

          '<div class="quote-panel"><p>“No necesitas más horas. Necesitas decidir a qué hora importa lo que haces.”</p><small>Manifiesto Kairós</small></div>' +
        "</aside>" +
      "</div>" +
    "</div>";
  }

  /* ---------- vista: Próximas ---------- */

  function viewUpcoming() {
    const today = store.todayISO();
    const pending = sortTasks(pendingTasks().filter(matchesSearch).filter(function (t) { return t.due && t.due > today; }), "smart");
    const overdue = sortTasks(pendingTasks().filter(matchesSearch).filter(function (t) { return t.due && t.due < today; }), "smart");

    const groups = {};
    pending.forEach(function (t) {
      if (!groups[t.due]) groups[t.due] = [];
      groups[t.due].push(t);
    });
    const dates = Object.keys(groups).sort();

    let html = '<div class="view-inner">' +
      '<div class="view-head"><div><h1>Próximas</h1><p class="sub">Lo que viene, sin perder de vista lo de hoy.</p></div>' +
        '<div class="view-head-actions"><span class="chip">' + K.icon("calendar") + pending.length + " programadas</span></div></div>" +
      quickAddHTML(store.addDaysISO(today, 1), "Añadir algo para mañana…") +
      taskGroup("Atrasadas", overdue, { overdue: true, completedView: false }) +
      (dates.length
        ? dates.map(function (date) {
            const label = date === store.addDaysISO(today, 1) ? "Mañana" : date === store.addDaysISO(today, 2) ? "En 2 días" : ui.longDate(date).split(",")[0];
            return taskGroup(label + " · " + ui.shortDate(date), groups[date], {});
          }).join("")
        : emptyState("calendar", "Nada en el horizonte", overdue.length ? "Solo quedan las tareas atrasadas. Ciérralas y el horizonte se despeja." : "Cuando agregues fechas a tus tareas, aparecerán aquí agrupadas por día.",
            '<button type="button" class="btn btn-primary btn-sm" data-action="new-task">' + K.icon("plus") + " Programar tarea</button>")) +
      "</div>";

    return html;
  }

  /* ---------- vista: Todas ---------- */

  function viewAll() {
    let list = allTasks().filter(matchesSearch);
    if (state.status === "pending") list = list.filter(function (t) { return !t.completed; });
    else if (state.status === "done") list = list.filter(function (t) { return t.completed; });
    if (state.priority !== "all") list = list.filter(function (t) { return t.priority === state.priority; });
    if (state.project === "none") list = list.filter(function (t) { return !t.projectId; });
    else if (state.project !== "all") list = list.filter(function (t) { return t.projectId === state.project; });

    list = sortTasks(list, state.sort);

    const projects = getProjects();
    const projectOptions = '<option value="all">Todos los espacios</option>' +
      projects.map(function (p) { return '<option value="' + p.id + '"' + (state.project === p.id ? " selected" : "") + ">" + escape(p.name) + "</option>"; }).join("") +
      '<option value="none"' + (state.project === "none" ? " selected" : "") + ">Sin espacio</option>";

    const hasFilters = state.status !== "pending" || state.priority !== "all" || state.project !== "all" || state.sort !== "smart" || state.search;

    return '<div class="view-inner">' +
      '<div class="view-head"><div><h1>Todas las tareas</h1><p class="sub">' +
        (state.search ? "Resultados para “" + escape(state.search) + "”" : "Tu inventario completo, con filtros que sí sirven.") +
      "</p></div>" +
      '<div class="view-head-actions"><span class="chip">' + list.length + " resultado" + (list.length === 1 ? "" : "s") + "</span></div></div>" +

      '<div class="toolbar">' +
        '<div class="seg" role="group" aria-label="Estado">' +
          '<button type="button" class="' + (state.status === "pending" ? "is-active" : "") + '" data-action="set-status" data-value="pending">Pendientes</button>' +
          '<button type="button" class="' + (state.status === "done" ? "is-active" : "") + '" data-action="set-status" data-value="done">Hechas</button>' +
          '<button type="button" class="' + (state.status === "all" ? "is-active" : "") + '" data-action="set-status" data-value="all">Todas</button>' +
        "</div>" +
        '<span class="toolbar-spacer"></span>' +
        '<select class="select" id="filterPriority" aria-label="Filtrar por prioridad">' +
          '<option value="all"' + (state.priority === "all" ? " selected" : "") + ">Prioridad</option>" +
          '<option value="alta"' + (state.priority === "alta" ? " selected" : "") + ">Alta</option>" +
          '<option value="media"' + (state.priority === "media" ? " selected" : "") + ">Media</option>" +
          '<option value="baja"' + (state.priority === "baja" ? " selected" : "") + ">Baja</option>" +
        "</select>" +
        '<select class="select" id="filterProject" aria-label="Filtrar por espacio">' + projectOptions + "</select>" +
        '<select class="select" id="filterSort" aria-label="Ordenar tareas">' +
          '<option value="smart"' + (state.sort === "smart" ? " selected" : "") + ">Orden inteligente</option>" +
          '<option value="due"' + (state.sort === "due" ? " selected" : "") + ">Por fecha</option>" +
          '<option value="priority"' + (state.sort === "priority" ? " selected" : "") + ">Por prioridad</option>" +
          '<option value="created"' + (state.sort === "created" ? " selected" : "") + ">Recientes</option>" +
          '<option value="title"' + (state.sort === "title" ? " selected" : "") + ">A – Z</option>" +
        "</select>" +
        (hasFilters ? '<button type="button" class="btn btn-ghost btn-sm" data-action="clear-filters">Limpiar</button>' : "") +
      "</div>" +

      quickAddHTML(state.view === "todas" ? store.todayISO() : store.todayISO()) +

      (list.length
        ? '<div class="task-list">' + list.map(function (t) { return taskRow(t, { showProject: true, completedView: state.status === "done" }); }).join("") + "</div>"
        : emptyState("inbox", state.search ? "Sin coincidencias" : "Nada por aquí", state.search ? "No encontramos tareas con “" + escape(state.search) + "”. Prueba con otra palabra o limpia los filtros." : "No hay tareas con estos filtros. Prueba con otro estado, otra prioridad u otro espacio.",
            '<button type="button" class="btn btn-primary btn-sm" data-action="' + (state.search || hasFilters ? "clear-filters" : "new-task") + '">' +
            K.icon(state.search || hasFilters ? "rotate" : "plus") + (state.search || hasFilters ? " Limpiar filtros" : " Nueva tarea") + "</button>")) +
    "</div>";
  }

  /* ---------- vista: Completadas ---------- */

  function viewDone() {
    const done = allTasks().filter(matchesSearch).filter(function (t) { return t.completed; })
      .sort(function (a, b) { return String(b.completedAt || "").localeCompare(String(a.completedAt || "")); });
    const weekDone = last7().reduce(function (s, d) { return s + d.completed; }, 0);

    const groups = {};
    done.forEach(function (t) {
      const d = store.dateOfISO(t.completedAt);
      if (!d) return;
      if (!groups[d]) groups[d] = [];
      groups[d].push(t);
    });
    const dates = Object.keys(groups).sort().reverse();

    return '<div class="view-inner">' +
      '<div class="view-head"><div><h1>Completadas</h1><p class="sub">La prueba de que avanzas. También puedes restaurar lo que marcaste por error.</p></div>' +
        '<div class="view-head-actions"><span class="chip">' + K.icon("check") + done.length + " en total</span><span class=\"chip\">" + weekDone + " esta semana</span></div></div>" +
      (dates.length
        ? dates.map(function (date) {
            const label = date === store.todayISO() ? "Hoy" : date === store.addDaysISO(store.todayISO(), -1) ? "Ayer" : ui.longDate(date);
            return '<section class="task-group">' +
              '<div class="group-head"><h2>' + label + '</h2><span class="group-count">' + groups[date].length + '</span><span class="group-line"></span></div>' +
              '<div class="task-list">' + groups[date].map(function (t) { return taskRow(t, { completedView: true }); }).join("") + "</div>" +
              "</section>";
          }).join("")
        : emptyState("check", "Aún no hay tareas completadas", "Cuando marques tu primera tarea, aparecerá aquí con su fecha. El progreso también se celebra.",
            '<button type="button" class="btn btn-primary btn-sm" data-action="go-view" data-view="hoy">Ir a mi día</button>')) +
      "</div>";
  }

  /* ---------- vista: Calendario ---------- */

  function monthShift(monthISO, delta) {
    const d = store.fromISO(monthISO);
    d.setMonth(d.getMonth() + delta, 1);
    return store.dateToISO(d);
  }

  function viewCalendar() {
    const monthStart = store.fromISO(state.calMonth);
    const firstWeekday = (monthStart.getDay() + 6) % 7;
    const gridStart = store.addDaysISO(state.calMonth, -firstWeekday);
    const monthPrefix = state.calMonth.slice(0, 7);

    const items = allTasks().filter(matchesSearch);
    const byDue = {};
    items.forEach(function (t) {
      if (!t.due) return;
      if (!byDue[t.due]) byDue[t.due] = [];
      byDue[t.due].push(t);
    });
    Object.keys(byDue).forEach(function (key) {
      byDue[key] = sortTasks(byDue[key], "smart");
    });

    const monthTasks = items.filter(function (t) { return t.due && t.due.slice(0, 7) === monthPrefix; });
    const monthDone = monthTasks.filter(function (t) { return t.completed; }).length;

    let cells = "";
    for (let i = 0; i < 42; i++) {
      const iso = store.addDaysISO(gridStart, i);
      const date = store.fromISO(iso);
      const tasks = byDue[iso] || [];
      const isOut = iso.slice(0, 7) !== monthPrefix;
      const isToday = iso === store.todayISO();
      const isSelected = iso === state.selectedDay;
      const visible = tasks.slice(0, 3);
      const pills = visible.map(function (t) {
        const p = getProject(t.projectId);
        const color = p ? p.color : "#847c6c";
        return '<span class="cal-task ' + (t.completed ? "is-done" : "") + '" style="border-left-color:' + color + ";background:" + hexA(color, 0.13) + '">' + escape(t.title) + "</span>";
      }).join("");
      const dots = tasks.slice(0, 4).map(function (t) {
        const p = getProject(t.projectId);
        return '<i style="background:' + (p ? p.color : "#847c6c") + '"></i>';
      }).join("");
      cells += '<button type="button" class="cal-day ' + (isOut ? "is-out " : "") + (isToday ? "is-today " : "") + (isSelected ? "is-selected" : "") +
        '" data-action="cal-select" data-date="' + iso + '" aria-pressed="' + isSelected + '" aria-label="' + escape(ui.longDate(iso)) + ", " + tasks.length + ' tareas">' +
        '<span class="cal-num">' + date.getDate() + "</span>" +
        '<span class="cal-tasks">' + pills + "</span>" +
        '<span class="cal-dots">' + dots + "</span>" +
        "</button>";
    }

    const dayTasks = sortTasks(byDue[state.selectedDay] || [], "smart");
    const dayDone = dayTasks.filter(function (t) { return t.completed; }).length;

    return '<div class="view-inner">' +
      '<div class="view-head"><div><h1>Calendario</h1><p class="sub">Una vista mensual para decidir cuándo, no solo qué.</p></div>' +
        '<div class="view-head-actions"><span class="chip">' + K.icon("calendar") + monthTasks.length + " tareas este mes</span></div></div>" +
      '<div class="cal-layout">' +
        '<div class="calendar">' +
          '<div class="cal-toolbar">' +
            '<h2 class="cal-month">' + ui.monthName(state.calMonth) + "</h2>" +
            '<div class="cal-nav">' +
              '<button type="button" class="icon-btn" data-action="cal-prev" aria-label="Mes anterior">' + K.icon("chevron-left") + "</button>" +
              '<button type="button" class="icon-btn" data-action="cal-next" aria-label="Mes siguiente">' + K.icon("chevron-right") + "</button>" +
              '<button type="button" class="btn btn-ghost btn-sm" data-action="cal-today">Hoy</button>' +
            "</div>" +
          "</div>" +
          '<div class="cal-weekdays">' + ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(function (d) { return "<span>" + d + "</span>"; }).join("") + "</div>" +
          '<div class="cal-grid">' + cells + "</div>" +
        "</div>" +

        '<aside class="cal-side">' +
          '<div class="panel">' +
            '<div class="cal-day-head"><div class="cal-day-title">' + ui.longDate(state.selectedDay) +
              "<small>" + dayTasks.length + " tarea" + (dayTasks.length === 1 ? "" : "s") + " · " + dayDone + " hecha" + (dayDone === 1 ? "" : "s") + "</small></div>" +
              '<button type="button" class="icon-btn" data-action="new-task-for-day" data-date="' + state.selectedDay + '" aria-label="Nueva tarea este día">' + K.icon("plus") + "</button>" +
            "</div>" +
            (dayTasks.length
              ? '<div class="cal-day-list">' + dayTasks.map(function (t) {
                  const p = getProject(t.projectId);
                  return '<div class="cal-day-item ' + (t.completed ? "is-done" : "") + '">' +
                    '<button type="button" class="mini-check" data-action="toggle-task" data-id="' + t.id + '" aria-label="' + (t.completed ? "Marcar pendiente" : "Completar") + '">' + K.icon("check") + "</button>" +
                    '<button type="button" data-action="edit-task" data-id="' + t.id + '" style="text-align:left">' +
                      "<strong>" + escape(t.title) + "</strong><small>" +
                      (p ? escape(p.name) : "Sin espacio") + (t.time ? " · " + ui.timeLabel(t.time) : "") + "</small>" +
                    "</button></div>";
                }).join("") + "</div>"
              : '<div class="notif-empty" style="padding:18px 4px">Día libre. Puedes adelantar algo o dejarlo respirar.</div>') +
            '<div class="cal-summary"><div><b>' + dayTasks.length + '</b><span>Tareas</span></div><div><b>' + dayDone + '</b><span>Hechas</span></div></div>' +
          "</div>" +

          '<div class="panel">' +
            panelHead("Resumen del mes", "chart") +
            '<div class="space-bars">' +
              '<div class="space-bar-row"><div class="space-bar-label"><span>Completadas</span><b>' + monthDone + "/" + monthTasks.length + "</b></div>" +
                '<div class="space-track"><i style="width:' + (monthTasks.length ? Math.round((monthDone / monthTasks.length) * 100) : 0) + '%;background:var(--sage)"></i></div></div>' +
              '<div class="space-bar-row"><div class="space-bar-label"><span>Pendientes del mes</span><b>' + (monthTasks.length - monthDone) + "</b></div>" +
                '<div class="space-track"><i style="width:' + (monthTasks.length ? Math.round(((monthTasks.length - monthDone) / monthTasks.length) * 100) : 0) + '%;background:var(--accent)"></i></div></div>' +
            "</div>" +
            '<p class="settings-note" style="margin-top:12px">Consejo: deja un día sin tareas a la semana. El descanso también se planifica.</p>' +
          "</div>" +
        "</aside>" +
      "</div>" +
    "</div>";
  }

  /* ---------- vista: Enfoque ---------- */

  function clockText(seconds) {
    const s = Math.max(0, Math.round(seconds));
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }

  function viewFocus() {
    const f = state.focus;
    let task = f.taskId ? store.task(f.taskId) : null;
    if (task && task.completed) {
      f.taskId = null;
      task = null;
      saveFocus();
    }
    const total = f.duration || 1500;
    const pctRemaining = Math.max(0, Math.min(1, f.remaining / total));
    const radius = 46;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - pctRemaining);
    const presetLabel = f.mode === "break" ? "Descanso" : "Enfoque";

    const candidates = sortTasks(pendingTasks(), "smart").slice(0, 6);
    const todayMin = focusMinutesToday();
    const sessionsToday = store.focusLogs(user.id).filter(function (x) { return x.date === store.todayISO(); });
    const sessions = sessionsToday.slice().sort(function (a, b) { return String(b.completedAt).localeCompare(String(a.completedAt)); }).slice(0, 6);
    const weeklyMinutes = last7().reduce(function (s, d) { return s + d.focus; }, 0);

    return '<div class="view-inner">' +
      '<div class="view-head"><div><h1>Enfoque</h1><p class="sub">Una tarea. Un temporizador. Cero pestañas abiertas.</p></div>' +
        '<div class="view-head-actions"><span class="chip">' + K.icon("target") + ui.duration(todayMin) + " hoy</span><span class=\"chip\">" + sessionsToday.length + " sesiones</span></div></div>" +

      '<div class="focus-layout">' +
        '<div class="focus-card">' +
          '<div class="focus-mode" role="group" aria-label="Tipo de sesión">' +
            '<button type="button" class="' + (f.mode === "focus" ? "is-active" : "") + '" data-action="focus-mode" data-mode="focus">Enfoque</button>' +
            '<button type="button" class="' + (f.mode === "break" ? "is-active" : "") + '" data-action="focus-mode" data-mode="break">Descanso</button>' +
          "</div>" +
          '<div class="timer-wrap">' +
            '<svg viewBox="0 0 100 100" aria-hidden="true">' +
              '<circle class="timer-track" cx="50" cy="50" r="' + radius + '" fill="none" stroke-width="2.4"></circle>' +
              '<circle class="timer-progress" cx="50" cy="50" r="' + radius + '" fill="none" stroke-width="2.8" stroke-linecap="round" ' +
                'stroke-dasharray="' + circumference.toFixed(2) + '" stroke-dashoffset="' + offset.toFixed(2) + '"></circle>' +
            "</svg>" +
            '<div class="timer-center">' +
              '<div class="timer-digits" id="timerDigits">' + clockText(f.remaining) + "</div>" +
              '<div class="timer-state ' + (f.running ? "is-live" : "") + '" id="timerState">' + (f.running ? presetLabel + " en curso" : f.remaining === total ? "Listo para empezar" : "En pausa") + "</div>" +
              '<div class="timer-task" id="timerTask">' + (f.mode === "break" ? "Respira, camina, toma agua." : task ? escape(task.title) : "Sesión libre") + "</div>" +
            "</div>" +
          "</div>" +
          '<div class="timer-controls">' +
            '<button type="button" class="icon-btn" data-action="timer-reset" aria-label="Reiniciar temporizador" title="Reiniciar">' + K.icon("rotate") + "</button>" +
            '<button type="button" class="btn-main" data-action="timer-toggle">' + K.icon(f.running ? "pause" : "play") + "<span>" + (f.running ? "Pausar" : f.remaining === total ? "Empezar" : "Continuar") + "</span></button>" +
            '<button type="button" class="icon-btn" data-action="timer-skip" aria-label="Saltar sesión" title="Saltar">' + K.icon("skip") + "</button>" +
          "</div>" +
          (f.mode === "focus"
            ? '<div class="focus-presets">' +
                '<button type="button" class="preset ' + (f.preset === 25 ? "is-active" : "") + '" data-action="focus-preset" data-minutes="25" ' + (f.running ? "disabled" : "") + ">25 min</button>" +
                '<button type="button" class="preset ' + (f.preset === 50 ? "is-active" : "") + '" data-action="focus-preset" data-minutes="50" ' + (f.running ? "disabled" : "") + ">50 min</button>" +
              "</div>"
            : '<div class="focus-presets"><span class="preset is-active">5 min de pausa</span></div>') +
          '<p class="focus-hint">' + (f.running ? "Mantén esta pestaña abierta. El temporizador sigue corriendo si cambias de vista." : "Pulsa <span class=\"kbd\">Enter</span> para empezar: elige una tarea y arranca.") + "</p>" +
        "</div>" +

        '<aside class="focus-side">' +
          '<div class="panel">' +
            panelHead("Tarea de la sesión", "target") +
            '<div class="focus-task-select">' +
              '<button type="button" class="focus-task-option ' + (!f.taskId ? "is-selected" : "") + '" data-action="select-focus-task" data-id="">' +
                '<span style="flex:1">Sesión libre</span><small>sin tarea</small></button>' +
              (candidates.length
                ? candidates.map(function (t) {
                    const p = getProject(t.projectId);
                    return '<button type="button" class="focus-task-option ' + (f.taskId === t.id ? "is-selected" : "") + '" data-action="select-focus-task" data-id="' + t.id + '">' +
                      '<span class="pdot" style="background:' + (p ? p.color : "#847c6c") + '"></span><span>' + escape(t.title) + "</span>" +
                      "<small>" + t.priority + "</small></button>";
                  }).join("")
                : '<p class="settings-note" style="padding:6px 2px">No hay tareas pendientes. Crea una para enfocarte en algo concreto.</p>') +
            "</div>" +
          "</div>" +

          '<div class="panel">' +
            panelHead("Sesiones de hoy", "clock") +
            (sessions.length
              ? '<div class="session-list">' + sessions.map(function (s) {
                  const time = new Date(s.completedAt);
                  return '<div class="session-item"><span class="s-dot"></span><span>' + escape(focusSessionTaskTitle(s.taskId)) + "</span><b>" + s.minutes + " min · " +
                    String(time.getHours()).padStart(2, "0") + ":" + String(time.getMinutes()).padStart(2, "0") + "</b></div>";
                }).join("") + "</div>"
              : '<p class="settings-note" style="padding:4px 2px">Aún no registras sesiones hoy. La primera siempre es la más difícil.</p>') +
            '<div class="cal-summary" style="grid-template-columns:1fr 1fr"><div><b>' + ui.duration(todayMin) + '</b><span>Hoy</span></div><div><b>' + ui.duration(weeklyMinutes) + '</b><span>7 días</span></div></div>' +
          "</div>" +

          '<div class="panel">' +
            panelHead("Cómo funciona", "info") +
            '<div class="focus-steps">' +
              '<div class="focus-step"><span class="num">1</span><p><b>Elige una sola tarea.</b> La tentación de hacer cinco cosas a la vez es el enemigo.</p></div>' +
              '<div class="focus-step"><span class="num">2</span><p><b>Trabaja 25 minutos.</b> Sin correo, sin notificaciones, sin excusas creativas.</p></div>' +
              '<div class="focus-step"><span class="num">3</span><p><b>Descansa 5.</b> Levántate, mira lejos, respira. La pausa también es parte del método.</p></div>' +
            "</div>" +
          "</div>" +
        "</aside>" +
      "</div>" +
    "</div>";
  }

  /* ---------- vista: Estadísticas ---------- */

  function barChartSVG(series) {
    const W = 560;
    const H = 212;
    const pad = { l: 26, r: 8, t: 18, b: 28 };
    const max = Math.max(1, Math.max.apply(null, series.map(function (s) { return s.completed; })));
    const innerW = W - pad.l - pad.r;
    const innerH = H - pad.t - pad.b;
    const slot = innerW / series.length;
    const bw = Math.min(34, slot * 0.46);
    const y = function (v) { return pad.t + innerH - (v / max) * innerH; };

    let out = '<svg class="chart-big" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Tareas completadas en los últimos 7 días">';
    [0, 0.5, 1].forEach(function (step) {
      const value = Math.round(max * step);
      const yy = y(value);
      out += '<line x1="' + pad.l + '" y1="' + yy + '" x2="' + (W - pad.r) + '" y2="' + yy + '" stroke="var(--line)" stroke-width="1" stroke-dasharray="' + (step === 0 ? "0" : "3 4") + '"></line>';
      out += '<text x="' + (pad.l - 7) + '" y="' + (yy + 3) + '" text-anchor="end" font-size="9" fill="var(--ink-3)">' + value + "</text>";
    });
    series.forEach(function (s, i) {
      const x = pad.l + slot * i + (slot - bw) / 2;
      const h = s.completed ? Math.max(3, innerH - (y(s.completed) - pad.t)) : 2;
      const yy = pad.t + innerH - h;
      out += '<rect x="' + x.toFixed(1) + '" y="' + yy.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) +
        '" rx="4" fill="' + (s.iso === store.todayISO() ? "var(--accent)" : "var(--sage)") + '"></rect>';
      if (s.completed) {
        out += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (yy - 6).toFixed(1) + '" text-anchor="middle" font-size="9.5" font-weight="700" fill="var(--ink-2)">' + s.completed + "</text>";
      }
      out += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="9.5" fill="var(--ink-3)">' + escape(s.weekday) + "</text>";
      out += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 0) + '" text-anchor="middle" font-size="8" fill="var(--ink-3)">' + s.day + "</text>";
    });
    out += "</svg>";
    return out;
  }

  function viewStats() {
    const all = allTasks();
    const done = all.filter(function (t) { return t.completed; });
    const pending = all.filter(function (t) { return !t.completed; });
    const rate = all.length ? Math.round((done.length / all.length) * 100) : 0;
    const series = last7();
    const weekDone = series.reduce(function (s, d) { return s + d.completed; }, 0);
    const weekFocus = series.reduce(function (s, d) { return s + d.focus; }, 0);
    const currentStreak = streak();

    const priorities = { alta: 0, media: 0, baja: 0 };
    pending.forEach(function (t) { priorities[t.priority] = (priorities[t.priority] || 0) + 1; });
    const totalPending = priorities.alta + priorities.media + priorities.baja;
    const aPct = totalPending ? Math.round((priorities.alta / totalPending) * 100) : 0;
    const mPct = totalPending ? Math.round((priorities.media / totalPending) * 100) : 0;
    const bPct = Math.max(0, 100 - aPct - mPct);
    const donutBg = totalPending
      ? "conic-gradient(var(--accent) 0 " + aPct + "%, var(--butter) " + aPct + "% " + (aPct + mPct) + "%, var(--sage) " + (aPct + mPct) + "% 100%)"
      : "var(--surface-3)";

    const projectRows = getProjects().map(function (p) {
      const tasks = all.filter(function (t) { return t.projectId === p.id; });
      const pDone = tasks.filter(function (t) { return t.completed; }).length;
      return { project: p, total: tasks.length, done: pDone };
    }).filter(function (r) { return r.total > 0; }).sort(function (a, b) { return b.total - a.total; });

    const noSpace = all.filter(function (t) { return !t.projectId; });
    const best = series.slice().sort(function (a, b) { return b.completed - a.completed; })[0];
    const bestDay = best && best.completed ? ui.days[store.fromISO(best.iso).getDay()] : null;

    let insight = "";
    if (!all.length) {
      insight = "Todavía no hay datos. Crea tus primeras tareas y vuelve en unos días: las métricas empiezan a contar historias.";
    } else {
      const parts = [];
      if (currentStreak >= 2) parts.push("Llevas <strong>" + currentStreak + " días seguidos</strong> completando al menos una tarea. La constancia está funcionando.");
      if (bestDay) parts.push("Tu día más productivo de la semana fue <strong>" + bestDay + "</strong>, con " + best.completed + " tareas completadas.");
      if (totalPending) parts.push("El <strong>" + aPct + "%</strong> de lo pendiente es prioridad alta: no todo puede ser urgente.");
      if (weekFocus) parts.push("Has invertido <strong>" + ui.duration(weekFocus) + "</strong> en enfoque durante los últimos 7 días.");
      insight = parts.slice(0, 2).join(" ");
    }

    return '<div class="view-inner">' +
      '<div class="view-head"><div><h1>Estadísticas</h1><p class="sub">Números honestos para tomar mejores decisiones, no para sentir culpa.</p></div>' +
        '<div class="view-head-actions"><span class="chip">' + K.icon("chart") + "Últimos 7 días</span></div></div>" +

      '<div class="stats-hero">' +
        '<div class="metric-card"><div class="m-label">' + K.icon("check") + 'Cumplimiento</div><div class="m-value">' + rate + '<small>%</small></div><div class="m-foot">' + done.length + " de " + all.length + " tareas completadas</div></div>" +
        '<div class="metric-card"><div class="m-label">' + K.icon("sparkle") + 'Completadas</div><div class="m-value">' + weekDone + '</div><div class="m-foot"><b>' + (weekDone >= 5 ? "Buen ritmo" : "Paso a paso") + "</b> en 7 días</div></div>" +
        '<div class="metric-card"><div class="m-label">' + K.icon("target") + 'Enfoque</div><div class="m-value">' + ui.duration(weekFocus) + '</div><div class="m-foot">' + series.reduce(function (s, d) { return s + (d.focus ? 1 : 0); }, 0) + " días con sesiones</div></div>" +
        '<div class="metric-card"><div class="m-label">' + K.icon("flame") + 'Racha</div><div class="m-value">' + currentStreak + '<small> días</small></div><div class="m-foot">Días consecutivos con logros</div></div>' +
      "</div>" +

      '<div class="charts-grid">' +
        '<div class="panel chart-panel">' +
          panelHead("Tareas completadas · últimos 7 días", "chart") +
          barChartSVG(series) +
          '<div class="chart-legend"><span><i style="background:var(--sage)"></i>Completadas</span><span><i style="background:var(--accent)"></i>Hoy</span><span style="margin-left:auto">Total: ' + weekDone + " tareas</span></div>" +
        "</div>" +
        '<div class="panel chart-panel">' +
          panelHead("Prioridad de lo pendiente", "layers") +
          '<div class="donut-wrap">' +
            '<div class="donut" style="background:' + donutBg + '"><div class="donut-center"><b>' + totalPending + '</b><span>Pendientes</span></div></div>' +
            '<div class="donut-legend">' +
              '<div><i style="background:var(--accent)"></i>Alta <b>' + priorities.alta + "</b></div>" +
              '<div><i style="background:var(--butter)"></i>Media <b>' + priorities.media + "</b></div>" +
              '<div><i style="background:var(--sage)"></i>Baja <b>' + priorities.baja + "</b></div>" +
            "</div>" +
          "</div>" +
          '<p class="settings-note" style="margin-top:12px">' + (aPct > 50 ? "Más de la mitad de tus pendientes son de alta prioridad. Quizá el problema no sea la cantidad, sino el filtro." : "Una distribución sana: lo urgente no se come todo lo importante.") + "</p>" +
        "</div>" +
      "</div>" +

      '<div class="charts-grid charts-grid--split">' +
        '<div class="panel chart-panel">' +
          panelHead("Por espacio", "folder") +
          (projectRows.length
            ? '<div class="project-progress">' + projectRows.map(function (row) {
                const pct = row.total ? Math.round((row.done / row.total) * 100) : 0;
                return '<div class="project-progress-row">' +
                  '<div class="pp-label"><i style="background:' + row.project.color + '"></i><span>' + escape(row.project.name) + "</span><b>" + row.done + "/" + row.total + " · " + pct + "%</b></div>" +
                  '<div class="pp-track"><i style="width:' + pct + "%;background:" + row.project.color + '"></i></div></div>';
              }).join("") + "</div>"
            : '<p class="settings-note">Aún no hay tareas asignadas a espacios.</p>') +
          (noSpace.length ? '<p class="settings-note" style="margin-top:10px">' + noSpace.length + " tarea" + (noSpace.length === 1 ? "" : "s") + " sin espacio asignado.</p>" : "") +
        "</div>" +
        '<div class="panel chart-panel">' +
          panelHead("Lectura de la semana", "sparkle") +
          '<div class="insight-strip" style="border:0;padding:0;background:transparent">' +
            '<span class="insight-icon">' + K.icon("sparkle") + "</span>" +
            "<p>" + insight + "</p>" +
          "</div>" +
          (weekFocus
            ? '<div class="cal-summary" style="grid-template-columns:repeat(3,1fr)"><div><b>' + ui.duration(weekFocus) + '</b><span>Enfoque</span></div><div><b>' + weekDone + '</b><span>Completadas</span></div><div><b>' + rate + '%</b><span>Cumplimiento</span></div></div>'
            : "") +
        "</div>" +
      "</div>" +
    "</div>";
  }

  /* ---------- modales ---------- */

  function closeTopModal() {
    const btn = document.querySelector(".modal-backdrop [data-modal-close]");
    if (btn) btn.click();
  }

  function closeModalContaining(selector) {
    const el = document.querySelector(selector);
    if (!el) return;
    const backdrop = el.closest(".modal-backdrop");
    const btn = backdrop ? backdrop.querySelector("[data-modal-close]") : null;
    if (btn) btn.click();
  }

  function openTaskModal(taskId, defaults) {
    const opts = defaults || {};
    const task = taskId ? store.task(taskId) : null;
    if (taskId && !task) return;
    const editing = !!task;
    const projects = getProjects();
    const selectedProject = task ? task.projectId : (opts.projectId || (state.project !== "all" && state.project !== "none" ? state.project : ""));
    const priority = task ? task.priority : (opts.priority || "media");
    const due = task ? task.due : (opts.due || "");
    const time = task ? task.time : "";

    const checklistRows = (task ? task.checklist : opts.checklist || []).map(function (c) {
      return '<div class="check-row"><span class="bullet" style="' + (c.done ? "background:var(--sage);border-color:var(--sage)" : "") + '"></span>' +
        '<input type="text" value="' + escape(c.text) + '" maxlength="140" aria-label="Paso del checklist" data-done="' + (c.done ? "1" : "0") + '">' +
        '<button type="button" data-remove-check aria-label="Quitar paso">' + K.icon("x") + "</button></div>";
    }).join("");

    const body =
      '<form id="taskForm" data-task-id="' + (task ? task.id : "") + '" novalidate>' +
        '<div class="field"><label for="taskTitle">Título</label>' +
          '<input class="input" id="taskTitle" type="text" maxlength="180" placeholder="¿Qué necesitas hacer?" value="' + escape(task ? task.title : "") + '" autocomplete="off">' +
          '<span class="field-error" id="taskTitleError">Escribe un título para la tarea.</span>' +
        "</div>" +
        '<div class="field"><label for="taskNotes">Notas <span style="color:var(--ink-3);font-weight:500">(opcional)</span></label>' +
          '<textarea class="textarea" id="taskNotes" maxlength="1200" placeholder="Contexto, enlaces o el primer paso…">' + escape(task ? task.notes : opts.notes || "") + "</textarea></div>" +
        '<div class="form-row">' +
          '<div class="field"><label for="taskDue">Fecha</label>' +
            '<input class="input" id="taskDue" type="date" value="' + escape(due) + '">' +
            '<div class="chip-row">' +
              '<button type="button" class="chip-btn" data-quick-date="' + store.todayISO() + '">Hoy</button>' +
              '<button type="button" class="chip-btn" data-quick-date="' + store.addDaysISO(store.todayISO(), 1) + '">Mañana</button>' +
              '<button type="button" class="chip-btn" data-quick-date="' + store.addDaysISO(store.todayISO(), 7) + '">En 7 días</button>' +
              '<button type="button" class="chip-btn" data-quick-date="">Sin fecha</button>' +
            "</div>" +
          "</div>" +
          '<div class="field"><label for="taskTime">Hora <span style="color:var(--ink-3);font-weight:500">(opcional)</span></label>' +
            '<input class="input" id="taskTime" type="time" value="' + escape(time) + '"></div>' +
        "</div>" +
        '<div class="field"><span class="field-label">Prioridad</span>' +
          '<div class="priority-seg">' +
            '<label><input type="radio" name="taskPriority" value="alta"' + (priority === "alta" ? " checked" : "") + '><span><i></i>Alta</span></label>' +
            '<label><input type="radio" name="taskPriority" value="media"' + (priority === "media" ? " checked" : "") + '><span><i></i>Media</span></label>' +
            '<label><input type="radio" name="taskPriority" value="baja"' + (priority === "baja" ? " checked" : "") + '><span><i></i>Baja</span></label>' +
          "</div>" +
        "</div>" +
        '<div class="field"><label for="taskProject">Espacio</label>' +
          '<select class="select" id="taskProject"><option value="">Sin espacio</option>' +
            projects.map(function (p) { return '<option value="' + p.id + '"' + (selectedProject === p.id ? " selected" : "") + ">" + escape(p.name) + "</option>"; }).join("") +
          "</select></div>" +
        '<div class="field"><span class="field-label">Checklist <span style="color:var(--ink-3);font-weight:500">(opcional)</span></span>' +
          '<div class="checklist-editor" id="checklistRows">' + checklistRows + "</div>" +
          '<button type="button" class="add-check" data-add-check>' + K.icon("plus", "", 12) + " Agregar paso</button></div>" +
        '<div class="modal-foot" style="justify-content:space-between">' +
          (editing ? '<button type="button" class="btn btn-ghost btn-sm" data-delete-task style="color:var(--danger)">' + K.icon("trash") + " Eliminar</button>" : "<span></span>") +
          '<span style="display:flex;gap:8px"><button type="button" class="btn btn-ghost btn-sm" data-modal-close>Cancelar</button>' +
          '<button type="submit" class="btn btn-primary btn-sm">' + (editing ? "Guardar cambios" : "Crear tarea") + "</button></span>" +
        "</div>" +
      "</form>";

    K.openModal({
      title: editing ? "Editar tarea" : "Nueva tarea",
      subtitle: editing ? "Ajusta lo necesario. El plan sigue siendo tuyo." : "Captura ahora. Ordena después.",
      body: body,
      onMount: function (backdrop, close) {
        backdrop.querySelectorAll("[data-quick-date]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            const input = backdrop.querySelector("#taskDue");
            input.value = btn.getAttribute("data-quick-date");
          });
        });

        const titleField = backdrop.querySelector("#taskTitle");
        titleField.addEventListener("input", function () {
          titleField.classList.remove("has-error");
          backdrop.querySelector("#taskTitleError").classList.remove("is-visible");
        });

        function addRow(text) {
          const rows = backdrop.querySelector("#checklistRows");
          const row = document.createElement("div");
          row.className = "check-row";
          row.innerHTML = '<span class="bullet"></span><input type="text" value="' + escape(text || "") + '" maxlength="140" aria-label="Paso del checklist" data-done="0">' +
            '<button type="button" data-remove-check aria-label="Quitar paso">' + K.icon("x") + "</button>";
          rows.appendChild(row);
          row.querySelector("input").focus();
        }

        backdrop.querySelector("[data-add-check]").addEventListener("click", function () { addRow(""); });
        backdrop.addEventListener("click", function (e) {
          const remove = e.target.closest("[data-remove-check]");
          if (remove) remove.closest(".check-row").remove();
        });

        const del = backdrop.querySelector("[data-delete-task]");
        if (del) {
          del.addEventListener("click", function () {
            close();
            removeTask(task.id);
          });
        }
      }
    });
  }

  function openProjectsModal() {
    const projects = getProjects();
    const pending = pendingTasks();
    const rows = projects.map(function (p) {
      const count = pending.filter(function (t) { return t.projectId === p.id; }).length;
      return '<div class="space-manage-row">' +
        '<span class="dot" style="background:' + p.color + ';width:9px;height:9px;border-radius:50%;flex:none"></span>' +
        '<span style="flex:1;min-width:0"><strong style="display:block;font-size:12.5px">' + escape(p.name) + "</strong>" +
        '<small style="font-size:10px;color:var(--ink-3)">' + count + " pendiente" + (count === 1 ? "" : "s") + "</small></span>" +
        '<button type="button" class="icon-btn" data-delete-project="' + p.id + '" aria-label="Eliminar espacio ' + escape(p.name) + '">' + K.icon("trash") + "</button></div>";
    }).join("");

    K.openModal({
      title: "Espacios de trabajo",
      subtitle: "Separa contextos para no mezclar universidad, trabajo y vida.",
      body:
        '<form id="projectForm" novalidate>' +
          '<div class="field"><label for="projectName">Nombre del nuevo espacio</label>' +
            '<input class="input" id="projectName" type="text" maxlength="42" placeholder="Ej. Tesis, Freelance, Casa…" autocomplete="off"></div>' +
          '<div class="field" style="margin-top:12px"><span class="field-label">Color</span>' +
            '<div class="color-swatches">' + store.colors.map(function (c, i) {
              return '<label><input type="radio" name="projectColor" value="' + c + '"' + (i === 0 ? " checked" : "") + '><span style="background:' + c + '"></span></label>';
            }).join("") + "</div></div>" +
          '<button type="submit" class="btn btn-primary btn-block btn-sm" style="margin-top:14px">' + K.icon("plus") + " Crear espacio</button>" +
        "</form>" +
        '<div class="settings-block"><h3>Tus espacios</h3>' +
          (rows ? '<div class="space-manage">' + rows + "</div>" : '<p class="settings-note">Todavía no tienes espacios. Crea el primero arriba.</p>') +
        "</div>" +
        '<p class="settings-note">Al eliminar un espacio, sus tareas se conservan y pasan a “Sin espacio”.</p>',
      onMount: function (backdrop) {
        backdrop.querySelectorAll("[data-delete-project]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            const id = btn.getAttribute("data-delete-project");
            const project = getProject(id);
            if (!project) return;
            K.confirm({
              title: "Eliminar espacio",
              message: "¿Eliminar <strong>" + escape(project.name) + "</strong>? Las tareas no se borran: quedarán sin espacio.",
              confirmLabel: "Eliminar espacio",
              danger: true
            }).then(function (ok) {
              if (!ok) return;
              store.deleteProject(id);
              if (state.project === id) state.project = "all";
              closeModalContaining("#projectForm");
              refresh();
              K.toast("Espacio eliminado. Sus tareas siguen a salvo.", { type: "success" });
            });
          });
        });
      }
    });
  }

  function openSettings() {
    const prefs = user.prefs || {};
    const themeValue = prefs.theme || K.theme.current();
    const isDemo = !!user.isDemo;

    K.openModal({
      title: "Ajustes",
      subtitle: "Tu cuenta, tu tema y tus datos. Sin letra pequeña.",
      body:
        '<form id="profileForm">' +
          '<div class="settings-block"><h3>Perfil</h3>' +
            '<div class="field"><label for="profileName">Nombre</label><input class="input" id="profileName" type="text" maxlength="60" value="' + escape(user.name) + '"></div>' +
            '<div class="field" style="margin-top:10px"><label for="profileEmail">Correo</label><input class="input" id="profileEmail" type="email" value="' + escape(user.email) + '" disabled></div>' +
            '<button type="submit" class="btn btn-primary btn-sm" style="margin-top:12px">Guardar nombre</button>' +
            (isDemo ? '<p class="settings-note" style="margin-top:8px">Estás en la cuenta de demostración. Puedes restablecer los datos cuando quieras.</p>' : "") +
          "</div>" +
        "</form>" +

        '<div class="settings-block"><h3>Apariencia</h3>' +
          '<div class="theme-picker">' +
            '<label class="theme-option" data-theme-option="light"><input type="radio" name="theme" value="light"' + (themeValue === "light" ? " checked" : "") + '><span><i></i>Claro</span></label>' +
            '<label class="theme-option" data-theme-option="dark"><input type="radio" name="theme" value="dark"' + (themeValue === "dark" ? " checked" : "") + '><span><i></i>Oscuro</span></label>' +
            '<label class="theme-option" data-theme-option="system"><input type="radio" name="theme" value="system"' + (themeValue === "system" ? " checked" : "") + '><span><i></i>Sistema</span></label>' +
          "</div>" +
        "</div>" +

        '<div class="settings-block"><h3>Datos</h3>' +
          '<div class="settings-row"><div><p>Exportar mi información</p><small>Descarga un JSON con tareas, espacios y sesiones.</small></div>' +
            '<button type="button" class="btn btn-soft btn-sm" data-action="export-data">' + K.icon("download") + " Exportar</button></div>" +
          '<div class="settings-row"><div><p>Importar una copia</p><small>Reemplaza tus tareas actuales por las del archivo.</small></div>' +
            '<button type="button" class="btn btn-soft btn-sm" data-action="import-data">' + K.icon("upload") + " Importar</button></div>" +
          '<div class="settings-row"><div><p>' + (isDemo ? "Restablecer la demo" : "Restablecer mi cuenta") + "</p><small>Borra tus tareas y vuelve a los datos iniciales.</small></div>" +
            '<button type="button" class="btn btn-soft btn-sm" data-action="reset-data">' + K.icon("rotate") + " Restablecer</button></div>" +
          '<input type="file" id="importFile" accept="application/json,.json" hidden>' +
        "</div>" +

        '<div class="settings-block danger-zone"><h3>Zona sensible</h3>' +
          '<div class="settings-row"><div><p>Eliminar mi cuenta</p><small>Se borran la cuenta y todos sus datos de este navegador.</small></div>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-action="delete-account">Eliminar</button></div>' +
        "</div>" +

        '<p class="settings-note">Kairós guarda tus datos en el almacenamiento local de este navegador. En la versión con backend, esta misma interfaz consume una API REST y una base de datos PostgreSQL.</p>',

      onMount: function (backdrop) {
        backdrop.querySelectorAll('input[name="theme"]').forEach(function (radio) {
          radio.addEventListener("change", function () {
            const value = radio.value;
            K.theme.apply(value);
            user = store.updateUser({ prefs: { theme: value } });
            syncThemeIcon();
          });
        });
      }
    });
  }

  /* ---------- acciones ---------- */

  function removeTask(id) {
    const t = store.task(id);
    if (!t) return;
    store.deleteTask(id);
    if (state.focus.taskId === id) {
      state.focus.taskId = null;
      saveFocus();
    }
    refresh();
    K.toast("Tarea eliminada", {
      actionLabel: "Deshacer",
      onAction: function () {
        store.restoreTask(t);
        refresh();
        K.toast("Tarea restaurada", { type: "success" });
      }
    });
  }

  function toggleTask(id) {
    const before = store.task(id);
    if (!before) return;
    const updated = store.toggleTask(id);
    if (updated && updated.completed && state.focus.taskId === id) {
      state.focus.taskId = null;
      saveFocus();
    }
    refresh();
    if (updated && updated.completed && !before.completed) {
      const remaining = pendingTasks().filter(function (t) { return t.due && t.due <= store.todayISO(); }).length;
      if (!remaining) {
        K.toast("Día despejado. Nada pendiente para hoy: disfrútalo.", { type: "success", duration: 4800, icon: "sparkle" });
      }
    }
  }

  function startFocusTask(id) {
    const t = store.task(id);
    if (!t || t.completed) {
      K.toast("Esa tarea ya está completada.", { type: "error" });
      return;
    }
    const focus = state.focus;
    focus.mode = "focus";
    focus.preset = 25;
    focus.duration = 25 * 60;
    focus.remaining = 25 * 60;
    focus.running = true;
    focus.endAt = Date.now() + 25 * 60 * 1000;
    focus.taskId = id;
    ensureAudio();
    saveFocus();
    setView("enfoque");
    updateTimerUI();
    K.toast("Enfoque iniciado. 25 minutos para “" + t.title + "”.", { icon: "target", duration: 3200 });
  }

  function saveFocus() {
    try { localStorage.setItem(focusKey, JSON.stringify(state.focus)); } catch (e) { /* sin persistencia */ }
  }

  function ensureAudio() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtx) audioCtx = new AudioCtx();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch (e) { audioCtx = null; }
  }

  function chime() {
    if (!audioCtx) return;
    try {
      [880, 660].forEach(function (freq, i) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, audioCtx.currentTime + i * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.12, audioCtx.currentTime + i * 0.18 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + i * 0.18 + 0.34);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + i * 0.18);
        osc.stop(audioCtx.currentTime + i * 0.18 + 0.4);
      });
    } catch (e) { /* audio bloqueado */ }
  }

  function startTimer() {
    const f = state.focus;
    if (f.running) return;
    if (f.remaining <= 0) f.remaining = f.duration;
    f.running = true;
    f.endAt = Date.now() + f.remaining * 1000;
    ensureAudio();
    saveFocus();
    updateTimerUI();
  }

  function pauseTimer() {
    const f = state.focus;
    if (!f.running) return;
    f.remaining = Math.max(0, Math.ceil((f.endAt - Date.now()) / 1000));
    f.running = false;
    f.endAt = null;
    saveFocus();
    updateTimerUI();
  }

  function resetTimer() {
    const f = state.focus;
    f.running = false;
    f.endAt = null;
    f.remaining = f.duration;
    saveFocus();
    renderView();
  }

  function switchFocusMode(mode) {
    const f = state.focus;
    f.running = false;
    f.endAt = null;
    f.mode = mode === "break" ? "break" : "focus";
    f.preset = f.mode === "break" ? 5 : 25;
    f.duration = f.preset * 60;
    f.remaining = f.duration;
    saveFocus();
    renderView();
  }

  function skipSession() {
    const f = state.focus;
    const wasFocus = f.mode === "focus";
    f.running = false;
    f.endAt = null;
    f.mode = wasFocus ? "break" : "focus";
    f.preset = f.mode === "break" ? 5 : 25;
    f.duration = f.preset * 60;
    f.remaining = f.duration;
    saveFocus();
    renderView();
    K.toast(wasFocus ? "Sesión saltada. Tómate un respiro." : "Descanso terminado. Vamos de nuevo.", { icon: wasFocus ? "coffee" : "target" });
  }

  function finishSession() {
    const f = state.focus;
    const finishedMode = f.mode;
    const minutes = f.preset;
    f.running = false;
    f.endAt = null;
    chime();

    if (finishedMode === "focus") {
      store.addFocusSession(user.id, { minutes: minutes, taskId: f.taskId });
      f.mode = "break";
      f.preset = 5;
      f.duration = 5 * 60;
      f.remaining = 5 * 60;
      saveFocus();
      refresh();
      K.toast("Sesión de " + minutes + " min registrada. Ahora descansa 5.", {
        type: "success",
        icon: "target",
        duration: 6000,
        actionLabel: "Iniciar descanso",
        onAction: function () { startTimer(); }
      });
    } else {
      f.mode = "focus";
      f.preset = 25;
      f.duration = 25 * 60;
      f.remaining = 25 * 60;
      saveFocus();
      renderAll();
      K.toast("Descanso terminado. ¿Otra ronda de enfoque?", {
        type: "success",
        icon: "coffee",
        duration: 6000,
        actionLabel: "Empezar 25",
        onAction: function () { startTimer(); }
      });
    }
  }

  function updateTimerUI() {
    const f = state.focus;
    if (state.view === "enfoque") {
      const digits = document.getElementById("timerDigits");
      const stateEl = document.getElementById("timerState");
      const taskEl = document.getElementById("timerTask");
      const progress = document.querySelector(".timer-progress");
      const button = document.querySelector('[data-action="timer-toggle"]');
      const total = f.duration || 1500;
      const remaining = Math.max(0, f.remaining);
      if (digits) digits.textContent = clockText(remaining);
      if (stateEl) {
        stateEl.textContent = f.running ? (f.mode === "break" ? "Descanso en curso" : "Enfoque en curso") : remaining === total ? "Listo para empezar" : "En pausa";
        stateEl.classList.toggle("is-live", f.running);
      }
      if (taskEl) {
        const t = f.taskId ? store.task(f.taskId) : null;
        taskEl.textContent = f.mode === "break" ? "Respira, camina, toma agua." : t ? t.title : "Sesión libre";
      }
      if (progress) {
        const circ = 2 * Math.PI * 46;
        progress.setAttribute("stroke-dashoffset", (circ * (1 - Math.max(0, Math.min(1, remaining / total)))).toFixed(2));
      }
      if (button) {
        button.innerHTML = K.icon(f.running ? "pause" : "play") + "<span>" + (f.running ? "Pausar" : remaining === total ? "Empezar" : "Continuar") + "</span>";
      }
      const hint = document.querySelector(".focus-hint");
      if (hint) {
        hint.innerHTML = f.running
          ? "Mantén esta pestaña abierta. El temporizador sigue corriendo si cambias de vista."
          : remaining === total
            ? 'Pulsa <span class="kbd">Enter</span> para empezar: elige una tarea y arranca.'
            : 'Pulsa <span class="kbd">Enter</span> para continuar donde lo dejaste.';
      }
      document.title = f.running ? clockText(remaining) + " · Enfoque — Kairós" : "Enfoque · Kairós";
    }
  }

  function tickTimer() {
    const f = state.focus;
    if (!f.running || !f.endAt) return;
    const remaining = Math.max(0, Math.ceil((f.endAt - Date.now()) / 1000));
    if (remaining !== f.remaining) {
      f.remaining = remaining;
      updateTimerUI();
    }
    if (remaining <= 0) finishSession();
  }

  function exportData() {
    const payload = store.exportData(user.id);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kairos-respaldo-" + store.todayISO() + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    K.toast("Respaldo descargado. Guárdalo en un lugar seguro.", { type: "success", icon: "download" });
  }

  /* ---------- menús y navegación ---------- */

  function syncThemeIcon() {
    if (!els.themeToggle) return;
    const isDark = K.theme.resolved() === "dark";
    els.themeToggle.innerHTML = K.icon(isDark ? "sun" : "moon");
    els.themeToggle.setAttribute("aria-label", isDark ? "Activar modo claro" : "Activar modo oscuro");
    els.themeToggle.setAttribute("title", isDark ? "Modo claro" : "Modo oscuro");
  }

  function closeMenus() {
    els.notifPanel.hidden = true;
    els.notifBtn.setAttribute("aria-expanded", "false");
    els.userMenu.hidden = true;
    els.userCard.setAttribute("aria-expanded", "false");
  }

  function closeSidebar() {
    els.sidebar.classList.remove("is-open");
    els.sidebarBackdrop.hidden = true;
    els.menuBtn.setAttribute("aria-expanded", "false");
  }

  function openSidebar() {
    els.sidebar.classList.add("is-open");
    els.sidebarBackdrop.hidden = false;
    els.menuBtn.setAttribute("aria-expanded", "true");
    const closeBtn = document.getElementById("sidebarClose");
    if (closeBtn) closeBtn.focus();
  }

  function setView(view, options) {
    const opts = options || {};
    if (!PAGES[view]) view = "hoy";
    const changed = state.view !== view;
    state.view = view;
    if (opts.history !== false && window.location.hash !== "#" + view) {
      history.pushState({ view: view }, "", "#" + view);
    }
    renderAll();
    if (changed || opts.scroll) window.scrollTo({ top: 0, behavior: "auto" });
    closeSidebar();
    closeMenus();
  }

  function openTaskForCurrentView() {
    let due = "";
    if (state.view === "hoy") due = store.todayISO();
    else if (state.view === "proximas") due = store.addDaysISO(store.todayISO(), 1);
    else if (state.view === "calendario") due = state.selectedDay;
    else if (state.view === "todas") due = store.todayISO();
    openTaskModal(null, { due: due, projectId: state.project !== "all" && state.project !== "none" ? state.project : "" });
  }

  /* ---------- eventos ---------- */

  function init() {
    document.querySelectorAll("[data-icon]").forEach(function (el) {
      el.innerHTML = K.icon(el.getAttribute("data-icon"));
    });
    K.theme.init();
    syncThemeIcon();

    document.querySelectorAll("[data-view]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.project = "all";
        state.search = "";
        els.search.value = "";
        setView(btn.getAttribute("data-view"));
      });
    });

    document.getElementById("newTaskBtn").addEventListener("click", function () { openTaskForCurrentView(); });
    document.getElementById("addProjectBtn").addEventListener("click", openProjectsModal);

    document.getElementById("themeToggle").addEventListener("click", function () {
      const next = K.theme.resolved() === "dark" ? "light" : "dark";
      K.theme.apply(next);
      user = store.updateUser({ prefs: { theme: next } });
      syncThemeIcon();
      K.toast(next === "dark" ? "Modo oscuro activado. Cuida la vista." : "Modo claro activado.", { duration: 1800 });
    });

    els.notifBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      const willOpen = els.notifPanel.hidden;
      closeMenus();
      els.notifPanel.hidden = !willOpen;
      els.notifBtn.setAttribute("aria-expanded", String(willOpen));
    });

    document.getElementById("notifGoToday").addEventListener("click", function () {
      closeMenus();
      setView("hoy");
    });

    els.userCard.addEventListener("click", function (e) {
      e.stopPropagation();
      const willOpen = els.userMenu.hidden;
      closeMenus();
      els.userMenu.hidden = !willOpen;
      els.userCard.setAttribute("aria-expanded", String(willOpen));
    });
    els.userCard.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        els.userCard.click();
      }
    });

    els.menuBtn.addEventListener("click", openSidebar);
    document.getElementById("sidebarClose").addEventListener("click", closeSidebar);
    els.sidebarBackdrop.addEventListener("click", closeSidebar);

    els.projectNav.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-project]");
      if (!btn) return;
      state.project = btn.getAttribute("data-project");
      state.status = "pending";
      state.search = "";
      els.search.value = "";
      setView("todas");
    });

    els.search.addEventListener("input", ui.debounce(function () {
      state.search = els.search.value.trim();
      if (state.search && !LIST_VIEWS.includes(state.view)) {
        state.view = "todas";
        history.replaceState({ view: state.view }, "", "#todas");
      }
      renderAll();
    }, 130));

    document.addEventListener("click", function (e) {
      const actionEl = e.target.closest("[data-action]");
      if (!actionEl) {
        if (!e.target.closest(".notif-wrap")) {
          els.notifPanel.hidden = true;
          els.notifBtn.setAttribute("aria-expanded", "false");
        }
        if (!e.target.closest("#userMenu")) {
          els.userMenu.hidden = true;
          els.userCard.setAttribute("aria-expanded", "false");
        }
        return;
      }

      const action = actionEl.getAttribute("data-action");
      const id = actionEl.getAttribute("data-id");

      if (action === "toggle-task") { toggleTask(id); return; }
      if (action === "edit-task") { closeMenus(); openTaskModal(id); return; }
      if (action === "delete-task") { closeMenus(); removeTask(id); return; }
      if (action === "restore-task") {
        store.toggleTask(id);
        refresh();
        K.toast("Tarea restaurada a pendientes.", { type: "success" });
        return;
      }
      if (action === "focus-task") { startFocusTask(id); return; }
      if (action === "new-task") { openTaskForCurrentView(); return; }
      if (action === "new-task-for-day") { openTaskModal(null, { due: actionEl.getAttribute("data-date") }); return; }
      if (action === "go-view") { setView(actionEl.getAttribute("data-view")); return; }
      if (action === "set-status") { state.status = actionEl.getAttribute("data-value"); renderView(); return; }
      if (action === "clear-filters") {
        state.status = "pending"; state.priority = "all"; state.project = "all"; state.sort = "smart";
        state.search = ""; els.search.value = "";
        renderAll(); return;
      }
      if (action === "cal-prev") { state.calMonth = monthShift(state.calMonth, -1); renderView(); return; }
      if (action === "cal-next") { state.calMonth = monthShift(state.calMonth, 1); renderView(); return; }
      if (action === "cal-today") {
        state.calMonth = store.todayISO().slice(0, 7) + "-01";
        state.selectedDay = store.todayISO();
        renderView(); return;
      }
      if (action === "cal-select") {
        const date = actionEl.getAttribute("data-date");
        state.selectedDay = date;
        if (date.slice(0, 7) !== state.calMonth.slice(0, 7)) state.calMonth = date.slice(0, 7) + "-01";
        renderView(); return;
      }
      if (action === "focus-mode") { switchFocusMode(actionEl.getAttribute("data-mode")); return; }
      if (action === "focus-preset") {
        if (state.focus.running) return;
        const minutes = Number(actionEl.getAttribute("data-minutes")) || 25;
        state.focus.preset = minutes;
        state.focus.duration = minutes * 60;
        state.focus.remaining = minutes * 60;
        saveFocus();
        renderView(); return;
      }
      if (action === "select-focus-task") {
        state.focus.taskId = id || null;
        saveFocus();
        renderView(); return;
      }
      if (action === "timer-toggle") {
        if (state.focus.running) pauseTimer(); else startTimer();
        return;
      }
      if (action === "timer-reset") { resetTimer(); return; }
      if (action === "timer-skip") { skipSession(); return; }
      if (action === "open-settings") { closeMenus(); openSettings(); return; }
      if (action === "export-data") { exportData(); return; }
      if (action === "import-data") {
        const input = document.getElementById("importFile");
        if (input) input.click();
        return;
      }
      if (action === "reset-data") {
        K.confirm({
          title: user.isDemo ? "Restablecer la demo" : "Restablecer mi cuenta",
          message: "Se borrarán tus tareas, espacios y sesiones actuales. Esta acción no se puede deshacer.",
          confirmLabel: "Sí, restablecer",
          danger: true
        }).then(function (ok) {
          if (!ok) return;
          if (user.isDemo) store.resetDemo(); else store.resetAccount(user.id);
          state.focus = defaultFocus();
          saveFocus();
          closeMenus();
          cache = { projects: null, map: null };
          state.project = "all";
          state.status = "pending";
          refresh();
          K.toast("Datos restablecidos. Empezamos de nuevo.", { type: "success" });
        });
        return;
      }
      if (action === "delete-account") {
        K.confirm({
          title: "Eliminar mi cuenta",
          message: "Se eliminarán tu cuenta y todas tus tareas de este navegador. No hay vuelta atrás.",
          confirmLabel: "Eliminar cuenta",
          danger: true
        }).then(function (ok) {
          if (!ok) return;
          store.deleteAccount(user.id);
          try { localStorage.removeItem(focusKey); } catch (e) { /* sin almacenamiento */ }
          window.location.href = "index.html";
        });
        return;
      }
      if (action === "logout") {
        store.logout();
        window.location.href = "index.html";
        return;
      }
    });

    document.addEventListener("change", function (e) {
      const target = e.target;
      if (target.id === "filterPriority") { state.priority = target.value; renderView(); }
      if (target.id === "filterProject") { state.project = target.value; renderView(); }
      if (target.id === "filterSort") { state.sort = target.value; renderView(); }
      if (target.id === "importFile") {
        const file = target.files && target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function () {
          let payload;
          try { payload = JSON.parse(String(reader.result)); }
          catch (err) { K.toast("El archivo no es un JSON válido.", { type: "error" }); return; }
          K.confirm({
            title: "Importar respaldo",
            message: "Se reemplazarán tus tareas, espacios y sesiones actuales por los del archivo. ¿Continuar?",
            confirmLabel: "Importar",
            danger: true
          }).then(function (ok) {
            if (!ok) return;
            try {
              const result = store.importData(user.id, payload);
              closeModalContaining("#importFile");
              state.project = "all";
              state.search = "";
              els.search.value = "";
              refresh();
              K.toast("Importadas " + result.tasks + " tareas y " + result.projects + " espacios.", { type: "success" });
            } catch (err) {
              K.toast(err.message || "No se pudo importar el archivo.", { type: "error" });
            }
          });
        };
        reader.readAsText(file);
        target.value = "";
      }
    });

    document.addEventListener("submit", function (e) {
      const form = e.target;

      if (form.matches(".quick-add")) {
        e.preventDefault();
        const input = form.querySelector('input[name="quickTitle"]');
        const title = input.value.trim();
        if (!title) { input.focus(); return; }
        const due = form.getAttribute("data-quick-date") || "";
        const projectId = form.getAttribute("data-project-id") || null;
        const created = store.createTask(user.id, { title: title, due: due, priority: "media", projectId: projectId || null });
        input.value = "";
        refresh();
        K.toast("Tarea añadida" + (due === store.todayISO() ? " a hoy" : due ? " al " + ui.shortDate(due) : ""), {
          type: "success",
          actionLabel: "Editar",
          onAction: function () { openTaskModal(created.id); }
        });
        return;
      }

      if (form.id === "taskForm") {
        e.preventDefault();
        const backdrop = form.closest(".modal-backdrop");
        const titleInput = backdrop.querySelector("#taskTitle");
        const title = titleInput.value.trim();
        const error = backdrop.querySelector("#taskTitleError");
        if (!title) {
          titleInput.classList.add("has-error");
          error.classList.add("is-visible");
          titleInput.focus();
          return;
        }
        const priorityRadio = backdrop.querySelector('input[name="taskPriority"]:checked');
        const checklist = Array.from(backdrop.querySelectorAll("#checklistRows .check-row")).map(function (row) {
          const input = row.querySelector("input");
          return { id: K.store.uid("chk"), text: input.value.trim(), done: input.getAttribute("data-done") === "1" };
        }).filter(function (c) { return c.text; });

        const data = {
          title: title,
          notes: backdrop.querySelector("#taskNotes").value.trim(),
          due: backdrop.querySelector("#taskDue").value,
          time: backdrop.querySelector("#taskTime").value,
          priority: priorityRadio ? priorityRadio.value : "media",
          projectId: backdrop.querySelector("#taskProject").value || null,
          checklist: checklist
        };

        const editingId = form.getAttribute("data-task-id");
        if (editingId) {
          store.updateTask(editingId, data);
          K.toast("Cambios guardados.", { type: "success" });
        } else {
          store.createTask(user.id, data);
          K.toast("Tarea creada. Un paso concreto vale más que un plan perfecto.", { type: "success", icon: "sparkle" });
        }
        closeTopModal();
        refresh();
        return;
      }

      if (form.id === "projectForm") {
        e.preventDefault();
        const backdrop = form.closest(".modal-backdrop");
        const name = backdrop.querySelector("#projectName").value.trim();
        if (!name) { backdrop.querySelector("#projectName").focus(); return; }
        const color = (backdrop.querySelector('input[name="projectColor"]:checked') || {}).value || store.colors[0];
        store.createProject(user.id, { name: name, color: color });
        closeTopModal();
        refresh();
        K.toast("Espacio “" + name + "” creado.", { type: "success" });
        return;
      }

      if (form.id === "profileForm") {
        e.preventDefault();
        const backdrop = form.closest(".modal-backdrop");
        const name = backdrop.querySelector("#profileName").value.trim();
        if (name.length < 2) { K.toast("El nombre debe tener al menos 2 caracteres.", { type: "error" }); return; }
        user = store.updateUser({ name: name });
        closeTopModal();
        renderAll();
        K.toast("Perfil actualizado.", { type: "success" });
        return;
      }
    });

    document.addEventListener("keydown", function (e) {
      const tag = (e.target.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;
      const modalOpen = document.body.classList.contains("modal-open");

      if (e.key === "Escape") {
        closeMenus();
        closeSidebar();
        return;
      }
      if (typing || modalOpen) return;
      if (e.key === "/") {
        e.preventDefault();
        els.search.focus();
        return;
      }
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        openTaskForCurrentView();
      }
    });

    window.addEventListener("popstate", function () {
      state.view = hashView();
      renderAll();
      window.scrollTo({ top: 0, behavior: "auto" });
    });

    window.addEventListener("beforeunload", function () {
      if (state.focus.running) {
        state.focus.remaining = Math.max(0, Math.ceil((state.focus.endAt - Date.now()) / 1000));
      }
      saveFocus();
    });

    if (!window.location.hash) {
      history.replaceState({ view: state.view }, "", "#" + state.view);
    }

    try {
      if (!localStorage.getItem("kairos.theme")) {
        K.theme.apply((user.prefs && user.prefs.theme) || "light");
      }
    } catch (e) { /* sin almacenamiento */ }

    renderAll();

    try {
      if (sessionStorage.getItem("kairos.welcome") === "1") {
        sessionStorage.removeItem("kairos.welcome");
        setTimeout(function () {
          K.toast("Tu espacio está listo, " + firstName() + ". Empieza por una sola tarea.", {
            type: "success",
            icon: "sparkle",
            duration: 5200
          });
        }, 500);
      }
    } catch (e) { /* sin sessionStorage */ }

    setInterval(tickTimer, 300);
    setInterval(function () {
      const today = store.todayISO();
      if (today !== lastDay) {
        lastDay = today;
        state.selectedDay = today;
        state.calMonth = today.slice(0, 7) + "-01";
        refresh();
      }
    }, 30000);

    if (state.focus.running) updateTimerUI();
  }

  init();
})();

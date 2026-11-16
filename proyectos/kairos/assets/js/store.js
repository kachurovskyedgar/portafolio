/* ============================================================
   kairós · store.js
   Capa de datos local (localStorage) con API tipo repositorio.
   En producción esta capa se sustituye por llamadas fetch() a
   una API REST sin tocar la interfaz.
   ============================================================ */
(function () {
  "use strict";

  const K = (window.K = window.K || {});

  const DB_KEY = "kairos.db.v1";
  const SESSION_KEY = "kairos.session.v1";
  const DEMO = { email: "demo@kairos.app", password: "demo1234", name: "Ana Rivera" };

  /* ---------- almacenamiento seguro ---------- */

  const memory = {};
  const safe = {
    get(key) {
      try { return window.localStorage.getItem(key); }
      catch (e) { return memory[key] ?? null; }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, value); }
      catch (e) { memory[key] = value; }
    },
    remove(key) {
      try { window.localStorage.removeItem(key); }
      catch (e) { delete memory[key]; }
    }
  };

  /* ---------- utilidades ---------- */

  function uid(prefix) {
    return prefix + "_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  function dateToISO(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function fromISO(iso) {
    if (!iso) return null;
    const parts = String(iso).split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  }

  function todayISO() { return dateToISO(new Date()); }

  function addDaysISO(iso, days) {
    const d = fromISO(iso) || new Date();
    d.setDate(d.getDate() + days);
    return dateToISO(d);
  }

  function at(offset, hour, minute) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    d.setHours(hour, minute || 0, 0, 0);
    return d.toISOString();
  }

  function dateOfISO(isoString) {
    if (!isoString) return null;
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return null;
    return dateToISO(d);
  }

  // Hash de demostración. No es criptográficamente seguro: en la versión
  // con backend la contraseña se cifra con bcrypt en el servidor.
  function hashPass(email, password) {
    const input = String(email).toLowerCase() + "::" + password + "::kairos";
    let h1 = 0x811c9dc5;
    let h2 = 0x1000193;
    for (let i = 0; i < input.length; i++) {
      const c = input.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
      h2 = (h2 ^ (h2 >>> 13)) >>> 0;
    }
    return "k1_" + h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
  }

  function readDB() {
    const raw = safe.get(DB_KEY);
    if (!raw) return { version: 1, users: [], tasks: [], projects: [], focus: [] };
    try {
      const db = JSON.parse(raw);
      db.users = db.users || [];
      db.tasks = db.tasks || [];
      db.projects = db.projects || [];
      db.focus = db.focus || [];
      return db;
    } catch (e) {
      return { version: 1, users: [], tasks: [], projects: [], focus: [] };
    }
  }

  function writeDB(db) { safe.set(DB_KEY, JSON.stringify(db)); }

  /* ---------- datos de demostración ---------- */

  const COLORS = ["#c14e2e", "#33574a", "#c99a2e", "#4f7291", "#8a5a83", "#6b7f3a", "#a8623c", "#4a6b6b"];

  const SEED_TASKS = [
    {
      key: "informe", title: "Entregar informe de práctica", project: "uni", priority: "alta",
      due: 0, time: "10:00",
      notes: "Revisar formato, anexos y las conclusiones antes de subirlo al campus.",
      checklist: ["Corregir introducción", "Agregar gráficos", "Revisar ortografía"]
    },
    {
      key: "presentacion", title: "Preparar presentación Kairós", project: "uni", priority: "alta",
      due: 0, time: "16:00",
      notes: "15 minutos: problema, demo, arquitectura y aprendizajes.",
      checklist: ["Armar diapositivas", "Ensayar guion", "Probar la demo"]
    },
    {
      key: "reunion", title: "Reunión con el equipo de prácticas", project: "work", priority: "media",
      due: 0, time: "15:30",
      notes: "Definir quién presenta cada bloque y cerrar el checklist de entrega."
    },
    {
      key: "servicios", title: "Pagar servicios del mes", project: "personal", priority: "alta",
      due: -1, time: "09:00",
      notes: "Luz, internet y agua. Guardar los comprobantes."
    },
    {
      key: "avance", title: "Enviar avance al tutor", project: "work", priority: "alta",
      due: -2,
      notes: "Adjuntar el documento y pedir feedback antes del viernes."
    },
    {
      key: "capitulo", title: "Leer capítulo 4 de Base de Datos", project: "uni", priority: "media",
      due: 1, time: "19:00"
    },
    {
      key: "insumos", title: "Comprar insumos para la exposición", project: "uni", priority: "media",
      due: 1, notes: "Marcadores, cartulina y cable HDMI."
    },
    {
      key: "entreno", title: "Entrenamiento de fuerza", project: "health", priority: "media",
      due: 1, time: "07:30"
    },
    {
      key: "cv", title: "Actualizar CV y portafolio", project: "personal", priority: "media",
      due: 2, notes: "Agregar Kairós como proyecto destacado."
    },
    {
      key: "sala", title: "Reservar sala de estudio", project: "uni", priority: "baja",
      due: 3
    },
    {
      key: "banco", title: "Llamar al banco", project: "personal", priority: "baja",
      due: 4
    },
    {
      key: "documentacion", title: "Entregar documentación del proyecto", project: "work", priority: "media",
      due: 5, notes: "Incluir repositorio, guion y dossier impreso."
    },
    {
      key: "exposicion", title: "Exposición final de prácticas", project: "uni", priority: "alta",
      due: 6, time: "18:00", notes: "Todos los integrantes participan. Llegar 20 minutos antes."
    },
    {
      key: "planificar", title: "Planificar la semana", project: "personal", priority: "media",
      due: 0, completed: 0, doneAt: [9, 10]
    },
    {
      key: "caminar", title: "Caminar 30 minutos", project: "health", priority: "baja",
      due: 0, completed: 0, doneAt: [8, 20]
    },
    {
      key: "correos", title: "Revisar correos pendientes", project: "work", priority: "baja",
      due: 0, completed: 0, doneAt: [11, 5]
    },
    {
      key: "guia", title: "Terminar guía de ejercicios", project: "uni", priority: "media",
      due: -1, completed: -1, doneAt: [18, 40]
    },
    {
      key: "resumen", title: "Preparar resumen de clase", project: "uni", priority: "media",
      due: -2, completed: -2, doneAt: [17, 15]
    },
    {
      key: "tablero", title: "Actualizar tablero del equipo", project: "work", priority: "media",
      due: -3, completed: -3, doneAt: [16, 0]
    },
    {
      key: "parcial", title: "Estudiar para el parcial", project: "uni", priority: "alta",
      due: -4, completed: -4, doneAt: [21, 30]
    },
    {
      key: "articulo", title: "Leer artículo sobre productividad", project: "work", priority: "baja",
      due: -4, completed: -4, doneAt: [10, 10]
    },
    {
      key: "caminata45", title: "Caminar 45 minutos", project: "health", priority: "baja",
      due: -5, completed: -5, doneAt: [7, 50]
    },
    {
      key: "escritorio", title: "Ordenar el escritorio", project: "personal", priority: "baja",
      due: -6, completed: -6, doneAt: [20, 0]
    }
  ];

  function seedFor(userId) {
    const db = readDB();
    const now = new Date().toISOString();

    const projectDefs = {
      uni: { name: "Universidad", color: COLORS[0] },
      work: { name: "Trabajo", color: COLORS[1] },
      personal: { name: "Personal", color: COLORS[2] },
      health: { name: "Salud", color: COLORS[3] }
    };

    const projects = {};
    Object.keys(projectDefs).forEach(function (key) {
      const p = {
        id: uid("prj"),
        userId: userId,
        name: projectDefs[key].name,
        color: projectDefs[key].color,
        createdAt: now
      };
      projects[key] = p;
      db.projects.push(p);
    });

    const keyToId = {};

    SEED_TASKS.forEach(function (t) {
      const id = uid("tsk");
      keyToId[t.key] = id;
      const done = typeof t.completed === "number";
      db.tasks.push({
        id: id,
        userId: userId,
        title: t.title,
        notes: t.notes || "",
        projectId: projects[t.project] ? projects[t.project].id : null,
        priority: t.priority,
        due: addDaysISO(todayISO(), t.due),
        time: t.time || "",
        completed: done,
        completedAt: done ? at(t.completed, t.doneAt[0], t.doneAt[1]) : null,
        checklist: (t.checklist || []).map(function (text, i) {
          return { id: uid("chk"), text: text, done: i === 0 };
        }),
        createdAt: at(-9, 9, 0),
        updatedAt: at(done ? t.completed : 0, 12, 0),
        focusMinutes: 0
      });
    });

    const focusSeeds = [
      { d: 0, minutes: 25, task: "informe" },
      { d: 0, minutes: 25, task: null },
      { d: -1, minutes: 50, task: "presentacion" },
      { d: -2, minutes: 25, task: null },
      { d: -3, minutes: 25, task: "tablero" },
      { d: -4, minutes: 50, task: "parcial" },
      { d: -5, minutes: 25, task: null },
      { d: -6, minutes: 25, task: "escritorio" }
    ];
    focusSeeds.forEach(function (f) {
      db.focus.push({
        id: uid("foc"),
        userId: userId,
        taskId: f.task ? keyToId[f.task] : null,
        minutes: f.minutes,
        date: addDaysISO(todayISO(), f.d),
        completedAt: at(f.d, 19, 0)
      });
    });

    writeDB(db);
  }

  /* ---------- autenticación ---------- */

  function publicUser(user) {
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      isDemo: !!user.isDemo,
      prefs: Object.assign({ theme: "light" }, user.prefs || {})
    };
  }

  function findByEmail(db, email) {
    const clean = String(email || "").trim().toLowerCase();
    return db.users.find(function (u) { return u.email === clean; });
  }

  function ensureDemo() {
    const db = readDB();
    let demo = findByEmail(db, DEMO.email);
    if (!demo) {
      demo = {
        id: uid("usr"),
        name: DEMO.name,
        email: DEMO.email,
        pass: hashPass(DEMO.email, DEMO.password),
        createdAt: new Date().toISOString(),
        prefs: { theme: "light" },
        isDemo: true
      };
      db.users.push(demo);
      writeDB(db);
      seedFor(demo.id);
    }
    return demo;
  }

  function login(email, password) {
    const db = readDB();
    const user = findByEmail(db, email);
    if (!user || user.pass !== hashPass(user.email, password)) {
      throw new Error("Correo o contraseña incorrectos.");
    }
    safe.set(SESSION_KEY, user.id);
    return publicUser(user);
  }

  function register(data) {
    const name = String(data.name || "").trim();
    const email = String(data.email || "").trim().toLowerCase();
    const password = String(data.password || "");

    if (name.length < 2) throw new Error("Escribe tu nombre (mínimo 2 caracteres).");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error("Escribe un correo válido.");
    if (password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");

    const db = readDB();
    if (findByEmail(db, email)) throw new Error("Ya existe una cuenta con ese correo.");

    const user = {
      id: uid("usr"),
      name: name,
      email: email,
      pass: hashPass(email, password),
      createdAt: new Date().toISOString(),
      prefs: { theme: "light" }
    };
    db.users.push(user);

    const starter = [
      { name: "Personal", color: COLORS[2] },
      { name: "Estudios", color: COLORS[0] },
      { name: "Trabajo", color: COLORS[1] }
    ];
    starter.forEach(function (p) {
      db.projects.push({ id: uid("prj"), userId: user.id, name: p.name, color: p.color, createdAt: new Date().toISOString() });
    });
    db.tasks.push({
      id: uid("tsk"),
      userId: user.id,
      title: "Explorar Kairós y crear mi primera tarea",
      notes: "Pulsa N para crear una tarea o escribe en la barra rápida.",
      projectId: null,
      priority: "media",
      due: todayISO(),
      time: "",
      completed: false,
      completedAt: null,
      checklist: [
        { id: uid("chk"), text: "Crear una tarea", done: false },
        { id: uid("chk"), text: "Probar el modo enfoque", done: false }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      focusMinutes: 0
    });

    writeDB(db);
    safe.set(SESSION_KEY, user.id);
    return publicUser(user);
  }

  function logout() { safe.remove(SESSION_KEY); }

  function currentUser() {
    const id = safe.get(SESSION_KEY);
    if (!id) return null;
    const db = readDB();
    const user = db.users.find(function (u) { return u.id === id; });
    return user ? publicUser(user) : null;
  }

  function updateUser(patch) {
    const user = currentUser();
    if (!user) return null;
    const db = readDB();
    const raw = db.users.find(function (u) { return u.id === user.id; });
    if (!raw) return null;
    if (typeof patch.name === "string" && patch.name.trim().length >= 2) raw.name = patch.name.trim();
    if (patch.prefs) raw.prefs = Object.assign({}, raw.prefs || {}, patch.prefs);
    writeDB(db);
    return publicUser(raw);
  }

  /* ---------- tareas ---------- */

  function tasks(userId) {
    return readDB().tasks.filter(function (t) { return t.userId === userId; });
  }

  function task(id) {
    return readDB().tasks.find(function (t) { return t.id === id; }) || null;
  }

  function createTask(userId, data) {
    const db = readDB();
    const now = new Date().toISOString();
    const newTask = {
      id: uid("tsk"),
      userId: userId,
      title: String(data.title || "").trim().slice(0, 180),
      notes: String(data.notes || "").trim().slice(0, 1200),
      projectId: data.projectId || null,
      priority: ["alta", "media", "baja"].includes(data.priority) ? data.priority : "media",
      due: data.due || "",
      time: data.time || "",
      completed: false,
      completedAt: null,
      checklist: Array.isArray(data.checklist)
        ? data.checklist.filter(function (c) { return c.text && c.text.trim(); })
            .map(function (c) { return { id: c.id || uid("chk"), text: c.text.trim().slice(0, 140), done: !!c.done }; })
        : [],
      createdAt: now,
      updatedAt: now,
      focusMinutes: 0
    };
    db.tasks.push(newTask);
    writeDB(db);
    return newTask;
  }

  function updateTask(id, patch) {
    const db = readDB();
    const t = db.tasks.find(function (x) { return x.id === id; });
    if (!t) return null;
    ["title", "notes", "projectId", "priority", "due", "time", "checklist"].forEach(function (field) {
      if (typeof patch[field] !== "undefined") t[field] = patch[field];
    });
    if (typeof patch.title === "string") t.title = patch.title.trim().slice(0, 180) || t.title;
    t.updatedAt = new Date().toISOString();
    writeDB(db);
    return t;
  }

  function toggleTask(id) {
    const db = readDB();
    const t = db.tasks.find(function (x) { return x.id === id; });
    if (!t) return null;
    t.completed = !t.completed;
    t.completedAt = t.completed ? new Date().toISOString() : null;
    t.updatedAt = new Date().toISOString();
    writeDB(db);
    return t;
  }

  function toggleChecklistItem(taskId, itemId) {
    const db = readDB();
    const t = db.tasks.find(function (x) { return x.id === taskId; });
    if (!t) return null;
    const item = (t.checklist || []).find(function (c) { return c.id === itemId; });
    if (item) item.done = !item.done;
    writeDB(db);
    return t;
  }

  function deleteTask(id) {
    const db = readDB();
    const index = db.tasks.findIndex(function (x) { return x.id === id; });
    if (index === -1) return null;
    const removed = db.tasks.splice(index, 1)[0];
    writeDB(db);
    return removed;
  }

  function restoreTask(taskObj) {
    const db = readDB();
    if (!db.tasks.some(function (t) { return t.id === taskObj.id; })) {
      db.tasks.push(taskObj);
      writeDB(db);
    }
    return taskObj;
  }

  /* ---------- proyectos ---------- */

  function projects(userId) {
    return readDB().projects.filter(function (p) { return p.userId === userId; });
  }

  function createProject(userId, data) {
    const db = readDB();
    const project = {
      id: uid("prj"),
      userId: userId,
      name: String(data.name || "Sin nombre").trim().slice(0, 42),
      color: data.color || COLORS[0],
      createdAt: new Date().toISOString()
    };
    db.projects.push(project);
    writeDB(db);
    return project;
  }

  function deleteProject(id) {
    const db = readDB();
    db.projects = db.projects.filter(function (p) { return p.id !== id; });
    db.tasks.forEach(function (t) { if (t.projectId === id) t.projectId = null; });
    writeDB(db);
  }

  /* ---------- enfoque ---------- */

  function focusLogs(userId) {
    return readDB().focus.filter(function (f) { return f.userId === userId; });
  }

  function addFocusSession(userId, data) {
    const db = readDB();
    const minutes = Math.max(1, Math.round(Number(data.minutes) || 25));
    const log = {
      id: uid("foc"),
      userId: userId,
      taskId: data.taskId || null,
      minutes: minutes,
      date: todayISO(),
      completedAt: new Date().toISOString()
    };
    db.focus.push(log);
    if (data.taskId) {
      const t = db.tasks.find(function (x) { return x.id === data.taskId; });
      if (t) t.focusMinutes = (t.focusMinutes || 0) + minutes;
    }
    writeDB(db);
    return log;
  }

  /* ---------- notificaciones ---------- */

  function notifications(userId) {
    const today = todayISO();
    const tomorrow = addDaysISO(today, 1);
    const pending = tasks(userId).filter(function (t) { return !t.completed; });
    const items = [];
    pending.forEach(function (t) {
      if (!t.due) return;
      if (t.due < today) items.push({ task: t, kind: "overdue", date: t.due });
      else if (t.due === today) items.push({ task: t, kind: "today", date: t.due });
      else if (t.due === tomorrow) items.push({ task: t, kind: "tomorrow", date: t.due });
    });
    const weight = { overdue: 0, today: 1, tomorrow: 2 };
    items.sort(function (a, b) {
      if (weight[a.kind] !== weight[b.kind]) return weight[a.kind] - weight[b.kind];
      return (a.task.time || "99:99").localeCompare(b.task.time || "99:99");
    });
    return items;
  }

  /* ---------- exportar / importar ---------- */

  function exportData(userId) {
    const user = currentUser();
    return {
      app: "kairos",
      version: 1,
      exportedAt: new Date().toISOString(),
      user: { name: user ? user.name : "", email: user ? user.email : "" },
      projects: projects(userId),
      tasks: tasks(userId),
      focus: focusLogs(userId)
    };
  }

  function importData(userId, payload) {
    if (!payload || !Array.isArray(payload.tasks) || !Array.isArray(payload.projects)) {
      throw new Error("El archivo no tiene el formato de Kairós.");
    }
    const db = readDB();
    db.tasks = db.tasks.filter(function (t) { return t.userId !== userId; });
    db.projects = db.projects.filter(function (p) { return p.userId !== userId; });
    db.focus = db.focus.filter(function (f) { return f.userId !== userId; });

    const projectMap = {};
    payload.projects.forEach(function (p) {
      const newId = uid("prj");
      projectMap[p.id] = newId;
      db.projects.push({
        id: newId,
        userId: userId,
        name: String(p.name || "Sin nombre").slice(0, 42),
        color: p.color || COLORS[0],
        createdAt: p.createdAt || new Date().toISOString()
      });
    });

    const taskMap = {};
    payload.tasks.forEach(function (t) {
      const newId = uid("tsk");
      taskMap[t.id] = newId;
      db.tasks.push({
        id: newId,
        userId: userId,
        title: String(t.title || "Tarea importada").slice(0, 180),
        notes: String(t.notes || "").slice(0, 1200),
        projectId: projectMap[t.projectId] || null,
        priority: ["alta", "media", "baja"].includes(t.priority) ? t.priority : "media",
        due: t.due || "",
        time: t.time || "",
        completed: !!t.completed,
        completedAt: t.completedAt || null,
        checklist: (t.checklist || []).map(function (c) {
          return { id: uid("chk"), text: String(c.text || "").slice(0, 140), done: !!c.done };
        }),
        createdAt: t.createdAt || new Date().toISOString(),
        updatedAt: t.updatedAt || new Date().toISOString(),
        focusMinutes: Number(t.focusMinutes) || 0
      });
    });

    (payload.focus || []).forEach(function (f) {
      db.focus.push({
        id: uid("foc"),
        userId: userId,
        taskId: taskMap[f.taskId] || null,
        minutes: Number(f.minutes) || 25,
        date: f.date || todayISO(),
        completedAt: f.completedAt || new Date().toISOString()
      });
    });

    writeDB(db);
    return { tasks: payload.tasks.length, projects: payload.projects.length };
  }

  function resetDemo() {
    const user = ensureDemo();
    const db = readDB();
    db.tasks = db.tasks.filter(function (t) { return t.userId !== user.id; });
    db.projects = db.projects.filter(function (p) { return p.userId !== user.id; });
    db.focus = db.focus.filter(function (f) { return f.userId !== user.id; });
    writeDB(db);
    seedFor(user.id);
    return publicUser(user);
  }

  function resetAccount(userId) {
    const db = readDB();
    db.tasks = db.tasks.filter(function (t) { return t.userId !== userId; });
    db.projects = db.projects.filter(function (p) { return p.userId !== userId; });
    db.focus = db.focus.filter(function (f) { return f.userId !== userId; });
    writeDB(db);
    const starter = [
      { name: "Personal", color: COLORS[2] },
      { name: "Estudios", color: COLORS[0] },
      { name: "Trabajo", color: COLORS[1] }
    ];
    starter.forEach(function (p) {
      db.projects.push({ id: uid("prj"), userId: userId, name: p.name, color: p.color, createdAt: new Date().toISOString() });
    });
    writeDB(db);
  }

  function deleteAccount(userId) {
    const db = readDB();
    db.users = db.users.filter(function (u) { return u.id !== userId; });
    db.tasks = db.tasks.filter(function (t) { return t.userId !== userId; });
    db.projects = db.projects.filter(function (p) { return p.userId !== userId; });
    db.focus = db.focus.filter(function (f) { return f.userId !== userId; });
    writeDB(db);
    logout();
  }

  /* ---------- API pública ---------- */

  K.store = {
    demo: DEMO,
    colors: COLORS,
    uid: uid,
    todayISO: todayISO,
    addDaysISO: addDaysISO,
    fromISO: fromISO,
    dateToISO: dateToISO,
    dateOfISO: dateOfISO,
    ensureDemo: ensureDemo,
    login: login,
    register: register,
    logout: logout,
    currentUser: currentUser,
    updateUser: updateUser,
    tasks: tasks,
    task: task,
    createTask: createTask,
    updateTask: updateTask,
    toggleTask: toggleTask,
    toggleChecklistItem: toggleChecklistItem,
    deleteTask: deleteTask,
    restoreTask: restoreTask,
    projects: projects,
    createProject: createProject,
    deleteProject: deleteProject,
    focusLogs: focusLogs,
    addFocusSession: addFocusSession,
    notifications: notifications,
    exportData: exportData,
    importData: importData,
    resetDemo: resetDemo,
    resetAccount: resetAccount,
    deleteAccount: deleteAccount
  };
})();

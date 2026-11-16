/* ============================================================
   kairós · auth.js
   ============================================================ */
(function () {
  "use strict";

  const K = window.K;
  const store = K.store;

  document.querySelectorAll("[data-icon]").forEach(function (el) {
    el.innerHTML = K.icon(el.getAttribute("data-icon"));
  });
  K.theme.init();

  if (store.currentUser()) {
    window.location.replace("app.html");
    return;
  }

  // La cuenta de demostración siempre está disponible.
  try { store.ensureDemo(); } catch (e) { /* almacenamiento no disponible */ }

  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const tabLogin = document.getElementById("tabLogin");
  const tabRegister = document.getElementById("tabRegister");
  const banner = document.getElementById("authBanner");
  const bannerText = document.getElementById("authBannerText");
  const titleEl = document.getElementById("authTitle");
  const subEl = document.getElementById("authSub");
  const kickerEl = document.getElementById("authKicker");

  let mode = new URLSearchParams(window.location.search).get("mode") === "register" ? "register" : "login";
  if (window.location.hash === "#registro") mode = "register";

  function showBanner(message) {
    bannerText.textContent = message;
    banner.classList.add("is-visible");
  }

  function hideBanner() {
    banner.classList.remove("is-visible");
  }

  function setMode(next, focus) {
    mode = next === "register" ? "register" : "login";
    const isRegister = mode === "register";
    loginForm.hidden = isRegister;
    registerForm.hidden = !isRegister;
    tabLogin.setAttribute("aria-selected", String(!isRegister));
    tabRegister.setAttribute("aria-selected", String(isRegister));
    tabLogin.tabIndex = isRegister ? -1 : 0;
    tabRegister.tabIndex = isRegister ? 0 : -1;
    titleEl.textContent = isRegister ? "Empieza con intención." : "Bienvenido de nuevo.";
    subEl.textContent = isRegister
      ? "Crea tu espacio en segundos. Sin tarjeta, sin ruido, sin promesas raras."
      : "Entra y retoma exactamente donde lo dejaste. Sin ruido, sin culpa.";
    kickerEl.textContent = isRegister ? "Primer paso" : "Tu espacio personal";
    hideBanner();

    const url = new URL(window.location.href);
    if (isRegister) url.searchParams.set("mode", "register");
    else url.searchParams.delete("mode");
    url.hash = "";
    history.replaceState(null, "", url.toString());

    if (focus) {
      const target = isRegister ? document.getElementById("registerName") : document.getElementById("loginEmail");
      setTimeout(function () { target.focus(); }, 40);
    }
  }

  tabLogin.addEventListener("click", function () { setMode("login", true); });
  tabRegister.addEventListener("click", function () { setMode("register", true); });

  document.querySelectorAll("[data-toggle-password]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const input = document.getElementById(btn.getAttribute("data-toggle-password"));
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.innerHTML = K.icon(show ? "eye-off" : "eye");
      btn.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
    });
  });

  [loginForm, registerForm].forEach(function (form) {
    form.addEventListener("input", hideBanner);
  });

  function loading(button, active, label) {
    if (active) {
      button.dataset.original = button.innerHTML;
      button.disabled = true;
      button.textContent = label;
    } else {
      button.disabled = false;
      if (button.dataset.original) button.innerHTML = button.dataset.original;
    }
  }

  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    if (!email || !password) {
      showBanner("Completa tu correo y contraseña para entrar.");
      return;
    }
    const button = document.getElementById("loginSubmit");
    loading(button, true, "Entrando…");
    try {
      store.login(email, password);
      window.location.href = "app.html";
    } catch (error) {
      loading(button, false);
      showBanner(error.message || "No se pudo iniciar sesión.");
      document.getElementById("loginPassword").focus();
      document.getElementById("loginPassword").select();
    }
  });

  registerForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const name = document.getElementById("registerName").value.trim();
    const email = document.getElementById("registerEmail").value.trim();
    const password = document.getElementById("registerPassword").value;
    if (!name || !email || !password) {
      showBanner("Completa los tres campos para crear tu cuenta.");
      return;
    }
    const button = document.getElementById("registerSubmit");
    loading(button, true, "Creando tu espacio…");
    try {
      store.register({ name: name, email: email, password: password });
      try { sessionStorage.setItem("kairos.welcome", "1"); } catch (err) { /* sin sessionStorage */ }
      window.location.href = "app.html";
    } catch (error) {
      loading(button, false);
      showBanner(error.message || "No se pudo crear la cuenta.");
    }
  });

  const demoBtn = document.getElementById("demoBtn");
  demoBtn.addEventListener("click", function () {
    loading(demoBtn, true, "Preparando la demo…");
    try {
      store.ensureDemo();
      store.login(store.demo.email, store.demo.password);
      window.location.href = "app.html";
    } catch (error) {
      loading(demoBtn, false);
      showBanner("No se pudo abrir la demo: " + error.message);
    }
  });

  setMode(mode, false);
  document.getElementById(mode === "register" ? "registerName" : "loginEmail").focus();
})();

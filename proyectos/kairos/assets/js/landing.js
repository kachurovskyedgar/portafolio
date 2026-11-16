/* ============================================================
   kairós · landing.js
   ============================================================ */
(function () {
  "use strict";

  const K = window.K;
  const store = K.store;

  document.querySelectorAll("[data-icon]").forEach(function (el) {
    el.innerHTML = K.icon(el.getAttribute("data-icon"));
  });

  K.theme.init();

  try {
    const current = store.currentUser();
    if (current && !localStorage.getItem("kairos.theme")) {
      K.theme.apply((current.prefs && current.prefs.theme) || "light");
    }
  } catch (e) { /* sin almacenamiento */ }

  /* navegación con sombra al hacer scroll */
  const nav = document.getElementById("siteNav");
  function onScroll() {
    if (nav) nav.classList.toggle("is-scrolled", window.scrollY > 8);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* animaciones de entrada */
  const revealItems = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    revealItems.forEach(function (el, i) {
      el.style.transitionDelay = Math.min(i % 3, 2) * 70 + "ms";
      observer.observe(el);
    });
  } else {
    revealItems.forEach(function (el) { el.classList.add("is-in"); });
  }

  /* cuenta existente: adaptar llamadas a la acción */
  const currentUser = store.currentUser();
  if (currentUser) {
    const loginLink = document.getElementById("loginLink");
    if (loginLink) {
      loginLink.textContent = "Mi espacio";
      loginLink.href = "app.html";
    }
    document.querySelectorAll("[data-demo]").forEach(function (btn) {
      btn.textContent = "Abrir mi espacio";
    });
  }

  /* demo en un clic */
  document.querySelectorAll("[data-demo]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (store.currentUser()) {
        window.location.href = "app.html";
        return;
      }
      const original = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = "Preparando la demo…";
      try {
        store.ensureDemo();
        store.login(store.demo.email, store.demo.password);
        window.location.href = "app.html";
      } catch (error) {
        btn.disabled = false;
        btn.innerHTML = original;
        if (K.toast) K.toast("No se pudo iniciar la demo: " + error.message, { type: "error" });
      }
    });
  });

  /* una pregunta abierta a la vez */
  const details = Array.from(document.querySelectorAll(".faq-item"));
  details.forEach(function (item) {
    item.addEventListener("toggle", function () {
      if (!item.open) return;
      details.forEach(function (other) {
        if (other !== item) other.open = false;
      });
    });
  });
})();

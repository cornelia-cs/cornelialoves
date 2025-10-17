// app.js — laddar header + footer och markerar aktiv meny
(async () => {
  // Header
  const h = await fetch("/header.html").then(r => r.text());
  const headerEl = document.getElementById("header");
  if (headerEl) headerEl.innerHTML = h;

  // Footer
  const f = await fetch("/footer.html").then(r => r.text());
  const footerEl = document.getElementById("footer");
  if (footerEl) {
    footerEl.innerHTML = f;
    const y = footerEl.querySelector("#year");
    if (y) y.textContent = new Date().getFullYear();
  }

  // Markera aktiv länk i menyn
  const here = location.pathname.replace(/index\.html$/, "");
  document.querySelectorAll(".main-nav a").forEach(a => {
    const p = new URL(a.href, location.origin).pathname.replace(/index\.html$/, "");
    if (p === here) a.setAttribute("aria-current","page");
  });
})();

// app.js – laddar header + footer på alla sidor

async function loadPart(id, file) {
  const el = document.getElementById(id);
  if (!el) return;
  try {
    const res = await fetch(`/${file}`);
    el.innerHTML = await res.text();

    // markera aktiv sida
    el.querySelectorAll(".main-nav a").forEach(a => {
      const p = new URL(a.href).pathname.replace(/index\.html$/, "");
      const here = location.pathname.replace(/index\.html$/, "");
      if (p === here) a.setAttribute("aria-current", "page");
    });
  } catch (err) {
    console.error(`Kunde inte ladda ${file}:`, err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadPart("header", "header.html");
  loadPart("footer", "footer.html");
});

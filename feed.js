// feed.js – blandat flöde med hela inlägg + små tankebubblor

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  items: [],
  selectedMonth: null,
  selectedTag: null
};

const REPO = "cornelia-cs/cornelialoves";
const COMMENTS_LABEL = "comment";

const monthNames = [
  "januari",
  "februari",
  "mars",
  "april",
  "maj",
  "juni",
  "juli",
  "augusti",
  "september",
  "oktober",
  "november",
  "december"
];

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function monthKey(date) {
  return date.slice(0, 7);
}

function formatDate(date) {
  const d = new Date(`${date}T12:00:00`);
  const day = d.getDate();
  const month = monthNames[d.getMonth()];
  return `${day} ${month}`;
}

function formatYearMonth(key) {
  const [year, month] = key.split("-");
  return {
    year,
    monthName: monthNames[Number(month) - 1],
    monthNumber: month
  };
}

function readURLState() {
  const url = new URL(location.href);
  state.selectedMonth = url.searchParams.get("month");
  state.selectedTag = url.searchParams.get("tag");
}

function writeURLState() {
  const url = new URL(location.href);

  url.searchParams.delete("month");
  url.searchParams.delete("tag");

  if (state.selectedMonth) url.searchParams.set("month", state.selectedMonth);
  if (state.selectedTag) url.searchParams.set("tag", state.selectedTag);

  history.replaceState(null, "", url.toString());
}

function uniqueMonths(items) {
  return [...new Set(
    items
      .filter(item => item.date)
      .map(item => monthKey(item.date))
  )].sort().reverse();
}

function uniqueTags(items) {
  const tags = new Set();

  items.forEach(item => {
    (item.tags || []).forEach(tag => tags.add(tag));
  });

  return [...tags].sort((a, b) => a.localeCompare(b, "sv"));
}

function filteredItems() {
  return state.items
    .filter(item => {
      const monthOk = state.selectedMonth ? monthKey(item.date) === state.selectedMonth : true;
      const tagOk = state.selectedTag ? (item.tags || []).includes(state.selectedTag) : true;
      return monthOk && tagOk;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

async function waitFor(selector, timeoutMs = 4000) {
  const start = performance.now();

  return new Promise((resolve, reject) => {
    const tick = () => {
      const el = document.querySelector(selector);

      if (el) {
        resolve(el);
        return;
      }

      if (performance.now() - start > timeoutMs) {
        reject(new Error(`Timeout: ${selector}`));
        return;
      }

      requestAnimationFrame(tick);
    };

    tick();
  });
}

function renderFilters() {
  const monthMenu = $("#monthMenu");
  const tagMenu = $("#tagMenu");

  if (!monthMenu || !tagMenu) return;

  const months = uniqueMonths(state.items);
  const tags = uniqueTags(state.items);

  const monthsByYear = months.reduce((acc, key) => {
    const { year } = formatYearMonth(key);
    if (!acc[year]) acc[year] = [];
    acc[year].push(key);
    return acc;
  }, {});

  monthMenu.innerHTML = Object.entries(monthsByYear)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([year, keys]) => `
      <div class="archive-year">
        <strong>${year}</strong>
        ${keys.map(key => {
          const { monthName } = formatYearMonth(key);
          return `<a href="/?month=${encodeURIComponent(key)}">${escapeHtml(monthName)}</a>`;
        }).join("")}
      </div>
    `)
    .join("");

  tagMenu.innerHTML = tags.length
    ? tags.map(tag => `<a href="/?tag=${encodeURIComponent(tag)}">${escapeHtml(tag)}</a>`).join("")
    : `<a href="/">Inga ämnen än</a>`;

  monthMenu.onclick = (event) => {
    const link = event.target.closest("a");
    if (!link) return;

    event.preventDefault();
    const url = new URL(link.href);
    state.selectedMonth = url.searchParams.get("month");
    state.selectedTag = null;
    render();
  };

  tagMenu.onclick = (event) => {
    const link = event.target.closest("a");
    if (!link) return;

    event.preventDefault();
    const url = new URL(link.href);
    state.selectedTag = url.searchParams.get("tag");
    state.selectedMonth = null;
    render();
  };
}

function renderPost(item, index) {
  const tags = item.tags?.length ? item.tags.join(" · ") : "";
  const commentsId = `comments-${index}`;
  const body = item.contentHtml || `<p>${escapeHtml(item.excerpt || "")}</p>`;

  const images = (item.images || [])
    .map(src => `<img class="post-image" src="${escapeHtml(src)}" alt="" loading="lazy">`)
    .join("");

  return `
    <article class="feed-post" data-url="${escapeHtml(item.url || "")}">
      <h2>${escapeHtml(item.title || "Utan titel")}</h2>

      <p class="meta-line">
        PUBLICERAT
        <span class="dot">|</span>
        ${formatDate(item.date).toUpperCase()}
        ${tags ? `<span class="dot">|</span> ${escapeHtml(tags).toUpperCase()}` : ""}
      </p>

      <div class="post-body">
        ${body}
        ${images}
      </div>

      ${item.url ? `
        <div class="comments-row">
          <button class="comments-button" data-url="${escapeHtml(item.url)}" id="${commentsId}">
            Kommentarer
          </button>
        </div>
      ` : ""}
    </article>
  `;
}

function renderThought(item) {
  return `
    <aside class="feed-thought">
      <div class="thought-initials">${escapeHtml(item.initials || "C.S.")}</div>
      <div class="thought-bubble">
        <p class="thought-text">${escapeHtml(item.text || "")}</p>
      </div>
    </aside>
  `;
}

function renderFeed() {
  const feed = $("#feed");
  const items = filteredItems();

  if (!feed) return;

  if (!items.length) {
    feed.innerHTML = `
      <div class="empty-state">
        Inga inlägg här än.
      </div>
    `;
    return;
  }

  feed.innerHTML = items
    .map((item, index) => {
      if (item.type === "thought") return renderThought(item);
      return renderPost(item, index);
    })
    .join("");

  $$(".comments-button").forEach(button => {
    const url = button.dataset.url;

    button.onclick = () => openCommentsOverlay(url);

    fetchCommentCount(url)
      .then(count => {
        button.textContent = `Kommentarer (${count})`;
      })
      .catch(() => {
        button.textContent = "Kommentarer";
      });
  });
}

function renderPageTitle() {
  const title = $(".page-title");
  if (!title) return;

  if (state.selectedMonth) {
    const { monthName, year } = formatYearMonth(state.selectedMonth);
    title.textContent = `${monthName} ${year}`;
    return;
  }

  if (state.selectedTag) {
    title.textContent = state.selectedTag;
    return;
  }

  title.textContent = "Inlägg";
}

function render() {
  renderPageTitle();
  renderFeed();
  writeURLState();
}

let currentUrlInOverlay = null;

function openCommentsOverlay(postUrl) {
  const overlay = $("#commentsOverlay");
  const body = $("#overlayBody");
  const close = $("#overlayClose");

  if (!overlay || !body || !close) return;

  if (currentUrlInOverlay !== postUrl) {
    body.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://utteranc.es/client.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.setAttribute("repo", REPO);
    script.setAttribute("issue-term", postUrl);
    script.setAttribute("label", COMMENTS_LABEL);
    script.setAttribute("theme", "github-light");

    body.appendChild(script);
    currentUrlInOverlay = postUrl;
  }

  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  const onClose = () => {
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  };

  close.onclick = onClose;
  overlay.onclick = (event) => {
    if (event.target === overlay) onClose();
  };
  document.onkeydown = (event) => {
    if (event.key === "Escape") onClose();
  };
}

async function fetchCommentCount(postUrl) {
  const query = `repo:${REPO} label:${COMMENTS_LABEL} in:title "${postUrl}"`;
  const url = `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=1`;

  const response = await fetch(url, {
    headers: { Accept: "application/vnd.github+json" }
  });

  if (!response.ok) throw new Error("Kunde inte hämta kommentarer");

  const data = await response.json();

  if (!data.total_count) return 0;

  return data.items[0].comments ?? 0;
}

async function initFeed() {
  try {
    const response = await fetch("./posts/posts.json", { cache: "no-store" });
    state.items = await response.json();
  } catch (error) {
    console.error("Kunde inte läsa posts.json", error);
    state.items = [];
  }

  try {
    await waitFor("#monthBtn");
    await waitFor("#tagBtn");
  } catch (error) {
    console.warn("Headern verkar inte vara färdigladdad:", error);
  }

  readURLState();
  renderFilters();
  render();

  const monthBtn = $("#monthBtn");
  const tagBtn = $("#tagBtn");

  if (monthBtn) {
    monthBtn.onclick = () => $("#monthMenu")?.classList.toggle("show");
  }

  if (tagBtn) {
    tagBtn.onclick = () => $("#tagMenu")?.classList.toggle("show");
  }

  document.addEventListener("click", event => {
    if (!event.target.closest(".filter")) {
      $$(".menu").forEach(menu => menu.classList.remove("show"));
    }
  });
}

document.addEventListener("DOMContentLoaded", initFeed);
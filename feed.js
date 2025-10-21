// feed.js – flöde + filter i header + overlay-kommentarer + kommentarsantal + pagination (10/sida)

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  posts: [],
  selectedMonths: new Set(),   // "YYYY-MM"
  selectedTags:   new Set(),
  page: 1,
  pageSize: 10
};

const REPO = "cornelia-cs/cornelialoves";   // <- ditt GitHub-repo för Utterances
const COMMENTS_LABEL = "comment";           // <- se till att labeln "comment" finns i repot (Issues → Labels)

// -------- helpers --------

// Läs filter/sida från URL:en (ex: ?month=2025-10&tag=vardag&page=2)
function readURLState(){
  const u = new URL(location.href);
  const months = u.searchParams.getAll("month");
  const tags   = u.searchParams.getAll("tag");
  const page   = parseInt(u.searchParams.get("page") || "1", 10);
  state.selectedMonths = new Set(months);
  state.selectedTags   = new Set(tags);
  state.page = Number.isFinite(page) && page > 0 ? page : 1;
}

// Skriv nuvarande filter/sida till URL:en (utan sidladdning)
function writeURLState(){
  const u = new URL(location.href);
  u.searchParams.delete("month");
  u.searchParams.delete("tag");
  state.selectedMonths.forEach(m => u.searchParams.append("month", m));
  state.selectedTags.forEach(t => u.searchParams.append("tag", t));
  u.searchParams.set("page", String(state.page));
  history.replaceState(null, "", u.toString());
}

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString("sv-SE", { year:"numeric", month:"long", day:"numeric" });

const monthKey = (iso) => iso.slice(0,7);

function uniqueMonths(posts){
  return [...new Set(posts.map(p => monthKey(p.date)))].sort().reverse();
}

function uniqueTags(posts){
  const s = new Set();
  posts.forEach(p => (p.tags || []).forEach(t => s.add(t)));
  return [...s].sort((a,b)=>a.localeCompare(b,"sv"));
}

function matchesFilters(p){
  const mOk = state.selectedMonths.size ? state.selectedMonths.has(monthKey(p.date)) : true;
  const tOk = state.selectedTags.size   ? (p.tags||[]).some(t => state.selectedTags.has(t)) : true;
  return mOk && tOk;
}

function filteredSorted(){
  return state.posts
    .filter(matchesFilters)
    .sort((a,b)=> b.date.localeCompare(a.date)); // nyaste först
}

// Vänta på att headern (inladdad via app.js) finns
async function waitFor(selector, timeoutMs = 4000){
  const start = performance.now();
  return new Promise((resolve, reject)=>{
    const tick = ()=>{
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      if (performance.now() - start > timeoutMs) return reject(new Error("Timeout: "+selector));
      requestAnimationFrame(tick);
    };
    tick();
  });
}

// -------- Filters (i headern) --------
function renderFilters(){
  const months = uniqueMonths(state.posts);
  const tags   = uniqueTags(state.posts);

  const mMenu = $("#monthMenu");
  const tMenu = $("#tagMenu");
  if (!mMenu || !tMenu) return; // om header saknas (borde inte hända)

  // Visa "oktober 2025" istället för "2025-10"
  mMenu.innerHTML = months.map(m => {
    const label = new Date(`${m}-01`).toLocaleDateString("sv-SE", { year:"numeric", month:"long" });
    return `<label><input type="checkbox" value="${m}" ${state.selectedMonths.has(m)?"checked":""}/> ${label}</label>`;
  }).join("");

  tMenu.innerHTML = tags.map(t =>
    `<label><input type="checkbox" value="${t}" ${state.selectedTags.has(t)?"checked":""}/> ${t}</label>`
  ).join("");

  mMenu.onchange = (e)=>{
    const v = e.target.value;
    if (!v) return;
    e.target.checked ? state.selectedMonths.add(v) : state.selectedMonths.delete(v);
    state.page = 1;
    render();
  };
  tMenu.onchange = (e)=>{
    const v = e.target.value;
    if (!v) return;
    e.target.checked ? state.selectedTags.add(v) : state.selectedTags.delete(v);
    state.page = 1;
    render();
  };
}

// -------- Feed (renderar “post-kort”) --------
function renderFeed(){
  const cont  = $("#feed");
  const list  = filteredSorted();
  const start = (state.page - 1) * state.pageSize;
  const pageItems = list.slice(start, start + state.pageSize);

  cont.innerHTML = pageItems.map((p,i)=>{
    const idx = start + i;
    const countId = `cc-${idx}`;

    const meta = `
      <p class="meta-line">
        PUBLICERAT <span class="dot">|</span>
        ${fmtDate(p.date).toUpperCase()}
        ${p.tags?.length ? `<span class="dot">|</span> ${p.tags.join(" · ").toUpperCase()}` : ""}
      </p>`;

    return `
      <article class="card">
        <h2><a href="${p.url}">${p.title}</a></h2>
        ${meta}
        ${p.excerpt ? `<p>${p.excerpt}</p>` : ""}
        <div class="card-actions">
          <a class="btn" href="${p.url}">Öppna</a>
          <button class="btn ghost" data-url="${p.url}">Kommentarer</button>
          <span id="${countId}" class="comment-pill" aria-live="polite"></span>
        </div>
      </article>
    `;
  }).join("");

  // Öppna overlay
  $$("#feed button[data-url]").forEach(btn=>{
    btn.onclick = ()=> openCommentsOverlay(btn.dataset.url);
  });

  // Hämta kommentarsantal
  pageItems.forEach((p, i)=>{
    const el = document.getElementById(`cc-${start+i}`);
    fetchCommentCount(p.url).then(n=>{
      el.textContent = n ? `💬 ${n}` : `💬 0`;
      el.title = "Kommentarsantal hämtat från GitHub";
    }).catch(()=>{
      el.textContent = "";
    });
  });
}

// -------- Pagination --------
function renderPager(){
  const pager = $("#pager");
  const total = filteredSorted().length;
  const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
  if (state.page > totalPages) state.page = totalPages;

  const prevDis = state.page===1 ? "disabled" : "";
  const nextDis = state.page===totalPages ? "disabled" : "";

  pager.innerHTML = `
    <div class="pager-inner">
      <button class="btn ghost" data-act="prev" ${prevDis}>← Föregående</button>
      <span class="pager-info">Sida ${state.page} av ${totalPages}${total?` · ${total} inlägg`:""}</span>
      <button class="btn ghost" data-act="next" ${nextDis}>Nästa →</button>
    </div>
  `;

  pager.onclick = (e)=>{
    const act = e.target?.dataset?.act;
    if (!act) return;
    if (act==="prev" && state.page>1) state.page--;
    if (act==="next" && state.page<totalPages) state.page++;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
}

// -------- Overlay-kommentarer (Utterances) --------
let currentUrlInOverlay = null;

function openCommentsOverlay(postUrl){
  const overlay = $("#commentsOverlay");
  const body    = $("#overlayBody");
  const close   = $("#overlayClose");

  // Ladda rätt tråd
  if (currentUrlInOverlay !== postUrl){
    body.innerHTML = "";
    const s = document.createElement("script");
    s.src = "https://utteranc.es/client.js";
    s.async = true;
    s.crossOrigin = "anonymous";
    s.setAttribute("repo", REPO);
    // Viktigt: vi använder själva URL:en som term → funkar från index-overlay
    s.setAttribute("issue-term", postUrl);
    s.setAttribute("label", COMMENTS_LABEL);
    s.setAttribute("theme", "github-light");
    body.appendChild(s);
    currentUrlInOverlay = postUrl;
  }

  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden","false");
  document.body.style.overflow = "hidden";

  const onClose = ()=>{
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden","true");
    document.body.style.overflow = "";
  };
  close.onclick = onClose;
  overlay.onclick = (e)=>{ if (e.target === overlay) onClose(); };
  document.onkeydown = (e)=>{ if (e.key === "Escape") onClose(); };
}

// -------- Kommentarsantal (GitHub Search API) --------
// Vi söker efter issue vars titel innehåller postens PATH (Utterances skapar titel med termen).
async function fetchCommentCount(postUrl){
  // postUrl är t.ex. "/arkiv/2025/10/hej-bloggen.html"
  const term = postUrl; // vi använde denna som "specific term" i overlayn
  const q = `repo:${REPO} label:${COMMENTS_LABEL} in:title "${term}"`;
  // Om du INTE vill kräva labeln, byt raden ovan till:
  // const q = `repo:${REPO} in:title "${term}"`;
  const url = `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=1`;
  const res = await fetch(url, { headers: { "Accept": "application/vnd.github+json" }});
  if (!res.ok) throw new Error("GitHub API fel");
  const data = await res.json();
  if (!data.total_count) return 0;
  const issue = data.items[0];
  return issue.comments ?? 0;
}

// -------- Init --------
async function initFeed(){
  // 1) Ladda inläggsdata
  try{
    const res = await fetch("/posts/posts.json", { cache:"no-store" });
    state.posts = await res.json(); // förväntar sig en array
  }catch(e){
    console.error("Kunde inte läsa posts.json", e);
    state.posts = [];
  }

  // 2) Vänta på att headern är injicerad (Month/Tags-knapparna)
  try {
    await waitFor("#monthBtn");
    await waitFor("#tagBtn");
  } catch(e) {
    console.warn("Hittade inte filter-knappar i headern:", e);
  }

  // 3) Läs ev. filter/sida från URL, rita filter + feed + pager
  readURLState();
  renderFilters();
  render();

  // 4) Dropdown-beteende (öppna/stäng menyerna)
  const mb = $("#monthBtn");
  const tb = $("#tagBtn");
  if (mb) mb.onclick = () => $("#monthMenu").classList.toggle("show");
  if (tb) tb.onclick = () => $("#tagMenu").classList.toggle("show");
  document.addEventListener("click", (e)=>{ if(!e.target.closest(".filter")) $$(".menu").forEach(m=>m.classList.remove("show")); });
}

function render(){
  renderFeed();
  renderPager();
  writeURLState();   // uppdatera adressen varje gång vi ritar
}

document.addEventListener("DOMContentLoaded", initFeed);

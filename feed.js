// feed.js – flöde + filter + kommentarer i overlay + antal + pagination (10/sida)

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  posts: [],
  selectedMonths: new Set(), // "YYYY-MM"
  selectedTags: new Set(),
  page: 1,
  pageSize: 10
};

const REPO = "cornelia-cs/cornelialoves"; // <-- ditt repo

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" });
const monthKey = (iso) => iso.slice(0,7);

function uniqueMonths(posts){ return [...new Set(posts.map(p=>monthKey(p.date)))].sort().reverse(); }
function uniqueTags(posts){ const s=new Set(); posts.forEach(p=>(p.tags||[]).forEach(t=>s.add(t))); return [...s].sort((a,b)=>a.localeCompare(b,"sv")); }

function matchesFilters(p){
  const mOk = state.selectedMonths.size ? state.selectedMonths.has(monthKey(p.date)) : true;
  const tOk = state.selectedTags.size ? (p.tags||[]).some(t=>state.selectedTags.has(t)) : true;
  return mOk && tOk;
}
function filteredSorted(){ return state.posts.filter(matchesFilters).sort((a,b)=>b.date.localeCompare(a.date)); }

// ---------- Filters ----------
function renderFilters(){
  const months = uniqueMonths(state.posts);
  const tags = uniqueTags(state.posts);

  const mMenu = $("#monthMenu");
  mMenu.innerHTML = months.map(m=>`<label><input type="checkbox" value="${m}" ${state.selectedMonths.has(m)?"checked":""}/> ${m}</label>`).join("");

  const tMenu = $("#tagMenu");
  tMenu.innerHTML = tags.map(t=>`<label><input type="checkbox" value="${t}" ${state.selectedTags.has(t)?"checked":""}/> ${t}</label>`).join("");

  mMenu.onchange = (e)=>{ const v=e.target.value; e.target.checked?state.selectedMonths.add(v):state.selectedMonths.delete(v); state.page=1; render(); };
  tMenu.onchange = (e)=>{ const v=e.target.value; e.target.checked?state.selectedTags.add(v):state.selectedTags.delete(v); state.page=1; render(); };
}

// ---------- Feed ----------
function renderFeed(){
  const cont = $("#feed");
  const list = filteredSorted();
  const start = (state.page - 1) * state.pageSize;
  const pageItems = list.slice(start, start + state.pageSize);

  cont.innerHTML = pageItems.map((p,i)=>{
    const idx = start + i;
    const countId = `cc-${idx}`;
    return `
      <article class="card">
        <h2><a href="${p.url}">${p.title}</a></h2>
        <time datetime="${p.date}">${fmtDate(p.date)}</time>
        ${p.excerpt ? `<p>${p.excerpt}</p>` : ""}
        ${p.tags?.length ? `<p class="tags"># ${p.tags.join(" · ")}</p>` : ""}
        <div class="card-actions">
          <a class="btn" href="${p.url}">Öppna</a>
          <button class="btn ghost" data-url="${p.url}">Kommentarer</button>
          <span id="${countId}" class="comment-pill" aria-live="polite"></span>
        </div>
      </article>
    `;
  }).join("");

  // Knappar för overlay
  $$("#feed button[data-url]").forEach(btn=>{
    btn.onclick = ()=> openCommentsOverlay(btn.dataset.url);
  });

  // Hämta kommentarsantal
  pageItems.forEach((p, i)=>{
    const countEl = document.getElementById(`cc-${start+i}`);
    fetchCommentCount(p.url).then(n=>{
      countEl.textContent = `💬 ${n}`;
    }).catch(()=>{ countEl.textContent = ""; });
  });
}

// ---------- Pager ----------
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

// ---------- Overlay + Utterances ----------
let currentUrlInOverlay = null;

function openCommentsOverlay(postUrl){
  const overlay = $("#commentsOverlay");
  const body = $("#overlayBody");
  const close = $("#overlayClose");

  // rensa om ny url
  if (currentUrlInOverlay !== postUrl){
    body.innerHTML = "";
    const s = document.createElement("script");
    s.src = "https://utteranc.es/client.js";
    s.async = true;
    s.crossOrigin = "anonymous";
    s.setAttribute("repo", REPO);
    s.setAttribute("issue-term", postUrl);
    s.setAttribute("label", "comments");
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

// ---------- Kommentar-ANTAL via GitHub Search API ----------
async function fetchCommentCount(postUrl){
  const q = `repo:${REPO} label:comments in:body "${postUrl}"`;
  const url = `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=1`;
  const res = await fetch(url, { headers: { "Accept":"application/vnd.github+json" }});
  if (!res.ok) throw new Error("GitHub API fel");
  const data = await res.json();
  if (!data.total_count) return 0;
  const issue = data.items[0];
  return issue.comments ?? 0;
}

// ---------- Init ----------
async function initFeed(){
  try{
    const res = await fetch("/posts/posts.json", { cache:"no-store" });
    state.posts = await res.json();
  }catch(e){
    console.error("Kunde inte läsa posts.json", e);
    state.posts = [];
  }

  renderFilters();
  render();

  // Filter-vyer
  $("#monthBtn").onclick = ()=> $("#monthMenu").classList.toggle("show");
  $("#tagBtn").onclick   = ()=> $("#tagMenu").classList.toggle("show");
  document.addEventListener("click", (e)=>{ if(!e.target.closest(".filter")) $$(".menu").forEach(m=>m.classList.remove("show")); });
}

function render(){ renderFeed(); renderPager(); }

document.addEventListener("DOMContentLoaded", initFeed);

// editor.js — publicering + redigering (GitHub Contents API)

const el = (id) => document.getElementById(id);
const todayISO = () => new Date().toISOString().slice(0,10);
const param = (k) => new URL(location.href).searchParams.get(k);

function slugify(str){
  return String(str)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[åä]/g,'a').replace(/ö/g,'o')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80);
}
function b64encodeText(str){ return btoa(unescape(encodeURIComponent(str))); }
async function b64encodeFile(file){ const b = await file.arrayBuffer(); return btoa(String.fromCharCode(...new Uint8Array(b))); }
function isoToParts(iso){ const d=new Date(iso); return { y:d.getFullYear(), m:String(d.getMonth()+1).padStart(2,'0') }; }
function extractExcerpt(html){ const t=document.createElement('div'); t.innerHTML=html; return (t.textContent||'').trim().slice(0,160); }
function capFirst(s){ return s? s.charAt(0).toUpperCase()+s.slice(1) : s; }
function escapeHtml(s){ return String(s).replace(/[&<>\"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

function ghHeaders(token){ return { 'Authorization':`Bearer ${token}`, 'Accept':'application/vnd.github+json' }; }
async function ghGet(owner,repo,path,token){ const url=`https://api.github.com/repos/${owner}/${repo}/contents${path}`; const r=await fetch(url,{headers:ghHeaders(token)}); if(!r.ok) throw new Error(`GET ${path} failed: ${r.status}`); return r.json();}
async function ghPut(owner,repo,path,contentB64,message,token,sha){ const url=`https://api.github.com/repos/${owner}/${repo}/contents${path}`; const body={message,content:contentB64}; if(sha) body.sha=sha; const r=await fetch(url,{method:'PUT',headers:{...ghHeaders(token),'Content-Type':'application/json'},body:JSON.stringify(body)}); if(!r.ok){const t=await r.text(); throw new Error(`PUT ${path} failed: ${r.status} ${t}`);} return r.json(); }

function postHtmlTemplate({ title, dateISO, contentHtml, url }){
  const dateLocal = new Date(dateISO).toLocaleDateString('sv-SE', { year:'numeric', month:'long', day:'numeric' });
  return `<!doctype html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — cornelia.love</title>
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <div id="header"></div>
  <main class="container post-page">
    <article class="post">
      <header class="post-head">
        <h1>${escapeHtml(title)}</h1>
        <p class="meta-line">Publicerat <span class="dot">|</span> ${escapeHtml(capFirst(dateLocal))}</p>
      </header>
      <article class="post-content">
        ${contentHtml || ''}
      </article>
      <section class="post-comments">
        <script src="https://utteranc.es/client.js"
                repo="${escapeHtml(el('owner').value)}/${escapeHtml(el('repo').value)}"
                issue-term="${escapeHtml(url)}"
                label="comment"
                theme="github-light"
                crossorigin="anonymous"
                async></script>
      </section>
    </article>
  </main>
  <div id="footer"></div>
  <script src="/app.js" defer></script>
</body>
</html>`;
}

// ——— UI init ———
window.addEventListener('DOMContentLoaded', async ()=>{
  const saved = localStorage.getItem('gh_token') || '';
  el('token').value = saved;
  el('date').value = todayISO();
  el('tokenStatus').textContent = saved ? 'Token laddat från localStorage' : 'Ingen token sparad';

  el('saveToken').onclick = ()=>{ const t=el('token').value.trim(); if(!t){el('tokenStatus').textContent='Ingen token angiven';return;} localStorage.setItem('gh_token', t); el('tokenStatus').textContent='Token sparad ✓'; };
  el('clearToken').onclick = ()=>{ localStorage.removeItem('gh_token'); el('token').value=''; el('tokenStatus').textContent='Token rensad'; };
  el('title').addEventListener('input', ()=>{ if(!el('slug').value) el('slug').value = slugify(el('title').value); });
  el('uploadImages').onclick = uploadImages;
  el('publish').onclick = publish;

  // Redigeringsläge?
  const url = param('url');
  if (url) await loadForEdit(url);
});

// ——— Ladda befintligt inlägg för redigering ———
async function loadForEdit(postUrl){
  const token = (el('token').value||'').trim();
  const owner = el('owner').value.trim();
  const repo  = el('repo').value.trim();
  if(!token || !owner || !repo){ el('pubStatus').textContent = 'Fyll i token/owner/repo först.'; return; }

  try{
    const meta = await ghGet(owner, repo, '/posts/posts.json', token);
    const decoded = atob(meta.content);
    const posts = JSON.parse(decoded);
    const p = posts.find(x => x.url === postUrl);
    if(!p){ el('pubStatus').textContent = 'Hittade inte inlägget i posts.json'; return; }

    el('title').value = p.title || '';
    el('date').value  = (p.date || todayISO());
    el('tags').value  = (p.tags||[]).join(', ');
    // slug från url
    const slug = (postUrl.match(/\/([^\/]+)\.html$/)||[])[1] || '';
    el('slug').value = slug;
    el('content').value = p.contentHtml || '';

    el('pubStatus').textContent = 'Redigeringsläge: ' + postUrl;
  }catch(e){
    console.error(e);
    el('pubStatus').textContent = 'Fel vid inläsning: ' + e.message;
  }
}

// ——— Bilduppladdning ———
async function uploadImages(){
  const token = (el('token').value||'').trim();
  const owner = el('owner').value.trim();
  const repo  = el('repo').value.trim();
  const files = el('images').files;
  const dateISO = el('date').value || todayISO();
  const { y, m } = isoToParts(dateISO);
  if(!token || !owner || !repo){ el('imgStatus').textContent='Fyll i token/owner/repo först.'; return; }
  if(!files || !files.length){ el('imgStatus').textContent='Välj minst en bild.'; return; }

  el('imgStatus').textContent = 'Laddar upp...';
  const out = [];
  for(const file of files){
    const ext = (file.name.match(/\.[^.]+$/) || [''])[0];
    const safeName = slugify(file.name.replace(/\.[^.]+$/, '')) + ext;
    const path = `/img/${y}/${m}/${Date.now()}-${safeName}`;
    const b64 = await b64encodeFile(file);
    await ghPut(owner, repo, path, b64, `Upload image ${safeName}`, token);
    out.push({ url: path, name: file.name });
  }
  el('imgStatus').textContent = 'Uppladdat ✓';
  el('imgList').innerHTML = out.map(o => `<div><code>&lt;img src="${o.url}" alt="" /&gt;</code></div>`).join('');
}

// ——— Publicera (nytt eller uppdatering) ———
async function publish(){
  const token = (el('token').value||'').trim();
  const owner = el('owner').value.trim();
  const repo  = el('repo').value.trim();
  const title = el('title').value.trim();
  const date  = (el('date').value || todayISO()).trim();
  const tags  = el('tags').value.split(',').map(s=>s.trim()).filter(Boolean);
  const slug  = (el('slug').value || slugify(title)).trim();
  const html  = el('content').value.trim();
  if(!token || !owner || !repo || !title || !slug){ el('pubStatus').textContent='Fyll i token/owner/repo/titel/slug.'; return; }

  el('pubStatus').textContent = 'Publicerar...';

  const editingUrl = param('url'); // finns = redigering
  try{
    // 1) Skriv/uppdatera inläggssidan
    const postPath = editingUrl || (() => {
      const { y, m } = isoToParts(date);
      return `/arkiv/${y}/${m}/${slug}.html`;
    })();

    // om vi uppdaterar: hämta sha för filen (så PUT blir en uppdatering, inte ny)
    let existingSha = undefined;
    try {
      if (editingUrl) {
        const fileMeta = await ghGet(owner, repo, postPath, token);
        existingSha = fileMeta.sha;
      }
    } catch { /* ignore if not found */ }

    const postHtml = postHtmlTemplate({ title, dateISO: date, contentHtml: html, url: postPath });
    await ghPut(owner, repo, postPath, b64encodeText(postHtml),
      (editingUrl ? `Update post ${slug}` : `Add post ${slug}`),
      token, existingSha);

    // 2) Uppdatera posts.json
    const postsPath = `/posts/posts.json`;
    const postsMeta = await ghGet(owner, repo, postsPath, token);
    const decoded = atob(postsMeta.content);
    let posts = [];
    try{ posts = JSON.parse(decoded); }catch{ posts = []; }

    const excerpt = extractExcerpt(html);
    const postObj = { title, date, url: postPath, tags, excerpt, contentHtml: html };

    const idx = posts.findIndex(p => p.url === postPath);
    if (idx >= 0) posts[idx] = postObj; else posts.push(postObj);
    posts.sort((a,b)=> b.date.localeCompare(a.date));

    const postsB64 = b64encodeText(JSON.stringify(posts, null, 2));
    await ghPut(owner, repo, postsPath, postsB64,
      (editingUrl ? `Update posts.json for ${slug}` : `Add to posts.json ${slug}`),
      token, postsMeta.sha);

    el('pubStatus').innerHTML = `Klart ✓ — <a href="${postPath}" target="_blank" rel="noopener">öppna inlägget</a> · <a href="/admin.html">tillbaka till admin</a>`;
  }catch(err){
    console.error(err);
    el('pubStatus').textContent = 'Fel vid publicering: ' + err.message;
  }
}

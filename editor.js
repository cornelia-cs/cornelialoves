// editor.js — helt klient-side publicering till GitHub Contents API
// Gör: laddar upp bilder till /img/YYYY/MM/, skapar /arkiv/YYYY/MM/slug.html,
// och uppdaterar /posts/posts.json så startsidan kan visa hela inlägget (contentHtml).

// ————— Hjälpare —————
const el = (id) => document.getElementById(id);
const todayISO = () => new Date().toISOString().slice(0,10);

function slugify(str){
  return String(str)
    .toLowerCase()
    .normalize('NFD')                  // dela diakritiska
    .replace(/[\u0300-\u036f]/g, '')   // ta bort diakritiska
    .replace(/[åä]/g,'a').replace(/ö/g,'o') // svensk normalisering
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0,80);
}

function b64encodeText(str){
  return btoa(unescape(encodeURIComponent(str)));
}

async function b64encodeFile(file){
  const arr = await file.arrayBuffer();
  const bytes = new Uint8Array(arr);
  let binary = '';
  for(let i=0;i<bytes.length;i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function isoToParts(iso){
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  return { y, m };
}

function extractExcerpt(html){
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const text = tmp.textContent || tmp.innerText || '';
  return text.trim().slice(0, 160);
}

function capFirst(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function escapeHtml(s){
  return String(s).replace(/[&<>\"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// ————— GitHub API —————
function ghHeaders(token){
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json'
  };
}

async function ghGet(owner, repo, path, token){
  const url = `https://api.github.com/repos/${owner}/${repo}/contents${path}`;
  const res = await fetch(url, { headers: ghHeaders(token) });
  if(!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function ghPut(owner, repo, path, contentBase64, message, token, sha){
  const url = `https://api.github.com/repos/${owner}/${repo}/contents${path}`;
  const body = { message, content: contentBase64 };
  if (sha) body.sha = sha; // krävs vid uppdatering
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if(!res.ok){
    const t = await res.text();
    throw new Error(`PUT ${path} failed: ${res.status} ${t}`);
  }
  return res.json();
}

// ————— Mall för inläggssida (kommentarer under inlägget) —————
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

// ————— UI init —————
window.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('gh_token') || '';
  el('token').value = token;
  el('date').value = todayISO();
  el('tokenStatus').textContent = token ? 'Token laddat från localStorage' : 'Ingen token sparad ännu';

  el('saveToken').onclick = ()=>{
    const t = el('token').value.trim();
    if(!t){ el('tokenStatus').textContent = 'Ingen token angiven'; return; }
    localStorage.setItem('gh_token', t);
    el('tokenStatus').textContent = 'Token sparad lokalt ✓';
  };
  el('clearToken').onclick = ()=>{
    localStorage.removeItem('gh_token');
    el('token').value = '';
    el('tokenStatus').textContent = 'Token rensad';
  };

  el('title').addEventListener('input', ()=>{
    if(!el('slug').value){ el('slug').value = slugify(el('title').value); }
  });

  el('uploadImages').onclick = uploadImages;
  el('publish').onclick = publish;
});

// ————— Bilduppladdning —————
async function uploadImages(){
  const token = (el('token').value || '').trim();
  const owner = el('owner').value.trim();
  const repo  = el('repo').value.trim();
  const files = el('images').files;
  const dateISO = el('date').value || todayISO();
  const { y, m } = isoToParts(dateISO);

  if(!token || !owner || !repo){ el('imgStatus').textContent = 'Fyll i token/owner/repo först.'; return; }
  if(!files || !files.length){ el('imgStatus').textContent = 'Välj minst en bild.'; return; }

  el('imgStatus').textContent = 'Laddar upp...';
  const out = [];

  for(const file of files){
    const ext = (file.name.match(/\.[^.]+$/) || [''])[0];
    const safeName = slugify(file.name.replace(/\.[^.]+$/, '')) + ext;
    const path = `/img/${y}/${m}/${Date.now()}-${safeName}`;
    const b64 = await b64encodeFile(file);
    await ghPut(owner, repo, path, b64, `Upload image ${safeName}`, token);
    const url = path; // din sajt kör på root, så absoluta paths funkar direkt
    out.push({ name: file.name, url });
  }

  el('imgStatus').textContent = 'Uppladdat ✓';
  const list = el('imgList');
  list.innerHTML = out.map(o => {
    const tag = `<img src="${o.url}" alt="" />`;
    return `<div><code>${escapeHtml(tag)}</code></div>`;
  }).join('');
}

// ————— Publicera inlägg —————
async function publish(){
  const token = (el('token').value || '').trim();
  const owner = el('owner').value.trim();
  const repo  = el('repo').value.trim();
  const title = el('title').value.trim();
  const date  = (el('date').value || todayISO()).trim();
  const tags  = el('tags').value.split(',').map(s=>s.trim()).filter(Boolean);
  const slug  = (el('slug').value || slugify(title)).trim();
  const html  = el('content').value.trim();

  if(!token || !owner || !repo || !title || !slug){
    el('pubStatus').textContent = 'Fyll i token/owner/repo/titel/slug.';
    return;
  }

  el('pubStatus').textContent = 'Publicerar...';

  try{
    // 1) Skriv inläggssidan
    const { y, m } = isoToParts(date);
    const postPath = `/arkiv/${y}/${m}/${slug}.html`;
    const postHtml = postHtmlTemplate({ title, dateISO: date, contentHtml: html, url: postPath });
    await ghPut(owner, repo, postPath, b64encodeText(postHtml), `Add post ${slug}`, token);

    // 2) Hämta och uppdatera posts.json (array)
    const postsPath = `/posts/posts.json`;
    const postsMeta = await ghGet(owner, repo, postsPath, token); // includes sha + content b64
    const decoded = atob(postsMeta.content);
    let posts = [];
    try{ posts = JSON.parse(decoded); }catch{ posts = []; }

    // skapa excerpt om tomt
    const excerpt = extractExcerpt(html);
    // in med posten (behåll contentHtml så startsidan kan visa hela inlägget)
    const postObj = { title, date, url: postPath, tags, excerpt, contentHtml: html };

    // om samma url finns, ersätt
    const existingIdx = posts.findIndex(p => p.url === postPath);
    if (existingIdx >= 0) posts[existingIdx] = postObj; else posts.push(postObj);

    // sortera datum fallande
    posts.sort((a,b)=> b.date.localeCompare(a.date));

    const postsB64 = b64encodeText(JSON.stringify(posts, null, 2));
    await ghPut(owner, repo, postsPath, postsB64, `Update posts.json with ${slug}`, token, postsMeta.sha);

    el('pubStatus').innerHTML = `Klart ✓ — <a href="${postPath}" target="_blank" rel="noopener">öppna inlägget</a>`;
  }catch(err){
    console.error(err);
    el('pubStatus').textContent = 'Fel vid publicering: ' + err.message;
  }
}

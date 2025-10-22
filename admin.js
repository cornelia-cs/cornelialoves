// admin.js — kontrollpanel: lista, sök, redigera, TA BORT (HTML + posts.json)

const el = (id) => document.getElementById(id);

function ghHeaders(token){
  return { 'Authorization': `Bearer ${token}`, 'Accept':'application/vnd.github+json' };
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
  if (sha) body.sha = sha;
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
async function ghDelete(owner, repo, path, message, token, sha){
  const url = `https://api.github.com/repos/${owner}/${repo}/contents${path}`;
  const body = { message, sha };
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if(!res.ok){
    const t = await res.text();
    throw new Error(`DELETE ${path} failed: ${res.status} ${t}`);
  }
  return res.json();
}

let POSTS = []; // senast laddade poster (array av objekt)

function escapeHtml(s){ return String(s||'').replace(/[&<>\"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

function render(){
  const q = el('q').value.trim().toLowerCase();
  const rows = el('rows');
  const list = POSTS.filter(p => {
    const hay = `${p.title} ${(p.tags||[]).join(' ')} ${p.url}`.toLowerCase();
    return hay.includes(q);
  });

  rows.innerHTML = list.map(p => {
    const tags = (p.tags||[]).join(', ');
    return `<tr>
      <td>${escapeHtml(p.title)}</td>
      <td>${escapeHtml(p.date)}</td>
      <td>${escapeHtml(tags)}</td>
      <td><code>${escapeHtml(p.url)}</code></td>
      <td style="white-space:nowrap">
        <button class="btn" data-edit="${encodeURIComponent(p.url)}">Redigera</button>
        <button class="btn" data-del="${encodeURIComponent(p.url)}" style="border-color:#c94a4a">Ta bort</button>
      </td>
    </tr>`;
  }).join('');

  el('empty').style.display = list.length ? 'none' : '';
  rows.querySelectorAll('button[data-edit]').forEach(btn => {
    btn.onclick = () => {
      const url = decodeURIComponent(btn.dataset.edit);
      location.href = `/editor.html?url=${encodeURIComponent(url)}`;
    };
  });
  rows.querySelectorAll('button[data-del]').forEach(btn => {
    btn.onclick = () => onDeleteClick(decodeURIComponent(btn.dataset.del));
  });
}

async function load(){
  const token = (el('token').value||'').trim();
  const owner = el('owner').value.trim();
  const repo  = el('repo').value.trim();
  if(!token || !owner || !repo){ el('loadStatus').textContent = 'Fyll i token/owner/repo.'; return; }

  el('loadStatus').textContent = 'Läser inlägg...';
  try{
    const meta = await ghGet(owner, repo, '/posts/posts.json', token);
    const decoded = atob(meta.content);
    POSTS = JSON.parse(decoded);
    POSTS.sort((a,b)=> b.date.localeCompare(a.date));
    el('loadStatus').textContent = `Hittade ${POSTS.length} inlägg`;
    render();
  }catch(e){
    console.error(e);
    el('loadStatus').textContent = 'Fel: ' + e.message;
    POSTS = [];
    render();
  }
}

async function onDeleteClick(postUrl){
  const confirmText = `Ta bort inlägget:\n${postUrl}\n\nDetta tar bort HTML-filen OCH raden i posts.json.\nDet går att ångra via GitHub commit history, men inte härifrån.\n\nVill du fortsätta?`;
  if (!confirm(confirmText)) return;

  const token = (el('token').value||'').trim();
  const owner = el('owner').value.trim();
  const repo  = el('repo').value.trim();
  if(!token || !owner || !repo){ alert('Fyll i token/owner/repo först.'); return; }

  el('loadStatus').textContent = 'Tar bort…';

  try{
    // 1) Hämta posts.json (för sha + innehåll)
    const postsPath = '/posts/posts.json';
    const postsMeta = await ghGet(owner, repo, postsPath, token);
    const postsDecoded = atob(postsMeta.content);
    let posts = [];
    try { posts = JSON.parse(postsDecoded); } catch { posts = []; }

    // 2) Ta bort HTML-filen (om den finns, kräver sha)
    try {
      const fileMeta = await ghGet(owner, repo, postUrl, token);
      await ghDelete(owner, repo, postUrl, `Delete post ${postUrl}`, token, fileMeta.sha);
    } catch (e) {
      // Om filen inte finns, logga men fortsätt
      console.warn('Kunde inte ta bort HTML-filen (kanske redan borta):', e);
    }

    // 3) Ta bort posten ur posts.json och uppdatera
    const next = posts.filter(p => p.url !== postUrl);
    const nextB64 = b64Encode(JSON.stringify(next, null, 2));
    await ghPut(owner, repo, postsPath, nextB64, `Remove from posts.json ${postUrl}`, token, postsMeta.sha);

    // 4) Uppdatera UI
    POSTS = next;
    render();
    el('loadStatus').textContent = 'Borttaget ✓';
  }catch(e){
    console.error(e);
    el('loadStatus').textContent = 'Fel vid borttagning: ' + e.message;
    alert('Fel vid borttagning: ' + e.message);
  }
}

function b64Encode(str){ return btoa(unescape(encodeURIComponent(str))); }

// ——— init ———
window.addEventListener('DOMContentLoaded', ()=>{
  const saved = localStorage.getItem('gh_token') || '';
  el('token').value = saved;
  el('tokenStatus').textContent = saved ? 'Token laddad från localStorage' : 'Ingen token sparad';

  el('saveToken').onclick = ()=>{
    const t = el('token').value.trim();
    if(!t){ el('tokenStatus').textContent = 'Ingen token angiven'; return; }
    localStorage.setItem('gh_token', t);
    el('tokenStatus').textContent = 'Token sparad ✓';
  };
  el('clearToken').onclick = ()=>{
    localStorage.removeItem('gh_token');
    el('token').value = '';
    el('tokenStatus').textContent = 'Token rensad';
  };

  el('q').addEventListener('input', render);
  el('reload').onclick = load;
  el('newPost').onclick = ()=> location.href = '/editor.html';

  load();
});

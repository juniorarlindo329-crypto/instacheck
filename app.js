const state = {
  followers: [],
  following: [],
  nonFollowers: [],
  mutuals: [],
  removed: new Set(JSON.parse(localStorage.getItem('instacheck_removed') || '[]')),
  currentMode: 'not-following-back',
  selected: new Set()
};

const $ = (id) => document.getElementById(id);
const els = {
  homeView: $('homeView'),
  listView: $('listView'),
  zipInput: $('zipInput'),
  status: $('status'),
  followingCount: $('followingCount'),
  followersCount: $('followersCount'),
  nonFollowersCount: $('nonFollowersCount'),
  mutualCount: $('mutualCount'),
  lastAnalysis: $('lastAnalysis'),
  clearBtn: $('clearBtn'),
  userList: $('userList'),
  emptyList: $('emptyList'),
  listTitle: $('listTitle'),
  listSubtitle: $('listSubtitle'),
  searchInput: $('searchInput'),
  selectAll: $('selectAll'),
  selectAllText: $('selectAllText'),
  openSelectedBtn: $('openSelectedBtn'),
  progressCard: $('progressCard'),
  progressText: $('progressText'),
  nextBtn: $('nextBtn')
};

const modeLabels = {
  'not-following-back': ['Não me seguem', 'Pessoas que você segue, mas que não seguem você de volta.'],
  followers: ['Seus seguidores', 'Todas as contas encontradas na lista de seguidores.'],
  following: ['Você segue', 'Todas as contas encontradas na lista de pessoas que você segue.'],
  mutuals: ['Seguidores mútuos', 'Vocês se seguem de volta.'],
  removed: ['Removidos', 'Perfis que você marcou como já removidos da sua lista.']
};

function normalizeUsername(value) {
  if (!value) return '';
  let s = String(value).trim();
  if (!s) return '';
  const match = s.match(/instagram\.com\/([^/?#]+)/i);
  if (match) s = match[1];
  s = s.replace(/^@/, '').replace(/\/+$/, '').trim();
  if (!/^[A-Za-z0-9._]{1,30}$/.test(s)) return '';
  return s.toLowerCase();
}

function uniqueUsers(list) {
  const map = new Map();
  for (const item of list) {
    const username = normalizeUsername(typeof item === 'string' ? item : item.username);
    if (!username) continue;
    if (!map.has(username)) map.set(username, { username });
  }
  return [...map.values()].sort((a,b) => a.username.localeCompare(b.username));
}

function extractFromJson(data) {
  const found = [];
  const walk = (node) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node.string_list_data)) {
      for (const item of node.string_list_data) {
        const candidate = normalizeUsername(item?.value || item?.href || '');
        if (candidate) found.push({ username: candidate });
      }
    }

    if (typeof node.value === 'string') {
      const candidate = normalizeUsername(node.value);
      if (candidate) found.push({ username: candidate });
    }

    Object.values(node).forEach(walk);
  };
  walk(data);
  return uniqueUsers(found);
}

function extractFromHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const users = [];

  doc.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href') || '';
    const text = (a.textContent || '').trim();
    let candidate = '';
    if (/instagram\.com/i.test(href)) candidate = normalizeUsername(href);
    if (!candidate) candidate = normalizeUsername(text);
    if (candidate) users.push({ username: candidate });
  });

  if (!users.length) {
    const matches = html.match(/instagram\.com\/([A-Za-z0-9._]{1,30})/gi) || [];
    matches.forEach(m => users.push({ username: normalizeUsername(m) }));
  }
  return uniqueUsers(users);
}

function classifyFilename(name) {
  const n = name.toLowerCase().replace(/\\/g,'/');
  if (/(^|\/)followers(_\d+)?\.(json|html?)$/.test(n) || n.includes('/followers_')) return 'followers';
  if (/(^|\/)following\.(json|html?)$/.test(n) || n.includes('/following.')) return 'following';
  return null;
}

async function parseSingleFile(file) {
  const name = file.name.toLowerCase();
  const text = await file.text();

  if (name.endsWith('.json')) {
    const data = JSON.parse(text);
    // If this is a raw Instagram file, infer side from root key when possible.
    if (data.relationships_following) return { following: extractFromJson(data.relationships_following), followers: [] };
    if (data.relationships_followers) return { followers: extractFromJson(data.relationships_followers), following: [] };
    return { unknown: extractFromJson(data) };
  }

  if (name.endsWith('.html') || name.endsWith('.htm')) {
    return { unknown: extractFromHtml(text) };
  }
  throw new Error('Formato não reconhecido.');
}

async function parseZip(file) {
  const zip = await JSZip.loadAsync(file);
  let followers = [];
  let following = [];
  let inspected = 0;

  const entries = Object.values(zip.files).filter(f => !f.dir);
  for (const entry of entries) {
    const type = classifyFilename(entry.name);
    if (!type) continue;
    inspected++;
    const text = await entry.async('text');
    let users = [];
    if (entry.name.toLowerCase().endsWith('.json')) {
      try { users = extractFromJson(JSON.parse(text)); } catch {}
    } else if (/\.html?$/i.test(entry.name)) {
      users = extractFromHtml(text);
    }
    if (type === 'followers') followers.push(...users);
    if (type === 'following') following.push(...users);
  }

  followers = uniqueUsers(followers);
  following = uniqueUsers(following);

  if (!inspected || (!followers.length && !following.length)) {
    throw new Error('Não encontrei os arquivos de seguidores/seguindo dentro do ZIP. Exporte essas informações pela Central de Contas.');
  }

  return { followers, following };
}

function compareLists() {
  const followersSet = new Set(state.followers.map(x => x.username));
  const followingSet = new Set(state.following.map(x => x.username));

  state.nonFollowers = state.following.filter(x => !followersSet.has(x.username));
  state.mutuals = state.following.filter(x => followersSet.has(x.username));
}

function saveAnalysis() {
  localStorage.setItem('instacheck_analysis', JSON.stringify({
    followers: state.followers,
    following: state.following,
    savedAt: Date.now()
  }));
}

function restoreAnalysis() {
  try {
    const saved = JSON.parse(localStorage.getItem('instacheck_analysis') || 'null');
    if (!saved) return;
    state.followers = uniqueUsers(saved.followers || []);
    state.following = uniqueUsers(saved.following || []);
    compareLists();
    refreshStats();
    if (saved.savedAt) els.lastAnalysis.textContent = new Date(saved.savedAt).toLocaleString('pt-BR');
    els.clearBtn.classList.remove('hidden');
  } catch {}
}

function refreshStats() {
  els.followingCount.textContent = state.following.length.toLocaleString('pt-BR');
  els.followersCount.textContent = state.followers.length.toLocaleString('pt-BR');
  els.nonFollowersCount.textContent = state.nonFollowers.length.toLocaleString('pt-BR');
  els.mutualCount.textContent = state.mutuals.length.toLocaleString('pt-BR');
}

function showStatus(message, type='') {
  els.status.textContent = message;
  els.status.className = 'status ' + type;
}

async function handleFile(file) {
  if (!file) return;
  showStatus('Analisando o arquivo no seu aparelho…');
  try {
    let result;
    if (file.name.toLowerCase().endsWith('.zip')) {
      result = await parseZip(file);
    } else {
      const single = await parseSingleFile(file);
      // For loose files, ask user to provide both by preserving any list already loaded.
      const inferred = classifyFilename(file.name);
      if (inferred === 'followers') result = { followers: single.followers || single.unknown || [], following: state.following };
      else if (inferred === 'following') result = { followers: state.followers, following: single.following || single.unknown || [] };
      else if (single.followers || single.following) result = { followers: single.followers || state.followers, following: single.following || state.following };
      else throw new Error('Se enviar arquivos separados, use os arquivos followers... e following... da exportação do Instagram.');
    }

    state.followers = uniqueUsers(result.followers || []);
    state.following = uniqueUsers(result.following || []);
    compareLists();
    saveAnalysis();
    refreshStats();

    const now = new Date();
    els.lastAnalysis.textContent = now.toLocaleString('pt-BR');
    els.clearBtn.classList.remove('hidden');

    if (!state.followers.length || !state.following.length) {
      showStatus(`Arquivo lido. Encontrei ${state.followers.length} seguidores e ${state.following.length} contas seguidas. Para comparar corretamente, carregue também a lista que está faltando.`, '');
    } else {
      showStatus(`Pronto! Encontrei ${state.nonFollowers.length} perfis que você segue e que não aparecem entre seus seguidores.`, 'ok');
    }
  } catch (err) {
    console.error(err);
    showStatus(err.message || 'Não consegui analisar esse arquivo.', 'error');
  } finally {
    els.zipInput.value = '';
  }
}

function getModeList(mode) {
  if (mode === 'followers') return state.followers;
  if (mode === 'following') return state.following;
  if (mode === 'mutuals') return state.mutuals;
  if (mode === 'removed') return [...state.removed].map(username => ({username}));
  return state.nonFollowers;
}

function renderList() {
  const q = normalizeUsername(els.searchInput.value) || els.searchInput.value.toLowerCase().trim();
  const all = getModeList(state.currentMode);
  const list = q ? all.filter(x => x.username.includes(q)) : all;

  els.userList.innerHTML = '';
  els.emptyList.classList.toggle('hidden', list.length > 0);

  const fragment = document.createDocumentFragment();
  list.forEach(user => {
    const row = document.createElement('div');
    row.className = 'user-row';
    const isSelected = state.selected.has(user.username);
    const isRemoved = state.removed.has(user.username);

    row.innerHTML = `
      <input class="user-check" type="checkbox" ${isSelected ? 'checked' : ''} aria-label="Selecionar ${escapeHtml(user.username)}">
      <div class="avatar">${escapeHtml(user.username.slice(0,2))}</div>
      <div class="user-info">
        <strong>@${escapeHtml(user.username)}</strong>
        <span>${isRemoved ? 'Marcado como removido' : 'Perfil do Instagram'}</span>
      </div>
      <button class="open-btn ${isRemoved ? 'removed' : ''}">${isRemoved ? 'Removido ✓' : 'Abrir ↗'}</button>
    `;

    const checkbox = row.querySelector('.user-check');
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.selected.add(user.username);
      else state.selected.delete(user.username);
      updateSelectionUI();
    });

    row.querySelector('.open-btn').addEventListener('click', () => openProfile(user.username));
    fragment.appendChild(row);
  });
  els.userList.appendChild(fragment);
  updateSelectionUI();
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function updateSelectionUI() {
  const modeList = getModeList(state.currentMode);
  const selectedCount = state.selected.size;
  els.selectAllText.textContent = selectedCount ? `Selecionados (${selectedCount})` : `Selecionar todos (${modeList.length})`;
  els.selectAll.checked = modeList.length > 0 && modeList.every(x => state.selected.has(x.username));
  els.progressCard.classList.toggle('hidden', selectedCount === 0 || state.currentMode !== 'not-following-back');
  const done = [...state.selected].filter(u => state.removed.has(u)).length;
  els.progressText.textContent = `${done} de ${selectedCount} concluídos`;
}

function openProfile(username) {
  const url = `https://www.instagram.com/${encodeURIComponent(username)}/`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function openSelected() {
  const first = [...state.selected].find(u => !state.removed.has(u)) || [...state.selected][0];
  if (!first) {
    showStatus('Selecione pelo menos um perfil primeiro.');
    showHome();
    return;
  }
  openProfile(first);
}

function openNext() {
  const next = [...state.selected].find(u => !state.removed.has(u));
  if (!next) return;
  openProfile(next);
  setTimeout(() => {
    const confirmed = confirm(`Depois de conferir @${next} no Instagram, deseja marcar este perfil como removido no InstaCheck?`);
    if (confirmed) {
      state.removed.add(next);
      localStorage.setItem('instacheck_removed', JSON.stringify([...state.removed]));
      renderList();
    }
  }, 250);
}

function showHome() {
  els.homeView.classList.add('active');
  els.listView.classList.remove('active');
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  document.querySelector('[data-nav="home"]').classList.add('active');
  window.scrollTo({top:0,behavior:'smooth'});
}

function showList(mode='not-following-back') {
  state.currentMode = mode;
  state.selected.clear();
  els.searchInput.value = '';
  const [title, subtitle] = modeLabels[mode] || modeLabels['not-following-back'];
  els.listTitle.textContent = title;
  els.listSubtitle.textContent = subtitle;
  els.homeView.classList.remove('active');
  els.listView.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  const nav = document.querySelector(`[data-nav="${mode}"]`);
  if (nav) nav.classList.add('active');
  renderList();
  window.scrollTo({top:0,behavior:'smooth'});
}

els.zipInput.addEventListener('change', e => handleFile(e.target.files?.[0]));
$('howBtn').addEventListener('click', () => $('howDialog').showModal());
$('privacyBtn').addEventListener('click', () => $('privacyDialog').showModal());
document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => $(btn.dataset.close).close()));

$('backBtn').addEventListener('click', showHome);
els.searchInput.addEventListener('input', renderList);
els.selectAll.addEventListener('change', () => {
  const list = getModeList(state.currentMode);
  if (els.selectAll.checked) list.forEach(x => state.selected.add(x.username));
  else state.selected.clear();
  renderList();
});
els.openSelectedBtn.addEventListener('click', openSelected);
els.nextBtn.addEventListener('click', openNext);

document.querySelectorAll('[data-go]').forEach(btn => btn.addEventListener('click', () => showList(btn.dataset.go)));
document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => {
  const nav = btn.dataset.nav;
  if (nav === 'home') showHome();
  else if (nav === 'more') $('moreDialog').showModal();
  else showList(nav);
}));

els.clearBtn.addEventListener('click', () => {
  if (!confirm('Limpar a análise salva neste aparelho?')) return;
  localStorage.removeItem('instacheck_analysis');
  state.followers = []; state.following = []; state.nonFollowers = []; state.mutuals = [];
  refreshStats();
  els.lastAnalysis.textContent = 'Nenhuma análise ainda';
  els.clearBtn.classList.add('hidden');
  showStatus('Análise limpa.', 'ok');
});

restoreAnalysis();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

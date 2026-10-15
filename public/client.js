const $ = (s) => document.querySelector(s);
const socket = io();
const token = localStorage.tl_token || (localStorage.tl_token = crypto.randomUUID());
const RANKS = ['3','4','5','6','7','8','9','10','J','Q','K','A','2'], SUITS = ['♠','♣','♦','♥'];
let st = null, sel = new Set(), at = 0, animId = null, handKey = '', orderKey = '', wasPlaying = false;
$('#nick').value = localStorage.tl_nick || '';

const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); };
const nick = () => { const n = $('#nick').value.trim(); if (n.length < 2) { toast('Nhập nickname từ 2 ký tự'); return null; } localStorage.tl_nick = n; return n; };
const send = (ev, d = {}) => socket.emit(ev, d, (r) => { if (r && r.error) toast(r.error); });
const cardEl = (id, extra = '', i = -1) => `<div class="card ${id % 4 > 1 ? 'red' : ''} ${extra}" data-id="${id}" ${i >= 0 ? `tabindex="0" style="--i:${i}"` : ''}>${RANKS[id >> 2]}<small>${SUITS[id & 3]}</small></div>`;

$('#create').onclick = () => { const n = nick(); if (n) send('create', { nick: n, token, bet: +$('#bet').value }); };
$('#join').onclick = () => { const n = nick(); if (n) send('join', { nick: n, token, code: $('#code').value }); };
$('#play').onclick = () => { send('play', { cards: [...sel] }); sel.clear(); };
$('#pass').onclick = () => send('pass');
$('#start').onclick = () => send('start');
$('#leave').onclick = () => { send('leave'); resetPile(); localStorage.removeItem('tl_code'); st = null; render(); loadLb(); };
$('#copy').onclick = () => { navigator.clipboard?.writeText(st.code); toast('Đã sao chép mã phòng'); };

socket.on('connect', () => { // tự vào lại phòng khi rớt mạng / reload
  const c = localStorage.tl_code, n = localStorage.tl_nick;
  if (c && n) socket.emit('join', { code: c, nick: n, token }, (r) => { if (r && r.error) { localStorage.removeItem('tl_code'); st = null; render(); } });
});
socket.on('state', (s) => { const pp = st && st.phase; st = s; if (pp === 'playing' && s.phase === 'ended') setTimeout(loadMe, 400); at = Date.now(); localStorage.tl_code = s.code; sel = new Set([...sel].filter((c) => s.hand.includes(c))); render(); });

const grpEls = new Map();
const nickOf = (pid) => (st.players.find((p) => p.pid === pid) || { nick: '?' }).nick;
function resetPile() { animId = null; handKey = ''; orderKey = ''; wasPlaying = false; grpEls.clear(); $('#pile').innerHTML = ''; }
const seatDir = (pid) => pid === st.you ? 'bottom' : (['top', 'left', 'right'].find((k) => $('#seat-' + k).dataset.pid === pid) || 'top');

// Chồng bài đã đánh: lượt mới nhất to, 4 lượt trước nhỏ dần và mờ dần
function syncPile() {
  const log = st.log || [], shown = log.slice(st.table ? -5 : -4);
  const curId = st.table && shown.length ? shown[shown.length - 1].id : -1;
  if (animId === null) animId = log.length ? log[log.length - 1].id : 0;
  const pile = $('#pile'), ids = new Set(shown.map((e) => e.id));
  for (const [id, el] of grpEls) if (!ids.has(id)) { grpEls.delete(id); el.classList.add('out'); setTimeout(() => el.remove(), 400); }
  shown.forEach((e, i) => {
    let el = grpEls.get(e.id);
    if (!el) {
      el = document.createElement('div'); el.className = 'grp';
      el.innerHTML = `<div class="cards">${e.cards.map((x) => cardEl(x)).join('')}</div><span class="who">${esc(nickOf(e.by))}</span>`;
      grpEls.set(e.id, el); pile.appendChild(el);
      if (e.id > animId) el.classList.add('in-' + seatDir(e.by));
    }
    el.dataset.age = e.id === curId ? 0 : (st.table ? shown.length - 1 - i : shown.length - i);
  });
  if (log.length) animId = Math.max(animId, log[log.length - 1].id);
}

// Thanh thứ tự: số ghế cố định, tô sáng người đang đánh và người kế tiếp
function renderOrder() {
  const key = st.players.map((p) => p.pid).join(), playing = st.phase === 'playing';
  if (key !== orderKey) { orderKey = key; $('#chips').innerHTML = st.players.map((p, i) => `<span class="chip" data-pid="${p.pid}"><em>${i + 1}</em><span>${esc(p.nick)}</span><b></b></span>`).join('<i class="arr">›</i>'); }
  const n = st.players.length, ti = st.players.findIndex((p) => p.pid === st.turn);
  let nx = -1;
  if (playing) for (let k = 1; k < n; k++) { const j = (ti + k) % n; if (!st.players[j].passed) { nx = j; break; } }
  st.players.forEach((p, i) => { const el = $('#chips .chip[data-pid="' + p.pid + '"]'); if (!el) return;
    el.classList.toggle('turn', p.pid === st.turn); el.classList.toggle('next', i === nx);
    el.classList.toggle('pass', p.passed); el.classList.toggle('off', !p.connected);
    el.querySelector('b').textContent = playing ? p.count : ''; });
  $('#plays').textContent = playing ? 'Lượt ' + (st.plays + 1) : '';
}

const T = { pair: 0, triple: 1, quad: 2, dstraight: 3, straight: 4, single: 5 };
const prio = (a, b) => (T[a.a.type] - T[b.a.type]) || (b.a.n - a.a.n) || (a.a.key - b.a.key);
const SORTS = { rank: 'Theo số', group: 'Theo bộ', suit: 'Theo chất' };
let sortMode = localStorage.tl_sort || 'rank', sugg = [], prevA = null, hintIdx = 0;
const kOf = (c) => [...c].sort((a, b) => a - b).join();
const describe = (a) => ({ single: 'Lẻ', pair: 'Đôi', triple: 'Sám', quad: 'Tứ quý', straight: 'Sảnh ' + a.n, dstraight: a.n / 2 + ' đôi thông' }[a.type]) + ' ' + RANKS[a.r0];
const valid = (c) => { if (!c.length) return false; const a = Rules.analyze(c); if (!a) return false; return prevA ? Rules.canBeat(prevA, a) : (!st.mustSpade3 || c.includes(0)); };
const withCard = (pick, id) => { if (pick.cards.includes(id)) return pick; const o = pick.cards.find((x) => x >> 2 === id >> 2); if (o === undefined) return pick;
  const c = pick.cards.map((x) => (x === o ? id : x)); return valid(c) ? { cards: c.sort((a, b) => a - b), a: Rules.analyze(c) } : pick; };
function sortedHand() {
  const h = [...st.hand];
  if (sortMode === 'suit') return h.sort((a, b) => (a & 3) - (b & 3) || a - b);
  if (sortMode === 'group') { const c = {}; h.forEach((x) => (c[x >> 2] = (c[x >> 2] || 0) + 1)); return h.sort((a, b) => c[b >> 2] - c[a >> 2] || a - b); }
  return h;
}
const hintList = () => st.table ? [...sugg].sort((a, b) => a.a.key - b.a.key)
  : [...sugg.filter((c) => c.a.type !== 'single').sort(prio), ...sugg.filter((c) => c.a.type === 'single').sort((a, b) => a.a.key - b.a.key)];
function renderSugg(active) {
  const el = $('#sugg'), sc = el.scrollLeft, cur = kOf(sel);
  if (!active) { el.innerHTML = ''; return; }
  if (!sugg.length) { el.innerHTML = st.table ? '<span class="none">Không có bài nào chặt được, hãy bỏ lượt</span>' : ''; return; }
  const list = (st.table ? hintList() : hintList().filter((c) => c.a.type !== 'single')).slice(0, 24);
  el.innerHTML = list.map((c) => `<button class="sg ${kOf(c.cards) === cur ? 'on' : ''}" data-k="${c.cards.join(',')}"><b>${describe(c.a)}</b>${c.cards.map((x) => `<span class="${x % 4 > 1 ? 'red' : ''}">${RANKS[x >> 2]}${SUITS[x & 3]}</span>`).join('')}</button>`).join('');
  el.scrollLeft = sc;
}
$('#sugg').addEventListener('click', (e) => { const b = e.target.closest('.sg'); if (!b) return; sel = new Set(b.dataset.k.split(',').map(Number)); render(); });
$('#sort').onclick = () => { const k = Object.keys(SORTS); sortMode = k[(k.indexOf(sortMode) + 1) % k.length]; localStorage.tl_sort = sortMode; render(); };
$('#hintbtn').onclick = () => { const l = hintList(); if (!l.length) return toast('Không có bài nào đánh được, hãy bỏ lượt'); const c = l[hintIdx++ % l.length]; sel = new Set(c.cards); render(); };
$('#hand').addEventListener('click', (e) => {
  const el = e.target.closest('.card'); if (!el) return; const id = +el.dataset.id;
  if (sel.has(id)) { sel.delete(id); return render(); }                      // bỏ chọn từng lá
  if (sel.size && valid([...sel, id]) ) { sel.add(id); return render(); }     // thêm lá để thành tổ hợp hợp lệ
  const cand = sugg.filter((c) => c.cards.some((x) => x >> 2 === id >> 2)).sort(prio);
  if (!cand.length) { sel.add(id); return render(); }                         // lá không nằm trong tổ hợp nào: chọn tay
  const cur = kOf(sel), i = cand.findIndex((c) => kOf(c.cards) === cur);      // bấm lại để đổi sang tổ hợp khác chứa lá này
  sel = new Set(withCard(cand[(i + 1) % cand.length], id).cards); render();
});
function render() {
  $('#lobby').classList.toggle('hidden', !!st); $('#game').classList.toggle('hidden', !st);
  if (!st) return;
  const me = st.players.find((p) => p.pid === st.you), myTurn = st.turn === st.you, playing = st.phase === 'playing';
  $('#copy').textContent = st.code; $('#betbox').textContent = st.bet ? 'Cược ' + st.bet + '/lá' : 'Chơi vui';
  const others = st.players.filter((p) => p.pid !== st.you);
  const idx = st.players.indexOf(me), ord = st.players.map((_, i) => st.players[(idx + i) % st.players.length]).filter((p) => p.pid !== st.you);
  const slots = { 1: ['top'], 2: ['left', 'right'], 3: ['left', 'top', 'right'] }[others.length] || [];
  ['top', 'left', 'right'].forEach((k) => { $('#seat-' + k).innerHTML = ''; $('#seat-' + k).dataset.pid = ''; });
  ord.forEach((p, i) => { const el = $('#seat-' + slots[i]); el.dataset.pid = p.pid;
    el.className = 'seat' + (st.turn === p.pid ? ' turn' : '') + (p.connected ? '' : ' off');
    el.innerHTML = `<div class="n"><span class="no">${st.players.indexOf(p) + 1}</span>${esc(p.nick)}${p.pid === st.hostPid ? ' ★' : ''}</div><div class="c">${st.phase === 'lobby' ? '' : p.count}</div><div class="s">${coinTxt(p)}${p.passed ? ' <span class="tag">bỏ lượt</span>' : ''}${p.connected ? '' : ' (mất kết nối)'}</div>`; });
  $('#me').className = myTurn ? 'turn' : '';
  $('#me').innerHTML = `<span class="no">${idx + 1}</span><b>${esc(me.nick)}</b> · ${coinTxt(me)}${me.passed ? ' <span class="tag">bỏ lượt</span>' : ''}${myTurn ? ' · <span class="tag">Đến lượt bạn</span>' : ''}`;
  $('#status').textContent = st.phase === 'lobby' ? `${st.players.length}/4 người trong phòng` : playing ? (myTurn ? 'Đến lượt bạn' : 'Đang chờ ' + nickOf(st.turn)) : 'Ván đã kết thúc';

  let h = '';
  if (st.phase === 'lobby') h = `Gửi mã <b>${st.code}</b> cho bạn bè.<br>${st.you === st.hostPid ? 'Bạn là chủ phòng, bắt đầu khi đủ người.' : 'Chờ chủ phòng bắt đầu.'}`;
  else if (st.phase === 'ended') h = `<div class="result">${esc(nickOf(st.result.winner))} thắng ván</div>${resultRows()}`;
  else if (!st.table) h = myTurn ? (st.mustSpade3 ? 'Bạn đi trước, phải có 3♠' : 'Bạn thắng vòng, dẫn vòng mới') : 'Vòng mới, ' + esc(nickOf(st.turn)) + ' dẫn';
  $('#hint').innerHTML = h;
  syncPile(); renderOrder(); renderFeed();

  const deal = playing && !wasPlaying; wasPlaying = playing;
  const can = playing && myTurn;
  prevA = st.table ? Rules.analyze(st.table.cards) : null;
  sugg = can ? Rules.suggest(st.hand, prevA, st.mustSpade3) : []; if (!can) hintIdx = 0;
  const filtering = can && (st.table || st.mustSpade3), okR = new Set(sugg.flatMap((c) => c.cards.map((x) => x >> 2)));
  const hand = sortedHand(), key = sortMode + hand.join(',');
  if (key !== handKey || deal) { handKey = key; $('#hand').innerHTML = hand.map((x, i) => cardEl(x, deal ? 'deal' : '', i)).join(''); }
  [...$('#hand').children].forEach((el) => { const id = +el.dataset.id;
    el.classList.toggle('sel', sel.has(id)); el.classList.toggle('ok', filtering && okR.has(id >> 2)); el.classList.toggle('dim', filtering && !okR.has(id >> 2)); });
  $('#sort').textContent = 'Sắp bài: ' + SORTS[sortMode];
  $('#hintbtn').classList.toggle('hidden', !playing); $('#hintbtn').disabled = !can;
  renderSugg(can);
  $('#start').classList.toggle('hidden', playing || st.you !== st.hostPid);
  $('#start').textContent = st.phase === 'ended' ? 'Ván mới' : 'Bắt đầu';
  $('#start').disabled = st.players.length < 2;
  $('#play').classList.toggle('hidden', !playing); $('#pass').classList.toggle('hidden', !playing);
  $('#play').disabled = !myTurn || !valid([...sel]); $('#pass').disabled = !myTurn || !st.table;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

setInterval(() => { // thanh đếm ngược theo thời gian còn lại do server gửi
  const bar = $('#timer i'); if (!st || !st.turn) { bar.style.width = '0'; return; }
  bar.style.width = Math.max(0, (st.ttl - (Date.now() - at)) / (st.players.find((p) => p.pid === st.turn).connected ? 30000 : 4000) * 100) + '%';
}, 200);


// ===== Coin, hồ sơ, điểm danh =====
let me = null, feedId = null, autoShown = false;
const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');
const sgn = (n) => (n > 0 ? '+' : '') + fmt(n);
const coinTxt = (p) => `🪙 ${fmt(p.coins)}${p.live ? ` <span class="dl ${p.live > 0 ? 'up' : 'dn'}">${sgn(p.live)}</span>` : ''}`;

function resultRows() {
  return st.result.players.map((x) => `<div class="rrow ${x.pid === st.result.winner ? 'win' : ''}"><span>${esc(x.nick)}${x.pid === st.result.winner ? ' 👑' : ` · còn ${x.left} lá${x.cong ? ' · cóng ×2' : ''}${x.heo ? ' · thối ' + x.heo + ' heo' : ''}`}</span>${st.bet ? `<b class="dl ${x.delta >= 0 ? 'up' : 'dn'}">${sgn(x.delta)}</b>` : ''}</div>`).join('');
}
function renderFeed() {
  const f = st.feed || []; if (feedId === null) feedId = f.length ? f[f.length - 1].id : 0;
  $('#feed').innerHTML = st.phase === 'playing' || st.phase === 'ended' ? f.map((x, i) => `<div class="fi ${x.id > feedId ? 'new' : ''}" style="opacity:${0.45 + 0.55 * (i + 1) / f.length}">⚡ ${esc(x.text)}</div>`).join('') : '';
  if (f.length) feedId = Math.max(feedId, f[f.length - 1].id);
}
function setMe(p) {
  me = p; $('#coins').textContent = fmt(p.coins);
  $('#btn-checkin').classList.toggle('dot', p.checkin.canClaim);
}
function loadMe() {
  const n = (localStorage.tl_nick || $('#nick').value || '').trim(); if (n.length < 2) return;
  socket.emit('me', { token, nick: n }, (r) => { if (r && r.profile) { setMe(r.profile); if (!autoShown && r.profile.checkin.canClaim && !st) { autoShown = true; openCheckin(); } } });
}
socket.on('connect', loadMe);
$('#nick').addEventListener('change', () => { const n = $('#nick').value.trim(); if (n.length >= 2) { localStorage.tl_nick = n; loadMe(); } });

const modal = (html) => { $('#mbody').innerHTML = html; $('#modal').classList.remove('hidden'); };
const closeModal = () => $('#modal').classList.add('hidden');
$('#mclose').onclick = closeModal;
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

function openCheckin(reward) {
  const n = nick(); if (!n) return; if (!me) return loadMe();
  const c = me.checkin;
  modal(`<h2>Điểm danh 7 ngày</h2><p class="muted">Mỗi ngày nhận 100–400 coin ngẫu nhiên, ngày 7 nhận 300–400. Bỏ lỡ một ngày thì quay lại ngày 1.</p>
    <div class="days">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<div class="day ${d <= c.done ? 'done' : ''} ${d === c.next ? 'today' : ''}"><span>Ngày ${d}</span><b>${d === 7 ? '300–400' : '100–400'}</b><i>${d <= c.done ? '✓' : '🪙'}</i></div>`).join('')}</div>
    ${reward ? `<div class="reward">+${reward} coin</div>` : ''}
    <button id="claim" class="btn primary" ${c.canClaim ? '' : 'disabled'}>${c.canClaim ? 'Nhận quà ngày ' + c.next : 'Hôm nay bạn đã nhận rồi'}</button>`);
  $('#claim').onclick = () => socket.emit('checkin', { token, nick: n }, (r) => { if (r.error) return toast(r.error); setMe(r.profile); openCheckin(r.reward); });
}
function openProfile() {
  if (!me) return toast('Nhập nickname trước');
  const wr = me.games ? Math.round(me.wins * 100 / me.games) : 0, P = Rules.PAY;
  const rows = [['Số ván', me.games], ['Thắng', me.wins], ['Thua', me.losses], ['Tỉ lệ thắng', wr + '%'], ['Chuỗi thắng', me.winStreak], ['Chuỗi thắng dài nhất', me.bestStreak],
    ['Cóng', me.cong], ['Chặt heo', me.heoChat], ['Bị chặt heo', me.biChat], ['Chặt đè', me.bombDe], ['Thắng lớn nhất', fmt(me.maxWin)], ['Tổng coin thắng', fmt(me.coinWon)], ['Tổng coin thua', fmt(me.coinLost)], ['Lần điểm danh', me.checkins]];
  modal(`<h2>${esc(me.nickname)} <span class="coin">🪙 ${fmt(me.coins)}</span></h2>
    <div class="stats">${rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
    <h3>Cách tính coin (1 cược = mức cược của phòng)</h3>
    <ul class="rules"><li>Thối bài: mỗi lá còn lại ${P.card} cược; cóng (chưa đánh lá nào) ×${P.cong}</li>
    <li>Thối heo: heo đen ${P.heoDen}, heo đỏ ${P.heoDo} cược mỗi con</li>
    <li>Chặt heo: người chặt nhận đúng giá trị heo bị chặt (đôi heo = cộng hai con), cộng ngay trong ván</li>
    <li>Chặt đè: 3 đôi thông &lt; tứ quý &lt; 4 đôi thông. Người chặt đè nhận ${P.bomb[1]} / ${P.bomb[2]} / ${P.bomb[3]} cược (theo bom bị đè) và lấy luôn tiền người bị đè vừa chặt được</li>
    <li>Cần ít nhất 20 × mức cược để vào bàn. Không bao giờ âm coin.</li></ul>`);
}
$('#btn-checkin').onclick = () => openCheckin();
$('#btn-profile').onclick = openProfile;

async function loadLb() {
  try { const d = await (await fetch('/api/leaderboard')).json();
    if (d.length) $('#lb').innerHTML = d.map((r) => `<li>${esc(r.nickname)} <b>🪙 ${fmt(r.coins)}</b> <span class="muted">(${r.wins}/${r.games} thắng)</span></li>`).join(''); } catch {}
}
loadLb();

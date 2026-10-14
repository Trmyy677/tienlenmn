const $ = (s) => document.querySelector(s);
const socket = io();
const token = localStorage.tl_token || (localStorage.tl_token = crypto.randomUUID());
const RANKS = ['3','4','5','6','7','8','9','10','J','Q','K','A','2'], SUITS = ['♠','♣','♦','♥'];
let st = null, sel = new Set(), at = 0;
$('#nick').value = localStorage.tl_nick || '';

const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); };
const nick = () => { const n = $('#nick').value.trim(); if (n.length < 2) { toast('Nhập nickname từ 2 ký tự'); return null; } localStorage.tl_nick = n; return n; };
const send = (ev, d = {}) => socket.emit(ev, d, (r) => { if (r && r.error) toast(r.error); });
const cardEl = (id, extra = '') => `<div class="card ${id % 4 > 1 ? 'red' : ''} ${extra}" data-id="${id}" ${extra ? 'tabindex="0"' : ''}>${RANKS[id >> 2]}<small>${SUITS[id & 3]}</small></div>`;

$('#create').onclick = () => { const n = nick(); if (n) send('create', { nick: n, token }); };
$('#join').onclick = () => { const n = nick(); if (n) send('join', { nick: n, token, code: $('#code').value }); };
$('#play').onclick = () => { send('play', { cards: [...sel] }); sel.clear(); };
$('#pass').onclick = () => send('pass');
$('#start').onclick = () => send('start');
$('#leave').onclick = () => { send('leave'); localStorage.removeItem('tl_code'); st = null; render(); loadLb(); };
$('#copy').onclick = () => { navigator.clipboard?.writeText(st.code); toast('Đã sao chép mã phòng'); };

socket.on('connect', () => { // tự vào lại phòng khi rớt mạng / reload
  const c = localStorage.tl_code, n = localStorage.tl_nick;
  if (c && n) socket.emit('join', { code: c, nick: n, token }, (r) => { if (r && r.error) { localStorage.removeItem('tl_code'); st = null; render(); } });
});
socket.on('state', (s) => { st = s; at = Date.now(); localStorage.tl_code = s.code; sel = new Set([...sel].filter((c) => s.hand.includes(c))); render(); });

function render() {
  $('#lobby').classList.toggle('hidden', !!st); $('#game').classList.toggle('hidden', !st);
  if (!st) return;
  const me = st.players.find((p) => p.pid === st.you), myTurn = st.turn === st.you;
  $('#copy').textContent = st.code;
  const others = st.players.filter((p) => p.pid !== st.you);
  const idx = st.players.indexOf(me), ord = st.players.map((_, i) => st.players[(idx + i) % st.players.length]).filter((p) => p.pid !== st.you);
  const slots = { 1: ['top'], 2: ['left', 'right'], 3: ['left', 'top', 'right'] }[others.length] || [];
  ['top', 'left', 'right'].forEach((k) => $('#seat-' + k).innerHTML = '');
  ord.forEach((p, i) => { const el = $('#seat-' + slots[i]); el.className = 'seat' + (st.turn === p.pid ? ' turn' : '') + (p.connected ? '' : ' off');
    el.innerHTML = `<div class="n">${esc(p.nick)}${p.pid === st.hostPid ? ' ★' : ''}</div><div class="c">${st.phase === 'lobby' ? '' : p.count}</div><div class="s">${p.score} điểm${p.passed ? ' <span class="tag">bỏ lượt</span>' : ''}${p.connected ? '' : ' (mất kết nối)'}</div>`; });
  $('#me').className = myTurn ? 'turn' : '';
  $('#me').innerHTML = `<b>${esc(me.nick)}</b> · ${me.score} điểm${me.passed ? ' <span class="tag">bỏ lượt</span>' : ''}`;
  $('#status').textContent = st.phase === 'lobby' ? `${st.players.length}/4 người trong phòng` : st.phase === 'playing' ? (myTurn ? 'Đến lượt bạn' : 'Đang chờ ' + esc(st.players.find((p) => p.pid === st.turn).nick)) : 'Ván đã kết thúc';
  let c = '';
  if (st.phase === 'lobby') c = `<div class="muted">Gửi mã <b>${st.code}</b> cho bạn bè.<br>${st.you === st.hostPid ? 'Bạn là chủ phòng, bắt đầu khi đủ người.' : 'Chờ chủ phòng bắt đầu.'}</div>`;
  else if (st.phase === 'ended') { const w = st.players.find((p) => p.pid === st.result.winner);
    c = `<div class="result">${esc(w.nick)} thắng ván</div><div class="muted">${st.result.players.map((x) => `${esc(x.nick)}: còn ${x.left} lá`).join(' · ')}</div>`; }
  else if (st.table) { const by = st.players.find((p) => p.pid === st.table.by); c = `<div class="cards">${st.table.cards.map((x) => cardEl(x)).join('')}</div><div class="muted">${esc(by.nick)} vừa đánh</div>`; }
  else c = `<div class="muted">${myTurn ? (st.mustSpade3 ? 'Bạn đi trước, phải có 3♠' : 'Bạn dẫn vòng mới') : 'Vòng mới'}</div>`;
  $('#center').innerHTML = c;
  $('#hand').innerHTML = st.hand.map((x) => cardEl(x, sel.has(x) ? 'sel' : '')).join('');
  const playing = st.phase === 'playing';
  $('#start').classList.toggle('hidden', playing || st.you !== st.hostPid);
  $('#start').textContent = st.phase === 'ended' ? 'Ván mới' : 'Bắt đầu';
  $('#start').disabled = st.players.length < 2;
  $('#play').classList.toggle('hidden', !playing); $('#pass').classList.toggle('hidden', !playing);
  $('#play').disabled = !myTurn || !sel.size; $('#pass').disabled = !myTurn || !st.table;
}
$('#hand').addEventListener('click', (e) => { const el = e.target.closest('.card'); if (!el) return; const id = +el.dataset.id; sel.has(id) ? sel.delete(id) : sel.add(id); render(); });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

setInterval(() => { // thanh đếm ngược theo thời gian còn lại do server gửi
  const bar = $('#timer i'); if (!st || !st.turn) { bar.style.width = '0'; return; }
  bar.style.width = Math.max(0, (st.ttl - (Date.now() - at)) / (st.players.find((p) => p.pid === st.turn).connected ? 30000 : 4000) * 100) + '%';
}, 200);

async function loadLb() { try { const d = await (await fetch('/api/leaderboard')).json();
  if (d.length) $('#lb').innerHTML = d.map((r) => `<li>${esc(r.nickname)} <b>${r.total_score}</b> <span class="muted">(${r.wins}/${r.games} thắng)</span></li>`).join(''); } catch {} }
loadLb();

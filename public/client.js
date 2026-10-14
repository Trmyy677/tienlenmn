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

$('#create').onclick = () => { const n = nick(); if (n) send('create', { nick: n, token }); };
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
socket.on('state', (s) => { st = s; at = Date.now(); localStorage.tl_code = s.code; sel = new Set([...sel].filter((c) => s.hand.includes(c))); render(); });

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

function render() {
  $('#lobby').classList.toggle('hidden', !!st); $('#game').classList.toggle('hidden', !st);
  if (!st) return;
  const me = st.players.find((p) => p.pid === st.you), myTurn = st.turn === st.you, playing = st.phase === 'playing';
  $('#copy').textContent = st.code;
  const others = st.players.filter((p) => p.pid !== st.you);
  const idx = st.players.indexOf(me), ord = st.players.map((_, i) => st.players[(idx + i) % st.players.length]).filter((p) => p.pid !== st.you);
  const slots = { 1: ['top'], 2: ['left', 'right'], 3: ['left', 'top', 'right'] }[others.length] || [];
  ['top', 'left', 'right'].forEach((k) => { $('#seat-' + k).innerHTML = ''; $('#seat-' + k).dataset.pid = ''; });
  ord.forEach((p, i) => { const el = $('#seat-' + slots[i]); el.dataset.pid = p.pid;
    el.className = 'seat' + (st.turn === p.pid ? ' turn' : '') + (p.connected ? '' : ' off');
    el.innerHTML = `<div class="n"><span class="no">${st.players.indexOf(p) + 1}</span>${esc(p.nick)}${p.pid === st.hostPid ? ' ★' : ''}</div><div class="c">${st.phase === 'lobby' ? '' : p.count}</div><div class="s">${p.score} điểm${p.passed ? ' <span class="tag">bỏ lượt</span>' : ''}${p.connected ? '' : ' (mất kết nối)'}</div>`; });
  $('#me').className = myTurn ? 'turn' : '';
  $('#me').innerHTML = `<span class="no">${idx + 1}</span><b>${esc(me.nick)}</b> · ${me.score} điểm${me.passed ? ' <span class="tag">bỏ lượt</span>' : ''}${myTurn ? ' · <span class="tag">Đến lượt bạn</span>' : ''}`;
  $('#status').textContent = st.phase === 'lobby' ? `${st.players.length}/4 người trong phòng` : playing ? (myTurn ? 'Đến lượt bạn' : 'Đang chờ ' + nickOf(st.turn)) : 'Ván đã kết thúc';

  let h = '';
  if (st.phase === 'lobby') h = `Gửi mã <b>${st.code}</b> cho bạn bè.<br>${st.you === st.hostPid ? 'Bạn là chủ phòng, bắt đầu khi đủ người.' : 'Chờ chủ phòng bắt đầu.'}`;
  else if (st.phase === 'ended') h = `<div class="result">${esc(nickOf(st.result.winner))} thắng ván</div>${st.result.players.map((x) => `${esc(x.nick)}: còn ${x.left} lá`).join(' · ')}`;
  else if (!st.table) h = myTurn ? (st.mustSpade3 ? 'Bạn đi trước, phải có 3♠' : 'Bạn thắng vòng, dẫn vòng mới') : 'Vòng mới, ' + esc(nickOf(st.turn)) + ' dẫn';
  $('#hint').innerHTML = h;
  syncPile(); renderOrder();

  const deal = playing && !wasPlaying; wasPlaying = playing;
  const key = st.hand.join(',');
  if (key !== handKey || deal) { handKey = key; $('#hand').innerHTML = st.hand.map((x, i) => cardEl(x, deal ? 'deal' : '', i)).join(''); }
  [...$('#hand').children].forEach((el) => el.classList.toggle('sel', sel.has(+el.dataset.id)));

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

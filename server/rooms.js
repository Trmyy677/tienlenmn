const crypto = require('crypto');
const { deck, analyze, canBeat } = require('./game');
const { PAY, heoValue, bombLevel } = require('../public/rules.js');
const P = require('./profiles');

const rooms = new Map();
const BETS = [0, 10, 50, 100, 500], MIN_X = 20; // cần ≥ 20 × cược để vào bàn
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TURN_MS = 30000, OFFLINE_MS = 4000;

function newCode() {
  let s;
  do { s = Array.from({ length: 5 }, () => CHARS[crypto.randomInt(CHARS.length)]).join(''); } while (rooms.has(s));
  return s;
}

function createRoom(notify, persist, bet = 0) {
  const room = {
    code: newCode(), bet, players: [], hostPid: null, phase: 'lobby', turn: 0, table: null, lastBy: 0,
    passed: new Set(), mustSpade3: false, firstGame: true, lastWinnerPid: null, result: null,
    timer: null, deadline: 0, log: [], seq: 0, plays: 0, pending: [], chain: [], feed: [], updated: Date.now(), notify, persist,
  };
  rooms.set(room.code, room);
  return room;
}

function addPlayer(room, token, nick, prof) {
  const p = { pid: crypto.randomBytes(4).toString('hex'), token, nick, prof, sid: null, connected: true, hand: [], played: 0, net: 0, st: { chat: 0, bi: 0, de: 0 } };
  room.players.push(p);
  if (!room.hostPid) room.hostPid = p.pid;
  return p;
}

function view(room, pid) {
  const me = room.players.find((p) => p.pid === pid), playing = room.phase === 'playing', live = {};
  room.pending.forEach((e) => { live[e.to] = (live[e.to] || 0) + e.units; live[e.from] = (live[e.from] || 0) - e.units; });
  return {
    code: room.code, bet: room.bet, phase: room.phase, hostPid: room.hostPid, you: pid,
    players: room.players.map((p) => ({ pid: p.pid, nick: p.nick, connected: p.connected, coins: p.prof.coins, live: (live[p.pid] || 0) * room.bet,
      count: p.hand.length, passed: room.passed.has(p.pid) })),
    hand: me ? me.hand : [],
    table: room.table ? { cards: room.table.cards, by: room.table.by } : null,
    turn: playing ? room.players[room.turn].pid : null,
    ttl: playing ? Math.max(0, room.deadline - Date.now()) : 0,
    mustSpade3: room.mustSpade3, result: room.result, log: room.log, plays: room.plays, feed: room.feed.slice(-4),
  };
}

function startTurn(room) {
  clearTimeout(room.timer);
  const p = room.players[room.turn], ms = p.connected ? TURN_MS : OFFLINE_MS;
  room.deadline = Date.now() + ms;
  room.timer = setTimeout(() => {
    if (room.table) pass(room, p.pid); else play(room, p.pid, [Math.min(...p.hand)]);
    room.notify(room);
  }, ms);
}

function startGame(room, pid) {
  if (pid !== room.hostPid) return 'Chỉ chủ phòng mới bắt đầu được';
  if (room.phase === 'playing') return 'Ván đang diễn ra';
  if (room.players.length < 2) return 'Cần ít nhất 2 người';
  const need = room.bet * MIN_X, poor = room.bet && room.players.find((p) => p.prof.coins < need);
  if (poor) return `${poor.nick} không đủ coin (cần ${need}) cho mức cược ${room.bet}`;
  const d = deck();
  room.players.forEach((p) => { p.hand = d.splice(0, 13).sort((a, b) => a - b); p.played = 0; p.net = 0; p.st = { chat: 0, bi: 0, de: 0 }; });
  const holder = room.players.findIndex((p) => p.hand.includes(0));
  if (room.firstGame || room.lastWinnerPid === null) {
    room.turn = holder >= 0 ? holder : room.players.reduce((b, p, i) => (Math.min(...p.hand) < Math.min(...room.players[b].hand) ? i : b), 0);
    room.mustSpade3 = holder >= 0;
  } else {
    room.turn = Math.max(0, room.players.findIndex((p) => p.pid === room.lastWinnerPid));
    room.mustSpade3 = false;
  }
  room.firstGame = false; room.phase = 'playing'; room.table = null; room.passed = new Set();
  room.lastBy = room.turn; room.result = null; room.log = []; room.plays = 0; room.pending = []; room.chain = []; room.feed = [];
  startTurn(room);
  return null;
}

const nick = (room, pid) => (room.players.find((p) => p.pid === pid) || {}).nick;
const say = (room, text) => { room.feed.push({ id: ++room.seq, text }); if (room.feed.length > 8) room.feed.shift(); };
const money = (room, u) => (room.bet ? ` (${u * room.bet} coin)` : '');

function play(room, pid, cards) {
  if (room.phase !== 'playing') return 'Ván chưa bắt đầu';
  const i = room.players.findIndex((p) => p.pid === pid);
  if (i !== room.turn) return 'Chưa đến lượt bạn';
  const p = room.players[i];
  if (!Array.isArray(cards) || !cards.every((c) => Number.isInteger(c) && p.hand.includes(c))) return 'Bài không hợp lệ';
  const a = analyze(cards);
  if (!a) return 'Tổ hợp bài không hợp lệ';
  const prev = room.table && room.table.a;
  if (prev) { if (!canBeat(prev, a)) return 'Bài của bạn không chặt được'; }
  else if (room.mustSpade3 && !cards.includes(0)) return 'Ván đầu phải đánh kèm 3♠';

  // Tính tiền chặt: chặt heo, chặt đè (lấy luôn tiền người bị đè vừa chặt được)
  if (prev) {
    const victim = room.table.by, heo = (prev.type === 'single' || prev.type === 'pair') && prev.r0 === 12, bp = bombLevel(prev), bc = bombLevel(a);
    const push = (units) => { const e = { from: victim, to: pid, units }; room.pending.push(e); room.chain.push(e); };
    if (heo && bc) {
      const u = heoValue(room.table.cards); push(u); p.st.chat++; room.players.find((x) => x.pid === victim).st.bi++;
      say(room, `${p.nick} chặt heo của ${nick(room, victim)}${money(room, u)}`);
    } else if (bp && bc) {
      const moved = room.chain.filter((e) => e.to === victim && e.from !== pid);
      moved.forEach((e) => { e.to = pid; });
      const u = PAY.bomb[bp]; push(u); p.st.de++;
      say(room, `${p.nick} chặt đè ${nick(room, victim)}${moved.length ? ' và lấy luôn tiền chặt' : ''}${money(room, u + moved.reduce((s, e) => s + e.units, 0))}`);
    }
  }

  p.hand = p.hand.filter((c) => !cards.includes(c)); p.played++;
  room.table = { cards: [...cards].sort((x, y) => x - y), a, by: pid };
  room.lastBy = i; room.mustSpade3 = false;
  room.log.push({ id: ++room.seq, by: pid, cards: room.table.cards }); room.plays++;
  if (room.log.length > 5) room.log.shift();
  if (!p.hand.length) return endGame(room, i);
  advance(room);
  return null;
}

function pass(room, pid) {
  if (room.phase !== 'playing') return 'Ván chưa bắt đầu';
  if (room.players.findIndex((p) => p.pid === pid) !== room.turn) return 'Chưa đến lượt bạn';
  if (!room.table) return 'Bạn đang dẫn vòng, phải đánh bài';
  room.passed.add(pid);
  advance(room);
  return null;
}

function advance(room) {
  const n = room.players.length, lead = room.players[room.lastBy].pid;
  if (room.players.every((p) => p.pid === lead || room.passed.has(p.pid))) {
    room.table = null; room.passed = new Set(); room.turn = room.lastBy; room.chain = [];
  } else {
    let t = room.turn;
    do { t = (t + 1) % n; } while (room.passed.has(room.players[t].pid));
    room.turn = t;
  }
  startTurn(room);
}

// Kết ván: thanh toán tiền chặt, rồi thối bài (mỗi lá 1 cược, cóng ×2, thối heo)
function endGame(room, wi) {
  clearTimeout(room.timer);
  const w = room.players[wi], byId = (id) => room.players.find((p) => p.pid === id);
  const tr = (from, to, units) => {
    if (!room.bet || !units || from === to) return;
    const pay = Math.min(units * room.bet, from.prof.coins); // không để âm: chỉ trả tối đa số coin đang có
    from.prof.coins -= pay; to.prof.coins += pay; from.net -= pay; to.net += pay;
  };
  room.pending.forEach((e) => tr(byId(e.from), byId(e.to), e.units));
  const info = room.players.map((p) => ({ p, left: p.hand.length, cong: p !== w && p.played === 0, heo: p.hand.filter((x) => x >> 2 === 12).length }));
  info.forEach(({ p, left, cong }) => { if (p !== w) tr(p, w, left * PAY.card * (cong ? PAY.cong : 1) + heoValue(p.hand)); });
  room.pending = []; room.chain = [];
  room.players.forEach((p) => { P.record(p.prof, { win: p === w, net: p.net, cong: p !== w && p.played === 0, ...p.st }); P.save(p.prof); });
  room.phase = 'ended'; room.lastWinnerPid = w.pid; room.passed = new Set();
  room.result = { winner: w.pid, players: info.map(({ p, left, cong, heo }) => ({ pid: p.pid, nick: p.nick, left, cong, heo, delta: p.net })) };
  room.persist(room, wi, room.result.players);
  return null;
}

function removePlayer(room, pid) {
  room.players = room.players.filter((p) => p.pid !== pid);
  if (room.hostPid === pid) room.hostPid = (room.players.find((p) => p.connected) || room.players[0] || {}).pid || null;
  if (!room.players.length) { clearTimeout(room.timer); rooms.delete(room.code); return true; }
  return false;
}

setInterval(() => {
  for (const r of rooms.values())
    if (Date.now() - r.updated > 15 * 60 * 1000 && r.players.every((p) => !p.connected)) { clearTimeout(r.timer); rooms.delete(r.code); }
}, 60000).unref();

module.exports = { rooms, BETS, MIN_X, createRoom, addPlayer, view, startGame, play, pass, removePlayer };

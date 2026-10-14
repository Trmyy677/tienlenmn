const crypto = require('crypto');
const { deck, analyze, canBeat } = require('./game');

const rooms = new Map();
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TURN_MS = 30000, OFFLINE_MS = 4000;

function newCode() {
  let s;
  do { s = Array.from({ length: 5 }, () => CHARS[crypto.randomInt(CHARS.length)]).join(''); } while (rooms.has(s));
  return s;
}

function createRoom(notify, persist) {
  const room = {
    code: newCode(), players: [], hostPid: null, phase: 'lobby', turn: 0, table: null, lastBy: 0,
    passed: new Set(), mustSpade3: false, firstGame: true, lastWinnerPid: null, result: null,
    timer: null, deadline: 0, updated: Date.now(), notify, persist,
  };
  rooms.set(room.code, room);
  return room;
}

function addPlayer(room, token, nick) {
  const p = { pid: crypto.randomBytes(4).toString('hex'), token, nick, sid: null, connected: true, hand: [], score: 0 };
  room.players.push(p);
  if (!room.hostPid) room.hostPid = p.pid;
  return p;
}

function view(room, pid) {
  const me = room.players.find((p) => p.pid === pid);
  const playing = room.phase === 'playing';
  return {
    code: room.code, phase: room.phase, hostPid: room.hostPid, you: pid,
    players: room.players.map((p) => ({
      pid: p.pid, nick: p.nick, connected: p.connected, score: p.score,
      count: p.hand.length, passed: room.passed.has(p.pid),
    })),
    hand: me ? me.hand : [],
    table: room.table ? { cards: room.table.cards, by: room.table.by } : null,
    turn: playing ? room.players[room.turn].pid : null,
    ttl: playing ? Math.max(0, room.deadline - Date.now()) : 0,
    mustSpade3: room.mustSpade3, result: room.result,
  };
}

function startTurn(room) {
  clearTimeout(room.timer);
  const p = room.players[room.turn];
  const ms = p.connected ? TURN_MS : OFFLINE_MS;
  room.deadline = Date.now() + ms;
  room.timer = setTimeout(() => {
    // Hết giờ: nếu đang dẫn vòng thì đánh lá nhỏ nhất, còn lại thì bỏ lượt
    if (room.table) pass(room, p.pid);
    else play(room, p.pid, [Math.min(...p.hand)]);
    room.notify(room);
  }, ms);
}

function startGame(room, pid) {
  if (pid !== room.hostPid) return 'Chỉ chủ phòng mới bắt đầu được';
  if (room.phase === 'playing') return 'Ván đang diễn ra';
  if (room.players.length < 2) return 'Cần ít nhất 2 người';
  const d = deck();
  room.players.forEach((p) => { p.hand = d.splice(0, 13).sort((a, b) => a - b); });
  const holder = room.players.findIndex((p) => p.hand.includes(0));
  if (room.firstGame || room.lastWinnerPid === null) {
    room.turn = holder >= 0 ? holder
      : room.players.reduce((b, p, i) => (Math.min(...p.hand) < Math.min(...room.players[b].hand) ? i : b), 0);
    room.mustSpade3 = holder >= 0;
  } else {
    room.turn = Math.max(0, room.players.findIndex((p) => p.pid === room.lastWinnerPid));
    room.mustSpade3 = false;
  }
  room.firstGame = false; room.phase = 'playing'; room.table = null; room.passed = new Set();
  room.lastBy = room.turn; room.result = null;
  startTurn(room);
  return null;
}

function play(room, pid, cards) {
  if (room.phase !== 'playing') return 'Ván chưa bắt đầu';
  const i = room.players.findIndex((p) => p.pid === pid);
  if (i !== room.turn) return 'Chưa đến lượt bạn';
  const p = room.players[i];
  if (!Array.isArray(cards) || !cards.every((c) => Number.isInteger(c) && p.hand.includes(c))) return 'Bài không hợp lệ';
  const a = analyze(cards);
  if (!a) return 'Tổ hợp bài không hợp lệ';
  if (room.table) { if (!canBeat(room.table.a, a)) return 'Bài của bạn không chặt được'; }
  else if (room.mustSpade3 && !cards.includes(0)) return 'Ván đầu phải đánh kèm 3♠';
  p.hand = p.hand.filter((c) => !cards.includes(c));
  room.table = { cards: [...cards].sort((x, y) => x - y), a, by: pid };
  room.lastBy = i; room.mustSpade3 = false;
  if (!p.hand.length) return endGame(room, i);
  advance(room);
  return null;
}

function pass(room, pid) {
  if (room.phase !== 'playing') return 'Ván chưa bắt đầu';
  const i = room.players.findIndex((p) => p.pid === pid);
  if (i !== room.turn) return 'Chưa đến lượt bạn';
  if (!room.table) return 'Bạn đang dẫn vòng, phải đánh bài';
  room.passed.add(pid);
  advance(room);
  return null;
}

function advance(room) {
  const n = room.players.length, lead = room.players[room.lastBy].pid;
  if (room.players.every((p) => p.pid === lead || room.passed.has(p.pid))) {
    room.table = null; room.passed = new Set(); room.turn = room.lastBy; // thắng vòng, dẫn tiếp
  } else {
    let t = room.turn;
    do { t = (t + 1) % n; } while (room.passed.has(room.players[t].pid));
    room.turn = t;
  }
  startTurn(room);
}

function endGame(room, wi) {
  clearTimeout(room.timer);
  const w = room.players[wi];
  const left = room.players.map((p) => ({ pid: p.pid, nick: p.nick, left: p.hand.length }));
  const pot = left.reduce((s, x) => s + x.left, 0);
  room.players.forEach((p, i) => { p.score += i === wi ? pot : -p.hand.length; });
  room.phase = 'ended'; room.lastWinnerPid = w.pid; room.passed = new Set();
  room.result = { winner: w.pid, players: left };
  room.persist(room, wi, left, pot);
  return null;
}

function removePlayer(room, pid) {
  room.players = room.players.filter((p) => p.pid !== pid);
  if (room.hostPid === pid) room.hostPid = (room.players.find((p) => p.connected) || room.players[0] || {}).pid || null;
  if (!room.players.length) { clearTimeout(room.timer); rooms.delete(room.code); return true; }
  return false;
}

setInterval(() => { // dọn phòng bỏ hoang > 15 phút
  for (const r of rooms.values())
    if (Date.now() - r.updated > 15 * 60 * 1000 && r.players.every((p) => !p.connected)) { clearTimeout(r.timer); rooms.delete(r.code); }
}, 60000).unref();

module.exports = { rooms, createRoom, addPlayer, view, startGame, play, pass, removePlayer };

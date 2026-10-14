const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const R = require('./rooms');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 8000 });

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = require('@supabase/supabase-js').createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/health', (_q, r) => r.send('ok'));
app.get('/api/leaderboard', async (_q, r) => {
  if (!supabase) return r.json([]);
  const { data, error } = await supabase.from('leaderboard').select('*').limit(10);
  r.json(error ? [] : data);
});

function broadcast(room) {
  room.updated = Date.now();
  for (const p of room.players) if (p.sid) io.to(p.sid).emit('state', R.view(room, p.pid));
}

async function persist(room, wi, left, pot) {
  if (!supabase) return;
  try {
    const { data, error } = await supabase.from('matches')
      .insert({ room_code: room.code, player_count: room.players.length, winner_nick: room.players[wi].nick })
      .select('id').single();
    if (error) throw error;
    await supabase.from('match_players').insert(left.map((x, i) => ({
      match_id: data.id, nickname: x.nick, cards_left: x.left, is_winner: i === wi, score: i === wi ? pot : -x.left,
    })));
  } catch (e) { console.error('Supabase persist lỗi:', e.message || e); }
}

const clean = (s) => String(s || '').replace(/[<>\n\r]/g, '').trim().slice(0, 16);
const mk = () => R.createRoom(broadcast, persist);

io.on('connection', (s) => {
  const bind = (room, p) => { p.sid = s.id; p.connected = true; s.data = { code: room.code, pid: p.pid }; };
  const ctx = () => { const room = R.rooms.get(s.data.code); return room ? { room, pid: s.data.pid } : null; };
  const done = (cb) => (typeof cb === 'function' ? cb : () => {});

  s.on('create', ({ nick, token }, cb) => {
    cb = done(cb); nick = clean(nick);
    if (nick.length < 2 || !token) return cb({ error: 'Nickname cần 2–16 ký tự' });
    const room = mk(); bind(room, R.addPlayer(room, token, nick));
    cb({ ok: true }); broadcast(room);
  });

  s.on('join', ({ code, nick, token }, cb) => {
    cb = done(cb); nick = clean(nick);
    if (nick.length < 2 || !token) return cb({ error: 'Nickname cần 2–16 ký tự' });
    const room = R.rooms.get(String(code || '').trim().toUpperCase());
    if (!room) return cb({ error: 'Không tìm thấy phòng' });
    let p = room.players.find((x) => x.token === token); // vào lại khi mất kết nối
    if (!p) {
      if (room.phase === 'playing') return cb({ error: 'Phòng đang chơi, chờ hết ván' });
      if (room.players.length >= 4) return cb({ error: 'Phòng đã đủ 4 người' });
      if (room.players.some((x) => x.nick.toLowerCase() === nick.toLowerCase())) return cb({ error: 'Nickname đã có người dùng trong phòng' });
      p = R.addPlayer(room, token, nick);
    }
    bind(room, p); cb({ ok: true }); broadcast(room);
  });

  const act = (fn) => (data, cb) => {
    const c = ctx(); if (!c) return done(cb)({ error: 'Bạn chưa ở trong phòng' });
    const err = fn(c.room, c.pid, data);
    if (err) return done(cb)({ error: err });
    broadcast(c.room); done(cb)({ ok: true });
  };
  s.on('start', act((room, pid) => R.startGame(room, pid)));
  s.on('play', act((room, pid, d) => R.play(room, pid, d && d.cards)));
  s.on('pass', act((room, pid) => R.pass(room, pid)));

  s.on('leave', () => {
    const c = ctx(); if (!c) return;
    const p = c.room.players.find((x) => x.pid === c.pid);
    s.data = {};
    if (c.room.phase === 'playing') { p.connected = false; p.sid = null; } // giữ chỗ, server tự bỏ lượt
    else if (R.removePlayer(c.room, c.pid)) return;
    broadcast(c.room);
  });

  s.on('disconnect', () => {
    const c = ctx(); if (!c) return;
    const p = c.room.players.find((x) => x.pid === c.pid);
    if (!p || p.sid !== s.id) return;
    p.connected = false; p.sid = null;
    if (c.room.phase !== 'playing') { if (R.removePlayer(c.room, p.pid)) return; }
    broadcast(c.room);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Tiến Lên Online chạy ở cổng ${PORT}`));

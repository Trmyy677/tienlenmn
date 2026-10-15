// Hồ sơ người chơi theo thiết bị (token ẩn danh, không cần tài khoản). Lưu Supabase nếu có, không thì lưu RAM.
const crypto = require('crypto');
const cache = new Map();
let db = null;
const init = (client) => { db = client; };
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const vnDate = (off = 0) => new Date(Date.now() + off * 864e5).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

const fresh = (h, nick) => ({ token_hash: h, nickname: nick, coins: 1000, streak: 0, last_checkin: null, checkins: 0, games: 0, wins: 0, losses: 0,
  cong: 0, heo_chat: 0, heo_bi_chat: 0, bomb_de: 0, win_streak: 0, best_streak: 0, max_win: 0, coin_won: 0, coin_lost: 0 });

function save(p) {
  if (!db) return;
  db.from('profiles').upsert({ ...p, updated_at: new Date().toISOString() }).then(({ error }) => { if (error) console.error('Lưu profile lỗi:', error.message); });
}

async function get(token, nick) {
  const h = hash(token);
  let p = cache.get(h);
  if (!p) {
    if (db) { const { data } = await db.from('profiles').select('*').eq('token_hash', h).maybeSingle(); p = data; }
    if (!p) { p = fresh(h, nick); save(p); }
    cache.set(h, p);
  }
  if (nick && p.nickname !== nick) { p.nickname = nick; save(p); }
  return p;
}

function record(p, o) {
  p.games++;
  if (o.win) { p.wins++; p.win_streak++; p.best_streak = Math.max(p.best_streak, p.win_streak); p.max_win = Math.max(p.max_win, o.net); }
  else { p.losses++; p.win_streak = 0; }
  if (o.cong) p.cong++;
  p.heo_chat += o.chat; p.heo_bi_chat += o.bi; p.bomb_de += o.de;
  if (o.net > 0) p.coin_won += o.net; else p.coin_lost -= o.net;
}

// Điểm danh 7 ngày: 100–400 coin ngẫu nhiên, ngày thứ 7 được 300–400. Bỏ lỡ 1 ngày thì về ngày 1.
function checkin(p) {
  const today = vnDate();
  if (p.last_checkin === today) return { error: 'Hôm nay bạn đã điểm danh rồi' };
  const day = p.last_checkin === vnDate(-1) ? (p.streak % 7) + 1 : 1;
  const reward = day === 7 ? crypto.randomInt(300, 401) : crypto.randomInt(100, 401);
  p.coins += reward; p.streak = day; p.last_checkin = today; p.checkins++;
  return { reward, day };
}

function pub(p) {
  const claimed = p.last_checkin === vnDate(), cont = p.last_checkin === vnDate(-1);
  return { nickname: p.nickname, coins: p.coins, games: p.games, wins: p.wins, losses: p.losses, cong: p.cong, heoChat: p.heo_chat, biChat: p.heo_bi_chat,
    bombDe: p.bomb_de, winStreak: p.win_streak, bestStreak: p.best_streak, maxWin: p.max_win, coinWon: p.coin_won, coinLost: p.coin_lost, checkins: p.checkins,
    checkin: { done: claimed || cont ? p.streak : 0, canClaim: !claimed, next: claimed ? null : cont ? (p.streak % 7) + 1 : 1 } };
}

async function leaderboard() {
  if (db) { const { data } = await db.from('profiles').select('nickname,coins,wins,games').order('coins', { ascending: false }).limit(10); return data || []; }
  return [...cache.values()].sort((a, b) => b.coins - a.coins).slice(0, 10).map(({ nickname, coins, wins, games }) => ({ nickname, coins, wins, games }));
}

module.exports = { init, get, save, record, checkin, pub, leaderboard };

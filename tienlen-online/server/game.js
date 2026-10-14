// Luật Tiến Lên Miền Nam. Bài là số 0..51: rank = id>>2 (0='3' ... 12='2'), suit = id&3 (♠<♣<♦<♥)
const crypto = require('crypto');
const rank = (id) => id >> 2;

function deck() {
  const a = Array.from({ length: 52 }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Trả về { type, n, key, r0 } hoặc null nếu không hợp lệ
function analyze(ids) {
  const c = [...ids].sort((a, b) => a - b);
  const n = c.length;
  if (!n || new Set(c).size !== n) return null;
  const r = c.map(rank), key = c[n - 1];
  if (n <= 4 && r.every((x) => x === r[0]))
    return { type: ['', 'single', 'pair', 'triple', 'quad'][n], n, key, r0: r[0] };
  if (r.includes(12)) return null; // heo (2) không nằm trong sảnh / đôi thông
  if (n >= 3 && r.every((x, i) => i === 0 || x === r[i - 1] + 1))
    return { type: 'straight', n, key, r0: r[n - 1] };
  if (n >= 6 && n % 2 === 0) {
    for (let i = 0; i < n; i += 2) {
      if (r[i] !== r[i + 1]) return null;
      if (i > 0 && r[i] !== r[i - 2] + 1) return null;
    }
    return { type: 'dstraight', n, key, r0: r[n - 1] };
  }
  return null;
}

// cur có chặt được prev không (gồm chặt heo / chặt tứ quý)
function canBeat(p, c) {
  if (p.type === c.type && p.n === c.n) return c.key > p.key;
  const quad = c.type === 'quad', ds = c.type === 'dstraight';
  if (p.type === 'single' && p.r0 === 12) return quad || (ds && c.n >= 6); // 3 đôi thông / tứ quý chặt heo
  if (p.type === 'pair' && p.r0 === 12) return quad || (ds && c.n >= 8);   // tứ quý / 4 đôi thông chặt đôi heo
  if (p.type === 'quad') return ds && c.n >= 8;                            // 4 đôi thông chặt tứ quý
  return false;
}

module.exports = { deck, analyze, canBeat };

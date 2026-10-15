// Luật Tiến Lên dùng chung: server kiểm tra thật, client chỉ dùng để gợi ý.
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m; else root.Rules = m;
})(typeof self !== 'undefined' ? self : this, function () {
  const rank = (id) => id >> 2;

  function analyze(ids) {
    const c = [...ids].sort((a, b) => a - b), n = c.length;
    if (!n || new Set(c).size !== n) return null;
    const r = c.map(rank), key = c[n - 1];
    if (n <= 4 && r.every((x) => x === r[0])) return { type: ['', 'single', 'pair', 'triple', 'quad'][n], n, key, r0: r[0] };
    if (r.includes(12)) return null;
    if (n >= 3 && r.every((x, i) => i === 0 || x === r[i - 1] + 1)) return { type: 'straight', n, key, r0: r[n - 1] };
    if (n >= 6 && n % 2 === 0) {
      for (let i = 0; i < n; i += 2) {
        if (r[i] !== r[i + 1]) return null;
        if (i > 0 && r[i] !== r[i - 2] + 1) return null;
      }
      return { type: 'dstraight', n, key, r0: r[n - 1] };
    }
    return null;
  }

  // Bảng tính (đơn vị = 1 cược). Heo đen = 2♠ 2♣, heo đỏ = 2♦ 2♥
  const PAY = { card: 1, cong: 2, heoDen: 2, heoDo: 4, bomb: { 1: 6, 2: 8, 3: 12 } };
  const heoValue = (ids) => ids.filter((x) => rank(x) === 12).reduce((s, x) => s + ((x & 3) < 2 ? PAY.heoDen : PAY.heoDo), 0);
  // Bậc "bom": 3 đôi thông (1) < tứ quý (2) < 4+ đôi thông (3)
  const bombLevel = (a) => (a.type === 'quad' ? 2 : a.type === 'dstraight' ? (a.n === 6 ? 1 : 3) : 0);

  function canBeat(p, c) {
    if (p.type === c.type && p.n === c.n) return c.key > p.key;
    const bp = bombLevel(p), bc = bombLevel(c);
    if (p.type === 'single' && p.r0 === 12) return bc > 0;       // mọi bom chặt heo lẻ
    if (p.type === 'pair' && p.r0 === 12) return bc >= 2;        // tứ quý / 4 đôi thông chặt đôi heo
    if (bp && bc) return bc > bp || (bc === 3 && bp === 3 && c.n > p.n); // chặt đè
    return false;
  }

  const subs = (arr, k) => { const res = []; (function r(i, cur) { if (cur.length === k) { res.push(cur.slice()); return; } for (let j = i; j < arr.length; j++) { cur.push(arr[j]); r(j + 1, cur); cur.pop(); } })(0, []); return res; };

  // Mọi tổ hợp đánh được từ hand. prev = analyze() của bài trên bàn (null nếu đang dẫn vòng)
  function suggest(hand, prev, must3) {
    const by = Array.from({ length: 13 }, () => []);
    [...hand].sort((a, b) => a - b).forEach((id) => by[rank(id)].push(id));
    const out = [], seen = new Set();
    const add = (cards) => {
      const a = analyze(cards); if (!a) return;
      if (prev ? !canBeat(prev, a) : (must3 && !cards.includes(0))) return;
      const cs = [...cards].sort((x, y) => x - y), k = cs.join();
      if (!seen.has(k)) { seen.add(k); out.push({ cards: cs, a }); }
    };
    for (let r = 0; r < 13; r++) for (let k = 1; k <= Math.min(4, by[r].length); k++) subs(by[r], k).forEach(add);
    for (const k of [1, 2]) // sảnh (k=1) và đôi thông (k=2), không có heo
      for (let s = 0; s <= 9; s++) for (let e = s + 2; e <= 11; e++) {
        if (by.slice(s, e + 1).some((g) => g.length < k)) break;
        const base = []; for (let r = s; r < e; r++) base.push(...by[r].slice(0, k));
        subs(by[e], k).forEach((top) => add([...base, ...top]));
      }
    return out;
  }
  return { analyze, canBeat, suggest, PAY, heoValue, bombLevel };
});

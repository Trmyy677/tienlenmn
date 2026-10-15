// Luật Tiến Lên Miền Nam. Bài là số 0..51: rank = id>>2 (0='3' ... 12='2'), suit = id&3 (♠<♣<♦<♥)
// Phần nhận diện/so sánh bài nằm ở public/rules.js (dùng chung với client để gợi ý).
const crypto = require('crypto');
const { analyze, canBeat } = require('../public/rules.js');

function deck() {
  const a = Array.from({ length: 52 }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = { deck, analyze, canBeat };

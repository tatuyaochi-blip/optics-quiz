// ステップインデックス光ファイバ。NA = √(n1² − n2²)、最大受光角 θmax = asin(NA/n0)、
// 正規化周波数 V = 2πa·NA/λ、シングルモード条件 V < 2.405、カットオフ波長 λc = 2πa·NA/2.405、
// 比屈折率差 Δ = (n1² − n2²)/(2n1²)、伝搬するモード数の目安 V²/2(V が大きいとき)
import { num, reader } from './eng.js';
const form = document.getElementById('fb-form');
const out = k => document.querySelector(`[data-out="${k}"]`);
const val = reader(form);
const T = JSON.parse(form.dataset.text);

function update() {
  const n1 = val('n1', 1), n2 = val('n2', 1), a = val('a', 0) * 1e-6, lam = val('lambda', 1e-6) * 1e-9;
  const d2 = n1 * n1 - n2 * n2;
  if (d2 <= 0) {
    for (const k of ['na', 'theta', 'delta', 'v', 'mode', 'lc', 'modes']) out(k).textContent = '–';
    out('mode').textContent = T.bad;
    return;
  }
  const na = Math.sqrt(d2), v = 2 * Math.PI * a * na / lam;
  out('na').textContent = num(na, 4);
  out('theta').textContent = na <= 1 ? `${num(Math.asin(na) * 180 / Math.PI, 4)}°` : '–';
  out('delta').textContent = `${num(d2 / (2 * n1 * n1) * 100, 4)} %`;
  out('v').textContent = num(v, 4);
  out('mode').textContent = v < 2.405 ? T.single : T.multi;
  out('lc').textContent = `${num(2 * Math.PI * a * na / 2.405 * 1e9, 4)} nm`;
  out('modes').textContent = v < 2.405 ? '1 (LP01)' : `≈ ${num(v * v / 2, 3)}`;
}
form.addEventListener('input', update);
form.addEventListener('submit', e => e.preventDefault());
update();

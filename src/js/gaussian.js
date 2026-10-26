// ガウシアンビームの伝搬。レイリー長 zR = π·w0²·n/(M²·λ)、広がり角(半角) θ = M²·λ/(π·n·w0)、
// 位置 z でのビーム半径 w(z) = w0·√(1 + (z/zR)²)、波面の曲率半径 R(z) = z·(1 + (zR/z)²)
import { num, reader } from './eng.js';
const form = document.getElementById('gb-form');
const out = k => document.querySelector(`[data-out="${k}"]`);
const val = reader(form);
const len = m => (m >= 1 ? `${num(m, 4)} m` : m >= 1e-3 ? `${num(m * 1e3, 4)} mm` : `${num(m * 1e6, 4)} µm`);

function update() {
  const lam = val('lambda', 1e-6) * 1e-9, w0 = val('w0', 1e-9) * 1e-6, m2 = val('m2', 1), n = val('n', 1), z = val('z') * 1e-3;
  const zr = Math.PI * w0 * w0 * n / (m2 * lam);
  const th = m2 * lam / (Math.PI * n * w0);
  const wz = w0 * Math.sqrt(1 + (z / zr) ** 2);
  out('zr').textContent = len(zr);
  out('theta').textContent = `${num(th * 1e3, 4)} mrad (${num(th * 180 / Math.PI, 4)}°)`;
  out('dof').textContent = len(2 * zr);
  out('wz').textContent = len(wz);
  out('dz').textContent = len(2 * wz);
  out('rz').textContent = z === 0 ? '∞' : len(Math.abs(z * (1 + (zr / z) ** 2)));
}
form.addEventListener('input', update);
form.addEventListener('submit', e => e.preventDefault());
update();

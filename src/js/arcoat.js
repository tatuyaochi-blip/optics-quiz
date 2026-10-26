// 単層の反射防止膜(垂直入射、吸収・分散なし、1面)。λ/4膜の厚さ d = λ₀/(4n₁)、理想の膜の屈折率 √(n₀nₛ)、
// 膜なしの反射率 ((n₀ − nₛ)/(n₀ + nₛ))²、波長 λ での反射率 |(r₀₁ + r₁ₛe^{−2iδ})/(1 + r₀₁r₁ₛe^{−2iδ})|²(δ = 2πn₁d/λ)
import { num, reader } from './eng.js';
const form = document.getElementById('ar-form');
const out = k => document.querySelector(`[data-out="${k}"]`);
const val = reader(form);
const pct = r => (r < 1e-7 ? '0 %' : `${num(r * 100, 3)} %`);

// 1層の膜の反射率(複素数を実部・虚部で計算)
function refl(n0, n1, ns, d, lam) {
  const r01 = (n0 - n1) / (n0 + n1), r12 = (n1 - ns) / (n1 + ns);
  const ph = -4 * Math.PI * n1 * d / lam, c = Math.cos(ph), s = Math.sin(ph);
  const nr = r01 + r12 * c, ni = r12 * s, dr = 1 + r01 * r12 * c, di = r01 * r12 * s;
  return (nr * nr + ni * ni) / (dr * dr + di * di);
}

function update() {
  const l0 = val('lambda0', 1e-6), n0 = val('n0', 1), ns = val('ns', 1), n1 = val('n1', 1), lam = val('lambda', 1e-6);
  const ni = Math.sqrt(n0 * ns), d = l0 / (4 * n1);
  out('nideal').textContent = num(ni, 4);
  out('thick').textContent = `${num(d, 4)} nm`;
  out('r0').textContent = pct(((n0 - ns) / (n0 + ns)) ** 2);
  out('rdes').textContent = pct(refl(n0, n1, ns, d, l0));
  out('rlam').textContent = pct(refl(n0, n1, ns, d, lam));
  out('nideal-r').textContent = pct(refl(n0, ni, ns, l0 / (4 * ni), l0));
}
form.addEventListener('input', update);
form.addEventListener('submit', e => e.preventDefault());
update();

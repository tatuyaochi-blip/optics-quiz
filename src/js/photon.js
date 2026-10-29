// 波長・周波数・光子エネルギー・波数の換算。ν = c/λ、E = hν = hc/λ(E[eV] ≈ 1239.84/λ[nm])、波数 = 1/λ。
// どの欄を書き換えても、ほかの欄を計算し直す(真空中の波長として扱う)
import { num, sci } from './eng.js';
const form = document.getElementById('ph-form');
const T = form.dataset.text ? JSON.parse(form.dataset.text) : {}; // 言語ごとの単位の文言(data/tools/photon.json の text.js)
const out = k => document.querySelector(`[data-out="${k}"]`);
const c = 299792458, h = 6.62607015e-34, q = 1.602176634e-19;
const HC_EV_NM = h * c / q * 1e9; // 1239.84 eV·nm

function update(e) {
  const f = form.elements;
  const src = e?.target?.name ?? 'nm';
  const v = Number(e?.target?.value ?? f.nm.value);
  let nm;
  if (src === 'nm') nm = v;
  else if (src === 'thz') nm = c / (v * 1e12) * 1e9;
  else if (src === 'ev') nm = HC_EV_NM / v;
  else if (src === 'kayser') nm = 1e7 / v;
  if (!(nm > 0) || !Number.isFinite(nm)) return;
  const thz = c / (nm * 1e-9) / 1e12, ev = HC_EV_NM / nm, kayser = 1e7 / nm;
  if (src !== 'nm') f.nm.value = Number(nm.toPrecision(6));
  if (src !== 'thz') f.thz.value = Number(thz.toPrecision(6));
  if (src !== 'ev') f.ev.value = Number(ev.toPrecision(6));
  if (src !== 'kayser') f.kayser.value = Number(kayser.toPrecision(6));
  const pw = Number(f.mw.value) / 1000;
  const eJ = ev * q;
  out('joule').textContent = `${sci(eJ)} J`;
  out('rate').textContent = pw > 0 ? `${sci(pw / eJ)} ${T.per_s ?? '/s'}` : '–';
  out('resp').textContent = `${num(nm / HC_EV_NM, 4)} A/W`;
}
form.addEventListener('input', update);
form.addEventListener('submit', e => e.preventDefault());
update();

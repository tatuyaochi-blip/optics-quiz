// 薄肉レンズの結像(空気中、近軸)。1/a + 1/b = 1/f(a: 物体距離、前方が正。b: 像距離、後方が正)、横倍率 m = −b/a。
// 2枚の合成: 1/f = 1/f₁ + 1/f₂ − d/(f₁f₂)、バックフォーカス(レンズ2から後側焦点まで) BFD = f·(1 − d/f₁)
import { num, reader } from './eng.js';
const form = document.getElementById('tl-form');
const out = k => document.querySelector(`[data-out="${k}"]`);
const read = reader(form);
// 空欄は既定値に戻す(Number('') は 0 になり、f = 0 や a = 0 と区別できないため)
const val = (k, min) => (form.elements[k].value.trim() === '' ? Number(form.elements[k].defaultValue) : read(k, min));
const T = JSON.parse(form.dataset.text);
// 負の数はハイフンでなくマイナス記号で表示する
const fmt = x => num(x === 0 ? 0 : x, 4).replace(/^-/, '−'); // −0 は 0 に
const mm = x => `${fmt(x)} mm`;
const diopter = f => `${fmt(1000 / f)} D`;

function update() {
  // a は正の値だけ(0 や負は既定値に戻す)
  const f1 = val('f1'), a = val('a', Number.MIN_VALUE), f2 = val('f2'), d = val('d', 0);
  if (f1 === 0) {
    for (const k of ['b', 'm', 'kind', 'p1', 'fc', 'pc', 'bfd']) out(k).textContent = '–';
    out('kind').textContent = T.zero;
    return;
  }
  out('p1').textContent = diopter(f1);
  // 物体が焦点の位置にあると像は無限遠(相対誤差で判定)
  if (Math.abs(a - f1) <= 1e-9 * Math.abs(f1)) {
    out('b').textContent = '∞';
    out('m').textContent = '∞';
    out('kind').textContent = T.inf;
  } else {
    const b = 1 / (1 / f1 - 1 / a), m = -b / a;
    out('b').textContent = `${mm(b)} ${b > 0 ? T.behind : T.front}`;
    out('m').textContent = fmt(m);
    out('kind').textContent = b > 0 ? T.real : T.virtual;
  }
  if (f2 === 0) {
    for (const k of ['fc', 'pc', 'bfd']) out(k).textContent = '–';
    return;
  }
  const p = 1 / f1 + 1 / f2 - d / (f1 * f2); // mm⁻¹
  // 屈折力が0(d = f₁ + f₂)かどうかは、各レンズの屈折力に対する相対誤差で判定する
  if (Math.abs(p) <= 1e-9 * (Math.abs(1 / f1) + Math.abs(1 / f2))) {
    out('fc').textContent = T.afocal;
    out('pc').textContent = '0 D';
    out('bfd').textContent = '∞';
    return;
  }
  const f = 1 / p;
  out('fc').textContent = mm(f);
  out('pc').textContent = diopter(f);
  out('bfd').textContent = mm(f * (1 - d / f1));
}
form.addEventListener('input', update);
form.addEventListener('submit', e => e.preventDefault());
update();

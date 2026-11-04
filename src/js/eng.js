// 電子回路の計算ツールで共通に使うもの: SI接頭辞つきの表示(4.7 kΩ など)と、抵抗のE系列
const lang = document.documentElement.lang || 'en';
const PREFIX = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f']];

// 負の数はハイフンでなくマイナス記号「−」で出す(丸めて 0 になる −0.0001 などは「0」)
const minus = t => (/^-0(?:[.,]0*)?$/.test(t) ? t.slice(1) : t.replace(/^-/, '−'));
// ドイツ語では桁区切りの点(1.000)を使わない(小数点のコンマと紛れるため)
const grouping = !/^(de|es|pt|fr|nl)/.test(lang);
export const num = (x, d = 3) => (Number.isFinite(x) ? minus(x.toLocaleString(lang, { maximumSignificantDigits: d, useGrouping: grouping })) : '–');

// 値に合う接頭辞を選んで「数値 接頭辞単位」にする(丸めて 1000 になるときは次の接頭辞へ)
export function si(x, unit, d = 3) {
  if (!Number.isFinite(x)) return '–';
  if (x === 0) return `0 ${unit}`;
  const a = Math.abs(x);
  const i = PREFIX.findIndex(([f]) => a >= f);
  let [f, p] = PREFIX[i === -1 ? PREFIX.length - 1 : i];
  if (Number(Math.abs(x / f).toPrecision(d)) >= 1000 && i > 0) [f, p] = PREFIX[i - 1];
  return `${num(x / f, d)} ${p}${unit}`;
}

export const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
export const E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];
const values = (x, series) => { const e = Math.floor(Math.log10(x)); return [e - 1, e, e + 1].flatMap(k => series.map(m => Number((m * 10 ** k).toPrecision(3)))); };

// x 以上で一番小さいE系列の値(電流を上限以下に抑えたいときの抵抗など)
export const eUp = (x, series = E24) => (x > 0 ? values(x, series).find(v => v >= x * (1 - 1e-9)) : NaN);
// x に一番近いE系列の値
export const eNear = (x, series = E24) => (x > 0 ? values(x, series).reduce((a, b) => (Math.abs(Math.log(b / x)) < Math.abs(Math.log(a / x)) ? b : a)) : NaN);

// 入力欄の数値(空や数でないときは既定値)
// 数の入力欄は type="text"(type="number" だと、ブラウザによって de の「1,45」が 145 と読まれ、誤りも出ない)。
// 小数点は「.」か「,」の1つだけ。桁区切りは受け付けない(「1,234.5」は読めない入力)。
// 桁区切りと紛れる形(「1,500」、de では「1.500」)も読めない入力にする(1.5 と 1500 のどちらか決められないため)
const NUM_RE = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/;
const GROUP_RE = /^(de|es|pt|fr|nl)/.test(lang) ? /^[+-]?[1-9]\d{0,2}\.\d{3}$/ : /^[+-]?[1-9]\d{0,2},\d{3}$/;
export const parseNum = x => {
  const s = String(x ?? '').trim().replace(/^−/, '-');
  return s === '' || !NUM_RE.test(s) || GROUP_RE.test(s) ? NaN : Number(s.replace(',', '.'));
};
// URL のクエリの数を読む。URL の数は言語によらず小数点「.」で書く(String(数))ので、言語の書き方では読まない
// (de・es などで parseNum を使うと、632.816 や 1.385 が桁区切りと見なされて読めない)
export const parseUrlNum = x => {
  const s = String(x ?? '').trim();
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s) ? Number(s) : NaN;
};
// 入力欄に入れる値(de は小数のコンマ)
export const inVal = x => (/^(de|es|pt|fr|nl)/.test(lang) ? String(x).replace('.', ',') : String(x));
// 空欄・読めない入力・下限より小さい値は既定値を使う。読めない入力と下限割れの欄には aria-invalid を立てる
export const reader = form => (k, min = -Infinity) => {
  const el = form.elements[k], s = String(el.value).trim(), v = parseNum(s);
  const ok = Number.isFinite(v) && v >= min;
  el.setAttribute('aria-invalid', String(s !== '' && !ok));
  return ok ? v : parseNum(el.defaultValue);
};

// 指数表記(5.91 × 10⁻¹² のように上付きの指数で)。d は有効数字
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export const sci = (x, d = 4) => {
  if (!Number.isFinite(x)) return '–';
  if (x === 0) return '0';
  const [m, e] = x.toExponential(d - 1).split('e');
  const t = minus(Number(m).toLocaleString(lang, { minimumSignificantDigits: d, maximumSignificantDigits: d })); // 小数点はその言語の書き方(de は 5,913)
  return Number(e) === 0 ? t : `${t} × 10${String(Number(e)).replace(/./g, c => SUP[c])}`;
};

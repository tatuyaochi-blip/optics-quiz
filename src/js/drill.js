// 計算ドリル(/drill/)。数値が毎回変わる計算問題を出し、答えの数値(単位つき)を判定して、途中式とよくある間違いを示す。
// 問題の型の文章・数値の範囲・許容差・屈折率などのデータは data/drill.json(build.js がページに埋め込む)、計算はこのファイルの TYPES。
// 屈折率・物理定数などの値は data/drill.json の data に置く(公式集 data/formulas.json の例と出典の値と同じ)。
// 問題は (型, 種) で決まる(同じ種なら同じ数値)。種は URL の ?t=型&s=種 に残し、答えは URL に入れない。
// 問題文の数値は表示する桁に丸めてから答えを計算する(表示した数値で解けば、丸めの差で不正解にならない)。
// 検算: review の drill/optics-quiz/check/check_drill.py(python で式を別に書き、多くの種で突き合わせる)

// ---- 数の書き方(言語の小数点。桁区切りは使わない) ----
let LANG = typeof document !== 'undefined' ? document.documentElement.lang || 'en' : 'en';
// 見出しのあとのコロンと、箇条書きの印(中国語は全角のコロン、日本語だけ中点)
const colon = () => (/^zh/.test(LANG) ? '：' : /^fr/.test(LANG) ? '\u00a0: ' : ': ');
// 数値と単位の間(フランス語は改行しない空白)
const usp = () => (/^fr/.test(LANG) ? '\u00a0' : ' ');
const bullet = () => (/^ja/.test(LANG) ? '・' : '• ');
export const setLang = l => { LANG = l; };
const nf = o => new Intl.NumberFormat(LANG, { useGrouping: false, ...o });
const minus = t => (/^-0(?:[.,]0*)?$/.test(t) ? t.slice(1) : t.replace(/^-/, '−'));
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
// 小数 d 桁
export const fd = (x, d) => minus(nf({ minimumFractionDigits: d, maximumFractionDigits: d }).format(x));
// 指数表記(有効数字 s 桁): 2.30 × 10⁻⁵
export const fsci = (x, s = 3) => {
  if (!Number.isFinite(x)) return '–';
  if (x === 0) return '0';
  const [m, e] = x.toExponential(s - 1).split('e');
  const mm = minus(nf({ minimumFractionDigits: s - 1, maximumFractionDigits: s - 1 }).format(Number(m)));
  return Number(e) === 0 ? mm : `${mm} × 10${String(Number(e)).replace(/./g, c => SUP[c])}`;
};
// 有効数字 s 桁(とても大きい・小さい値は指数表記)
export const fs = (x, s = 4) => {
  if (!Number.isFinite(x)) return '–';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e5 || a < 1e-3) return fsci(x, s);
  return minus(nf({ minimumSignificantDigits: s, maximumSignificantDigits: s }).format(x));
};
const f4 = x => fs(x, 4);
const dpOf = s => { const t = String(s); return t.includes('e-') ? Number(t.split('e-')[1]) : (t.split('.')[1]?.length ?? 0); };
const rnd = (x, d) => Number(x.toFixed(d));
const sig = (x, s) => Number(x.toPrecision(s));
// 文献の値をその桁のまま(小数1桁以上。100 以上の整数はそのまま)
const fv = x => (Number.isInteger(x) && x >= 100 ? String(x) : fd(x, Math.max(1, dpOf(x))));
// 問題文の数(整数はそのまま、小数は持っている桁で。言語の小数点と − を使う)
const fn = x => (Number.isInteger(x) ? minus(String(x)) : fd(x, dpOf(x)));
// 許容差の % の表示(0.01 → 1、0.005 → 0.5)
export const tolPct = tol => fs(tol * 100, 2).replace(/0+$/, '').replace(/[.,]$/, '');

// ---- 種つきの乱数(mulberry32)。型の名前も混ぜて、型ごとに別の列にする ----
export function makeRng(seed, id) {
  let h = (2166136261 ^ (seed >>> 0)) >>> 0;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  let a = h;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = {
    f: next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: arr => arr[Math.floor(next() * arr.length)],
    // lo〜hi を s 刻みで(表示の桁にそろえた値)
    step: (lo, hi, s) => { const n = Math.round((hi - lo) / s); return rnd(lo + Math.floor(next() * (n + 1)) * s, dpOf(s)); },
    // lo〜hi(log なら対数で一様)を有効数字 n 桁で
    sig: (lo, hi, n, log) => sig(log ? Math.exp(Math.log(lo) + next() * (Math.log(hi) - Math.log(lo))) : lo + next() * (hi - lo), n),
  };
  // data/drill.json の範囲 v: [下限, 上限, 刻み] か { sig: 有効数字, lin|log: [下限, 上限] }
  r.v = spec => (Array.isArray(spec) ? r.step(...spec) : r.sig(...(spec.log ?? spec.lin), spec.sig, !!spec.log));
  return r;
}
// 範囲の書き方で表示する
export const showSpec = (x, spec) => (Array.isArray(spec) ? fd(x, dpOf(spec[2])) : fs(x, spec.sig));


// ---- 単位(家族ごとに、基準の単位に対する倍率。温度は [倍率, ずれ]) ----
export const UNITS = {
  len: { pm: 1e-12, nm: 1e-9, 'µm': 1e-6, mm: 1e-3, cm: 1e-2, m: 1, km: 1e3 },
  ang: { '°': 1, rad: 180 / Math.PI, mrad: 0.18 / Math.PI, 'µrad': 1.8e-4 / Math.PI, '″': 1 / 3600 },
  freq: { Hz: 1, kHz: 1e3, MHz: 1e6, GHz: 1e9, THz: 1e12 },
  time: { fs: 1e-15, ps: 1e-12, ns: 1e-9, 'µs': 1e-6, ms: 1e-3, s: 1 },
  pow: { nW: 1e-9, 'µW': 1e-6, mW: 1e-3, W: 1 },
  cur: { pA: 1e-12, nA: 1e-9, 'µA': 1e-6, mA: 1e-3, A: 1 },
  resp: { 'A/W': 1, 'mA/W': 1e-3 },
  energy: { eV: 1, meV: 1e-3, J: 1 / 1.602176634e-19 },
  inv: { 'cm⁻¹': 1, 'mm⁻¹': 10, 'm⁻¹': 0.01, 'µm⁻¹': 1e4 },
  rate: { 's⁻¹': 1 },
  db: { dB: 1 },
  dbm: { dBm: 1 },
  lx: { lx: 1, klx: 1e3 },
  frac: { '': 1, '%': 0.01 },
  pct: { '%': 1 },
  num: { '': 1 },
  temp: { K: [1, -273.15], '°C': [1, 0] },
};
// 単位の書き方の揺れ(入力欄に単位まで書いたとき)。小文字にし、空白・中点・^ を除いてから引く
const nUnit = s => s.normalize('NFKC').replace(/[\s·⋅*.^]/g, '').replace(/[−–]/g, '-').replace(/[µμ]/g, 'u').replace(/Ω/g, 'ohm').replace(/[Å]/g, 'A').toLowerCase();
const ALIAS = {
  len: { um: 'µm', 'μm': 'µm', micron: 'µm', microns: 'µm' },
  ang: { deg: '°', '度': '°', '도': '°', '°': '°', degree: '°', degrees: '°', grad: '°', urad: 'µrad', arcsec: '″', '"': '″', '秒': '″' },
  time: { sec: 's', '秒': 's', '초': 's', sekunde: 's', sekunden: 's' },
  rate: { '/s': 's⁻¹', '1/s': 's⁻¹', 'photons/s': 's⁻¹', '個/s': 's⁻¹', '개/s': 's⁻¹', cps: 's⁻¹' },
  inv: { '/cm': 'cm⁻¹', '1/cm': 'cm⁻¹', '/mm': 'mm⁻¹', '1/mm': 'mm⁻¹', '/m': 'm⁻¹', '1/m': 'm⁻¹', '/um': 'µm⁻¹', '1/um': 'µm⁻¹', kayser: 'cm⁻¹' },
  lx: { lux: 'lx', '룩스': 'lx', '勒克斯': 'lx', 'ルクス': 'lx' },
  temp: { c: '°C', degc: '°C', '°c': '°C', '度': '°C', '도': '°C', grad: '°C', kelvin: 'K' },
};
export function unitOf(fam, s) {
  const k = nUnit(s);
  if (!k) return null;
  for (const u of Object.keys(UNITS[fam])) if (nUnit(u) === k) return u;
  return ALIAS[fam]?.[k] ?? null;
}
// 値 x(単位 u)を、単位 to での値に
export function convert(fam, x, u, to) {
  const F = UNITS[fam];
  if (fam === 'temp') return (x * F[u][0] + F[u][1] - F[to][1]) / F[to][0];
  return x * F[u] / F[to];
}

// ---- 入力の読み取り: 「2.3e-5」「2,3 × 10^-5」「2.3×10⁻⁵ m²/s」など。単位が書いてあればその単位も返す ----
export function parseAnswer(raw, fam, lang = LANG) {
  let s = String(raw ?? '').normalize('NFKC').trim().replace(/[−–—]/g, '-').replace(/\s+/g, ' ');
  if (!s) return null;
  const m = s.match(/^([+-]?(?:\d[\d.,]*|[.,]\d+))\s*(?:[eE]\s*([+-]?\d+)|[×xX*]\s*10\s*(?:\^|\*\*)?\s*\(?\s*([+-]?\d+)\s*\)?)?\s*(.*)$/);
  if (!m) return null;
  let t = m[1];
  if (/^(de|es|pt|fr|nl)/.test(lang)) t = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  else if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
  else t = t.replace(',', '.');
  if ((t.match(/\./g) ?? []).length > 1) return null;
  const v = Number(t) * 10 ** Number(m[2] ?? m[3] ?? 0);
  if (!Number.isFinite(v)) return null;
  const rest = m[4].trim();
  if (!rest) return { v, u: null };
  const u = unitOf(fam, rest);
  return u == null ? { v, u: null, bad: rest } : { v, u };
}

// ---- 補助 ----
const D2R = Math.PI / 180;
const sind = d => Math.sin(d * D2R), cosd = d => Math.cos(d * D2R), tand = d => Math.tan(d * D2R);
const asind = x => Math.asin(x) / D2R, atand = x => Math.atan(x) / D2R;
// 屈折率は小数3桁以上で(空気の 1 も 1.000 と書く)
const fI = n => fd(n, Math.max(3, dpOf(n)));
// よくある間違いの値が正解から十分に離れているときだけ挙げる(t: 許容差。その2倍より離れていること)
const far = (a, ans, t = 0.01) => Number.isFinite(a) && Math.abs(a - ans) > 2 * t * Math.abs(ans);
const opt = (cond, o) => (cond ? o : {});
const nm = (X, k, id) => X.N.x[`${k}_${id}`] ?? id;

// ---- 問題の型 ----
// gen(r, T, X): 問題の数値(vals)。T は data/drill.json の型(v: 範囲、pick: 選ぶもの)、X は { D: データ、N: 名前 }
// show(vals, T, X): 問題文に入れる文字(自動で、範囲 v のある値は範囲の桁で入る)
// solve(vals, X): { ans, fam, unit, k: 途中式の文字, alt: { 間違いのID: そのときの値(unit で) }, tool: { id, q } }
// vals.v があれば、文章(q・steps)の場合分けの鍵になる
export const TYPES = {
  // ===== 幾何光学と結像 =====
  'snell-angle': {
    gen: (r, T, X) => {
      for (;;) {
        const band = r.pick(T.pick.band), B = X.D.band[band], ids = Object.keys(B.n), m1 = r.pick(ids), m2 = r.pick(ids);
        if (m1 === m2) continue;
        const t1 = r.v(T.v.t1);
        if (B.n[m1] * sind(t1) / B.n[m2] > 0.97) continue;
        return { band, lam: B.lam, m1, m2, n1: B.n[m1], n2: B.n[m2], t1 };
      }
    },
    show: (v, T, X) => ({ lam: fn(v.lam), m1: nm(X, 'med', v.m1), m2: nm(X, 'med', v.m2), n1: fI(v.n1), n2: fI(v.n2), t1: fd(v.t1, 1) }),
    solve: v => {
      const s1 = sind(v.t1), s = v.n1 * s1 / v.n2, t2 = asind(s), sw = v.n2 * s1 / v.n1, sf = v.n1 * cosd(v.t1) / v.n2;
      return { ans: t2, fam: 'ang', unit: '°', k: { s1: f4(s1), s: f4(s), t2: f4(t2) },
        alt: { ...opt(sw < 1 && far(asind(sw), t2, 0.005), { swap: asind(sw) }), ...opt(far(90 - t2, t2, 0.005), { surf: 90 - t2 }), ...opt(sf < 1 && far(asind(sf), t2, 0.005), { surfin: asind(sf) }) } };
    },
  },
  'critical-angle': {
    gen: (r, T, X) => {
      const q = r.pick(['ang', 'n']);
      if (q === 'n') {
        // 求める屈折率が実在の透明な材料の範囲(1.3〜4)に入る臨界角だけを使う
        for (;;) { const out = r.pick(T.pick.out), n2 = X.D.band.vis.n[out], tc = r.v(T.v.tc), n1 = n2 / sind(tc); if (n1 >= 1.3 && n1 <= 4) return { v: q, out, n2, tc }; }
      }
      for (;;) {
        const band = r.pick(T.pick.band), B = X.D.band[band], ids = Object.keys(B.n), m1 = r.pick(ids), m2 = r.pick(ids);
        if (!(B.n[m1] / B.n[m2] >= 1.03)) continue;
        return { v: q, band, lam: B.lam, m1, m2, n1: B.n[m1], n2: B.n[m2] };
      }
    },
    show: (v, T, X) => (v.v === 'n' ? { out: nm(X, 'med', v.out), n2: fI(v.n2), tc: fd(v.tc, 1) }
      : { lam: fn(v.lam), m1: nm(X, 'med', v.m1), m2: nm(X, 'med', v.m2), n1: fI(v.n1), n2: fI(v.n2) }),
    solve: v => {
      if (v.v === 'n') {
        const s = sind(v.tc), n1 = v.n2 / s;
        return { ans: n1, fam: 'num', unit: '', k: { s: f4(s), n1: f4(n1) },
          alt: { ...opt(far(v.n2 / cosd(v.tc), n1, 0.005), { cos: v.n2 / cosd(v.tc) }), ...opt(far(v.n2 / tand(v.tc), n1, 0.005), { tan: v.n2 / tand(v.tc) }), inv: v.n2 * s } };
      }
      const s = v.n2 / v.n1, tc = asind(s);
      return { ans: tc, fam: 'ang', unit: '°', k: { s: f4(s), tc: f4(tc) },
        alt: { brew: atand(s), ...opt(far(90 - tc, tc, 0.005), { comp: 90 - tc }) } };
    },
  },
  'thin-lens': {
    gen: (r, T) => {
      for (;;) {
        const f = r.v(T.v.f), a = r.v(T.v.a);
        if (a < 1.25 * f || a > 8 * f) continue;
        return { v: r.pick(['b', 'm']), f, a };
      }
    },
    solve: v => {
      const b = v.a * v.f / (v.a - v.f), m = -b / v.a, bp = v.a * v.f / (v.a + v.f);
      const k = { inv: fs(1 / v.f - 1 / v.a, 4), b: f4(b), m: f4(m) };
      const tool = { id: 'thinlens', q: { f1: v.f, a: v.a } };
      if (v.v === 'b') return { ans: b, fam: 'len', unit: 'mm', k, alt: { plus: bp }, tool };
      return { ans: m, fam: 'num', unit: '', k, alt: { ...opt(far(-v.a / b, m), { inv: -v.a / b }), nosign: b / v.a, plus: -bp / v.a }, tool };
    },
  },
  'two-lens': {
    gen: (r, T) => {
      for (;;) {
        const f1 = r.v(T.v.f1), f2 = r.v(T.v.f2), lo = Math.ceil(0.1 * (f1 + f2) / 5) * 5, hi = Math.floor(0.8 * f1 / 5) * 5;
        if (lo > hi) continue;
        return { v: r.pick(['f', 'bfd']), f1, f2, d: r.step(lo, hi, 5) };
      }
    },
    show: v => ({ f1: fn(v.f1), f2: fn(v.f2), d: fn(v.d) }),
    solve: v => {
      const P = 1 / v.f1 + 1 / v.f2 - v.d / (v.f1 * v.f2), f = 1 / P, bfd = f * (1 - v.d / v.f1);
      const k = { p1: fs(1 / v.f1, 4), p2: fs(1 / v.f2, 4), pd: fs(v.d / (v.f1 * v.f2), 4), P: fs(P, 4), f: f4(f), bfd: f4(bfd) };
      const tool = { id: 'thinlens', q: { f1: v.f1, f2: v.f2, d: v.d } };
      if (v.v === 'f') return { ans: f, fam: 'len', unit: 'mm', k, alt: { nod: v.f1 * v.f2 / (v.f1 + v.f2), plus: v.f1 * v.f2 / (v.f1 + v.f2 + v.d) }, tool };
      const b2 = f * (1 - v.d / v.f2);
      return { ans: bfd, fam: 'len', unit: 'mm', k, alt: { f, ...opt(far(b2, bfd), { f2: b2 }) }, tool };
    },
  },
  'na-fnumber': {
    gen: (r, T, X) => {
      if (r.pick(['na', 'fn']) === 'na') { const im = r.pick(T.pick.imm); return { v: 'na', im, n: X.D.imm[im], th: r.v(T.v.th) }; }
      for (;;) {
        const f = r.v(T.v.f), D = r.v(T.v.D), N = f / D;
        if (N < 1.2 || N > 11) continue;
        return { v: 'fn', f, D };
      }
    },
    show: (v, T, X) => (v.v === 'na' ? { im: nm(X, 'imm', v.im), n: fI(v.n), th: fd(v.th, 1) } : { f: fn(v.f), D: fn(v.D) }),
    solve: v => {
      if (v.v === 'na') {
        const s = sind(v.th), na = v.n * s;
        return { ans: na, fam: 'num', unit: '', k: { s: f4(s), na: f4(na) },
          alt: { ...opt(v.n > 1.01, { non: s }), ...opt(far(v.n * tand(v.th), na), { tan: v.n * tand(v.th) }) } };
      }
      const N = v.f / v.D, na = 1 / (2 * N), at = Math.sin(Math.atan(v.D / (2 * v.f)));
      return { ans: na, fam: 'num', unit: '', k: { N: f4(N), na: f4(na) },
        alt: { n1: 1 / N, ...opt(far(at, na), { atan: at }), ...opt(far(N, na), { nval: N }) } };
    },
  },
  // ===== 干渉・回折・分光 =====
  'young-fringe': {
    gen: (r, T) => {
      const d = r.v(T.v.d), L = r.v(T.v.L);
      if (r.pick(['dy', 'lam']) === 'dy') return { v: 'dy', lam: r.pick(T.pick.lam), d, L };
      const lam0 = r.step(400, 700, 1), N = r.int(5, 20);
      return { v: 'lam', d, L, N, s: sig(N * lam0 * L / d * 1e-3, 3) };
    },
    show: v => ({ d: fd(v.d, 2), L: fd(v.L, 1), ...(v.v === 'dy' ? { lam: fn(v.lam) } : { N: fn(v.N), s: fs(v.s, 3) }) }),
    solve: v => {
      if (v.v === 'dy') {
        const dy = v.lam * v.L / v.d * 1e-3;
        return { ans: dy, fam: 'len', unit: 'mm', k: { lm: fsci(v.lam * 1e-9, 4), dm: fsci(v.d * 1e-3, 3), dy: f4(dy) }, alt: { half: dy / 2, dbl: 2 * dy } };
      }
      const dy = v.s / v.N, lam = dy * v.d / v.L * 1e3;
      return { ans: lam, fam: 'len', unit: 'nm', k: { dy: f4(dy), lam: f4(lam) }, alt: { non: lam * v.N, n1: lam * v.N / (v.N - 1), half: lam / 2 } };
    },
  },
  'airy-spot': {
    gen: (r, T) => {
      const q = r.pick(['ang', 'spot', 'res']);
      if (q === 'ang') return { v: q, D: r.pick(T.pick.D), lam: r.pick(T.pick.lamv) };
      if (q === 'spot') return { v: q, N: r.pick(T.pick.N), lam: r.pick(T.pick.lamv) };
      return { v: q, na: r.pick(T.pick.na), lam: r.pick(T.pick.laml) };
    },
    show: v => ({ lam: fn(v.lam), ...(v.v === 'ang' ? { D: fn(v.D) } : v.v === 'spot' ? { N: fn(v.N) } : { na: fd(v.na, 2) }) }),
    solve: v => {
      if (v.v === 'ang') {
        const x = v.lam * 1e-9 / (v.D * 1e-3), th = 1.22 * x * 1e6;
        return { ans: th, fam: 'ang', unit: 'µrad', k: { x: fsci(x, 4), th: f4(th), as: f4(th * 1e-6 / D2R * 3600) }, alt: { no122: x * 1e6, diam: 2 * th } };
      }
      if (v.v === 'spot') {
        const rr = 1.22 * v.lam * v.N / 1000;
        return { ans: rr, fam: 'len', unit: 'µm', k: { r: f4(rr) }, alt: { no122: v.lam * v.N / 1000, diam: 2 * rr } };
      }
      const dd = 0.61 * v.lam / v.na;
      return { ans: dd, fam: 'len', unit: 'nm', k: { d: f4(dd) }, alt: { abbe: v.lam / (2 * v.na), no061: v.lam / v.na, diam: 2 * dd } };
    },
  },
  'grating-angle': {
    gen: (r, T) => {
      for (;;) {
        const G = r.pick(T.pick.G), lam = r.pick(T.pick.lam), ok = [1, 2, 3].filter(m => m * lam * G * 1e-6 < 0.95);
        if (!ok.length) continue;
        const m = r.pick(ok), q = r.pick(['beta', 'dl']);
        return q === 'beta' ? { v: q, G, lam, m } : { v: q, G, lam, m, W: r.v(T.v.W) };
      }
    },
    show: v => ({ G: fn(v.G), lam: fn(v.lam), m: fn(v.m), ...(v.W != null ? { W: fn(v.W) } : {}) }),
    solve: v => {
      const d = 1e6 / v.G, s = v.m * v.lam / d, b = asind(s);
      if (v.v === 'beta') {
        return { ans: b, fam: 'ang', unit: '°', k: { d: f4(d), s: f4(s), b: f4(b) },
          alt: { ...opt(v.m > 1, { m1: asind(v.lam / d) }), ...opt(far(atand(s), b, 0.005), { tan: atand(s) }) } };
      }
      const N = v.G * v.W, R = v.m * N, dl = v.lam / R * 1000;
      return { ans: dl, fam: 'len', unit: 'pm', k: { N: fn(N), R: fn(R), dl: f4(dl) }, alt: { ...opt(v.m > 1, { m1: v.lam / N * 1000 }), nw: v.lam / (v.m * v.G) * 1000 } };
    },
  },
  'fsr-finesse': {
    gen: (r, T, X) => {
      const q = r.pick(['fsr', 'fin', 'lw']), med = r.pick(T.pick.med);
      return { v: q, med, ng: X.D.ng[med], L: r.v(T.v.L), R: r.v(T.v.R) };
    },
    show: (v, T, X) => ({ med: nm(X, 'ng', v.med), ng: fI(v.ng), L: fd(v.L, 1), R: fd(v.R, 3), c: fsci(X.D.c.c, 4) }),
    solve: (v, X) => {
      const c = X.D.c.c, fsr = c / (2 * v.ng * v.L * 1e-3), F = Math.PI * Math.sqrt(v.R) / (1 - v.R), lw = fsr / F;
      const k = { fsr: f4(fsr / 1e9), F: f4(F), lw: f4(lw / 1e6), sq: f4(Math.sqrt(v.R)) };
      if (v.v === 'fsr') return { ans: fsr / 1e9, fam: 'freq', unit: 'GHz', k, alt: { no2: 2 * fsr / 1e9, ...opt(v.ng > 1.01, { non: v.ng * fsr / 1e9 }) } };
      if (v.v === 'fin') {
        const ns = Math.PI * v.R / (1 - v.R);
        return { ans: F, fam: 'num', unit: '', k, alt: { coef: 4 * v.R / (1 - v.R) ** 2, ...opt(far(ns, F), { nosq: ns }), nopi: F / Math.PI } };
      }
      return { ans: lw / 1e6, fam: 'freq', unit: 'MHz', k, alt: { mult: fsr * F / 1e6, fsr: fsr / 1e6, no2: 2 * lw / 1e6 } };
    },
  },
  'coherence-length': {
    gen: (r, T) => (r.pick(['lam', 'nu']) === 'lam'
      ? { v: 'lam', lam: r.pick(T.pick.lam), dl: r.v(T.v.dl) }
      : { v: 'nu', dnu: r.v(T.v.dnu) }),
    show: (v, T, X) => (v.v === 'lam' ? { lam: fn(v.lam), dl: fn(v.dl) } : { dnu: fs(v.dnu, 2), c: fsci(X.D.c.c, 4) }),
    solve: (v, X) => {
      if (v.v === 'lam') {
        const lc = v.lam ** 2 / v.dl / 1000;
        return { ans: lc, fam: 'len', unit: 'µm', k: { sq: fn(v.lam ** 2), lc: f4(lc) }, alt: { half: lc / 2, oct: 2 * Math.LN2 / Math.PI * lc } };
      }
      const lc = X.D.c.c / (v.dnu * 1e6);
      return { ans: lc, fam: 'len', unit: 'm', k: { nu: fsci(v.dnu * 1e6, 3), lc: f4(lc) }, alt: { half: lc / 2, pi: lc / Math.PI } };
    },
  },
  // ===== 偏光 =====
  brewster: {
    gen: (r, T, X) => {
      const q = r.pick(['ext', 'int', 'two']);
      if (q === 'two') { const m2 = r.pick(T.pick.glass); return { v: q, lam: X.D.band.vis.lam, m1: 'water', m2, n1: X.D.band.vis.n.water, n2: X.D.band.vis.n[m2] }; }
      const band = r.pick(T.pick.band), B = X.D.band[band], m = r.pick(Object.keys(B.n).filter(x => x !== 'air'));
      return q === 'ext' ? { v: q, lam: B.lam, m1: 'air', m2: m, n1: B.n.air, n2: B.n[m] } : { v: q, lam: B.lam, m1: m, m2: 'air', n1: B.n[m], n2: B.n.air };
    },
    show: (v, T, X) => ({ lam: fn(v.lam), m1: nm(X, 'med', v.m1), m2: nm(X, 'med', v.m2), n1: fI(v.n1), n2: fI(v.n2) }),
    solve: v => {
      const x = v.n2 / v.n1, tb = atand(x), lo = Math.min(v.n1, v.n2) / Math.max(v.n1, v.n2);
      return { ans: tb, fam: 'ang', unit: '°', k: { x: f4(x), tb: f4(tb), tt: f4(90 - tb) },
        alt: { ...opt(far(atand(1 / x), tb, 0.005), { inv: atand(1 / x) }), ...opt(far(asind(lo), tb, 0.005), { crit: asind(lo) }) } };
    },
  },
  'fresnel-normal': {
    gen: (r, T, X) => {
      const q = r.pick(['r', 't2', 'n']);
      if (q === 'n') return { v: q, R: r.v(T.v.R) };
      for (;;) {
        const band = r.pick(T.pick.band), B = X.D.band[band], m1 = q === 'r' ? r.pick(T.pick.from.filter(x => x in B.n)) : 'air', m2 = r.pick(Object.keys(B.n));
        if (m2 === m1 || B.n[m2] <= B.n[m1] * 1.05) continue;
        return { v: q, lam: B.lam, m1, m2, n1: B.n[m1], n2: B.n[m2] };
      }
    },
    show: (v, T, X) => (v.v === 'n' ? { R: fd(v.R, 1) } : { lam: fn(v.lam), m1: nm(X, 'med', v.m1), m2: nm(X, 'med', v.m2), n1: fI(v.n1), n2: fI(v.n2) }),
    solve: v => {
      if (v.v === 'n') {
        const R = v.R / 100, s = Math.sqrt(R), n = (1 + s) / (1 - s);
        return { ans: n, fam: 'num', unit: '', k: { s: f4(s), n: f4(n) }, alt: { nosqrt: (1 + R) / (1 - R), inv: (1 - s) / (1 + s) } };
      }
      const rr = (v.n1 - v.n2) / (v.n1 + v.n2), R = rr * rr, T2 = (1 - R) ** 2, mult = (1 - R) / (1 + R);
      const k = { r: f4(rr), R: f4(R), Rp: f4(R * 100), T1: f4(1 - R), T2: f4(T2), T2p: f4(T2 * 100) };
      const tool = { id: 'arcoat', q: { n0: v.n1, ns: v.n2 } };
      if (v.v === 'r') return { ans: R * 100, fam: 'frac', unit: '%', k, alt: { amp: Math.abs(rr) * 100, trans: (1 - R) * 100 }, tool };
      return { ans: T2 * 100, fam: 'frac', unit: '%', k, alt: { one: (1 - R) * 100, ...opt(far(mult, T2), { mult: mult * 100 }), r: R * 100 }, tool };
    },
  },
  malus: {
    gen: (r, T) => ({ v: r.pick(['pol', 'unpol', 'three']), I0: r.v(T.v.I0), th: r.v(T.v.th) }),
    show: v => ({ I0: fd(v.I0, 1), th: fn(v.th), th3: fn(90 - v.th) }),
    solve: v => {
      const c = cosd(v.th), c2 = c * c, s2 = 1 - c2;
      const k = { c: f4(c), c2: f4(c2), s2: f4(s2), h: f4(v.I0 / 2) };
      if (v.v === 'pol') { const I = v.I0 * c2; return { ans: I, fam: 'pow', unit: 'mW', k: { ...k, I: f4(I) }, alt: { ...opt(far(v.I0 * c, I), { nosq: v.I0 * c }), ...opt(far(v.I0 * s2, I), { sin: v.I0 * s2 }) } }; }
      if (v.v === 'unpol') { const I = v.I0 / 2 * c2; return { ans: I, fam: 'pow', unit: 'mW', k: { ...k, I: f4(I) }, alt: { nohalf: 2 * I, ...opt(far(v.I0 / 2 * c, I), { nosq: v.I0 / 2 * c }), ...opt(far(v.I0 / 2 * s2, I), { sin: v.I0 / 2 * s2 }) } }; }
      const I = v.I0 / 2 * c2 * s2;
      return { ans: I, fam: 'pow', unit: 'mW', k: { ...k, I2: f4(v.I0 / 2 * c2), I: f4(I) }, alt: { nohalf: 2 * I, ...opt(far(v.I0 / 2 * c2, I), { one: v.I0 / 2 * c2 }), zero: 0 } };
    },
  },
  waveplate: {
    gen: (r, T) => {
      const x = r.pick(T.pick.xtal), lam = r.pick(T.pick.lam), dn = T.data.dn[x][lam], q = r.pick(['qwp', 'hwp', 'ret']);
      return q === 'ret' ? { v: q, x, dn, lam, d: r.v(T.v.d) } : { v: q, x, dn, lam };
    },
    show: (v, T, X) => ({ x: nm(X, 'xtal', v.x), dn: fd(v.dn, dpOf(v.dn)), lam: fn(v.lam), ...(v.d != null ? { d: fd(v.d, 2) } : {}) }),
    solve: v => {
      if (v.v === 'ret') {
        const w = v.dn * v.d * 1e6 / v.lam;
        return { ans: w, fam: 'num', unit: '', k: { od: f4(v.dn * v.d * 1e6), w: f4(w), G: f4(2 * Math.PI * w) }, alt: { rad: 2 * Math.PI * w, inv: 1 / w } };
      }
      const q = v.lam / (4 * v.dn) / 1000, h = 2 * q;
      if (v.v === 'qwp') return { ans: q, fam: 'len', unit: 'µm', k: { d: f4(q) }, alt: { half: h, full: 2 * h, nodn: v.lam / 4 / 1000 } };
      return { ans: h, fam: 'len', unit: 'µm', k: { d: f4(h) }, alt: { quarter: q, full: 2 * h, nodn: v.lam / 2 / 1000 } };
    },
  },
  // ===== 光学材料と薄膜 =====
  'ar-coat': {
    gen: (r, T, X) => {
      const q = r.pick(['d', 'n', 'r']);
      const ir = q !== 'r' && r.f() < 0.4;
      if (ir) { const s = r.pick(T.pick.subir); return { v: q, band: 'ir', s, ns: X.D.band.ir.n[s], lam0: X.D.band.ir.lam, film: 'sinx', n1: r.v(T.v.nsinx) }; }
      const s = r.pick(T.pick.subvis);
      return { v: q, band: 'vis', s, ns: X.D.band.vis.n[s], lam0: r.v(T.v.lam0), film: 'mgf2', n1: X.D.mgf2 };
    },
    show: (v, T, X) => ({ s: nm(X, 'med', v.s), ns: fI(v.ns), lam0: fn(v.lam0), film: nm(X, 'film', v.film), n1: fd(v.n1, 2) }),
    solve: v => {
      const tool = { id: 'arcoat', q: { lambda0: v.lam0, n0: 1, ns: v.ns, n1: v.n1, lambda: v.lam0 } };
      if (v.v === 'd') { const d = v.lam0 / (4 * v.n1); return { ans: d, fam: 'len', unit: 'nm', k: { d: f4(d), opt: f4(v.lam0 / 4) }, alt: { nodiv: v.lam0 / 4, half: 2 * d, ns: v.lam0 / (4 * v.ns) }, tool }; }
      if (v.v === 'n') { const n = Math.sqrt(v.ns); return { ans: n, fam: 'num', unit: '', k: { n: f4(n) }, alt: { ...opt(far((1 + v.ns) / 2, n, 0.005), { mean: (1 + v.ns) / 2 }), nosqrt: v.ns }, tool }; }
      const n12 = v.n1 ** 2, rr = (v.ns - n12) / (v.ns + n12), R = rr * rr, R0 = ((v.ns - 1) / (v.ns + 1)) ** 2, Rs = ((v.ns - v.n1) / (v.ns + v.n1)) ** 2;
      return { ans: R * 100, fam: 'frac', unit: '%', k: { n12: f4(n12), r: f4(rr), Rp: f4(R * 100), R0p: f4(R0 * 100) }, alt: { bare: R0 * 100, amp: Math.abs(rr) * 100, ...opt(far(Rs, R), { simple: Rs * 100 }) }, tool };
    },
  },
  achromat: {
    gen: (r, T) => ({ v: r.pick(['f1', 'f2']), f: r.v(T.v.f) }),
    show: (v, T, X) => ({ f: fn(v.f), V1: fd(X.D.abbe.bk7, 2), V2: fd(X.D.abbe.f2, 2) }),
    solve: (v, X) => {
      const V1 = X.D.abbe.bk7, V2 = X.D.abbe.f2, dV = V1 - V2, f1 = v.f * dV / V1, f2 = -v.f * dV / V2;
      const k = { dV: f4(dV), phi: fs(1 / v.f, 4), p1: fs(1 / f1, 4), p2: fs(1 / f2, 4), f1: f4(f1), f2: f4(f2) };
      if (v.v === 'f1') return { ans: f1, fam: 'len', unit: 'mm', k, alt: { swap: v.f * dV / V2, inv: v.f * V1 / dV } };
      return { ans: f2, fam: 'len', unit: 'mm', k, alt: { swap: -v.f * dV / V1, inv: -v.f * V2 / dV } };
    },
  },
  absorption: {
    gen: (r, T) => {
      const q = r.pick(['trans', 'depth', 'kappa']);
      if (q === 'trans') { const a = r.v(T.v.at), x = r.sig(0.1, 3, 2, true); return { v: q, a, z: sig(x / (a / 10), 2) }; }
      if (q === 'depth') return { v: q, a: r.v(T.v.ad) };
      return { v: q, kap: r.v(T.v.kap), lam: r.pick(T.pick.lam) };
    },
    show: v => (v.v === 'kappa' ? { kap: fsci(v.kap, 2), lam: fn(v.lam) } : { a: fs(v.a, 2), ...(v.z != null ? { z: fs(v.z, 2) } : {}) }),
    solve: v => {
      if (v.v === 'trans') {
        const x = v.a * v.z / 10, T = Math.exp(-x), lin = 1 - x;
        return { ans: T * 100, fam: 'frac', unit: '%', k: { zc: fs(v.z / 10, 3), x: f4(x), T: f4(T * 100) },
          alt: { log10: 100 * 10 ** -x, ...opt(far(Math.exp(-x * 10), T), { cm: 100 * Math.exp(-x * 10) }), ...opt(lin > 0 && far(lin, T), { lin: 100 * lin }) } };
      }
      if (v.v === 'depth') { const dp = 1e4 / v.a; return { ans: dp, fam: 'len', unit: 'µm', k: { dc: fsci(1 / v.a, 4), dp: f4(dp) }, alt: { ln2: Math.LN2 * dp, amp: 2 * dp } }; }
      const lc = v.lam * 1e-7, a = 4 * Math.PI * v.kap / lc;
      return { ans: a, fam: 'inv', unit: 'cm⁻¹', k: { lc: fsci(lc, 4), a: f4(a) }, alt: { pi2: a / 2, nopi: a / Math.PI } };
    },
  },
  // ===== レーザーとガウシアンビーム =====
  'gauss-beam': {
    gen: (r, T) => {
      const lam = r.pick(T.pick.lam), w0 = r.v(T.v.w0), m2 = r.pick(T.pick.m2), q = r.pick(['zr', 'wz', 'div']);
      const zr = Math.PI * (w0 * 1e-3) ** 2 / (m2 * lam * 1e-6);
      return { v: q, lam, w0, m2, ...(q === 'wz' ? { z: sig(zr * r.sig(0.3, 4, 2, true), 3) } : {}) };
    },
    show: v => ({ lam: fn(v.lam), w0: fn(v.w0), m2: fd(v.m2, 1), ...(v.z != null ? { z: fs(v.z, 3) } : {}) }),
    solve: v => {
      const lm = v.lam * 1e-6, wm = v.w0 * 1e-3, zr = Math.PI * wm ** 2 / (v.m2 * lm), th = v.m2 * v.lam * 1e-9 / (Math.PI * v.w0 * 1e-6) * 1e3;
      const tool = { id: 'gaussian', q: { lambda: v.lam, w0: v.w0, m2: v.m2, n: 1, z: v.z ?? 1000 } };
      const k = { zr: f4(zr), th: f4(th) };
      if (v.v === 'zr') return { ans: zr, fam: 'len', unit: 'mm', k, alt: { diam: 4 * zr, nopi: zr / Math.PI, ...opt(v.m2 > 1.05, { m2: zr * v.m2 ** 2 }) }, tool };
      if (v.v === 'div') return { ans: th, fam: 'ang', unit: 'mrad', k, alt: { full: 2 * th, nopi: th * Math.PI, ...opt(v.m2 > 1.05, { m2: th / v.m2 }) }, tool };
      const x = v.z / zr, w = v.w0 * Math.sqrt(1 + x * x), ns = v.w0 * (1 + x * x), fa = v.w0 * x, li = v.w0 * (1 + x);
      return { ans: w, fam: 'len', unit: 'µm', k: { ...k, x: f4(x), x2: f4(x * x), w: f4(w) },
        alt: { ...opt(far(ns, w), { nosqrt: ns }), ...opt(far(fa, w), { far: fa }), ...opt(far(li, w), { lin: li }) }, tool };
    },
  },
  'long-modes': {
    gen: (r, T) => (r.pick(['nu', 'lam']) === 'nu' ? { v: 'nu', L: r.v(T.v.L) } : { v: 'lam', Lu: r.v(T.v.Lu), ng: r.v(T.v.ng), lam: r.pick(T.pick.lam) }),
    show: (v, T, X) => ({ c: fsci(X.D.c.c, 4), ...(v.v === 'nu' ? { L: fd(v.L, 2) } : { Lu: fn(v.Lu), ng: fd(v.ng, 1), lam: fn(v.lam) }) }),
    solve: (v, X) => {
      if (v.v === 'nu') { const dn = X.D.c.c / (2 * v.L) / 1e6; return { ans: dn, fam: 'freq', unit: 'MHz', k: { dn: f4(dn) }, alt: { no2: 2 * dn, half: dn / 2 } }; }
      const dl = v.lam ** 2 / (2 * v.ng * v.Lu * 1e3);
      return { ans: dl, fam: 'len', unit: 'nm', k: { sq: fn(v.lam ** 2), den: fn(2 * v.ng * v.Lu * 1e3), dl: f4(dl) }, alt: { no2: 2 * dl, non: dl * v.ng } };
    },
  },
  // ===== 光ファイバと光通信 =====
  'fiber-na': {
    gen: (r, T) => { const n1 = r.v(T.v.n1), dl = r.v(T.v.delta); return { v: r.pick(['na', 'theta', 'delta']), n1, n2: rnd(n1 * Math.sqrt(1 - 2 * dl / 100), 4) }; },
    show: v => ({ n1: fd(v.n1, 4), n2: fd(v.n2, 4) }),
    solve: v => {
      const d2 = v.n1 ** 2 - v.n2 ** 2, na = Math.sqrt(d2), th = asind(na), dl = d2 / (2 * v.n1 ** 2);
      const k = { d2: fs(d2, 4), na: f4(na), th: f4(th), dl: f4(dl * 100) };
      const tool = { id: 'fiber', q: { n1: v.n1, n2: v.n2 } };
      if (v.v === 'na') return { ans: na, fam: 'num', unit: '', k, alt: { diff: v.n1 - v.n2, nosqrt: d2, nosq: Math.sqrt(v.n1 - v.n2) }, tool };
      if (v.v === 'theta') return { ans: th, fam: 'ang', unit: '°', k, alt: { full: 2 * th, core: asind(na / v.n1) }, tool };
      return { ans: dl * 100, fam: 'frac', unit: '%', k, alt: { no2: 200 * dl, na: 100 * na }, tool };
    },
  },
  'v-number': {
    gen: (r, T) => { const n1 = r.v(T.v.n1), dl = r.v(T.v.delta); return { v: r.pick(['v', 'lc']), n1, n2: rnd(n1 * Math.sqrt(1 - 2 * dl / 100), 4), dc: r.v(T.v.dc), lam: r.pick(T.pick.lam) }; },
    show: v => ({ n1: fd(v.n1, 4), n2: fd(v.n2, 4), dc: fd(v.dc, 1), lam: fn(v.lam), a: fd(v.dc / 2, 1) }),
    solve: (v, X) => {
      const na = Math.sqrt(v.n1 ** 2 - v.n2 ** 2), a = v.dc / 2, V = 2 * Math.PI * a * 1000 * na / v.lam, lc = 2 * Math.PI * a * 1000 * na / 2.405;
      const k = { na: f4(na), V: f4(V), lc: f4(lc), mode: X.N.x[V < 2.405 ? 'mode_single' : 'mode_multi'] };
      const tool = { id: 'fiber', q: { n1: v.n1, n2: v.n2, a, lambda: v.lam } };
      if (v.v === 'v') return { ans: V, fam: 'num', unit: '', k, alt: { diam: 2 * V, nopi: V / (2 * Math.PI) }, tool };
      return { ans: lc, fam: 'len', unit: 'nm', k, alt: { diam: 2 * lc, no2: lc / 2 }, tool };
    },
  },
  'chrom-disp': {
    gen: (r, T) => {
      const q = r.pick(['tau', 'len', 'nu']), D = r.v(T.v.D);
      if (q === 'tau') return { v: q, D, L: r.v(T.v.L), dl: r.v(T.v.dl) };
      if (q === 'nu') return { v: q, D, L: r.v(T.v.L), dnu: r.v(T.v.dnu) };
      return { v: q, D, dl: r.v(T.v.dl), tau: r.v(T.v.tau) };
    },
    show: (v, T, X) => ({ D: fd(v.D, 1), ...(v.L != null ? { L: fn(v.L) } : {}), ...(v.dl != null ? { dl: fs(v.dl, 2) } : {}), ...(v.dnu != null ? { dnu: fn(v.dnu) } : {}), ...(v.tau != null ? { tau: fn(v.tau) } : {}), c: fsci(X.D.c.c, 4) }),
    solve: (v, X) => {
      if (v.v === 'len') { const L = v.tau / (v.D * v.dl); return { ans: L, fam: 'len', unit: 'km', k: { Ddl: f4(v.D * v.dl), L: f4(L) }, alt: { ...opt(far(v.tau * v.D * v.dl, L), { mult: v.tau * v.D * v.dl }), ...opt(far(1 / L, L), { inv: 1 / L }) } }; }
      const dl = v.v === 'nu' ? (1550e-9) ** 2 * v.dnu * 1e9 / X.D.c.c * 1e9 : v.dl, t = v.D * v.L * dl;
      return { ans: t, fam: 'time', unit: 'ps', k: { dlc: f4(dl), t: f4(t) },
        alt: v.v === 'nu' ? { raw: v.D * v.L * v.dnu } : { ...opt(far(v.D * v.L / v.dl, t), { div: v.D * v.L / v.dl }) } };
    },
  },
  'db-power': {
    gen: (r, T) => {
      const q = r.pick(['todbm', 'tomw', 'loss']);
      if (q === 'todbm') { for (;;) { const P = r.sig(0.001, 100, 3, true); if (Math.abs(10 * Math.log10(P)) >= 3) return { v: q, P }; } }
      if (q === 'tomw') { for (;;) { const dbm = r.v(T.v.dbm); if (Math.abs(dbm) >= 1) return { v: q, dbm }; } }
      return { v: q, Pin: r.v(T.v.Pin), al: r.pick(T.pick.al), L: r.v(T.v.L) };
    },
    show: v => ({ ...(v.P != null ? { P: fs(v.P, 3) } : {}), ...(v.dbm != null ? { dbm: fd(v.dbm, 1) } : {}), ...(v.Pin != null ? { Pin: fd(v.Pin, 1), al: fd(v.al, 2), L: fn(v.L) } : {}) }),
    solve: v => {
      if (v.v === 'todbm') { const lg = Math.log10(v.P), y = 10 * lg; return { ans: y, fam: 'dbm', unit: 'dBm', k: { lg: f4(lg), y: f4(y) }, alt: { ln: 10 * Math.log(v.P), x20: 20 * lg, w: y - 30 } }; }
      if (v.v === 'tomw') { const P = 10 ** (v.dbm / 10); return { ans: P, fam: 'pow', unit: 'mW', k: { e: fd(v.dbm / 10, 2), P: f4(P) }, alt: { x20: 10 ** (v.dbm / 20), ...opt(far(Math.exp(v.dbm / 10), P), { ln: Math.exp(v.dbm / 10) }) } }; }
      const A = v.al * v.L, P = v.Pin * 10 ** (-A / 10);
      return { ans: P, fam: 'pow', unit: 'mW', k: { A: f4(A), f: f4(10 ** (-A / 10)), P: f4(P) },
        alt: { x20: v.Pin * 10 ** (-A / 20), ...opt(far(v.Pin * Math.exp(-A / 10), P), { ln: v.Pin * Math.exp(-A / 10) }), ...opt(far(v.Pin * Math.exp(-A), P), { np: v.Pin * Math.exp(-A) }) } };
    },
  },
  'link-budget': {
    gen: (r, T) => {
      for (;;) {
        const w = r.pick(T.pick.win), al = T.data.al[w], Ptx = r.v(T.v.Ptx), L = r.v(T.v.L), Nc = 2, Lc = 0.5, Ns = r.v(T.v.Ns), Ls = 0.1, S = r.pick(T.pick.S);
        const Prx = rnd(Ptx - al * L - Nc * Lc - Ns * Ls, 2), M = rnd(Prx - S, 2);
        if (Math.abs(Prx) < 3 || M < 2) continue;
        return { v: r.pick(['prx', 'margin']), w, al, Ptx, L, Nc, Lc, Ns, Ls, S };
      }
    },
    show: v => ({ w: fn(v.w), al: fd(v.al, 2), Ptx: fd(v.Ptx, 1), L: fn(v.L), Nc: fn(v.Nc), Lc: fd(v.Lc, 1), Ns: fn(v.Ns), Ls: fd(v.Ls, 1), S: fn(v.S) }),
    solve: v => {
      const Af = v.al * v.L, Ac = v.Nc * v.Lc, As = v.Ns * v.Ls, Prx = v.Ptx - Af - Ac - As, M = Prx - v.S;
      const k = { Af: fd(Af, 2), Ac: fd(Ac, 1), As: fd(As, 1), Prx: fd(Prx, 2), M: fd(M, 2) };
      if (v.v === 'prx') return { ans: Prx, fam: 'dbm', unit: 'dBm', k, alt: { noconn: v.Ptx - Af, ...opt(far(Prx + As, Prx), { nosp: Prx + As }), plus: v.Ptx + Af + Ac + As } };
      return { ans: M, fam: 'db', unit: 'dB', k, alt: { prx: Prx, noconn: v.Ptx - Af - v.S } };
    },
  },
  // ===== 受光と撮像 =====
  responsivity: {
    gen: (r, T) => {
      const det = r.pick(T.pick.det), lam = r.pick(T.data.lam[det]), eta = r.v(T.v.eta), q = r.pick(['r', 'ip', 'eta']);
      if (q === 'r') return { v: q, det, lam, eta };
      const P = r.v(T.v.P);
      return q === 'ip' ? { v: q, det, lam, eta, P } : { v: q, det, lam, P, I: sig(eta * P * lam / 1239.841984, 3) };
    },
    show: (v, T, X) => ({ det: nm(X, 'det', v.det), lam: fn(v.lam), ...(v.eta != null ? { eta: fd(v.eta, 2) } : {}), ...(v.P != null ? { P: fs(v.P, 2) } : {}), ...(v.I != null ? { I: fs(v.I, 3) } : {}),
      e: fsci(X.D.c.e, 4), h: fsci(X.D.c.h, 4), c: fsci(X.D.c.c, 4) }),
    solve: (v, X) => {
      const { e, h, c } = X.D.c, r1 = e * v.lam * 1e-9 / (h * c), tool = { id: 'photon', q: { nm: v.lam, ...(v.P != null ? { mw: v.P / 1000 } : {}) } };
      if (v.v === 'eta') { const eta = v.I / (v.P * r1); return { ans: eta * 100, fam: 'frac', unit: '%', k: { r1: f4(r1), Ri: f4(v.I / v.P), eta: f4(eta * 100) }, alt: { inv: 100 / eta, ...opt(far(v.I / v.P, eta), { r: 100 * v.I / v.P }) }, tool }; }
      const R = v.eta * r1;
      if (v.v === 'r') return { ans: R, fam: 'resp', unit: 'A/W', k: { r1: f4(r1), R: f4(R) }, alt: { noeta: r1, ...opt(far(1 / R, R), { inv: 1 / R }) }, tool };
      const I = R * v.P;
      return { ans: I, fam: 'cur', unit: 'µA', k: { r1: f4(r1), R: f4(R), I: f4(I) }, alt: { noeta: r1 * v.P, ...opt(far(v.P / R, I), { inv: v.P / R }) }, tool };
    },
  },
  'shot-noise': {
    // 暗電流は実際のフォトダイオードの範囲(Si・InGaAs・Ge でおよそ 0.5〜50 nA)。弱い光では光電流と同じくらいになる
    gen: (r, T) => ({ Ip: r.v(T.v.Ip), Id: r.v(T.v.Id), bw: r.pick(T.pick.bw) }),
    show: (v, T, X) => ({ Ip: fs(v.Ip, 2), Id: fs(v.Id, 2), bw: fn(v.bw), e: fsci(X.D.c.e, 4) }),
    solve: (v, X) => {
      const I = v.Ip * 1e-6 + v.Id * 1e-9, s2 = 2 * X.D.c.e * I * v.bw * 1e6, i = Math.sqrt(s2) * 1e9;
      return { ans: i, fam: 'cur', unit: 'nA', k: { I: fsci(I, 4), bwh: fsci(v.bw * 1e6, 3), s2: fsci(s2, 4), i: f4(i) },
        alt: { no2: i / Math.SQRT2, ...opt(far(Math.sqrt(2 * X.D.c.e * v.Ip * 1e-6 * v.bw * 1e6) * 1e9, i), { nodark: Math.sqrt(2 * X.D.c.e * v.Ip * 1e-6 * v.bw * 1e6) * 1e9 }) } };
    },
  },
  // ===== 非線形光学と超短パルス =====
  'shg-coherence': {
    gen: (r, T, X) => { const lam = r.pick(Object.keys(X.D.ln).map(Number)); return { v: r.pick(['lc', 'qpm']), lam, n1: X.D.ln[lam][0], n2: X.D.ln[lam][1] }; },
    show: v => ({ lam: fn(v.lam), lam2: fn(v.lam / 2), n1: fd(v.n1, 4), n2: fd(v.n2, 4) }),
    solve: v => {
      const dn = v.n2 - v.n1, lc = v.lam / 1000 / (4 * dn), L = 2 * lc;
      const k = { dn: fd(dn, 4), lc: f4(lc), L: f4(L) };
      if (v.v === 'lc') return { ans: lc, fam: 'len', unit: 'µm', k, alt: { qpm: L, nofour: 4 * lc, sh: lc / 2 } };
      return { ans: L, fam: 'len', unit: 'µm', k, alt: { lc, nofour: 2 * L, sh: L / 2 } };
    },
  },
  tbp: {
    gen: (r, T) => {
      const sh = r.pick(['gauss', 'sech']), q = r.pick(['nu', 'lam', 'dt']), lam = r.pick(T.pick.lam);
      return q === 'dt' ? { v: q, sh, lam, dl: r.v(T.v.dl) } : { v: q, sh, lam, dt: r.v(T.v.dt) };
    },
    show: (v, T, X) => ({ sh: nm(X, 'sh', v.sh), K: fd(X.D.K[v.sh], 3), lam: fn(v.lam), c: fsci(X.D.c.c, 4), ...(v.dt != null ? { dt: fn(v.dt) } : { dl: fs(v.dl, 2) }) }),
    solve: (v, X) => {
      const K = X.D.K[v.sh], Ko = X.D.K[v.sh === 'gauss' ? 'sech' : 'gauss'], c = X.D.c.c, l2 = (v.lam * 1e-9) ** 2;
      if (v.v === 'dt') {
        const nu = c * v.dl * 1e-9 / l2, dt = K / nu * 1e15;
        return { ans: dt, fam: 'time', unit: 'fs', k: { nu: f4(nu / 1e12), dt: f4(dt) }, alt: { shape: Ko / nu * 1e15, one: 1 / nu * 1e15 } };
      }
      const nu = K / (v.dt * 1e-15);
      if (v.v === 'nu') return { ans: nu / 1e12, fam: 'freq', unit: 'THz', k: { nu: f4(nu / 1e12) }, alt: { shape: Ko / (v.dt * 1e-15) / 1e12, one: 1 / (v.dt * 1e-15) / 1e12 } };
      const dl = l2 * nu / c * 1e9;
      return { ans: dl, fam: 'len', unit: 'nm', k: { nu: f4(nu / 1e12), dl: f4(dl) }, alt: { shape: l2 * Ko / (v.dt * 1e-15) / c * 1e9, one: l2 / (v.dt * 1e-15) / c * 1e9 } };
    },
  },
  'spdc-idler': {
    gen: (r, T) => {
      const lp = r.pick(T.pick.lp), ls = r.step(Math.ceil(1.3 * lp), Math.floor(1.9 * lp), 1);
      if (r.pick(['idler', 'pump']) === 'idler') return { v: 'idler', lp, ls };
      return { v: 'pump', ls, li: sig(lp * ls / (ls - lp), 4) };
    },
    show: v => ({ ls: fn(v.ls), ...(v.lp != null ? { lp: fn(v.lp) } : { li: fn(v.li) }) }),
    solve: v => {
      if (v.v === 'idler') {
        const x = 1 / v.lp - 1 / v.ls, li = 1 / x;
        return { ans: li, fam: 'len', unit: 'nm', k: { a: fsci(1 / v.lp, 4), b: fsci(1 / v.ls, 4), x: fsci(x, 4), li: f4(li) },
          alt: { diff: v.ls - v.lp, plus: 1 / (1 / v.lp + 1 / v.ls), ...opt(far(2 * v.lp, li), { deg: 2 * v.lp }) } };
      }
      const x = 1 / v.ls + 1 / v.li, lp = 1 / x;
      return { ans: lp, fam: 'len', unit: 'nm', k: { a: fsci(1 / v.ls, 4), b: fsci(1 / v.li, 4), x: fsci(x, 4), lp: f4(lp) },
        alt: { minus: 1 / Math.abs(1 / v.ls - 1 / v.li), ...opt(far((v.ls + v.li) / 4, lp), { avg: (v.ls + v.li) / 4 }) } };
    },
  },
  // ===== 放射・測光・色彩 =====
  wien: {
    gen: (r, T) => {
      const q = r.pick(['lam', 'tc', 'temp']);
      if (q === 'lam') return { v: q, T: r.v(T.v.T) };
      if (q === 'tc') return { v: q, tc: r.v(T.v.tc) };
      return { v: q, lm: r.v(T.v.lm) };
    },
    show: (v, T, X) => ({ b: fsci(X.D.c.b, 4), ...(v.T != null ? { T: fn(v.T) } : {}), ...(v.tc != null ? { tc: fn(v.tc) } : {}), ...(v.lm != null ? { lm: fs(v.lm, 3) } : {}) }),
    solve: (v, X) => {
      const b = X.D.c.b, nuf = X.D.c.c / (X.D.c.bnu * b); // 周波数のピーク(c/(b′T))と波長のピーク(b/T)の比
      if (v.v === 'temp') { const T = b / (v.lm * 1e-6); return { ans: T, fam: 'temp', unit: 'K', k: { T: f4(T) }, alt: { nupeak: T * nuf } }; }
      const TK = v.v === 'tc' ? v.tc + 273.15 : v.T, lm = b / TK * 1e6;
      return { ans: lm, fam: 'len', unit: 'µm', k: { TK: v.v === 'tc' ? fd(TK, 2) : fn(TK), lm: f4(lm) }, alt: { nupeak: lm * nuf, ...opt(v.v === 'tc', { celsius: b / v.tc * 1e6 }) } };
    },
  },
  illuminance: {
    gen: (r, T) => { const q = r.pick(['n', 'tilt']); return { v: q, I: r.v(T.v.I), d: r.v(T.v.d), th: q === 'tilt' ? r.v(T.v.th) : 0 }; },
    show: v => ({ I: fn(v.I), d: fd(v.d, 1), th: fn(v.th) }),
    solve: v => {
      const c = cosd(v.th), E = v.I * c / v.d ** 2;
      return { ans: E, fam: 'lx', unit: 'lx', k: { d2: f4(v.d ** 2), c: f4(c), E: f4(E) },
        alt: { ...opt(far(v.I * c / v.d, E), { nosq: v.I * c / v.d }), ...opt(v.th > 0, { nocos: v.I / v.d ** 2, ...opt(far(v.I * sind(v.th) / v.d ** 2, E), { sin: v.I * sind(v.th) / v.d ** 2 }) }) } };
    },
  },
  // ===== 光子・量子光学・太陽電池 =====
  'photon-energy': {
    gen: (r, T) => {
      const q = r.pick(['ev', 'thz', 'kayser', 'gap']);
      return q === 'gap' ? { v: q, m: r.pick(T.pick.gap) } : { v: q, lam: r.pick(T.pick.lam) };
    },
    show: (v, T, X) => (v.v === 'gap' ? { m: nm(X, 'gap', v.m), Eg: fd(X.D.gap[v.m], 2), hc: fd(X.D.c.hcev, 2) } : { lam: fn(v.lam), hc: fd(X.D.c.hcev, 2), c: fsci(X.D.c.c, 4) }),
    solve: (v, X) => {
      const hc = X.D.c.hcev;
      if (v.v === 'gap') { const E = X.D.gap[v.m], l = hc / E; return { ans: l, fam: 'len', unit: 'nm', k: { l: f4(l), um: f4(l / 1000) }, alt: { mult: E * hc }, tool: { id: 'photon', q: { nm: sig(l, 5) } } }; }
      const tool = { id: 'photon', q: { nm: v.lam } };
      if (v.v === 'ev') { const E = hc / v.lam; return { ans: E, fam: 'energy', unit: 'eV', k: { E: f4(E), J: fsci(E * X.D.c.e, 4) }, alt: { inv: v.lam / hc }, tool }; }
      if (v.v === 'thz') { const nu = X.D.c.c / (v.lam * 1e-9) / 1e12; return { ans: nu, fam: 'freq', unit: 'THz', k: { nu: f4(nu) }, alt: { pi2: 2 * Math.PI * nu }, tool }; }
      const s = 1e7 / v.lam;
      return { ans: s, fam: 'inv', unit: 'cm⁻¹', k: { lc: fsci(v.lam * 1e-7, 4), s: f4(s) }, alt: { pi2: 2 * Math.PI * s }, tool };
    },
  },
  'photon-flux': {
    gen: (r, T) => {
      const lam = r.pick(T.pick.lam), pu = r.pick(T.pick.pu);
      if (r.pick(['n', 'p']) === 'n') return { v: 'n', lam, pu, P: r.v(T.v.P) };
      return { v: 'p', lam, phi: sig(10 ** (r.f() * 9 + 9), 2) };
    },
    show: (v, T, X) => ({ lam: fn(v.lam), h: fsci(X.D.c.h, 4), c: fsci(X.D.c.c, 4), ...(v.P != null ? { P: fs(v.P, 2), pu: v.pu } : { phi: fsci(v.phi, 2) }) }),
    solve: (v, X) => {
      const { h, c, e } = X.D.c, E = h * c / (v.lam * 1e-9), Eev = E / e;
      if (v.v === 'n') {
        const PW = v.P * { mW: 1e-3, 'µW': 1e-6, nW: 1e-9 }[v.pu], n = PW / E;
        return { ans: n, fam: 'rate', unit: 's⁻¹', k: { E: fsci(E, 4), PW: fsci(PW, 2), n: fsci(n, 4) }, alt: { ev: PW / Eev }, tool: { id: 'photon', q: { nm: v.lam, mw: PW * 1e3 } } };
      }
      const P = v.phi * E, u = P >= 1e-3 ? 'mW' : P >= 1e-6 ? 'µW' : 'nW', f = { mW: 1e3, 'µW': 1e6, nW: 1e9 }[u];
      return { ans: P * f, fam: 'pow', unit: u, k: { E: fsci(E, 4), PW: fsci(P, 4) }, alt: { ev: v.phi * Eev * f }, tool: { id: 'photon', q: { nm: v.lam, mw: sig(P * 1e3, 4) } } };
    },
  },
  'solar-ff': {
    gen: (r, T, X) => {
      const cell = r.pick(Object.keys(X.D.cell)), C = X.D.cell[cell], Voc = r.step(...C.voc), Jsc = r.step(...C.jsc);
      if (r.pick(['eta', 'ff']) === 'eta') return { v: 'eta', cell, Voc, Jsc, FF: r.step(...C.ff) };
      return { v: 'ff', cell, Voc, Jsc, Vmp: rnd(Voc * r.sig(0.80, 0.88, 3), 3), Jmp: rnd(Jsc * r.sig(0.88, 0.96, 3), 1) };
    },
    show: (v, T, X) => ({ cell: nm(X, 'cell', v.cell), Voc: fd(v.Voc, 2), Jsc: fd(v.Jsc, 1), ...(v.FF != null ? { FF: fd(v.FF, 2) } : { Vmp: fd(v.Vmp, 3), Jmp: fd(v.Jmp, 1) }) }),
    solve: v => {
      if (v.v === 'eta') { const P = v.FF * v.Voc * v.Jsc * 10, eta = P / 1000; return { ans: eta * 100, fam: 'frac', unit: '%', k: { J: fd(v.Jsc * 10, 0), P: f4(P), eta: f4(eta * 100) }, alt: { noff: v.Voc * v.Jsc } }; }
      const pm = v.Vmp * v.Jmp, p0 = v.Voc * v.Jsc, ff = pm / p0;
      return { ans: ff, fam: 'frac', unit: '', k: { pm: f4(pm), p0: f4(p0), ff: f4(ff), eta: f4(pm * 10 / 1000 * 100) },
        alt: { inv: 1 / ff, ...opt(far(v.Vmp / v.Voc, ff), { v: v.Vmp / v.Voc }), ...opt(far(v.Jmp / v.Jsc, ff), { j: v.Jmp / v.Jsc }) } };
    },
  },
};

// ---- 問題を作る: 型のデータ T(data/drill.json の1件)、種 seed → { vals, show, sol } ----
export function makeProblem(T, seed, X) {
  const def = TYPES[T.id];
  const r = makeRng(seed, T.id);
  const vals = def.gen(r, T, X);
  const auto = {};
  for (const [k, spec] of Object.entries(T.v ?? {})) if (typeof vals[k] === 'number') auto[k] = showSpec(vals[k], spec);
  const show = { ...auto, ...(def.show ? def.show(vals, T, X) : {}) };
  const sol = def.solve(vals, X);
  return { vals, show, sol };
}
// 文章の場合分け: 文字ならそのまま、{ 場合: 文 } なら vals.v(なければその頭「hypo-pro」→「hypo」、それもなければ「_」)
export const pickText = (x, v) => (typeof x === 'string' || Array.isArray(x) || x == null ? x : x[v] ?? x[String(v).split('-')[0]] ?? x[String(v).split('-').at(-1)] ?? x._);
// 許容差(場合ごとに tolv で変えられる)
export const tolOf = (T, v) => T.tolv?.[v] ?? T.tol;
export const fillText = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

// ---- 判定 ----
// 値 x(単位 u)を、答え(sol.unit)と比べる。tol は相対の許容差(0.01 = ±1 %)
// 戻り値: { ok, err(相対のずれ)、hint: 間違いのID か 一般の指摘 { kind, ... } }
export function judge(sol, x, u, tol) {
  const fam = sol.fam;
  const y = convert(fam, x, u, sol.unit);
  // 温度は絶対温度で比べる(℃の 0 は物理的な基準ではないので)
  const abs = fam === 'temp' ? z => convert(fam, z, sol.unit, 'K') : z => z;
  const near = (a, b, t = tol) => Math.abs(abs(a) - abs(b)) <= t * Math.abs(abs(b)) + 1e-300;
  const err = sol.ans === 0 ? Math.abs(y) : (abs(y) - abs(sol.ans)) / Math.abs(abs(sol.ans));
  if (near(y, sol.ans)) return { ok: true, err, y };
  // その型によくある間違い
  const hits = Object.entries(sol.alt ?? {}).filter(([, a]) => Number.isFinite(a) && near(y, a, Math.max(tol, 0.005))).map(([id]) => id);
  if (hits.length) return { ok: false, err, y, hint: { kind: 'alt', id: hits[0], ids: hits } };
  // 符号
  if (near(-y, sol.ans)) return { ok: false, err, y, hint: { kind: 'sign' } };
  // 入れた数値が、同じ家族の別の単位で表した答えと同じ(単位の取り違え)
  if (fam !== 'temp') {
    for (const w of Object.keys(UNITS[fam])) {
      if (w === u) continue;
      if (near(x, convert(fam, sol.ans, sol.unit, w))) return { ok: false, err, y, hint: { kind: 'unit', u: w } };
    }
  } else if (Math.abs(x - convert(fam, sol.ans, sol.unit, u === 'K' ? '°C' : 'K')) <= tol * convert(fam, sol.ans, sol.unit, 'K')) return { ok: false, err, y, hint: { kind: 'unit', u: u === 'K' ? '°C' : 'K' } };
  // 10 の累乗だけずれている
  if (fam !== 'temp' && y / sol.ans > 0) {
    const p = Math.log10(y / sol.ans), n = Math.round(p);
    if (n && Math.abs(p - n) <= Math.log10(1 + tol)) return { ok: false, err, y, hint: { kind: 'pow', n } };
  }
  if (Math.abs(err) <= 0.05) return { ok: false, err, y, hint: { kind: 'close' } };
  return { ok: false, err, y };
}

// ======================================================================
// ---- ここから画面 ----
const app = typeof document !== 'undefined' ? document.getElementById('dr-app') : null;
const dataEl = typeof document !== 'undefined' ? document.getElementById('dr-data') : null;
if (app && dataEl) ui(JSON.parse(dataEl.textContent));

function ui(D) {
  const S = D.t;
  const X = { D: D.data, N: D.names };
  const byId = Object.fromEntries(D.types.map(T => [T.id, T]));
  const groupName = Object.fromEntries(D.groups.map(g => [g.id, g.name]));
  const $ = s => app.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const fmtS = (k, v = {}) => fillText(S[k] ?? k, v);
  // ずれ(%)。1 % 未満は小数2桁(ごく小さいずれを 7.0×10⁻⁵ % のように出さない)
  const errTxt = e => { const a = Math.abs(e) * 100; return a < 0.005 ? fd(0, 2) : `${e >= 0 ? '+' : '−'}${a >= 1 ? fs(a, 2) : fd(a, 2)}`; };
  const ulabel = u => (u === '' ? S.drill_unit_none : D.unitLabels?.[u] ?? u);

  // ---- 記録(localStorage。使えなくても動く) ----
  // 同じオリジン(github.io)のほかのサイトの記録と混ざらないように、鍵にサイト名(store.js の NS と同じ 'optics')をつける
  const KEY = `optics:drill:${document.documentElement.dataset.base ?? '/'}:v1`;
  const load = () => { try { const d = JSON.parse(localStorage.getItem(KEY)); return d && typeof d === 'object' && d.t && typeof d.t === 'object' ? d : { t: {} }; } catch { return { t: {} }; } };
  let rec = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch {} };
  const note = (id, ok) => {
    const x = rec.t[id] ?? (rec.t[id] = { ok: 0, ng: 0 });
    if (ok) x.ok++; else x.ng++;
    x.last = ok ? 1 : 0;
    x.at = Date.now();
    save();
  };

  // ---- 選ぶところ ----
  const pick = $('#dr-pick');
  const selG = pick.elements.group, selT = pick.elements.type;
  const fillTypes = () => {
    const g = selG.value, cur = selT.value;
    selT.replaceChildren(new Option(S.drill_all_types, ''), ...D.types.filter(T => !g || T.group === g).map(T => new Option(T.name, T.id)));
    if ([...selT.options].some(o => o.value === cur)) selT.value = cur;
  };
  selG.addEventListener('change', fillTypes);

  // ---- 出題の状態 ----
  let set = null; // { list: [型ID…], i, results: [{ id, ok }] }
  let cur = null; // { T, seed, p, done }
  const card = $('#dr-card'), sum = $('#dr-sum');
  const qText = $('.dr-q'), meta = $('.dr-meta'), form = $('#dr-ans'), input = form.elements.ans, unitSel = form.elements.unit;
  const msg = $('.dr-msg'), res = $('.dr-res'), verdict = $('.dr-verdict'), hintEl = $('.dr-hint'), stepsEl = $('.dr-steps'), linksEl = $('.dr-links');
  const nextBtn = $('[data-next]'), againBtn = $('[data-again]'), shareBtn = $('[data-share]'), giveBtn = $('[data-give]');

  // まちがえた型を多めに(最後にまちがえた型は4倍、まちがえた回数が多いほど重く)
  const weight = id => { const x = rec.t[id]; if (!x) return 1; return 1 + (x.last === 0 ? 3 : 0) + Math.min(x.ng, 4) * 0.5 - Math.min(x.ok, 4) * 0.1; };
  const choose = (ids, n, weak) => {
    const out = [];
    let pool = [...ids];
    while (out.length < n) {
      if (!pool.length) pool = [...ids];
      const w = pool.map(id => (weak ? weight(id) : 1)), tot = w.reduce((a, b) => a + b, 0);
      let x = Math.random() * tot, i = 0;
      while (x > w[i] && i < pool.length - 1) x -= w[i++];
      // 型が少なくて同じ型をくり返すときも、続けて同じ型にはしない
      if (pool.length > 1 && pool[i] === out.at(-1)) continue;
      out.push(pool[i]);
      if (ids.length >= n) pool.splice(i, 1);
    }
    return out;
  };
  const newSeed = () => 1 + Math.floor(Math.random() * 99999);
  const setUrl = () => {
    const p = new URLSearchParams(location.search);
    for (const k of ['t', 's']) p.delete(k);
    if (cur) { p.set('t', cur.T.id); p.set('s', String(cur.seed)); }
    const q = p.toString();
    history.replaceState(null, '', `${location.pathname}${q ? `?${q}` : ''}${location.hash}`);
  };

  function show(id, seed) {
    const T = byId[id];
    let p;
    try { p = makeProblem(T, seed, X); } catch (e) { console.error(e); return; }
    cur = { T, seed, p, done: false };
    card.hidden = false;
    sum.hidden = true;
    meta.replaceChildren(
      ...(set ? [el('span', 'dr-count', fmtS('drill_n_of', { i: set.i + 1, n: set.list.length }))] : []),
      el('span', 'chip dr-chip', groupName[T.group]),
      el('strong', 'dr-name', T.name),
    );
    const vars = { ...p.show };
    qText.textContent = fillText(pickText(T.q, p.vals.v), vars);
    $('.dr-ask').textContent = fmtS('drill_answer_in', { tol: tolPct(tolOf(T, p.vals.v)), sig: T.sig });
    msg.hidden = true;
    unitSel.replaceChildren(...Object.keys(UNITS[p.sol.fam]).map(u => new Option(ulabel(u), u)));
    unitSel.value = p.sol.unit;
    unitSel.hidden = unitSel.options.length < 2;
    $('.dr-unit-one').textContent = unitSel.hidden ? ulabel(p.sol.unit) : '';
    input.value = '';
    input.disabled = false;
    form.querySelector('button[type=submit]').disabled = false;
    giveBtn.hidden = false;
    nextBtn.hidden = true;
    res.hidden = true;
    setUrl();
    try { input.focus({ preventScroll: true }); } catch {}
  }

  function answer(given) {
    if (!cur || cur.done) return;
    const { T, p } = cur, sol = p.sol;
    let x = null, u = unitSel.value, j = null;
    if (!given) {
      const a = parseAnswer(input.value, sol.fam);
      if (!a || a.bad) { msg.textContent = a ? fmtS('drill_bad_unit', { u: a.bad }) : S.drill_bad_input; msg.hidden = false; return; }
      msg.hidden = true;
      if (a.u) { u = a.u; unitSel.value = u; }
      x = a.v;
      j = judge(sol, x, u, tolOf(T, p.vals.v));
    }
    cur.done = true;
    input.disabled = true;
    form.querySelector('button[type=submit]').disabled = true;
    giveBtn.hidden = true;
    const ok = !!j?.ok;
    note(T.id, ok);
    if (set) set.results.push({ id: T.id, ok });
    // 判定
    const ansTxt = `${fs(sol.ans, T.sig)}${sol.unit ? `${usp()}${ulabel(sol.unit)}` : ''}`;
    verdict.className = `dr-verdict ${ok ? 'ok' : 'ng'}`;
    verdict.replaceChildren(el('span', 'dr-mark', ok ? S.drill_correct : given ? S.drill_shown : S.drill_incorrect),
      el('span', 'dr-ans-line', fmtS('drill_answer_is', { a: ansTxt })),
      ...(j ? [el('span', 'dr-you', fmtS('drill_you', { a: `${fs(x, 4)}${u ? `${usp()}${ulabel(u)}` : ''}`, e: errTxt(j.err) }))] : []));
    // 間違いの指摘
    const H = j?.hint;
    let hint = '';
    if (H?.kind === 'alt') {
      // 同じ値になる間違いが複数あるときは、文の違うものを並べる
      const texts = [...new Set((H.ids ?? [H.id]).map(id => fillText(T.mistakes[id] ?? '', { ...p.show, ...p.sol.k })).filter(Boolean))];
      hint = texts.length > 1 ? [S.drill_h_either, ...texts.map(t => `${bullet()}${t}`)].join('\n') : texts[0] ?? '';
    }
    else if (H?.kind === 'sign') hint = S.drill_h_sign;
    else if (H?.kind === 'unit') hint = fmtS('drill_h_unit', { u: ulabel(H.u), a: fs(convert(sol.fam, sol.ans, sol.unit, u), 4), uu: ulabel(u) });
    else if (H?.kind === 'pow') hint = fmtS('drill_h_pow', { n: (H.n > 0 ? '' : '−') + Math.abs(H.n) });
    else if (H?.kind === 'close') hint = fmtS('drill_h_close', { tol: tolPct(tolOf(T, p.vals.v)) });
    hintEl.textContent = hint;
    hintEl.hidden = !hint;
    // 途中式
    const vars = { ...p.show, ...p.sol.k };
    const steps = pickText(T.steps, p.vals.v) ?? [];
    const ol = el('ol');
    for (const s of steps) ol.append(el('li', null, fillText(s, vars)));
    stepsEl.replaceChildren(el('h3', null, S.drill_steps), ol);
    stepsEl.hidden = false;
    // リンク(計算ツールを同じ数値で、用語、やさしい解説)
    linksEl.replaceChildren();
    if (sol.tool && T.tools?.[sol.tool.id]) {
      const t = T.tools[sol.tool.id];
      const q = new URLSearchParams(Object.entries(sol.tool.q).map(([k, v]) => [k, String(v)]));
      const a = el('a', 'btn btn-ghost btn-small', t.n);
      a.href = `${t.u}?${q}`;
      linksEl.append(el('p', 'dr-tool', S.drill_tool_lead), a);
    }
    if (T.terms?.length || T.learn?.length) {
      const p2 = el('p', 'term-chips');
      p2.append(el('span', 'muted', `${S.drill_related}${colon()}`));
      for (const x of [...(T.learn ?? []), ...(T.terms ?? [])]) { const a = el('a', 'chip', x.n); a.href = x.u; p2.append(a, ' '); }
      linksEl.append(p2);
    }
    if (T.fml?.length) {
      const p3 = el('p', 'term-chips');
      p3.append(el('span', 'muted', `${S.nav_formulas}${colon()}`));
      for (const x of T.fml) { const a = el('a', 'chip', x.n); a.href = x.u; p3.append(a, ' '); }
      linksEl.append(p3);
    }
    linksEl.hidden = !linksEl.childNodes.length;
    res.hidden = false;
    nextBtn.textContent = set && set.i + 1 >= set.list.length ? S.drill_to_summary : S.drill_next;
    nextBtn.hidden = false;
    renderRec();
    try { res.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch {}
  }

  function next() {
    if (set) {
      set.i++;
      if (set.i >= set.list.length) return summary();
      return show(set.list[set.i], newSeed());
    }
    const ids = selected();
    show(choose(ids, 1, pick.elements.weak.checked)[0], newSeed());
  }
  const selected = () => (selT.value ? [selT.value] : D.types.filter(T => !selG.value || T.group === selG.value).map(T => T.id));

  function summary() {
    card.hidden = true;
    sum.hidden = false;
    const n = set.results.length, ok = set.results.filter(x => x.ok).length;
    $('.dr-score').textContent = fmtS('drill_score', { ok, n });
    const miss = [...new Set(set.results.filter(x => !x.ok).map(x => x.id))];
    const ul = $('.dr-miss');
    ul.replaceChildren(...miss.map(id => {
      const li = el('li');
      const b = el('button', 'btn btn-ghost btn-small', fmtS('drill_retry_type', { name: byId[id].name }));
      b.type = 'button';
      b.addEventListener('click', () => { set = null; selG.value = byId[id].group; fillTypes(); selT.value = id; show(id, newSeed()); });
      li.append(b);
      return li;
    }));
    $('.dr-miss-h').hidden = !miss.length;
    cur = null;
    setUrl();
    set.done = true;
    try { sum.scrollIntoView({ block: 'nearest' }); } catch {}
  }

  function start() {
    const n = Number(pick.elements.n.value);
    const ids = selected();
    if (n > 1) {
      set = { list: choose(ids, n, pick.elements.weak.checked), i: 0, results: [] };
      show(set.list[0], newSeed());
    } else {
      set = null;
      show(choose(ids, 1, pick.elements.weak.checked)[0], newSeed());
    }
    try { card.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch {}
  }

  // ---- 記録の表示 ----
  function renderRec() {
    const box = $('.dr-rec-body');
    const rows = D.groups.map(g => {
      const ids = D.types.filter(T => T.group === g.id).map(T => T.id);
      const ok = ids.reduce((s, id) => s + (rec.t[id]?.ok ?? 0), 0), ng = ids.reduce((s, id) => s + (rec.t[id]?.ng ?? 0), 0);
      return { g, ok, ng, weak: ids.filter(id => rec.t[id]?.last === 0) };
    });
    const any = rows.some(r => r.ok + r.ng);
    box.replaceChildren();
    if (!any) { box.append(el('p', 'muted', S.drill_rec_empty)); $('[data-clear]').hidden = true; return; }
    $('[data-clear]').hidden = false;
    const table = el('table', 'dr-rec-table');
    const tr = el('tr');
    for (const h of [S.drill_rec_group, S.drill_rec_done, S.drill_rec_rate]) tr.append(el('th', null, h));
    table.append(el('thead'));
    table.tHead.append(tr);
    const tb = el('tbody');
    for (const r of rows) {
      if (!(r.ok + r.ng)) continue;
      const row = el('tr');
      row.append(el('th', null, r.g.name), el('td', null, String(r.ok + r.ng)), el('td', null, `${Math.round(r.ok / (r.ok + r.ng) * 100)} %`));
      tb.append(row);
    }
    table.append(tb);
    box.append(table);
    const weak = rows.flatMap(r => r.weak);
    if (weak.length) {
      const p = el('p', 'dr-weak');
      p.append(el('span', 'muted', `${S.drill_rec_weak}${colon()}`));
      for (const id of weak) {
        const b = el('button', 'chip', byId[id].name);
        b.type = 'button';
        b.addEventListener('click', () => { set = null; selG.value = byId[id].group; fillTypes(); selT.value = id; show(id, newSeed()); try { card.scrollIntoView({ block: 'start' }); } catch {} });
        p.append(b, ' ');
      }
      box.append(p);
    }
  }

  // ---- つなぐ ----
  pick.addEventListener('submit', e => { e.preventDefault(); start(); });
  form.addEventListener('submit', e => { e.preventDefault(); answer(false); });
  giveBtn.addEventListener('click', () => answer(true));
  nextBtn.addEventListener('click', next);
  againBtn.addEventListener('click', () => { if (!cur) return; const id = cur.T.id; if (set) set = null; show(id, newSeed()); });
  shareBtn.addEventListener('click', async () => {
    if (!cur) return;
    const url = `${location.origin}${location.pathname}?t=${encodeURIComponent(cur.T.id)}&s=${cur.seed}`;
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch {}
    if (!ok) { try { const ta = el('textarea'); ta.value = url; document.body.append(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch {} }
    const old = shareBtn.textContent;
    shareBtn.textContent = ok ? shareBtn.dataset.done : url;
    setTimeout(() => { shareBtn.textContent = old; }, 2000);
  });
  $('[data-sum-again]').addEventListener('click', start);
  $('[data-clear]').addEventListener('click', () => { if (!confirm(S.drill_rec_clear_q)) return; rec = { t: {} }; save(); renderRec(); });
  // 静的な一覧の「この型を解く」(JS があるときは、ページを読み直さずに出す)
  document.addEventListener('click', e => {
    const a = e.target.closest?.('a[data-drill-type]');
    if (!a) return;
    e.preventDefault();
    const id = a.dataset.drillType;
    set = null;
    selG.value = byId[id].group;
    fillTypes();
    selT.value = id;
    show(id, newSeed());
    try { card.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch {}
  });

  app.hidden = false;
  fillTypes();
  renderRec();
  // URL の ?t=型&s=種(s がなければ種を新しく)。?g=分野 で分野を選んでおく
  const params = new URLSearchParams(location.search);
  const g0 = params.get('g');
  if (g0 && groupName[g0]) { selG.value = g0; fillTypes(); }
  const t0 = params.get('t');
  if (t0 && byId[t0]) {
    selG.value = byId[t0].group;
    fillTypes();
    selT.value = t0;
    const s0 = Number(params.get('s'));
    show(t0, Number.isInteger(s0) && s0 > 0 ? s0 : newSeed());
  }
}

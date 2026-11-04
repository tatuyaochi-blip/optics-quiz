// 屈折率データ集(/refractive-index/)。材料のカード(式・係数・範囲・出典・n_d と ν_d)は build.js が data/rindex.json から作ってページに書く(JavaScript がなくても読める)。
// このファイルは、計算(n・群屈折率・dn/dλ・GVD・分散パラメータ D・反射率・ブリュースター角・アッベ数)と、
// 画面の動き(材料の検索と選択、波長の入力、グラフ、並べ比べの表、CSV、共有の URL、計算ツールへのリンク)。
// 計算の関数は build.js と検算のスクリプトからも読む(document がないときは画面の部分を動かさない)。
//
// 式の形(data/rindex.json の各データセット ds。λ は µm):
//   ds.t:   n² = ds.a + Σ B·λ^p/(λ² − C)   ([B, p, C] の並び。p は 0 か 2)
//   ds.gas: n = 1 + Σ K/(k − λ⁻²)          ([K, k] の並び。Ciddor の標準空気)
// 導関数は解析的に出す(数値微分はしない)。f = n² のとき n′ = f′/(2n)、n″ = (f″ − 2n′²)/(2n)

export const C0 = 299792458; // 真空中の光速 (m/s)
// フラウンホーファー線などの波長(µm)。d: He 587.5618 nm、F: H 486.1327 nm、C: H 656.2725 nm、e: Hg 546.0740 nm、F′: Cd 479.9914 nm、C′: Cd 643.8469 nm
export const LINES = { d: 0.5875618, F: 0.4861327, C: 0.6562725, e: 0.5460740, Fp: 0.4799914, Cp: 0.6438469 };

// 範囲の判定(端の丸めの誤差は含める)
export const inRange = (ds, l) => l >= ds.range[0] * (1 - 1e-12) && l <= ds.range[1] * (1 + 1e-12);

// n と dn/dλ (µm⁻¹)・d²n/dλ² (µm⁻²)。範囲外でも計算はする(呼ぶ側が inRange で止める)
export function nAt(ds, l) {
  if (ds.gas) {
    let n = 1, d1 = 0, d2 = 0;
    const s = l ** -2, s1 = -2 * l ** -3, s2 = 6 * l ** -4;
    for (const [K, k] of ds.gas) {
      const u = k - s;
      n += K / u;
      d1 += K * s1 / u ** 2;
      d2 += 2 * K * s1 * s1 / u ** 3 + K * s2 / u ** 2;
    }
    return { n, d1, d2 };
  }
  let f = ds.a, f1 = 0, f2 = 0;
  const L = l * l;
  for (const [B, p, C] of ds.t) {
    const u = L - C;
    if (p === 2) { // λ²/u
      f += B * L / u;
      f1 += B * (-2 * C * l) / u ** 2;
      f2 += B * (-2 * C / u ** 2 + 8 * C * L / u ** 3);
    } else if (p === 0) { // 1/u
      f += B / u;
      f1 += B * (-2 * l) / u ** 2;
      f2 += B * (-2 / u ** 2 + 8 * L / u ** 3);
    } else throw new Error(`p = ${p} の項は扱わない`);
  }
  const n = Math.sqrt(f), d1 = f1 / (2 * n), d2 = (f2 - 2 * d1 * d1) / (2 * n);
  return { n, d1, d2 };
}

// ある波長での値。gvd: 群速度分散 β₂ (fs²/mm)、D: 分散パラメータ (ps/(nm·km))、R: 空気(n = 1)との界面の垂直入射の反射率、brewster: 空気から入るときのブリュースター角(度)
export function props(ds, l) {
  const { n, d1, d2 } = nAt(ds, l);
  const lm = l * 1e-6, d2m = d2 * 1e12; // m と m⁻²
  return {
    n, d1,
    ng: n - l * d1,
    gvd: lm ** 3 / (2 * Math.PI * C0 * C0) * d2m * 1e27,
    D: -(lm / C0) * d2m * 1e6,
    R: ((n - 1) / (n + 1)) ** 2,
    brewster: Math.atan(n) * 180 / Math.PI,
  };
}

// アッベ数。式の範囲が F′〜C′(e 線用)・F〜C(d 線用)を含むときだけ
export function abbe(ds) {
  const n = l => nAt(ds, l).n;
  const ok = (...ls) => ls.every(l => inRange(ds, l));
  const r = {};
  if (ok(LINES.F, LINES.d, LINES.C)) { r.nd = n(LINES.d); r.vd = (r.nd - 1) / (n(LINES.F) - n(LINES.C)); }
  if (ok(LINES.Fp, LINES.e, LINES.Cp)) { r.ne = n(LINES.e); r.ve = (r.ne - 1) / (n(LINES.Fp) - n(LINES.Cp)); }
  return r;
}

// CSV の1行(数は言語によらず小数点「.」。引用符で囲む)
const csvCell = v => (typeof v === 'number' ? String(v) : `"${String(v).replace(/"/g, '""')}"`);
export const CSV_HEAD = ['material', 'ray', 'wavelength_nm', 'wavelength_um', 'n', 'group_index', 'dn_dlambda_per_um', 'gvd_fs2_per_mm', 'D_ps_per_nm_km', 'source'];
// 波長の表。a・b・step は nm。範囲外の行は入れない。行が多すぎるときは null
export function csvRows(list, a, b, step, max = 5000) {
  if (!(step > 0) || !(b >= a)) return [];
  const k = Math.floor((b - a) / step + 1e-9) + 1;
  if (k * list.length > max) return null;
  const rows = [];
  for (const { name, ds, src } of list) {
    for (let i = 0; i < k; i++) {
      const nm = +(a + i * step).toPrecision(12), l = nm / 1000;
      if (!inRange(ds, l)) continue;
      const p = props(ds, l);
      rows.push([name, ds.ax || '', nm, +l.toPrecision(12), +p.n.toFixed(7), +p.ng.toFixed(7), +p.d1.toPrecision(7), +p.gvd.toPrecision(6), +p.D.toPrecision(6), src]);
    }
  }
  return rows;
}
export const csvText = rows => [CSV_HEAD, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

// ---- 画面 ----
if (typeof document !== 'undefined') {
  const app = document.getElementById('ri-app');
  if (app) init(app);
}

async function init(app) {
  const { parseNum, inVal, num } = await import('./eng.js');
  const { lineChart } = await import('./chart.js');
  const D = JSON.parse(document.getElementById('ri-data').textContent);
  const T = D.ui;
  const t = (k, v = {}) => (T[k] ?? k).replace(/\{(\w+)\}/g, (m, x) => (x in v ? v[x] : m));
  const lang = document.documentElement.lang || 'en';
  const de = /^(de|es|pt|fr|nl)/.test(lang);
  const MAX = 4;
  const mats = D.materials;
  const byId = new Map(mats.map(m => [m.id, m]));
  const $ = s => app.querySelector(s);
  const list = document.getElementById('ri-list');
  const cards = [...list.querySelectorAll('.ri-card')];
  const keyOf = new Map(cards.map(c => [c, norm(c.dataset.k || '')]));
  const q = document.getElementById('ri-q');
  const chips = [...document.querySelectorAll('.ri-chips [data-g]')];
  const none = document.querySelector('.ri-none');
  const count = document.querySelector('.ri-count');
  const add = $('#ri-add');
  const lamIn = $('#ri-lam'), unitIn = $('#ri-unit');
  const aIn = $('#ri-a'), bIn = $('#ri-b'), sIn = $('#ri-s');
  const msg = $('.ri-msg');
  let group = '';

  // 小数の表示(言語の小数点。負の数はマイナス記号)
  const fix = (x, k) => (Number.isFinite(x) ? x.toLocaleString(lang, { minimumFractionDigits: k, maximumFractionDigits: k, useGrouping: false }).replace(/^-/, '−') : '–');
  const sig = (x, k = 4) => num(x, k);
  const unit = () => unitIn.value; // 'nm' か 'um'
  const toUm = v => (unit() === 'nm' ? v / 1000 : v);
  const fromNm = nm => (unit() === 'nm' ? nm : nm / 1000);
  const lamText = l => (unit() === 'nm' ? `${sig(l * 1000, 6)} nm` : `${sig(l, 6)} µm`);
  const rangeText = r => (unit() === 'nm' ? `${sig(r[0] * 1000, 5)}–${sig(r[1] * 1000, 5)} nm` : `${sig(r[0], 5)}–${sig(r[1], 5)} µm`);
  const rayName = ax => (ax ? t(`ray_${ax}`) : '');
  const label = (m, ds) => (ds.ax ? `${m.name} (${rayName(ds.ax)})` : m.name);

  // ---- 状態: URL の ?m=id,id&l=波長&u=nm|um&a=開始&b=終了&s=刻み(a・b・s は nm)。なければ既定 ----
  const P = new URLSearchParams(location.search);
  let picked = (P.get('m') || D.defaults.m.join(',')).split(',').filter(id => byId.has(id)).filter((v, i, a) => a.indexOf(v) === i).slice(0, MAX);
  if (P.get('u') === 'um' || P.get('u') === 'nm') unitIn.value = P.get('u');
  const urlNum = (k, d) => { const v = parseNum(P.get(k) ?? ''); return Number.isFinite(v) && v > 0 ? v : d; };
  const lamNm0 = urlNum('l', D.defaults.l); // URL の波長は nm で持つ
  lamIn.value = inVal(+fromNm(lamNm0).toPrecision(10));
  aIn.value = inVal(urlNum('a', D.defaults.a));
  bIn.value = inVal(urlNum('b', D.defaults.b));
  sIn.value = inVal(urlNum('s', D.defaults.s));

  // 読めない入力には aria-invalid を立てて、前の値を使う
  const readPos = (el, fallback) => {
    const v = parseNum(el.value);
    const ok = Number.isFinite(v) && v > 0;
    el.setAttribute('aria-invalid', String(el.value.trim() !== '' && !ok));
    return ok ? v : fallback;
  };
  let lamUm = lamNm0 / 1000, A = urlNum('a', D.defaults.a), B = urlNum('b', D.defaults.b), S = urlNum('s', D.defaults.s);

  const syncUrl = () => {
    const u = new URL(location.href);
    u.searchParams.set('m', picked.join(','));
    u.searchParams.set('l', String(+(lamUm * 1000).toPrecision(10)));
    u.searchParams.set('u', unit());
    u.searchParams.set('a', String(A)); u.searchParams.set('b', String(B)); u.searchParams.set('s', String(S));
    const s = u.search.replace(/%2C/gi, ',');
    try { history.replaceState(history.state, '', u.pathname + s + u.hash); } catch {}
    document.querySelectorAll('.lang-switch a').forEach(a => { a.search = s; });
    return u.origin + u.pathname + s;
  };

  // ---- 材料のカードの検索と絞り込み ----
  function filter() {
    const words = norm(q.value) ? q.value.split(/[\s　]+/).map(norm).filter(Boolean) : [];
    let n = 0;
    for (const c of cards) {
      const show = (!group || c.dataset.g === group) && words.every(w => keyOf.get(c).includes(w));
      c.hidden = !show;
      if (show) n++;
    }
    for (const g of list.querySelectorAll('.ri-group')) g.hidden = !g.querySelector('.ri-card:not([hidden])');
    for (const c of chips) c.setAttribute('aria-pressed', String(c.dataset.g === group));
    count.textContent = t('count', { n, total: cards.length });
    none.hidden = n > 0;
  }

  const flash = text => { msg.textContent = text; msg.hidden = false; clearTimeout(flash.tm); flash.tm = setTimeout(() => { msg.hidden = true; }, 4000); };
  function toggle(id, on) {
    if (on && !picked.includes(id)) {
      if (picked.length >= MAX) { flash(t('max', { n: MAX })); render(); return; }
      picked.push(id);
    } else if (!on) picked = picked.filter(x => x !== id);
    render();
  }

  // ---- 表・グラフ・リンク ----
  const sel = () => picked.map(id => byId.get(id));
  const dsList = () => sel().flatMap(m => m.ds.map(ds => ({ m, ds })));
  const COLORS = ['ac', 'ac2', 'ng', 'dash'];
  function render() {
    const ms = sel();
    // 選んだ材料の札
    $('.ri-picked').replaceChildren(...ms.map((m, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `chip ri-pchip ri-c${i}`; b.dataset.rm = m.id;
      b.setAttribute('aria-label', t('remove', { name: m.name }));
      b.textContent = `${m.name} ×`;
      return b;
    }));
    $('.ri-empty').hidden = ms.length > 0;
    for (const c of cards) {
      const on = picked.includes(c.dataset.id);
      c.classList.toggle('is-picked', on);
      const box = c.querySelector('[data-pick]');
      if (box) box.checked = on;
    }
    [...add.options].forEach(o => { if (o.value) o.disabled = picked.includes(o.value); });
    add.value = '';
    $('.ri-at').textContent = t('at', { lam: lamText(lamUm) });
    // 並べ比べの表(同じ波長)
    const rows = dsList().map(({ m, ds }, k) => {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      const a = document.createElement('a');
      a.href = `#m-${m.id}`; a.textContent = label(m, ds);
      th.append(a);
      tr.append(th);
      if (!inRange(ds, lamUm)) {
        const td = document.createElement('td');
        td.colSpan = 7; td.className = 'ri-out';
        td.textContent = t('out', { range: rangeText(ds.range) });
        tr.append(td);
        return tr;
      }
      const p = props(ds, lamUm);
      for (const v of [fix(p.n, 5), fix(p.ng, 5), sig(p.d1, 4), sig(p.gvd, 4), sig(p.D, 4), `${fix(p.R * 100, 2)} %`, `${fix(p.brewster, 2)}°`]) {
        const td = document.createElement('td');
        td.textContent = v;
        tr.append(td);
      }
      tr.dataset.k = k;
      return tr;
    });
    $('#ri-table tbody').replaceChildren(...rows);
    $('.ri-table-wrap').hidden = !rows.length;
    const outs = dsList().filter(({ ds }) => !inRange(ds, lamUm));
    const warn = $('.ri-warn');
    warn.hidden = !outs.length;
    warn.textContent = outs.length ? t('out_warn', { list: [...new Set(outs.map(({ m }) => m.name))].join(', ') }) : '';
    // 計算ツールへのリンク(範囲内の材料だけ。その波長の n を入れた状態で開く)
    const tl = [];
    for (const { m, ds } of dsList()) {
      if (!inRange(ds, lamUm) || ds.ax === 'e') continue; // 複屈折の材料は常光線の値だけを渡す
      const n = +nAt(ds, lamUm).n.toFixed(5), nm = +(lamUm * 1000).toPrecision(8);
      for (const x of D.tools) {
        if (x.only && !x.only.includes(m.id)) continue;
        if (x.skip && x.skip.includes(m.g)) continue;
        const qs = Object.entries(x.q).map(([k, v]) => `${k}=${v === 'n' ? n : v === 'lam' ? nm : v}`).join('&');
        const a = document.createElement('a');
        a.href = `${x.url}?${qs}`; a.textContent = t(x.label, { name: label(m, ds), n: fix(n, 5) });
        a.dataset.tool = x.id;
        const li = document.createElement('li');
        li.append(a);
        tl.push(li);
      }
    }
    $('.ri-tools ul').replaceChildren(...tl);
    $('.ri-tools').hidden = !tl.length;
    chart();
    syncUrl();
  }

  function chart() {
    const svg = $('#ri-chart');
    const lo = A / 1000, hi = B / 1000;
    const series = [], legend = [];
    let i = 0;
    for (const { m, ds } of dsList()) {
      const a = Math.max(lo, ds.range[0]), b = Math.min(hi, ds.range[1]);
      const cls = COLORS[sel().indexOf(m) % COLORS.length];
      if (b > a) {
        const pts = [];
        for (let k = 0; k <= 160; k++) { const l = a + (b - a) * k / 160; pts.push([unit() === 'nm' ? l * 1000 : l, nAt(ds, l).n]); }
        series.push({ points: pts, cls, e: ds.ax === 'e' });
      }
      legend.push({ text: label(m, ds), cls, e: ds.ax === 'e', none: !(b > a) });
      i++;
    }
    const ys = series.flatMap(s => s.points.map(p => p[1]));
    const has = series.length > 0;
    $('.ri-chart-none').hidden = has;
    svg.hidden = !has;
    if (has) {
      const y0 = Math.min(...ys), y1 = Math.max(...ys), pad = Math.max((y1 - y0) * 0.08, 0.002);
      const marks = inRange(dsList()[0]?.ds ?? { range: [0, 0] }, lamUm) && lamUm >= lo && lamUm <= hi
        ? [[unit() === 'nm' ? lamUm * 1000 : lamUm, nAt(dsList()[0].ds, lamUm).n, lamText(lamUm)]] : [];
      lineChart(svg, { series, xlabel: unit() === 'nm' ? t('axis_x_nm') : t('axis_x_um'), ylabel: t('axis_y'), ymin: y0 - pad, marks });
      // 異常光線(e)の線は破線にする(chart.js の色は4つまでなので、色は材料ごと、線の形で o と e を分ける)
      const paths = [...svg.querySelectorAll('path')];
      series.forEach((s, k) => { if (s.e && paths[k]) paths[k].setAttribute('stroke-dasharray', '9 5'); });
    }
    svg.setAttribute('aria-label', t('chart_label', { list: legend.map(x => x.text).join(', ') }));
    $('.ri-legend').replaceChildren(...legend.map(x => {
      const li = document.createElement('li');
      li.className = `ri-lg ri-lg-${x.cls}${x.e ? ' ri-lg-e' : ''}`;
      li.textContent = x.none ? `${x.text} — ${t('chart_out')}` : x.text;
      return li;
    }));
  }

  // ---- CSV ----
  const csvList = () => dsList().map(({ m, ds }) => ({ name: m.name, ds, src: D.refs[ds.ref] }));
  function csv() {
    const rows = csvRows(csvList(), A, B, S);
    if (rows === null) { flash(t('csv_many')); return null; }
    if (!rows.length) { flash(t('csv_none')); return null; }
    return { text: csvText(rows), n: rows.length };
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.append(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    ta.remove();
    return ok;
  }
  $('[data-csv-copy]').addEventListener('click', async () => {
    const c = csv();
    if (c && await copy(c.text)) flash(t('csv_copied', { n: c.n }));
  });
  $('[data-csv-save]').addEventListener('click', () => {
    const c = csv();
    if (!c) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + c.text], { type: 'text/csv;charset=utf-8' }));
    a.download = `refractive-index_${picked.join('_')}_${A}-${B}nm.csv`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    flash(t('csv_saved', { n: c.n }));
  });
  $('[data-share]').addEventListener('click', async () => {
    const url = syncUrl();
    if (await copy(url)) flash(t('link_copied'));
    else { try { window.prompt('', url); } catch {} }
  });

  // ---- 入力 ----
  lamIn.addEventListener('input', () => { lamUm = toUm(readPos(lamIn, fromNm(lamUm * 1000))); render(); });
  unitIn.addEventListener('change', () => { lamIn.value = inVal(+fromNm(lamUm * 1000).toPrecision(10)); lamIn.setAttribute('aria-invalid', 'false'); render(); });
  for (const el of [aIn, bIn, sIn]) el.addEventListener('input', () => { A = readPos(aIn, A); B = readPos(bIn, B); S = readPos(sIn, S); if (B < A) bIn.setAttribute('aria-invalid', 'true'); chart(); syncUrl(); });
  app.querySelectorAll('[data-lam]').forEach(b => b.addEventListener('click', () => { lamUm = Number(b.dataset.lam) / 1000; lamIn.value = inVal(+fromNm(lamUm * 1000).toPrecision(10)); lamIn.setAttribute('aria-invalid', 'false'); render(); }));
  add.addEventListener('change', () => { if (add.value) toggle(add.value, true); });
  $('.ri-picked').addEventListener('click', e => { const id = e.target.closest('[data-rm]')?.dataset.rm; if (id) toggle(id, false); });
  list.addEventListener('change', e => { const id = e.target.dataset?.pick; if (id) toggle(id, e.target.checked); });
  q.addEventListener('input', filter);
  for (const c of chips) c.addEventListener('click', () => { group = c.dataset.g; filter(); });
  for (const f of app.querySelectorAll('form')) f.addEventListener('submit', e => e.preventDefault());

  list.classList.add('ri-js', 'fm-js');
  app.hidden = false;
  filter();
  render();
}

// 検索の文字をそろえる(全角・半角、下付き・上付きの数字、大文字・小文字、空白と記号の違い、ラテン文字のアクセントを消す)
export function norm(s) {
  return String(s).normalize('NFKC').toLowerCase()
    .replace(/[\u00c0-\u024f]/g, ch => ch.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
    .replace(/[\s_{}^·・,、。()()[\]「」:：/'’"\-‐–]/g, '');
}

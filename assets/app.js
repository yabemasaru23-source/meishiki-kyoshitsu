/* はじめての命式 ― 本当の自分を知る陰陽五行 — 学習サイト本体
 * 章の本文は content/chapters/*.md（Markdown）。```work ブロック（YAML）が入力欄になる。
 * 入力はブラウザの localStorage に自動保存し、JSON / Excel で書き出せる。
 */
(() => {
  'use strict';

  const KEY = 'meishiki-kyoshitsu-v1';
  const APP_URL = 'https://qmw.co.jp/meishiki/';
  const SITE = 'はじめての命式';
  const BASE = 'content/';
  const app = document.getElementById('app');

  /* ───────── 保存 ───────── */
  const blank = () => ({ a: {}, c: {}, meta: {} });
  let S = load();
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const d = JSON.parse(raw); return { a: d.a || {}, c: d.c || {}, meta: d.meta || {} }; }
    } catch (e) { /* 保存領域が使えない環境でも表示は続ける */ }
    return blank();
  }
  let saveTimer = null;
  function save() {
    S.meta.updated = new Date().toISOString();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('このブラウザでは保存できません。書き出し機能で保存してください'); }
    }, 250);
  }
  function setVal(id, v) { S.a[id] = v; save(); }

  /* ───────── 章の読み込み ───────── */
  let manifest = null;
  const chapters = {};      // id -> {meta, html, works}
  const registry = {};      // work id -> {w, chId}

  async function loadManifest() {
    if (manifest) return manifest;
    const r = await fetch(BASE + 'chapters.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('manifest');
    manifest = await r.json();
    return manifest;
  }

  async function loadChapter(id) {
    if (chapters[id]) return chapters[id];
    const info = manifest.chapters.find(c => c.id === id);
    if (!info || !info.file) return null;
    const r = await fetch(BASE + 'chapters/' + encodeURIComponent(info.file), { cache: 'no-cache' });
    if (!r.ok) return null;
    const ch = parseChapter(await r.text(), info);
    chapters[id] = ch;
    return ch;
  }

  async function loadAll() {
    await loadManifest();
    await Promise.all(manifest.chapters.filter(c => c.file).map(c => loadChapter(c.id).catch(() => null)));
  }

  function parseChapter(src, info) {
    src = src.replace(/\r\n/g, '\n');
    let meta = {};
    const fm = src.match(/^---\n([\s\S]*?)\n---\n/);
    if (fm) { try { meta = jsyaml.load(fm[1]) || {}; } catch (e) { meta = {}; } src = src.slice(fm[0].length); }
    const works = [];
    const body = src.replace(/```work\n([\s\S]*?)\n```/g, (_, y) => {
      let w;
      try { w = jsyaml.load(y) || {}; } catch (e) { w = { id: 'err' + works.length, type: 'error', label: 'ワークの設定を読み取れませんでした', raw: y }; }
      w.id = String(w.id || (info.id + '.w' + works.length));
      works.push(w);
      registry[w.id] = { w, chId: info.id };
      return `\n\n<div class="work-slot" data-w="${works.length - 1}"></div>\n\n`;
    });
    // 日本語のカギかっこに接した **太字** は Markdown の規則で太字にならないため、先に置きかえる（```の中は除く）
    const bolded = body.split(/(```[\s\S]*?```)/).map((part, i) => i % 2 ? part : part.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')).join('');
    const html = marked.parse(bolded, { gfm: true });
    return { meta: Object.assign({ title: info.title }, meta), info, html, works };
  }

  /* ───────── 値の取り出しと整形 ───────── */
  const isEmpty = v => v == null || (typeof v === 'string' && !v.trim()) ||
    (Array.isArray(v) && v.every(isEmpty)) ||
    (typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(isEmpty));

  // 章をまたいで参照するときの呼び名 → 実際の入力欄
  const ALIAS = {};
  const resolve = id => ALIAS[id] || id;
  const regOf = id => registry[resolve(id)];

  function getVal(id) {
    id = resolve(id);
    if (S.a[id] !== undefined) return S.a[id];
    const keys = Object.keys(S.a).filter(k => k.startsWith(id + '.') && !isEmpty(S.a[k]));
    if (!keys.length) return undefined;
    const o = {}; keys.forEach(k => { o[k] = S.a[k]; }); return o;
  }

  function fmtDate(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''));
    return m ? `${+m[1]}年${+m[2]}月${+m[3]}日` : v;
  }

  // 前の章の答えを「選択肢のリスト」として取り出す（チェックリスト・表の1列目・マップの作戦名）
  function optionsFrom(id) {
    const reg = regOf(id); const v = getVal(id);
    if (isEmpty(v)) return [];
    if (Array.isArray(v)) {
      if (v.every(x => typeof x === 'string')) return v.filter(Boolean);
      if (v.every(x => Array.isArray(x))) return v.map(r => r[0]).filter(Boolean);
      if (v.every(x => x && typeof x === 'object')) return v.map(o => Object.values(o)[0]).filter(Boolean);
    }
    if (v && v.cells) return mandalaRows(reg && reg.w, v).map(r => r[0]).filter(Boolean);
    return [];
  }
  // マップの8マスを [やること, ものさし] の行に
  function mandalaRows(w, v) {
    const tf = ((w && w.cell_fields) || [{ key: 'theme' }, { key: 'indicator' }]).filter(f => !f.from);
    return ((v && v.cells) || []).map(c => tf.map(f => (c && c[f.key]) || '')).filter(r => !isEmpty(r));
  }
  const colSpec = c => typeof c === 'object' ? Object.assign({ label: c.label || c.key }, c) : { label: String(c) };
  function formFields(w) { return (w.fields || []).map(f => typeof f === 'string' ? { key: f, label: f } : Object.assign({ key: f.key || f.id || f.label }, f)); }
  function formText(w, rec) {
    return formFields(w).map(f => {
      const x = rec && rec[f.key]; if (isEmpty(x)) return '';
      if (f.type === 'signature') return `${f.label}：${x.name || ''} ${fmtDate(x.date) || ''}`;
      if (Array.isArray(x) && x.every(r => Array.isArray(r))) return `${f.label}\n` + x.filter(r => !isEmpty(r)).map(r => '・' + r.filter(Boolean).join(' ／ ')).join('\n');
      if (Array.isArray(x)) return `${f.label}\n` + x.filter(Boolean).map(s => '・' + s).join('\n');
      return `${f.label}：${x}`;
    }).filter(Boolean).join('\n');
  }

  function toText(v, w) {
    if (isEmpty(v)) return '';
    if (w && w.type === 'quiz') { const q = quizScore(w, v); return `${q.correct}問正解 ／ ${q.count}問`; }
    if (w && w.type === 'form') return Array.isArray(v) ? v.map(r => formText(w, r)).join('\n\n') : formText(w, v);
    if (w && w.type === 'mandala' && v.cells) {
      const pf = (w.cell_fields || []).find(f => f.from);
      return v.cells.map((c, i) => [c, mandalaRows(w, { cells: [c] })[0], i]).filter(x => x[1])
        .map(([c, r]) => `${pf && c[pf.key] ? '【' + c[pf.key] + '】' : ''}${r[0]}${r[1] ? '：' + r[1] : ''}`).join('\n');
    }
    if (typeof v === 'number') return String(v);
    if (typeof v === 'string') return w && w.type === 'date' ? fmtDate(v) : v;
    if (typeof v === 'number') return String(v);
    if (Array.isArray(v)) {
      if (v.every(x => Array.isArray(x))) return v.filter(r => !isEmpty(r)).map(r => r.filter(Boolean).join(' ／ ')).join('\n');
      if (v.every(x => x && typeof x === 'object')) return v.map(o => Object.values(o).filter(x => !isEmpty(x)).map(x => toText(x)).join(' ／ ')).join('\n');
      return v.filter(Boolean).join('、');
    }
    if (typeof v === 'object') {
      if (w && w.type === 'scale') { const s = scaleScore(w, v); return `${s.total}点 ／ ${s.max}点`; }
      if (v.cells) return v.cells.filter(c => c && (c.theme || c.indicator)).map(c => `${c.perspective ? '【' + c.perspective + '】' : ''}${c.theme || ''}${c.indicator ? '：' + c.indicator : ''}`).join('\n');
      return Object.entries(v).filter(([, x]) => !isEmpty(x)).map(([k, x]) => {
        const reg = registry[k]; return (reg ? reg.w.label + '：' : '') + toText(x, reg && reg.w);
      }).join('\n');
    }
    return String(v);
  }

  function fillTemplate(t) {
    return t.replace(/\{([^}]+)\}/g, (_, id) => {
      const reg = regOf(id); const v = getVal(id);
      return isEmpty(v) ? '〇〇' : toText(v, reg && reg.w);
    });
  }

  /* ───────── 小さな部品 ───────── */
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
    return e;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let toastTimer;
  function toast(msg) {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const t = el('div', { class: 'toast', role: 'status' }, msg);
    document.body.append(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 2600);
  }
  function autosize(ta) { ta.style.height = 'auto'; ta.style.height = Math.max(ta.scrollHeight + 2, 90) + 'px'; }
  let viewAbort = new AbortController();
  const onChange = fn => document.addEventListener('work-change', fn, { signal: viewAbort.signal });

  /* ───────── 挿絵（SVGをページに埋めこむ） ───────── */
  const svgCache = {};
  function svgText(src) {
    if (!svgCache[src]) svgCache[src] = fetch(src).then(r => r.ok ? r.text() : '').catch(() => '');
    return svgCache[src];
  }
  function svgNode(txt) {
    if (!txt) return null;
    const d = new DOMParser().parseFromString(txt, 'image/svg+xml');
    return d.documentElement && d.documentElement.nodeName === 'svg' ? document.importNode(d.documentElement, true) : null;
  }
  async function inlineSvgs(root) {
    const imgs = [...root.querySelectorAll('img')].filter(i => /\.svg$/i.test(i.getAttribute('src') || ''));
    await Promise.all(imgs.map(async img => {
      const n = svgNode(await svgText(img.getAttribute('src')));
      if (!n) return;
      if (!n.getAttribute('aria-label')) n.setAttribute('aria-label', img.alt || '');
      const fig = el('figure', { class: 'figure' }, n);
      const p = img.parentElement;
      (p && p.tagName === 'P' && p.childNodes.length === 1 ? p : img).replaceWith(fig);
    }));
  }
  async function mascot(cls, who) {
    const n = svgNode(await svgText('assets/img/' + (who || 'maa') + '.svg'));
    const w = el('span', { class: cls || 'mascot', 'aria-hidden': 'true' });
    if (n) { n.removeAttribute('role'); n.removeAttribute('aria-label'); w.append(n); }
    return w;
  }

  /* ───────── できたね！のお祝い ───────── */
  async function celebrate(info) {
    const avail = manifest.chapters.filter(c => c.file);
    const next = avail[avail.findIndex(c => c.id === info.id) + 1];
    const close = () => ov.remove();
    const card = el('div', { class: 'card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'ワーク完了' },
      await mascot(),
      el('h2', null, 'やったね！'),
      el('p', null, `第${+info.id}章「${info.title}」のワークを、ぜんぶ書きました。命式を読む力が、またひとつ育ちました。`),
      el('div', { class: 'row', style: 'justify-content:center' },
        next ? el('a', { class: 'btn primary', href: '#ch-' + next.id, onclick: () => close() }, `次は 第${+next.id}章へ`) : el('a', { class: 'btn primary', href: '#note', onclick: () => close() }, 'わたしの命式ノートを見る'),
        el('button', { type: 'button', class: 'btn ghost', onclick: () => close() }, 'とじる')));
    const ov = el('div', { class: 'celebrate' }, card);
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); }, { once: true });
    document.body.append(ov);
    card.querySelector('.btn').focus();
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = el('canvas'); ov.append(cv);
    const ctx = cv.getContext('2d'); const W = cv.width = innerWidth, H = cv.height = innerHeight;
    const cs = getComputedStyle(document.documentElement);
    const colors = ['--sun', '--leaf', '--sky-ink', '--warm'].map(v => cs.getPropertyValue(v).trim() || '#f2b01e');
    const ps = Array.from({ length: 140 }, () => ({ x: Math.random() * W, y: -20 - Math.random() * H * .5, vx: (Math.random() - .5) * 2, vy: 2 + Math.random() * 3, r: Math.random() * 6.28, vr: (Math.random() - .5) * .3, w: 6 + Math.random() * 6, c: colors[Math.floor(Math.random() * colors.length)] }));
    const t0 = performance.now();
    (function tick(t) {
      if (!cv.isConnected) return;
      ctx.clearRect(0, 0, W, H);
      ps.forEach(q => { q.x += q.vx; q.y += q.vy; q.r += q.vr; ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.r); ctx.fillStyle = q.c; ctx.fillRect(-q.w / 2, -q.w / 4, q.w, q.w / 2); ctx.restore(); });
      if (t - t0 < 3500) requestAnimationFrame(tick); else cv.remove();
    })(t0);
  }


  /* ───────── ふりがな（十干・十二支・専門用語に自動でふる） ───────── */
  const KANSHI = { 甲: 'きのえ', 乙: 'きのと', 丙: 'ひのえ', 丁: 'ひのと', 戊: 'つちのえ', 己: 'つちのと', 庚: 'かのえ', 辛: 'かのと', 壬: 'みずのえ', 癸: 'みずのと',
    子: 'ね', 丑: 'うし', 寅: 'とら', 卯: 'う', 辰: 'たつ', 巳: 'み', 午: 'うま', 未: 'ひつじ', 申: 'さる', 酉: 'とり', 戌: 'いぬ', 亥: 'い' };
  // ふつうの言葉にも使われる字（辛い・子ども・申し込み・未だ）は、後ろが助詞のときだけふる
  const RISKY = new Set(['子', '辛', '申', '未']);
  const PARTICLE = new Set([...'はがのをにとでもやへか']);
  const TERMS = {
    蔵干通変星: 'ぞうかんつうへんせい', 陰陽五行: 'いんようごぎょう', 四柱推命: 'しちゅうすいめい', 十二運星: 'じゅうにうんせい', 六十干支: 'ろくじっかんし',
    生日中殺: 'せいじつちゅうさつ', 生月中殺: 'せいげつちゅうさつ', 天中殺: 'てんちゅうさつ', 通変星: 'つうへんせい', 算命学: 'さんめいがく', 太極図: 'たいきょくず',
    十二支: 'じゅうにし', 十干: 'じっかん', 干支: 'えと', 天干: 'てんかん', 地支: 'ちし', 蔵干: 'ぞうかん', 日干: 'にっかん', 命式: 'めいしき',
    年柱: 'ねんちゅう', 月柱: 'げっちゅう', 日柱: 'にっちゅう', 時柱: 'じちゅう', 四柱: 'しちゅう', 中殺: 'ちゅうさつ', 空亡: 'くうぼう',
    五行: 'ごぎょう', 陰陽: 'いんよう', 相生: 'そうじょう', 相剋: 'そうこく', 比和: 'ひわ', 節入り: 'せついり', 土用: 'どよう',
    比肩: 'ひけん', 劫財: 'ごうざい', 食神: 'しょくじん', 傷官: 'しょうかん', 偏財: 'へんざい', 正財: 'せいざい', 偏官: 'へんかん', 正官: 'せいかん', 偏印: 'へんいん', 印綬: 'いんじゅ',
    長生: 'ちょうせい', 沐浴: 'もくよく', 冠帯: 'かんたい', 建禄: 'けんろく', 帝旺: 'ていおう', 大運: 'たいうん', 年運: 'ねんうん', 鑑定: 'かんてい',
    立春: 'りっしゅん', 啓蟄: 'けいちつ', 清明: 'せいめい', 立夏: 'りっか', 芒種: 'ぼうしゅ', 小暑: 'しょうしょ', 立秋: 'りっしゅう', 白露: 'はくろ', 寒露: 'かんろ', 立冬: 'りっとう', 大雪: 'たいせつ', 小寒: 'しょうかん',
  };
  const TERM_RE = new RegExp(Object.keys(TERMS).sort((a, b) => b.length - a.length).join('|') + `|[${Object.keys(KANSHI).join('')}]+`, 'g');
  const isKanji = c => !!c && /[\u3400-\u9fff々]/.test(c);
  const SKIP_TAG = new Set(['SCRIPT', 'STYLE', 'RUBY', 'RT', 'TEXTAREA', 'CODE', 'PRE', 'svg', 'SVG', 'INPUT', 'SELECT', 'OPTION']);
  function rubyEl(base, rt) { return el('ruby', null, base, el('rp', null, '（'), el('rt', null, rt), el('rp', null, '）')); }
  // all=true のときは専門用語も毎回ふる（クイズなど）。ふだんは見出し（h2）の区切りごとに最初の1回だけ
  function addRuby(root, all) {
    let seen = new Set();
    const walk = node => {
      if (node.nodeType === 1) {
        if (SKIP_TAG.has(node.tagName) || node.closest('svg')) return;
        if (node.tagName === 'H2' && !all) seen = new Set();
        [...node.childNodes].forEach(walk);
        return;
      }
      if (node.nodeType !== 3) return;
      const t = node.nodeValue;
      TERM_RE.lastIndex = 0;
      if (!TERM_RE.test(t)) return;
      TERM_RE.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let last = 0, m, changed = false;
      while ((m = TERM_RE.exec(t))) {
        const w = m[0], i = m.index, prev = t[i - 1], next = t[i + w.length];
        const hasYomi = /^[（(][ぁ-ゖー・]+[）)]/.test(t.slice(i + w.length)); // すでに（よみ）が書いてある
        let out = null;
        if (TERMS[w]) {
          if (!hasYomi && (all || !seen.has(w))) { out = rubyEl(w, TERMS[w]); seen.add(w); }
        } else if (!hasYomi && !isKanji(prev) && !isKanji(next) &&
                   (w.length > 1 || !RISKY.has(w) || ((!/[\u3041-\u3096]/.test(next || '') || PARTICLE.has(next)) && !'\u3063\u304a\u306e'.includes(prev || '')))) {
          out = document.createDocumentFragment();
          [...w].forEach(c => out.append(rubyEl(c, KANSHI[c])));
        }
        if (!out) continue;
        frag.append(t.slice(last, i), out); last = i + w.length; changed = true;
      }
      if (!changed) return;
      frag.append(t.slice(last));
      node.replaceWith(frag);
    };
    walk(root);
  }
  let rubyOn = true;
  try { rubyOn = localStorage.getItem('meishiki-ruby') !== 'off'; } catch (e) {}
  function applyRubyPref() {
    document.body.classList.toggle('no-ruby', !rubyOn);
    const b = document.getElementById('ruby-toggle');
    if (b) { b.textContent = rubyOn ? 'ふりがな：あり' : 'ふりがな：なし'; b.setAttribute('aria-pressed', String(rubyOn)); }
  }
  document.addEventListener('DOMContentLoaded', applyRubyPref);
  setTimeout(() => {
    const b = document.getElementById('ruby-toggle');
    if (b) b.addEventListener('click', () => { rubyOn = !rubyOn; try { localStorage.setItem('meishiki-ruby', rubyOn ? 'on' : 'off'); } catch (e) {} applyRubyPref(); });
    applyRubyPref();
  });

  const uid = (() => { let n = 0; return p => (p || 'f') + '-' + (++n); })();

  /* ───────── ワーク（入力欄） ───────── */
  function renderWork(w) {
    const box = el('section', { class: 'work', 'data-id': w.id });
    const inputId = 'w-' + w.id.replace(/[^\w-]/g, '_');
    const savedNote = el('span', { class: 'saved', 'aria-live': 'polite' });
    const refresh = () => {
      box.classList.toggle('filled', !isEmpty(S.a[w.id]));
      savedNote.textContent = isEmpty(S.a[w.id]) ? '' : '自動で保存されています';
    };
    const commit = v => { setVal(w.id, v); refresh(); document.dispatchEvent(new CustomEvent('work-change', { detail: w.id })); };

    const labelTag = ['text', 'textarea', 'date', 'number'].includes(w.type) ? 'label' : 'div';
    box.append(el(labelTag, labelTag === 'label' ? { for: inputId } : { class: 'w-label' }, w.label || ''));
    if (w.hint) box.append(el('p', { class: 'hint' }, w.hint));

    const body = el('div', { class: 'w-body' });
    const type = w.type || (w.fields ? 'form' : w.columns ? 'table' : 'textarea');
    const R = RENDERERS[type] || (w.fields ? RENDERERS.form : w.columns ? RENDERERS.table : RENDERERS.textarea);
    const api = R(w, body, commit, inputId) || {};
    box.append(body);

    const tools = el('div', { class: 'tools' });
    if (w.template) {
      tools.append(el('button', { type: 'button', class: 'btn small', onclick: () => { const t = fillTemplate(w.template); commit(t); api.set && api.set(t); } }, '下書きをつくる'));
    }
    let exBox = null;
    if (w.example != null && type !== 'display') {
      exBox = el('div', { class: 'example', hidden: true });
      exBox.append(el('b', null, '記入例（ひよりさんの場合）'), renderExample(w));
      const tBtn = el('button', { type: 'button', class: 'btn small ghost', 'aria-expanded': 'false' }, '記入例を見る');
      tBtn.addEventListener('click', () => { exBox.hidden = !exBox.hidden; tBtn.setAttribute('aria-expanded', String(!exBox.hidden)); tBtn.textContent = exBox.hidden ? '記入例を見る' : '記入例を閉じる'; });
      tools.append(tBtn);
      if (api.set && ['text', 'textarea', 'date', 'number', 'select', 'checklist', 'table'].includes(type) && !(type === 'table' && typeof w.example === 'string')) {
        tools.append(el('button', { type: 'button', class: 'btn small ghost', onclick: () => {
          if (!isEmpty(S.a[w.id])) { toast('すでに入力があるので、記入例はうつしません'); return; }
          const v = normalizeExample(w); commit(v); api.set(v); toast('記入例をうつしました。自分の言葉に書きかえてください');
        } }, '記入例をうつす'));
      }
    }
    if (tools.childNodes.length || type !== 'display') { tools.append(savedNote); box.append(tools); }
    if (exBox) box.append(exBox);
    refresh();
    return box;
  }

  function normalizeExample(w) {
    const ex = w.example;
    if (w.type === 'date' || w.type === 'number') return String(ex);
    if (w.type === 'checklist') return Array.isArray(ex) ? ex.map(String) : [String(ex)];
    if (w.type === 'table') return Array.isArray(ex) ? ex.map(r => (Array.isArray(r) ? r : [r]).map(x => x == null ? '' : String(x))) : [];
    return typeof ex === 'string' ? ex : toText(ex);
  }

  function renderExample(w) {
    const ex = w.example;
    if (typeof ex === 'string' || typeof ex === 'number') {
      return el('div', { style: 'white-space:pre-wrap' }, w.type === 'date' ? fmtDate(String(ex)) : String(ex));
    }
    if (Array.isArray(ex) && ex.length && ex.every(r => Array.isArray(r))) {
      const cols = w.columns || [];
      const t = el('table');
      if (cols.length) t.append(el('tr', null, cols.map(c => el('th', null, typeof c === 'object' ? c.label : c))));
      ex.forEach(r => t.append(el('tr', null, r.map(c => el('td', null, c == null ? '' : String(c))))));
      return el('div', { class: 'tbl' }, t);
    }
    if (Array.isArray(ex)) {
      if (ex.every(x => x && typeof x === 'object')) return el('div', { style: 'white-space:pre-wrap' }, toText(ex));
      return el('div', null, ex.join('、'));
    }
    if (ex && typeof ex === 'object') {
      const dl = el('div', { style: 'white-space:pre-wrap' });
      Object.entries(ex).forEach(([k, v]) => dl.append(el('div', null, el('strong', null, labelOfKey(w, k) + '：'), toText(v))));
      return dl;
    }
    return el('div', null, String(ex));
  }
  function labelOfKey(w, k) {
    const f = (w.fields || []).find(f => (f.key || f.id) === k);
    return f ? f.label : k;
  }

  const RENDERERS = {
    text(w, body, commit, id) {
      const i = el('input', { type: 'text', id, placeholder: w.placeholder || '' });
      i.value = S.a[w.id] || '';
      i.addEventListener('input', () => commit(i.value));
      body.append(i);
      return { set: v => { i.value = v; } };
    },
    number(w, body, commit, id) {
      const i = el('input', { type: 'number', id, inputmode: 'decimal' });
      i.value = S.a[w.id] ?? '';
      i.addEventListener('input', () => commit(i.value));
      body.append(i);
      return { set: v => { i.value = v; } };
    },
    date(w, body, commit, id) {
      const i = el('input', { type: 'date', id });
      i.value = S.a[w.id] || '';
      i.addEventListener('change', () => commit(i.value));
      body.append(i);
      return { set: v => { i.value = v; } };
    },
    textarea(w, body, commit, id) {
      const t = el('textarea', { id, rows: w.rows || 4, placeholder: w.placeholder || '' });
      t.value = typeof S.a[w.id] === 'string' ? S.a[w.id] : (S.a[w.id] ? toText(S.a[w.id]) : '');
      t.addEventListener('input', () => { commit(t.value); autosize(t); });
      body.append(t);
      requestAnimationFrame(() => autosize(t));
      return { set: v => { t.value = v; autosize(t); } };
    },
    select(w, body, commit) {
      const opts = (w.options || []).map(String);
      const wrap = el('div', { class: 'chips', role: 'group', 'aria-label': w.label });
      const draw = () => {
        wrap.innerHTML = '';
        opts.forEach(o => wrap.append(el('button', { type: 'button', class: 'chip', 'aria-pressed': String(S.a[w.id] === o), onclick: () => { commit(S.a[w.id] === o ? '' : o); draw(); } }, o)));
      };
      draw(); body.append(wrap);
      return { set: draw };
    },
    checklist(w, body, commit) {
      const opts = (w.options || []).map(String);
      const wrap = el('div', { class: 'chips', role: 'group', 'aria-label': w.label });
      const note = el('p', { class: 'count-note', 'aria-live': 'polite' });
      const cur = () => Array.isArray(S.a[w.id]) ? S.a[w.id] : [];
      const draw = () => {
        wrap.innerHTML = '';
        opts.forEach(o => {
          const on = cur().includes(o);
          wrap.append(el('button', { type: 'button', class: 'chip', 'aria-pressed': String(on), onclick: () => {
            const v = on ? cur().filter(x => x !== o) : cur().concat(o);
            if (!on && w.max && v.length > w.max) { toast(`えらべるのは${w.max}つまでです`); return; }
            commit(v); draw();
          } }, o));
        });
        const n = cur().length;
        if (w.min || w.max) {
          const target = w.min === w.max ? `${w.max}つ` : `${w.min || 0}〜${w.max || opts.length}つ`;
          note.textContent = `いま ${n}つ えらんでいます（目安：${target}）`;
          note.classList.toggle('bad', (w.min && n < w.min) || (w.max && n > w.max));
        }
      };
      draw(); body.append(wrap, note);
      return { set: draw };
    },
    table(w, body, commit, _id, onChange, getSaved) {
      const cols = (w.columns || (w.fields ? w.fields : ['内容'])).map(colSpec);
      const fixed = Array.isArray(w.rows) ? w.rows.map(String) : null; // 行見出しが決まっている表
      const wrap = el('div', { class: 'grid-table' });
      const blankRow = () => cols.map(() => '');
      const initial = () => {
        const saved = getSaved ? getSaved() : S.a[w.id];
        if (Array.isArray(saved) && saved.length) return saved;
        if (fixed) return fixed.map(blankRow);
        const src = w.source ? [].concat(w.source)[0] : null;
        if (src) { const reg = regOf(src); const v = getVal(src); if (v && v.cells) return mandalaRows(reg && reg.w, v).map(r => cols.map((_, i) => r[i] || '')); }
        if (w.from) { const o = optionsFrom(w.from); if (o.length) return o.map(x => cols.map((_, i) => i === 0 ? x : '')); }
        return Array.from({ length: Math.max(1, w.min_rows || 1) }, blankRow);
      };
      const draw = () => {
        const data = initial().map(r => cols.map((_, i) => (r && r[i] != null) ? String(r[i]) : ''));
        const t = el('table', { style: `min-width:${Math.max(30, cols.length * 10 + (fixed ? 6 : 0))}rem` });
        t.append(el('tr', null, fixed ? el('th', null, '') : null, cols.map(c => el('th', { scope: 'col' }, c.label)), fixed ? null : el('th', null, '')));
        data.forEach((r, ri) => {
          const tr = el('tr');
          if (fixed) tr.append(el('th', { scope: 'row', style: 'white-space:nowrap;padding-top:.6rem' }, fixed[ri] || ''));
          r.forEach((cell, ci) => {
            const c = cols[ci];
            const aria = `${fixed ? fixed[ri] : ri + 1 + '行目'} ${c.label}`;
            const opts = c.options || (c.from ? optionsFrom(c.from) : null);
            let inp;
            if (opts && opts.length) {
              inp = el('select', { 'aria-label': aria });
              [''].concat(opts, cell && !opts.includes(cell) ? [cell] : []).forEach(o => inp.append(el('option', { value: o, selected: o === cell ? true : null }, o || '（えらぶ）')));
              inp.addEventListener('change', () => { data[ri][ci] = inp.value; commit(data.map(x => x.slice())); onChange && onChange(); });
            } else {
              inp = el('textarea', { rows: 1, 'aria-label': aria });
              inp.value = cell;
              inp.addEventListener('input', () => { data[ri][ci] = inp.value; commit(data.map(x => x.slice())); autosize(inp); onChange && onChange(); });
              requestAnimationFrame(() => autosize(inp));
            }
            tr.append(el('td', null, inp));
          });
          if (!fixed) tr.append(el('td', null, el('button', { type: 'button', class: 'del', 'aria-label': `${ri + 1}行目を消す`, onclick: () => {
            if (w.min_rows && data.length <= w.min_rows) { toast(`${w.min_rows}行は残してください`); return; }
            data.splice(ri, 1); commit(data); draw(); onChange && onChange();
          } }, '×')));
          t.append(tr);
        });
        wrap.innerHTML = ''; wrap.append(t);
        if (!fixed) wrap.append(el('div', { class: 'row', style: 'margin-top:.5rem' }, el('button', { type: 'button', class: 'btn small', onclick: () => {
          if (w.max_rows && data.length >= w.max_rows) { toast(`${w.max_rows}行までです。しぼりこむのも大事な作業です`); return; }
          data.push(blankRow()); commit(data); draw();
        } }, '＋ 行をふやす')));
      };
      draw(); body.append(wrap);
      return { set: draw };
    },
    form(w, body, commit) {
      const fields = formFields(w);
      const multi = w.repeat || w.multiple;
      const wrap = el('div');
      const blankVal = f => f.type === 'list' || f.type === 'table' ? [] : f.type === 'signature' ? { name: '', date: '' } : '';
      const blankRec = () => Object.fromEntries(fields.map(f => [f.key, blankVal(f)]));
      const getRecs = () => multi ? (Array.isArray(S.a[w.id]) && S.a[w.id].length ? S.a[w.id] : [blankRec()]) : [S.a[w.id] && typeof S.a[w.id] === 'object' ? S.a[w.id] : blankRec()];
      const draw = () => {
        const recs = getRecs().map(r => Object.assign(blankRec(), r));
        const save_ = () => commit(multi ? recs : recs[0]);
        wrap.innerHTML = '';
        recs.forEach((rec, ri) => {
          const card = el('div', { class: 'plan-card', style: 'margin-bottom:.75rem' });
          if (multi) card.append(el('div', { class: 'row', style: 'justify-content:space-between' }, el('b', null, rec[fields[0].key] || `${w.item_label || 'カード'} ${ri + 1}`),
            recs.length > 1 ? el('button', { type: 'button', class: 'btn small ghost', onclick: () => { recs.splice(ri, 1); save_(); draw(); } }, 'このカードを消す') : null));
          const grid = el('div', { class: 'plan-fields', style: 'grid-template-columns:1fr' });
          fields.forEach(f => {
            const fid = uid('ff');
            const lab = el('div', { style: 'display:grid;gap:4px' }, el('label', { for: fid, style: 'font-size:.85rem;font-weight:700;color:var(--ink-soft)' }, f.label));
            if (f.note) lab.append(el('span', { style: 'font-size:.85rem' }, f.note));
            if (f.type === 'list') {
              const n = f.max || 5; const arr = Array.from({ length: n }, (_, i) => (rec[f.key] || [])[i] || '');
              arr.forEach((x, i) => { const inp = el('input', { type: 'text', id: i === 0 ? fid : null, placeholder: `${i + 1}.` }); inp.value = x; inp.addEventListener('input', () => { arr[i] = inp.value; rec[f.key] = arr.slice(); save_(); }); lab.append(inp); });
            } else if (f.type === 'table') {
              const sub = { id: w.id + '#' + f.key, columns: f.columns, from: f.from, min_rows: f.min_rows, max_rows: f.max_rows };
              const tmp = el('div');
              RENDERERS.table(sub, tmp, v => { rec[f.key] = v; save_(); }, null, null, () => rec[f.key]);
              lab.append(tmp);
            } else if (f.type === 'signature') {
              const sig = Object.assign({ name: '', date: '' }, rec[f.key] || {});
              const nm = el('input', { type: 'text', id: fid, placeholder: '名前' }); nm.value = sig.name;
              const dt = el('input', { type: 'date', 'aria-label': f.label + ' 日付' }); dt.value = sig.date;
              nm.addEventListener('input', () => { sig.name = nm.value; rec[f.key] = Object.assign({}, sig); save_(); });
              dt.addEventListener('change', () => { sig.date = dt.value; rec[f.key] = Object.assign({}, sig); save_(); });
              lab.append(el('div', { class: 'row', style: 'flex-wrap:nowrap' }, nm, dt));
            } else {
              const long = f.type === 'textarea' || f.multiline;
              const inp = long ? el('textarea', { rows: 3, id: fid }) : el('input', { type: f.type === 'date' ? 'date' : 'text', id: fid });
              inp.value = rec[f.key] || '';
              if (f.from && !long) { const dl = el('datalist', { id: fid + '-dl' }, optionsFrom(f.from).map(o => el('option', { value: o }))); inp.setAttribute('list', fid + '-dl'); lab.append(dl); }
              inp.addEventListener('input', () => { rec[f.key] = inp.value; save_(); if (long) autosize(inp); });
              if (long) requestAnimationFrame(() => autosize(inp));
              lab.append(inp);
            }
            grid.append(lab);
          });
          card.append(grid); wrap.append(card);
        });
        if (multi) wrap.append(el('button', { type: 'button', class: 'btn small', onclick: () => { recs.push(blankRec()); save_(); draw(); } }, `＋ ${w.item_label || 'カード'}をふやす`));
      };
      draw(); body.append(wrap);
      return {};
    },
    orgchart(w, body, commit, id) {
      const cols = (w.columns || w.fields || ['役割', '上司の役割', '担当する人', 'メモ']).map(colSpec);
      const idx = key => { const i = cols.findIndex(c => c.key === key); return i; };
      const iRole = Math.max(0, idx('role')), iParent = idx('parent') >= 0 ? idx('parent') : 1, iPerson = idx('person') >= 0 ? idx('person') : 2, iStatus = idx('status');
      const tree = el('pre', { class: 'no-print', style: 'margin-top:.75rem;overflow-x:auto;background:var(--sunk);padding:.75rem;border-radius:8px;font-size:.85rem;line-height:1.6' });
      function drawTree() {
        const rows = (Array.isArray(S.a[w.id]) ? S.a[w.id] : []).filter(r => r && r[iRole]);
        if (!rows.length) { tree.textContent = '役割を入力すると、ここにチーム図ができます'; return; }
        const names = new Set(rows.map(r => r[iRole]));
        const label = r => r[iRole] + (r[iPerson] ? `（${r[iPerson]}）` : '（空き）') + (iStatus >= 0 && r[iStatus] ? `【${r[iStatus]}】` : '');
        const lines = [];
        const walk = (r, pre, last, top) => {
          lines.push(top ? label(r) : pre + (last ? '└─ ' : '├─ ') + label(r));
          const ks = rows.filter(k => k[iParent] === r[iRole] && k !== r);
          ks.forEach((k, i) => walk(k, top ? '' : pre + (last ? '   ' : '│  '), i === ks.length - 1, false));
        };
        const tops = rows.filter(r => !r[iParent] || !names.has(r[iParent]));
        if (w.root && !names.has(w.root)) {
          lines.push(w.root);
          tops.forEach((r, i) => walk(r, '', i === tops.length - 1, false));
        } else tops.forEach(r => walk(r, '', true, true));
        tree.textContent = lines.join('\n');
      }
      const api = RENDERERS.table(Object.assign({}, w, { columns: cols, fields: null }), body, commit, id, drawTree);
      body.append(el('p', { class: 'hint', style: 'margin:.75rem 0 0' }, 'チーム図のできあがり'), tree);
      drawTree();
      return api;
    },
    scale(w, body, commit) {
      const scale = w.scale || [{ value: 2, label: 'できている' }, { value: 1, label: '少し' }, { value: 0, label: 'できていない' }];
      const cur = () => (S.a[w.id] && typeof S.a[w.id] === 'object') ? S.a[w.id] : {};
      if (w.compare_with && !w.compare) w.compare = w.compare_with;
      const result = el('div', { class: 'result', 'aria-live': 'polite' });
      (w.groups || []).forEach((g, gi) => {
        const head = el('h4', null, g.name, el('span', { 'data-g': gi }));
        const grp = el('div', { class: 'scale-group' }, head);
        g.items.forEach((item, ii) => {
          const key = `${gi}-${ii}`;
          const seg = el('div', { class: 'seg', role: 'group', 'aria-label': item });
          const draw = () => { seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(cur()[key] === +b.dataset.v))); };
          scale.forEach(s => seg.append(el('button', { type: 'button', 'data-v': s.value, onclick: () => { const v = Object.assign({}, cur(), { [key]: s.value }); commit(v); draw(); drawResult(); } }, s.label)));
          draw();
          grp.append(el('div', { class: 'scale-item' }, el('span', null, `${ii + 1}. ${item}`), seg));
        });
        body.append(grp);
      });
      function drawResult() {
        const s = scaleScore(w, cur());
        body.querySelectorAll('[data-g]').forEach(sp => { const g = s.groups[+sp.dataset.g]; sp.textContent = `${g.score} ／ ${g.max}`; });
        result.innerHTML = '';
        const left = el('div');
        left.append(el('div', { class: 'score-big' }, String(s.total), el('small', null, ` ／ ${s.max}点`)));
        left.append(el('div', { class: 'meter' }, el('i', { style: `width:${s.max ? s.total / s.max * 100 : 0}%` })));
        left.append(el('p', { class: 'verdict' }, s.answered ? verdict(s.total, s.max) : 'まだ答えていない質問があります'));
        left.append(el('p', { style: 'margin:0;font-size:.85rem;color:var(--ink-soft)' }, `答えた質問 ${s.answered} ／ ${s.count}`));
        if (w.compare) {
          const other = registry[w.compare] ? scaleScore(registry[w.compare].w, getVal(w.compare) || {}) : null;
          if (other && other.answered) left.append(el('p', { style: 'margin:.5rem 0 0;font-weight:700' }, `スタート時 ${other.total}点 → いま ${s.total}点（${s.total - other.total >= 0 ? '+' : ''}${s.total - other.total}点）`));
        }
        result.append(left, radar(s.groups, w.compare && registry[w.compare] ? scaleScore(registry[w.compare].w, getVal(w.compare) || {}).groups : null));
      }
      drawResult(); body.append(result);
      return {};
    },
    display(w, body) {
      const box = el('div', { class: 'display' });
      const srcs = [].concat(w.source || []);
      const draw = () => {
        box.innerHTML = '';
        if (w.view === 'compare') {
          const [a, b] = srcs.map(id => { const r = regOf(id); return r && r.w.type === 'scale' ? scaleScore(r.w, getVal(id) || {}) : null; });
          if (!a || !b || !a.answered || !b.answered) { box.append(el('p', { class: 'empty' }, w.empty || '2回ぶんのチェックがそろうと、ここに比べた結果が出ます。')); return; }
          const t = el('table');
          t.append(el('tr', null, el('th', null, '分野'), el('th', null, 'スタート'), el('th', null, 'いま'), el('th', null, '変化')));
          a.groups.forEach((g, i) => { const d = b.groups[i].score - g.score; t.append(el('tr', null, el('td', null, g.name), el('td', null, `${g.score}`), el('td', null, `${b.groups[i].score}`), el('td', null, `${d >= 0 ? '+' : ''}${d}`))); });
          const dt = b.total - a.total;
          t.append(el('tr', null, el('th', null, '合計'), el('th', null, `${a.total}／${a.max}`), el('th', null, `${b.total}／${b.max}`), el('th', null, `${dt >= 0 ? '+' : ''}${dt}`)));
          box.append(el('div', { class: 'tbl prose' }, t), el('div', { style: 'max-width:18rem;margin:.5rem auto 0' }, radar(b.groups, a.groups)), el('p', { style: 'margin:0;font-size:.8rem;color:var(--ink-soft);text-align:center' }, '点線がスタートのとき、黄色がいま'));
          return;
        }
        const dl = el('dl');
        let any = false;
        srcs.forEach(id => {
          const v = getVal(id); if (isEmpty(v)) return;
          any = true;
          const reg = regOf(id);
          const chInfo = !reg && manifest && manifest.chapters.find(c => c.id === id.slice(0, 2));
          dl.append(el('dt', null, reg ? `${reg.w.label}（第${+reg.chId}章）` : chInfo ? `第${+chInfo.id}章　${chInfo.title}` : id), el('dd', null, toText(v, reg && reg.w)));
        });
        box.append(any ? dl : el('p', { class: 'empty' }, w.empty || 'まだ前の章が入力されていません。'));
      };
      draw(); body.append(box);
      onChange(draw);
      return {};
    },
    mandala(w, body, commit) {
      const n = w.cells || 8, m = w.outer_cells == null ? 8 : w.outer_cells;
      const fields = w.cell_fields || [{ key: 'theme', label: 'やること' }, { key: 'indicator', label: 'ものさし' }];
      const tf = fields.filter(f => !f.from);
      const saved = S.a[w.id] && typeof S.a[w.id] === 'object' ? S.a[w.id] : {};
      const data = { cells: Array.from({ length: n }, (_, i) => {
        const c = Object.assign({}, (saved.cells || [])[i] || {});
        fields.forEach(f => { if (c[f.key] == null && Array.isArray(f.default)) c[f.key] = f.default[i] || ''; });
        if (m) c.systems = Array.from({ length: m }, (_, j) => (c.systems || [])[j] || '');
        return c;
      }) };
      const edit = el('div', { class: 'mandala-edit' });
      const preview = el('div', { class: 'mandala-wrap' });
      const unit = m ? '作戦' : '要素';
      data.cells.forEach((c, i) => {
        const sumTxt = el('span');
        const card = el('details', { class: 'plan-card', open: i === 0 ? true : null });
        const sumUpdate = () => {
          const main = c[tf[0].key], sub = tf[1] ? c[tf[1].key] : '';
          sumTxt.textContent = (main || '') + (sub ? '：' + sub : '') || 'まだ書いていません';
        };
        card.append(el('summary', null, el('span', { class: 'n' }, `${unit}${i + 1}`), sumTxt));
        const grid = el('div', { class: 'plan-fields' });
        fields.forEach(f => {
          let inp;
          if (f.from) {
            inp = el('select');
            const opts = [''].concat(optionsFrom(f.from));
            if (c[f.key] && !opts.includes(c[f.key])) opts.push(c[f.key]);
            opts.forEach(o => inp.append(el('option', { value: o, selected: c[f.key] === o ? true : null }, o || '（えらぶ）')));
            inp.addEventListener('change', () => { c[f.key] = inp.value; commit(data); sumUpdate(); drawPreview(); });
          } else {
            const long = f === tf[tf.length - 1] && !m;
            inp = long ? el('textarea', { rows: 2 }) : el('input', { type: 'text' });
            inp.value = c[f.key] || '';
            inp.addEventListener('input', () => { c[f.key] = inp.value; commit(data); sumUpdate(); drawPreview(); if (long) autosize(inp); });
            if (long) requestAnimationFrame(() => autosize(inp));
          }
          grid.append(el('label', null, f.label, inp));
        });
        card.append(grid);
        if (m) {
          card.append(el('p', { class: 'hint', style: 'margin:.75rem 0 0' }, w.outer_label || 'この作戦を実行する仕組み'));
          const sys = el('div', { class: 'plan-systems' });
          c.systems.forEach((s, j) => {
            const inp = el('input', { type: 'text', placeholder: `仕組み${j + 1}`, 'aria-label': `${unit}${i + 1}の仕組み${j + 1}` }); inp.value = s;
            inp.addEventListener('input', () => { c.systems[j] = inp.value; commit(data); drawPreview(); });
            sys.append(inp);
          });
          card.append(sys);
        }
        sumUpdate();
        edit.append(card);
      });
      function drawPreview() { preview.innerHTML = ''; preview.append(mandalaGrid(w, data)); }
      drawPreview();
      body.append(edit, el('p', { class: 'hint', style: 'margin:1.25rem 0 0' }, m ? 'マップのできあがり（9×9マス）' : 'マップのできあがり'), preview);
      return {};
    },
    quiz(w, body, commit) {
      const qs = w.questions || [];
      const cur = () => (S.a[w.id] && typeof S.a[w.id] === 'object') ? S.a[w.id] : {};
      const result = el('p', { class: 'quiz-score', 'aria-live': 'polite' });
      const drawScore = () => { const q = quizScore(w, cur()); result.textContent = q.answered ? `${q.answered}問中 ${q.correct}問正解${q.answered === q.count && q.correct === q.count ? '　全問正解です！' : ''}` : ''; };
      qs.forEach((q, qi) => {
        const box = el('div', { class: 'quiz-q' });
        const opts = (q.options || []).map(String);
        const fb = el('div', { class: 'quiz-fb', 'aria-live': 'polite' });
        const chips = el('div', { class: 'chips', role: 'group', 'aria-label': `問${qi + 1}` });
        const draw = () => {
          const pick = cur()[qi];
          chips.innerHTML = '';
          opts.forEach(o => {
            const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(pick === o), onclick: () => { commit(Object.assign({}, cur(), { [qi]: o })); draw(); drawScore(); } }, o);
            if (pick != null && o === pick) b.classList.add(o === String(q.answer) ? 'right' : 'wrong');
            chips.append(b);
          });
          fb.innerHTML = '';
          if (pick != null) {
            const ok = pick === String(q.answer);
            fb.className = 'quiz-fb ' + (ok ? 'ok' : 'ng');
            fb.append(el('b', null, ok ? '◯ 正解！' : `✕ ざんねん。正解は「${q.answer}」`));
            if (q.explain) fb.append(el('div', null, q.explain));
          }
          addRuby(chips, true); addRuby(fb, true);
        };
        box.append(el('p', { class: 'quiz-text' }, el('b', null, `問${qi + 1}　`), q.q || ''), chips, fb);
        draw(); body.append(box); addRuby(box.querySelector('.quiz-text'), true);
      });
      drawScore(); body.append(result);
      return {};
    },
    error(w, body) { body.append(el('pre', null, w.raw || '')); return {}; },
  };

  function mandalaGrid(w, data) {
    const center = w.center ? toText(getVal(w.center), regOf(w.center) && regOf(w.center).w) : '';
    const m = w.outer_cells == null ? 8 : w.outer_cells;
    const tf = (w.cell_fields || [{ key: 'theme' }, { key: 'indicator' }]).filter(f => !f.from);
    const cells = (data && data.cells) || [];
    const main = c => (c && c[tf[0].key]) || '';
    const sub = c => (tf[1] && c && c[tf[1].key]) || '';
    const order = [0, 1, 2, 3, null, 4, 5, 6, 7]; // 3×3 の並び（真ん中がゴール）
    const centerLabel = center || (m ? '3年後のゴール' : '夢の完成図');
    if (!m) {
      const block = el('div', { class: 'block', style: 'max-width:44rem', role: 'img', 'aria-label': 'マップ' });
      order.forEach(ci => block.append(ci === null ? el('div', { class: 'cell goal', style: 'min-height:6rem' }, centerLabel)
        : el('div', { class: 'cell theme', style: 'min-height:6rem;font-size:.78rem' }, main(cells[ci]), sub(cells[ci]) ? el('small', null, sub(cells[ci])) : null)));
      return block;
    }
    const grid = el('div', { class: 'mandala', role: 'img', 'aria-label': '未来の作戦マップ' });
    order.forEach(bi => {
      const block = el('div', { class: 'block' + (bi === null ? ' center' : '') });
      if (bi === null) {
        order.forEach(ci => block.append(ci === null ? el('div', { class: 'cell goal' }, centerLabel)
          : el('div', { class: 'cell theme' }, main(cells[ci]), sub(cells[ci]) ? el('small', null, sub(cells[ci])) : null)));
      } else {
        const c = cells[bi] || {};
        order.forEach(si => block.append(si === null ? el('div', { class: 'cell theme' }, main(c) || `作戦${bi + 1}`, sub(c) ? el('small', null, sub(c)) : null)
          : el('div', { class: 'cell' }, (c.systems || [])[si] || '')));
      }
      grid.append(block);
    });
    return grid;
  }

  function scaleScore(w, v) {
    const scale = w.scale || [{ value: 2 }, { value: 1 }, { value: 0 }];
    const top = Math.max(...scale.map(s => s.value));
    let total = 0, max = 0, answered = 0, count = 0;
    const groups = (w.groups || []).map((g, gi) => {
      let score = 0;
      g.items.forEach((_, ii) => { const x = v[`${gi}-${ii}`]; count++; if (typeof x === 'number') { score += x; answered++; } });
      const gmax = g.items.length * top; total += score; max += gmax;
      return { name: g.name, score, max: gmax };
    });
    return { total, max, answered, count, groups };
  }
  function quizScore(w, v) {
    const qs = w.questions || []; v = v || {};
    let correct = 0, answered = 0;
    qs.forEach((q, i) => { if (v[i] != null) { answered++; if (v[i] === String(q.answer)) correct++; } });
    return { correct, answered, count: qs.length };
  }
  function verdict(t, max) {
    const r = t / (max || 1);
    if (r <= .25) return '🌱 これから育つところ';
    if (r <= .5) return '🌿 少しずつ育っている';
    if (r <= .75) return '🌳 だいぶ育ってきた';
    return '🌸 しっかり身についている';
  }
  function radar(groups, before) {
    const N = groups.length; if (N < 3) return el('div');
    const S0 = 100, R = 62, cx = 110, cy = 100;
    const pt = (i, r) => { const a = -Math.PI / 2 + i * 2 * Math.PI / N; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
    const ring = f => groups.map((_, i) => pt(i, R * f).join(',')).join(' ');
    const poly = gs => gs.map((g, i) => pt(i, R * (g.max ? g.score / g.max : 0)).join(',')).join(' ');
    let s = `<svg viewBox="0 0 220 ${S0 * 2}" aria-label="分野ごとの点数">`;
    [.25, .5, .75, 1].forEach(f => { s += `<polygon points="${ring(f)}" fill="none" stroke="var(--line)" stroke-width="1"/>`; });
    groups.forEach((g, i) => { const [x, y] = pt(i, R); s += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--line)"/>`; });
    if (before) s += `<polygon points="${poly(before)}" fill="none" stroke="var(--ink-soft)" stroke-dasharray="4 3" stroke-width="1.5"/>`;
    s += `<polygon points="${poly(groups)}" fill="var(--sun)" fill-opacity=".45" stroke="var(--sun-ink)" stroke-width="2"/>`;
    groups.forEach((g, i) => {
      const [x, y] = pt(i, R + 16);
      const anchor = Math.abs(x - cx) < 5 ? 'middle' : x > cx ? 'start' : 'end';
      s += `<text x="${x}" y="${y}" font-size="9" fill="var(--ink)" text-anchor="${anchor}" dominant-baseline="middle">${esc(g.name)} ${g.score}</text>`;
    });
    s += '</svg>';
    return el('div', { html: s });
  }

  /* ───────── 章の進み具合 ───────── */
  function progress(ch) {
    if (!ch) return { done: 0, total: 0, ratio: 0 };
    const ws = ch.works.filter(w => w.type !== 'display' && w.type !== 'error');
    const done = ws.filter(w => !isEmpty(S.a[w.id])).length;
    return { done, total: ws.length, ratio: ws.length ? done / ws.length : 0 };
  }

  /* ───────── 画面：トップ（道のり） ───────── */
  const STAGE_ICON = { '1': '☯️', '2': '📜', '3': '🔮' };
  async function viewHome() {
    const req = manifest.chapters.filter(c => c.required);
    const reqDone = req.filter(c => progress(chapters[c.id]).ratio >= .8).length;
    const me = getVal('00.me') || {};
    const next = manifest.chapters.find(c => c.file && progress(chapters[c.id]).ratio < .8 && c.required) || manifest.chapters.find(c => c.file) || manifest.chapters[0];

    const hero = el('section', { class: 'hero' });
    const left = el('div');
    left.innerHTML = `<p class="hero-kicker">はじめての命式 ― 本当の自分を知る陰陽五行</p>
      <h1>あなたは、まだ<br><em>本当の自分</em>を知らない。</h1>
      <p class="hero-lead">運命を知ることは、本当の自分を知ること。<br>生まれ持った個性と可能性から、あなたの未来を読み解く。</p>
      <p>陰陽五行をまったく知らなくても大丈夫。命式アプリを片手に、命式の読み方を一歩ずつ学び、最後は自分の言葉で鑑定ができるようになる教室です。</p>`;
    const greet = el('div', { class: 'hero-greet' }, await mascot('mascot-big'), el('div', { class: 'bubble' }, 'ようこそ。案内役のまあ先生です。あなたの命式、いっしょに読んでみましょうか。'));
    left.prepend(greet);
    left.append(el('div', { class: 'row' },
      el('a', { class: 'btn primary', href: '#ch-' + next.id }, Object.keys(S.a).length ? `続きから（第${+next.id}章）` : '第0章からはじめる'),
      el('a', { class: 'btn', href: APP_URL, target: '_blank', rel: 'noopener' }, '命式アプリを開く ↗')));
    const card = el('div', { class: 'hero-card' });
    card.append(el('h2', null, 'わたしの命式'));
    if (me.nikkan) {
      card.append(el('div', { class: 'score-big' }, me.nikkan, el('small', null, ' の人')), el('p', { style: 'margin:.25rem 0 0' }, [me.name, me.birth].filter(Boolean).join('　')));
    } else {
      card.append(el('p', { style: 'margin:0' }, 'まだ登録していません。第0章で、アプリを使って自分の命式を出しましょう。'));
    }
    card.append(el('h2', { style: 'margin-top:1.25rem' }, `★必修${req.length}章の進み具合`), el('div', { class: 'meter' }, el('i', { style: `width:${reqDone / req.length * 100}%` })), el('p', { style: 'margin:0;font-variant-numeric:tabular-nums' }, `${reqDone} ／ ${req.length} 章`));
    hero.append(left, card);

    const trail = el('div', { class: 'trail' });
    manifest.stages.forEach(st => {
      const list = manifest.chapters.filter(c => c.stage === st.key);
      const steps = el('div', { class: 'steps' });
      list.forEach(c => {
        const p = progress(chapters[c.id]);
        const done = p.ratio >= .8;
        const cls = 'step' + (c.required ? ' req' : '') + (done ? ' done' : '') + (c.file ? '' : ' soon');
        const meta = c.file ? (done ? el('span', { class: 'pill done' }, 'できた') : p.done ? `${p.done} ／ ${p.total} 問` : (c.required ? el('span', { class: 'pill req' }, '★必修') : '選択')) : '準備中';
        const inner = [el('span', { class: 'num' }, done ? '✓' : String(+c.id)), el('span', null, el('span', { class: 't' }, c.title), el('br'), el('span', { class: 'm' }, meta))];
        steps.append(c.file ? el('a', { class: cls, href: '#ch-' + c.id }, inner) : el('div', { class: cls, 'aria-disabled': 'true' }, inner));
      });
      trail.append(el('section', { class: 'stage' }, el('div', { class: 'stage-head' }, el('span', { class: 'ico', 'aria-hidden': 'true' }, STAGE_ICON[st.key] || '📘'), el('b', null, st.name), el('span', null, st.lead)), steps));
    });

    app.replaceChildren(hero,
      el('h2', { style: 'font-size:1.3rem;margin:0 0 .5rem' }, '鑑定ができるまでの道のり'),
      el('div', { class: 'legend' }, el('span', null, el('span', { class: 'pill req' }, '★必修'), ` この${req.length}章で、命式を読んで鑑定として伝えるまでができます`), el('span', null, el('span', { class: 'pill' }, '選択'), ' もっと深く読みたいときに')),
      trail);
  }

  /* ───────── 画面：章 ───────── */
  async function viewChapter(id) {
    const ch = await loadChapter(id);
    if (!ch) { app.replaceChildren(el('div', { class: 'panel' }, el('h2', null, 'この章は準備中です'), el('p', null, 'できあがったら、ここに表示されます。'), el('a', { class: 'btn', href: '#home' }, '道のりにもどる'))); return; }
    const m = ch.meta, info = ch.info;
    const doc = el('article', { class: 'doc' });
    const stageName = (manifest.stages.find(s => s.key === info.stage) || {}).name || '';
    doc.append(el('header', { class: 'doc-head' },
      el('div', { class: 'eyebrow' }, `第${+info.id}章 ／ ${stageName}`),
      el('h1', null, m.title),
      m.subtitle ? el('p', { class: 'sub' }, m.subtitle) : null,
      el('div', { class: 'facts' },
        info.required ? el('span', null, '★ 必修') : el('span', null, '選択'),
        m.minutes ? el('span', null, `目安 ${m.minutes}分`) : null,
        m.output ? el('span', null, `できあがるもの：${m.output}`) : null)));

    const prose = el('div', { class: 'prose', html: ch.html });
    // 表は横スクロールできる箱に入れる
    prose.querySelectorAll('table').forEach(t => { const w = el('div', { class: 'tbl' }); t.replaceWith(w); w.append(t); });
    // ワークを差し込む
    prose.querySelectorAll('.work-slot').forEach(s => {
      const w = ch.works[+s.dataset.w];
      const node = renderWork(w);
      (s.parentElement && s.parentElement.tagName === 'P' ? s.parentElement : s).replaceWith(node);
    });
    // セルフチェック（- [ ]）を押せるようにして保存
    prose.querySelectorAll('li').forEach((li, i) => {
      const cb = li.querySelector(':scope > input[type=checkbox]');
      if (!cb) return;
      const key = `${info.id}.check.${i}`;
      cb.removeAttribute('disabled'); cb.checked = !!S.c[key]; cb.id = 'c-' + info.id + '-' + i;
      cb.addEventListener('change', () => { S.c[key] = cb.checked; save(); });
      const lab = el('label', { for: cb.id });
      while (cb.nextSibling) lab.append(cb.nextSibling);
      li.classList.add('task'); li.append(lab);
    });
    // 見出しにIDをつけ、講師ガイドを折りたたむ
    const heads = [...prose.querySelectorAll('h2')];
    heads.forEach((h, i) => { h.id = `sec-${info.id}-${i}`; });
    const g = heads.find(h => h.textContent.includes('講師ガイド'));
    if (g) {
      const det = el('details', { class: 'guide' }, el('summary', null, '講師ガイド', el('small', null, 'セミナーで教える方へ（時間配分・問いかけ・つまずき）')));
      g.before(det);
      let n = g; while (n) { const nx = n.nextSibling; det.append(n); n = nx; }
    }
    // 挿絵・扉絵・まあ先生とひよりの吹き出し
    await inlineSvgs(prose);
    if (m.cover) {
      const n = svgNode(await svgText('assets/img/' + m.cover));
      if (n) doc.querySelector('.doc-head').prepend(el('figure', { class: 'cover' }, n));
    }
    // 🐱＝まあ先生、🙋＝ひより、💡＝ヒント、📱＝アプリで見てみよう
    const tipM = await mascot(), tipH = await mascot('mascot', 'hiyori');
    prose.querySelectorAll('blockquote').forEach(bq => {
      const t0 = bq.textContent.trim();
      const kind = ['🐱', '🙋', '💡', '📱'].find(k => t0.startsWith(k));
      if (!kind) return;
      bq.classList.add('tip', { '🐱': 'say-maa', '🙋': 'say-hiyori', '💡': 'hint-tip', '📱': 'app-tip' }[kind]);
      const body = el('div', { class: 'body' });
      while (bq.firstChild) body.append(bq.firstChild);
      const first = body.querySelector('p');
      if (first && (kind === '🐱' || kind === '🙋')) first.innerHTML = first.innerHTML.replace(/^\s*(🐱|🙋)\s*/, '');
      bq.append((kind === '🙋' ? tipH : tipM).cloneNode(true), body);
    });
    // 外のサイト（アプリなど）へのリンクは別タブで開く
    prose.querySelectorAll('a[href^="http"]').forEach(a => { a.target = '_blank'; a.rel = 'noopener'; });
    prose.querySelectorAll('h3').forEach(h => {
      if (!h.textContent.includes('こんなこと')) return;
      const ul = h.nextElementSibling;
      if (ul && ul.tagName === 'UL') ul.classList.add('worries');
    });
    heads.forEach(h => {
      const t = h.firstChild;
      if (t && t.nodeType === 3 && /^[①-⑳]/.test(t.textContent)) {
        const c = t.textContent[0]; t.textContent = t.textContent.slice(1).trimStart();
        h.prepend(el('span', { class: 'badge', 'aria-hidden': 'true' }, c));
      }
    });
    prose.querySelectorAll('td').forEach(td => {
      const t = td.textContent.trim();
      if (/^[✕×]/.test(t)) td.classList.add('ng'); else if (/^[◯○]/.test(t)) td.classList.add('ok');
    });
    doc.append(prose);
    addRuby(doc.querySelector('.doc-head'), true); addRuby(prose);

    // 前後の章
    const avail = manifest.chapters.filter(c => c.file);
    const idx = avail.findIndex(c => c.id === id);
    const prev = avail[idx - 1], next = avail[idx + 1];
    doc.append(el('nav', { class: 'pager', 'aria-label': '前後の章' },
      prev ? el('a', { class: 'btn', href: '#ch-' + prev.id }, `← 第${+prev.id}章 ${prev.title}`) : el('span'),
      next ? el('a', { class: 'btn primary', href: '#ch-' + next.id }, `第${+next.id}章 ${next.title} →`) : el('a', { class: 'btn primary', href: '#note' }, 'わたしの命式ノートを見る →')));

    // サイド（この章の目次と進み具合）
    const side = el('aside', { class: 'side' });
    const p = progress(ch);
    const meter = el('i', { style: `width:${p.ratio * 100}%` });
    const ptxt = el('span');
    const upd = () => { const q = progress(ch); meter.style.width = q.ratio * 100 + '%'; ptxt.textContent = `この章のワーク ${q.done} ／ ${q.total}`; };
    upd(); onChange(() => {
      upd();
      S.meta.done = S.meta.done || {};
      if (progress(ch).ratio === 1 && !S.meta.done[id]) { S.meta.done[id] = true; save(); celebrate(info); }
    });
    side.append(el('div', { class: 'prog' }, ptxt, el('div', { class: 'meter' }, meter)));
    side.append(el('h3', null, 'この章の中身'));
    const tocList = el('ol');
    heads.forEach(h => tocList.append(el('li', null, el('a', { href: '#ch-' + id, 'data-t': h.id, onclick: e => { e.preventDefault(); h.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, h.textContent.replace(/^[①-⑳]\s*/, '')))));
    side.append(tocList);
    const chList = el('ol', { class: 'toc-chapters' });
    manifest.chapters.filter(c => c.file).forEach(c => chList.append(el('li', null, el('a', { href: '#ch-' + c.id, class: c.id === id ? 'on' : null }, `${+c.id}. ${c.title}`))));
    side.append(el('h3', { class: 'toc-chapters' }, 'ほかの章'), chList);

    app.replaceChildren(el('div', { class: 'chapter' }, side, doc));
    window.scrollTo(0, 0);
  }

  /* ───────── 画面：わたしの命式ノート（まとめ） ───────── */
  function viewBlueprint() {
    const head = el('header', { class: 'page-head' },
      el('h1', null, 'わたしの命式ノート'),
      el('p', null, 'これまでの章で書いた内容を、章ごとにまとめています。第18章の読解シートと合わせて、あなただけの命式の教科書になります。'),
      el('div', { class: 'row', style: 'margin-top:1rem' }, el('button', { type: 'button', class: 'btn primary', onclick: () => window.print() }, '印刷する／PDFにする'), el('a', { class: 'btn', href: '#data' }, '保存・書き出し')));
    const out = [head];
    let any = false;
    manifest.chapters.filter(c => c.file && chapters[c.id]).forEach(c => {
      const ch = chapters[c.id];
      const items = ch.works.filter(w => w.type !== 'display' && !isEmpty(S.a[w.id]));
      if (!items.length) return;
      any = true;
      const sec = el('section', { class: 'bp-section' }, el('h2', null, `第${+c.id}章　${c.title}`));
      items.forEach(w => {
        const v = S.a[w.id];
        const item = el('div', { class: 'bp-item' }, el('h3', null, w.label));
        if (w.type === 'mandala') item.append(el('div', { class: 'mandala-wrap' }, mandalaGrid(w, v)));
        else if (w.type === 'scale') { const s = scaleScore(w, v); item.append(el('div', { class: 'val' }, `${s.total}点 ／ ${s.max}点　${verdict(s.total, s.max)}\n` + s.groups.map(g => `${g.name}：${g.score}／${g.max}`).join('　'))); }
        else if ((w.type === 'table' || w.type === 'orgchart') && Array.isArray(v)) {
          const cols = (w.columns || w.fields || []).map(x => colSpec(x).label);
          const t = el('table');
          if (cols.length) t.append(el('tr', null, cols.map(x => el('th', null, x))));
          v.filter(r => !isEmpty(r)).forEach(r => t.append(el('tr', null, r.map(x => el('td', null, x || '')))));
          item.append(el('div', { class: 'tbl prose' }, t));
        } else item.append(el('div', { class: 'val' }, toText(v, w)));
        sec.append(item);
      });
      out.push(sec);
    });
    if (!any) out.push(el('div', { class: 'panel' }, el('h2', null, 'まだ何も書かれていません'), el('p', null, '章のワークに答えると、ここにまとまっていきます。'), el('a', { class: 'btn primary', href: '#ch-00' }, '第0章からはじめる')));
    app.replaceChildren(...out);
  }

  /* ───────── 画面：保存・書き出し ───────── */
  function download(name, blob) {
    const a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const stamp = () => new Date().toISOString().slice(0, 10);

  function viewData() {
    const upd = S.meta.updated ? new Date(S.meta.updated).toLocaleString('ja-JP') : 'まだ保存されていません';
    const file = el('input', { type: 'file', accept: 'application/json,.json', id: 'import-file', hidden: true });
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      try {
        const d = JSON.parse(await f.text());
        if (!d || typeof d.a !== 'object') throw new Error();
        S = { a: d.a || {}, c: d.c || {}, meta: d.meta || {} }; save(); toast('読みこみました'); viewData();
      } catch (e) { toast('このファイルは読みこめません。書き出したJSONファイルを選んでください'); }
    });
    const confirmBox = el('div', { class: 'confirm', hidden: true },
      el('p', { style: 'margin:0 0 .75rem;color:var(--warn);font-weight:700' }, '本当にすべて消しますか？ 元にはもどせません。先に書き出しておくと安心です。'),
      el('div', { class: 'row' },
        el('button', { type: 'button', class: 'btn danger', onclick: () => { S = blank(); try { localStorage.removeItem(KEY); } catch (e) {} toast('すべて消しました'); viewData(); } }, 'すべて消す'),
        el('button', { type: 'button', class: 'btn ghost', onclick: () => { confirmBox.hidden = true; } }, 'やめる')));
    app.replaceChildren(
      el('header', { class: 'page-head' }, el('h1', null, '保存・書き出し'), el('p', null, `入力した内容は、このブラウザの中に自動で保存されています（最後の保存：${upd}）。別のパソコンで続けたいときや、控えを残したいときは、ファイルに書き出してください。`)),
      el('section', { class: 'panel' }, el('h2', null, 'ファイルに書き出す'), el('p', null, 'JSONファイルは、あとで読みこんで続きから再開できます。Excelファイルは、章ごとのシートに質問と答えが並びます。'),
        el('div', { class: 'row' },
          el('button', { type: 'button', class: 'btn primary', onclick: () => download(`meishiki-note-${stamp()}.json`, new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' })) }, '続きから再開できるファイル（JSON）'),
          el('button', { type: 'button', class: 'btn', onclick: exportXlsx }, 'Excelファイル'))),
      el('section', { class: 'panel' }, el('h2', null, 'ファイルから読みこむ'), el('p', null, '書き出したJSONファイルを選ぶと、その内容で上書きされます。'),
        el('div', { class: 'row' }, el('label', { class: 'btn', for: 'import-file', tabindex: '0', onkeydown: e => { if (e.key === 'Enter') file.click(); } }, 'JSONファイルを選ぶ'), file)),
      el('section', { class: 'panel' }, el('h2', null, 'すべて消す'), el('p', null, 'このブラウザに保存されている入力内容を消します。'),
        el('button', { type: 'button', class: 'btn danger', onclick: () => { confirmBox.hidden = false; } }, '消す前に確認する'), confirmBox));
  }

  function exportXlsx() {
    if (!window.XLSX) { toast('Excelの書き出しを準備できませんでした。インターネット接続を確認してください'); return; }
    const wb = XLSX.utils.book_new();
    manifest.chapters.filter(c => chapters[c.id]).forEach(c => {
      const ch = chapters[c.id];
      const rows = [['質問', '答え']];
      ch.works.filter(w => w.type !== 'display').forEach(w => rows.push([w.label || w.id, toText(S.a[w.id], w)]));
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 50 }, { wch: 90 }];
      XLSX.utils.book_append_sheet(wb, ws, `${c.id}_${c.title}`.slice(0, 31).replace(/[\\/?*[\]:]/g, ''));
    });
    XLSX.writeFile(wb, `わたしの命式ノート_${stamp()}.xlsx`);
  }

  /* ───────── ルーティング ───────── */
  async function route() {
    viewAbort.abort(); viewAbort = new AbortController();
    const h = (location.hash || '#home').slice(1);
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === h || (h === '' && a.dataset.nav === 'home')));
    try {
      await loadAll();
      if (h.startsWith('ch-')) await viewChapter(h.slice(3));
      else if (h === 'note') viewBlueprint();
      else if (h === 'data') viewData();
      else await viewHome();
      document.title = (h.startsWith('ch-') && chapters[h.slice(3)] ? chapters[h.slice(3)].meta.title + '｜' : '') + SITE;
    } catch (e) {
      console.error(e);
      app.replaceChildren(el('div', { class: 'panel' }, el('h2', null, '章のファイルを読みこめませんでした'),
        el('p', null, 'このサイトは、Webサーバー経由で開く必要があります。GitHub Pagesで公開するか、パソコンで試すときはフォルダで「python -m http.server」を実行して http://localhost:8000 を開いてください。')));
    }
    app.focus({ preventScroll: true });
  }
  window.addEventListener('hashchange', route);
  route();
})();

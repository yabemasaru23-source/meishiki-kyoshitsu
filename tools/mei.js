#!/usr/bin/env node
/**
 * 教材の例に使う命式を計算する（本体と検証エンジンの両方で計算し、照合する）
 *   node tools/mei.js 1998-5-14-14            年-月-日-時（時刻なしは 1966-7-3）
 *   node tools/mei.js 1998-5-14-14 女性        性別を足すと大運（本体の計算）と年運も出す
 * 教材フォルダ（meishiki-kyoshitsu）は、アプリ本体（../index.html）と同じ 陰陽五行サイト/ の中に置くこと。
 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const base = path.join(__dirname, '..', '..');
const IND = require(path.join(base, 'verify', 'independent-engine.js'));
const html = fs.readFileSync(path.join(base, 'index.html'), 'utf8');
const s = html.indexOf('/* ================= 定数'), e = html.indexOf('/* ================= 描画');
const ctx = { console }; vm.createContext(ctx);
vm.runInContext(html.slice(s, e) + '\nthis.__C = { KAN, SHI, KAN_Y };', ctx);
const { KAN, SHI, KAN_Y } = ctx.__C;

function show(y, m, d, h, sex) {
  const A = ctx.meishiki(y, m, d, h == null ? '' : String(h)), B = IND.fullMeishiki(y, m, d, h);
  const K = { 年柱: 'year', 月柱: 'month', 日柱: 'day', 時柱: 'hour' }; let ok = true;
  for (const c of A.cols) { const p = B[K[c.name]]; if (!p) continue;
    if (c.ganshi !== p.name || c.zokan !== p.zokan || (c.tsuhen ?? '—') !== p.tsuhen || c.zoTsu !== p.zokanTsuhen || c.unsei !== p.unsei || c.energy !== p.energy) ok = false; }
  for (const g of '木火土金水') if (A.count[g] !== B.gyo[g]) ok = false;
  if (A.tcsDay !== B.tcsDay || A.tcsYear !== B.tcsYear) ok = false;
  console.log(`\n${y}-${m}-${d} ${h ?? '時刻なし'}  照合:${ok ? '一致' : '★不一致'}  節:${A.setsu.name}${A.setsu.days}日目（次の節まで${A.nextSetsuDays}日）  年柱の基準年:${A.setsuYear}  日干:${A.nikkan}  天中殺 日${A.tcsDay}/年${A.tcsYear} 生日中殺:${!!A.seijitsu} 生月中殺:${!!A.seigetsu}`);
  for (const c of A.cols) console.log(`  ${c.name} ${c.ganshi}(${c.kanG}/${c.shiG}) No.${c.no} 蔵干${c.zokan} 通変${c.tsuhen ?? '—'} 蔵通${c.zoTsu} ${c.unsei}(${c.energy})`);
  console.log('  五行', JSON.stringify(A.count));
  if (!sex) return;
  // 大運：本体 drawKantei の計算をそのまま写したもの（検証エンジンには大運がないので照合はできない）
  const nenKanYin = KAN_Y[(A.setsuYear - 4 + 1000) % 10];
  const jun = sex === '男性' ? !nenKanYin : sex === '女性' ? !!nenKanYin : null;
  if (jun === null) { console.log('  大運：性別が「回答しない」なので出ない'); return; }
  const monNo = A.cols[1].no;
  const startAge = Math.max(1, Math.round((jun ? A.nextSetsuDays : A.setsu.days) / 3));
  console.log(`  大運：${jun ? '順行' : '逆行'}（${nenKanYin ? '陰' : '陽'}年・${sex}）${startAge}歳から`);
  for (let i = 0; i < 8; i++) {
    const idx = ((monNo - 1 + (jun ? i + 1 : -(i + 1))) % 60 + 600) % 60;
    const gs = KAN[idx % 10] + SHI[idx % 12], fromAge = startAge + i * 10;
    console.log(`    ${fromAge}歳〜（${y + fromAge}〜${y + fromAge + 9}年） ${gs}  通変:${ctx.tsuhen(A.nikkan, gs[0])} 十二運:${ctx.unsei(A.nikkan, gs[1])}`);
  }
  const yrs = []; for (let Y = 2024; Y <= 2033; Y++) { const idx = ((Y - 4) % 60 + 60) % 60; const gs = KAN[idx % 10] + SHI[idx % 12];
    yrs.push(`${Y}${gs}(${ctx.tsuhen(A.nikkan, gs[0])}/${ctx.unsei(A.nikkan, gs[1])}${A.tcsDay.includes(gs[1]) ? '/天中殺' : ''})`); }
  console.log('  年運', yrs.join(' '));
}
const args = process.argv.slice(2), sex = args.find(a => /性|回答/.test(a));
for (const a of args.filter(a => a !== sex)) { const [y, m, d, h] = a.split(/[-_]/).map(Number); show(y, m, d, isNaN(h) ? null : h, sex); }

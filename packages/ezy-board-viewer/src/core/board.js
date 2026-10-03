/* eslint-disable */
// 解析 / 渲染 / 导出核心（无 Vue 依赖）。格式说明见 zykj-board-format-spec.md
/* ---------- protobuf 通用解码（按字段号读取，无需 .proto） ---------- */
const td = new TextDecoder(), tmp = new DataView(new ArrayBuffer(4));
function pb(u8) {
  const m = {}, dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let p = 0;
  const vi = () => { let r = 0n, s = 0n, b; do { b = u8[p++]; r |= BigInt(b & 127) << s; s += 7n; } while (b & 128); return r; };
  while (p < u8.length) {
    const k = Number(vi()), f = k >>> 3, w = k & 7; let v;
    if (w === 0) v = vi();
    else if (w === 5) { v = dv.getUint32(p, true); p += 4; }
    else if (w === 1) { v = null; p += 8; }
    else if (w === 2) { const l = Number(vi()); v = u8.subarray(p, p + l); p += l; }
    else throw Error('无法解析 protobuf（wire type ' + w + '），文件可能不是该格式');
    (m[f] ??= []).push({ w, v });
  }
  return m;
}
const G = (m, n) => m && m[n] && m[n][0];
const I = (m, n, d = 0) => { const e = G(m, n); return e && e.w === 0 ? Number(BigInt.asIntN(32, e.v)) : d; };
const F = (m, n, d = 0) => { const e = G(m, n); if (!e || e.w !== 5) return d; tmp.setUint32(0, e.v, true); return tmp.getFloat32(0, true); };
const S = (m, n) => { const e = G(m, n); return e && e.w === 2 ? td.decode(e.v) : ''; };
const M = (m, n) => { const e = G(m, n); return e && e.w === 2 ? pb(e.v) : null; };
const A = (m, n) => ((m && m[n]) || []).map(e => pb(e.v));

/* ---------- 最小 zip 读取（deflate 用浏览器自带的 DecompressionStream） ---------- */
async function readZip(buf) {
  try { new DecompressionStream('deflate-raw'); } catch {
    const { default: JSZip } = await import('jszip');
    const archive = await JSZip.loadAsync(buf);
    return { names: Object.keys(archive.files).filter(n => !archive.files[n].dir), read: async name => archive.file(name)?.async('uint8array') ?? null };
  }
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  let e = u8.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw Error('不是有效的 zip 文件');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const ents = {};
  for (let i = 0; i < n && dv.getUint32(p, true) === 0x02014b50; i++) {
    const method = dv.getUint16(p + 10, true), cs = dv.getUint32(p + 20, true),
      nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true),
      off = dv.getUint32(p + 42, true);
    const name = td.decode(u8.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + el + cl;
    if (cs === 0xFFFFFFFF || off === 0xFFFFFFFF) throw Error('暂不支持 zip64');
    if (!name.endsWith('/')) ents[name] = { method, cs, off };
  }
  const read = async name => {
    const z = ents[name]; if (!z) return null;
    const s = z.off + 30 + dv.getUint16(z.off + 26, true) + dv.getUint16(z.off + 28, true);
    const d = u8.subarray(s, s + z.cs);
    if (z.method === 0) return d;
    if (z.method !== 8) throw Error('不支持的压缩方式 ' + z.method);
    return new Uint8Array(await new Response(new Blob([d]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  };
  return { names: Object.keys(ents), read };
}

/* ---------- 渲染 ---------- */
const r2 = v => +v.toFixed(2);
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const col = c => ['#' + ((c & 0xFFFFFF) | 0x1000000).toString(16).slice(1), r2(((c >>> 24) & 255) / 255)];
const b64 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const mime = u => u[0] === 0x89 ? 'image/png' : u[0] === 0xFF ? 'image/jpeg' : u[0] === 0x47 ? 'image/gif' : u[8] === 0x57 ? 'image/webp' : 'image/png';
// Android Matrix [sx kx tx; ky sy ty] → SVG matrix(a b c d e f)
const mx = m => { if (!m) return null; const sx = F(m, 2), sy = F(m, 6); if (!sx && !sy) return null; return [sx, F(m, 5), F(m, 3), sy, F(m, 4), F(m, 7)]; };
const rc = g => { const r = M(g, 3); return [F(r, 1), F(r, 2), F(r, 3), F(r, 4)]; };
const strokeAttr = pa => {
  const [k, o] = col(I(pa, 2, -16777216)), sp = F(pa, 3), il = F(pa, 4);
  return `fill="none" stroke="${k}" stroke-opacity="${o}" stroke-width="${r2(F(pa, 1, 2))}" stroke-linecap="round" stroke-linejoin="round"` + (sp > 0 ? ` stroke-dasharray="${r2(il || 1)} ${r2(sp)}"` : '');
};

async function pageSvg(zip, dir, root) {
  const rd = async n => { const b = await zip.read(dir + n); return b && pb(b); };
  const h = await rd('header.bin'), sn = await rd('snapshot.bin');
  if (!h || !sn) throw Error('缺少 header.bin 或 snapshot.bin');
  const W = I(h, 2, 1080), H = I(h, 3, 1920), cache = {}, imgs = {};
  const src = async n => (cache[n] ??= (await rd(n)) || {});
  const item = async (g, n) => A(await src(S(g, 6)), n)[I(g, 7)];

  async function stroke(g) {
    let pts, pa;
    const ti = S(g, 6) && await item(g, 1);
    if (ti) { pts = A(ti, 1).map(e => [F(e, 3), F(e, 4)]); pa = M(ti, 2); }
    if (!pts || !pts.length) { pts = A(g, 11).map(e => [F(e, 1), F(e, 2)]); pa = M(g, 9); }
    if (!pts.length) return '';
    if (pts.length === 1) return `<circle cx="${r2(pts[0][0])}" cy="${r2(pts[0][1])}" r="${r2(F(pa, 1, 2) / 2)}" fill="${col(I(pa, 2, -16777216))[0]}"/>`;
    // 手绘笔迹：与 Android 常见做法一致，用相邻点中点做二次贝塞尔平滑；直线（BEELINE）保持折线
    const q = (a, b) => r2(a) + ' ' + r2(b), n = pts.length;
    let d = 'M' + q(...pts[0]);
    if (I(g, 2) === 3 && n > 2) {
      for (let i = 1; i < n - 1; i++) d += 'Q' + q(...pts[i]) + ' ' + q((pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
      d += 'L' + q(...pts[n - 1]);
    } else for (let i = 1; i < n; i++) d += 'L' + q(...pts[i]);
    return `<path d="${d}" ${strokeAttr(pa)}/>`;
  }
  async function text(g) {
    let c = '', pa = M(g, 9);
    const ti = S(g, 6) && await item(g, 1);
    if (ti) { c = S(ti, 1); pa = M(ti, 2) || pa; }
    c = c || S(g, 10); if (!c) return '';
    const sz = F(pa, 6, 40) || 40, [k, o] = col(I(pa, 2, -16777216)), [l, t] = rc(g);
    return `<text font-family="'PingFang SC','Microsoft YaHei','Noto Sans CJK SC',sans-serif" font-size="${r2(sz)}" fill="${k}" fill-opacity="${o}" xml:space="preserve">` +
      c.split('\n').map((s, i) => `<tspan x="${r2(l)}" y="${r2(t + sz * (0.85 + i * 1.25))}">${esc(s)}</tspan>`).join('') + '</text>';
  }
  async function image(g) {
    const fi = S(g, 6) && await item(g, 1), name = (fi && S(fi, 1)) || S(g, 12), [l, t, r, b] = rc(g);
    const key = name && (zip.names.find(n => n === root + 'res/image/' + name) || zip.names.find(n => n.split('/').pop() === name.split('/').pop()));
    if (!key) return `<rect x="${l}" y="${t}" width="${r - l}" height="${b - t}" fill="#8883"/><text x="${l + 8}" y="${t + 32}" font-size="24" fill="#c92a2a">缺少图片 ${esc(name || '')}</text>`;
    if (!imgs[key]) { const u = await zip.read(key); imgs[key] = `data:${mime(u)};base64,${b64(u)}`; }
    return `<image x="${r2(l)}" y="${r2(t)}" width="${r2(r - l)}" height="${r2(b - t)}" preserveAspectRatio="none" xlink:href="${imgs[key]}"/>`;
  }
  async function geom(g) {   // 几何图形：样本里没有，按 proto 推断，未经验证
    const gi = S(g, 6) && await item(g, 1); if (!gi) return '';
    const pts = A(gi, 2).map(e => [F(e, 1), F(e, 2)]), a = strokeAttr(M(gi, 3));
    if (I(gi, 1) === 1 && pts.length) return `<polygon points="${pts.map(p => r2(p[0]) + ',' + r2(p[1])).join(' ')}" ${a}/>`;
    let [l, t, r, b] = rc(g);
    if (pts.length >= 2) { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); l = Math.min(...xs); r = Math.max(...xs); t = Math.min(...ys); b = Math.max(...ys); }
    return `<ellipse cx="${r2((l + r) / 2)}" cy="${r2((t + b) / 2)}" rx="${r2((r - l) / 2)}" ry="${r2((b - t) / 2)}" ${a}/>`;
  }
  async function node(g) {
    const t = I(g, 2), m = mx(M(g, 4));
    let s = t === 2 ? await image(g) : t === 3 || t === 4 ? await stroke(g) : t === 5 ? await text(g) : t === 6 ? await geom(g) : '';
    for (const c of A(g, 5)) s += await node(c);
    return m ? `<g transform="matrix(${m.map(r2).join(' ')})">${s}</g>` : s;
  }

  const bgc = h[11] ? I(h, 11) : h[10] ? I(h, 10) : -1, [bk, bo] = col(bgc);
  let lines = '';
  const lc = M(h, 14) || M(h, 13);   // 背景线：横线 / 交错（按网格画）
  if (lc) {
    const [k, o] = col(I(lc, 1)), sp = F(lc, 2), w = F(lc, 4) || 1;
    if (o > 0 && sp > 0) {
      let d = ''; for (let y = sp; y < H; y += sp) d += `M0 ${r2(y)}H${W}`;
      if (I(lc, 3) === 1) for (let x = sp; x < W; x += sp) d += `M${r2(x)} 0V${H}`;
      lines = `<path d="${d}" stroke="${k}" stroke-opacity="${o}" stroke-width="${r2(w)}" fill="none"/>`;
    }
  }
  const cam = mx(M(sn, 1)), body = await node(M(sn, 2) || {});
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="${bk}" fill-opacity="${bo}"/>${lines}` +
    (cam ? `<g transform="matrix(${cam.map(r2).join(' ')})">${body}</g>` : body) + '</svg>';
}

async function convert(buf) {
  const zip = buf && buf.names ? buf : await readZip(buf);
  const rp = zip.names.find(n => n.split('/').pop() === 'page_router.bin');
  let root = '', pages;
  if (rp) {
    root = rp.slice(0, rp.lastIndexOf('/') + 1);
    pages = A(pb(await zip.read(rp)), 1).map((m, i) => ({ dir: root + S(m, 1) + '/', idx: I(m, 2, i) })).sort((a, b) => a.idx - b.idx);
  } else {
    pages = zip.names.filter(n => n.endsWith('snapshot.bin')).map((n, i) => ({ dir: n.slice(0, -12), idx: i }));
  }
  if (!pages.length) throw Error('没有找到页面（缺少 page_router.bin / snapshot.bin）');
  const out = [];
  for (const p of pages) {
    try { out.push({ svg: await pageSvg(zip, p.dir, root) }); }
    catch (e) { out.push({ err: e.message }); }
  }
  return out;
}


/* ================= 录制识别与回放 ================= */
const ID = [1, 0, 0, 1, 0, 0];
const mul = (A_, B_) => [A_[0]*B_[0]+A_[2]*B_[1], A_[1]*B_[0]+A_[3]*B_[1], A_[0]*B_[2]+A_[2]*B_[3], A_[1]*B_[2]+A_[3]*B_[3], A_[0]*B_[4]+A_[2]*B_[5]+A_[4], A_[1]*B_[4]+A_[3]*B_[5]+A_[5]];
const L64 = (m, n) => { const e = G(m, n); return e && e.w === 0 ? Number(BigInt.asIntN(64, e.v)) : 0; };
const rgba = c => { const [k, o] = col(c); return `rgba(${parseInt(k.slice(1, 3), 16)},${parseInt(k.slice(3, 5), 16)},${parseInt(k.slice(5, 7), 16)},${o})`; };
const AUDIO_RE = /\.(mp3|aac|m4a|wav|ogg|opus|amr|flac)$/i;
const AMIME = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/ogg', amr: 'audio/amr', flac: 'audio/flac' };
const ts = ms => { ms = Math.max(0, Math.round(ms)); return `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`; };

async function pagesOf(zip) {
  const rp = zip.names.find(n => n.split('/').pop() === 'page_router.bin');
  if (rp) {
    const root = rp.slice(0, rp.lastIndexOf('/') + 1);
    return { root, pages: A(pb(await zip.read(rp)), 1).map((m, i) => ({ dir: root + S(m, 1) + '/', idx: I(m, 2, i) })).sort((a, b) => a.idx - b.idx) };
  }
  return { root: '', pages: zip.names.filter(n => n.endsWith('snapshot.bin')).map((n, i) => ({ dir: n.slice(0, -12), idx: i })) };
}

// 识别：有音频文件 / AUDIO_START / RECORD_STOP / 激光笔 / Header.duration>0 / router.audioRecord 任一即视为录制
async function detect(zip) {
  const why = [], au = zip.names.filter(n => AUDIO_RE.test(n));
  if (au.length) why.push(`含 ${au.length} 个音频文件`);
  const { pages } = await pagesOf(zip), E = new Set(); let dur = 0, ar = 0;
  for (const pg of pages) {
    const cf = zip.names.find(n => n.startsWith(pg.dir) && n.endsWith('_command.bin'));
    if (cf) for (const m of A(pb(await zip.read(cf)), 1)) E.add(I(m, 4));
    const h = await zip.read(pg.dir + 'header.bin'); if (h) dur = Math.max(dur, L64(pb(h), 6));
    const r = await zip.read(pg.dir + 'router.bin'); if (r && pb(r)[2]) ar++;
  }
  if (E.has(6)) why.push('命令流含 AUDIO_START');
  if (E.has(10)) why.push('命令流含 RECORD_STOP');
  if (E.has(11)) why.push('命令流含激光笔');
  if (dur > 0) why.push(`Header.duration=${dur}ms`);
  if (ar) why.push('router 含 audioRecord');
  return why;
}

// 读取所有页：时间轴严格取自命令的 delayTime/duration；数据文件里的 eventTime 决定命令内部的动画进度
async function loadRec(zip) {
  const { root, pages } = await pagesOf(zip), Pg = [], clips = [], imgs = {}, Dm = new Map();
  let T = 0, hdur = 0;
  const addClip = async (name, dur, ta, tb) => {
    const key = zip.names.find(n => n.split('/').pop() === name.split('/').pop());
    if (!key) return clips.push({ name, ta, tb, t0: ta, dur, missing: true });
    const u = await zip.read(key), ext = key.split('.').pop().toLowerCase();
    clips.push({ name, ta, tb, t0: ta, dur, buf: u.slice(), url: URL.createObjectURL(new Blob([u], { type: AMIME[ext] || '' })) });
  };
  for (const pg of pages) {
    const rd = async n => { const b = await zip.read(pg.dir + n); return b && pb(b); };
    const h = await rd('header.bin'), cf = zip.names.find(n => n.startsWith(pg.dir) && n.endsWith('_command.bin'));
    if (!h || !cf) continue;
    const cache = {}, src = async n => n ? (cache[n] ??= (await rd(n.split('/').pop())) || {}) : {};
    const res = async (type, file, sid, g) => {
      const k = pg.dir + file + '#' + sid + '#' + type; if (Dm.has(k)) return Dm.get(k);
      const o = {}, it = file ? A(await src(file), 1)[sid] : null;
      if (type === 2) {
        const name = (it && S(it, 1)) || (g && S(g, 12)), key = name && (zip.names.find(n => n === root + 'res/image/' + name) || zip.names.find(n => n.split('/').pop() === name.split('/').pop()));
        if (key) { imgs[key] ??= await createImageBitmap(new Blob([await zip.read(key)])); o.img = imgs[key]; }
      } else if ((type === 3 || type === 4) && it) { o.pts = A(it, 1).map(e => ({ x: F(e, 3), y: F(e, 4), t: L64(e, 1) })); o.paint = M(it, 2); }
      else if (type === 5 && it) { o.content = S(it, 1); o.paint = M(it, 2); }
      else if (type === 6 && it) { o.geo = I(it, 1); o.gp = A(it, 2).map(e => ({ x: F(e, 1), y: F(e, 2) })); o.paint = M(it, 3); }
      Dm.set(k, o); return o;
    };
    const fin = async (t, g, snap) => {      // 把数据文件内容并入图元模板
      const d = await res(t.type, t.file, t.sid, g);
      return Object.assign(t, { img: d.img, pts: d.pts, geo: d.geo, gp: d.gp || (snap && t.type === 6 ? A(g, 11).map(e => ({ x: F(e, 1), y: F(e, 2) })) : undefined),
        paint: (snap && M(g, 9)) || d.paint, content: (snap && S(g, 10)) || d.content });
    };
    const walk = async (g, par, out) => {
      const t = { id: S(g, 1), type: I(g, 2), par, rect: rc(g), m: mx(M(g, 4)) || ID, file: S(g, 6), sid: I(g, 7) };
      out.push(await fin(t, g, true));
      for (const c of A(g, 5)) await walk(c, t.id, out);
    };
    const frames = async (file, sid) => A(A(await src(file), 1)[sid], 1).map(m => ({ t: L64(m, 1), m: mx(m) || ID }));
    const cmds = A(pb(await zip.read(cf)), 1).map(m => ({ d: L64(m, 1), u: L64(m, 2), e: I(m, 4), x: G(m, 5) ? pb(G(m, 5).v) : {} }));
    let prev = 0;
    for (const c of cmds) {
      c.s = prev + c.d; prev = c.s + c.u; const x = c.x;
      if (c.e === 1) c.o = await fin({ id: S(x, 2), type: I(x, 1), par: S(x, 4), rect: rc(x), file: S(x, 5), sid: I(x, 6) }, x, false);
      else if (c.e === 3) { c.ids = A(x, 1).map(g => S(g, 2)); c.f = await frames(S(x, 4), I(x, 5)); }
      else if (c.e === 8) { c.ids = ['#cam']; c.f = await frames(S(x, 3), I(x, 4)); }
      else if (c.e === 11) { const it = A(await src(S(x, 1)), 1)[I(x, 2)]; c.cur = it ? A(it, 1).map(e => ({ x: F(e, 3), y: F(e, 4), t: L64(e, 1) })) : []; }
      else if (c.e === 12) { c.rb = []; const r = M(x, 1); if (r) await walk(r, '', c.rb); }
      else if (c.e === 6) await addClip(S(x, 1), L64(x, 2) || c.u, T + c.s, T + c.s);
    }
    // 录制格式：音频起点在独立的 *_audio.bin（router.audioRecord），它本身是一个 CommandSource，命令为 AUDIO_START
    const af = zip.names.find(n => n.startsWith(pg.dir) && n.endsWith('_audio.bin'));
    if (af) {
      const segs = [0, ...cmds.filter(c => c.e === 10).map(c => c.s)];   // 录制分段起点：0, 各 RECORD_STOP
      let pa = 0, k = 0;
      for (const m of A(pb(await zip.read(af)), 1)) {
        const d = L64(m, 1), u = L64(m, 2), s0 = pa + d; pa = s0 + u;
        if (I(m, 4) !== 6 || !G(m, 5)) continue;
        const x = pb(G(m, 5).v);
        await addClip(S(x, 1), L64(x, 2) || u, T + s0, segs[k] === undefined ? T + s0 : T + segs[k] + d); k++;
      }
    }
    hdur = Math.max(hdur, L64(h, 6));
    Pg.push({ off: T, len: prev, line: M(h, 14) || M(h, 13), cmds, W: I(h, 2, 1080), H: I(h, 3, 1920), bg: h[11] ? I(h, 11) : h[10] ? I(h, 10) : -1 });
    T += prev;
  }
  if (!Pg.length) throw Error('没有可播放的页面');
  const aend = Math.max(0, ...clips.map(c => Math.max(c.ta, c.tb) + c.dur));
  return { P: Pg, clips: clips.filter(c => !c.missing), missing: clips.filter(c => c.missing), total: Math.max(T, aend, hdur) };
}

// 某页在局部时间 lt 的状态（从头重放命令，便于拖动进度）
function stateAt(P, lt) {
  const objs = new Map(), cam = { m: ID }; let bg = P.bg, line = P.line, cursor = null;
  const get = id => id === '#cam' ? cam : objs.get(id);
  for (const c of P.cmds) {
    if (c.s > lt) break;
    const el = lt - c.s, done = lt >= c.s + c.u, x = c.x;
    if (c.e === 1) { const o = { ...c.o, m: ID }; if (o.pts && o.pts.length) { const p0 = o.pts[0].t; o.n = done ? o.pts.length : o.pts.filter(p => p.t - p0 <= el).length; } objs.set(o.id, o); }
    else if (c.e === 2) A(x, 1).forEach(g => objs.delete(S(g, 2)));
    else if (c.e === 3 || c.e === 8) for (const id of c.ids) {
      const o = get(id); if (!o || !c.f.length) continue;
      if (done) o.m = mul(c.f[c.f.length - 1].m, o.m);
      else { let k = 0; while (k + 1 < c.f.length && c.f[k + 1].t - c.f[0].t <= el) k++; o.mt = mul(c.f[k].m, o.m); }
    }
    else if (c.e === 4) { const o = objs.get(S(x, 1)); if (o) { if (M(x, 3)) o.rect = rc(x); if (S(x, 4)) o.content = S(x, 4); if (M(x, 5)) o.paint = M(x, 5); const pl = A(x, 6); if (pl.length) o.gp = pl.map(e => ({ x: F(e, 1), y: F(e, 2) })); } }
    else if (c.e === 7) cam.m = mx(M(x, 2)) || ID;
    else if (c.e === 9) { if (x[2]) bg = I(x, 2); if (M(x, 4)) line = M(x, 4); }
    else if (c.e === 11) { if (c.cur && c.cur.length && !done) { let k = 0; while (k + 1 < c.cur.length && c.cur[k + 1].t - c.cur[0].t <= el) k++; cursor = c.cur[k]; } }
    else if (c.e === 12) { objs.clear(); c.rb.forEach(t => objs.set(t.id, { ...t, n: t.pts ? t.pts.length : 0 })); if (x[2]) bg = I(x, 2); if (M(x, 3)) line = M(x, 3); }
  }
  return { objs, cam, bg, line, cursor };
}

function shape(ctx, o) {
  const [l, t, r, b] = o.rect, p = o.paint, c = rgba(I(p, 2, -16777216)), sp = F(p, 3), il = F(p, 4);
  ctx.strokeStyle = ctx.fillStyle = c; ctx.lineWidth = F(p, 1, 2); ctx.lineCap = ctx.lineJoin = 'round'; ctx.setLineDash(sp > 0 ? [il || 1, sp] : []);
  if (o.type === 2 && o.img) ctx.drawImage(o.img, l, t, r - l, b - t);
  else if ((o.type === 3 || o.type === 4) && o.pts) {
    const q = o.pts.slice(0, o.n ?? o.pts.length), n = q.length; if (!n) return;
    if (n === 1) { ctx.beginPath(); ctx.arc(q[0].x, q[0].y, F(p, 1, 2) / 2, 0, 7); ctx.fill(); return; }
    const P2 = new Path2D(); P2.moveTo(q[0].x, q[0].y);
    if (o.type === 3 && n > 2) { for (let i = 1; i < n - 1; i++) P2.quadraticCurveTo(q[i].x, q[i].y, (q[i].x + q[i + 1].x) / 2, (q[i].y + q[i + 1].y) / 2); P2.lineTo(q[n - 1].x, q[n - 1].y); }
    else for (let i = 1; i < n; i++) P2.lineTo(q[i].x, q[i].y);
    ctx.stroke(P2);
  } else if (o.type === 5 && o.content) {
    const sz = F(p, 6, 40) || 40; ctx.font = `${sz}px "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif`;
    o.content.split('\n').forEach((s, i) => ctx.fillText(s, l, t + sz * (0.85 + i * 1.25)));
  } else if (o.type === 6) {
    const gp = o.gp || [];
    if (o.geo === 1 && gp.length) { ctx.beginPath(); gp.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath(); ctx.stroke(); }
    else { let L = l, T_ = t, R = r, B = b; if (gp.length >= 2) { L = Math.min(...gp.map(q => q.x)); R = Math.max(...gp.map(q => q.x)); T_ = Math.min(...gp.map(q => q.y)); B = Math.max(...gp.map(q => q.y)); }
      ctx.beginPath(); ctx.ellipse((L + R) / 2, (T_ + B) / 2, Math.abs(R - L) / 2, Math.abs(B - T_) / 2, 0, 0, 7); ctx.stroke(); }
  }
}
function paintPage(ctx, P, lt, s) {
  const st = stateAt(P, lt);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(s, 0, 0, s, (ctx.canvas.width - P.W * s) / 2, (ctx.canvas.height - P.H * s) / 2); ctx.fillStyle = rgba(st.bg); ctx.fillRect(0, 0, P.W, P.H);
  const lc = st.line;
  if (lc && F(lc, 2) > 0 && ((I(lc, 1) >>> 24) & 255) > 0) {          // 背景线：横线 / 交错（按网格画）🔶
    const sp = F(lc, 2); ctx.save(); ctx.strokeStyle = rgba(I(lc, 1)); ctx.lineWidth = F(lc, 4) || 1; ctx.setLineDash([]); ctx.beginPath();
    for (let y = sp; y < P.H; y += sp) { ctx.moveTo(0, y); ctx.lineTo(P.W, y); }
    if (I(lc, 3) === 1) for (let x = sp; x < P.W; x += sp) { ctx.moveTo(x, 0); ctx.lineTo(x, P.H); }
    ctx.stroke(); ctx.restore();
  }
  ctx.transform(...(st.cam.mt || st.cam.m));
  const kids = new Map();
  for (const o of st.objs.values()) { const k = st.objs.has(o.par) ? o.par : ''; (kids.get(k) || kids.set(k, []).get(k)).push(o); }
  const go = o => { ctx.save(); ctx.transform(...(o.mt || o.m)); shape(ctx, o); (kids.get(o.id) || []).forEach(go); ctx.restore(); };
  (kids.get('') || []).forEach(go);
  if (st.cursor) { ctx.save(); ctx.setLineDash([]); ctx.fillStyle = 'rgba(255,40,40,.75)'; ctx.beginPath(); ctx.arc(st.cursor.x, st.cursor.y, 14, 0, 7); ctx.fill(); ctx.restore(); }   // 激光笔 🔶
}
const pageAt = (R, gt) => { const p = R.P.find(x => gt < x.off + x.len) || R.P[R.P.length - 1]; return [p, Math.min(Math.max(gt - p.off, 0), p.len)]; };

/* ---------- MP4 导出（WebCodecs，离线逐帧渲染，时间戳 = 文件时间轴） ---------- */
async function exportMp4(R, q, log = () => {}, signal) {
  if (!globalThis.VideoEncoder) throw Error('当前浏览器不支持 WebCodecs，请使用最新版 Chrome / Edge');
  const check = () => { if (signal?.aborted) throw new DOMException('已取消', 'AbortError'); };
  check();
  if (!R.P.length || !Number.isFinite(R.total) || R.total <= 0) throw Error('录制时长无效');
  if (!q || !Number.isFinite(q.long) || q.long < 2 || q.long > 4096 || !Number.isFinite(q.kbps) || q.kbps <= 0) throw Error('导出画质参数无效');
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
  const p0 = R.P[0], k = q.long / Math.max(p0.W, p0.H), w = Math.round(p0.W * k / 2) * 2, h = Math.round(p0.H * k / 2) * 2, fps = 30;
  const vcfg = { codec: 'avc1.640032', width: w, height: h, bitrate: q.kbps * 1000, framerate: fps };
  let supported = false;
  for (const codec of ['avc1.640032', 'avc1.4d0028', 'avc1.420028']) {
    vcfg.codec = codec;
    try { if ((await VideoEncoder.isConfigSupported(vcfg)).supported) { supported = true; break; } } catch {}
  }
  check();
  if (!supported) throw Error('当前设备不支持该画质的 H.264 编码，请降低画质或使用 Windows 版');
  let audio = null;
  if (R.clips.length) {
    const acfg = { codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 };
    if (globalThis.AudioEncoder && (await AudioEncoder.isConfigSupported(acfg)).supported) {
      log('mix', 0);
      const oc = new OfflineAudioContext(2, Math.ceil(R.total / 1000 * 48000), 48000);
      for (const c of R.clips) { const s = oc.createBufferSource(); check(); s.buffer = await oc.decodeAudioData(c.buf.slice().buffer); check(); s.connect(oc.destination); s.start(c.t0 / 1000); }   // 起点 = 文件里的开始时间
      audio = { buf: await oc.startRendering(), cfg: acfg };
    } else log('noaudio', 0);
  }
  const mux = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: w, height: h }, ...(audio ? { audio: { codec: 'aac', numberOfChannels: 2, sampleRate: 48000 } } : {}), fastStart: 'in-memory' });
  check();
  let err = null, aenc = null, venc = null;
  const ready = () => { check(); if (err) throw err; };
  const drain = async encoder => { while (encoder.encodeQueueSize > 8) { ready(); await new Promise(r => setTimeout(r, 4)); } ready(); };
  try {
  venc = new VideoEncoder({ output: (c, m) => mux.addVideoChunk(c, m), error: e => err = e }); venc.configure(vcfg);
  if (audio) {
    aenc = new AudioEncoder({ output: (c, m) => mux.addAudioChunk(c, m), error: e => err = e }); aenc.configure(audio.cfg);
    const a0 = audio.buf.getChannelData(0), a1 = audio.buf.getChannelData(1);
    for (let i = 0; i < a0.length; i += 48000) {
      const n = Math.min(48000, a0.length - i), d = new Float32Array(n * 2); d.set(a0.subarray(i, i + n)); d.set(a1.subarray(i, i + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(i / 48000 * 1e6), data: d });
      try { ready(); aenc.encode(ad); } finally { ad.close(); }
      await drain(aenc);
    }
    await aenc.flush();
  }
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const cx = cv.getContext('2d');
  const N = Math.ceil(R.total / 1000 * fps);
  for (let i = 0; i < N; i++) {
    ready();
    const [p, lt] = pageAt(R, i * 1000 / fps);
    paintPage(cx, p, lt, Math.min(w / p.W, h / p.H));
    const fr = new VideoFrame(cv, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
    try { venc.encode(fr, { keyFrame: i % (fps * 2) === 0 }); } finally { fr.close(); }
    await drain(venc);
    if (i % 10 === 0) { log('encode', i / N); await new Promise(r => setTimeout(r, 0)); }
  }
  await venc.flush(); ready(); mux.finalize(); log('encode', 1);
  return new Blob([mux.target.buffer], { type: 'video/mp4' });
  } finally {
    if (aenc && aenc.state !== 'closed') aenc.close();
    if (venc && venc.state !== 'closed') venc.close();
  }
}


/* ---------- 文件列表 / 来源 ---------- */
const normPath = p => String(p).replace(/\\/g, '/').replace(/^(\.?\/)+/, '')
/** [{ path, blob }]（或 { name, data/file }）→ 与 readZip 同接口的虚拟文件系统 */
function toVfs(list) {
  const m = new Map()
  for (const e of list) {
    const path = e.path ?? e.name, data = e.blob ?? e.data ?? e.file
    if (path == null || data == null) throw Error('文件列表的每一项需要 path 和 blob')
    if (!String(path).endsWith('/')) m.set(normPath(path), data)
  }
  const read = async n => {
    const d = m.get(n); if (d == null) return null
    if (d instanceof Uint8Array) return d
    if (d instanceof ArrayBuffer) return new Uint8Array(d)
    if (ArrayBuffer.isView(d)) return new Uint8Array(d.buffer, d.byteOffset, d.byteLength)
    return new Uint8Array(await d.arrayBuffer())
  }
  return { names: [...m.keys()], read }
}
/** zip（Blob/ArrayBuffer/Uint8Array/URL）、文件列表、画板生成器 → 统一的 { names, read } */
async function openSource(src, fetchOptions) {
  if (!src) throw Error('没有数据')
  if (typeof src.toFiles === 'function') return toVfs(await src.toFiles())
  if (Array.isArray(src)) return toVfs(src)
  if (src.names && src.read) return src
  if (typeof src === 'string') { const r = await fetch(src, fetchOptions); if (!r.ok) throw Error(`下载失败：HTTP ${r.status}`); return readZip(await r.arrayBuffer()) }
  if (src instanceof ArrayBuffer) return readZip(src)
  if (ArrayBuffer.isView(src)) return readZip(src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength))
  if (typeof src.arrayBuffer === 'function') return readZip(await src.arrayBuffer())
  throw Error('不支持的 source 类型')
}
const GAP = 16
const svgSize = svg => { const m = /width="(\d+)" height="(\d+)"/.exec(svg.slice(0, 400)); return [+m[1], +m[2]] }
/** 多页 SVG 纵向合并成一个 */
function mergeSvgs(list) {
  const ok = list.filter(r => r.svg); if (!ok.length) throw Error('没有可导出的页面'); if (ok.length === 1) return ok[0].svg
  const dim = ok.map(r => svgSize(r.svg)), W_ = Math.max(...dim.map(d => d[0])); let y = 0
  const parts = ok.map((r, i) => { const t = r.svg.replace('<svg ', `<svg x="0" y="${y}" `); y += dim[i][1] + GAP; return t })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W_}" height="${y - GAP}" viewBox="0 0 ${W_} ${y - GAP}">${parts.join('')}</svg>`
}
const MP4_QUALITY = { low: { key: 'low', label: '流畅 · 960p', long: 960, kbps: 1500 }, mid: { key: 'mid', label: '标准 · 1280p', long: 1280, kbps: 3000 }, high: { key: 'high', label: '高清 · 1920p', long: 1920, kbps: 8000 } };

export { readZip, detect, convert, loadRec, pageAt, paintPage, exportMp4, ts, toVfs, openSource, mergeSvgs, svgSize, MP4_QUALITY, GAP };

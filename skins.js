/* skins.js — cluster skins for Viciniti. Each skin: {id,name,build()->svg, update(root,state)}
 * state: {speed, unit, leadStr, leadNum, leadUnit, amLead, meetStr, meetFrac, riders, synced, headingStr, clock, clockAmPm,
 *         gps, sync, trip, odo, top, avg, sos, left, rideName, battery, solo}
 * Enduro skins are traced from the three "Enduro Pro" dash photos; Moto LCD from the LCD cluster photo.
 * Only items the app does not need were removed — layout, shapes, colors and number style are kept.
 */
(function (global) {
  const SANS = "'Exo 2','Michroma','Eurostile','Helvetica Neue',Arial,sans-serif"; // light digital sans used for 245 km / ENDURO PRO / +26°C / 07:35
  const F = "'Orbitron','JetBrains Mono',monospace";
  const esc = (s) => String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const set = (root, id, txt) => { const e = root.querySelector('#' + id); if (e && e.textContent !== String(txt)) e.textContent = txt; };
  const attr = (root, id, k, v) => { const e = root.querySelector('#' + id); if (e && e.getAttribute(k) !== String(v)) e.setAttribute(k, v); };

  /* ---------- block italic digit font (the "95" style in the Enduro photos) ----------
   * Square-cornered segment font with no gaps between segments, slanted ~12°. Built as path rectangles so it
   * renders identically on every phone with no web font. */
  const BLK = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', '.': 'p' };
  function blkDigit(ch, x, y, w, h, t) {
    const r = (x0, y0, x1, y1) => `M${x0} ${y0}H${x1}V${y1}H${x0}Z`;
    const hh = h / 2;
    const S = { a: r(x, y, x + w, y + t), d: r(x, y + h - t, x + w, y + h), g: r(x, y + hh - t / 2, x + w, y + hh + t / 2),
      f: r(x, y, x + t, y + hh), e: r(x, y + hh, x + t, y + h), b: r(x + w - t, y, x + w, y + hh), c: r(x + w - t, y + hh, x + w, y + h),
      p: r(x, y + h - t, x + t, y + h) };
    let p = ''; for (const s of (BLK[ch] || '')) p += S[s]; return p;
  }
  // returns {d, width}. '1' and '.' are narrow like in the photos' "10" label.
  function blkText(str, w, h, t, gap) {
    let d = '', cx = 0;
    for (const ch of String(str)) {
      if (ch === '1') { d += blkDigit('1', cx - (w - t * 1.35), 0, w, h, t); cx += t * 1.35 + gap; continue; }
      if (ch === '.') { d += blkDigit('.', cx, 0, w, h, t); cx += t + gap; continue; }
      d += blkDigit(ch, cx, 0, w, h, t); cx += w + gap;
    }
    return { d, width: Math.max(0, cx - gap) };
  }
  // pixel-grid fill + glow, as on the big speed digits
  function pxDefs(id, color, cell) {
    const c = cell || 6, k = Math.round(c * 0.8);
    return `<pattern id="${id}" width="${c}" height="${c}" patternUnits="userSpaceOnUse"><rect width="${k}" height="${k}" fill="${color}"/></pattern>`;
  }
  // draw a block number centered/right-aligned; wraps in a skew group. anchor: 'end'|'middle'|'start'
  function blkNum(id, str, x, y, w, h, t, gap, fill, anchor, glow) {
    const { d, width } = blkText(str, w, h, t, gap);
    const ox = anchor === 'end' ? x - width : anchor === 'middle' ? x - width / 2 : x;
    return `<g id="${id}" transform="translate(${ox} ${y}) skewX(-12)">` +
      (glow ? `<path d="${d}" fill="${glow}" opacity=".55" filter="url(#glow)"/><path d="${d}" fill="${glow}" opacity=".5"/>` : '') +
      `<path class="num" d="${d}" fill="${fill}"/></g>`;
  }
  // update a block number in place (recompute path, keep alignment)
  function blkSet(root, id, str, x, w, h, t, gap, anchor) {
    const g = root.querySelector('#' + id); if (!g || g.dataset.v === String(str)) return; g.dataset.v = String(str);
    const { d, width } = blkText(str, w, h, t, gap);
    const ox = anchor === 'end' ? x - width : anchor === 'middle' ? x - width / 2 : x;
    const y = (g.getAttribute('transform').match(/translate\([^ ]+ ([^)]+)\)/) || [0, 0])[1];
    g.setAttribute('transform', `translate(${ox} ${y}) skewX(-12)`);
    g.querySelectorAll('path').forEach((p) => p.setAttribute('d', d));
  }

  /* ---------- shared icons (traced) ---------- */
  const fuelIcon = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})" fill="${c}">
    <path d="M0 14 L8 8 L8 12 L14 12 L14 16 L8 16 L8 20 Z"/>
    <rect x="18" y="2" width="20" height="36" rx="3"/><rect x="21" y="5" width="14" height="12" rx="1" fill="#04040f"/>
    <path d="M40 10 h4 l6 6 v16 a4 4 0 0 1 -8 0 v-10 h-2 z M44 16 v16 a1 1 0 0 0 2 0 v-14 z" />
  </g>`;
  const plugIcon = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="${c}" stroke-width="3">
    <rect x="16" y="2" width="30" height="34" rx="3"/><path d="M16 12 H2 M16 26 H2 M46 14 h8 v10 h-8"/>
  </g>`;
  const battIcon = (id, x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})">
    <rect x="0" y="0" width="56" height="30" rx="5" fill="none" stroke="${c}" stroke-width="3"/><rect x="58" y="9" width="6" height="12" rx="1" fill="${c}"/>
    <rect id="${id}1" x="6" y="6" width="12" height="18" fill="${c}"/><rect id="${id}2" x="22" y="6" width="12" height="18" fill="${c}"/><rect id="${id}3" x="38" y="6" width="12" height="18" fill="${c}"/>
  </g>`;
  const barsIcon = (id, x, y, s, c) => { let o = `<g transform="translate(${x} ${y}) scale(${s})">`; for (let i = 0; i < 5; i++) o += `<rect id="${id}${i}" x="${i * 13}" y="${40 - 8 * (i + 1)}" width="9" height="${8 * (i + 1)}" fill="${c}"/>`; return o + '</g>'; };
  const waveIcon = (id, x, y, s, c) => `<g id="${id}" transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round">
    <circle cx="30" cy="20" r="4" fill="${c}" stroke="none"/><path d="M18 8 a16 16 0 0 0 0 24 M42 8 a16 16 0 0 1 0 24 M8 0 a28 28 0 0 0 0 40 M52 0 a28 28 0 0 1 0 40"/>
  </g>`;
  const scan = (id) => `<pattern id="${id}" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#000" opacity=".35"/></pattern>`;
  const glowDef = `<filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6"/></filter>`;
  const glitch = (c) => { let o = ''; const pts = [[80, 150], [90, 170], [1360, 150], [1340, 640], [120, 620], [1300, 660], [70, 600], [1380, 170]]; pts.forEach(([x, y], i) => { o += `<rect x="${x}" y="${y}" width="${20 + (i * 17) % 40}" height="3" fill="${c}" opacity=".18"/>`; }); return o; };

  /* ---------- ENDURO landscape (photos 2 & 3) — viewBox 1456x819 ---------- */
  const PAL_BLUE = { id: 'b', bg: '#03030e', ink: '#5fe6ff', hi: '#e04cf0', name: '#5fe6ff', unit: '#5fe6ff', box: '#5fe6ff', boxDigit: '#5fe6ff', ring1: '#5fe6ff', ring2: '#e04cf0', ringDash: true, line: '#5fe6ff', chev: '#e04cf0', rail: '#5fe6ff',
    seg: ['#6fe4ff', '#54cdff', '#3fb3ff', '#2e92ff', '#2e92ff', '#3a80ff', '#3a80ff', '#4d6cff', '#8a4dff', '#c44cf2'] };
  const PAL_RED = { id: 'r', bg: '#040308', ink: '#5fe6ff', hi: '#5fe6ff', name: '#ffb21a', unit: '#ff4fd8', box: '#ffb21a', boxDigit: '#ffb21a', ring1: '#ff2a3c', ring2: '#ff2a3c', ringDash: false, line: '#ffb21a', chev: '#ffb21a', rail: '#5fe6ff',
    seg: ['#ffd23c', '#ffb020', '#ff8a1a', '#ff3e9a', '#ff3e9a', '#9b3cff', '#8a2be2', '#8a2be2', '#ff2a2a', '#ff2a2a'] };

  // band geometry (landscape): segments 0-2 up the left column, 3-9 across the top
  const LX0 = 150, LX1 = 270, TY0 = 205, TY1 = 320, TICK = (k) => 405 + (k - 4) * 155; // major tick x for k=3..10
  const DIV = (k) => [[TICK(k), TY0], [TICK(k) - 65, TY1]]; // slanted divider top/bottom
  const LAND_SEGS = [
    [[150, 635], [150, 500], [270, 500], [270, 600]],
    [[150, 500], [150, 380], [270, 380], [270, 500]],
    [[150, 380], [150, 305], [335, 205], [405, 205], [340, 335], [270, 355], [270, 380]],
    [[405, 205], [560, 205], [495, 320], [400, 320], [340, 335]],
    [[560, 205], [715, 205], [650, 320], [495, 320]],
    [[715, 205], [870, 205], [805, 320], [650, 320]],
    [[870, 205], [1025, 205], [960, 320], [805, 320]],
    [[1025, 205], [1180, 205], [1115, 320], [960, 320]],
    [[1180, 205], [1300, 205], [1235, 320], [1115, 320]],
    [[1180, 205], [1300, 205], [1235, 320], [1115, 320]], // placeholder, replaced below
  ];
  // the photos show 10 numbered marks (0..10) = 10 segments; last two are the redline colors. Split the last cell in two.
  LAND_SEGS[8] = [[1180, 205], [1240, 205], [1175, 320], [1115, 320]];
  LAND_SEGS[9] = [[1240, 205], [1300, 205], [1235, 320], [1175, 320]];
  const poly = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ') + 'Z';

  function enduroSvg(pal) {
    const c = pal.ink;
    let segs = '';
    LAND_SEGS.forEach((pts, i) => { segs += `<path class="seg" data-i="${i}" d="${poly(pts)}" fill="${pal.seg[i]}" stroke="${pal.bg}" stroke-width="3" opacity=".16"/>`; });
    // lighter stripe along the outer edge (the two-tone look of the band)
    const stripe = poly([[150, 635], [150, 305], [335, 205], [1300, 205], [1280, 240], [348, 240], [185, 330], [185, 612]]);
    // ruler + numbers 3..10
    let ruler = `<path d="M140 645 L140 300 L330 192 L1340 192" fill="none" stroke="${pal.rail}" stroke-width="2.5" opacity=".9"/>`;
    for (let k = 3; k <= 10; k++) {
      const x = TICK(k); ruler += `<path d="M${x} 192 v14" stroke="${pal.rail}" stroke-width="3"/>`;
      if (k < 10) for (let m = 1; m < 5; m++) ruler += `<path d="M${x + m * 31} 192 v7" stroke="${pal.rail}" stroke-width="2" opacity=".8"/>`;
      const big = k === 5, h = big ? 56 : 44, w = big ? 42 : 33, t = big ? 14 : 12;
      ruler += blkNum('lb' + k, String(k), x + (k === 10 ? 24 : 10), 184 - h, w, h, t, 8, k >= 9 ? pal.hi : c, 'middle');
    }
    // 2, 1, 0 on the left column
    ruler += blkNum('lb2', '2', 112, 348, 34, 46, 12, 8, c, 'middle') + blkNum('lb1', '1', 112, 505, 34, 46, 12, 8, c, 'middle') + blkNum('lb0', '0', 236, 652, 34, 44, 12, 8, c, 'middle');
    ruler += `<path d="M140 645 l-6 0 M140 540 l-6 0 M140 420 l-6 0" stroke="${pal.rail}" stroke-width="3"/>`;
    return `<svg viewBox="0 0 1456 819" xmlns="http://www.w3.org/2000/svg" style="background:${pal.bg}">
<defs>${glowDef}${scan('sl' + pal.id)}${pxDefs('px' + pal.id, pal.ink, 7)}${pxDefs('pxb' + pal.id, pal.boxDigit, 5)}</defs>
<rect width="1456" height="819" fill="${pal.bg}"/>
<path d="M275 335 L1215 335 L1180 640 L300 640 Z" fill="#0b1026" opacity=".45"/>
${glitch(pal.hi)}
<path d="M70 128 H1390" stroke="${pal.ink}" stroke-width="2" opacity=".55"/>
<g font-family="${SANS}" font-weight="300" fill="${c}">
  ${fuelIcon(612, 70, 1.1, c)}<text id="meet" x="700" y="110" font-size="50">0.0 mi</text>
  ${plugIcon(930, 70, 1.05, c)}<text id="ride" x="1040" y="110" font-size="50" fill="${pal.name}" textLength="0">RIDE</text>
</g>
${segs}<path d="${stripe}" fill="#fff" opacity=".2"/><path id="mark" d="M560 205 L495 320" stroke="#fff" stroke-width="5" opacity="0"/>
${ruler}
<g font-family="${SANS}" font-weight="300" fill="${c}"><text id="scaleu" x="310" y="647" font-size="32">MPH</text><text x="310" y="676" font-size="27">x 10</text></g>
${blkNum('speed', '0', 845, 395, 120, 190, 40, 30, `url(#px${pal.id})`, 'end', pal.ink)}
<text id="unit" x="905" y="560" font-family="${SANS}" font-weight="300" font-size="46" fill="${pal.unit}">mph</text>
<g transform="translate(1105 485)">
  ${pal.ringDash ? `<circle r="88" fill="none" stroke="${pal.ring1}" stroke-width="3" stroke-dasharray="70 22 30 40" opacity=".9"/><circle r="74" fill="none" stroke="${pal.ring2}" stroke-width="2" opacity=".7"/><circle r="62" fill="none" stroke="${pal.ring2}" stroke-width="3.5"/>`
      : `<circle r="88" fill="none" stroke="${pal.ring1}" stroke-width="3.5"/><circle r="70" fill="none" stroke="${pal.ring2}" stroke-width="3.5"/>`}
  <text id="lead" y="14" font-family="${SANS}" font-weight="400" font-size="56" fill="${c}" text-anchor="middle">—</text>
  <text id="leadu" y="44" font-family="${SANS}" font-weight="300" font-size="20" fill="${c}" text-anchor="middle" opacity=".85"></text>
</g>
<rect x="1215" y="400" width="160" height="165" rx="14" fill="none" stroke="${pal.box}" stroke-width="3.5"/>
${blkNum('riders', '0', 1295, 425, 75, 115, 26, 16, `url(#pxb${pal.id})`, 'middle', pal.boxDigit)}
<path d="M70 700 H700 L740 724 L780 700 H1390" fill="none" stroke="${pal.line}" stroke-width="2" opacity=".75"/>
<path d="M700 700 L740 724 L780 700" fill="none" stroke="${pal.chev}" stroke-width="4"/>
<g font-family="${SANS}" font-weight="300" fill="${c}">
  <text id="heading" x="90" y="745" font-size="48">—</text>
  ${battIcon('bt', 985, 712, .95, c)}${barsIcon('sg', 1090, 702, 1, c)}
  <text id="clock" x="1185" y="745" font-size="48">--:--</text><text id="ampm" x="1330" y="745" font-size="32"></text>
</g>
<rect width="1456" height="819" fill="url(#sl${pal.id})"/>
</svg>`;
  }

  function enduroUpdate(root, s) {
    const v = Math.max(0, Math.min(10, (+s.speed || 0) / 10));
    const n = Math.floor(v + 1e-6);
    root.querySelectorAll('.seg').forEach((e) => e.setAttribute('opacity', +e.dataset.i < n ? '1' : '.16'));
    // current-value marker (the white line at "5" in the photo)
    const mk = root.querySelector('#mark');
    if (mk) {
      if (v < 0.3) mk.setAttribute('opacity', '0');
      else if (root.dataset.orient === 'portrait') { const y = 1170 - (v / 10) * (1170 - 232); mk.setAttribute('d', `M118 ${y.toFixed(0)} H192`); mk.setAttribute('opacity', '.95'); }
      else if (v <= 3) { const y = 635 - (v / 3) * (635 - 305); mk.setAttribute('d', `M150 ${y.toFixed(0)} H270`); mk.setAttribute('opacity', '.95'); }
      else { const x = TICK(Math.min(10, v)); mk.setAttribute('d', `M${x.toFixed(0)} 205 L${(x - 65).toFixed(0)} 320`); mk.setAttribute('opacity', '.95'); }
    }
    const P = root.dataset.orient === 'portrait';
    if (P) blkSet(root, 'speed', s.speed, 440, 150, 250, 50, 36, 'middle'); else blkSet(root, 'speed', s.speed, 845, 120, 190, 40, 30, 'end');
    set(root, 'unit', s.unit); set(root, 'scaleu', s.unit === 'mph' ? 'MPH' : 'KM/H');
    set(root, 'meet', s.solo ? s.trip + (s.unit === 'mph' ? ' mi' : ' km') : s.meetStr);
    set(root, 'ride', s.rideName || 'RIDE');
    const lead = root.querySelector('#lead'); if (lead) { if (s.solo) { lead.setAttribute('font-size', P ? 52 : 56); set(root, 'lead', s.avg); set(root, 'leadu', 'avg'); } else if (s.amLead) { lead.setAttribute('font-size', 34); set(root, 'lead', 'LEAD'); set(root, 'leadu', ''); } else { lead.setAttribute('font-size', String(s.leadNum).length > 3 ? 40 : 56); set(root, 'lead', s.leadNum ?? '—'); set(root, 'leadu', s.leadUnit || ''); } }
    if (P) blkSet(root, 'riders', s.solo ? s.top : s.synced, 695, 90, 140, 30, 18, 'middle'); else blkSet(root, 'riders', s.solo ? s.top : s.synced, 1295, 75, 115, 26, 16, 'middle');
    set(root, 'heading', s.headingStr); set(root, 'clock', s.clock); set(root, 'ampm', s.clockAmPm || '');
    const b = s.battery == null ? 3 : s.battery > .66 ? 3 : s.battery > .33 ? 2 : s.battery > .1 ? 1 : 0;
    for (let i = 1; i <= 3; i++) attr(root, 'bt' + i, 'opacity', i <= b ? 1 : .15);
    const bars = s.sos ? 0 : s.gps && s.sync ? 5 : s.gps ? 2 : 0;
    for (let i = 0; i < 5; i++) attr(root, 'sg' + i, 'opacity', i < bars ? 1 : .18);
    const wv = root.querySelector('#wave'); if (wv) wv.setAttribute('opacity', s.sync ? 1 : .2);
  }

  /* ---------- ENDURO portrait (photo 1) — viewBox 819x1456 ---------- */
  function portraitSvg(pal) {
    const c = pal.ink;
    const top = 232, bot = 1170, n = 9, h = (bot - top) / n;
    const cols = ['#c84cf2', '#9a4dff', '#6a5cff', '#4a74ff', '#3a8cff', '#36a6ff', '#3fbcff', '#52d2ff', '#6fe4ff']; // top -> bottom
    let segs = '';
    for (let i = 0; i < n; i++) { const idx = n - 1 - i; segs += `<rect class="seg" data-i="${idx}" x="120" y="${(top + i * h).toFixed(1)}" width="70" height="${h.toFixed(1)}" fill="${cols[i]}" stroke="${pal.bg}" stroke-width="3" opacity=".16"/>`; }
    segs += `<rect x="120" y="${top}" width="22" height="${bot - top}" fill="#fff" opacity=".18"/>`;
    let labels = `<path d="M110 ${top - 10} H780" stroke="${c}" stroke-width="2" opacity=".55"/>`;
    for (let i = 0; i < n; i++) { const k = 10 - i; const y = top + i * h; labels += blkNum('pl' + k, String(k), 72, y - 25, 32, 46, 12, 7, i === 0 ? pal.hi : c, 'middle'); }
    return `<svg viewBox="0 0 819 1456" xmlns="http://www.w3.org/2000/svg" data-orient="portrait" style="background:${pal.bg}">
<defs>${glowDef}${scan('slp')}${pxDefs('pxp', pal.ink, 8)}${pxDefs('pxbp', pal.boxDigit, 6)}</defs>
<rect width="819" height="1456" fill="${pal.bg}"/>
<g font-family="${SANS}" font-weight="300" fill="${c}">
  ${fuelIcon(285, 55, 1.25, c)}<text id="meet" x="380" y="110" font-size="56">0.0 mi</text>
  ${plugIcon(215, 135, 1.2, c)}<text id="ride" x="330" y="190" font-size="58" fill="${pal.name}">RIDE</text>
</g>
${segs}<path id="mark" d="M118 1170 H192" stroke="#fff" stroke-width="5" opacity="0"/>
${labels}
<g font-family="${SANS}" font-weight="300" fill="${c}" text-anchor="middle"><text id="scaleu" x="157" y="1210" font-size="34">MPH</text><text x="157" y="1244" font-size="28">x 10</text></g>
${blkNum('speed', '0', 440, 525, 150, 250, 50, 36, 'url(#pxp)', 'middle', pal.ink)}
<text id="unit" x="650" y="775" font-family="${SANS}" font-weight="300" font-size="50" fill="${pal.unit}">mph</text>
<g transform="translate(480 950)">
  <circle r="95" fill="none" stroke="${pal.ring1}" stroke-width="3" stroke-dasharray="80 24 34 44" opacity=".9"/><circle r="79" fill="none" stroke="${pal.ring2}" stroke-width="2" opacity=".7"/><circle r="66" fill="none" stroke="${pal.ring2}" stroke-width="3.5"/>
  <text id="lead" y="16" font-family="${SANS}" font-weight="400" font-size="56" fill="${c}" text-anchor="middle">—</text>
  <text id="leadu" y="46" font-family="${SANS}" font-weight="300" font-size="20" fill="${c}" text-anchor="middle" opacity=".85"></text>
</g>
<rect x="610" y="845" width="170" height="205" rx="16" fill="none" stroke="${pal.box}" stroke-width="3.5"/>
${blkNum('riders', '0', 695, 878, 90, 140, 30, 18, 'url(#pxbp)', 'middle', pal.boxDigit)}
<path d="M110 1255 H375 L400 1275 L425 1255 H780" fill="none" stroke="${pal.line}" stroke-width="2" opacity=".75"/>
<path d="M375 1255 L400 1275 L425 1255" fill="none" stroke="${pal.chev}" stroke-width="4"/>
<g font-family="${SANS}" font-weight="300" fill="${c}">
  <text id="heading" x="45" y="1355" font-size="50">—</text>
  ${waveIcon('wave', 262, 1318, .95, c)}${battIcon('bt', 350, 1322, .95, c)}${barsIcon('sg', 465, 1312, 1, c)}
  <text id="clock" x="575" y="1355" font-size="50">--:--</text><text id="ampm" x="720" y="1355" font-size="34"></text>
</g>
<rect width="819" height="1456" fill="url(#slp)"/>
</svg>`;
  }

  /* ---------- MOTO LCD (photo 4) — viewBox 637x317 ---------- */
  // classic chamfered 7-seg with ghost (unlit) segments, as on a real LCD
  const SEG7 = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '' };
  function seg7(x, y, w, h, t, on, cls) {
    const k = t / 2, hh = h / 2;
    const H = (x0, y0, len) => `M${x0 + k} ${y0}l${k} -${k}h${len - t}l${k} ${k}l-${k} ${k}h-${len - t}z`;
    const V = (x0, y0, len) => `M${x0} ${y0 + k}l${k} -${k}l${k} ${k}v${len - t}l-${k} ${k}l-${k} -${k}z`;
    const D = { a: H(x, y, w), g: H(x, y + hh, w), d: H(x, y + h, w), f: V(x, y, hh), e: V(x, y + hh, hh), b: V(x + w, y, hh), c: V(x + w, y + hh, hh) };
    let o = ''; for (const s of 'abcdefg') o += `<path class="${cls}" data-s="${s}" d="${D[s]}" fill="#fff" opacity="${on.includes(s) ? 1 : .07}"/>`; return o;
  }
  function seg7Text(id, str, x, y, w, h, t, gap, pad) {
    let o = `<g id="${id}" data-n="${pad}">`;
    const { chars, dots } = seg7Parse(str, pad);
    let cx = x; for (let i = 0; i < pad; i++) {
      const colon = chars[i] === ':';
      o += `<g data-i="${i}">${colon ? `<rect class="cl" x="${cx + w * .3}" y="${y + h * .3}" width="${t}" height="${t}" fill="#fff"/><rect class="cl" x="${cx + w * .3}" y="${y + h * .65}" width="${t}" height="${t}" fill="#fff"/>` : seg7(cx, y, w, h, t, SEG7[chars[i]] || '', 's')}` +
        `<rect class="dp" x="${cx + w + t * .5}" y="${y + h - t}" width="${t}" height="${t}" fill="#fff" opacity="${dots.has(i) ? 1 : .07}"/></g>`;
      cx += (colon ? w * .6 : w) + gap;
    } return o + '</g>';
  }
  function seg7Parse(str, pad) {
    const raw = String(str); const chars = []; const dots = new Set();
    for (const ch of raw) { if (ch === '.') { if (chars.length) dots.add(chars.length - 1); } else chars.push(ch); }
    while (chars.length < pad) { chars.unshift(' '); const nd = new Set(); dots.forEach((i) => nd.add(i + 1)); dots.clear(); nd.forEach((i) => dots.add(i)); }
    return { chars: chars.slice(-pad), dots };
  }
  function seg7Set(root, id, str) {
    const g = root.querySelector('#' + id); if (!g || g.dataset.v === String(str)) return; g.dataset.v = String(str);
    const pad = +g.dataset.n; const { chars, dots } = seg7Parse(str, pad);
    g.querySelectorAll('[data-i]').forEach((d, i) => { const on = SEG7[chars[i]] || ''; d.querySelectorAll('path').forEach((p) => p.setAttribute('opacity', on.includes(p.dataset.s) ? 1 : .07)); const dp = d.querySelector('.dp'); dp && dp.setAttribute('opacity', dots.has(i) ? 1 : .07); });
  }
  const LBL = "'Exo 2',Arial,sans-serif";
  function motoSvg() {
    const BL = '#3aa0e8', RD = '#e52e2a', GR = '#3bc46a', OR = '#f2991a';
    // band: blue L with rounded corner, white tick cells inside the arc, red at the end
    let ticks = '';
    const N = 44; for (let i = 0; i < N; i++) { const x = 168 + i * 7.2; ticks += `<rect class="tk" data-i="${i + 8}" x="${x.toFixed(1)}" y="106" width="4" height="${i % 5 === 4 ? 11 : 8}" fill="${i >= 33 ? RD : '#fff'}" opacity=".12"/>`; }
    for (let i = 0; i < 8; i++) { const y = 186 - i * 8; ticks += `<rect class="tk" data-i="${i}" x="142" y="${y}" width="8" height="4" fill="#fff" opacity=".12"/>`; }
    let nums = ''; [4, 5, 6, 7, 8, 9, 10, 11, 12].forEach((k, i) => { nums += `<text x="${190 + i * 37}" y="100" font-family="${LBL}" font-weight="700" font-style="italic" font-size="12" fill="${k >= 10 ? RD : '#fff'}" text-anchor="middle">${k}</text>`; });
    [3, 2, 1].forEach((k, i) => { nums += `<text x="126" y="${124 + i * 24}" font-family="${LBL}" font-weight="700" font-style="italic" font-size="12" fill="#fff" text-anchor="middle">${k}</text>`; });
    let fuel = ''; for (let i = 0; i < 8; i++) fuel += `<rect class="fu" data-i="${i}" x="${205 + i * 11}" y="184" width="8" height="7" fill="${BL}" opacity=".12"/>`;
    return `<svg viewBox="0 0 637 317" xmlns="http://www.w3.org/2000/svg" style="background:#0a0a0c">
<rect width="637" height="317" fill="#0a0a0c"/>
<path d="M60 34 H560 L616 66 V256 Q616 284 586 284 H70 Q22 284 22 236 V80 Q22 34 60 34 Z" fill="#1b1b1e" stroke="#303034" stroke-width="2"/>
<path d="M34 42 H552 L606 70 V254 Q606 276 582 276 H72 Q34 276 34 236 Z" fill="#131315" stroke="#000" stroke-width="1.5"/>
<path d="M560 104 h42 v112 h-42 z" fill="#222226" stroke="#000"/><text transform="translate(582 160) rotate(90)" font-family="${LBL}" font-size="9" fill="#777" text-anchor="middle" letter-spacing="2">MODE  SET</text>
<rect x="104" y="86" width="430" height="162" rx="10" fill="#000"/>
<!-- band -->
<path d="M160 196 V146 Q160 124 182 124 H492" fill="none" stroke="#fff" stroke-width="12" opacity=".35"/>
<path d="M160 196 V146 Q160 124 182 124 H492" fill="none" stroke="${BL}" stroke-width="9"/>
<path d="M139 192 V140 Q139 110 169 110 H494" fill="none" stroke="#fff" stroke-width="1.2" opacity=".55"/>
${ticks}${nums}
<text x="116" y="208" font-family="${LBL}" font-weight="700" font-size="12" fill="#fff">RPM</text><text id="scaleu" x="117" y="217" font-family="${LBL}" font-size="7" fill="#fff">x10 mph</text>
<!-- gear box -> riders in sync -->
<rect x="187" y="136" width="36" height="46" rx="6" fill="none" stroke="${BL}" stroke-width="2.5"/>
${seg7Text('riders', '0', 195, 143, 16, 30, 4.5, 4, 1)}
<!-- fuel icon + E..F bar -> meeting spot -->
<path d="M176 180 h12 v16 h-12 z M179 183 h6 v5 h-6 z M189 185 h3 v8 h-3 z" fill="#fff"/><text x="200" y="196" font-family="${LBL}" font-weight="700" font-size="8" fill="${RD}">E</text>${fuel}<text x="295" y="196" font-family="${LBL}" font-weight="700" font-size="8" fill="#fff">F</text>
<text id="meet" x="305" y="190" font-family="${LBL}" font-size="8" fill="${BL}">0.0 mi</text>
<!-- clock -->
<circle cx="258" cy="156" r="5" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M258 153 v3 h2" stroke="#fff" stroke-width="1.2" fill="none"/>
${seg7Text('clock', '--:--', 266, 146, 10, 19, 2.8, 2.5, 5)}<text id="ampm" x="329" y="152" font-family="${LBL}" font-size="7" fill="#fff"></text>
<!-- badges (ABS / A in the photo) -> GPS / SYNC -->
<rect x="349" y="142" width="24" height="10" rx="5" fill="none" stroke="#fff" stroke-width="1.2"/><text id="bg-gps" x="361" y="150" font-family="${LBL}" font-weight="700" font-size="7" fill="#fff" text-anchor="middle">GPS</text>
<rect x="349" y="156" width="24" height="10" rx="5" fill="none" stroke="${GR}" stroke-width="1.2"/><text id="bg-sync" x="361" y="164" font-family="${LBL}" font-weight="700" font-size="7" fill="${GR}" text-anchor="middle">SYNC</text>
<!-- ECO N PWR -> SOS OK LEFT -->
<text id="m-sos" x="262" y="212" font-family="${LBL}" font-weight="700" font-size="9" fill="${RD}" opacity=".12">SOS</text>
<text id="m-ok" x="296" y="212" font-family="${LBL}" font-weight="700" font-size="10" fill="${GR}" opacity=".12">OK</text>
<text id="m-left" x="322" y="212" font-family="${LBL}" font-weight="700" font-style="italic" font-size="9" fill="${OR}" opacity=".12">LEFT</text>
<!-- big speed -->
${seg7Text('speed', '0', 388, 133, 28, 52, 7, 9, 3)}
<text id="unit" x="500" y="175" font-family="${LBL}" font-weight="700" font-size="9" fill="#fff">mph</text>
<text x="400" y="200" font-family="${LBL}" font-weight="700" font-size="7" fill="#fff" letter-spacing=".5">TOP SPEED <tspan id="top">0</tspan>   AVG SPEED <tspan id="avg">0</tspan></text>
<!-- bottom row: lead distance (left), warnings, trip (right) -->
<text x="114" y="226" font-family="${LBL}" font-weight="700" font-size="8" fill="#fff">LEAD</text><text x="114" y="236" font-family="${LBL}" font-size="7" fill="#fff">DIST</text>
<text x="156" y="217" font-family="${LBL}" font-weight="700" font-size="7" fill="${BL}" letter-spacing=".5">RANGE  AVG</text>
${seg7Text('lead', '---', 150, 221, 14, 20, 3.2, 6, 4)}
<text id="leadu" x="230" y="229" font-family="${LBL}" font-size="7" fill="#fff">ft</text><text x="230" y="238" font-family="${LBL}" font-size="7" fill="#fff" opacity=".4">mi</text>
<g id="w-batt" opacity=".12"><rect x="264" y="230" width="18" height="9" rx="1" fill="none" stroke="${RD}" stroke-width="1.5"/><rect x="282" y="232" width="2" height="5" fill="${RD}"/><path d="M268 232 v5 M278 232 v5" stroke="${RD}" stroke-width="2"/></g>
<g id="w-sos" opacity=".12"><path d="M352 227 l9 15 h-18 z" fill="none" stroke="${OR}" stroke-width="2"/><path d="M352 232 v5 M352 239 v1" stroke="${OR}" stroke-width="1.5"/></g>
<circle cx="398" cy="222" r="3.5" fill="none" stroke="#fff" stroke-width="1.2"/><path d="M398 220 v2 h1.5" stroke="#fff" fill="none"/><text x="405" y="225" font-family="${LBL}" font-weight="700" font-size="7" fill="#fff">TRIP</text>
${seg7Text('trip', '0.0', 396, 229, 12, 18, 3, 6, 6)}<text id="tripu" x="500" y="245" font-family="${LBL}" font-size="7" fill="#fff">mi</text>
</svg>`;
  }
  function motoUpdate(root, s) {
    seg7Set(root, 'speed', s.speed); set(root, 'unit', s.unit); set(root, 'scaleu', 'x10 ' + s.unit);
    const n = Math.round(Math.min(52, (+s.speed || 0) * 52 / 120)); root.querySelectorAll('.tk').forEach((e) => e.setAttribute('opacity', +e.dataset.i < n ? '1' : '.12'));
    seg7Set(root, 'riders', s.solo ? '-' : s.synced); set(root, 'meet', s.solo ? '' : s.meetStr);
    const f = s.solo ? 0 : Math.round(8 * (s.meetFrac ?? 0)); root.querySelectorAll('.fu').forEach((e) => e.setAttribute('opacity', +e.dataset.i < f ? '1' : '.12'));
    seg7Set(root, 'clock', s.clock); set(root, 'ampm', s.clockAmPm || '');
    attr(root, 'bg-gps', 'opacity', s.gps ? 1 : .15); attr(root, 'bg-sync', 'opacity', s.sync ? 1 : .15);
    attr(root, 'm-sos', 'opacity', s.sos ? 1 : .12); attr(root, 'm-ok', 'opacity', s.solo ? .12 : !s.left && !s.sos ? 1 : .12); attr(root, 'm-left', 'opacity', s.left ? 1 : .12);
    set(root, 'top', s.top); set(root, 'avg', s.avg);
    if (s.solo) { seg7Set(root, 'lead', s.avg); set(root, 'leadu', 'avg'); } else if (s.amLead) { seg7Set(root, 'lead', '----'); set(root, 'leadu', 'LEAD'); } else { seg7Set(root, 'lead', s.leadNum ?? '---'); set(root, 'leadu', s.leadUnit || ''); }
    attr(root, 'w-batt', 'opacity', s.battery != null && s.battery < .2 ? 1 : .12); attr(root, 'w-sos', 'opacity', s.sos ? 1 : .12);
    seg7Set(root, 'trip', s.trip); set(root, 'tripu', s.unit === 'mph' ? 'mi' : 'km');
  }

  /* ---------- RETRO 7-SEG (speedometer family) ---------- */
  function retroSvg() {
    let bar = ''; const cols = ['#00c850', '#78dc00', '#f0dc00', '#ff9600', '#ff3c1e'];
    for (let i = 0; i < 30; i++) bar += `<rect class="seg" data-i="${i}" x="${24 + i * 11.4}" y="150" width="8" height="22" fill="${cols[Math.min(4, Math.floor(i / 6))]}" opacity=".15"/>`;
    return `<svg viewBox="0 0 390 230" xmlns="http://www.w3.org/2000/svg" style="background:#09090b">
<rect width="390" height="230" fill="#09090b"/><rect x="6" y="6" width="378" height="218" rx="10" fill="#141418" stroke="#505058" stroke-width="2"/>
<g font-family="${F}">
<text x="20" y="28" font-size="10" fill="#8a8a90">SPEED <tspan id="unit">MPH</tspan></text><text id="ride" x="370" y="28" font-size="10" fill="#ffc828" text-anchor="end">RIDE</text>
<text id="speed" x="230" y="135" font-size="110" font-weight="900" fill="#ff3c28" text-anchor="end" style="font-variant-numeric:tabular-nums">0</text>
<text x="250" y="70" font-size="9" fill="#8a8a90">LEAD</text><text id="lead" x="250" y="92" font-size="20" font-weight="700" fill="#ffc828">—</text>
<text x="250" y="112" font-size="9" fill="#8a8a90">MEET</text><text id="meet" x="250" y="132" font-size="16" font-weight="700" fill="#ffc828">—</text>
${bar}
<text x="20" y="200" font-size="9" fill="#8a8a90">RIDERS</text><text id="riders" x="20" y="218" font-size="16" font-weight="700" fill="#50ff78">0</text>
<text x="100" y="200" font-size="9" fill="#8a8a90">TRIP</text><text id="trip" x="100" y="218" font-size="16" font-weight="700" fill="#ffc828">0.0</text>
<text x="180" y="200" font-size="9" fill="#8a8a90">HDG</text><text id="heading" x="180" y="218" font-size="16" font-weight="700" fill="#ffc828">N 0°</text>
<text id="clock" x="370" y="218" font-size="16" font-weight="700" fill="#50ff78" text-anchor="end">--:--</text>
<text x="256" y="200" font-size="9" fill="#8a8a90">TOP <tspan id="top">0</tspan> AVG <tspan id="avg">0</tspan></text>
</g></svg>`;
  }
  const retroUpdate = (root, s) => {
    set(root, 'speed', s.speed); set(root, 'unit', s.unit.toUpperCase()); set(root, 'lead', s.leadStr); set(root, 'meet', s.meetStr); set(root, 'ride', s.rideName || 'RIDE');
    set(root, 'riders', s.synced + '/' + s.riders); set(root, 'trip', s.trip); set(root, 'heading', s.headingStr); set(root, 'clock', s.clock); set(root, 'top', s.top); set(root, 'avg', s.avg);
    const n = Math.round(Math.min(30, s.speed * 30 / 120)); root.querySelectorAll('.seg').forEach((e) => e.setAttribute('opacity', +e.dataset.i < n ? '1' : '.15'));
  };


  global.SKINS = [
    { id: 'enduro-blue', name: 'ENDURO BLUE', build: () => enduroSvg(PAL_BLUE), update: enduroUpdate },
    { id: 'enduro-red', name: 'ENDURO RED', build: () => enduroSvg(PAL_RED), update: enduroUpdate },
    { id: 'enduro-portrait', name: 'ENDURO PORTRAIT', build: () => portraitSvg(PAL_BLUE), update: enduroUpdate },
    { id: 'moto-lcd', name: 'MOTO LCD', build: motoSvg, update: motoUpdate },
    { id: 'retro', name: 'RETRO 7-SEG', build: retroSvg, update: retroUpdate },
  ];
})(window);

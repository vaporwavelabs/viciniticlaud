/* app.js — Viciniti: group ride app. Supabase backend + Protomaps offline map + cluster skins. */
(() => {
  'use strict';
  const SUPABASE_URL = 'https://xzehemmclhwfcisvrdkn.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_9s8VIEQS5c-86NiJvlsTSg_Qnsn4y8b';
  const sb = window.supabase ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
  const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
  const Geo = OfflineMap.Geo;

  const S = {
    user: null, profile: null, ride: null, members: new Map(), positions: new Map(), me: null,
    skin: localStorage.getItem('skin') || 'enduro-blue', units: localStorage.getItem('units') || 'mph',
    demo: false, watch: null, channel: null, map: null, skinEl: null, skinObj: null,
    trip: 0, top: 0, speedSum: 0, speedN: 0, startedAt: 0, lastPos: null, lastUpsert: 0,
    sos: null, left: false, rollcall: null, responses: new Set(), wake: null, prevScreen: 'home', solo: false, track: [], battery: null,
  };
  const ROLE_COLORS = { host: '#3cff7a', subhost: '#9fff3c', medic: '#ff5a28', mechanic: '#ffd23c', sweep: '#b06cff', rider: '#2aa7ff', spectator: '#888' };
  const STATUS_COLORS = { synced: '#3cff7a', mild_warning: '#ffd23c', at_risk: '#ff9f1a', critical: '#ff4040', lost: '#ff4040', missing: '#ff4040', distress: '#ff0040', left: '#555' };

  /* ---------- utils ---------- */
  const toast = (m, ms = 2500) => { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => (t.hidden = true), ms); };
  const say = (m) => { if ($('#st-voice').checked && 'speechSynthesis' in window) { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(m)); } };
  const code = (n) => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)]; return s; };
  const fmtDist = (m) => { if (m == null || isNaN(m)) return '—'; if (S.units === 'kmh') return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(1) + ' km'; const ft = Geo.metersToFeet(m); return ft < 1000 ? Math.round(ft) + ' ft' : Geo.metersToMiles(m).toFixed(1) + ' mi'; };
  const fmtSpeed = (mps) => Math.round(S.units === 'kmh' ? mps * 3.6 : Geo.mpsToMph(mps));
  const unit = () => (S.units === 'kmh' ? 'km/h' : 'mph');
  const clock = () => { const d = new Date(); let h = d.getHours() % 12; if (!h) h = 12; return String(h).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const ampm = () => (new Date().getHours() < 12 ? 'AM' : 'PM');
  const distParts = (m) => { if (m == null || isNaN(m)) return ['—', '']; if (S.units === 'kmh') return m < 1000 ? [Math.round(m), 'm'] : [(m / 1000).toFixed(1), 'km']; const ft = Geo.metersToFeet(m); return ft < 1000 ? [Math.round(ft), 'ft'] : [Geo.metersToMiles(m).toFixed(1), 'mi']; };
  const compass = (h) => { if (h == null || isNaN(h)) return '—'; const d = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(h / 45) % 8]; return d + ' ' + Math.round(h) + '°'; };
  const nameOf = (id) => (S.members.get(id)?.profile?.display_name) || (id === S.user?.id ? 'You' : 'Rider');

  /* ---------- screens ---------- */
  function go(name) {
    const cur = $('.screen.active'); if (cur) S.prevScreen = cur.dataset.screen;
    $$('.screen').forEach((s) => s.classList.toggle('active', s.dataset.screen === name));
    window.scrollTo(0, 0);
    if (name === 'ride') setTimeout(() => S.map && S.map.resize(), 50);
    if (name === 'home') refreshHome();
    if (name === 'rides') loadRides();
    if (name === 'profile') fillProfile();
    if (name === 'settings') fillSettings();
    if (name === 'riders') renderRiders();
  }
  $$('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  $('#btn-profile').onclick = () => go(S.user ? 'profile' : 'welcome');

  /* ---------- auth ---------- */
  async function boot() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    buildSkinButtons();
    if (!sb) { $('#w-status').textContent = 'OFFLINE'; return go('welcome'); }
    sb.auth.onAuthStateChange(async (_e, session) => {
      S.user = session?.user || null;
      if (S.user) { await loadProfile(); if ($('.screen.active')?.dataset.screen !== 'ride') go('home'); }
      else if (!S.demo) go('welcome');
    });
    const { data } = await sb.auth.getSession();
    if (!data.session) go('welcome');
    window.addEventListener('online', () => $('#online-led').classList.add('on')); window.addEventListener('offline', () => $('#online-led').classList.remove('on'));
    $('#online-led').classList.toggle('on', navigator.onLine);
  }
  async function loadProfile() {
    const { data } = await sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle();
    S.profile = data || { id: S.user.id, display_name: 'Rider', vehicle_class: 'motorbike' };
  }
  $('#btn-login').onclick = async () => {
    const { error } = await sb.auth.signInWithPassword({ email: $('#li-email').value.trim(), password: $('#li-pass').value });
    $('#li-err').textContent = error ? error.message : '';
  };
  $('#btn-magic').onclick = async () => {
    const email = $('#li-email').value.trim(); if (!email) return ($('#li-err').textContent = 'Enter your email first');
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    $('#li-err').textContent = error ? error.message : ''; if (!error) toast('Check your email for the sign-in link');
  };
  $('#btn-signup').onclick = async () => {
    const name = $('#su-name').value.trim() || 'Rider';
    const { error } = await sb.auth.signUp({ email: $('#su-email').value.trim(), password: $('#su-pass').value, options: { data: { display_name: name } } });
    $('#su-err').textContent = error ? error.message : '';
    if (!error) { toast('Account created — check email to confirm if asked'); }
  };
  $('#btn-signout').onclick = async () => { await sb.auth.signOut(); S.demo = false; go('welcome'); };

  /* ---------- home ---------- */
  async function refreshHome() {
    $('#h-name').textContent = (S.profile?.display_name || 'DEMO').toUpperCase();
    const m = await OfflineMap.Region.status(); $('#h-map').textContent = m.downloaded ? 'STORED ' + (m.bytes / 1048576).toFixed(0) + ' MB' : 'NOT STORED';
    navigator.geolocation.getCurrentPosition(() => ($('#h-gps').textContent = 'LOCKED'), () => ($('#h-gps').textContent = 'NO FIX'), { timeout: 8000 });
    if (!sb || !S.user) return;
    const { data } = await sb.from('ride_members').select('ride_id, rides!inner(id,name,status,code)').eq('user_id', S.user.id).in('rides.status', ['scheduled', 'live']).limit(1);
    const r = data?.[0]?.rides; $('#h-ride').textContent = r ? r.name.toUpperCase() + ' · ' + r.status.toUpperCase() : 'NONE';
    $('#btn-resume').hidden = !r; if (r) $('#btn-resume').onclick = () => enterRide(r.id);
  }

  /* ---------- create ride ---------- */
  let meetCoords = null;
  $('#cr-usegps').onclick = () => navigator.geolocation.getCurrentPosition((p) => { meetCoords = [p.coords.latitude, p.coords.longitude]; $('#cr-meet-coords').textContent = meetCoords.map((v) => v.toFixed(5)).join(', '); }, () => toast('No GPS fix'), { enableHighAccuracy: true, timeout: 10000 });
  $('#cr-radius').oninput = () => ($('#cr-radius-v').textContent = $('#cr-radius').value);
  $$('[data-when]').forEach((b) => (b.onclick = () => { $$('[data-when]').forEach((x) => x.classList.toggle('on', x === b)); $('#cr-when-wrap').hidden = b.dataset.when === 'now'; }));
  $('#btn-create').onclick = async () => {
    const name = $('#cr-name').value.trim() || 'Group Ride', later = $('[data-when=later]').classList.contains('on');
    const row = { name, code: code(4), spectator_code: code(6), host_id: S.user.id, status: 'scheduled', is_public: $('#cr-public').checked, radius_ft: +$('#cr-radius').value,
      meeting_label: $('#cr-meet').value.trim() || null, meeting_lat: meetCoords?.[0] ?? null, meeting_lng: meetCoords?.[1] ?? null, scheduled_at: later && $('#cr-when').value ? new Date($('#cr-when').value).toISOString() : null };
    const { data, error } = await sb.from('rides').insert(row).select().single();
    if (error) return ($('#cr-err').textContent = error.message);
    await sb.from('ride_members').insert({ ride_id: data.id, user_id: S.user.id, role: 'host' });
    await enterRide(data.id, true);
  };

  /* ---------- join ---------- */
  $('#btn-join').onclick = async () => {
    const c = $('#jn-code').value.trim().toUpperCase(); if (!c) return;
    const { data, error } = await sb.rpc('join_ride', { p_code: c });
    if (error) return ($('#jn-err').textContent = error.message);
    const id = typeof data === 'string' ? data : data?.id || data?.ride_id || data?.[0]?.id;
    if (!id) return ($('#jn-err').textContent = 'Ride not found');
    await enterRide(id, true);
  };
  $('#btn-scan').onclick = () => toast('QR scan comes with the native wrap — type the code for now');

  /* ---------- rides list ---------- */
  async function loadRides() {
    const el0 = $('#rides-list'); el0.innerHTML = '';
    if (!S.user || S.demo) { renderSoloRides(el0); if (!el0.children.length) el0.innerHTML = '<div class="dim">no rides yet</div>'; return; }
    const { data } = await sb.from('ride_members').select('role, rides(id,name,status,code,created_at)').eq('user_id', S.user.id).order('joined_at', { ascending: false }).limit(30);
    const el = $('#rides-list');
    (data || []).forEach((m) => { const r = m.rides; if (!r) return; const d = document.createElement('div'); d.className = 'ride-item'; d.innerHTML = `<span><b>${esc(r.name)}</b><br><small class="dim">${r.code} · ${m.role}</small></span><span class="dim">${r.status.toUpperCase()}</span>`; d.onclick = () => enterRide(r.id, true); el.appendChild(d); });
    renderSoloRides(el);
    if (!el.children.length) el.innerHTML = '<div class="dim">no rides yet</div>';
  }

  /* ---------- ride loading & realtime ---------- */
  async function enterRide(id, toLobby = false) {
    const { data: ride, error } = await sb.from('rides').select('*').eq('id', id).single();
    if (error || !ride) return toast('Could not open ride');
    S.ride = ride; await loadMembers(); subscribe();
    if (ride.status === 'ended' || ride.status === 'cancelled') return showEnd();
    if (ride.status === 'live' && !toLobby) startRideUI(); else if (ride.status === 'live') startRideUI(); else renderLobby();
  }
  async function loadMembers() {
    const { data } = await sb.from('ride_members').select('*, profile:profiles(*)').eq('ride_id', S.ride.id);
    S.members.clear(); (data || []).forEach((m) => S.members.set(m.user_id, m));
    const { data: pos } = await sb.from('positions').select('*').eq('ride_id', S.ride.id);
    S.positions.clear(); (pos || []).forEach((p) => S.positions.set(p.user_id, p));
  }
  function subscribe() {
    if (S.channel) sb.removeChannel(S.channel);
    const f = 'ride_id=eq.' + S.ride.id;
    S.channel = sb.channel('ride:' + S.ride.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'positions', filter: f }, (p) => { if (p.new?.user_id) S.positions.set(p.new.user_id, p.new); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_members', filter: f }, async () => { await loadMembers(); if ($('.screen.active')?.dataset.screen === 'lobby') renderLobby(); renderRiders(); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides', filter: 'id=eq.' + S.ride.id }, (p) => { const was = S.ride.status; S.ride = p.new; if (was !== 'live' && p.new.status === 'live') startRideUI(); if (p.new.status === 'ended') showEnd(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_events', filter: f }, (p) => onEvent(p.new))
      .subscribe((st) => $('#led-sync').classList.toggle('blue', st === 'SUBSCRIBED'));
  }
  function onEvent(e) {
    const who = nameOf(e.user_id);
    if (e.type === 'sos') { S.sos = e; $('#led-sos').classList.add('bad'); say('S O S from ' + who); showEmergency(e); }
    if (e.type === 'sos_cleared') { S.sos = null; $('#led-sos').classList.remove('bad'); toast('SOS cleared'); if ($('.screen.active')?.dataset.screen === 'emergency') go('ride'); }
    if (e.type === 'roll_call') { S.rollcall = e; S.responses.clear(); if (e.user_id !== S.user?.id) { say('Roll call'); go('rollcall'); } renderRollcall(); }
    if (e.type === 'roll_call_response') { S.responses.add(e.user_id); renderRollcall(); }
    if (e.type === 'left_behind' && e.user_id !== S.user?.id) { say(who + ' left behind'); showAlert(who.toUpperCase() + ' LEFT BEHIND', 'warn'); }
    if (e.type === 'rejoined' && e.user_id !== S.user?.id) toast(who + ' is back with the group');
    if (e.type === 'stop') { say('Group stop'); showAlert('GROUP STOP', 'warn'); }
    if (e.type === 'resume') { hideAlert(); toast('Rolling again'); }
  }
  const event = (type, payload = {}) => sb.from('ride_events').insert({ ride_id: S.ride.id, user_id: S.user.id, type, payload, lat: S.me?.lat ?? null, lng: S.me?.lng ?? null });

  /* ---------- lobby ---------- */
  function renderLobby() {
    const r = S.ride; go('lobby');
    $('#lb-name').textContent = r.name.toUpperCase(); $('#lb-code').textContent = r.code; $('#lb-spec').textContent = r.spectator_code;
    $('#lb-meet').textContent = (r.meeting_label || (r.meeting_lat ? r.meeting_lat.toFixed(3) + ', ' + r.meeting_lng.toFixed(3) : '—')).toUpperCase();
    $('#lb-radius').textContent = r.radius_ft + ' FT'; $('#lb-status').textContent = (r.status + (r.scheduled_at ? ' · ' + new Date(r.scheduled_at).toLocaleString() : '')).toUpperCase();
    const host = r.host_id === S.user?.id; $('#btn-start').hidden = !host; $('#btn-roles').hidden = !host;
    const el = $('#lb-members'); el.innerHTML = '';
    for (const m of S.members.values()) el.appendChild(memberRow(m, host));
  }
  function memberRow(m, canEdit) {
    const d = document.createElement('div'); d.className = 'member';
    const dist = S.positions.get(m.user_id) && S.me ? fmtDist(Geo.distanceMeters(S.me.lat, S.me.lng, S.positions.get(m.user_id).lat, S.positions.get(m.user_id).lng)) : '';
    d.innerHTML = `<span class="dot" style="background:${STATUS_COLORS[m.status] || '#888'}"></span><span class="name">${esc(m.profile?.display_name || 'Rider')}</span><span class="role" style="color:${ROLE_COLORS[m.role]}">${m.role.toUpperCase()}</span><span class="st">${dist || m.status.replace('_', ' ')}</span>`;
    if (canEdit && m.user_id !== S.user.id) {
      const sel = document.createElement('select'); ['rider', 'subhost', 'medic', 'mechanic', 'sweep', 'spectator'].forEach((r) => { const o = new Option(r, r, false, r === m.role); sel.add(o); });
      sel.onchange = async () => { await sb.from('ride_members').update({ role: sel.value }).eq('ride_id', S.ride.id).eq('user_id', m.user_id); }; d.querySelector('.role').replaceWith(sel);
    }
    return d;
  }
  $('#btn-roles').onclick = () => toast('Use the dropdown beside each rider to set a role');
  $('#btn-share').onclick = async () => { const t = `Join my ride "${S.ride.name}" on Viciniti — code ${S.ride.code}\n${location.origin}${location.pathname}?join=${S.ride.code}`; if (navigator.share) navigator.share({ text: t }).catch(() => {}); else { await navigator.clipboard?.writeText(t); toast('Copied invite'); } };
  $('#btn-start').onclick = async () => { await sb.from('rides').update({ status: 'live', started_at: new Date().toISOString() }).eq('id', S.ride.id); S.ride.status = 'live'; startRideUI(); };
  $('#btn-leave-lobby').onclick = async () => { await sb.from('ride_members').update({ status: 'left', left_at: new Date().toISOString() }).eq('ride_id', S.ride.id).eq('user_id', S.user.id); leaveRide(); go('home'); };

  /* ---------- in-ride ---------- */
  async function startRideUI() {
    go('ride'); S.startedAt = S.startedAt || Date.now(); S.trip = 0; S.top = 0; S.speedSum = 0; S.speedN = 0; S.lastPos = null; S.track = [];
    if (navigator.getBattery) navigator.getBattery().then((b) => { S.battery = b.level; b.addEventListener('levelchange', () => (S.battery = b.level)); }).catch(() => {});
    document.body.classList.toggle('solo', S.solo);
    applySkin(S.skin);
    if (!S.tick) S.tick = setInterval(tick, 1000);
    if (!S.map) try {
      S.map = await OfflineMap.create('map', { center: S.ride?.meeting_lng ? [S.ride.meeting_lng, S.ride.meeting_lat] : [-117.16, 32.72], zoom: 13, onlineFallbackUrl: localStorage.getItem('pmtiles') || null });
      if (S.ride?.meeting_lat) S.map.setMeetingSpot(S.ride.meeting_lat, S.ride.meeting_lng, S.ride.meeting_label || 'MEET');
      if (S.ride?.route_geojson) { S.map.setRoute(S.ride.route_geojson); }
    } catch (e) { toast('Map unavailable: ' + e.message); }
    if ($('#st-wake').checked && 'wakeLock' in navigator) navigator.wakeLock.request('screen').then((w) => (S.wake = w)).catch(() => {});
    if (!S.demo && !S.watch) S.watch = navigator.geolocation.watchPosition(onGps, () => $('#led-gps').classList.remove('on'), { enableHighAccuracy: true, maximumAge: 500, timeout: 15000 });
  }
  function onGps(p) {
    const c = p.coords; const prev = S.lastPos; const now = Date.now();
    let speed = c.speed; if ((speed == null || isNaN(speed)) && prev) { const d = Geo.distanceMeters(prev.lat, prev.lng, c.latitude, c.longitude); speed = d / Math.max(0.5, (now - prev.t) / 1000); }
    speed = Math.max(0, speed || 0);
    if (prev) { const d = Geo.distanceMeters(prev.lat, prev.lng, c.latitude, c.longitude); if (d < 300) S.trip += d; }
    let heading = c.heading; if ((heading == null || isNaN(heading)) && prev && speed > 1) heading = Geo.bearing(prev.lat, prev.lng, c.latitude, c.longitude);
    S.me = { lat: c.latitude, lng: c.longitude, speed, heading, acc: c.accuracy, t: now }; S.lastPos = S.me; if (S.track.length === 0 || now - S.track[S.track.length - 1][2] > 3000) S.track.push([c.longitude, c.latitude, now]);
    S.top = Math.max(S.top, speed); if (speed > 0.5) { S.speedSum += speed; S.speedN++; }
    $('#led-gps').classList.add('on'); S.map && S.map.setPosition(c.latitude, c.longitude, heading);
    if (!S.demo && !S.solo && now - S.lastUpsert > 2000) { S.lastUpsert = now; sb.from('positions').upsert({ ride_id: S.ride.id, user_id: S.user.id, lat: c.latitude, lng: c.longitude, speed_mph: Geo.mpsToMph(speed), heading, accuracy_m: c.accuracy, recorded_at: new Date().toISOString() }).then(({ error }) => $('#led-sync').classList.toggle('blue', !error)); }
  }
  function leaderId() {
    const me = S.members.get(S.user?.id); if (me?.subgroup_id) { for (const m of S.members.values()) if (m.subgroup_id === me.subgroup_id && m.role === 'subhost') return m.user_id; }
    return S.ride?.host_id;
  }
  function tick() {
    if (S.solo) return soloTick();
    if (!S.ride) return;
    const lead = leaderId(); const lp = S.positions.get(lead); const amLead = lead === S.user?.id;
    let leadM = null; if (S.me && lp && !amLead) leadM = Geo.distanceMeters(S.me.lat, S.me.lng, lp.lat, lp.lng);
    let meetM = null; if (S.me && S.ride.meeting_lat) meetM = Geo.distanceMeters(S.me.lat, S.me.lng, S.ride.meeting_lat, S.ride.meeting_lng);
    // left-behind logic
    const radiusM = (S.ride.radius_ft || 200) / 3.28084;
    if (leadM != null && !S.demo) {
      const was = S.left; S.left = leadM > radiusM;
      if (S.left && !was) { event('left_behind', { meters: Math.round(leadM) }); showAlert('FALLING BEHIND · LEAD ' + fmtDist(leadM), 'warn'); say('Falling behind'); setStatus(leadM > radiusM * 4 ? 'lost' : 'at_risk'); }
      if (!S.left && was) { event('rejoined'); hideAlert(); setStatus('synced'); }
      if (S.left && leadM > radiusM * 4 && S.members.get(S.user.id)?.status !== 'lost') setStatus('lost');
    }
    $('#led-lead').className = 'led ' + (amLead ? 'on' : leadM == null ? '' : leadM > radiusM ? 'warn' : 'on');
    // riders & markers
    let synced = 0, total = 0; const marks = [];
    for (const m of S.members.values()) { if (m.status === 'left' || m.role === 'spectator') continue; total++; if (!['lost', 'missing', 'distress', 'critical'].includes(m.status)) synced++;
      const p = S.positions.get(m.user_id); if (p && m.user_id !== S.user?.id) marks.push({ id: m.user_id, lat: p.lat, lng: p.lng, label: (m.profile?.display_name || 'Rider').split(' ')[0] + (m.user_id === lead ? ' ★' : ''), color: m.user_id === lead ? '#3cff7a' : ROLE_COLORS[m.role] || '#2aa7ff' }); }
    S.map && S.map.setMarkers(marks);
    $('#vf-meet').textContent = 'MEET ' + fmtDist(meetM);
    const lp2 = distParts(leadM); const st = { speed: fmtSpeed(S.me?.speed || 0), unit: unit(), leadStr: amLead ? 'LEAD' : fmtDist(leadM), leadNum: lp2[0], leadUnit: lp2[1], amLead, meetStr: fmtDist(meetM), meetFrac: meetM == null ? 0 : Math.max(0, 1 - meetM / 3200), riders: total, synced, headingStr: compass(S.me?.heading), clock: clock(), clockAmPm: ampm(), battery: S.battery,
      gps: !!S.me && Date.now() - S.me.t < 10000, sync: $('#led-sync').classList.contains('blue') || S.demo, trip: (S.units === 'kmh' ? S.trip / 1000 : Geo.metersToMiles(S.trip)).toFixed(1),
      odo: (+localStorage.getItem('odo') || 0) + (S.units === 'kmh' ? S.trip / 1000 : Geo.metersToMiles(S.trip)), top: fmtSpeed(S.top), avg: fmtSpeed(S.speedN ? S.speedSum / S.speedN : 0), sos: !!S.sos, left: S.left, rideName: (S.ride.name || '').toUpperCase().slice(0, 16) };
    S.skinObj && S.skinObj.update(S.skinEl, st);
    if (S.demo) demoStep();
  }
  async function setStatus(status) { const m = S.members.get(S.user.id); if (m) m.status = status; await sb.from('ride_members').update({ status }).eq('ride_id', S.ride.id).eq('user_id', S.user.id); }
  function showAlert(t, cls) { const a = $('#alert'); a.textContent = t; a.className = 'alert ' + (cls || ''); a.hidden = false; }
  function hideAlert() { $('#alert').hidden = true; }
  $('#vf-follow').onclick = () => S.map && S.map.follow(true);

  /* skins */
  function applySkin(id) {
    S.skinObj = SKINS.find((s) => s.id === id) || SKINS[0]; S.skin = S.skinObj.id; localStorage.setItem('skin', S.skin);
    $('#cluster').innerHTML = S.skinObj.build(); S.skinEl = $('#cluster svg'); $('#skin-name').textContent = S.skinObj.name;
    const i = SKINS.indexOf(S.skinObj); $('#skin-dial .dial-knob').style.transform = `rotate(${-120 + i * 60}deg)`;
    $$('#st-skins button').forEach((b) => b.classList.toggle('on', b.dataset.s === S.skin));
  }
  $('#skin-dial').onclick = () => { const i = SKINS.findIndex((s) => s.id === S.skin); applySkin(SKINS[(i + 1) % SKINS.length].id); };
  function buildSkinButtons() { const el = $('#st-skins'); el.innerHTML = ''; SKINS.forEach((s) => { const b = document.createElement('button'); b.textContent = s.name; b.dataset.s = s.id; b.classList.toggle('on', s.id === S.skin); b.onclick = () => applySkin(s.id); el.appendChild(b); }); }

  /* ride buttons */
  $('#btn-riders').onclick = () => { if (S.solo) return toast('Solo ride — no group'); go('riders'); };
  $('#btn-rollcall').onclick = $('#btn-rollcall2').onclick = async () => { if (S.solo) return toast('Solo ride — no group'); if (S.demo) { S.rollcall = { user_id: S.user.id }; S.responses.clear(); go('rollcall'); renderRollcall(); return; } await event('roll_call'); S.rollcall = { user_id: S.user.id }; S.responses.clear(); go('rollcall'); renderRollcall(); };
  $('#btn-here').onclick = async () => { S.responses.add(S.user.id); renderRollcall(); if (!S.demo) await event('roll_call_response'); toast('Checked in'); };
  $('#btn-stop').onclick = async () => { if (S.solo) { if (confirm('Stop recording and show stats?')) showEnd(); return; } if (S.ride.host_id !== S.user?.id) { toast('Only the host can stop or end the ride'); return; } if (confirm('End the ride for everyone?\n(Cancel = group stop only)')) { await sb.from('rides').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', S.ride.id); showEnd(); } else { await event('stop'); showAlert('GROUP STOP', 'warn'); } };
  function renderRollcall() {
    const el = $('#rc-list'); el.innerHTML = ''; let n = 0, t = 0;
    for (const m of S.members.values()) { if (m.status === 'left' || m.role === 'spectator') continue; t++; const ok = S.responses.has(m.user_id); if (ok) n++; const d = document.createElement('div'); d.className = 'member'; d.innerHTML = `<span class="dot" style="background:${ok ? '#3cff7a' : '#444'}"></span><span class="name">${esc(m.profile?.display_name || 'Rider')}</span><span class="st">${ok ? 'HERE' : 'waiting'}</span>`; el.appendChild(d); }
    $('#rc-count').textContent = n + '/' + t; $('#rc-sub').textContent = n === t && t ? 'Everyone accounted for' : 'Called by ' + nameOf(S.rollcall?.user_id);
  }
  function renderRiders() { const el = $('#rd-list'); if (!el) return; el.innerHTML = ''; let t = 0; for (const m of S.members.values()) { if (m.status === 'left') continue; t++; el.appendChild(memberRow(m, false)); } $('#rd-count').textContent = t + ' riders'; }

  /* SOS slider */
  $('#btn-sos').onclick = () => { if (S.solo) return go('emergency'); $('#sos-slider').hidden = false; };
  $('#sos-cancel').onclick = () => { $('#sos-slider').hidden = true; $('#sos-knob').style.left = '4px'; };
  (() => { const k = $('#sos-knob'); let x0 = null; k.addEventListener('pointerdown', (e) => { x0 = e.clientX; k.setPointerCapture(e.pointerId); });
    k.addEventListener('pointermove', (e) => { if (x0 == null) return; const w = k.parentElement.clientWidth - k.offsetWidth - 8; const dx = Math.max(0, Math.min(w, e.clientX - x0)); k.style.left = 4 + dx + 'px'; if (dx >= w - 4) { x0 = null; sendSOS(); } });
    k.addEventListener('pointerup', () => { x0 = null; k.style.left = '4px'; }); })();
  async function sendSOS() {
    $('#sos-slider').hidden = true; $('#sos-knob').style.left = '4px'; $('#led-sos').classList.add('bad');
    const e = { ride_id: S.ride?.id, user_id: S.user?.id, type: 'sos', lat: S.me?.lat, lng: S.me?.lng, payload: {} }; S.sos = e;
    if (!S.demo) { await event('sos'); await setStatus('distress'); }
    navigator.vibrate && navigator.vibrate([200, 100, 200]); showEmergency(e);
  }
  function showEmergency(e) {
    const m = S.members.get(e.user_id); const p = m?.profile || (e.user_id === S.user?.id ? S.profile : null);
    go('emergency'); $('#em-who').textContent = (nameOf(e.user_id) + (e.user_id === S.user?.id ? ' (you)' : '')).toUpperCase();
    $('#em-dist').textContent = S.me && e.lat ? fmtDist(Geo.distanceMeters(S.me.lat, S.me.lng, e.lat, e.lng)) : '—';
    $('#em-contact').textContent = p?.emergency_contact_name ? p.emergency_contact_name + ' ' + (p.emergency_contact_phone || '') : '—'; $('#em-med').textContent = p?.medical_notes || '—';
    $('#btn-navigate').onclick = () => e.lat && window.open(`https://maps.apple.com/?daddr=${e.lat},${e.lng}`, '_blank'); $('#btn-call911').onclick = () => (location.href = 'tel:911');
    $('#btn-sos-clear').hidden = !(e.user_id === S.user?.id || S.ride?.host_id === S.user?.id);
  }
  $('#btn-sos-clear').onclick = async () => { S.sos = null; $('#led-sos').classList.remove('bad'); if (!S.demo) { await event('sos_cleared'); await setStatus('synced'); } go('ride'); };


  /* ---------- JUST RIDE (solo: record + stats, no group) ---------- */
  function soloTick() {
    const st = { speed: fmtSpeed(S.me?.speed || 0), unit: unit(), leadStr: '', leadNum: null, leadUnit: '', amLead: false, meetStr: '', meetFrac: 0, riders: 1, synced: 1, headingStr: compass(S.me?.heading), clock: clock(), clockAmPm: ampm(), battery: S.battery,
      gps: !!S.me && Date.now() - S.me.t < 10000, sync: true, trip: (S.units === 'kmh' ? S.trip / 1000 : Geo.metersToMiles(S.trip)).toFixed(1),
      odo: (+localStorage.getItem('odo') || 0) + (S.units === 'kmh' ? S.trip / 1000 : Geo.metersToMiles(S.trip)), top: fmtSpeed(S.top), avg: fmtSpeed(S.speedN ? S.speedSum / S.speedN : 0), sos: false, left: false, rideName: 'JUST RIDE', solo: true };
    const secs = (Date.now() - S.startedAt) / 1000; $('#vf-meet').textContent = Math.floor(secs / 3600) + ':' + String(Math.floor((secs % 3600) / 60)).padStart(2, '0') + ':' + String(Math.floor(secs % 60)).padStart(2, '0');
    S.skinObj && S.skinObj.update(S.skinEl, st);
  }
  $('#btn-just-ride').onclick = () => { S.solo = true; S.ride = null; S.members.clear(); S.positions.clear(); S.me = null; $('#led-sync').classList.add('blue'); startRideUI(); toast('Recording — press STOP to finish'); };
  function saveSoloRide() {
    const secs = S.startedAt ? (Date.now() - S.startedAt) / 1000 : 0;
    const r = { id: Date.now(), at: new Date().toISOString(), meters: Math.round(S.trip), secs: Math.round(secs), topMps: S.top, avgMps: S.speedN ? S.speedSum / S.speedN : 0, track: S.track.map((p) => [+p[0].toFixed(5), +p[1].toFixed(5)]) };
    const all = JSON.parse(localStorage.getItem('soloRides') || '[]'); all.unshift(r); localStorage.setItem('soloRides', JSON.stringify(all.slice(0, 50))); return r;
  }
  function fmtSecs(secs) { return Math.floor(secs / 3600) + 'h ' + Math.floor((secs % 3600) / 60) + 'm'; }
  async function showSoloStats(r) {
    $('#en-title').textContent = 'RIDE COMPLETE'; $('#en-dist').textContent = fmtDist(r.meters); $('#en-time').textContent = fmtSecs(r.secs);
    $('#en-top').textContent = fmtSpeed(r.topMps) + ' ' + unit(); $('#en-avg').textContent = fmtSpeed(r.avgMps) + ' ' + unit(); $('#en-riders').textContent = 'SOLO';
    $('#en-date').textContent = new Date(r.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    $('#en-row-avg').hidden = false; $('#en-row-date').hidden = false; go('end');
    const wrap = $('#en-mapwrap'); wrap.hidden = !(r.track && r.track.length > 1);
    if (S.endMap) { S.endMap.remove(); S.endMap = null; }
    if (r.track && r.track.length > 1) try {
      S.endMap = await OfflineMap.create('en-map', { center: r.track[Math.floor(r.track.length / 2)], zoom: 12, onlineFallbackUrl: localStorage.getItem('pmtiles') || null });
      S.endMap.setRoute({ type: 'Feature', geometry: { type: 'LineString', coordinates: r.track } }); S.endMap.fitRoute();
    } catch (e) { wrap.hidden = true; }
  }
  function renderSoloRides(el) {
    const all = JSON.parse(localStorage.getItem('soloRides') || '[]'); if (!all.length) return;
    const h = document.createElement('div'); h.className = 'lcd-title'; h.textContent = 'SOLO RIDES'; el.appendChild(h);
    all.forEach((r) => { const b = document.createElement('button'); b.className = 'ride-item'; b.style.width = '100%'; b.style.textAlign = 'left'; b.innerHTML = `<span><b>${new Date(r.at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</b><br><small class="dim">${fmtDist(r.meters)} · ${fmtSecs(r.secs)} · top ${fmtSpeed(r.topMps)} ${unit()}</small></span><span class="dim">SOLO</span>`; b.onclick = () => showSoloStats(r); el.appendChild(b); });
  }

  /* end */
  function showEnd() {
    const mi = Geo.metersToMiles(S.trip); localStorage.setItem('odo', ((+localStorage.getItem('odo') || 0) + (S.units === 'kmh' ? S.trip / 1000 : mi)).toFixed(1));
    if (S.solo) { const r = saveSoloRide(); leaveRide(); S.solo = false; document.body.classList.remove('solo'); return showSoloStats(r); }
    $('#en-title').textContent = 'RIDE COMPLETE'; $('#en-row-avg').hidden = true; $('#en-row-date').hidden = true; $('#en-mapwrap').hidden = true;
    $('#en-dist').textContent = fmtDist(S.trip); const secs = S.startedAt ? (Date.now() - S.startedAt) / 1000 : 0; $('#en-time').textContent = Math.floor(secs / 3600) + 'h ' + Math.floor((secs % 3600) / 60) + 'm';
    $('#en-top').textContent = fmtSpeed(S.top) + ' ' + unit(); $('#en-riders').textContent = [...S.members.values()].filter((m) => m.role !== 'spectator').length;
    leaveRide(); go('end');
  }
  function leaveRide() {
    if (S.watch) { navigator.geolocation.clearWatch(S.watch); S.watch = null; } clearInterval(S.tick); S.tick = null; if (S.channel) { sb && sb.removeChannel(S.channel); S.channel = null; }
    if (S.map) { S.map.remove(); S.map = null; } S.wake && S.wake.release().catch(() => {}); S.ride = null; S.members.clear(); S.positions.clear(); S.startedAt = 0; S.left = false; S.sos = null; hideAlert();
  }

  /* ---------- profile ---------- */
  function fillProfile() { const p = S.profile || {}; $('#pf-name').value = p.display_name || ''; $('#pf-ecn').value = p.emergency_contact_name || ''; $('#pf-ecp').value = p.emergency_contact_phone || ''; $('#pf-med').value = p.medical_notes || ''; $$('#pf-vehicle button').forEach((b) => b.classList.toggle('on', b.dataset.v === (p.vehicle_class || 'motorbike'))); }
  $$('#pf-vehicle button').forEach((b) => (b.onclick = () => $$('#pf-vehicle button').forEach((x) => x.classList.toggle('on', x === b))));
  $('#btn-save-profile').onclick = async () => {
    const row = { id: S.user.id, display_name: $('#pf-name').value.trim() || 'Rider', vehicle_class: $('#pf-vehicle .on').dataset.v, emergency_contact_name: $('#pf-ecn').value.trim() || null, emergency_contact_phone: $('#pf-ecp').value.trim() || null, medical_notes: $('#pf-med').value.trim() || null, updated_at: new Date().toISOString() };
    const { error } = await sb.from('profiles').upsert(row); $('#pf-err').textContent = error ? error.message : ''; if (!error) { S.profile = row; toast('Profile saved'); go('home'); }
  };

  /* ---------- settings ---------- */
  async function fillSettings() { $('#st-pmtiles').value = localStorage.getItem('pmtiles') || ''; $$('#st-units button').forEach((b) => b.classList.toggle('on', b.dataset.u === S.units)); const m = await OfflineMap.Region.status(); $('#st-map').textContent = m.downloaded ? (m.bytes / 1048576).toFixed(0) + ' MB stored' : 'not stored'; }
  $$('#st-units button').forEach((b) => (b.onclick = () => { S.units = b.dataset.u; localStorage.setItem('units', S.units); $$('#st-units button').forEach((x) => x.classList.toggle('on', x === b)); }));
  $('#st-dl').onclick = async () => { const url = $('#st-pmtiles').value.trim(); if (!url) return toast('Enter the .pmtiles URL'); localStorage.setItem('pmtiles', url); try { await OfflineMap.Region.download(url, (g, t) => { $('#st-bar').style.width = t ? (100 * g / t) + '%' : '50%'; $('#st-map').textContent = (g / 1048576).toFixed(0) + ' MB…'; }); toast('Region stored'); fillSettings(); } catch (e) { toast(e.message); } };
  $('#st-rm').onclick = async () => { await OfflineMap.Region.remove(); fillSettings(); };

  /* ---------- demo mode (no account needed) ---------- */
  $('#btn-demo').onclick = () => {
    S.demo = true; S.user = { id: 'me' }; S.profile = { display_name: 'You', vehicle_class: 'motorbike', emergency_contact_name: 'Demo Contact', emergency_contact_phone: '555-0100' };
    const lat = 32.84, lng = -117.14;
    S.ride = { id: 'demo', name: 'Demo Canyon Run', code: 'DEMO', spectator_code: 'DEMO01', host_id: 'lead', status: 'live', radius_ft: 200, meeting_lat: lat + 0.01, meeting_lng: lng + 0.01, meeting_label: 'Coffee stop' };
    const mk = (id, name, role) => ({ user_id: id, role, status: 'synced', profile: { display_name: name } });
    S.members.clear(); [mk('me', 'You', 'rider'), mk('lead', 'Marcus', 'host'), mk('dee', 'Dee', 'medic'), mk('tony', 'Tony', 'sweep'), mk('kai', 'Kai', 'rider')].forEach((m) => S.members.set(m.user_id, m));
    S.demoT = 0; S.me = { lat, lng, speed: 0, heading: 45, t: Date.now() }; $('#led-gps').classList.add('on'); $('#led-sync').classList.add('blue');
    startRideUI();
  };
  function demoStep() {
    S.demoT++; const t = S.demoT; const sp = 15 + 10 * Math.sin(t / 9) + (t % 60 < 8 ? 0 : 6); // m/s
    const h = (45 + 20 * Math.sin(t / 25)) % 360; const dl = sp / 111320, dla = dl * Math.cos(h * Math.PI / 180), dln = dl * Math.sin(h * Math.PI / 180) / Math.cos(S.me.lat * Math.PI / 180);
    S.me = { lat: S.me.lat + dla, lng: S.me.lng + dln, speed: sp, heading: h, t: Date.now() }; S.trip += sp; S.top = Math.max(S.top, sp); S.speedSum += sp; S.speedN++;
    S.map && S.map.setPosition(S.me.lat, S.me.lng, h);
    const off = (k) => ({ lat: S.me.lat + dla * k * 4, lng: S.me.lng + dln * k * 4 });
    S.positions.set('lead', { user_id: 'lead', ...off(1.2 + Math.sin(t / 15)) }); S.positions.set('dee', { user_id: 'dee', ...off(0.5) }); S.positions.set('tony', { user_id: 'tony', ...off(-1.5) }); S.positions.set('kai', { user_id: 'kai', ...off(-4 - t / 40) });
    if (t === 45) { S.members.get('kai').status = 'at_risk'; showAlert('KAI LEFT BEHIND · 0.4 mi', 'warn'); say('Kai left behind'); } if (t === 70) { hideAlert(); S.members.get('kai').status = 'synced'; }
  }

  const esc = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const joinParam = new URLSearchParams(location.search).get('join'); if (joinParam) $('#jn-code').value = joinParam.toUpperCase();
  boot();
})();

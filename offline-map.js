/* offline-map.js — shared Protomaps/PMTiles offline map module
 * Used by: Speedometer app and Viciniti.
 * Depends on (load before this module, or let it auto-load):
 *   MapLibre GL JS  https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js
 *   PMTiles         https://unpkg.com/pmtiles@3.2.1/dist/pmtiles.js
 * Region file: one .pmtiles extract (e.g. San Diego County, maxzoom 14).
 */
(function (global) {
  'use strict';

  const CDN = {
    maplibreJs: 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js',
    maplibreCss: 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css',
    pmtiles: 'https://unpkg.com/pmtiles@3.2.1/dist/pmtiles.js',
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
  };
  const REGION_FILE = 'region.pmtiles';
  const DB_NAME = 'offline-map';
  const DB_STORE = 'files';

  /* ---------- tiny loader ---------- */
  function loadScript(src) {
    return new Promise((res, rej) => {
      if ([...document.scripts].some(s => s.src === src)) return res();
      const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load failed ' + src));
      document.head.appendChild(s);
    });
  }
  function loadCss(href) {
    if ([...document.styleSheets].some(s => s.href === href)) return;
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
  }
  async function ensureLibs() {
    loadCss(CDN.maplibreCss);
    if (!global.maplibregl) await loadScript(CDN.maplibreJs);
    if (!global.pmtiles) await loadScript(CDN.pmtiles);
  }

  /* ---------- storage: OPFS first, IndexedDB fallback ---------- */
  const Store = {
    async _opfs() { try { return navigator.storage && navigator.storage.getDirectory ? await navigator.storage.getDirectory() : null; } catch { return null; } },
    _idb() {
      return new Promise((res, rej) => {
        const r = indexedDB.open(DB_NAME, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(DB_STORE);
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
    },
    async getFile() {
      const dir = await this._opfs();
      if (dir) { try { const h = await dir.getFileHandle(REGION_FILE); return await h.getFile(); } catch { /* fallthrough */ } }
      const db = await this._idb();
      return new Promise((res) => {
        const tx = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(REGION_FILE);
        tx.onsuccess = () => res(tx.result ? new File([tx.result], REGION_FILE) : null);
        tx.onerror = () => res(null);
      });
    },
    async putStream(response, onProgress) {
      const total = Number(response.headers.get('content-length')) || 0;
      const dir = await this._opfs();
      let received = 0;
      if (dir && 'createWritable' in FileSystemFileHandle.prototype) {
        const h = await dir.getFileHandle(REGION_FILE, { create: true });
        const w = await h.createWritable();
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await w.write(value); received += value.length;
          onProgress && onProgress(received, total);
        }
        await w.close();
        return;
      }
      // IndexedDB fallback (Safari without OPFS writable): buffer then store blob
      const chunks = []; const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); received += value.length; onProgress && onProgress(received, total);
      }
      const blob = new Blob(chunks);
      const db = await this._idb();
      await new Promise((res, rej) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put(blob, REGION_FILE);
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
      });
    },
    async remove() {
      const dir = await this._opfs();
      if (dir) { try { await dir.removeEntry(REGION_FILE); } catch {} }
      const db = await this._idb();
      await new Promise((res) => { const tx = db.transaction(DB_STORE, 'readwrite'); tx.objectStore(DB_STORE).delete(REGION_FILE); tx.oncomplete = res; tx.onerror = res; });
    },
    async meta() {
      const f = await this.getFile();
      if (!f) return { downloaded: false };
      return { downloaded: true, bytes: f.size, name: f.name };
    },
  };

  /* ---------- region download ---------- */
  const OfflineRegion = {
    status: () => Store.meta(),
    remove: () => Store.remove(),
    async download(url, onProgress) {
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error('Download failed: ' + res.status);
      await Store.putStream(res, onProgress);
      // Pre-warm glyphs so labels work offline (cached by the service worker)
      const ranges = ['0-255', '256-511'];
      for (const font of ['Noto Sans Regular', 'Noto Sans Medium']) {
        for (const r of ranges) {
          try { await fetch(CDN.glyphs.replace('{fontstack}', encodeURIComponent(font)).replace('{range}', r)); } catch {}
        }
      }
      return Store.meta();
    },
  };

  /* ---------- style (Protomaps basemaps v4 schema, dark) ---------- */
  function buildStyle(sourceUrl, theme) {
    const t = Object.assign({
      bg: '#0b0e14', earth: '#121622', water: '#0d2238', park: '#13241c', building: '#1c2130',
      roadMinor: '#2a3142', roadMed: '#3a4358', roadMajor: '#5a6680', highway: '#8a7a3a', path: '#262c3a',
      label: '#c9d1e3', labelHalo: '#0b0e14', boundary: '#3b445a',
    }, theme || {});
    return {
      version: 8,
      glyphs: CDN.glyphs,
      sources: { pm: { type: 'vector', url: sourceUrl, attribution: '© OpenStreetMap, Protomaps' } },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': t.bg } },
        { id: 'earth', type: 'fill', source: 'pm', 'source-layer': 'earth', paint: { 'fill-color': t.earth } },
        { id: 'landuse-park', type: 'fill', source: 'pm', 'source-layer': 'landuse', filter: ['in', 'kind', 'park', 'nature_reserve', 'forest', 'wood', 'golf_course', 'cemetery'], paint: { 'fill-color': t.park } },
        { id: 'water', type: 'fill', source: 'pm', 'source-layer': 'water', paint: { 'fill-color': t.water } },
        { id: 'buildings', type: 'fill', source: 'pm', 'source-layer': 'buildings', minzoom: 13, paint: { 'fill-color': t.building, 'fill-opacity': 0.8 } },
        { id: 'road-path', type: 'line', source: 'pm', 'source-layer': 'roads', filter: ['==', 'kind', 'path'], minzoom: 13, paint: { 'line-color': t.path, 'line-width': 1, 'line-dasharray': [2, 2] } },
        { id: 'road-minor', type: 'line', source: 'pm', 'source-layer': 'roads', filter: ['==', 'kind', 'minor_road'], minzoom: 11, paint: { 'line-color': t.roadMinor, 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 11, 0.5, 18, 8] } },
        { id: 'road-medium', type: 'line', source: 'pm', 'source-layer': 'roads', filter: ['==', 'kind', 'medium_road'], paint: { 'line-color': t.roadMed, 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 8, 0.5, 18, 10] } },
        { id: 'road-major', type: 'line', source: 'pm', 'source-layer': 'roads', filter: ['==', 'kind', 'major_road'], paint: { 'line-color': t.roadMajor, 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 6, 0.6, 18, 14] } },
        { id: 'road-highway', type: 'line', source: 'pm', 'source-layer': 'roads', filter: ['==', 'kind', 'highway'], paint: { 'line-color': t.highway, 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 5, 1, 18, 18] } },
        { id: 'boundaries', type: 'line', source: 'pm', 'source-layer': 'boundaries', paint: { 'line-color': t.boundary, 'line-width': 1, 'line-dasharray': [3, 2] } },
        { id: 'road-labels', type: 'symbol', source: 'pm', 'source-layer': 'roads', minzoom: 13, filter: ['in', 'kind', 'highway', 'major_road', 'medium_road', 'minor_road'],
          layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 11 },
          paint: { 'text-color': t.label, 'text-halo-color': t.labelHalo, 'text-halo-width': 1.5 } },
        { id: 'place-labels', type: 'symbol', source: 'pm', 'source-layer': 'places', filter: ['in', 'kind', 'locality', 'neighbourhood', 'region'],
          layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Medium'], 'text-size': ['interpolate', ['linear'], ['zoom'], 6, 11, 14, 16] },
          paint: { 'text-color': t.label, 'text-halo-color': t.labelHalo, 'text-halo-width': 1.5 } },
      ],
    };
  }

  /* ---------- the map ---------- */
  async function createOfflineMap(container, opts) {
    opts = Object.assign({ center: [-117.16, 32.72], zoom: 11, theme: null, onlineFallbackUrl: null, units: 'mph' }, opts || {});
    await ensureLibs();

    const protocol = new pmtiles.Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);

    let sourceUrl = null, mode = 'none';
    const file = await Store.getFile();
    if (file) {
      const p = new pmtiles.PMTiles(new pmtiles.FileSource(file));
      protocol.add(p);
      sourceUrl = 'pmtiles://' + p.source.getKey();
      mode = 'offline';
    } else if (opts.onlineFallbackUrl) {
      sourceUrl = 'pmtiles://' + opts.onlineFallbackUrl;
      mode = 'online';
    }

    const map = new maplibregl.Map({
      container, center: opts.center, zoom: opts.zoom, attributionControl: false,
      style: sourceUrl ? buildStyle(sourceUrl, opts.theme) : { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0b0e14' } }] },
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }));

    let follow = true;
    const markers = new Map();
    let meMarker = null, meetingMarker = null;
    map.on('dragstart', () => { follow = false; });

    function makeArrow(color) {
      const el = document.createElement('div');
      el.style.cssText = 'width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;border-bottom:24px solid ' + color + ';filter:drop-shadow(0 0 4px ' + color + ');';
      return el;
    }
    function makeDot(color, label) {
      const el = document.createElement('div');
      el.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;font:600 11px system-ui;color:#fff;';
      el.innerHTML = '<div style="width:14px;height:14px;border-radius:50%;background:' + color + ';border:2px solid #fff;box-shadow:0 0 6px ' + color + '"></div>' + (label ? '<span style="background:rgba(0,0,0,.6);padding:1px 5px;border-radius:6px">' + label + '</span>' : '');
      return el;
    }

    await new Promise((res) => map.once('load', res));

    map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'route-casing', type: 'line', source: 'route', paint: { 'line-color': '#000', 'line-width': 7, 'line-opacity': 0.5 }, layout: { 'line-join': 'round', 'line-cap': 'round' } });
    map.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#2bd4ff', 'line-width': 4 }, layout: { 'line-join': 'round', 'line-cap': 'round' } });
    map.addSource('trail', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } } });
    map.addLayer({ id: 'trail-line', type: 'line', source: 'trail', paint: { 'line-color': '#ff4fd8', 'line-width': 3, 'line-opacity': 0.8 } });
    const trail = [];

    const api = {
      map, mode,
      /** Your own position. heading in degrees. */
      setPosition(lat, lng, heading, { trail: addTrail = true } = {}) {
        if (!meMarker) { meMarker = new maplibregl.Marker({ element: makeArrow('#2bd4ff'), rotationAlignment: 'map' }).setLngLat([lng, lat]).addTo(map); }
        meMarker.setLngLat([lng, lat]); if (heading != null && !isNaN(heading)) meMarker.setRotation(heading);
        if (addTrail) { trail.push([lng, lat]); if (trail.length > 5000) trail.shift(); map.getSource('trail').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: trail } }); }
        if (follow) map.easeTo({ center: [lng, lat], duration: 500 });
      },
      /** Other riders: [{id, lat, lng, label, color, heading}] */
      setMarkers(list) {
        const seen = new Set();
        for (const r of list) {
          seen.add(r.id);
          let m = markers.get(r.id);
          if (!m) { m = new maplibregl.Marker({ element: makeDot(r.color || '#ffb020', r.label) }).setLngLat([r.lng, r.lat]).addTo(map); markers.set(r.id, m); }
          m.setLngLat([r.lng, r.lat]);
        }
        for (const [id, m] of markers) if (!seen.has(id)) { m.remove(); markers.delete(id); }
      },
      setMeetingSpot(lat, lng, label) {
        if (lat == null) { meetingMarker && meetingMarker.remove(); meetingMarker = null; return; }
        if (!meetingMarker) meetingMarker = new maplibregl.Marker({ element: makeDot('#3cff7a', label || 'Meet'), anchor: 'bottom' }).addTo(map);
        meetingMarker.setLngLat([lng, lat]);
      },
      /** GeoJSON LineString / Feature / FeatureCollection */
      setRoute(geojson) {
        const data = !geojson ? { type: 'FeatureCollection', features: [] }
          : geojson.type === 'LineString' ? { type: 'Feature', geometry: geojson, properties: {} } : geojson;
        map.getSource('route').setData(data);
      },
      fitRoute(padding = 60) {
        const d = map.getSource('route')._data; const coords = [];
        const walk = (g) => { if (!g) return; if (g.type === 'LineString') coords.push(...g.coordinates); else if (g.type === 'Feature') walk(g.geometry); else if (g.type === 'FeatureCollection') g.features.forEach(walk); else if (g.type === 'MultiLineString') g.coordinates.forEach(c => coords.push(...c)); };
        walk(d); if (!coords.length) return;
        const b = coords.reduce((bb, c) => bb.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
        follow = false; map.fitBounds(b, { padding, duration: 600 });
      },
      follow(on) { follow = on !== false; if (follow && meMarker) map.easeTo({ center: meMarker.getLngLat(), duration: 300 }); },
      isFollowing: () => follow,
      clearTrail() { trail.length = 0; map.getSource('trail').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] } }); },
      setTheme(theme) { const s = buildStyle(sourceUrl, theme); map.setStyle(s); },
      resize: () => map.resize(),
      remove() { map.remove(); maplibregl.removeProtocol('pmtiles'); },
    };
    return api;
  }

  /* ---------- geo helpers shared by both apps ---------- */
  const Geo = {
    distanceMeters(lat1, lon1, lat2, lon2) {
      const R = 6371000, toR = Math.PI / 180, dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(a));
    },
    metersToFeet: (m) => m * 3.28084,
    metersToMiles: (m) => m / 1609.344,
    mpsToMph: (v) => v * 2.23694,
    bearing(lat1, lon1, lat2, lon2) {
      const toR = Math.PI / 180, y = Math.sin((lon2 - lon1) * toR) * Math.cos(lat2 * toR);
      const x = Math.cos(lat1 * toR) * Math.sin(lat2 * toR) - Math.sin(lat1 * toR) * Math.cos(lat2 * toR) * Math.cos((lon2 - lon1) * toR);
      return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    },
  };

  global.OfflineMap = { create: createOfflineMap, Region: OfflineRegion, Geo, CDN };
})(window);

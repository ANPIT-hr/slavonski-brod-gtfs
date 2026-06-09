// Owns the Leaflet map and every imperative map feature: base layers, line
// overlays, the PDF tracing overlay, route tracing, stop editing, GPS, the
// rider trip-planner highlight, and the tappable departure board. UI components
// drive it through methods and observe it through the stores in ../stores.js.
//
// This is the old app.js reorganised into a controller: the algorithms and
// Leaflet calls are unchanged; the DOM `getElementById` glue is replaced by
// store writes and small callbacks so Svelte renders the chrome.
import { get } from 'svelte/store';
import { haversine, fmtT } from '../util.js';
import { createPlanner } from '../planner.js';
import { createGeometry } from '../geometry.js';
import { walkRoute } from '../geo.js';
import {
	mode,
	modesRevealed,
	scheduleState,
	lines as linesStore,
	lineVisibility,
	endpoints,
	pinMode,
	board,
	geoStatus,
	traceRoutes,
	traceVariant
} from '../stores.js';

const STOP_OVERRIDE_KEY = 'sb_stop_overrides';
const NEW_STOPS_KEY = 'sb_new_stops';
const BOUNDS_KEY = 'sb_overlay_bounds';
const TRACE_KEY = 'sb_shapes';
const DEFAULT_BOUNDS = [
	[45.140012, 17.961231],
	[45.19508, 18.071693]
];

export class MapController {
	/**
	 * @param {*} L     the Leaflet module (dynamically imported, browser-only)
	 * @param {HTMLElement} el  the #map container
	 * @param {object} D  GTFS_DATA
	 */
	constructor(L, el, D) {
		this.L = L;
		this.D = D;
		this.SCH = null;
		this.planner = null;
		this.geom = null;
		this._schedState = 'idle';
		this._destroyers = [];

		this.stopById = {};
		D.stops.forEach((s) => (this.stopById[s.id] = s));

		this._initMap(el);
		this._initLines();
		this._initOverlay();
		this._initContextMenu();
		this._initTrace();
		this._initStopEdit();
		this._initPlanner();
		this._initProdStops();

		this.applyMode(get(mode));
	}

	stopName(id) {
		return this.stopById[id] ? this.stopById[id].name : id;
	}
	routeMeta(rid) {
		return this.D.routes[rid] || { color: '#666', short_name: rid };
	}

	// ---- Base map + layers --------------------------------------------------
	_initMap(el) {
		const L = this.L;
		const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
		});
		const esriImagery = L.tileLayer(
			'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
			{ maxZoom: 19, attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics' }
		);
		const esriLabels = L.tileLayer(
			'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
			{ maxZoom: 19 }
		);
		const satellite = L.layerGroup([esriImagery]);
		const satelliteLabels = L.layerGroup([esriImagery, esriLabels]);

		const map = L.map(el, { layers: [street] });
		this.map = map;
		L.control
			.layers(
				{ 'Karta (ulice)': street, Satelit: satellite, 'Satelit + nazivi': satelliteLabels },
				null,
				{ position: 'topleft' }
			)
			.addTo(map);

		// Left-click is reserved for object interaction; middle-click drag pans.
		map.dragging.disable();
		let _pan = false,
			_px = 0,
			_py = 0;
		const _el = map.getContainer();
		const onDown = (e) => {
			if (e.button !== 1) return;
			e.preventDefault();
			_pan = true;
			_px = e.clientX;
			_py = e.clientY;
		};
		const onMove = (e) => {
			if (!_pan) return;
			map.panBy([_px - e.clientX, _py - e.clientY], { animate: false });
			_px = e.clientX;
			_py = e.clientY;
		};
		const onUp = (e) => {
			if (e.button === 1) _pan = false;
		};
		_el.addEventListener('mousedown', onDown);
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
		this._destroyers.push(() => {
			_el.removeEventListener('mousedown', onDown);
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
		});
	}

	// ---- Line overlays ------------------------------------------------------
	_initLines() {
		const L = this.L,
			D = this.D,
			map = this.map;
		this.groups = {};
		this.layerKeys = [];
		this.linePolylines = {};
		this.origGeom = {};
		this.stopLineMarkers = {};
		this._loadStopOverrides();
		this._loadNewStops();
		const allLatLngs = [];

		D.lines.forEach((line) => {
			const meta = this.routeMeta(line.route_id);
			const key = line.route_id + '|' + line.direction_id;
			const group = L.layerGroup();

			const pl = L.polyline(line.geometry, { color: meta.color, weight: 4, opacity: 0.85 }).bindTooltip(
				`${meta.short_name} — ${line.headsign || meta.long_name}`
			);
			pl.addTo(group);
			this.linePolylines[key] = pl;
			this.origGeom[key] = line.geometry;
			line.geometry.forEach((p) => allLatLngs.push(p));

			(line.branches || []).forEach((seg) => {
				if (!seg || seg.length < 2) return;
				L.polyline(seg, { color: meta.color, weight: 4, opacity: 0.85 })
					.bindTooltip(`${meta.short_name} — ${line.headsign || meta.long_name}`)
					.addTo(group);
				seg.forEach((p) => allLatLngs.push(p));
			});

			line.stop_ids.forEach((sid, i) => {
				const s = this.stopById[sid];
				if (!s) return;
				const ov = this.stopOverrides[sid];
				const lat = ov ? ov.lat : s.lat,
					lon = ov ? ov.lon : s.lon;
				const marker = L.marker([lat, lon], {
					icon: L.divIcon({
						className: '',
						html: `<div class="stop-dot" style="width:11px;height:11px;border-color:${meta.color}"></div>`,
						iconSize: [11, 11],
						iconAnchor: [6, 6]
					})
				});
				marker.bindPopup(
					`<b>${s.name}</b><br>${s.desc || ''}` +
						`<br><small>${meta.short_name} · stajalište ${i + 1}/${line.stop_ids.length}</small>` +
						`<br><small>${lat.toFixed(6)}, ${lon.toFixed(6)}</small>`
				);
				marker.addTo(group);
				(this.stopLineMarkers[sid] = this.stopLineMarkers[sid] || []).push(marker);
			});

			this.groups[key] = group;
			this.layerKeys.push({ key, meta, line });
		});

		map.fitBounds(
			allLatLngs.length
				? L.latLngBounds(allLatLngs)
				: [
						[45.16, 18.01],
						[45.16, 18.01]
					]
		);

		// Publish the line list + initial (all-hidden) visibility.
		const vis = {};
		linesStore.set(
			this.layerKeys.map(({ key, meta, line }) => {
				vis[key] = false;
				const dirTxt =
					D.lines.filter((l) => l.route_id === line.route_id).length > 1
						? ` (${line.headsign || 'smjer ' + line.direction_id})`
						: '';
				return {
					key,
					color: meta.color,
					shortName: meta.short_name,
					longName: meta.long_name,
					dirText: dirTxt
				};
			})
		);
		lineVisibility.set(vis);
		// NB: traceRoutes are published from _initTrace(), once this.shapes exists.
	}

	setLineVisible(key, on) {
		if (on) this.groups[key].addTo(this.map);
		else this.map.removeLayer(this.groups[key]);
		lineVisibility.update((v) => ({ ...v, [key]: on }));
	}
	setAllLines(on) {
		const v = {};
		this.layerKeys.forEach(({ key }) => {
			if (on) this.groups[key].addTo(this.map);
			else this.map.removeLayer(this.groups[key]);
			v[key] = on;
		});
		lineVisibility.set(v);
	}

	_loadStopOverrides() {
		try {
			this.stopOverrides = JSON.parse(localStorage.getItem(STOP_OVERRIDE_KEY)) || {};
		} catch {
			this.stopOverrides = {};
		}
	}
	_saveStopOverrides() {
		localStorage.setItem(STOP_OVERRIDE_KEY, JSON.stringify(this.stopOverrides));
	}
	_loadNewStops() {
		try {
			this.newStops = JSON.parse(localStorage.getItem(NEW_STOPS_KEY)) || [];
		} catch {
			this.newStops = [];
		}
	}
	_saveNewStops() {
		localStorage.setItem(NEW_STOPS_KEY, JSON.stringify(this.newStops));
	}

	// ---- GPS (Development): live position + one-shot fixes ------------------
	startGeo() {
		const L = this.L,
			map = this.map;
		if (!('geolocation' in navigator)) {
			alert('Uređaj/preglednik ne podržava geolokaciju.');
			return;
		}
		let first = true;
		geoStatus.set('tražim…');
		this._geoWatchId = navigator.geolocation.watchPosition(
			(pos) => {
				this._lastFix = {
					lat: pos.coords.latitude,
					lon: pos.coords.longitude,
					accuracy: pos.coords.accuracy
				};
				const ll = [this._lastFix.lat, this._lastFix.lon];
				if (!this._meMarker) {
					this._meMarker = L.marker(ll, {
						icon: L.divIcon({
							className: '',
							html: '<div class="me-dot"></div>',
							iconSize: [16, 16],
							iconAnchor: [8, 8]
						}),
						zIndexOffset: 2000,
						interactive: false
					}).addTo(map);
					this._meCircle = L.circle(ll, {
						radius: this._lastFix.accuracy,
						color: '#1a73e8',
						weight: 1,
						fillColor: '#1a73e8',
						fillOpacity: 0.12,
						interactive: false
					}).addTo(map);
				} else {
					this._meMarker.setLatLng(ll);
					this._meCircle.setLatLng(ll).setRadius(this._lastFix.accuracy);
				}
				if (first) map.setView(ll, Math.max(map.getZoom(), 17));
				first = false;
				geoStatus.set(`±${Math.round(this._lastFix.accuracy)} m`);
			},
			(err) => {
				this.stopGeo();
				geoStatus.set(
					err.code === 1
						? 'lokacija blokirana — dopusti u postavkama preglednika'
						: 'GPS greška: ' + err.message
				);
			},
			{ enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
		);
	}
	stopGeo() {
		if (this._geoWatchId != null) navigator.geolocation.clearWatch(this._geoWatchId);
		this._geoWatchId = null;
		if (this._meMarker) {
			this.map.removeLayer(this._meMarker);
			this._meMarker = null;
		}
		if (this._meCircle) {
			this.map.removeLayer(this._meCircle);
			this._meCircle = null;
		}
		geoStatus.set('');
	}
	get geoActive() {
		return this._geoWatchId != null;
	}
	_withGpsFix(onOk, btn) {
		if (!('geolocation' in navigator)) {
			alert('Uređaj/preglednik ne podržava geolokaciju.');
			return;
		}
		const orig = btn ? btn.textContent : null;
		if (btn) {
			btn.disabled = true;
			btn.textContent = 'GPS…';
		}
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				if (btn) {
					btn.disabled = false;
					btn.textContent = orig;
				}
				onOk(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
			},
			(err) => {
				if (btn) {
					btn.disabled = false;
					btn.textContent = orig;
				}
				alert('GPS nedostupan: ' + err.message);
			},
			{ enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
		);
	}

	// ---- PDF overlay (georeferencing) ---------------------------------------
	_initOverlay() {
		const L = this.L,
			map = this.map;
		this.imgRatio = 2400 / 1697;
		this._ovOn = true;
		this.ovEdit = false;
		this._setBox(this._loadBounds());
		this._normalizeAspect();

		this.overlay = L.imageOverlay(
			'/overlay.png',
			[
				[this.south, this.west],
				[this.north, this.east]
			],
			{ opacity: 0.6, interactive: false }
		).addTo(map);
		this.overlay.on('load', () => {
			const el = this.overlay.getElement();
			if (el && el.naturalWidth && el.naturalHeight) {
				this.imgRatio = el.naturalWidth / el.naturalHeight;
				this._normalizeAspect();
				this._applyBox();
			}
		});

		this.handles = {};
		['nw', 'ne', 'sw', 'se'].forEach((k) => this._mkHandle(k, 'ov-corner'));
		this._mkHandle('center', 'ov-center', '✥');

		// Keyboard 1–5 → opacity 0/25/50/75/100 %.
		const onKey = (e) => {
			if (e.ctrlKey || e.metaKey || e.altKey) return;
			const tag = (e.target.tagName || '').toLowerCase();
			if (
				tag === 'textarea' ||
				(tag === 'input' && /^(text|number|search|email|url|password)$/.test(e.target.type))
			)
				return;
			const lvl = { 1: 0, 2: 0.25, 3: 0.5, 4: 0.75, 5: 1 }[e.key];
			if (lvl === undefined) return;
			this.setOverlayOpacity(lvl);
		};
		document.addEventListener('keydown', onKey);
		this._destroyers.push(() => document.removeEventListener('keydown', onKey));
	}
	_loadBounds() {
		try {
			const raw = JSON.parse(localStorage.getItem(BOUNDS_KEY));
			if (Array.isArray(raw) && raw.length === 2) return raw;
		} catch {
			/* defaults */
		}
		return DEFAULT_BOUNDS;
	}
	_setBox(b) {
		this.south = Math.min(b[0][0], b[1][0]);
		this.north = Math.max(b[0][0], b[1][0]);
		this.west = Math.min(b[0][1], b[1][1]);
		this.east = Math.max(b[0][1], b[1][1]);
	}
	_aspectLon(latDeg) {
		return this.imgRatio / Math.cos((latDeg * Math.PI) / 180);
	}
	_normalizeAspect() {
		const cxLng = (this.east + this.west) / 2,
			cyLat = (this.north + this.south) / 2;
		const wLon = (this.north - this.south) * this._aspectLon(cyLat);
		this.west = cxLng - wLon / 2;
		this.east = cxLng + wLon / 2;
	}
	_saveBounds() {
		localStorage.setItem(
			BOUNDS_KEY,
			JSON.stringify([
				[this.south, this.west],
				[this.north, this.east]
			])
		);
	}
	_applyBox(except) {
		this.overlay.setBounds([
			[this.south, this.west],
			[this.north, this.east]
		]);
		const pos = {
			nw: [this.north, this.west],
			ne: [this.north, this.east],
			sw: [this.south, this.west],
			se: [this.south, this.east],
			center: [(this.north + this.south) / 2, (this.east + this.west) / 2]
		};
		for (const k in this.handles) if (k !== except) this.handles[k].setLatLng(pos[k]);
	}
	_mkHandle(key, cls, html) {
		const L = this.L;
		const m = L.marker([0, 0], {
			draggable: true,
			zIndexOffset: 1000,
			icon: L.divIcon({
				className: '',
				html: `<div class="${cls}">${html || ''}</div>`,
				iconSize: cls === 'ov-center' ? [26, 26] : [16, 16]
			})
		});
		m.on('dragstart', () => {
			if (key === 'center') return;
			m._anchor = {
				lat: key[0] === 'n' ? this.south : this.north,
				lng: key[1] === 'w' ? this.east : this.west
			};
		});
		m.on('drag', (e) => {
			const p = e.latlng;
			if (key === 'center') {
				const dLat = p.lat - (this.north + this.south) / 2,
					dLng = p.lng - (this.east + this.west) / 2;
				this.north += dLat;
				this.south += dLat;
				this.east += dLng;
				this.west += dLng;
			} else {
				const a = m._anchor;
				const phi = (a.lat + p.lat) / 2;
				const asp = this._aspectLon(phi);
				const hLat = Math.max(Math.abs(p.lat - a.lat), Math.abs(p.lng - a.lng) / asp, 1e-5);
				const wLon = hLat * asp;
				const newLat = a.lat + (key[0] === 'n' ? hLat : -hLat);
				const newLng = a.lng + (key[1] === 'e' ? wLon : -wLon);
				this.north = Math.max(a.lat, newLat);
				this.south = Math.min(a.lat, newLat);
				this.east = Math.max(a.lng, newLng);
				this.west = Math.min(a.lng, newLng);
			}
			this._applyBox(key);
		});
		m.on('dragend', () => {
			this._applyBox();
			this._saveBounds();
		});
		this.handles[key] = m;
	}
	_showHandles(on) {
		if (on) {
			this._applyBox();
			for (const k in this.handles) this.handles[k].addTo(this.map);
		} else for (const k in this.handles) this.map.removeLayer(this.handles[k]);
	}
	setOverlayVisible(on) {
		this._ovOn = on;
		const el = this.overlay.getElement();
		if (el) el.style.display = on ? '' : 'none';
		if (!on && this.ovEdit) this.setOverlayEdit(false);
	}
	setOverlayEdit(on) {
		this.ovEdit = on && this._ovOn;
		this._showHandles(this.ovEdit);
		if (!this.ovEdit) this._saveBounds();
		return this.ovEdit;
	}
	setOverlayOpacity(v) {
		v = Math.max(0, Math.min(1, v));
		this.overlay.setOpacity(v);
		const el = this.overlay.getElement();
		if (el) el.style.opacity = v;
		this._opacity = v;
		if (this._onOpacity) this._onOpacity(v);
		return v;
	}
	saveOverlay() {
		this._saveBounds();
	}
	resetOverlay() {
		this._setBox(DEFAULT_BOUNDS);
		this._normalizeAspect();
		this._applyBox();
		this._saveBounds();
	}
	exportOverlay() {
		const txt = JSON.stringify([
			[+this.south.toFixed(6), +this.west.toFixed(6)],
			[+this.north.toFixed(6), +this.east.toFixed(6)]
		]);
		if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(() => {});
		alert('Granice [SW, NE], kopirano u međuspremnik:\n\n' + txt);
	}

	// ---- Right-click: read off coordinates ----------------------------------
	_initContextMenu() {
		const L = this.L,
			map = this.map,
			D = this.D;
		map.on('contextmenu', (e) => {
			const { lat, lng } = e.latlng;
			let nearest = null,
				best = Infinity;
			D.stops.forEach((s) => {
				const d = haversine(lat, lng, s.lat, s.lon);
				if (d < best) {
					best = d;
					nearest = s;
				}
			});
			const coord = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
			const near = nearest
				? `<br><small>najbliže: <b>${nearest.name}</b> (${Math.round(best)} m)</small>`
				: '';
			const id = 'cp' + Math.round(performance.now());
			L.popup({ className: 'coord-pop' })
				.setLatLng(e.latlng)
				.setContent(`<code>${coord}</code>${near}<br><button id="${id}">Kopiraj</button>`)
				.openOn(map);
			setTimeout(() => {
				const b = document.getElementById(id);
				if (b)
					b.onclick = () => {
						(navigator.clipboard ? navigator.clipboard.writeText(coord) : Promise.reject())
							.then(() => (b.textContent = 'Kopirano ✓'))
							.catch(() => (b.textContent = coord));
					};
			}, 0);
		});
	}

	// ---- Route tracing → shapes.txt -----------------------------------------
	_initTrace() {
		const L = this.L;
		try {
			this.shapes = JSON.parse(localStorage.getItem(TRACE_KEY)) || {};
		} catch {
			this.shapes = {};
		}
		this.branchPolylines = {};
		this.tracing = false;
		this.traceKey = this.layerKeys.length ? this.layerKeys[0].key : null;
		this.traceShapeKey = this.traceKey;
		this.traceVariantIdx = 0;
		this.traceActiveIdx = -1;
		this.SNAP_PX = 15;
		this.snapRing = null;
		this.vtxLayer = L.layerGroup().addTo(this.map);

		const rks = new Set(
			Object.keys(this.shapes).map((k) => (k.includes(':') ? k.slice(0, k.lastIndexOf(':')) : k))
		);
		rks.forEach((rk) => this._redrawLine(rk));
		this._refreshTraceRoutes();

		this.map.on('click', (e) => this._onTraceClick(e));
	}
	_saveShapes() {
		localStorage.setItem(TRACE_KEY, JSON.stringify(this.shapes));
	}
	_getVariantKeys(routeKey) {
		const keys = [routeKey];
		for (let i = 1; this.shapes[routeKey + ':' + i] !== undefined; i++)
			keys.push(routeKey + ':' + i);
		return keys;
	}
	_ensureBranchPolyline(routeKey, shapeKey) {
		if (this.branchPolylines[shapeKey]) return;
		const meta = this.routeMeta(routeKey.split('|')[0]);
		const pl = this.L.polyline([], {
			color: meta.color,
			weight: 3,
			opacity: 0.55,
			dashArray: '8,5'
		});
		if (this.groups[routeKey]) pl.addTo(this.groups[routeKey]);
		this.branchPolylines[shapeKey] = pl;
	}
	_redrawLine(routeKey) {
		const primaryPts = this.shapes[routeKey];
		if (this.linePolylines[routeKey])
			this.linePolylines[routeKey].setLatLngs(
				primaryPts && primaryPts.length >= 2 ? primaryPts : this.origGeom[routeKey]
			);
		const varKeys = this._getVariantKeys(routeKey);
		for (let i = 1; i < varKeys.length; i++) {
			const sk = varKeys[i];
			this._ensureBranchPolyline(routeKey, sk);
			this.branchPolylines[sk].setLatLngs((this.shapes[sk] || []).length >= 2 ? this.shapes[sk] : []);
		}
	}
	_optLabel(key, meta, line) {
		const dir =
			this.D.lines.filter((l) => l.route_id === line.route_id).length > 1
				? ' ' + (line.headsign || 'smjer ' + line.direction_id)
				: '';
		const done = this._getVariantKeys(key).some(
			(sk) => this.shapes[sk] && this.shapes[sk].length >= 2
		)
			? ' ✓'
			: '';
		return meta.short_name + dir + done;
	}
	_refreshTraceRoutes() {
		traceRoutes.set(
			this.layerKeys.map(({ key, meta, line }) => ({ key, label: this._optLabel(key, meta, line) }))
		);
	}
	_updateVarNav() {
		if (!this.tracing || !this.traceKey) {
			traceVariant.set({ show: false, label: '', index: 0, count: 1 });
			return;
		}
		const n = this._getVariantKeys(this.traceKey).length;
		traceVariant.set({
			show: n > 1,
			label: `Var ${this.traceVariantIdx + 1}/${n}`,
			index: this.traceVariantIdx,
			count: n
		});
	}
	_renderVtx() {
		const L = this.L;
		this.vtxLayer.clearLayers();
		if (!this.tracing || !this.traceShapeKey) return;
		const pts = this.shapes[this.traceShapeKey] || [];

		for (let i = 0; i < pts.length - 1; i++) {
			const mid = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
			const insertIdx = i + 1;
			const mMid = L.marker(mid, {
				draggable: true,
				zIndexOffset: 550,
				icon: L.divIcon({
					className: '',
					html: `<div style="width:8px;height:8px;background:#ccc;border:1.5px solid #555;border-radius:50%;opacity:0.85"></div>`,
					iconSize: [8, 8],
					iconAnchor: [4, 4]
				})
			});
			mMid.on('click', (e) => {
				e.originalEvent.stopPropagation();
				this.shapes[this.traceShapeKey].splice(insertIdx, 0, [mid[0], mid[1]]);
				this._saveShapes();
				this._redrawLine(this.traceKey);
				this._renderVtx();
				this._refreshTraceRoutes();
			});
			let midInserted = false;
			mMid.on('dragstart', () => (midInserted = false));
			mMid.on('drag', (e) => {
				const p = e.target.getLatLng();
				if (!midInserted) {
					this.shapes[this.traceShapeKey].splice(insertIdx, 0, [p.lat, p.lng]);
					midInserted = true;
				} else this.shapes[this.traceShapeKey][insertIdx] = [p.lat, p.lng];
				this._redrawLine(this.traceKey);
			});
			mMid.on('dragend', () => {
				this._saveShapes();
				this._renderVtx();
				this._refreshTraceRoutes();
			});
			mMid.addTo(this.vtxLayer);
		}

		const activeI =
			this.traceActiveIdx >= 0 && this.traceActiveIdx < pts.length
				? this.traceActiveIdx
				: pts.length - 1;
		pts.forEach((p, i) => {
			const isActive = i === activeI;
			const m = L.marker(p, {
				draggable: true,
				zIndexOffset: 600,
				icon: L.divIcon({
					className: '',
					html: `<div style="width:${isActive ? 13 : 10}px;height:${isActive ? 13 : 10}px;background:${isActive ? '#ffe08a' : '#fff'};border:2px solid #222;border-radius:50%"></div>`,
					iconSize: isActive ? [13, 13] : [10, 10],
					iconAnchor: isActive ? [6, 6] : [5, 5]
				})
			});
			m.on('click', (e) => {
				e.originalEvent.stopPropagation();
				this.traceActiveIdx = i;
				this._renderVtx();
			});
			m.on('drag', (e) => {
				const pos = e.target.getLatLng();
				this.shapes[this.traceShapeKey][i] = [pos.lat, pos.lng];
				this._redrawLine(this.traceKey);
				const snap = this._findSnap(pos, i);
				if (snap) {
					if (!this.snapRing)
						this.snapRing = L.circleMarker(snap, {
							radius: 9,
							color: '#00cc44',
							weight: 2.5,
							fillOpacity: 0,
							interactive: false
						}).addTo(this.map);
					else this.snapRing.setLatLng(snap);
				} else if (this.snapRing) {
					this.map.removeLayer(this.snapRing);
					this.snapRing = null;
				}
			});
			m.on('dragend', () => {
				if (this.snapRing) {
					this.map.removeLayer(this.snapRing);
					this.snapRing = null;
				}
				const snap = this._findSnap(m.getLatLng(), i);
				if (snap) {
					this.shapes[this.traceShapeKey][i] = [snap[0], snap[1]];
					m.setLatLng(snap);
				}
				this._saveShapes();
				this._renderVtx();
				this._refreshTraceRoutes();
			});
			m.on('contextmenu', (e) => {
				e.originalEvent.stopPropagation();
				this.shapes[this.traceShapeKey].splice(i, 1);
				if (this.traceActiveIdx >= this.shapes[this.traceShapeKey].length)
					this.traceActiveIdx = this.shapes[this.traceShapeKey].length - 1;
				this._saveShapes();
				this._redrawLine(this.traceKey);
				this._renderVtx();
				this._refreshTraceRoutes();
			});
			m.addTo(this.vtxLayer);
		});
	}
	_findSnap(latlng, excludeIdx = -1) {
		const clickPx = this.map.latLngToContainerPoint(latlng);
		const pts = this.shapes[this.traceShapeKey] || [];
		let best = null,
			bestD = this.SNAP_PX;
		pts.forEach((p, j) => {
			if (j === excludeIdx) return;
			const px = this.map.latLngToContainerPoint(this.L.latLng(p[0], p[1]));
			const d = Math.hypot(clickPx.x - px.x, clickPx.y - px.y);
			if (d < bestD) {
				bestD = d;
				best = p;
			}
		});
		return best;
	}
	_onTraceClick(e) {
		if (!this.tracing) return;
		const snap = this._findSnap(e.latlng);
		const coord = snap ? snap : [e.latlng.lat, e.latlng.lng];
		const pts = (this.shapes[this.traceShapeKey] = this.shapes[this.traceShapeKey] || []);
		const activeI =
			this.traceActiveIdx >= 0 && this.traceActiveIdx < pts.length
				? this.traceActiveIdx
				: pts.length - 1;
		if (activeI < pts.length - 1) {
			const allKeys = this._getVariantKeys(this.traceKey);
			const newShapeKey = this.traceKey + ':' + allKeys.length;
			this.shapes[newShapeKey] = pts.slice(0, activeI + 1).map((p) => [...p]);
			this.shapes[newShapeKey].push(coord);
			this._ensureBranchPolyline(this.traceKey, newShapeKey);
			this.traceShapeKey = newShapeKey;
			this.traceVariantIdx = allKeys.length;
			this.traceActiveIdx = this.shapes[newShapeKey].length - 1;
		} else {
			pts.push(coord);
			this.traceActiveIdx = pts.length - 1;
		}
		this._saveShapes();
		this._redrawLine(this.traceKey);
		this._updateVarNav();
		this._renderVtx();
		this._refreshTraceRoutes();
	}
	setTraceRoute(key) {
		this.traceKey = key;
		this.traceShapeKey = key;
		this.traceVariantIdx = 0;
		this.traceActiveIdx = -1;
		if (this.tracing) this.setTracing(true);
		if (this.stopEditMode) this._buildStopEditMarkers();
	}
	setTracing(on) {
		this.tracing = on;
		this.traceShapeKey = this.traceKey;
		this.traceVariantIdx = 0;
		this.traceActiveIdx = -1;
		if (on) {
			this.setOverlayEdit(false);
			this.map.getContainer().style.cursor = 'crosshair';
		} else this.map.getContainer().style.cursor = '';
		this._updateVarNav();
		this._renderVtx();
		return on;
	}
	traceUndo() {
		if (!this.traceShapeKey) return;
		const pts = this.shapes[this.traceShapeKey];
		if (pts && pts.length) {
			pts.pop();
			this.traceActiveIdx = pts.length - 1;
			this._saveShapes();
			this._renderVtx();
			this._redrawLine(this.traceKey);
			this._refreshTraceRoutes();
		}
	}
	deleteCurrentVariant() {
		if (!this.tracing || !this.traceShapeKey || !this.shapes[this.traceShapeKey]) return;
		const isPrimary = this.traceShapeKey === this.traceKey;
		const allKeys = this._getVariantKeys(this.traceKey);
		const msg = isPrimary
			? `Obrisati primarni put za ${this.traceKey}?`
			: `Obrisati varijantu ${this.traceVariantIdx + 1}/${allKeys.length} za ${this.traceKey}?`;
		if (!confirm(msg)) return;
		if (isPrimary) {
			delete this.shapes[this.traceKey];
		} else {
			delete this.shapes[this.traceShapeKey];
			if (this.branchPolylines[this.traceShapeKey]) {
				if (this.groups[this.traceKey])
					this.groups[this.traceKey].removeLayer(this.branchPolylines[this.traceShapeKey]);
				delete this.branchPolylines[this.traceShapeKey];
			}
			const remaining = [];
			for (let j = 1; this.shapes[this.traceKey + ':' + j] !== undefined; j++) {
				remaining.push(this.shapes[this.traceKey + ':' + j]);
				const sk = this.traceKey + ':' + j;
				delete this.shapes[sk];
				if (this.branchPolylines[sk]) {
					if (this.groups[this.traceKey])
						this.groups[this.traceKey].removeLayer(this.branchPolylines[sk]);
					delete this.branchPolylines[sk];
				}
			}
			remaining.forEach((p, idx) => {
				const newKey = this.traceKey + ':' + (idx + 1);
				this.shapes[newKey] = p;
				this._ensureBranchPolyline(this.traceKey, newKey);
			});
		}
		this._saveShapes();
		this.traceShapeKey = this.traceKey;
		this.traceVariantIdx = 0;
		this.traceActiveIdx = -1;
		this._redrawLine(this.traceKey);
		this._updateVarNav();
		this._renderVtx();
		this._refreshTraceRoutes();
	}
	variantStep(delta) {
		if (!this.traceKey) return;
		const keys = this._getVariantKeys(this.traceKey);
		this.traceVariantIdx = (this.traceVariantIdx + delta + keys.length) % keys.length;
		this.traceShapeKey = keys[this.traceVariantIdx];
		this.traceActiveIdx = -1;
		this._updateVarNav();
		this._renderVtx();
	}
	copyTrace(srcKey, dstKey) {
		if (srcKey === dstKey) {
			alert('Izvorišna i odredišna linija su iste.');
			return;
		}
		if (!this.shapes[srcKey] || this.shapes[srcKey].length < 2) {
			alert('Izvorišna linija nema nacrtan put.');
			return;
		}
		if (
			!confirm(`Kopirati put iz "${srcKey}" u "${dstKey}"?\n(Postojeći put odredišne linije bit će zamijenjen.)`)
		)
			return;
		this.shapes[dstKey] = this.shapes[srcKey].map((p) => [...p]);
		this._saveShapes();
		this._redrawLine(dstKey);
		this._refreshTraceRoutes();
	}
	exportShapes() {
		const rows = ['shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence'];
		const made = [];
		Object.keys(this.shapes)
			.sort()
			.forEach((key) => {
				const pts = this.shapes[key];
				if (!pts || pts.length < 2) return;
				const colonIdx = key.lastIndexOf(':');
				const baseKey = colonIdx > 0 ? key.slice(0, colonIdx) : key;
				const varSuffix = colonIdx > 0 ? '_B' + key.slice(colonIdx + 1) : '';
				const pipeIdx = baseKey.lastIndexOf('|');
				const rid = baseKey.slice(0, pipeIdx);
				const did = baseKey.slice(pipeIdx + 1);
				const sid = `SHP_${rid}_${did}${varSuffix}`;
				made.push(`${sid} (${pts.length})`);
				pts.forEach((p, i) => rows.push(`${sid},${p[0].toFixed(6)},${p[1].toFixed(6)},${i + 1}`));
			});
		if (!made.length) {
			alert('Nema nacrtanih ruta za izvoz.');
			return;
		}
		this._downloadCsv('shapes.txt', rows);
		alert('Izvezeno shapes.txt:\n\n' + made.join('\n') + '\n\nSpremi u gtfs/ pa pokreni build_map.py.');
	}
	_downloadCsv(name, rows) {
		const blob = new Blob([rows.join('\n') + '\n'], { type: 'text/csv' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = name;
		a.click();
		URL.revokeObjectURL(a.href);
	}

	// ---- Draggable stop editor → stops.txt export ---------------------------
	_initStopEdit() {
		this.stopEditLayer = this.L.layerGroup();
		this.stopEditMode = false;
	}
	_submitRecommendation(payload, btn) {
		const orig = btn ? btn.textContent : null;
		if (btn) {
			btn.disabled = true;
			btn.textContent = 'Šaljem…';
		}
		const done = () => {
			if (btn) {
				btn.disabled = false;
				btn.textContent = orig;
			}
		};
		fetch('/api/recommend', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ...payload, client_ts: Date.now() })
		})
			.then((r) => r.json().then((j) => ({ ok: r.ok, j })))
			.then(({ ok, j }) => {
				done();
				if (ok && j.ok) {
					alert('Hvala! Prijedlog je zabilježen za pregled.');
					this.map.closePopup();
				} else
					alert(
						'Slanje nije uspjelo: ' +
							((j && j.error) || 'greška') +
							(j && j.error === 'rate' ? ' — previše prijedloga, pokušaj kasnije.' : '')
					);
			})
			.catch(() => {
				done();
				alert('Slanje nije uspjelo (mreža). Lokalna izmjena je sačuvana.');
			});
	}
	_addStopEditMarker(lat, lon, label, sublabel, onDragEnd, onSetCoord, onDuplicate, onDelete, color, recType, origLat, origLon) {
		const L = this.L,
			map = this.map;
		const m = L.marker([lat, lon], {
			draggable: true,
			zIndexOffset: 500,
			icon: L.divIcon({
				className: '',
				html: `<div style="width:14px;height:14px;background:${color};border:2px solid #fff;border-radius:50%;box-shadow:0 0 4px rgba(0,0,0,.6)"></div>`,
				iconSize: [14, 14],
				iconAnchor: [7, 7]
			})
		});
		m.bindTooltip(`<b>${label}</b>${sublabel ? ' · ' + sublabel : ''}`, { sticky: true });
		m.on('dragend', (e) => onDragEnd(e.target.getLatLng()));
		m.on('click', () => {
			const uid = 'se' + Math.round(performance.now());
			const curLat = m.getLatLng().lat.toFixed(6),
				curLon = m.getLatLng().lng.toFixed(6);
			L.popup({ minWidth: 215 })
				.setLatLng(m.getLatLng())
				.setContent(
					`<b>${label}</b><br><small style="color:#666">${sublabel || ''}</small><br>` +
						`<input id="${uid}" type="text" value="${curLat}, ${curLon}" style="width:100%;font-size:12px;margin-top:5px;box-sizing:border-box" placeholder="lat, lon">` +
						`<button id="${uid}gps" style="width:100%;font-size:12px;margin-top:5px;padding:5px;background:#1a73e8;color:#fff;border:none;border-radius:4px;cursor:pointer">📍 Postavi na GPS lokaciju</button>` +
						`<div style="display:flex;gap:4px;margin-top:4px">` +
						`<button id="${uid}set" style="flex:1;font-size:12px">Postavi</button>` +
						(onDuplicate ? `<button id="${uid}dup" style="flex:1;font-size:12px">Dupliciraj</button>` : '') +
						(onDelete ? `<button id="${uid}del" style="flex:1;font-size:12px;color:#c00">Obriši</button>` : '') +
						`</div>` +
						`<button id="${uid}rec" style="width:100%;font-size:12px;margin-top:5px;padding:5px;background:#198754;color:#fff;border:none;border-radius:4px;cursor:pointer">✉ Pošalji prijedlog</button>`
				)
				.openOn(map);
			setTimeout(() => {
				const inp = document.getElementById(uid);
				if (inp) inp.select();
				const setBtn = document.getElementById(uid + 'set');
				if (setBtn)
					setBtn.onclick = () => {
						const parts = (inp.value || '')
							.trim()
							.split(/[\s,]+/)
							.map(Number)
							.filter((x) => !isNaN(x));
						if (parts.length < 2 || Math.abs(parts[0]) > 90 || Math.abs(parts[1]) > 180) {
							alert('Format: lat, lon — npr. 45.162522, 18.009741');
							return;
						}
						onSetCoord(parts[0], parts[1]);
						m.setLatLng([parts[0], parts[1]]);
						map.closePopup();
					};
				const gpsBtn = document.getElementById(uid + 'gps');
				if (gpsBtn)
					gpsBtn.onclick = () => {
						this._withGpsFix((la, lo, acc) => {
							if (acc > 30 && !confirm(`GPS točnost je samo ±${Math.round(acc)} m. Svejedno postaviti?`)) return;
							inp.value = `${la.toFixed(6)}, ${lo.toFixed(6)}`;
							onSetCoord(la, lo);
							m.setLatLng([la, lo]);
							map.closePopup();
						}, gpsBtn);
					};
				const dupBtn = document.getElementById(uid + 'dup');
				if (dupBtn && onDuplicate)
					dupBtn.onclick = () => {
						map.closePopup();
						onDuplicate();
					};
				const delBtn = document.getElementById(uid + 'del');
				if (delBtn && onDelete)
					delBtn.onclick = () => {
						map.closePopup();
						onDelete();
					};
				const recBtn = document.getElementById(uid + 'rec');
				if (recBtn)
					recBtn.onclick = () => {
						const ll = m.getLatLng();
						this._submitRecommendation(
							{
								type: recType || 'move',
								stop_id: sublabel,
								name: label,
								old: recType === 'move' && origLat != null ? { lat: origLat, lon: origLon } : null,
								new: { lat: +ll.lat.toFixed(6), lon: +ll.lng.toFixed(6) },
								line: this.traceKey
							},
							recBtn
						);
					};
			}, 0);
		});
		m.addTo(this.stopEditLayer);
		return m;
	}
	_buildStopEditMarkers() {
		this.stopEditLayer.clearLayers();
		const selLine = this.D.lines.find((l) => l.route_id + '|' + l.direction_id === this.traceKey);
		const relevantIds = selLine ? new Set(selLine.stop_ids) : new Set();

		this.D.stops.forEach((s) => {
			if (!relevantIds.has(s.id)) return;
			const ov = this.stopOverrides[s.id];
			const lat = ov ? ov.lat : s.lat,
				lon = ov ? ov.lon : s.lon;
			this._addStopEditMarker(
				lat,
				lon,
				s.name,
				s.id,
				(p) => {
					this.stopOverrides[s.id] = { lat: p.lat, lon: p.lng };
					this._saveStopOverrides();
					(this.stopLineMarkers[s.id] || []).forEach((lm) => lm.setLatLng(p));
				},
				(newLat, newLon) => {
					this.stopOverrides[s.id] = { lat: newLat, lon: newLon };
					this._saveStopOverrides();
					(this.stopLineMarkers[s.id] || []).forEach((lm) => lm.setLatLng([newLat, newLon]));
				},
				() => {
					const baseLat = this.stopOverrides[s.id] ? this.stopOverrides[s.id].lat : s.lat;
					const baseLon = this.stopOverrides[s.id] ? this.stopOverrides[s.id].lon : s.lon;
					const newId = prompt('ID novog stajališta:', s.id + '_KOP');
					if (!newId) return;
					if (this.D.stops.find((x) => x.id === newId) || this.newStops.find((x) => x.stop_id === newId)) {
						alert('Stajalište s tim ID-jem već postoji.');
						return;
					}
					this.newStops.push({
						stop_id: newId,
						stop_name: s.name,
						stop_lat: baseLat + 0.0001,
						stop_lon: baseLon,
						stop_desc: s.desc || ''
					});
					this._saveNewStops();
					this._buildStopEditMarkers();
				},
				null,
				'#ff6600',
				'move',
				s.lat,
				s.lon
			);
		});

		this.newStops.forEach((ns, idx) => {
			this._addStopEditMarker(
				ns.stop_lat,
				ns.stop_lon,
				ns.stop_name,
				ns.stop_id,
				(p) => {
					this.newStops[idx].stop_lat = p.lat;
					this.newStops[idx].stop_lon = p.lng;
					this._saveNewStops();
				},
				(newLat, newLon) => {
					this.newStops[idx].stop_lat = newLat;
					this.newStops[idx].stop_lon = newLon;
					this._saveNewStops();
				},
				null,
				() => {
					if (confirm(`Obrisati novo stajalište "${ns.stop_name}" (${ns.stop_id})?`)) {
						this.newStops.splice(idx, 1);
						this._saveNewStops();
						this._buildStopEditMarkers();
					}
				},
				'#9933ff',
				'new',
				null,
				null
			);
		});
	}
	setStopEdit(on) {
		this.stopEditMode = on;
		if (on) {
			this.setOverlayEdit(false);
			this._buildStopEditMarkers();
			this.stopEditLayer.addTo(this.map);
		} else this.map.removeLayer(this.stopEditLayer);
		return on;
	}
	exportStops() {
		const rows = ['stop_id,stop_name,stop_lat,stop_lon,stop_desc'];
		this.D.stops.forEach((s) => {
			const ov = this.stopOverrides[s.id];
			const lat = ov ? ov.lat : s.lat,
				lon = ov ? ov.lon : s.lon;
			rows.push(
				`${s.id},${s.name.replace(/,/g, ';')},${lat.toFixed(6)},${lon.toFixed(6)},${(s.desc || '').replace(/,/g, ';')}`
			);
		});
		this.newStops.forEach((ns) => {
			rows.push(
				`${ns.stop_id},${ns.stop_name.replace(/,/g, ';')},${ns.stop_lat.toFixed(6)},${ns.stop_lon.toFixed(6)},${(ns.stop_desc || '').replace(/,/g, ';')}`
			);
		});
		this._downloadCsv('stops.txt', rows);
		alert(
			`Izvezeno stops.txt (${Object.keys(this.stopOverrides).length} premješteno, ${this.newStops.length} novo).\n\nSpremi u gtfs/ pa pokreni build_map.py.`
		);
	}
	resetStops() {
		const n = Object.keys(this.stopOverrides).length;
		if (n === 0) {
			alert('Nema premještenih stajališta.');
			return;
		}
		if (!confirm(`Resetirati sva premještena stajališta (${n})?`)) return;
		this.stopOverrides = {};
		this._saveStopOverrides();
		this.D.stops.forEach((s) => {
			(this.stopLineMarkers[s.id] || []).forEach((lm) => lm.setLatLng([s.lat, s.lon]));
		});
		if (this.stopEditMode) this._buildStopEditMarkers();
	}

	// ---- Modes --------------------------------------------------------------
	applyMode(m) {
		this.appMode = m;
		if (m === 'prod') {
			if (this.tracing) this.setTracing(false);
			if (this.ovEdit) this.setOverlayEdit(false);
			if (this.stopEditMode) this.setStopEdit(false);
			this.setOverlayVisible(false);
			this.ensureSchedule();
		} else {
			this.clearHighlight();
			this.setPinMode(null);
			this.setOverlayVisible(this._ovOn);
			this.closeBoard();
		}
		this._updateProdStops();
	}

	// ---- Lazy-load schedule.json the first time Production opens ------------
	async ensureSchedule() {
		if (this._schedState === 'ready' || this._schedState === 'loading') return;
		this._schedState = 'loading';
		scheduleState.set('loading');
		try {
			const mod = await import('../data/schedule.json');
			this.SCH = mod.default;
			this.planner = createPlanner(this.D, this.SCH);
			this.geom = createGeometry(this.D, this.planner.tripById);
			this._schedState = 'ready';
			scheduleState.set('ready');
		} catch {
			this._schedState = 'error';
			scheduleState.set('error');
		}
	}
	feedWindow() {
		return this.planner ? this.planner.feedWindow() : { min: null, max: null };
	}
	get scheduleReady() {
		return this._schedState === 'ready';
	}

	// ---- Planner endpoints (A/B) --------------------------------------------
	_initPlanner() {
		const L = this.L;
		this.ENDP = {
			from: { pt: null, label: '', marker: null },
			to: { pt: null, label: '', marker: null }
		};
		this._pinMode = null;
		this.plLayer = L.layerGroup().addTo(this.map);
		this._hlGen = 0;
		this.map.on('click', (e) => {
			if (!this._pinMode) return;
			this.setEndpoint(this._pinMode, { lat: e.latlng.lat, lon: e.latlng.lng }, null);
			this.setPinMode(null);
		});
	}
	_pinIcon(color, letter) {
		return this.L.divIcon({
			className: '',
			html:
				`<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.5)">` +
				`<span style="transform:rotate(45deg);display:block;text-align:center;line-height:19px;color:#fff;font-weight:700;font-size:11px">${letter}</span></div>`,
			iconSize: [22, 22],
			iconAnchor: [11, 22]
		});
	}
	_nearestInfo(pt) {
		if (!this.planner) return '';
		const near = this.planner.stopsNear(pt)[0];
		return near
			? `najbliža: ${this.stopName(near[0])} · ${Math.round(near[1] * 1.3)} m (${Math.max(1, Math.round(near[1] / 60))} min hoda)`
			: 'nema stanice u blizini';
	}
	_publishEndpoints() {
		endpoints.set({
			from: {
				pt: this.ENDP.from.pt,
				label: this.ENDP.from.label,
				info: this.ENDP.from.pt ? this._nearestInfo(this.ENDP.from.pt) : ''
			},
			to: {
				pt: this.ENDP.to.pt,
				label: this.ENDP.to.label,
				info: this.ENDP.to.pt ? this._nearestInfo(this.ENDP.to.pt) : ''
			}
		});
	}
	setEndpoint(which, pt, label, pan = false) {
		const L = this.L,
			e = this.ENDP[which];
		e.pt = pt;
		e.label = label || `${pt.lat.toFixed(5)}, ${pt.lon.toFixed(5)}`;
		const color = which === 'from' ? '#198754' : '#c0392b';
		if (!e.marker) {
			e.marker = L.marker([pt.lat, pt.lon], {
				draggable: true,
				zIndexOffset: 1500,
				icon: this._pinIcon(color, which === 'from' ? 'A' : 'B')
			}).addTo(this.map);
			e.marker.on('dragend', () => {
				const ll = e.marker.getLatLng();
				this.setEndpoint(which, { lat: ll.lat, lon: ll.lng }, null);
			});
		} else e.marker.setLatLng([pt.lat, pt.lon]);
		if (pan) this.map.setView([pt.lat, pt.lon], 15);
		this._publishEndpoints();
	}
	clearEndpoint(which) {
		const e = this.ENDP[which];
		if (e.marker) {
			this.map.removeLayer(e.marker);
			e.marker = null;
		}
		e.pt = null;
		e.label = '';
		this._publishEndpoints();
	}
	swapEndpoints() {
		const f = { pt: this.ENDP.from.pt, label: this.ENDP.from.label },
			t = { pt: this.ENDP.to.pt, label: this.ENDP.to.label };
		this.clearEndpoint('from');
		this.clearEndpoint('to');
		if (t.pt) this.setEndpoint('from', t.pt, t.label);
		if (f.pt) this.setEndpoint('to', f.pt, f.label);
	}
	setPinMode(which) {
		this._pinMode = this._pinMode === which ? null : which;
		this.map.getContainer().style.cursor = this._pinMode ? 'crosshair' : '';
		pinMode.set(this._pinMode);
	}
	endpointGps(which) {
		if (!navigator.geolocation) {
			alert('Uređaj/preglednik ne podržava geolokaciju.');
			return;
		}
		navigator.geolocation.getCurrentPosition(
			(pos) => this.setEndpoint(which, { lat: pos.coords.latitude, lon: pos.coords.longitude }, 'Moja lokacija', true),
			(err) => alert('GPS nedostupan: ' + err.message),
			{ enableHighAccuracy: true, timeout: 15000 }
		);
	}

	// ---- Trip plan + highlight ----------------------------------------------
	plan(timeMode, sec, ymd, n = 3) {
		if (!this.planner || !this.ENDP.from.pt || !this.ENDP.to.pt) return [];
		return timeMode === 'arrive'
			? this.planner.planTopArrive(this.ENDP.from.pt, this.ENDP.to.pt, sec, ymd, n)
			: this.planner.planTopPoints(this.ENDP.from.pt, this.ENDP.to.pt, sec, ymd, n);
	}
	clearHighlight() {
		this.plLayer.clearLayers();
	}
	_fitOpts() {
		const sbW =
			this.appMode === 'prod' && window.innerWidth > 640
				? (parseInt(
						getComputedStyle(document.documentElement).getPropertyValue('--gm-w')
					) || 392) + 24
				: 50;
		return { paddingTopLeft: [sbW, 60], paddingBottomRight: [60, 60], maxZoom: 16 };
	}
	highlightItin(it) {
		const L = this.L;
		this.clearHighlight();
		const gen = ++this._hlGen;
		const bounds = [];
		this.planner.displayLegs(it).forEach((l) => {
			if (l.kind === 'ride') {
				const seg = this.geom.rideRoadSeg(l);
				if (!seg || seg.length < 2) return;
				const m = this.routeMeta(l.rid);
				const casing = L.polyline(seg, { color: '#fff', weight: 11, opacity: 0.6 }).addTo(this.plLayer);
				const core = L.polyline(seg, { color: m.color, weight: 6, opacity: 0.95 }).addTo(this.plLayer);
				[this.stopById[l.from], this.stopById[l.to]].forEach((s) => {
					if (s)
						L.circleMarker([s.lat, s.lon], {
							radius: 5,
							color: m.color,
							fillColor: '#fff',
							fillOpacity: 1,
							weight: 3
						}).addTo(this.plLayer);
				});
				seg.forEach((p) => bounds.push(p));
				this.geom.fillRideSeg(l).then((filled) => {
					if (gen === this._hlGen && filled) {
						casing.setLatLngs(filled);
						core.setLatLngs(filled);
					}
				});
			} else {
				let a = null,
					b = null;
				if (l.origin) {
					if (this.ENDP.from.pt) a = [this.ENDP.from.pt.lat, this.ENDP.from.pt.lon];
					const s = this.stopById[l.to];
					if (s) b = [s.lat, s.lon];
				} else if (l.dest) {
					const s = this.stopById[l.from];
					if (s) a = [s.lat, s.lon];
					if (this.ENDP.to.pt) b = [this.ENDP.to.pt.lat, this.ENDP.to.pt.lon];
				} else {
					const fa = this.stopById[l.from],
						fb = this.stopById[l.to];
					if (fa) a = [fa.lat, fa.lon];
					if (fb) b = [fb.lat, fb.lon];
				}
				if (a && b) {
					const wl = L.polyline([a, b], {
						color: '#5f6368',
						weight: 4,
						opacity: 0.9,
						dashArray: '1,8',
						lineCap: 'round'
					}).addTo(this.plLayer);
					bounds.push(a, b);
					walkRoute(a, b).then((geom) => {
						if (gen === this._hlGen && geom && geom.length >= 2) wl.setLatLngs(geom);
					});
				}
			}
		});
		if (this.ENDP.from.pt) bounds.push([this.ENDP.from.pt.lat, this.ENDP.from.pt.lon]);
		if (this.ENDP.to.pt) bounds.push([this.ENDP.to.pt.lat, this.ENDP.to.pt.lon]);
		if (bounds.length) this.map.fitBounds(bounds, this._fitOpts());
	}
	panToLeg(l) {
		let pts = l.kind === 'ride' ? this.geom.rideRoadSeg(l) : null;
		if (!pts) {
			const a = this.stopById[l.from],
				b = this.stopById[l.to];
			if (a && b)
				pts = [
					[a.lat, a.lon],
					[b.lat, b.lon]
				];
		}
		if (pts && pts.length >= 2) this.map.fitBounds(pts, this._fitOpts());
	}

	// ---- Production tappable stops + departure board ------------------------
	_initProdStops() {
		this.prodStops = this.L.layerGroup();
		this.prodStopsBuilt = false;
		this.prodStopsOn = false;
		this.map.on('zoomend', () => this._updateProdStops());
	}
	_buildProdStops() {
		if (this.prodStopsBuilt) return;
		this.prodStopsBuilt = true;
		const L = this.L;
		this.D.stops.forEach((s) => {
			const m = L.circleMarker([s.lat, s.lon], {
				radius: 5,
				color: '#1a73e8',
				weight: 2,
				fillColor: '#fff',
				fillOpacity: 1
			});
			m.bindTooltip(s.name, { direction: 'top' });
			m.on('click', () => this.openBoard(s.id));
			this.prodStops.addLayer(m);
		});
	}
	_updateProdStops() {
		const want = this.appMode === 'prod' && this.map.getZoom() >= 14;
		if (want && !this.prodStopsOn) {
			this._buildProdStops();
			this.prodStops.addTo(this.map);
			this.prodStopsOn = true;
		} else if (!want && this.prodStopsOn) {
			this.map.removeLayer(this.prodStops);
			this.prodStopsOn = false;
		}
	}
	closeBoard() {
		board.set(null);
	}
	openBoard(stopId, planDateYmd) {
		if (!this.scheduleReady) {
			board.set({ name: '', rows: [], loading: true });
			this.ensureSchedule().then(() => this.openBoard(stopId, planDateYmd));
			return;
		}
		const now = new Date();
		const pad = (n) => String(n).padStart(2, '0');
		const todayYmd = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
		const ymd = planDateYmd || todayYmd;
		const fromSec = ymd === todayYmd ? now.getHours() * 3600 + now.getMinutes() * 60 : 0;
		const data = this.planner.departureBoard(stopId, ymd, fromSec);
		board.set({
			name: data.name,
			wholeDay: data.wholeDay,
			rows: data.rows.map((d) => ({
				time: fmtT(d.dep),
				color: this.routeMeta(d.rid).color,
				shortName: this.routeMeta(d.rid).short_name,
				headsign: d.headsign || ''
			}))
		});
		const s = this.stopById[stopId];
		if (s) this.map.panTo([s.lat, s.lon]);
	}

	revealModes() {
		modesRevealed.set(true);
	}

	destroy() {
		this._destroyers.forEach((fn) => fn());
		if (this.map) this.map.remove();
	}
}

    const D = window.GTFS_DATA;

    // ---- Mobile: bottom-sheet panel + collapsible sections -------------------
    // On phones the panel hides behind a floating "☰ Linije" button and slides
    // up as a bottom sheet; the editing sections start collapsed. On wider
    // screens the panel is always visible with every section expanded (as before).
    const _panel = document.getElementById("panel");
    const _panelToggle = document.getElementById("panel-toggle");
    const _panelClose = document.getElementById("panel-close");
    const _mqMobile = window.matchMedia("(max-width: 640px)");
    // Closed-state label is mode-aware: in Production the button is the planner
    // entry point, so it reads like a search prompt rather than a generic menu.
    const sheetLabel = () => document.body.classList.contains("mode-prod") ? "🔍 Planiraj put" : "☰ Izbornik";
    function openSheet(on) {
      _panel.classList.toggle("open", on);
      _panelToggle.textContent = on ? "✕ Zatvori" : sheetLabel();
    }
    function refreshSheetLabel() {
      if (!_panel.classList.contains("open")) _panelToggle.textContent = sheetLabel();
    }
    _panelToggle.addEventListener("click", () => openSheet(!_panel.classList.contains("open")));
    _panelClose.addEventListener("click", () => openSheet(false));
    // Re-sync section open-state only when crossing the breakpoint, so a user's
    // manual expand/collapse isn't clobbered on every resize/scroll.
    let _lastMobile = null;
    function syncMode() {
      const m = _mqMobile.matches;
      if (m === _lastMobile) return;
      _lastMobile = m;
      document.querySelectorAll("#panel details.sec").forEach((d) => { d.open = d.hasAttribute("data-keep-open") ? true : !m; });
      if (!m) openSheet(false); // desktop: panel always shown, drop sheet state
      else refreshSheetLabel();
    }
    syncMode();
    _mqMobile.addEventListener("change", () => { syncMode(); syncMSheet(); });

    // ---- Mobile Production bottom sheet: detents (peek/half/full) + drag + tabs.
    // Active only on phones in Production; otherwise the sheet classes are cleared
    // so the desktop sidebar / dev slide-up panel behave as before.
    const _mHandle = document.getElementById("m-handle");
    const _mTabs = document.getElementById("m-tabs");
    let _detent = "peek";
    const mSheetActive = () => _mqMobile.matches && document.body.classList.contains("mode-prod");
    function setMTab(name) {
      document.body.classList.remove("mtab-planer", "mtab-voznired", "mtab-linije");
      document.body.classList.add("mtab-" + name);
      if (_mTabs) [..._mTabs.children].forEach((btn) => {
        const on = btn.dataset.mtab === name;
        btn.classList.toggle("active", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
      });
      const tt = document.getElementById("tt-sec"), ls = document.getElementById("lines-sec");
      if (tt) tt.open = true; if (ls) ls.open = true;   // details act as tab panels here
    }
    const PEEK_VISIBLE = 132;
    // translateY (px) for each detent. "full" stops just below the floating
    // search card (so the sheet never slides under it); "peek" shows ~132px.
    function detentY(d) {
      const vh = window.innerHeight;
      const Hs = _panel.getBoundingClientRect().height || vh * 0.92;
      const base = vh - Hs;                        // sheet top when translateY = 0
      const cardBottom = (_mTopbar && _mTopbar.getBoundingClientRect().height)
        ? _mTopbar.getBoundingClientRect().bottom + 8 : 250;
      const top = { full: cardBottom, half: vh * 0.5, peek: vh - PEEK_VISIBLE }[d];
      return Math.max(0, Math.round(top - base));
    }
    function setDetent(d) {
      _detent = d;
      _panel.classList.remove("sheet-peek", "sheet-half", "sheet-full");
      _panel.classList.add("sheet-" + d);
      _panel.style.transform = `translateY(${detentY(d)}px)`;
    }
    function sheetReveal() { if (mSheetActive() && _detent === "peek") setDetent("half"); }
    // The search card lives at the top of the desktop sidebar but, on mobile,
    // must sit in #m-topbar (outside the transformed sheet) so it floats fixed at
    // the top of the screen. Move the same node between the two homes.
    const _mTopbar = document.getElementById("m-topbar");
    function placeSearch() {
      const card = document.querySelector(".gm-card"), prod = document.getElementById("prod-tools");
      if (!card || !prod || !_mTopbar) return;
      if (mSheetActive()) { if (card.parentNode !== _mTopbar) _mTopbar.appendChild(card); }
      else if (card.parentNode !== prod) prod.insertBefore(card, prod.firstChild);
    }
    function syncMSheet() {
      placeSearch();
      if (mSheetActive()) {
        if (!/sheet-(peek|half|full)/.test(_panel.className)) setDetent("peek");
        const cur = [...document.body.classList].find((c) => c.indexOf("mtab-") === 0);
        setMTab(cur ? cur.slice(5) : "planer");   // (re)apply tab; also re-opens the <details> panels
      } else {
        _panel.classList.remove("sheet-peek", "sheet-half", "sheet-full", "dragging");
        _panel.style.transform = "";
      }
    }
    if (_mTabs) _mTabs.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-mtab]");
      if (btn) { setMTab(btn.dataset.mtab); if (_detent === "peek") setDetent("half"); }
    });
    if (_mHandle) {
      let dragging = false, startY = 0, startTY = 0, lastY = 0;
      const px = () => ({ full: detentY("full"), half: detentY("half"), peek: detentY("peek") });
      const down = (e) => {
        if (!mSheetActive()) return;
        dragging = true; startY = lastY = e.clientY; startTY = detentY(_detent);
        _panel.classList.add("dragging");
        try { _mHandle.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      };
      const move = (e) => {
        if (!dragging) return;
        lastY = e.clientY;
        const p = px();
        _panel.style.transform = `translateY(${Math.min(p.peek, Math.max(p.full, startTY + (lastY - startY)))}px)`;
        if (e.cancelable) e.preventDefault();
      };
      const up = () => {
        if (!dragging) return;
        dragging = false; _panel.classList.remove("dragging");
        if (Math.abs(lastY - startY) < 8) {                 // tap → cycle open
          setDetent(_detent === "peek" ? "half" : _detent === "half" ? "full" : "peek");
        } else {
          const p = px(), ty = startTY + (lastY - startY);
          setDetent([["full", p.full], ["half", p.half], ["peek", p.peek]]
            .sort((a, b) => Math.abs(a[1] - ty) - Math.abs(b[1] - ty))[0][0]);
        }
      };
      _mHandle.addEventListener("pointerdown", down);
      _mHandle.addEventListener("pointermove", move);
      _mHandle.addEventListener("pointerup", up);
    }
    window.addEventListener("resize", () => { if (mSheetActive()) setDetent(_detent); });

    const street = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    });
    // Esri World Imagery is free and needs no API key. Note the {z}/{y}/{x} order.
    const esriImagery = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics" }
    );
    const esriLabels = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19 }
    );
    const satellite = L.layerGroup([esriImagery]);
    const satelliteLabels = L.layerGroup([esriImagery, esriLabels]);

    const map = L.map("map", { layers: [street] });
    L.control.layers(
      { "Karta (ulice)": street, "Satelit": satellite, "Satelit + nazivi": satelliteLabels },
      null,
      { position: "topleft" }
    ).addTo(map);

    // Left-click is reserved for object interaction (waypoints, stops, map clicks).
    // Middle-click drag pans the map.
    map.dragging.disable();
    {
      let _pan = false, _px = 0, _py = 0;
      const _el = map.getContainer();
      _el.addEventListener("mousedown", (e) => {
        if (e.button !== 1) return;
        e.preventDefault(); // suppress browser autoscroll on middle-click
        _pan = true; _px = e.clientX; _py = e.clientY;
      });
      document.addEventListener("mousemove", (e) => {
        if (!_pan) return;
        map.panBy([_px - e.clientX, _py - e.clientY], { animate: false });
        _px = e.clientX; _py = e.clientY;
      });
      document.addEventListener("mouseup", (e) => { if (e.button === 1) _pan = false; });
    }

    // Stops shared across lines: one marker per physical stop.
    const stopById = {};
    D.stops.forEach((s) => (stopById[s.id] = s));

    // Each route gets its own layer group (line + its stop markers) so it can be
    // toggled independently. Markers are de-duplicated per layer.
    // Stop position overrides (dragged by the user), keyed by stop_id.
    const STOP_OVERRIDE_KEY = "sb_stop_overrides";
    let stopOverrides = {};
    try { stopOverrides = JSON.parse(localStorage.getItem(STOP_OVERRIDE_KEY)) || {}; } catch (e) { stopOverrides = {}; }
    function saveStopOverrides() { localStorage.setItem(STOP_OVERRIDE_KEY, JSON.stringify(stopOverrides)); }

    // New stops created by duplicating existing ones.
    const NEW_STOPS_KEY = "sb_new_stops";
    let newStops = [];
    try { newStops = JSON.parse(localStorage.getItem(NEW_STOPS_KEY)) || []; } catch (e) { newStops = []; }
    function saveNewStops() { localStorage.setItem(NEW_STOPS_KEY, JSON.stringify(newStops)); }

    // All line markers per stop so they can be repositioned live when a stop is dragged.
    const stopLineMarkers = {}; // stop_id -> [L.marker, ...]

    const groups = {};       // key -> L.layerGroup
    const layerKeys = [];    // ordered for the panel
    const allLatLngs = [];
    const linePolylines = {}; // key -> L.polyline (so a traced shape can replace it)
    const origGeom = {};      // key -> OSRM geometry (to restore if a trace is cleared)

    D.lines.forEach((line) => {
      const meta = D.routes[line.route_id] || { color: "#666", short_name: line.route_id };
      const key = line.route_id + "|" + line.direction_id;
      const group = L.layerGroup();

      const pl = L.polyline(line.geometry, {
        color: meta.color, weight: 4, opacity: 0.85,
      }).bindTooltip(`${meta.short_name} — ${line.headsign || meta.long_name}`);
      pl.addTo(group);
      linePolylines[key] = pl;
      origGeom[key] = line.geometry;
      line.geometry.forEach((p) => allLatLngs.push(p));

      // Branch spurs (e.g. SHP_L3_0_B2) are separate segments off the main path;
      // draw each as its own polyline so the full route shows, not just the trunk.
      (line.branches || []).forEach((seg) => {
        if (!seg || seg.length < 2) return;
        L.polyline(seg, { color: meta.color, weight: 4, opacity: 0.85 })
          .bindTooltip(`${meta.short_name} — ${line.headsign || meta.long_name}`)
          .addTo(group);
        seg.forEach((p) => allLatLngs.push(p));
      });

      line.stop_ids.forEach((sid, i) => {
        const s = stopById[sid];
        if (!s) return;
        const ov = stopOverrides[sid];
        const lat = ov ? ov.lat : s.lat;
        const lon = ov ? ov.lon : s.lon;
        const marker = L.marker([lat, lon], {
          icon: L.divIcon({
            className: "",
            html: `<div class="stop-dot" style="width:11px;height:11px;border-color:${meta.color}"></div>`,
            iconSize: [11, 11], iconAnchor: [6, 6],
          }),
        });
        marker.bindPopup(
          `<b>${s.name}</b><br>${s.desc || ""}` +
          `<br><small>${meta.short_name} · stajalište ${i + 1}/${line.stop_ids.length}</small>` +
          `<br><small>${lat.toFixed(6)}, ${lon.toFixed(6)}</small>`
        );
        marker.addTo(group);
        stopLineMarkers[sid] = stopLineMarkers[sid] || [];
        stopLineMarkers[sid].push(marker);
      });

      groups[key] = group;
      layerKeys.push({ key, meta, line });
      // Lines start hidden — the map opens clean (a planned route still draws via
      // the planner's own highlight layer). Toggle them on in the panel / "Sve".
    });

    map.fitBounds(allLatLngs.length ? L.latLngBounds(allLatLngs) : [[45.16, 18.01], [45.16, 18.01]]);

    // Build the toggle panel.
    const linesDiv = document.getElementById("lines");
    layerKeys.forEach(({ key, meta, line }) => {
      const label = document.createElement("label");
      label.className = "line";
      const dirTxt = D.lines.filter((l) => l.route_id === line.route_id).length > 1
        ? ` (${line.headsign || "smjer " + line.direction_id})` : "";
      label.innerHTML =
        `<input type="checkbox" data-key="${key}">` +
        `<span class="swatch" style="background:${meta.color}"></span>` +
        `<span class="name"><b>${meta.short_name}</b>${dirTxt}` +
        `<small>${meta.long_name}</small></span>`;
      label.querySelector("input").addEventListener("change", (e) => {
        if (e.target.checked) groups[key].addTo(map);
        else map.removeLayer(groups[key]);
      });
      linesDiv.appendChild(label);
    });

    function setAll(on) {
      document.querySelectorAll("#lines input").forEach((cb) => {
        cb.checked = on;
        if (on) groups[cb.dataset.key].addTo(map);
        else map.removeLayer(groups[cb.dataset.key]);
      });
    }
    document.getElementById("all").onclick = () => setAll(true);
    document.getElementById("none").onclick = () => setAll(false);

    // ---- Geolocation: show my position, place stops in the field -------------
    // watchPosition tracks the device live (blue dot + accuracy circle); the
    // first fix recentres the map, later fixes don't, so you can pan while it
    // follows. The stop-editor popup reuses getCurrentPosition for a fresh,
    // high-accuracy one-shot read to stamp a stop's coordinates on site.
    // Browsers only expose geolocation over HTTPS (or localhost) — not file://.
    let geoWatchId = null, lastFix = null, meMarker = null, meCircle = null;
    const geoBtn = document.getElementById("geo-toggle");
    const geoStatus = document.getElementById("geo-status");

    function renderFix(center) {
      if (!lastFix) return;
      const ll = [lastFix.lat, lastFix.lon];
      if (!meMarker) {
        meMarker = L.marker(ll, {
          icon: L.divIcon({ className: "", html: '<div class="me-dot"></div>',
            iconSize: [16, 16], iconAnchor: [8, 8] }),
          zIndexOffset: 2000, interactive: false,
        }).addTo(map);
        meCircle = L.circle(ll, { radius: lastFix.accuracy, color: "#1a73e8",
          weight: 1, fillColor: "#1a73e8", fillOpacity: 0.12, interactive: false }).addTo(map);
      } else {
        meMarker.setLatLng(ll);
        meCircle.setLatLng(ll).setRadius(lastFix.accuracy);
      }
      if (center) map.setView(ll, Math.max(map.getZoom(), 17));
    }

    function startGeo() {
      if (!("geolocation" in navigator)) { alert("Uređaj/preglednik ne podržava geolokaciju."); return; }
      let first = true;
      geoStatus.textContent = "tražim…";
      geoWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          lastFix = { lat: pos.coords.latitude, lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy, ts: pos.timestamp };
          renderFix(first); first = false;
          geoStatus.textContent = `±${Math.round(lastFix.accuracy)} m`;
        },
        (err) => {
          stopGeo();   // drop back to idle so the button isn't stuck on "Zaustavi"
          geoStatus.textContent = err.code === 1
            ? "lokacija blokirana — dopusti u postavkama preglednika"
            : "GPS greška: " + err.message;
        },
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
      );
      geoBtn.textContent = "■ Zaustavi GPS";
      geoBtn.style.background = "#ffe08a";
    }

    function stopGeo() {
      if (geoWatchId !== null) navigator.geolocation.clearWatch(geoWatchId);
      geoWatchId = null;
      if (meMarker) { map.removeLayer(meMarker); meMarker = null; }
      if (meCircle) { map.removeLayer(meCircle); meCircle = null; }
      geoBtn.textContent = "📍 Moja lokacija";
      geoBtn.style.background = "";
      geoStatus.textContent = "";
    }

    geoBtn.addEventListener("click", () => (geoWatchId === null ? startGeo() : stopGeo()));

    // Fresh one-shot high-accuracy fix for stamping a stop's coordinates. Calls
    // onOk(lat, lon, accuracyMeters); shows a button-busy state on `btn`.
    function withGpsFix(onOk, btn) {
      if (!("geolocation" in navigator)) { alert("Uređaj/preglednik ne podržava geolokaciju."); return; }
      const orig = btn ? btn.textContent : null;
      if (btn) { btn.disabled = true; btn.textContent = "GPS…"; }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (btn) { btn.disabled = false; btn.textContent = orig; }
          onOk(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        },
        (err) => {
          if (btn) { btn.disabled = false; btn.textContent = orig; }
          alert("GPS nedostupan: " + err.message);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
      );
    }

    // ---- PDF overlay (georeferencing) ----------------------------------------
    // Self-built so it works without any plugin: a plain image overlay positioned
    // by a SW/NE bounding box (north-up, no rotation — the city map is north-up).
    // In edit mode we show draggable handle markers: a centre handle moves the
    // whole image, the four corner handles resize it. Markers handle their own
    // drags, so they never pan the map. Alignment persists in localStorage.
    const DEFAULT_BOUNDS = [[45.140012, 17.961231], [45.19508, 18.071693]]; // [SW, NE]
    const BOUNDS_KEY = "sb_overlay_bounds";

    function loadBounds() {
      try {
        const raw = JSON.parse(localStorage.getItem(BOUNDS_KEY));
        if (Array.isArray(raw) && raw.length === 2) return raw;
      } catch (e) { /* fall through to defaults */ }
      return DEFAULT_BOUNDS;
    }

    let north, south, east, west;
    function setBox(b) {
      south = Math.min(b[0][0], b[1][0]); north = Math.max(b[0][0], b[1][0]);
      west = Math.min(b[0][1], b[1][1]);  east = Math.max(b[0][1], b[1][1]);
    }

    // Keep the box at the image's true aspect ratio so it never looks stretched.
    // overlay.png is 2400×1697; resizing uses this to scale width & height together.
    let imgRatio = 2400 / 1697;
    // Web-Mercator stretches latitude by ~1/cos(lat), so the lon span that keeps
    // the image square-true is imgRatio / cos(lat) times the lat span.
    function aspectLon(latDeg) { return imgRatio / Math.cos(latDeg * Math.PI / 180); }
    function normalizeAspect() {
      const cxLng = (east + west) / 2, cyLat = (north + south) / 2;
      const wLon = (north - south) * aspectLon(cyLat);
      west = cxLng - wLon / 2; east = cxLng + wLon / 2;
    }

    setBox(loadBounds());
    normalizeAspect(); // start proportionate

    const overlay = L.imageOverlay("overlay.png",
      [[south, west], [north, east]], { opacity: 0.6, interactive: false }).addTo(map);
    // Once the real image loads, use its exact ratio (in case overlay.png changes).
    overlay.on("load", () => {
      const el = overlay.getElement();
      if (el && el.naturalWidth && el.naturalHeight) {
        imgRatio = el.naturalWidth / el.naturalHeight;
        normalizeAspect(); applyBox();
      }
    });

    function saveBounds() {
      localStorage.setItem(BOUNDS_KEY,
        JSON.stringify([[south, west], [north, east]]));
    }
    function applyBox(except) {
      overlay.setBounds([[south, west], [north, east]]);
      const pos = {
        nw: [north, west], ne: [north, east], sw: [south, west], se: [south, east],
        center: [(north + south) / 2, (east + west) / 2],
      };
      for (const k in handles) if (k !== except) handles[k].setLatLng(pos[k]);
    }

    // Build the (initially detached) handle markers.
    const handles = {};
    function mkHandle(key, cls, html) {
      const m = L.marker([0, 0], {
        draggable: true, zIndexOffset: 1000,
        icon: L.divIcon({ className: "", html: `<div class="${cls}">${html || ""}</div>`,
          iconSize: cls === "ov-center" ? [26, 26] : [16, 16] }),
      });
      // A corner resize anchors the opposite (fixed) corner; capture it on grab.
      m.on("dragstart", () => {
        if (key === "center") return;
        m._anchor = {
          lat: key[0] === "n" ? south : north,   // opposite corner's latitude
          lng: key[1] === "w" ? east : west,      // opposite corner's longitude
        };
      });
      m.on("drag", (e) => {
        const p = e.latlng;
        if (key === "center") {
          // Move the whole image; the centre handle follows the cursor exactly.
          const dLat = p.lat - (north + south) / 2, dLng = p.lng - (east + west) / 2;
          north += dLat; south += dLat; east += dLng; west += dLng;
        } else {
          // Proportional resize: scale both dimensions together so the image
          // keeps its aspect ratio. The corner tracks whichever axis you drag
          // more, snapping along the diagonal.
          const a = m._anchor;
          const phi = (a.lat + p.lat) / 2;
          const asp = aspectLon(phi);
          const hLat = Math.max(Math.abs(p.lat - a.lat),
                                Math.abs(p.lng - a.lng) / asp, 1e-5);
          const wLon = hLat * asp;
          const newLat = a.lat + (key[0] === "n" ? hLat : -hLat);
          const newLng = a.lng + (key[1] === "e" ? wLon : -wLon);
          north = Math.max(a.lat, newLat); south = Math.min(a.lat, newLat);
          east = Math.max(a.lng, newLng);  west = Math.min(a.lng, newLng);
        }
        applyBox(key);
      });
      // Re-snap the dragged handle to the true corner (proportional resize means
      // the cursor and the corner diverge) and persist.
      m.on("dragend", () => { applyBox(); saveBounds(); });
      handles[key] = m;
    }
    mkHandle("nw", "ov-corner"); mkHandle("ne", "ov-corner");
    mkHandle("sw", "ov-corner"); mkHandle("se", "ov-corner");
    mkHandle("center", "ov-center", "✥");

    let ovEdit = false;
    function showHandles(on) {
      if (on) { applyBox(); for (const k in handles) handles[k].addTo(map); }
      else { for (const k in handles) map.removeLayer(handles[k]); }
    }
    function ovVisible(on) {
      const el = overlay.getElement();
      if (el) el.style.display = on ? "" : "none";
      if (!on && ovEdit) setEdit(false); // hiding the overlay leaves edit mode
    }
    function setEdit(on) {
      ovEdit = on && ovOn.checked;
      showHandles(ovEdit);
      ovEditBtn.textContent = ovEdit ? "✓ Završi uređivanje" : "✎ Uredi podlogu";
      ovEditBtn.style.background = ovEdit ? "#ffe08a" : "";
      if (!ovEdit) saveBounds();
    }

    const ovOn = document.getElementById("ov-on");
    const ovOp = document.getElementById("ov-op");
    const ovEditBtn = document.getElementById("ov-edit");
    ovOn.addEventListener("change", (e) => ovVisible(e.target.checked));
    const ovOpVal = document.getElementById("ov-op-val");
    function setOverlayOpacity(v) {
      v = Math.max(0, Math.min(1, v));
      overlay.setOpacity(v);                       // Leaflet's image opacity
      const el = overlay.getElement();             // also set directly, in case the
      if (el) el.style.opacity = v;                // image element wasn't ready
      ovOp.value = v;
      ovOpVal.textContent = Math.round(v * 100) + "%";
    }
    ovOp.addEventListener("input", (e) => setOverlayOpacity(parseFloat(e.target.value)));
    // Keyboard 1–5 → opacity 20/40/60/80/100 %.
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "textarea" ||
          (tag === "input" && /^(text|number|search|email|url|password)$/.test(e.target.type)))
        return; // don't hijack typing in text fields
      const lvl = { "1": 0, "2": 0.25, "3": 0.5, "4": 0.75, "5": 1 }[e.key];
      if (lvl === undefined) return;
      setOverlayOpacity(lvl);
    });
    ovEditBtn.addEventListener("click", () => setEdit(!ovEdit));
    document.getElementById("ov-save").addEventListener("click", () => {
      saveBounds();
      alert("Položaj podloge spremljen.");
    });
    document.getElementById("ov-reset").addEventListener("click", () => {
      setBox(DEFAULT_BOUNDS); normalizeAspect(); applyBox(); saveBounds();
    });
    document.getElementById("ov-export").addEventListener("click", () => {
      const txt = JSON.stringify([[+south.toFixed(6), +west.toFixed(6)],
        [+north.toFixed(6), +east.toFixed(6)]]);
      console.log("overlay bounds [SW, NE]:", txt);
      if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(() => {});
      alert("Granice [SW, NE], kopirano u međuspremnik:\n\n" + txt);
    });

    // ---- Right-click: read off coordinates -----------------------------------
    function haversine(a, b, c, d) {
      const R = 6371000, r = Math.PI / 180;
      const dLat = (c - a) * r, dLon = (d - b) * r;
      const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLon / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(h));
    }
    map.on("contextmenu", (e) => {
      const { lat, lng } = e.latlng;
      let nearest = null, best = Infinity;
      D.stops.forEach((s) => {
        const d = haversine(lat, lng, s.lat, s.lon);
        if (d < best) { best = d; nearest = s; }
      });
      const coord = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      const near = nearest
        ? `<br><small>najbliže: <b>${nearest.name}</b> (${Math.round(best)} m)</small>` : "";
      const id = "cp" + Date.now();
      L.popup({ className: "coord-pop" })
        .setLatLng(e.latlng)
        .setContent(
          `<code>${coord}</code>${near}<br>` +
          `<button id="${id}">Kopiraj</button>`
        )
        .openOn(map);
      setTimeout(() => {
        const b = document.getElementById(id);
        if (b) b.onclick = () => {
          (navigator.clipboard
            ? navigator.clipboard.writeText(coord)
            : Promise.reject()
          ).then(() => (b.textContent = "Kopirano ✓"))
           .catch(() => (b.textContent = coord));
        };
      }, 0);
    });

    // ---- Route tracing → shapes.txt ------------------------------------------
    // Draw the real bus path by clicking along it over the PDF overlay. A traced
    // shape replaces the auto-routed (OSRM) line for that route+direction, and
    // can be exported as a GTFS shapes.txt. Traces persist in localStorage.
    const TRACE_KEY = "sb_shapes";
    let shapes = {};
    try { shapes = JSON.parse(localStorage.getItem(TRACE_KEY)) || {}; } catch (e) { shapes = {}; }
    function saveShapes() { localStorage.setItem(TRACE_KEY, JSON.stringify(shapes)); }

    // Each route can have multiple shape variants (branches).
    // Primary: shapes["L1|0"]; branches: shapes["L1|0:1"], shapes["L1|0:2"], …
    function getVariantKeys(routeKey) {
      const keys = [routeKey];
      for (let i = 1; shapes[routeKey + ":" + i] !== undefined; i++) keys.push(routeKey + ":" + i);
      return keys;
    }

    const branchPolylines = {}; // shapeKey -> L.polyline (variants 1+)
    function ensureBranchPolyline(routeKey, shapeKey) {
      if (branchPolylines[shapeKey]) return;
      const meta = D.routes[routeKey.split("|")[0]] || { color: "#666" };
      const pl = L.polyline([], { color: meta.color, weight: 3, opacity: 0.55, dashArray: "8,5" });
      if (groups[routeKey]) pl.addTo(groups[routeKey]);
      branchPolylines[shapeKey] = pl;
    }

    function redrawLine(routeKey) {
      const primaryPts = shapes[routeKey];
      if (linePolylines[routeKey])
        linePolylines[routeKey].setLatLngs(primaryPts && primaryPts.length >= 2 ? primaryPts : origGeom[routeKey]);
      const varKeys = getVariantKeys(routeKey);
      for (let i = 1; i < varKeys.length; i++) {
        const sk = varKeys[i];
        ensureBranchPolyline(routeKey, sk);
        branchPolylines[sk].setLatLngs((shapes[sk] || []).length >= 2 ? shapes[sk] : []);
      }
    }

    // Initialize: redraw every route that has stored shapes (primary or branch).
    { const rks = new Set(Object.keys(shapes).map(k => k.includes(":") ? k.slice(0, k.lastIndexOf(":")) : k));
      rks.forEach(rk => redrawLine(rk)); }

    const traceSel = document.getElementById("trace-route");
    function optLabel(key, meta, line) {
      const dir = D.lines.filter((l) => l.route_id === line.route_id).length > 1
        ? " " + (line.headsign || "smjer " + line.direction_id) : "";
      const done = getVariantKeys(key).some(sk => shapes[sk] && shapes[sk].length >= 2) ? " ✓" : "";
      return meta.short_name + dir + done;
    }
    layerKeys.forEach(({ key, meta, line }) => {
      const opt = document.createElement("option");
      opt.value = key; opt.textContent = optLabel(key, meta, line);
      traceSel.appendChild(opt);
    });
    function refreshOptions() {
      [...traceSel.options].forEach((opt) => {
        const lk = layerKeys.find((x) => x.key === opt.value);
        if (lk) opt.textContent = optLabel(lk.key, lk.meta, lk.line);
      });
      [...traceCopyDest.options].forEach((opt) => {
        const lk = layerKeys.find((x) => x.key === opt.value);
        if (lk) opt.textContent = optLabel(lk.key, lk.meta, lk.line);
      });
    }

    // Populate copy-destination dropdown (same routes, different select element).
    const traceCopyDest = document.getElementById("trace-copy-dest");
    layerKeys.forEach(({ key, meta, line }) => {
      const opt = document.createElement("option");
      opt.value = key; opt.textContent = optLabel(key, meta, line);
      traceCopyDest.appendChild(opt);
    });
    document.getElementById("trace-copy").addEventListener("click", () => {
      const srcKey = traceSel.value;
      const dstKey = traceCopyDest.value;
      if (srcKey === dstKey) { alert("Izvorišna i odredišna linija su iste."); return; }
      if (!shapes[srcKey] || shapes[srcKey].length < 2) {
        alert("Izvorišna linija nema nacrtan put."); return;
      }
      const dstLabel = [...traceCopyDest.options].find(o => o.value === dstKey)?.textContent || dstKey;
      const srcLabel = [...traceSel.options].find(o => o.value === srcKey)?.textContent || srcKey;
      if (!confirm(`Kopirati put iz "${srcLabel}" u "${dstLabel}"?\n(Postojeći put odredišne linije bit će zamijenjen.)`)) return;
      shapes[dstKey] = shapes[srcKey].map(p => [...p]);
      saveShapes(); redrawLine(dstKey); refreshOptions();
    });

    let tracing = false, traceKey = null, traceActiveIdx = -1;
    let traceShapeKey = null, traceVariantIdx = 0;
    const vtxLayer = L.layerGroup().addTo(map);
    const traceBtn = document.getElementById("trace-draw");
    const varNav = document.getElementById("var-nav");
    const varLabel = document.getElementById("var-label");

    function updateVarNav() {
      if (!tracing || !traceKey) { varNav.style.display = "none"; return; }
      const n = getVariantKeys(traceKey).length;
      varNav.style.display = n > 1 ? "" : "none";
      varLabel.textContent = `Var ${traceVariantIdx + 1}/${n}`;
    }

    function renderVtx() {
      vtxLayer.clearLayers();
      if (!tracing || !traceShapeKey) return;
      const pts = shapes[traceShapeKey] || [];

      // Midpoint handles (drawn first so waypoints sit on top)
      for (let i = 0; i < pts.length - 1; i++) {
        const mid = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
        const insertIdx = i + 1; // capture for closure
        const mMid = L.marker(mid, {
          draggable: true,
          zIndexOffset: 550,
          icon: L.divIcon({
            className: "",
            html: `<div style="width:8px;height:8px;background:#ccc;border:1.5px solid #555;border-radius:50%;opacity:0.85"></div>`,
            iconSize: [8, 8], iconAnchor: [4, 4],
          }),
        });
        // Click (no drag): insert at midpoint, stop map-click from also firing.
        mMid.on("click", (e) => {
          e.originalEvent.stopPropagation();
          shapes[traceShapeKey].splice(insertIdx, 0, [mid[0], mid[1]]);
          saveShapes(); redrawLine(traceKey); renderVtx(); refreshOptions();
        });
        let midInserted = false;
        mMid.on("dragstart", () => { midInserted = false; });
        mMid.on("drag", (e) => {
          const p = e.target.getLatLng();
          if (!midInserted) { shapes[traceShapeKey].splice(insertIdx, 0, [p.lat, p.lng]); midInserted = true; }
          else { shapes[traceShapeKey][insertIdx] = [p.lat, p.lng]; }
          redrawLine(traceKey);
        });
        mMid.on("dragend", () => { saveShapes(); renderVtx(); refreshOptions(); });
        mMid.addTo(vtxLayer);
      }

      // Waypoint markers (on top)
      const activeI = traceActiveIdx >= 0 && traceActiveIdx < pts.length
        ? traceActiveIdx : pts.length - 1;
      pts.forEach((p, i) => {
        const isActive = i === activeI;
        const m = L.marker(p, {
          draggable: true,
          zIndexOffset: 600,
          icon: L.divIcon({
            className: "",
            html: `<div style="width:${isActive ? 13 : 10}px;height:${isActive ? 13 : 10}px;background:${isActive ? "#ffe08a" : "#fff"};border:2px solid #222;border-radius:50%"></div>`,
            iconSize: isActive ? [13, 13] : [10, 10],
            iconAnchor: isActive ? [6, 6] : [5, 5],
          }),
        });
        // Click sets this waypoint as the active drawing anchor.
        m.on("click", (e) => {
          e.originalEvent.stopPropagation();
          traceActiveIdx = i;
          renderVtx();
        });
        m.on("drag", (e) => {
          const pos = e.target.getLatLng();
          shapes[traceShapeKey][i] = [pos.lat, pos.lng];
          redrawLine(traceKey);
          const snap = findSnap(pos, i);
          if (snap) {
            if (!snapRing) snapRing = L.circleMarker(snap, { radius: 9, color: "#00cc44", weight: 2.5, fillOpacity: 0, interactive: false }).addTo(map);
            else snapRing.setLatLng(snap);
          } else {
            if (snapRing) { map.removeLayer(snapRing); snapRing = null; }
          }
        });
        m.on("dragend", () => {
          if (snapRing) { map.removeLayer(snapRing); snapRing = null; }
          const snap = findSnap(m.getLatLng(), i);
          if (snap) { shapes[traceShapeKey][i] = [snap[0], snap[1]]; m.setLatLng(snap); }
          saveShapes(); renderVtx(); refreshOptions();
        });
        m.on("contextmenu", (e) => {
          e.originalEvent.stopPropagation();
          shapes[traceShapeKey].splice(i, 1);
          if (traceActiveIdx >= shapes[traceShapeKey].length) traceActiveIdx = shapes[traceShapeKey].length - 1;
          saveShapes(); redrawLine(traceKey); renderVtx(); refreshOptions();
        });
        m.addTo(vtxLayer);
      });
    }

    function setTrace(on) {
      tracing = on;
      traceKey = traceSel.value;
      traceShapeKey = traceKey;
      traceVariantIdx = 0;
      traceActiveIdx = -1;
      if (on) {
        setEdit(false);
        map.getContainer().style.cursor = "crosshair";
        traceBtn.textContent = "✓ Završi crtanje";
        traceBtn.style.background = "#ffe08a";
      } else {
        map.getContainer().style.cursor = "";
        traceBtn.textContent = "✎ Crtaj rutu";
        traceBtn.style.background = "";
      }
      updateVarNav();
      renderVtx();
    }
    traceBtn.addEventListener("click", () => setTrace(!tracing));
    traceSel.addEventListener("change", () => {
      traceActiveIdx = -1;
      if (tracing) setTrace(true);
      if (stopEditMode) buildStopEditMarkers();
    });

    // Snap: if cursor is within SNAP_PX pixels of any waypoint on the current shape,
    // the new point lands exactly on that waypoint (great for closing loops).
    const SNAP_PX = 15;
    // excludeIdx: skip the waypoint being dragged so it doesn't snap to itself.
    function findSnap(latlng, excludeIdx = -1) {
      const clickPx = map.latLngToContainerPoint(latlng);
      const pts = shapes[traceShapeKey] || [];
      let best = null, bestD = SNAP_PX;
      pts.forEach((p, j) => {
        if (j === excludeIdx) return;
        const px = map.latLngToContainerPoint(L.latLng(p[0], p[1]));
        const d = Math.hypot(clickPx.x - px.x, clickPx.y - px.y);
        if (d < bestD) { bestD = d; best = p; }
      });
      return best;
    }

    // Green ring — shown only while dragging a waypoint near a snap target.
    let snapRing = null;

    // Map click: active mid-point → branch into new variant; active at end → append.
    // Clicked position snaps to a nearby waypoint if within SNAP_PX pixels.
    map.on("click", (e) => {
      if (!tracing) return;
      const snap = findSnap(e.latlng);
      const coord = snap ? snap : [e.latlng.lat, e.latlng.lng];
      const pts = shapes[traceShapeKey] = shapes[traceShapeKey] || [];
      const activeI = traceActiveIdx >= 0 && traceActiveIdx < pts.length
        ? traceActiveIdx : pts.length - 1;

      if (activeI < pts.length - 1) {
        // Active is not the last point — create a new branch variant.
        const allKeys = getVariantKeys(traceKey);
        const newShapeKey = traceKey + ":" + allKeys.length;
        shapes[newShapeKey] = pts.slice(0, activeI + 1).map(p => [...p]);
        shapes[newShapeKey].push(coord);
        ensureBranchPolyline(traceKey, newShapeKey);
        traceShapeKey = newShapeKey;
        traceVariantIdx = allKeys.length;
        traceActiveIdx = shapes[newShapeKey].length - 1;
      } else {
        pts.push(coord);
        traceActiveIdx = pts.length - 1;
      }
      saveShapes(); redrawLine(traceKey); updateVarNav(); renderVtx(); refreshOptions();
    });

    document.getElementById("trace-undo").addEventListener("click", () => {
      if (!traceShapeKey) return;
      const pts = shapes[traceShapeKey];
      if (pts && pts.length) {
        pts.pop(); traceActiveIdx = pts.length - 1;
        saveShapes(); renderVtx(); redrawLine(traceKey); refreshOptions();
      }
    });

    function deleteCurrentVariant() {
      if (!tracing || !traceShapeKey || !shapes[traceShapeKey]) return;
      const isPrimary = traceShapeKey === traceKey;
      const allKeys = getVariantKeys(traceKey);
      const msg = isPrimary
        ? `Obrisati primarni put za ${traceSel.value}?`
        : `Obrisati varijantu ${traceVariantIdx + 1}/${allKeys.length} za ${traceSel.value}?`;
      if (!confirm(msg)) return;
      if (isPrimary) {
        delete shapes[traceKey];
      } else {
        delete shapes[traceShapeKey];
        if (branchPolylines[traceShapeKey]) {
          if (groups[traceKey]) groups[traceKey].removeLayer(branchPolylines[traceShapeKey]);
          delete branchPolylines[traceShapeKey];
        }
        // Collect and renumber remaining branches consecutively.
        const remaining = [];
        for (let j = 1; shapes[traceKey + ":" + j] !== undefined; j++) {
          remaining.push(shapes[traceKey + ":" + j]);
          const sk = traceKey + ":" + j;
          delete shapes[sk];
          if (branchPolylines[sk]) {
            if (groups[traceKey]) groups[traceKey].removeLayer(branchPolylines[sk]);
            delete branchPolylines[sk];
          }
        }
        remaining.forEach((p, idx) => {
          const newKey = traceKey + ":" + (idx + 1);
          shapes[newKey] = p;
          ensureBranchPolyline(traceKey, newKey);
        });
      }
      saveShapes();
      traceShapeKey = traceKey; traceVariantIdx = 0; traceActiveIdx = -1;
      redrawLine(traceKey); updateVarNav(); renderVtx(); refreshOptions();
    }
    document.getElementById("trace-clear").addEventListener("click", deleteCurrentVariant);

    document.getElementById("var-del").addEventListener("click", deleteCurrentVariant);
    document.getElementById("var-prev").addEventListener("click", () => {
      if (!traceKey) return;
      const keys = getVariantKeys(traceKey);
      traceVariantIdx = (traceVariantIdx - 1 + keys.length) % keys.length;
      traceShapeKey = keys[traceVariantIdx]; traceActiveIdx = -1;
      updateVarNav(); renderVtx();
    });
    document.getElementById("var-next").addEventListener("click", () => {
      if (!traceKey) return;
      const keys = getVariantKeys(traceKey);
      traceVariantIdx = (traceVariantIdx + 1) % keys.length;
      traceShapeKey = keys[traceVariantIdx]; traceActiveIdx = -1;
      updateVarNav(); renderVtx();
    });
    // ---- Draggable stop editor → stops.txt export ----------------------------
    const stopEditLayer = L.layerGroup();
    let stopEditMode = false;
    const stopEditBtn = document.getElementById("stop-edit");

    function addStopEditMarker(lat, lon, label, sublabel, onDragEnd, onSetCoord, onDuplicate, onDelete, color, recType, origLat, origLon) {
      const m = L.marker([lat, lon], {
        draggable: true, zIndexOffset: 500,
        icon: L.divIcon({ className: "",
          html: `<div style="width:14px;height:14px;background:${color};border:2px solid #fff;border-radius:50%;box-shadow:0 0 4px rgba(0,0,0,.6)"></div>`,
          iconSize: [14, 14], iconAnchor: [7, 7] }),
      });
      m.bindTooltip(`<b>${label}</b>${sublabel ? " · " + sublabel : ""}`, { sticky: true });
      m.on("dragend", (e) => onDragEnd(e.target.getLatLng()));
      m.on("click", () => {
        const uid = "se" + Date.now();
        const curLat = m.getLatLng().lat.toFixed(6), curLon = m.getLatLng().lng.toFixed(6);
        L.popup({ minWidth: 215 })
          .setLatLng(m.getLatLng())
          .setContent(
            `<b>${label}</b><br><small style="color:#666">${sublabel || ""}</small><br>` +
            `<input id="${uid}" type="text" value="${curLat}, ${curLon}"` +
            ` style="width:100%;font-size:12px;margin-top:5px;box-sizing:border-box" placeholder="lat, lon">` +
            `<button id="${uid}gps" style="width:100%;font-size:12px;margin-top:5px;padding:5px;` +
            `background:#1a73e8;color:#fff;border:none;border-radius:4px;cursor:pointer">📍 Postavi na GPS lokaciju</button>` +
            `<div style="display:flex;gap:4px;margin-top:4px">` +
            `<button id="${uid}set" style="flex:1;font-size:12px">Postavi</button>` +
            (onDuplicate ? `<button id="${uid}dup" style="flex:1;font-size:12px">Dupliciraj</button>` : "") +
            (onDelete    ? `<button id="${uid}del" style="flex:1;font-size:12px;color:#c00">Obriši</button>` : "") +
            `</div>` +
            `<button id="${uid}rec" style="width:100%;font-size:12px;margin-top:5px;padding:5px;` +
            `background:#198754;color:#fff;border:none;border-radius:4px;cursor:pointer">✉ Pošalji prijedlog</button>`
          )
          .openOn(map);
        setTimeout(() => {
          const inp = document.getElementById(uid);
          if (inp) inp.select();
          const setBtn = document.getElementById(uid + "set");
          if (setBtn) setBtn.onclick = () => {
            const parts = (inp.value || "").trim().split(/[\s,]+/).map(Number).filter(x => !isNaN(x));
            if (parts.length < 2 || Math.abs(parts[0]) > 90 || Math.abs(parts[1]) > 180) { alert("Format: lat, lon — npr. 45.162522, 18.009741"); return; }
            onSetCoord(parts[0], parts[1]);
            m.setLatLng([parts[0], parts[1]]);
            map.closePopup();
          };
          const gpsBtn = document.getElementById(uid + "gps");
          if (gpsBtn) gpsBtn.onclick = () => {
            withGpsFix((la, lo, acc) => {
              if (acc > 30 && !confirm(`GPS točnost je samo ±${Math.round(acc)} m. Svejedno postaviti?`)) return;
              inp.value = `${la.toFixed(6)}, ${lo.toFixed(6)}`;
              onSetCoord(la, lo);
              m.setLatLng([la, lo]);
              map.closePopup();
            }, gpsBtn);
          };
          const dupBtn = document.getElementById(uid + "dup");
          if (dupBtn && onDuplicate) dupBtn.onclick = () => { map.closePopup(); onDuplicate(); };
          const delBtn = document.getElementById(uid + "del");
          if (delBtn && onDelete) delBtn.onclick = () => { map.closePopup(); onDelete(); };
          const recBtn = document.getElementById(uid + "rec");
          if (recBtn) recBtn.onclick = () => {
            const ll = m.getLatLng();
            submitRecommendation({
              type: recType || "move",
              stop_id: sublabel, name: label,
              old: (recType === "move" && origLat != null) ? { lat: origLat, lon: origLon } : null,
              new: { lat: +ll.lat.toFixed(6), lon: +ll.lng.toFixed(6) },
              line: traceSel.value,
            }, recBtn);
          };
        }, 0);
      });
      m.addTo(stopEditLayer);
      return m;
    }

    // Send a stop correction to the backend review queue (Development mode).
    // POSTs to the Vercel function; only works on the deployed HTTPS site. The
    // local edit is already saved in localStorage, so a failure loses nothing.
    function submitRecommendation(payload, btn) {
      const orig = btn ? btn.textContent : null;
      if (btn) { btn.disabled = true; btn.textContent = "Šaljem…"; }
      const done = () => { if (btn) { btn.disabled = false; btn.textContent = orig; } };
      fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, client_ts: Date.now() }),
      })
        .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
        .then(({ ok, j }) => {
          done();
          if (ok && j.ok) { alert("Hvala! Prijedlog je zabilježen za pregled."); map.closePopup(); }
          else alert("Slanje nije uspjelo: " + ((j && j.error) || "greška") +
            (j && j.error === "rate" ? " — previše prijedloga, pokušaj kasnije." : ""));
        })
        .catch(() => { done(); alert("Slanje nije uspjelo (mreža). Lokalna izmjena je sačuvana."); });
    }

    function buildStopEditMarkers() {
      stopEditLayer.clearLayers();
      const selLine = D.lines.find((l) => l.route_id + "|" + l.direction_id === traceSel.value);
      const relevantIds = selLine ? new Set(selLine.stop_ids) : new Set();

      // Existing stops from the feed.
      D.stops.forEach((s) => {
        if (!relevantIds.has(s.id)) return;
        const ov = stopOverrides[s.id];
        const lat = ov ? ov.lat : s.lat, lon = ov ? ov.lon : s.lon;
        addStopEditMarker(lat, lon, s.name, s.id,
          (p) => { stopOverrides[s.id] = { lat: p.lat, lon: p.lng }; saveStopOverrides(); (stopLineMarkers[s.id] || []).forEach(lm => lm.setLatLng(p)); },
          (newLat, newLon) => { stopOverrides[s.id] = { lat: newLat, lon: newLon }; saveStopOverrides(); (stopLineMarkers[s.id] || []).forEach(lm => lm.setLatLng([newLat, newLon])); },
          () => {
            const baseLat = (stopOverrides[s.id] ? stopOverrides[s.id].lat : s.lat);
            const baseLon = (stopOverrides[s.id] ? stopOverrides[s.id].lon : s.lon);
            const suggestId = s.id + "_KOP";
            const newId = prompt("ID novog stajališta:", suggestId);
            if (!newId) return;
            if (D.stops.find(x => x.id === newId) || newStops.find(x => x.stop_id === newId)) { alert("Stajalište s tim ID-jem već postoji."); return; }
            newStops.push({ stop_id: newId, stop_name: s.name, stop_lat: baseLat + 0.0001, stop_lon: baseLon, stop_desc: s.desc || "" });
            saveNewStops();
            buildStopEditMarkers();
          },
          null, // no delete for feed stops
          "#ff6600", "move", s.lat, s.lon
        );
      });

      // New (duplicated) stops — shown in a different colour.
      newStops.forEach((ns, idx) => {
        addStopEditMarker(ns.stop_lat, ns.stop_lon, ns.stop_name, ns.stop_id,
          (p) => { newStops[idx].stop_lat = p.lat; newStops[idx].stop_lon = p.lng; saveNewStops(); },
          (newLat, newLon) => { newStops[idx].stop_lat = newLat; newStops[idx].stop_lon = newLon; saveNewStops(); },
          null, // no further duplication of duplicates
          () => { if (confirm(`Obrisati novo stajalište "${ns.stop_name}" (${ns.stop_id})?`)) { newStops.splice(idx, 1); saveNewStops(); buildStopEditMarkers(); } },
          "#9933ff", "new", null, null
        );
      });
    }

    function setStopEdit(on) {
      stopEditMode = on;
      if (on) {
        setEdit(false);   // leave overlay edit mode
        buildStopEditMarkers();
        stopEditLayer.addTo(map);
        stopEditBtn.textContent = "✓ Završi uređivanje";
        stopEditBtn.style.background = "#ffe08a";
      } else {
        map.removeLayer(stopEditLayer);
        stopEditBtn.textContent = "✎ Uredi stajališta";
        stopEditBtn.style.background = "";
      }
    }
    stopEditBtn.addEventListener("click", () => setStopEdit(!stopEditMode));

    document.getElementById("stop-export").addEventListener("click", () => {
      const rows = ["stop_id,stop_name,stop_lat,stop_lon,stop_desc"];
      D.stops.forEach((s) => {
        const ov = stopOverrides[s.id];
        const lat = ov ? ov.lat : s.lat;
        const lon = ov ? ov.lon : s.lon;
        const desc = (s.desc || "").replace(/,/g, ";");
        const name = s.name.replace(/,/g, ";");
        rows.push(`${s.id},${name},${lat.toFixed(6)},${lon.toFixed(6)},${desc}`);
      });
      const blob = new Blob([rows.join("\n") + "\n"], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "stops.txt"; a.click();
      URL.revokeObjectURL(a.href);
      newStops.forEach((ns) => {
        rows.push(`${ns.stop_id},${ns.stop_name.replace(/,/g, ";")},${ns.stop_lat.toFixed(6)},${ns.stop_lon.toFixed(6)},${(ns.stop_desc || "").replace(/,/g, ";")}`);
      });
      const moved = Object.keys(stopOverrides).length;
      alert(`Izvezeno stops.txt (${moved} premješteno, ${newStops.length} novo).\n\nSpremi u gtfs/ pa pokreni build_map.py.`);
    });

    document.getElementById("stop-reset").addEventListener("click", () => {
      const n = Object.keys(stopOverrides).length;
      if (n === 0) { alert("Nema premještenih stajališta."); return; }
      if (!confirm(`Resetirati sva premještena stajališta (${n})?`)) return;
      stopOverrides = {};
      saveStopOverrides();
      // Restore all line markers to original positions.
      D.stops.forEach((s) => {
        (stopLineMarkers[s.id] || []).forEach((lm) => lm.setLatLng([s.lat, s.lon]));
      });
      if (stopEditMode) buildStopEditMarkers();
    });

    document.getElementById("trace-export").addEventListener("click", () => {
      const rows = ["shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence"];
      const made = [];
      Object.keys(shapes).sort().forEach((key) => {
        const pts = shapes[key];
        if (!pts || pts.length < 2) return;
        const colonIdx = key.lastIndexOf(":");
        const baseKey = colonIdx > 0 ? key.slice(0, colonIdx) : key;
        const varSuffix = colonIdx > 0 ? "_B" + key.slice(colonIdx + 1) : "";
        const pipeIdx = baseKey.lastIndexOf("|");
        const rid = baseKey.slice(0, pipeIdx);
        const did = baseKey.slice(pipeIdx + 1);
        const sid = `SHP_${rid}_${did}${varSuffix}`;
        made.push(`${sid} (${pts.length})`);
        pts.forEach((p, i) => rows.push(`${sid},${p[0].toFixed(6)},${p[1].toFixed(6)},${i + 1}`));
      });
      if (made.length === 0) { alert("Nema nacrtanih ruta za izvoz."); return; }
      const blob = new Blob([rows.join("\n") + "\n"], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "shapes.txt"; a.click();
      URL.revokeObjectURL(a.href);
      alert("Izvezeno shapes.txt:\n\n" + made.join("\n") +
        "\n\nSpremi u gtfs/ pa pokreni build_map.py.");
    });

    // ======================================================================
    // MODES — Development (editing) / Production (rider trip planner)
    // ======================================================================
    const MODE_KEY = "sb_mode";
    const modeDevBtn = document.getElementById("mode-dev");
    const modeProdBtn = document.getElementById("mode-prod");

    function initialMode() {
      const q = new URLSearchParams(location.search).get("mode");
      if (q === "dev" || q === "prod") return q;
      return localStorage.getItem(MODE_KEY) === "dev" ? "dev" : "prod"; // default prod
    }
    let appMode = initialMode();

    function applyMode(m) {
      appMode = m;
      localStorage.setItem(MODE_KEY, m);
      document.body.classList.toggle("mode-dev", m === "dev");
      document.body.classList.toggle("mode-prod", m === "prod");
      modeDevBtn.classList.toggle("active", m === "dev");
      modeProdBtn.classList.toggle("active", m === "prod");
      relocateLines(m);
      if (m === "prod") {
        if (tracing) setTrace(false);
        if (ovEdit) setEdit(false);
        if (stopEditMode) setStopEdit(false);
        ovVisible(false);            // hide the PDF tracing overlay for riders
        ensureSchedule();
      } else {
        clearPlannerHighlight();
        setPinMode(null);            // drop any pending pin-on-map state
        ovVisible(ovOn.checked);     // restore overlay per its checkbox
        closeStopBoard();            // departure board is Production-only
      }
      updateProdStops();             // show/hide the tappable stops layer per mode
      refreshSheetLabel();           // mobile entry button reflects the mode
      syncMSheet();                  // set up / tear down the mobile bottom sheet
    }
    // "Linije na karti" is shared by both modes. In Production it lives at the
    // bottom of the scrolling sidebar (inside #prod-tools); in Development it
    // sits in its original spot in #panel, before #dev-tools. Same DOM node, so
    // its checkboxes/handlers stay wired across the move.
    function relocateLines(m) {
      const lines = document.getElementById("lines-sec");
      const prod = document.getElementById("prod-tools");
      const dev = document.getElementById("dev-tools");
      if (!lines) return;
      if (m === "prod") prod.appendChild(lines);
      else lines.parentNode === prod && dev.parentNode.insertBefore(lines, dev);
    }
    modeDevBtn.addEventListener("click", () => applyMode("dev"));
    modeProdBtn.addEventListener("click", () => applyMode("prod"));

    // Development mode is hidden from riders: the "Razvoj" tab only appears after
    // a hidden gesture — three quick taps on "Produkcija". It also shows
    // automatically when we're already in dev (e.g. a ?mode=dev deep link), so the
    // active tab is never invisible. Stays revealed for the session.
    modeDevBtn.style.display = "none";
    function revealDev() { modeDevBtn.style.display = ""; }
    if (appMode === "dev") revealDev();
    let _devTaps = 0, _devTapTimer = null;
    modeProdBtn.addEventListener("click", () => {
      _devTaps++;
      clearTimeout(_devTapTimer);
      _devTapTimer = setTimeout(() => { _devTaps = 0; }, 700);
      if (_devTaps >= 3) { _devTaps = 0; revealDev(); }
    });

    // ---- Lazy-load schedule.js the first time Production is opened -----------
    let SCH = null, schedState = "idle";       // idle | loading | ready | error
    function ensureSchedule() {
      if (schedState === "ready" || schedState === "loading") return;
      schedState = "loading";
      const pr = document.getElementById("pl-results");
      if (pr) pr.innerHTML = '<p class="muted">Učitavam vozni red…</p>';
      const s = document.createElement("script");
      s.src = "schedule.js";
      s.onload = () => {
        SCH = window.GTFS_SCHEDULE; schedState = "ready";
        buildConnIndex(); initProdUI();   // initProdUI replaces the loading message with the hint
      };
      s.onerror = () => {
        schedState = "error";
        if (pr) pr.innerHTML = '<p class="muted">Vozni red se nije učitao (schedule.js).</p>';
      };
      document.head.appendChild(s);
    }

    // ---- Shared helpers ------------------------------------------------------
    const stopName = (id) => (stopById[id] ? stopById[id].name : id);
    const routeMeta = (rid) => D.routes[rid] || { color: "#666", short_name: rid };
    function fmtT(sec) {                          // seconds-after-midnight -> HH:MM
      const m = ((sec % 86400) + 86400) % 86400;
      return String(Math.floor(m / 3600)).padStart(2, "0") + ":" +
             String(Math.floor((m % 3600) / 60)).padStart(2, "0");
    }
    function dowMon0(ymd) {                        // "YYYYMMDD" -> 0=Mon … 6=Sun
      const d = new Date(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8));
      return (d.getDay() + 6) % 7;
    }
    function servicesForDate(ymd) {
      const dow = dowMon0(ymd), active = new Set();
      for (const sid in SCH.calendar) {
        const c = SCH.calendar[sid];
        if (c.days[dow] && ymd >= c.start && ymd <= c.end) active.add(sid);
      }
      for (const e of SCH.calendar_dates) {       // exceptions override the mask
        if (e.date === ymd) (e.exception === 1 ? active.add(e.service_id) : active.delete(e.service_id));
      }
      return active;
    }
    const ymdToInput = (s) => s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8);
    function feedWindow() {                        // earliest start / latest end
      let mn = null, mx = null;
      for (const sid in SCH.calendar) {
        const c = SCH.calendar[sid];
        if (!mn || c.start < mn) mn = c.start;
        if (!mx || c.end > mx) mx = c.end;
      }
      return { min: mn, max: mx };
    }
    // A/B poles are separate stops sharing a name; a walk between same-named
    // stops is just crossing the street, so hide it from the itinerary.
    function displayLegs(it) {
      const legs = it.legs.filter((l) => {
        if (l.kind !== "walk") return true;
        if (l.origin || l.dest) return (l.arr - l.dep) >= 60;   // hide trivial access/egress walks
        return stopName(l.from) !== stopName(l.to);             // hide same-pole transfer walks
      });
      return legs.length ? legs : it.legs;
    }

    // ---- Connection index (built once schedule.js loads) --------------------
    let ALL_CONNS = [], TRF = {};
    function buildConnIndex() {
      ALL_CONNS = [];
      for (const t of SCH.trips) {
        for (let i = 0; i < t.stops.length - 1; i++) {
          const a = t.stops[i], b = t.stops[i + 1];
          if (a[2] == null || b[1] == null) continue;
          ALL_CONNS.push({ ds: a[0], dt: a[2], as: b[0], at: b[1], trip: t.id, rid: t.route_id, svc: t.service_id });
        }
      }
      ALL_CONNS.sort((x, y) => x.dt - y.dt);
      TRF = {};
      for (const [f, to, w] of SCH.transfers) (TRF[f] = TRF[f] || []).push([to, w]);
    }
    const tripById = (id) => SCH.trips.find((t) => t.id === id);

    // Stops walkable from an arbitrary point: those within WALK_MAX (else just
    // the single nearest), nearest first, capped — returns [[stop_id, walkSec]].
    const WALK_MAX = 1000;          // metres a rider will walk to/from a stop
    function stopsNear(pt) {
      const ranked = D.stops
        .map((s) => ({ s, d: haversine(pt.lat, pt.lon, s.lat, s.lon) }))
        .sort((a, b) => a.d - b.d);
      const within = ranked.filter((x) => x.d <= WALK_MAX);
      return (within.length ? within : ranked.slice(0, 1))
        .slice(0, 6).map((x) => [x.s.id, Math.max(30, Math.round(x.d / 1.3))]);
    }

    // ---- Connection Scan Algorithm between two arbitrary points --------------
    // Seeds the scan from every stop near the origin (arrival = dep + walk), then
    // picks the destination stop minimising arrival + walk-to-destination. The
    // itinerary is wrapped with an origin "access" walk and a destination "egress"
    // walk so the rider sees the whole door-to-door trip.
    function planPoints(fromPt, toPt, depSec, ymd) {
      const active = servicesForDate(ymd);
      const arr = {}, inc = {}, tripInfo = {};   // tripInfo[trip] = where/when it was boarded
      for (const [sid, w] of stopsNear(fromPt)) {
        const t = depSec + w;
        if (t < (arr[sid] ?? Infinity)) { arr[sid] = t; inc[sid] = { k: "origin", w }; }
      }
      for (const c of ALL_CONNS) {
        if (!active.has(c.svc)) continue;
        let ti = tripInfo[c.trip];
        if (!ti && (arr[c.ds] ?? Infinity) <= c.dt)   // first stop where we can board this trip
          ti = tripInfo[c.trip] = { boardStop: c.ds, boardTime: c.dt, rid: c.rid };
        if (!ti) continue;
        if (c.at < (arr[c.as] ?? Infinity)) {
          arr[c.as] = c.at; inc[c.as] = { k: "ride", trip: c.trip };
          (TRF[c.as] || []).forEach(([t, w]) => {
            if (c.at + w < (arr[t] ?? Infinity)) { arr[t] = c.at + w; inc[t] = { k: "walk", from: c.as, to: t, w, dep: c.at }; }
          });
        }
      }
      let best = null;
      for (const [sid, w] of stopsNear(toPt)) {
        if (arr[sid] != null) { const a = arr[sid] + w; if (!best || a < best.a) best = { sid, w, a }; }
      }
      if (!best) return null;
      // Reconstruct: each ride leg spans a whole trip from where it was boarded
      // to where we got off — so staying on one line never shows a phantom transfer.
      const rev = []; let cur = best.sid, guard = 0;
      while (inc[cur] && inc[cur].k !== "origin" && guard++ < 100000) {
        const ic = inc[cur];
        if (ic.k === "walk") { rev.push({ kind: "walk", from: ic.from, to: ic.to, dep: ic.dep, arr: ic.dep + ic.w }); cur = ic.from; }
        else { const ti = tripInfo[ic.trip]; rev.push({ kind: "ride", trip: ic.trip, rid: ti.rid, from: ti.boardStop, to: cur, dep: ti.boardTime, arr: arr[cur] }); cur = ti.boardStop; }
      }
      const originWalk = inc[cur] && inc[cur].k === "origin" ? inc[cur].w : 0;
      rev.push({ kind: "walk", origin: true, to: cur, dep: depSec, arr: depSec + originWalk });
      const legs = rev.reverse();
      // Don't count the wait before the first bus: shift the access walk so it
      // ends right at boarding (i.e. "leave just in time"), like Google Maps.
      const fr = legs.find((l) => l.kind === "ride");
      if (fr && legs[0] && legs[0].kind === "walk" && legs[0].origin) {
        const wdur = legs[0].arr - legs[0].dep;
        legs[0].dep = fr.dep - wdur; legs[0].arr = fr.dep;
      }
      legs.push({ kind: "walk", dest: true, from: best.sid, dep: arr[best.sid], arr: best.a });
      return { legs, arr: best.a };
    }
    function planTopPoints(fromPt, toPt, depSec, ymd, n = 3) {
      const out = []; let d = depSec, guard = 0;
      while (out.length < n && guard++ < 25) {
        const j = planPoints(fromPt, toPt, d, ymd);
        if (!j) break;
        out.push(j);
        const firstRide = j.legs.find((l) => l.kind === "ride");
        if (!firstRide) break;
        d = firstRide.dep + 1;                    // next option departs later
      }
      return out;
    }

    // "Arrive by": journeys reaching the destination no later than arrSec, the
    // latest-departing first. The forward planner gives the earliest arrival for
    // a given departure, so we walk forward from a window start, collecting every
    // distinct journey that still arrives by arrSec, and keep the latest n. (A
    // backward step from one journey's boarding just re-catches the same bus, so
    // forward-collect is what surfaces the earlier alternatives.)
    function planTopArrive(fromPt, toPt, arrSec, ymd, n = 3) {
      const MAX_J = 4 * 3600;                       // assume no useful trip is >4h
      const arrAt = (d) => { const j = planPoints(fromPt, toPt, d, ymd); return j ? j.arr : Infinity; };
      // Each option is the LATEST departure whose arrival ≤ target — the real
      // point of "arrive by". Earliest arrival is monotonic non-decreasing in
      // departure, so that departure is a binary search. For the next option we
      // drop the target just below this arrival, giving distinct, each-optimal
      // options ordered latest arrival (latest departure) first.
      const out = [];
      let target = arrSec;
      for (let k = 0; k < n; k++) {
        let lo = Math.max(0, target - MAX_J), hi = target, depStar = -1;
        if (arrAt(lo) > target) break;              // nothing arrives this early
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (arrAt(mid) <= target) { depStar = mid; lo = mid + 1; } else hi = mid - 1;
        }
        if (depStar < 0) break;
        const j = planPoints(fromPt, toPt, depStar, ymd);
        if (!j) break;
        out.push(j);
        target = j.arr - 1;                         // next option arrives strictly earlier
      }
      return out;
    }

    // ---- Production UI: planner + timetable ----------------------------------
    let prodInited = false;
    const plLayer = L.layerGroup().addTo(map);
    function clearPlannerHighlight() { plLayer.clearLayers(); }

    // From/To endpoints are arbitrary points (typed address, dropped pin, or GPS),
    // each shown by a draggable A/B marker and snapped to its nearest stop.
    const ENDP = { from: { pt: null, label: "", marker: null }, to: { pt: null, label: "", marker: null } };
    let pinMode = null;        // "from" | "to" | null — next map click sets that point

    function pinIcon(color, letter) {
      return L.divIcon({
        className: "",
        html: `<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);` +
          `background:${color};border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.5)">` +
          `<span style="transform:rotate(45deg);display:block;text-align:center;line-height:19px;color:#fff;font-weight:700;font-size:11px">${letter}</span></div>`,
        iconSize: [22, 22], iconAnchor: [11, 22],
      });
    }
    function setEndpoint(which, pt, label) {
      const e = ENDP[which];
      e.pt = pt;
      e.label = label || `${pt.lat.toFixed(5)}, ${pt.lon.toFixed(5)}`;
      document.getElementById("pl-" + which).value = e.label;
      const near = stopsNear(pt)[0];
      document.getElementById("pl-" + which + "-info").textContent = near
        ? `najbliža: ${stopName(near[0])} · ${Math.round(near[1] * 1.3)} m (${Math.max(1, Math.round(near[1] / 60))} min hoda)`
        : "nema stanice u blizini";
      const color = which === "from" ? "#198754" : "#c0392b";
      if (!e.marker) {
        e.marker = L.marker([pt.lat, pt.lon], { draggable: true, zIndexOffset: 1500, icon: pinIcon(color, which === "from" ? "A" : "B") }).addTo(map);
        e.marker.on("dragend", () => { const ll = e.marker.getLatLng(); setEndpoint(which, { lat: ll.lat, lon: ll.lng }, null); });
      } else e.marker.setLatLng([pt.lat, pt.lon]);
    }
    function clearEndpoint(which) {
      const e = ENDP[which];
      if (e.marker) { map.removeLayer(e.marker); e.marker = null; }
      e.pt = null; e.label = "";
      document.getElementById("pl-" + which).value = "";
      document.getElementById("pl-" + which + "-info").textContent = "";
    }
    function setPinMode(which) {
      pinMode = pinMode === which ? null : which;
      map.getContainer().style.cursor = pinMode ? "crosshair" : "";
      ["from", "to"].forEach((w) => {
        const b = document.getElementById("pl-" + w + "-pin");
        if (b) b.style.background = pinMode === w ? "#ffe08a" : "";
      });
    }
    // Free OSM geocoding (Nominatim), biased to the city bbox. Manual searches
    // only, so the 1 req/s usage policy is easily met.
    function geoLabel(x) {                       // concise human label from a result
      const a = x.address || {};
      const road = a.road || a.pedestrian || a.footway || a.neighbourhood || "";
      const num = a.house_number ? " " + a.house_number : "";
      const area = a.suburb || a.city_district || a.village || a.town || a.city || "";
      const main = (road + num).trim();
      if (main) return area && area !== main ? `${main}, ${area}` : main;
      return x.display_name.split(",").slice(0, 2).join(",").trim();
    }
    // Geocode against OSM Nominatim. viewbox biases (not bounds) toward the city,
    // the city is auto-appended for context, and if nothing matches we retry
    // without a trailing house number (OSM often lacks house-level data here).
    async function geocode(q) {
      const base = "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1" +
        "&limit=5&countrycodes=hr&viewbox=17.90,45.25,18.15,45.10&q=";
      const hit = async (query) => {
        const r = await fetch(base + encodeURIComponent(query), { headers: { "Accept": "application/json" } });
        return r.ok ? r.json() : [];
      };
      const withCity = /brod/i.test(q) ? q : q + ", Slavonski Brod";
      let res = await hit(withCity);
      if (!res.length) {
        const noNum = q.replace(/\s+\d+[a-z]?$/i, "").trim();   // drop trailing house no.
        if (noNum && noNum !== q) res = await hit(noNum + ", Slavonski Brod");
      }
      return res.map((x) => ({ lat: +x.lat, lon: +x.lon, label: geoLabel(x) }));
    }

    // ---- Forgiving search: fuzzy "did you mean" against real street names ----
    // OSM stores exact local spelling + diacritics (e.g. "Ulica Franje
    // Marinčevića"), which riders seldom type precisely. When a geocode finds
    // nothing we suggest the closest actual street names. Names ship baked in
    // streets.js (window.SB_STREETS, regenerated by scripts/build_streets.sh) so
    // suggestions are instant and work offline; Overpass is only a fallback if
    // that file is ever missing, cached in localStorage for 30 days.
    const STREETS_KEY = "sb_streets", STREETS_TTL = 30 * 864e5;
    let streetNames = null, streetFetch = null;
    const deburr = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    function loadStreets() {
      if (streetNames) return Promise.resolve(streetNames);
      if (Array.isArray(window.SB_STREETS) && window.SB_STREETS.length) {
        return Promise.resolve((streetNames = window.SB_STREETS));
      }
      if (streetFetch) return streetFetch;
      try {
        const c = JSON.parse(localStorage.getItem(STREETS_KEY) || "null");
        if (c && Date.now() - c.ts < STREETS_TTL && Array.isArray(c.names)) {
          return Promise.resolve((streetNames = c.names));
        }
      } catch (e) { /* fall through to fetch */ }
      const ql = '[out:json][timeout:25];area[name="Slavonski Brod"][admin_level~"8|9|10"]->.a;' +
        'way[highway][name](area.a);out tags;';
      streetFetch = fetch("https://overpass-api.de/api/interpreter",
        { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(ql) })
        .then((r) => r.json())
        .then((d) => {
          const names = [...new Set((d.elements || []).map((e) => e.tags && e.tags.name).filter(Boolean))];
          try { localStorage.setItem(STREETS_KEY, JSON.stringify({ ts: Date.now(), names })); } catch (e) { /* quota */ }
          return (streetNames = names);
        })
        .catch(() => (streetNames = []));
      return streetFetch;
    }
    function lev(a, b) {                          // Levenshtein edit distance
      const m = a.length, n = b.length;
      if (!m) return n; if (!n) return m;
      let prev = Array.from({ length: n + 1 }, (_, i) => i), cur = new Array(n + 1);
      for (let i = 1; i <= m; i++) {
        cur[0] = i;
        for (let j = 1; j <= n; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        }
        [prev, cur] = [cur, prev];
      }
      return prev[n];
    }
    // Closest street names to the typed query (house number stripped), scored by
    // each query token's best normalised edit distance to a name token — so a
    // one-letter slip or a missing diacritic still matches.
    async function streetSuggestions(q) {
      const names = await loadStreets();
      if (!names || !names.length) return [];
      const qTokens = deburr(q.replace(/\s+\d+[a-z]?$/i, "")).split(/\s+/).filter((t) => t.length > 2);
      if (!qTokens.length) return [];
      return names
        .map((name) => {
          const nTokens = deburr(name).split(/\s+/);
          let sum = 0;
          for (const qt of qTokens) {
            let best = Infinity;
            for (const nt of nTokens) best = Math.min(best, lev(qt, nt) / Math.max(qt.length, nt.length));
            sum += best;
          }
          return { name, score: sum / qTokens.length };
        })
        .filter((s) => s.score <= 0.34)
        .sort((a, b) => a.score - b.score)
        .slice(0, 4)
        .map((s) => s.name);
    }
    function chooseGeo(which, h) {
      setEndpoint(which, { lat: h.lat, lon: h.lon }, h.label);
      map.setView([h.lat, h.lon], 15);
    }
    async function runSearch(which) {
      const q = document.getElementById("pl-" + which).value.trim();
      if (!q) return;
      const info = document.getElementById("pl-" + which + "-info");
      info.textContent = "tražim adresu…";
      try {
        const hits = await geocode(q);
        if (!hits.length) {
          info.textContent = "tražim slične nazive…";
          const sugg = await streetSuggestions(q);
          if (sugg.length) {
            info.innerHTML = "";
            const lbl = document.createElement("div");
            lbl.className = "muted"; lbl.style.margin = "0 0 4px";
            lbl.textContent = "Jeste li mislili:";
            const pick = document.createElement("div");
            pick.className = "geo-picker";
            sugg.forEach((name) => {
              const b = document.createElement("button");
              b.type = "button"; b.className = "geo-opt"; b.textContent = name;
              b.onclick = () => { document.getElementById("pl-" + which).value = name; runSearch(which); };
              pick.appendChild(b);
            });
            info.appendChild(lbl); info.appendChild(pick);
          } else {
            info.textContent = "ništa nije nađeno — provjeri naziv ulice ili klikni 📌 na karti";
          }
          return;
        }
        if (hits.length === 1) { chooseGeo(which, hits[0]); return; }
        info.innerHTML = "";                       // multiple matches → small picker
        const pick = document.createElement("div");
        pick.className = "geo-picker";
        hits.forEach((h) => {
          const b = document.createElement("button");
          b.type = "button"; b.className = "geo-opt"; b.textContent = h.label;
          b.onclick = () => chooseGeo(which, h);
          pick.appendChild(b);
        });
        info.appendChild(pick);
      } catch (e) { info.textContent = "greška pri traženju adrese"; }
    }
    function endpointGps(which) {
      if (!navigator.geolocation) { alert("Uređaj/preglednik ne podržava geolokaciju."); return; }
      navigator.geolocation.getCurrentPosition((pos) => {
        const pt = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setEndpoint(which, pt, "Moja lokacija");
        map.setView([pt.lat, pt.lon], 15);
      }, (err) => alert("GPS nedostupan: " + err.message), { enableHighAccuracy: true, timeout: 15000 });
    }
    map.on("click", (e) => {
      if (!pinMode) return;
      setEndpoint(pinMode, { lat: e.latlng.lat, lon: e.latlng.lng }, null);
      setPinMode(null);
    });

    // Time mode for the planner: "now" (leave now) | "depart" (depart at) |
    // "arrive" (arrive by — wired in P2.2). Drives whether the date/time pickers
    // show and how runPlanner interprets them.
    let timeMode = "now";
    function setTimeMode(m) {
      timeMode = m;
      [["now", "tm-now"], ["depart", "tm-depart"], ["arrive", "tm-arrive"]].forEach(([k, id]) => {
        const b = document.getElementById(id);
        const on = k === m;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      document.getElementById("tm-when").style.display = m === "now" ? "none" : "";
    }

    function initProdUI() {
      if (prodInited) return; prodInited = true;
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      // If "today" is outside the feed's calendar window, default to the nearest
      // valid day and bound the date pickers to that window.
      const win = feedWindow(), todayYmd = today.replaceAll("-", "");
      let defDate = today;
      if (win.min && todayYmd < win.min) defDate = ymdToInput(win.min);
      else if (win.max && todayYmd > win.max) defDate = ymdToInput(win.max);
      ["pl-date", "tt-date"].forEach((id) => {
        const el = document.getElementById(id);
        el.value = defDate;
        if (win.min) el.min = ymdToInput(win.min);
        if (win.max) el.max = ymdToInput(win.max);
      });
      document.getElementById("pl-time").value = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const ttLine = document.getElementById("tt-line");
      layerKeys.forEach(({ key, meta, line }) => {
        const dir = D.lines.filter((l) => l.route_id === line.route_id).length > 1
          ? " " + (line.headsign || "smjer " + line.direction_id) : "";
        ttLine.add(new Option(meta.short_name + dir, key));
      });
      document.getElementById("pl-go").onclick = runPlanner;
      document.getElementById("pl-from-search").onclick = () => runSearch("from");
      document.getElementById("pl-to-search").onclick = () => runSearch("to");
      ["from", "to"].forEach((w) => {
        document.getElementById("pl-" + w).addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(w); } });
        document.getElementById("pl-" + w + "-pin").onclick = () => setPinMode(w);
      });
      document.getElementById("pl-from-gps").onclick = () => endpointGps("from");
      document.getElementById("pl-swap").onclick = () => {
        const f = { pt: ENDP.from.pt, label: ENDP.from.label }, t = { pt: ENDP.to.pt, label: ENDP.to.label };
        clearEndpoint("from"); clearEndpoint("to");
        if (t.pt) setEndpoint("from", t.pt, t.label);
        if (f.pt) setEndpoint("to", f.pt, f.label);
      };
      ttLine.onchange = renderTimetable;
      document.getElementById("tt-date").onchange = renderTimetable;
      // Time-mode segmented control: leave now / depart at / arrive by.
      const tmBtns = ["tm-now", "tm-depart", "tm-arrive"].map((id) => document.getElementById(id));
      document.getElementById("tm-now").onclick = () => { setTimeMode("now"); runPlanner(); };
      document.getElementById("tm-depart").onclick = () => setTimeMode("depart");
      document.getElementById("tm-arrive").onclick = () => setTimeMode("arrive");
      // Keyboard a11y: arrow keys move between the tabs (WAI-ARIA tablist).
      tmBtns.forEach((b, i) => b.addEventListener("keydown", (e) => {
        const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        const next = tmBtns[(i + d + tmBtns.length) % tmBtns.length];
        next.focus(); next.click();
      }));
      setTimeMode("now");
      renderTimetable();
      // Friendly initial state (replaces the "Učitavam…" loading message).
      const pr = document.getElementById("pl-results");
      if (pr) {
        pr.innerHTML = '<p class="muted">Upiši polazak i odredište — adresu, ' +
          '📌 točku na karti ili 📍 GPS — pa odaberi vrijeme i pritisni <b>Pronađi vožnju</b>. ' +
          'Možeš i kliknuti stajalište na karti za polaske.</p>';
      }
    }

    function runPlanner() {
      const box = document.getElementById("pl-results");
      if (!ENDP.from.pt || !ENDP.to.pt) {
        box.innerHTML = '<p class="muted">Odaberi polazak i odredište — upiši adresu, klikni 📌 i točku na karti, ili 📍 GPS.</p>';
        clearPlannerHighlight(); return;
      }
      // "Sada" (leave now) reads the clock and syncs the pickers; "Polazak u" /
      // "Dolazak do" use whatever's in the pickers.
      if (timeMode === "now") {
        const now = new Date(), pad = (n) => String(n).padStart(2, "0");
        document.getElementById("pl-time").value = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      }
      const ymd = document.getElementById("pl-date").value.replaceAll("-", "");
      const [hh, mm] = document.getElementById("pl-time").value.split(":").map(Number);
      const sec = hh * 3600 + mm * 60;
      const itins = timeMode === "arrive"
        ? planTopArrive(ENDP.from.pt, ENDP.to.pt, sec, ymd, 3)
        : planTopPoints(ENDP.from.pt, ENDP.to.pt, sec, ymd, 3);
      renderItins(itins);
    }

    function renderItins(itins) {
      const box = document.getElementById("pl-results");
      if (!itins || !itins.length) {
        box.innerHTML = `<p class="muted">${timeMode === "arrive"
          ? "Nema vožnje koja stiže do tog vremena." : "Nema pronađene vožnje za to vrijeme."}</p>`;
        clearPlannerHighlight(); return;
      }
      box.innerHTML = "";
      itins.forEach((it, idx) => {
        const legs = displayLegs(it);
        const rides = legs.filter((l) => l.kind === "ride");
        const arrT = legs[legs.length - 1].arr;
        const dur = Math.round((arrT - legs[0].dep) / 60);
        const walkMin = Math.round(legs.filter((l) => l.kind === "walk")
          .reduce((s, l) => s + (l.arr - l.dep), 0) / 60);
        const div = document.createElement("div");
        div.className = "itin" + (idx === 0 ? " sel open" : "");

        // Collapsed summary: ride badges + walk glyphs joined by chevrons.
        const pills = legs
          .filter((l) => l.kind === "ride" || (l.kind === "walk" && !l.origin && !l.dest))
          .map((l) => l.kind === "ride"
            ? `<span class="badge" style="background:${routeMeta(l.rid).color}">${routeMeta(l.rid).short_name}</span>`
            : `<span class="itin-walk">🚶</span>`)
          .join('<span class="itin-arrow">›</span>') || '<span class="itin-walk">🚶</span>';
        const transfers = Math.max(0, rides.length - 1);
        const sub = `<div class="itin-sub">${pills}<span class="itin-chip">· ${transfers} presj.` +
          `${walkMin ? ` · ${walkMin} min hoda` : ""}</span></div>`;

        div.innerHTML =
          `<div class="itin-head"><span class="times">${fmtT(legs[0].dep)} – ${fmtT(arrT)}</span>` +
          `<span class="dur">${dur} min</span></div>` + sub +
          `<div class="itin-steps">${stepsHtml(legs)}</div>`;

        div.querySelector(".itin-head").addEventListener("click", () => selectItin(div, it));
        div.querySelector(".itin-sub").addEventListener("click", () => selectItin(div, it));
        div.querySelectorAll(".step.conn").forEach((row) => {
          row.addEventListener("click", (e) => { if (!e.target.closest(".step-more")) panToLeg(legs[+row.dataset.leg]); });
        });
        div.querySelectorAll(".step-more").forEach((b) => b.addEventListener("click", (e) => {
          e.stopPropagation(); b.classList.toggle("open"); b.nextElementSibling.classList.toggle("open");
        }));
        box.appendChild(div);
      });
      highlightItin(itins[0]);
      if (mSheetActive()) { setMTab("planer"); sheetReveal(); }   // surface results on mobile
    }

    function selectItin(div, it) {
      document.querySelectorAll(".itin").forEach((e) => e.classList.remove("sel", "open"));
      div.classList.add("sel", "open");
      highlightItin(it);
    }

    // Stops travelled on a ride leg: hop count + intermediate stop names + headsign.
    function rideStops(l) {
      const t = tripById(l.trip);
      if (!t) return { count: 1, between: [], headsign: "" };
      let bi = t.stops.findIndex((s) => s[0] === l.from && s[2] === l.dep);
      let ai = t.stops.findIndex((s) => s[0] === l.to && s[1] === l.arr);
      if (bi < 0) bi = t.stops.findIndex((s) => s[0] === l.from);
      if (ai < 0) ai = t.stops.findIndex((s, i) => i > bi && s[0] === l.to);
      const between = (bi >= 0 && ai > bi) ? t.stops.slice(bi + 1, ai).map((s) => stopName(s[0])) : [];
      return { count: Math.max(1, ai - bi), between, headsign: t.headsign || "" };
    }

    // Vertical step-by-step timeline for one itinerary (Google-style).
    function stepsHtml(legs) {
      const stops = (n) => `${n} ${n === 1 ? "stajalište" : (n < 5 ? "stajališta" : "stajališta")}`;
      const node = (color, time, title, note) =>
        `<div class="step node" style="color:${color}"><div class="step-gutter"><span class="dot"></span></div>` +
        `<div class="step-body"><span class="when">${time}</span>${title}` +
        `${note ? `<div class="step-note">${note}</div>` : ""}</div></div>`;
      const walkConn = (i, txt) =>
        `<div class="step conn walk" style="color:#9aa0a6" data-leg="${i}"><div class="step-gutter"></div>` +
        `<div class="step-body">🚶 ${txt}</div></div>`;
      const rideConn = (i, l) => {
        const m = routeMeta(l.rid), rm = rideStops(l);
        const ride = rm.between.length
          ? `<span class="step-more">${stops(rm.count)} ⌄</span><div class="step-inter">${rm.between.join(" · ")}</div>`
          : stops(rm.count);
        return `<div class="step conn ride" style="color:${m.color}" data-leg="${i}"><div class="step-gutter"></div>` +
          `<div class="step-body"><span class="badge" style="background:${m.color}">${m.short_name}</span>` +
          `${rm.headsign ? ` prema ${rm.headsign}` : ""}<div class="step-note">${ride}</div></div></div>`;
      };
      const rows = [node("#198754", fmtT(legs[0].dep), "Polazak", ENDP.from.label || "")];
      legs.forEach((l, i) => {
        if (l.kind === "walk") {
          const min = Math.max(1, Math.round((l.arr - l.dep) / 60));
          rows.push(walkConn(i, l.origin ? `Hodaj ${min} min do stajališta`
            : l.dest ? `Hodaj ${min} min do cilja` : `Presjedanje — hodaj ${min} min`));
        } else {
          const c = routeMeta(l.rid).color;
          rows.push(node(c, fmtT(l.dep), stopName(l.from)), rideConn(i, l), node(c, fmtT(l.arr), stopName(l.to)));
        }
      });
      rows.push(node("#c0392b", fmtT(legs[legs.length - 1].arr), "Cilj", ENDP.to.label || ""));
      return rows.join("");
    }

    // Zoom the map to a single leg's geometry (road path for rides).
    function panToLeg(l) {
      let pts = l.kind === "ride" ? rideRoadSeg(l) : null;
      if (!pts) { const a = stopById[l.from], b = stopById[l.to]; if (a && b) pts = [[a.lat, a.lon], [b.lat, b.lon]]; }
      if (pts && pts.length >= 2) map.fitBounds(pts, fitOpts());
    }

    // Road-following geometry for a ride leg: project the board/alight stops onto
    // the route's drawn polyline and slice it, so the highlight hugs the street.
    // Ported from scripts/build_feed.py (which composes the GTFS shapes the same
    // way) — it projects onto trace *segments* (not just vertices), so stops in
    // the middle of a long, sparsely-clicked straight road still match; tries
    // every candidate projection (loop routes pass a street twice); and stitches
    // trunk<->branch hops through a junction. Tolerances mirror build_feed.py.
    const HL_SNAP = 130, HL_DK = 3.0, HL_DC = 100, HL_JUNC = 100, HL_CONT = 200;
    const lineGeoms = {};
    D.lines.forEach((ln) => {
      const k = ln.route_id + "|" + ln.direction_id;
      lineGeoms[k] = [ln.geometry].concat(ln.branches || []).filter((p) => Array.isArray(p) && p.length >= 2);
    });
    const _hv = (p, q) => haversine(p[0], p[1], q[0], q[1]);
    // Candidate projections of point s onto a polyline — one per contiguous run
    // of segments within `snap`. Each: [segIdx, t, point, dist].
    function projCands(piece, s, snap) {
      const hits = [];
      for (let i = 0; i < piece.length - 1; i++) {
        const a = piece[i], b = piece[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], den = dx * dx + dy * dy;
        const t = den === 0 ? 0 : Math.max(0, Math.min(1, ((s[0] - a[0]) * dx + (s[1] - a[1]) * dy) / den));
        const p = [a[0] + t * dx, a[1] + t * dy], d = _hv(p, s);
        if (d <= snap) hits.push([i, t, p, d]);
      }
      const out = [];
      for (const h of hits) {
        if (out.length && h[0] - out[out.length - 1][0] <= 2) { if (h[3] < out[out.length - 1][3]) out[out.length - 1] = h; }
        else out.push(h);
      }
      return out;
    }
    const _cmp = (a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]);   // order by (segIdx, t)
    function subBetween(piece, a, b) {
      const rev = _cmp(a, b) > 0, lo = rev ? b : a, hi = rev ? a : b;
      let sub = [lo[2]].concat(piece.slice(lo[0] + 1, hi[0] + 1)).concat([hi[2]]);
      if (rev) sub = sub.slice().reverse();
      let len = 0;
      for (let k = 0; k < sub.length - 1; k++) len += _hv(sub[k], sub[k + 1]);
      return [sub, len];
    }
    const _plausible = (len, straight) => len >= straight - 2 * HL_SNAP - 50 && len <= HL_DK * straight + HL_DC;
    // Every plausible sub-path between two consecutive stops: single-piece plus
    // two-leg trunk<->spur composites through a junction. [[score, sub], ...].
    function hopOptions(pieces, s1, s2) {
      const straight = _hv(s1, s2), opts = [];
      for (const piece of pieces) {
        if (piece.length < 2) continue;
        for (const a of projCands(piece, s1, HL_SNAP)) for (const b of projCands(piece, s2, HL_SNAP)) {
          const [sub, len] = subBetween(piece, a, b);
          if (_plausible(len, straight)) opts.push([len + 2 * (a[3] + b[3]), sub]);
        }
      }
      if (opts.length) return opts;
      for (const X of pieces) {
        const cA = projCands(X, s1, HL_SNAP); if (!cA.length) continue;
        for (const Y of pieces) {
          if (Y === X || Y.length < 2) continue;
          const cB = projCands(Y, s2, HL_SNAP); if (!cB.length) continue;
          for (const j of [X[0], X[X.length - 1], Y[0], Y[Y.length - 1]])
            for (const jx of projCands(X, j, HL_JUNC)) for (const jy of projCands(Y, j, HL_JUNC))
              for (const a of cA) {
                const [legA, lenA] = subBetween(X, a, jx);
                for (const b of cB) {
                  const [legB, lenB] = subBetween(Y, jy, b);
                  if (_plausible(lenA + lenB, straight)) opts.push([lenA + lenB + 2 * (a[3] + b[3]), legA.concat(legB.slice(1))]);
                }
              }
        }
      }
      return opts;
    }
    // Resolve a ride leg to its ordered stops + the route's geometry pieces.
    function rideLeg(l) {
      const t = tripById(l.trip);
      if (!t) return null;
      let bi = t.stops.findIndex((s) => s[0] === l.from && s[2] === l.dep);
      let ai = t.stops.findIndex((s) => s[0] === l.to && s[1] === l.arr);
      if (bi < 0) bi = t.stops.findIndex((s) => s[0] === l.from);
      if (ai < 0) ai = t.stops.findIndex((s, i) => i > bi && s[0] === l.to);
      if (bi < 0 || ai <= bi) return null;
      const legStops = t.stops.slice(bi, ai + 1).map((s) => stopById[s[0]]).filter(Boolean);
      if (legStops.length < 2) return null;
      return { legStops, pieces: lineGeoms[l.rid + "|" + t.direction_id] || [] };
    }
    // Best matched sub-path for one hop (null if no traced piece covers it).
    function hopSub(pieces, s1, s2, prevEnd) {
      let options = pieces.length ? hopOptions(pieces, s1, s2) : [];
      if (prevEnd && options.length) {             // prefer options continuing from the last hop
        const cont = options.filter((o) => _hv(o[1][0], prevEnd) <= HL_CONT);
        if (cont.length) options = cont;
      }
      return options.length ? options.reduce((m, o) => (o[0] < m[0] ? o : m))[1] : null;
    }
    // Synchronous road-following path: matched sub-paths where traced, straight
    // chords where not (those get upgraded asynchronously by fillRideSeg).
    function rideRoadSeg(l) {
      const a = stopById[l.from], b = stopById[l.to];
      const fallback = (a && b) ? [[a.lat, a.lon], [b.lat, b.lon]] : null;
      const leg = rideLeg(l);
      if (!leg) return fallback;
      const out = [];
      let prevEnd = null;
      for (let i = 0; i < leg.legStops.length - 1; i++) {
        const s1 = [leg.legStops[i].lat, leg.legStops[i].lon], s2 = [leg.legStops[i + 1].lat, leg.legStops[i + 1].lon];
        const sub = hopSub(leg.pieces, s1, s2, prevEnd) || [s1, s2];
        for (let k = out.length ? 1 : 0; k < sub.length; k++) out.push(sub[k]);
        prevEnd = sub[sub.length - 1];
      }
      return out.length >= 2 ? out : fallback;
    }
    // Async variant: untraced hops (no matched sub-path) are routed via OSRM's
    // driving profile so even unmapped segments follow the road. Returns the full
    // path only if at least one hop was actually filled (else null → no redraw).
    async function fillRideSeg(l) {
      const leg = rideLeg(l);
      if (!leg) return null;
      const out = [];
      let prevEnd = null, filled = false;
      for (let i = 0; i < leg.legStops.length - 1; i++) {
        const s1 = [leg.legStops[i].lat, leg.legStops[i].lon], s2 = [leg.legStops[i + 1].lat, leg.legStops[i + 1].lon];
        let sub = hopSub(leg.pieces, s1, s2, prevEnd);
        if (!sub) {
          const road = await osrmGeom("driving", s1, s2);
          if (road && road.length >= 2) { sub = road; filled = true; } else sub = [s1, s2];
        }
        for (let k = out.length ? 1 : 0; k < sub.length; k++) out.push(sub[k]);
        prevEnd = sub[sub.length - 1];
      }
      return filled && out.length >= 2 ? out : null;
    }

    // Road/footpath routing via the public OSRM demo. Used for walk legs ("foot")
    // and to fill untraced bus hops ("driving"). Cached (promise per profile +
    // rounded endpoint pair); on any failure the straight line drawn first stays.
    const osrmCache = {};
    function osrmGeom(profile, a, b) {            // a, b = [lat, lon]
      const key = `${profile}:${a[0].toFixed(5)},${a[1].toFixed(5)};${b[0].toFixed(5)},${b[1].toFixed(5)}`;
      if (key in osrmCache) return osrmCache[key];
      const url = `https://router.project-osrm.org/route/v1/${profile}/` +
        `${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`;
      const p = fetch(url).then((r) => (r.ok ? r.json() : null)).then((d) => {
        if (!d || d.code !== "Ok" || !d.routes || !d.routes.length) return null;
        return d.routes[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]);
      }).catch(() => null);
      osrmCache[key] = p;
      return p;
    }
    const walkRoute = (a, b) => osrmGeom("foot", a, b);

    let hlGen = 0;                                // bumped each highlight; async walk routes ignore stale runs
    function highlightItin(it) {
      clearPlannerHighlight();
      const gen = ++hlGen;
      const bounds = [];
      displayLegs(it).forEach((l) => {
        if (l.kind === "ride") {
          const seg = rideRoadSeg(l);
          if (!seg || seg.length < 2) return;
          const m = routeMeta(l.rid);
          const casing = L.polyline(seg, { color: "#fff", weight: 11, opacity: 0.6 }).addTo(plLayer);
          const core = L.polyline(seg, { color: m.color, weight: 6, opacity: 0.95 }).addTo(plLayer);
          [stopById[l.from], stopById[l.to]].forEach((s) => {
            if (s) L.circleMarker([s.lat, s.lon], { radius: 5, color: m.color, fillColor: "#fff", fillOpacity: 1, weight: 3 }).addTo(plLayer);
          });
          seg.forEach((p) => bounds.push(p));
          // Upgrade any untraced (straight) hops to OSRM road geometry when it returns.
          fillRideSeg(l).then((filled) => {
            if (gen === hlGen && filled) { casing.setLatLngs(filled); core.setLatLngs(filled); }
          });
        } else {                              // walk leg (access / egress / transfer)
          let a = null, b = null;
          if (l.origin) { if (ENDP.from.pt) a = [ENDP.from.pt.lat, ENDP.from.pt.lon]; const s = stopById[l.to]; if (s) b = [s.lat, s.lon]; }
          else if (l.dest) { const s = stopById[l.from]; if (s) a = [s.lat, s.lon]; if (ENDP.to.pt) b = [ENDP.to.pt.lat, ENDP.to.pt.lon]; }
          else { const fa = stopById[l.from], fb = stopById[l.to]; if (fa) a = [fa.lat, fa.lon]; if (fb) b = [fb.lat, fb.lon]; }
          if (a && b) {
            // Dotted line, straight at first; upgraded to the footpath when OSRM replies.
            const wl = L.polyline([a, b], { color: "#5f6368", weight: 4, opacity: 0.9, dashArray: "1,8", lineCap: "round" }).addTo(plLayer);
            bounds.push(a, b);
            walkRoute(a, b).then((geom) => {
              if (gen === hlGen && geom && geom.length >= 2) wl.setLatLngs(geom);
            });
          }
        }
      });
      if (ENDP.from.pt) bounds.push([ENDP.from.pt.lat, ENDP.from.pt.lon]);
      if (ENDP.to.pt) bounds.push([ENDP.to.pt.lat, ENDP.to.pt.lon]);
      if (bounds.length) map.fitBounds(bounds, fitOpts());
    }
    // Fit options that keep content clear of the desktop sidebar in Production:
    // it overlays the map's left edge, so pad the fit on the left by its width.
    function fitOpts() {
      const sbW = (appMode === "prod" && window.innerWidth > 640)
        ? (parseInt(getComputedStyle(document.documentElement).getPropertyValue("--gm-w")) || 392) + 24
        : 50;
      return { paddingTopLeft: [sbW, 60], paddingBottomRight: [60, 60], maxZoom: 16 };
    }

    function renderTimetable() {
      const box = document.getElementById("tt-results");
      const key = document.getElementById("tt-line").value;
      if (!key) { box.innerHTML = ""; return; }
      const ymd = document.getElementById("tt-date").value.replaceAll("-", "");
      const active = servicesForDate(ymd);
      const [rid, did] = key.split("|");
      const trips = SCH.trips
        .filter((t) => t.route_id === rid && t.direction_id === did && active.has(t.service_id))
        .sort((a, b) => (a.stops[0] ? a.stops[0][2] : 0) - (b.stops[0] ? b.stops[0][2] : 0));
      if (!trips.length) { box.innerHTML = '<p class="muted">Nema polazaka za taj dan.</p>'; return; }
      const rep = trips.reduce((m, t) => (t.stops.length > m.stops.length ? t : m), trips[0]);
      const repIds = rep.stops.map((s) => s[0]);
      // Align each trip's times to the representative stop pattern with a forward
      // cursor. Handles loop terminals (a stop visited twice → two rows) AND
      // short-turn trips that skip part of the pattern (→ blanks in skipped rows).
      const cols = trips.map((t) => {
        const cells = new Array(repIds.length).fill("");
        let cur = 0;
        for (const st of t.stops) {
          let j = cur;
          while (j < repIds.length && repIds[j] !== st[0]) j++;
          if (j < repIds.length) { cells[j] = fmtT(st[2]); cur = j + 1; }
        }
        return cells;
      });
      let html = '<div class="tt-wrap"><table class="tt-table"><thead><tr><th>Stanica</th>' +
        trips.map((_, i) => `<th>${i + 1}</th>`).join("") + "</tr></thead><tbody>";
      repIds.forEach((sid, ri) => {
        html += `<tr><td>${stopName(sid)}</td>` + cols.map((c) => `<td>${c[ri]}</td>`).join("") + "</tr>";
      });
      box.innerHTML = html + "</tbody></table></div>";
    }

    // ---- Production: tappable stops + departure boards -----------------------
    // Lines are hidden by default, so riders need a way to tap a stop. A light
    // stops layer shows in Production once zoomed in (≥ 14); tapping a stop opens
    // a "next departures" board in the sidebar.
    const prodStops = L.layerGroup();
    let prodStopsBuilt = false, prodStopsOn = false, boardStop = null;
    function buildProdStops() {
      if (prodStopsBuilt) return; prodStopsBuilt = true;
      D.stops.forEach((s) => {
        const m = L.circleMarker([s.lat, s.lon], {
          radius: 5, color: "#1a73e8", weight: 2, fillColor: "#fff", fillOpacity: 1,
        });
        m.bindTooltip(s.name, { direction: "top" });
        m.on("click", () => openStopBoard(s.id));
        prodStops.addLayer(m);
      });
    }
    function updateProdStops() {
      const want = appMode === "prod" && map.getZoom() >= 14;
      if (want && !prodStopsOn) { buildProdStops(); prodStops.addTo(map); prodStopsOn = true; }
      else if (!want && prodStopsOn) { map.removeLayer(prodStops); prodStopsOn = false; }
    }
    map.on("zoomend", updateProdStops);

    function closeStopBoard() {
      boardStop = null;
      const el = document.getElementById("stop-board");
      if (el) { el.hidden = true; el.innerHTML = ""; }
    }
    // Next departures from a stop, across all lines, for the planner's selected
    // day — starting "now" when that day is today, else from the day's start.
    function openStopBoard(stopId) {
      const el = document.getElementById("stop-board");
      if (!el) return;
      if (!SCH) { el.hidden = false; el.innerHTML = '<p class="muted">Učitavam vozni red…</p>'; ensureSchedule(); return; }
      boardStop = stopId;
      const ymd = (document.getElementById("pl-date").value || "").replaceAll("-", "");
      const active = servicesForDate(ymd);
      const now = new Date(), pad = (n) => String(n).padStart(2, "0");
      const todayYmd = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
      const fromSec = ymd === todayYmd ? now.getHours() * 3600 + now.getMinutes() * 60 : 0;

      const deps = [];
      for (const t of SCH.trips) {
        if (!active.has(t.service_id)) continue;
        for (const st of t.stops) {
          if (st[0] === stopId && st[2] != null) deps.push({ dep: st[2], rid: t.route_id, headsign: t.headsign });
        }
      }
      deps.sort((a, b) => a.dep - b.dep);
      const upcoming = deps.filter((d) => d.dep >= fromSec);
      const list = (upcoming.length ? upcoming : deps).slice(0, 12);
      const rows = list.length
        ? list.map((d) => {
            const m = routeMeta(d.rid);
            return `<div class="board-row"><span class="when">${fmtT(d.dep)}</span>` +
              `<span class="badge" style="background:${m.color}">${m.short_name}</span>` +
              `<span class="dest">${d.headsign || ""}</span></div>`;
          }).join("")
        : '<p class="muted">Nema polazaka za taj dan.</p>';
      el.hidden = false;
      el.innerHTML =
        `<div class="board-head"><b>${stopName(stopId)}</b>` +
        `<button class="board-close" aria-label="Zatvori">✕</button></div>` +
        `<div class="board-sub">Sljedeći polasci${upcoming.length ? "" : " (cijeli dan)"}</div>` +
        `<div class="board-rows">${rows}</div>`;
      el.querySelector(".board-close").onclick = closeStopBoard;
      if (mSheetActive()) { setMTab("planer"); sheetReveal(); }   // board lives in the Vožnje tab
      const s = stopById[stopId];
      if (s) map.panTo([s.lat, s.lon]);
    }

    applyMode(appMode);   // set initial mode (loads schedule if Production)

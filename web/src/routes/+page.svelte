<script>
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import D from '$lib/data/data.json';
	import { mode, modesRevealed, surfaceTab } from '$lib/stores.js';
	import ModeToggle from '$lib/components/ModeToggle.svelte';
	import SearchCard from '$lib/components/SearchCard.svelte';
	import PlannerResults from '$lib/components/PlannerResults.svelte';
	import StopBoard from '$lib/components/StopBoard.svelte';
	import Timetable from '$lib/components/Timetable.svelte';
	import LinesPanel from '$lib/components/LinesPanel.svelte';
	import GpsTools from '$lib/components/devtools/GpsTools.svelte';
	import OverlayTools from '$lib/components/devtools/OverlayTools.svelte';
	import ShapeTracer from '$lib/components/devtools/ShapeTracer.svelte';
	import StopEditor from '$lib/components/devtools/StopEditor.svelte';

	let mc = $state(null);

	let mapEl, panelEl, prodToolsEl, mTopbar, mHandle, cardSlot;
	let sheetOpen = $state(false); // dev mobile slide-up
	let mtab = $state('planer');

	// ---- init Leaflet + controller (browser only) ----
	onMount(async () => {
		const L = (await import('leaflet')).default;
		const { MapController } = await import('$lib/map/MapController.js');

		const q = new URLSearchParams(location.search).get('mode');
		const initial =
			q === 'dev' || q === 'prod'
				? q
				: localStorage.getItem('sb_mode') === 'dev'
					? 'dev'
					: 'prod';
		mode.set(initial);
		if (initial === 'dev') modesRevealed.set(true);

		mc = new MapController(L, mapEl, D);
		document.body.classList.add('app-map');
		setMTab('planer');
		syncMSheet();
		window.addEventListener('resize', onResize);
	});
	onDestroy(() => {
		if (browser) {
			window.removeEventListener('resize', onResize);
			document.body.classList.remove('app-map', 'mode-prod', 'mode-dev');
		}
		mc?.destroy();
	});

	// Keep <body> mode classes in sync (CSS drives both layouts off them).
	$effect(() => {
		if (!browser) return;
		document.body.classList.toggle('mode-prod', $mode === 'prod');
		document.body.classList.toggle('mode-dev', $mode === 'dev');
		syncMSheet();
	});

	// ---- Mobile bottom sheet (Production): peek / half / full detents -------
	const PEEK_VISIBLE = 78;
	let detent = 'peek';
	const mqMobile = () => browser && window.matchMedia('(max-width: 640px)').matches;
	const mSheetActive = () => mqMobile() && $mode === 'prod';

	function detentY(d) {
		const vh = window.innerHeight;
		const Hs = panelEl.getBoundingClientRect().height || vh * 0.92;
		const base = vh - Hs;
		const cardBottom =
			mTopbar && mTopbar.getBoundingClientRect().height
				? mTopbar.getBoundingClientRect().bottom + 8
				: 250;
		const top = { full: cardBottom, half: vh * 0.5, peek: vh - PEEK_VISIBLE }[d];
		return Math.max(0, Math.round(top - base));
	}
	function setDetent(d) {
		detent = d;
		panelEl.classList.remove('sheet-peek', 'sheet-half', 'sheet-full');
		panelEl.classList.add('sheet-' + d);
		panelEl.style.transform = `translateY(${detentY(d)}px)`;
	}
	function sheetReveal() {
		if (mSheetActive() && detent === 'peek') setDetent('half');
	}
	function setMTab(name) {
		mtab = name;
		if (!browser) return;
		document.body.classList.remove('mtab-planer', 'mtab-voznired', 'mtab-linije');
		document.body.classList.add('mtab-' + name);
	}
	function placeSearch() {
		if (!cardSlot || !prodToolsEl || !mTopbar) return;
		if (mSheetActive()) {
			if (cardSlot.parentNode !== mTopbar) mTopbar.appendChild(cardSlot);
		} else if (cardSlot.parentNode !== prodToolsEl) prodToolsEl.insertBefore(cardSlot, prodToolsEl.firstChild);
	}
	function syncMSheet() {
		placeSearch();
		if (mSheetActive()) {
			if (!/sheet-(peek|half|full)/.test(panelEl.className)) setDetent('peek');
			setMTab(mtab || 'planer');
		} else {
			panelEl.classList.remove('sheet-peek', 'sheet-half', 'sheet-full', 'dragging');
			panelEl.style.transform = '';
		}
	}
	function onResize() {
		if (mSheetActive()) setDetent(detent);
	}

	// Drag the handle to move between detents.
	let dragging = false,
		startY = 0,
		startTY = 0,
		lastY = 0;
	function onHandleDown(e) {
		if (!mSheetActive()) return;
		dragging = true;
		startY = lastY = e.clientY;
		startTY = detentY(detent);
		panelEl.classList.add('dragging');
		try {
			mHandle.setPointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}
	}
	function onHandleMove(e) {
		if (!dragging) return;
		lastY = e.clientY;
		const p = { full: detentY('full'), half: detentY('half'), peek: detentY('peek') };
		panelEl.style.transform = `translateY(${Math.min(p.peek, Math.max(p.full, startTY + (lastY - startY)))}px)`;
		if (e.cancelable) e.preventDefault();
	}
	function onHandleUp() {
		if (!dragging) return;
		dragging = false;
		panelEl.classList.remove('dragging');
		if (Math.abs(lastY - startY) < 8) {
			setDetent(detent === 'peek' ? 'half' : detent === 'half' ? 'full' : 'peek');
		} else {
			const p = { full: detentY('full'), half: detentY('half'), peek: detentY('peek') };
			const ty = startTY + (lastY - startY);
			setDetent(
				[
					['full', p.full],
					['half', p.half],
					['peek', p.peek]
				].sort((a, b) => Math.abs(a[1] - ty) - Math.abs(b[1] - ty))[0][0]
			);
		}
	}
	function tabClick(name) {
		setMTab(name);
		if (detent === 'peek') setDetent('half');
	}

	// React to surface() requests (results / board appearing).
	$effect(() => {
		const s = $surfaceTab;
		if (s.tab && mSheetActive()) {
			setMTab(s.tab);
			sheetReveal();
		}
	});
</script>

<div id="map" bind:this={mapEl}></div>

<ModeToggle {mc} />

<button
	id="panel-toggle"
	aria-label="Otvori izbornik"
	onclick={() => (sheetOpen = !sheetOpen)}>{sheetOpen ? '✕ Zatvori' : '☰ Izbornik'}</button
>

<div id="m-topbar" bind:this={mTopbar}></div>

<div id="panel" bind:this={panelEl} class:open={sheetOpen}>
	<h2>
		Gradski prijevoz
		<button id="panel-close" aria-label="Zatvori" onclick={() => (sheetOpen = false)}>✕</button>
	</h2>

	<div id="prod-tools" bind:this={prodToolsEl}>
		<div bind:this={cardSlot}>
			<SearchCard {mc} />
		</div>
		<div id="m-handle" bind:this={mHandle} aria-hidden="true" onpointerdown={onHandleDown} onpointermove={onHandleMove} onpointerup={onHandleUp}></div>
		<div id="m-tabs" role="tablist" aria-label="Prikaz">
			<button type="button" role="tab" class:active={mtab === 'planer'} onclick={() => tabClick('planer')}>Vožnje</button>
			<button type="button" role="tab" class:active={mtab === 'voznired'} onclick={() => tabClick('voznired')}>Vozni red</button>
			<button type="button" role="tab" class:active={mtab === 'linije'} onclick={() => tabClick('linije')}>Linije</button>
		</div>
		<StopBoard {mc} />
		<PlannerResults {mc} />
		<Timetable {mc} />
		<LinesPanel {mc} />
	</div>

	<div id="dev-tools">
		<GpsTools {mc} />
		<hr />
		<OverlayTools {mc} />
		<hr />
		<ShapeTracer {mc} />
		<hr />
		<StopEditor {mc} />
		<hr />
		<LinesPanel {mc} />
	</div>
</div>

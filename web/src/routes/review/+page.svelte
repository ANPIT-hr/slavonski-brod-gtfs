<script>
	import { onMount } from 'svelte';
	import 'leaflet/dist/leaflet.css';

	let L = null;
	let items = $state([]);
	let statusFilter = $state('new');
	let message = $state('Učitavam…');
	let mapDivs = $state([]);
	let maps = [];

	function getToken() {
		let t = sessionStorage.getItem('sb_review_token');
		if (!t) {
			t = prompt('Review token:') || '';
			if (t) sessionStorage.setItem('sb_review_token', t);
		}
		return t;
	}
	const authHeaders = () => ({ Authorization: 'Bearer ' + getToken() });

	async function load() {
		const token = getToken();
		if (!token) {
			items = [];
			message = 'Token je potreban.';
			return;
		}
		message = 'Učitavam…';
		try {
			const r = await fetch('/api/recommendations?status=' + encodeURIComponent(statusFilter), {
				headers: authHeaders()
			});
			if (r.status === 401) {
				sessionStorage.removeItem('sb_review_token');
				items = [];
				message = 'Neispravan token. Ponovo učitaj stranicu.';
				return;
			}
			const j = await r.json();
			items = j.items || [];
			message = items.length ? '' : 'Nema prijedloga za ovaj filter.';
		} catch {
			items = [];
			message = 'Greška pri dohvaćanju (je li backend/KV postavljen?).';
		}
	}

	async function patch(id, status) {
		try {
			const r = await fetch('/api/recommendations', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json', ...authHeaders() },
				body: JSON.stringify({ id, status })
			});
			if (r.ok) load();
			else alert('Nije uspjelo (' + r.status + ').');
		} catch {
			alert('Greška mreže.');
		}
	}

	function fmtTs(ms) {
		if (!ms) return '';
		const d = new Date(ms);
		const p = (n) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
	}
	const stopsRow = (it) =>
		`${it.stop_id || ''},${(it.name || '').replace(/,/g, ';')},${it.new.lat.toFixed(6)},${it.new.lon.toFixed(6)},`;
	function copyRow(it, e) {
		const row = stopsRow(it);
		(navigator.clipboard ? navigator.clipboard.writeText(row) : Promise.reject())
			.then(() => (e.target.textContent = 'kopirano ✓'))
			.catch(() => prompt('Kopiraj:', row));
	}

	// (Re)build the per-card mini maps whenever items change.
	$effect(() => {
		if (!L || !items.length) return;
		maps.forEach((m) => m.remove());
		maps = [];
		items.forEach((it, i) => {
			const div = mapDivs[i];
			if (!div) return;
			const m = L.map(div, { attributionControl: false, zoomControl: false });
			L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(m);
			const pts = [];
			if (it.old) {
				L.circleMarker([it.old.lat, it.old.lon], {
					radius: 6,
					color: '#c00',
					fillColor: '#c00',
					fillOpacity: 0.5
				})
					.addTo(m)
					.bindTooltip('staro');
				pts.push([it.old.lat, it.old.lon]);
			}
			L.circleMarker([it.new.lat, it.new.lon], {
				radius: 7,
				color: '#198754',
				fillColor: '#198754',
				fillOpacity: 0.7
			})
				.addTo(m)
				.bindTooltip('novo');
			pts.push([it.new.lat, it.new.lon]);
			if (it.old) L.polyline(pts, { color: '#555', dashArray: '4,5' }).addTo(m);
			if (pts.length > 1) m.fitBounds(pts, { padding: [30, 30], maxZoom: 17 });
			else m.setView(pts[0], 16);
		});
	});

	onMount(async () => {
		L = (await import('leaflet')).default;
		load();
	});
</script>

<svelte:head><title>Pregled prijedloga — SB prijevoz</title></svelte:head>

<header>
	<h1>Prijedlozi stajališta</h1>
	<select bind:value={statusFilter} onchange={load}>
		<option value="new">Novi (za pregled)</option>
		<option value="">Svi</option>
		<option value="applied">Primijenjeni</option>
		<option value="rejected">Odbijeni</option>
	</select>
	<button onclick={load}>↻ Osvježi</button>
	<button
		title="Zaboravi token"
		onclick={() => {
			sessionStorage.removeItem('sb_review_token');
			load();
		}}>⨯</button
	>
</header>

<div id="wrap">
	{#if !items.length}
		<p class="empty">{message}</p>
	{:else}
		{#each items as it, i (it.id)}
			<div class="card">
				<div class="map" bind:this={mapDivs[i]}></div>
				<div class="body">
					<h2>
						<span class="badge {it.type === 'new' ? 'b-new' : 'b-move'}"
							>{it.type === 'new' ? 'NOVO' : 'POMAK'}</span
						>
						{it.name || '(bez imena)'}
						<span class="badge s-{it.status}">{it.status}</span>
					</h2>
					<div class="meta">
						{#if it.stop_id}ID: <code>{it.stop_id}</code><br />{/if}
						{#if it.line}Linija: <code>{it.line}</code><br />{/if}
						{#if it.old}Staro: <code>{it.old.lat.toFixed(6)}, {it.old.lon.toFixed(6)}</code><br />{/if}
						Novo: <code>{it.new.lat.toFixed(6)}, {it.new.lon.toFixed(6)}</code>{#if it.accuracy_m != null}
							· ±{Math.round(it.accuracy_m)} m{/if}<br />
						{#if it.note}Napomena: {it.note}<br />{/if}
						<span style="color:#999">{fmtTs(it.server_ts)}</span>
					</div>
					<div class="row">
						<button class="copy" onclick={(e) => copyRow(it, e)}>⎘ stops.txt redak</button>
						<button class="ok" onclick={() => patch(it.id, 'applied')}>✓ Primijenjeno</button>
						<button class="no" onclick={() => patch(it.id, 'rejected')}>✕ Odbij</button>
					</div>
				</div>
			</div>
		{/each}
	{/if}
</div>

<style>
	:global(body) {
		margin: 0;
		font-family: system-ui, sans-serif;
		background: #f4f5f7;
		color: #222;
		overflow: auto;
	}
	header {
		position: sticky;
		top: 0;
		background: #1f4e79;
		color: #fff;
		padding: 10px 16px;
		display: flex;
		gap: 10px;
		align-items: center;
		flex-wrap: wrap;
		z-index: 10;
	}
	header h1 {
		font-size: 16px;
		margin: 0;
		flex: 1;
	}
	header select,
	header button {
		font-size: 13px;
		padding: 6px 8px;
		border-radius: 5px;
		border: none;
	}
	header button {
		background: #ffd24a;
		cursor: pointer;
		font-weight: 600;
	}
	#wrap {
		max-width: 860px;
		margin: 16px auto;
		padding: 0 12px;
	}
	.card {
		background: #fff;
		border-radius: 8px;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
		margin-bottom: 14px;
		overflow: hidden;
		display: grid;
		grid-template-columns: 240px 1fr;
	}
	.card .map {
		height: 180px;
	}
	.card .body {
		padding: 12px 14px;
	}
	.card h2 {
		font-size: 15px;
		margin: 0 0 4px;
	}
	.badge {
		display: inline-block;
		font-size: 11px;
		font-weight: 700;
		padding: 1px 7px;
		border-radius: 4px;
		color: #fff;
		vertical-align: middle;
	}
	.b-new {
		background: #198754;
	}
	.b-move {
		background: #fd7e14;
	}
	.s-new {
		background: #0d6efd;
	}
	.s-applied {
		background: #198754;
	}
	.s-rejected {
		background: #999;
	}
	.meta {
		font-size: 12px;
		color: #666;
		line-height: 1.5;
		margin: 6px 0;
	}
	.meta code {
		background: #f0f0f0;
		padding: 1px 4px;
		border-radius: 3px;
	}
	.row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		margin-top: 8px;
	}
	.row button {
		font-size: 13px;
		padding: 7px 12px;
		border: 1px solid #ccc;
		border-radius: 6px;
		background: #fff;
		cursor: pointer;
	}
	.row .ok {
		border-color: #198754;
		color: #198754;
	}
	.row .no {
		border-color: #c00;
		color: #c00;
	}
	.empty {
		text-align: center;
		color: #777;
		padding: 40px;
	}
	@media (max-width: 620px) {
		.card {
			grid-template-columns: 1fr;
		}
		.card .map {
			height: 200px;
		}
	}
</style>

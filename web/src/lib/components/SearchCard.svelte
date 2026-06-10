<script>
	import {
		endpoints,
		pinMode,
		scheduleState,
		surface,
		plTimeMode,
		plDate,
		plTime,
		plSearch,
		plResults
	} from '$lib/stores.js';
	import { geocode, streetSuggestions } from '$lib/geo.js';
	import { pad2, ymdToInput, inputToYmd } from '$lib/util.js';

	let { mc } = $props();

	let fromText = $state('');
	let toText = $state('');
	let dateMin = $state('');
	let dateMax = $state('');

	// Reflect controller-set endpoint labels (map pin / GPS / drag) into inputs.
	$effect(() => {
		fromText = $endpoints.from.label;
	});
	$effect(() => {
		toText = $endpoints.to.label;
	});

	// Init date/time within the feed window once the schedule loads.
	$effect(() => {
		if ($scheduleState !== 'ready' || $plDate) return;
		const now = new Date();
		const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
		const win = mc.feedWindow();
		const todayYmd = today.replaceAll('-', '');
		let def = today;
		if (win.min && todayYmd < win.min) def = ymdToInput(win.min);
		else if (win.max && todayYmd > win.max) def = ymdToInput(win.max);
		plDate.set(def);
		plTime.set(`${pad2(now.getHours())}:${pad2(now.getMinutes())}`);
		if (win.min) dateMin = ymdToInput(win.min);
		if (win.max) dateMax = ymdToInput(win.max);
	});

	function infoFor(which) {
		const s = $plSearch[which];
		if (s && s.status) return { status: s.status };
		if (s && s.suggestions) return { suggestions: s.suggestions, label: s.label };
		return { text: $endpoints[which].info };
	}
	const setSearch = (which, val) => plSearch.update((s) => ({ ...s, [which]: val }));

	async function runSearch(which) {
		const q = (which === 'from' ? fromText : toText).trim();
		if (!q) return;
		setSearch(which, { status: 'tražim adresu…' });
		try {
			const hits = await geocode(q);
			if (!hits.length) {
				setSearch(which, { status: 'tražim slične nazive…' });
				const sugg = await streetSuggestions(q);
				if (sugg.length)
					setSearch(which, {
						label: 'Jeste li mislili:',
						suggestions: sugg.map((name) => ({ label: name, kind: 'name' }))
					});
				else
					setSearch(which, {
						status: 'ništa nije nađeno — provjeri naziv ulice ili klikni 📌 na karti'
					});
				return;
			}
			if (hits.length === 1) return choose(which, hits[0]);
			setSearch(which, { suggestions: hits.map((h) => ({ label: h.label, kind: 'geo', hit: h })) });
		} catch {
			setSearch(which, { status: 'greška pri traženju adrese' });
		}
	}
	function choose(which, hit) {
		setSearch(which, null);
		mc.setEndpoint(which, { lat: hit.lat, lon: hit.lon }, hit.label, true);
	}
	function pickSuggestion(which, s) {
		if (s.kind === 'geo') return choose(which, s.hit);
		if (which === 'from') fromText = s.label;
		else toText = s.label;
		setSearch(which, null);
		runSearch(which);
	}

	function setTimeMode(m) {
		plTimeMode.set(m);
		if (m === 'now') runPlanner();
	}

	function runPlanner() {
		if (!$endpoints.from.pt || !$endpoints.to.pt) {
			plResults.set({
				itins: [],
				selectedIdx: 0,
				msg: 'Odaberi polazak i odredište — upiši adresu, klikni 📌 i točku na karti, ili 📍 GPS.'
			});
			mc.clearHighlight();
			return;
		}
		if ($plTimeMode === 'now') {
			const now = new Date();
			plTime.set(`${pad2(now.getHours())}:${pad2(now.getMinutes())}`);
		}
		const ymd = inputToYmd($plDate);
		const [hh, mm] = $plTime.split(':').map(Number);
		const sec = hh * 3600 + mm * 60;
		const out = mc.plan($plTimeMode, sec, ymd, 3);
		if (out.length) {
			plResults.set({ itins: out, selectedIdx: 0, msg: '' });
			mc.highlightItin(out[0]);
			surface('planer');
		} else {
			plResults.set({
				itins: [],
				selectedIdx: 0,
				msg:
					$plTimeMode === 'arrive'
						? 'Nema vožnje koja stiže do tog vremena.'
						: 'Nema pronađene vožnje za to vrijeme.'
			});
			mc.clearHighlight();
		}
	}

	// Hidden gesture: 3 quick presses while empty reveals the mode switcher.
	let goTaps = 0;
	let goTimer = null;
	function onGo() {
		runPlanner();
		if (!$endpoints.from.pt || !$endpoints.to.pt) {
			goTaps++;
			clearTimeout(goTimer);
			goTimer = setTimeout(() => (goTaps = 0), 700);
			if (goTaps >= 3) {
				goTaps = 0;
				mc.revealModes();
			}
		} else goTaps = 0;
	}
</script>

<div class="gm-card">
	<div class="gm-trip">
		<div class="gm-rail" aria-hidden="true">
			<span class="gm-dot from"></span>
			<span class="gm-trunk"></span>
			<span class="gm-dot to"></span>
		</div>
		<div class="gm-inputs">
			{#each ['from', 'to'] as which (which)}
				<div class="gm-input-row">
					<input
						type="text"
						autocomplete="off"
						placeholder={which === 'from'
							? 'Polazak — adresa ili klik na kartu'
							: 'Odredište — adresa ili klik na kartu'}
						value={which === 'from' ? fromText : toText}
						oninput={(e) =>
							which === 'from' ? (fromText = e.currentTarget.value) : (toText = e.currentTarget.value)}
						onkeydown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								runSearch(which);
							}
						}}
					/>
					<div class="gm-mini">
						<button title="Traži adresu" aria-label="Traži" onclick={() => runSearch(which)}>🔍</button>
						<button
							title="Klikni točku na karti"
							aria-label="Karta"
							class:toggled={$pinMode === which}
							onclick={() => mc.setPinMode(which)}>📌</button
						>
						{#if which === 'from'}
							<button title="Moja lokacija" aria-label="GPS" onclick={() => mc.endpointGps('from')}>📍</button>
						{/if}
					</div>
				</div>
			{/each}
		</div>
		<button
			class="gm-swap"
			title="Zamijeni polazak i odredište"
			aria-label="Zamijeni"
			onclick={() => mc.swapEndpoints()}>⇅</button
		>
	</div>

	{#each ['from', 'to'] as which (which)}
		{@const inf = infoFor(which)}
		<div class="muted gm-info">
			{#if inf.status}{inf.status}
			{:else if inf.suggestions}
				{#if inf.label}<div class="muted" style="margin:0 0 4px">{inf.label}</div>{/if}
				<div class="geo-picker">
					{#each inf.suggestions as s}
						<button type="button" class="geo-opt" onclick={() => pickSuggestion(which, s)}>{s.label}</button>
					{/each}
				</div>
			{:else if inf.text}{inf.text}{/if}
		</div>
	{/each}

	<div class="gm-seg" role="tablist" aria-label="Vrijeme">
		{#each [['now', 'Sada'], ['depart', 'Polazak u'], ['arrive', 'Dolazak do']] as [k, label]}
			<button
				type="button"
				role="tab"
				class:active={$plTimeMode === k}
				aria-selected={$plTimeMode === k}
				onclick={() => setTimeMode(k)}>{label}</button
			>
		{/each}
	</div>
	{#if $plTimeMode !== 'now'}
		<div class="row gm-when">
			<input type="date" bind:value={$plDate} min={dateMin} max={dateMax} />
			<input type="time" bind:value={$plTime} />
		</div>
	{/if}
	<button class="gm-go" type="button" onclick={onGo}>Pronađi vožnju</button>
</div>

<script>
	import { traceRoutes, traceVariant } from '$lib/stores.js';

	let { mc } = $props();

	let routeKey = $state('');
	let copyDest = $state('');
	let tracing = $state(false);

	$effect(() => {
		if ($traceRoutes.length && !routeKey) {
			routeKey = $traceRoutes[0].key;
			copyDest = $traceRoutes[0].key;
			mc?.setTraceRoute(routeKey);
		}
	});

	function changeRoute() {
		mc.setTraceRoute(routeKey);
	}
	function toggleDraw() {
		tracing = mc.setTracing(!tracing);
	}
	function loadCurrent() {
		if (!tracing) tracing = mc.setTracing(true);
		const n = mc.loadCurrentTrace();
		if (n) tracing = mc.setTracing(true); // re-render vertices
	}
</script>

<details class="sec" open>
	<summary><h3>Crtanje rute (shapes)</h3></summary>
	<div class="row">
		<select style="flex:1" bind:value={routeKey} onchange={changeRoute}>
			{#each $traceRoutes as r (r.key)}<option value={r.key}>{r.label}</option>{/each}
		</select>
	</div>
	<div class="row">
		<button class:toggled={tracing} onclick={toggleDraw}>{tracing ? '✓ Završi crtanje' : '✎ Crtaj rutu'}</button>
		<button onclick={() => mc.traceUndo()}>↶ Poništi</button>
	</div>
	<div class="row">
		<button onclick={loadCurrent}>⤓ Učitaj trenutnu rutu</button>
	</div>
	<div class="row">
		<button onclick={() => mc.deleteCurrentVariant()}>Obriši</button>
		<button onclick={() => mc.exportShapes()}>Izvezi shapes.txt</button>
	</div>
	<div class="row">
		<button
			onclick={() => {
				const n = mc.clearVariants();
				alert(n ? `Obrisano ${n} varijanti (isprekidane linije).` : 'Nema varijanti.');
			}}>🗑 Obriši sve varijante (isprekidane linije)</button
		>
	</div>
	<div class="row">
		<select style="flex:1" bind:value={copyDest}>
			{#each $traceRoutes as r (r.key)}<option value={r.key}>{r.label}</option>{/each}
		</select>
		<button onclick={() => mc.copyTrace(routeKey, copyDest)}>Kopiraj put u</button>
	</div>
	{#if $traceVariant.show}
		<div class="row">
			<button onclick={() => mc.variantStep(-1)}>◀</button>
			<span style="flex:1;text-align:center;font-size:12px">{$traceVariant.label}</span>
			<button onclick={() => mc.variantStep(1)}>▶</button>
			<button title="Obriši ovu varijantu" onclick={() => mc.deleteCurrentVariant()}>✕</button>
		</div>
	{/if}
	<small
		>Odaberi liniju → <b>Učitaj trenutnu rutu</b> (uređuj postojeću) ili <b>Crtaj</b> od nule.<br />
		• <b>Povuci</b> bijelu točku = pomakni ju na pravu cestu.<br />
		• <b>Desni klik</b> na točku = obriši.<br />
		• Povuci <b>sivu</b> (na sredini segmenta) = umetni novu točku.<br />
		• Klik na kartu = doda točku (produžuje liniju — više NE stvara varijante).<br />
		• Žuta = odabrana točka. Za varijante koristi „Kopiraj put u".<br />
		Kad završiš → <b>Izvezi shapes.txt</b> i pošalji mi.</small
	>
</details>

<script>
	import { scheduleState, plResults, endpoints } from '$lib/stores.js';
	import ItinCard from './ItinCard.svelte';

	let { mc } = $props();

	function selectItin(it) {
		plResults.update((r) => ({ ...r, selectedIdx: r.itins.indexOf(it) }));
		mc.highlightItin(it);
	}
</script>

<div id="pl-results" class="gm-results" role="region" aria-live="polite" aria-label="Rezultati pretrage">
	{#if $scheduleState === 'loading'}
		<p class="muted">Učitavam vozni red…</p>
	{:else if $scheduleState === 'error'}
		<p class="muted">Vozni red se nije učitao.</p>
	{:else if $plResults.itins.length}
		{#each $plResults.itins as it, i (i)}
			<ItinCard
				{it}
				{mc}
				selected={i === $plResults.selectedIdx}
				fromLabel={$endpoints.from.label}
				toLabel={$endpoints.to.label}
				onselect={selectItin}
			/>
		{/each}
	{:else if $plResults.msg}
		<p class="muted">{$plResults.msg}</p>
	{/if}
</div>

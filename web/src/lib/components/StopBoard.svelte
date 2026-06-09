<script>
	import { board } from '$lib/stores.js';

	let { mc } = $props();
</script>

<div id="stop-board" class="gm-board" role="region" aria-label="Polasci sa stajališta" hidden={!$board}>
	{#if $board}
		<div class="board-head">
			<b>{$board.loading ? 'Učitavam vozni red…' : $board.name}</b>
			<button class="board-close" aria-label="Zatvori" onclick={() => mc?.closeBoard()}>✕</button>
		</div>
		{#if !$board.loading}
			<div class="board-sub">Sljedeći polasci{$board.wholeDay ? ' (cijeli dan)' : ''}</div>
			<div class="board-rows">
				{#if $board.rows.length}
					{#each $board.rows as r}
						<div class="board-row">
							<span class="when">{r.time}</span>
							<span class="badge" style="background:{r.color}">{r.shortName}</span>
							<span class="dest">{r.headsign}</span>
						</div>
					{/each}
				{:else}
					<p class="muted">Nema polazaka za taj dan.</p>
				{/if}
			</div>
		{/if}
	{/if}
</div>

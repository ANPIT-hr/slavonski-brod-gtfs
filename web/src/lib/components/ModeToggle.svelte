<script>
	import { mode, modesRevealed } from '$lib/stores.js';

	let { mc } = $props();

	function set(m) {
		mode.set(m);
		localStorage.setItem('sb_mode', m);
		mc?.applyMode(m);
	}
</script>

{#if $modesRevealed}
	<div id="mode-toggle" role="tablist" aria-label="Način rada">
		<button type="button" class:active={$mode === 'prod'} onclick={() => set('prod')}>Produkcija</button>
		<button type="button" class:active={$mode === 'dev'} onclick={() => set('dev')}>Razvoj</button>
	</div>
{/if}

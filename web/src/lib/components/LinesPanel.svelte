<script>
	import { lines, lineVisibility } from '$lib/stores.js';

	let { mc } = $props();
</script>

<details class="sec" open id="lines-sec">
	<summary><h3>Linije na karti</h3></summary>
	<div class="ctl">
		<button type="button" onclick={() => mc?.setAllLines(true)}>Sve</button>
		<button type="button" onclick={() => mc?.setAllLines(false)}>Nijedna</button>
	</div>
	<div id="lines">
		{#each $lines as l (l.key)}
			<label class="line">
				<input
					type="checkbox"
					checked={$lineVisibility[l.key] ?? false}
					onchange={(e) => mc?.setLineVisible(l.key, e.currentTarget.checked)}
				/>
				<span class="swatch" style="background:{l.color}"></span>
				<span class="name"><b>{l.shortName}</b>{l.dirText}<small>{l.longName}</small></span>
			</label>
		{/each}
	</div>
</details>

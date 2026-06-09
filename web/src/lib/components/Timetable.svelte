<script>
	import { lines, scheduleState } from '$lib/stores.js';
	import { pad2, ymdToInput, inputToYmd } from '$lib/util.js';

	let { mc } = $props();

	let lineKey = $state('');
	let dateVal = $state('');
	let dateMin = $state('');
	let dateMax = $state('');

	$effect(() => {
		if ($lines.length && !lineKey) lineKey = $lines[0].key;
	});
	$effect(() => {
		if ($scheduleState !== 'ready' || dateVal) return;
		const now = new Date();
		const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
		const win = mc.feedWindow();
		const todayYmd = today.replaceAll('-', '');
		let def = today;
		if (win.min && todayYmd < win.min) def = ymdToInput(win.min);
		else if (win.max && todayYmd > win.max) def = ymdToInput(win.max);
		dateVal = def;
		if (win.min) dateMin = ymdToInput(win.min);
		if (win.max) dateMax = ymdToInput(win.max);
	});

	const tt = $derived(
		$scheduleState === 'ready' && lineKey && dateVal && mc.planner
			? mc.planner.timetable(lineKey, inputToYmd(dateVal))
			: null
	);
</script>

<details class="sec gm-extra" id="tt-sec">
	<summary><h3>Vozni red linije</h3></summary>
	<label class="field"
		>Linija
		<select bind:value={lineKey}>
			{#each $lines as l (l.key)}
				<option value={l.key}>{l.shortName}{l.dirText}</option>
			{/each}
		</select>
	</label>
	<label class="field"
		>Dan
		<input type="date" bind:value={dateVal} min={dateMin} max={dateMax} />
	</label>
	<div id="tt-results">
		{#if !lineKey}
			<!-- nothing selected -->
		{:else if !tt}
			<p class="muted">Nema polazaka za taj dan.</p>
		{:else}
			<div class="tt-wrap">
				<table class="tt-table">
					<thead>
						<tr>
							<th>Stanica</th>
							{#each tt.cols as _, i}<th>{i + 1}</th>{/each}
						</tr>
					</thead>
					<tbody>
						{#each tt.rows as name, ri}
							<tr>
								<td>{name}</td>
								{#each tt.cols as c}<td>{c[ri]}</td>{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</details>

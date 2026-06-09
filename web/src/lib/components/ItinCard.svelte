<script>
	import { fmtT } from '$lib/util.js';

	let { it, mc, selected, fromLabel, toLabel, onselect } = $props();

	const stopsLabel = (n) => `${n} ${n === 1 ? 'stajalište' : 'stajališta'}`;

	// Build the summary + step timeline from the itinerary's display legs.
	const view = $derived.by(() => {
		const planner = mc.planner;
		const legs = planner.displayLegs(it);
		const rides = legs.filter((l) => l.kind === 'ride');
		const arrT = legs[legs.length - 1].arr;
		const dur = Math.round((arrT - legs[0].dep) / 60);
		const walkMin = Math.round(
			legs.filter((l) => l.kind === 'walk').reduce((s, l) => s + (l.arr - l.dep), 0) / 60
		);
		const transfers = Math.max(0, rides.length - 1);

		const pills = legs
			.filter((l) => l.kind === 'ride' || (l.kind === 'walk' && !l.origin && !l.dest))
			.map((l) =>
				l.kind === 'ride'
					? { type: 'badge', color: mc.routeMeta(l.rid).color, label: mc.routeMeta(l.rid).short_name }
					: { type: 'walk' }
			);

		const steps = [];
		steps.push({ type: 'node', color: '#198754', time: fmtT(legs[0].dep), title: 'Polazak', note: fromLabel || '' });
		legs.forEach((l, i) => {
			if (l.kind === 'walk') {
				const min = Math.max(1, Math.round((l.arr - l.dep) / 60));
				const text = l.origin
					? `Hodaj ${min} min do stajališta`
					: l.dest
						? `Hodaj ${min} min do cilja`
						: `Presjedanje — hodaj ${min} min`;
				steps.push({ type: 'walk', leg: i, text });
			} else {
				const m = mc.routeMeta(l.rid);
				const rm = planner.rideStops(l);
				steps.push({ type: 'node', color: m.color, time: fmtT(l.dep), title: mc.stopName(l.from) });
				steps.push({
					type: 'ride',
					leg: i,
					color: m.color,
					short: m.short_name,
					headsign: rm.headsign,
					count: rm.count,
					between: rm.between
				});
				steps.push({ type: 'node', color: m.color, time: fmtT(l.arr), title: mc.stopName(l.to) });
			}
		});
		steps.push({ type: 'node', color: '#c0392b', time: fmtT(arrT), title: 'Cilj', note: toLabel || '' });

		return { legs, pills, steps, transfers, walkMin, dur, dep: fmtT(legs[0].dep), arr: fmtT(arrT) };
	});

	let expanded = $state(new Set());
	function toggleInter(i) {
		const s = new Set(expanded);
		s.has(i) ? s.delete(i) : s.add(i);
		expanded = s;
	}
	const select = () => onselect(it);
	const panLeg = (i) => mc.panToLeg(view.legs[i]);
</script>

<div class="itin" class:sel={selected} class:open={selected}>
	<div
		class="itin-head"
		role="button"
		tabindex="0"
		onclick={select}
		onkeydown={(e) => e.key === 'Enter' && select()}
	>
		<span class="times">{view.dep} – {view.arr}</span>
		<span class="dur">{view.dur} min</span>
	</div>

	<div
		class="itin-sub"
		role="button"
		tabindex="0"
		onclick={select}
		onkeydown={(e) => e.key === 'Enter' && select()}
	>
		{#if view.pills.length}
			{#each view.pills as p, i}
				{#if i > 0}<span class="itin-arrow">›</span>{/if}
				{#if p.type === 'badge'}
					<span class="badge" style="background:{p.color}">{p.label}</span>
				{:else}
					<span class="itin-walk">🚶</span>
				{/if}
			{/each}
		{:else}
			<span class="itin-walk">🚶</span>
		{/if}
		<span class="itin-chip"
			>· {view.transfers} presj.{view.walkMin ? ` · ${view.walkMin} min hoda` : ''}</span
		>
	</div>

	<div class="itin-steps">
		{#each view.steps as st}
			{#if st.type === 'node'}
				<div class="step node" style="color:{st.color}">
					<div class="step-gutter"><span class="dot"></span></div>
					<div class="step-body">
						<span class="when">{st.time}</span>{st.title}
						{#if st.note}<div class="step-note">{st.note}</div>{/if}
					</div>
				</div>
			{:else if st.type === 'walk'}
				<div
					class="step conn walk"
					style="color:#9aa0a6"
					role="button"
					tabindex="0"
					onclick={() => panLeg(st.leg)}
					onkeydown={(e) => e.key === 'Enter' && panLeg(st.leg)}
				>
					<div class="step-gutter"></div>
					<div class="step-body">🚶 {st.text}</div>
				</div>
			{:else}
				<div
					class="step conn ride"
					style="color:{st.color}"
					role="button"
					tabindex="0"
					onclick={(e) => !e.target.closest('.step-more') && panLeg(st.leg)}
					onkeydown={(e) => e.key === 'Enter' && panLeg(st.leg)}
				>
					<div class="step-gutter"></div>
					<div class="step-body">
						<span class="badge" style="background:{st.color}">{st.short}</span>{st.headsign
							? ` prema ${st.headsign}`
							: ''}
						<div class="step-note">
							{#if st.between.length}
								<span
									class="step-more"
									role="button"
									tabindex="0"
									onclick={() => toggleInter(st.leg)}
									onkeydown={(e) => e.key === 'Enter' && toggleInter(st.leg)}
									>{stopsLabel(st.count)} ⌄</span
								>
								<div class="step-inter" class:open={expanded.has(st.leg)}>
									{st.between.join(' · ')}
								</div>
							{:else}
								{stopsLabel(st.count)}
							{/if}
						</div>
					</div>
				</div>
			{/if}
		{/each}
	</div>
</div>

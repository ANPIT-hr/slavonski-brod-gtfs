<script>
	let { mc } = $props();
	let editing = $state(false);

	function toggle() {
		editing = mc.setStopEdit(!editing);
	}
</script>

<details class="sec" open>
	<summary><h3>Stajališta</h3></summary>
	<div class="row">
		<button class:toggled={editing} onclick={toggle}
			>{editing ? '✓ Završi uređivanje' : '✎ Uredi stajališta'}</button
		>
	</div>
	<div class="row">
		<button onclick={() => mc.exportStops()}>Izvezi stops.txt</button>
		<button onclick={() => mc.resetStops()}>Resetiraj sve</button>
	</div>
	<small
		>Klikni <b>Uredi stajališta</b>, povuci stajališta na pravo mjesto. <b>Izvezi</b> generira novi
		stops.txt — spremi u gtfs/ pa pokreni build_map.py. Prikazuju se stajališta odabrane linije
		(gore u „Crtanje rute").</small
	>
</details>

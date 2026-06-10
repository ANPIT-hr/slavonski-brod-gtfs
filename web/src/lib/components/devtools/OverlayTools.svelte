<script>
	let { mc } = $props();

	let on = $state(true);
	let opacity = $state(0.6);
	let editing = $state(false);

	// Reflect keyboard 1–5 opacity changes from the controller back into the slider.
	$effect(() => {
		if (mc) mc._onOpacity = (v) => (opacity = v);
	});

	function toggleVisible(e) {
		on = e.currentTarget.checked;
		mc.setOverlayVisible(on);
		if (!on) editing = false;
	}
	function setOpacity(e) {
		opacity = mc.setOverlayOpacity(parseFloat(e.currentTarget.value));
	}
	function toggleEdit() {
		editing = mc.setOverlayEdit(!editing);
	}
</script>

<details class="sec" open>
	<summary><h3>Podloga (PDF karta)</h3></summary>
	<label class="row"><input type="checkbox" checked={on} onchange={toggleVisible} /> Prikaži podlogu</label>
	<label class="row"
		>Prozirnost
		<input type="range" min="0" max="1" step="0.05" value={opacity} oninput={setOpacity} />
		<span>{Math.round(opacity * 100)}%</span></label
	>
	<small style="margin:-2px 0 4px">Tipke 1–5 = 0/25/50/75/100 %</small>
	<div class="row">
		<button class:toggled={editing} onclick={toggleEdit}
			>{editing ? '✓ Završi uređivanje' : '✎ Uredi podlogu'}</button
		>
		<button onclick={() => mc.saveOverlay()}>Spremi položaj</button>
	</div>
	<div class="row">
		<button onclick={() => mc.resetOverlay()}>Resetiraj</button>
		<button onclick={() => mc.exportOverlay()}>Izvezi granice</button>
	</div>
	<small
		>Klikni <b>Uredi podlogu</b> pa povuci ručke: sredina = pomak, kutovi = veličina. Desni klik na
		karti = koordinate.</small
	>
</details>

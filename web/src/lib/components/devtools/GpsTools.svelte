<script>
	import { geoStatus } from '$lib/stores.js';

	let { mc } = $props();
	let active = $state(false);

	function toggle() {
		if (mc.geoActive) {
			mc.stopGeo();
			active = false;
		} else {
			mc.startGeo();
			active = true;
		}
	}
</script>

<details class="sec" open>
	<summary><h3>Moja lokacija (GPS)</h3></summary>
	<div class="row">
		<button class:toggled={active} onclick={toggle}>{active ? '■ Zaustavi GPS' : '📍 Moja lokacija'}</button>
		<span style="color:#666">{$geoStatus}</span>
	</div>
	<small
		>Prati tvoju poziciju na karti. Za upis stajališta na terenu: uđi u <b>Uredi stajališta</b>,
		klikni stajalište, pa <b>📍 Postavi na GPS lokaciju</b>. Treba HTTPS ili lokalni server; ne radi
		s file://.</small
	>
</details>

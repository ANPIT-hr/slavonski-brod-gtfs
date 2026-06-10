// Shared reactive state, written by the MapController and read by UI components.
import { writable } from 'svelte/store';

export const mode = writable('prod'); // 'prod' | 'dev'
export const modesRevealed = writable(false); // mode switcher hidden until unlocked
export const scheduleState = writable('idle'); // idle | loading | ready | error

// Line list + visibility (lines start hidden so the map opens clean).
export const lines = writable([]); // [{ key, color, shortName, longName, dirText }]
export const lineVisibility = writable({}); // key -> bool

// Planner endpoints (A/B). pt is { lat, lon } or null.
export const endpoints = writable({
	from: { pt: null, label: '', info: '' },
	to: { pt: null, label: '', info: '' }
});
export const pinMode = writable(null); // 'from' | 'to' | null

// Departure board (tap a stop in Production). null when hidden.
export const board = writable(null); // { name, rows, wholeDay }

// Dev GPS status line.
export const geoStatus = writable('');

// Dev: route-tracing state for the ShapeTracer panel.
export const traceRoutes = writable([]); // [{ key, label }] (label gets a ✓ when traced)
export const traceVariant = writable({ show: false, label: '', index: 0, count: 1 });

// Mobile sheet coordination: bump to request the bottom sheet reveal a tab
// ('planer' | 'voznired' | 'linije'). { tab, n } — n forces reactions to re-fire.
export const surfaceTab = writable({ tab: null, n: 0 });
export function surface(tab) {
	surfaceTab.update((s) => ({ tab, n: s.n + 1 }));
}

// Trip-planner form + results, shared by SearchCard and PlannerResults (the
// card is relocated into #m-topbar on mobile, so the two live in different
// DOM subtrees and must share state through stores).
export const plTimeMode = writable('now'); // now | depart | arrive
export const plDate = writable('');
export const plTime = writable('');
export const plSearch = writable({ from: null, to: null }); // per-side status/suggestions
export const plResults = writable({
	itins: [],
	selectedIdx: 0,
	msg: 'Upiši polazak i odredište — adresu, 📌 točku na karti ili 📍 GPS — pa odaberi vrijeme i pritisni Pronađi vožnju. Možeš i kliknuti stajalište na karti za polaske.'
});

# Tunnels

A 2–4 player first-person co-op horror game for the browser: the hometown crew of Xterminator's ("Bugs worst nightmare") carries a moving camp of light through an alien nest that digs, learns and waits in the dark. Design: `docs/GDD.md`.

**Play in the browser:** https://beckambarnett-lab.github.io/tunnels/ (published from `main` by `.github/workflows/pages.yml`).

Or run it locally:

```bash
npm install
npm run dev
```

Open http://localhost:5173 and pick *Play solo*, *Host* or *Join*.

| URL flag | Effect |
| --- | --- |
| `?night` | the full night (what the title screen starts) |
| `?seed=N` | the prototype nest from milestones 1–4, with seed N |
| `?bench` | benchmark hall with 500 bugs (`&bugs=1000` for more) |
| `?host=CODE&net=local` / `?join=CODE&net=local` | two tabs on one machine |
| `?act=N` | director act for the prototype nest |
| `?load` / `?night&load=checkpoint` | continue from a save / checkpoint |

Debug: the overlay (top left) and panel (top right, toggle with `` ` ``): flow-field / light / visibility / influence views (V), top-down camera (T), god mode (G), bug slider, breach switch, force a queen intent.

## Checks
- `npm test`: simulation tests in Node (swarm, digging, light, camp, queen, learning, director, sync, death, night).
- `npm run typecheck`
- Browser gates (need the dev server, or a frozen build: `npx vite build --outDir dist-gate && npx vite preview --outDir dist-gate --port 4174` and `BASE=http://localhost:4174/`): `scripts/gate1.mjs` … `scripts/gate4.mjs`, `scripts/night.mjs`, `scripts/bench.mjs`.

## Docs
`docs/PLAN.md` (plan), `docs/PROGRESS.md` (status + gate results), `docs/QUESTIONS.md` (readings where the GDD was open), `docs/REVIEW.md` (morning report).

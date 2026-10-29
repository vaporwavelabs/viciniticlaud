# Viciniti — group ride app (PWA)

Hardware-style UI (Teenage-Engineering chrome) with motorcycle-cluster skins, Supabase backend, Protomaps offline map.

## Deploy
1. Upload this whole folder to Netlify (drag-and-drop) — it's static, no build step.
2. In Supabase (project `alpha`) → Authentication → URL Configuration: add your Netlify URL to **Site URL / Redirect URLs** (needed for magic links & email confirm).
3. (Optional) Put `san-diego.pmtiles` in the same folder and enter its URL in Settings → Offline map → Download.
4. On the phone: open the site in Safari → Share → Add to Home Screen.

## Screens
welcome · sign in · create account · home · create ride · lobby (codes, members, roles, start) · join · my rides · **in ride** (cluster + map + Roll Call / Riders / Stop / SOS + skin dial) · riders · roll call · emergency (SOS) · end-of-ride summary · profile (vehicle, emergency contact, medical notes) · settings (skins, units, offline map, wake lock, voice).

## Cluster skins (skins.js)
ENDURO BLUE · ENDURO RED · ENDURO PORTRAIT · MOTO LCD · RETRO 7-SEG.
The RPM band is repurposed as a speed band (numbers × 10 = mph); fuel/range → distance to meeting spot; speed-limit ring → distance to leader; gear box → riders in sync; temperature → heading; battery/signal → GPS & sync; clock stays.

## Backend wiring (app.js)
- Auth: email+password, magic link. Profile row auto-created by trigger; edited on Profile screen.
- Create ride → inserts `rides` + host row in `ride_members`. Join → `join_ride(p_code)` RPC (rider or spectator code).
- In ride: GPS `watchPosition` → `positions` upsert every 2 s; Realtime on `positions`, `ride_members`, `ride_events`, `rides`.
- Leader = ride host (or sub-host of your subgroup). Distance > `radius_ft` → `left_behind` event + status `at_risk` (`lost` at 4× radius); back inside → `rejoined`.
- Roll call / SOS / group stop go through `ride_events`. SOS shows the rider's emergency contact + medical notes to everyone.
- DEMO RIDE button on the welcome screen runs a fully simulated ride with no account.

## Pinned CDN libs (verify they exist, bump if not)
@supabase/supabase-js 2.45.4 (jsdelivr), maplibre-gl 4.7.1 + pmtiles 3.2.1 (unpkg), Google Fonts Orbitron / JetBrains Mono.

## Still to do
QR scan + Bluetooth/Meshtastic (native wrap), sub-group creation UI, route planning (OSRM) on the create screen, push notifications.

## Speedometer included
The standalone GPS speedometer lives in /speedometer/ (open it from the SPEEDOMETER key on the home screen,
or directly at /speedometer/). It has its own offline cache and can be added to the Home Screen as its own app.
A "‹ VICINITI" button in its top-left corner goes back.

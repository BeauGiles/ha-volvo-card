# Volvo Car Card — fork by RafalSzy

> **This is a fork of [ruudmens/ha-volvo-card](https://github.com/ruudmens/ha-volvo-card).**
> It is kept for a 2025 Volvo XC60 T6 PHEV and adds an optional layout that matches the
> Volvo Cars app. Everything else is identical to upstream, and the defaults are unchanged:
> without the new options the card behaves exactly like the original.
>
> <img src="assets/app-style-card.png" alt="Volvo Car Card with app-style header, controls, tiles and address row (Polish labels)" width="360">
>
> *2025 XC60 PHEV while charging: `header: app`, `controls: true`, `location_address`, with Polish labels. The address is a placeholder.*
>
> **What this fork adds**
>
> | option | what it does |
> |---|---|
> | `header: app` | Battery-first header like the Volvo Cars app. A hybrid always shows battery %, electric range and fuel range, **also while charging** (upstream hides the battery and shows total range + fuel % while charging). |
> | `entities.charging_time_left` | While charging, shows the remaining time on the right of the status line, e.g. `1 h 17 min left`. Point it at the integration's `estimated_charging_time` sensor. |
> | `labels.electric` / `fuel` / `fuel_level` / `time_left` | Makes the header lines translatable, like the existing status labels. |
> | `controls: true` | The Volvo Cars app controls under the car: lock/unlock, climate, remote start and a "…" menu (flash / honk). Also adds **Charge** ("Done at 19:58") and **Climate** tiles. Unlocking and remote start need a second tap to confirm. |
> | `entities.location_address` | An address row under the card like the app ("Ks. Budkiewicza 28A, Ząbki · Last parked today at 17:08"), from any sensor holding an address (+ optional `parked_since` attribute). |
> | `labels.minutes` + `locale` | Proper plural forms for the minutes left, e.g. Polish "1 minuta / 2 minuty / 50 minut". |
>
> Sections marked **"added in this fork"** below are not in the original repository; everything else is the original README.
>
> Full description: [App-style header](#app-style-header-optional--added-in-this-fork) and [Controls and tiles](#controls-and-tiles-optional--added-in-this-fork) and [Address row](#address-row-optional--added-in-this-fork) below.
>
> **Status:** the header and charging time are proposed upstream in [ruudmens/ha-volvo-card#8](https://github.com/ruudmens/ha-volvo-card/pull/8). The controls exist only in this fork for now.
> If it is merged, this fork is no longer needed. Switch back to the original repository in HACS.
>
> **Install:** HACS → Frontend → ⋮ → Custom repositories → `https://github.com/RafalSzy/ha-volvo-card`,
> category *Dashboard*. HACS then takes updates only from this fork, never from upstream.
>
> **Keeping up with upstream** (in a local clone):
> `git fetch upstream && git merge upstream/main && npm run build`, then commit and push to `main`.
> HACS will offer the update.


## Using [ha-volvo-au](https://github.com/seiken27/ha-volvo-au) instead of the official Volvo integration

Entity IDs are always config, never code (see [Card config](#card-config) below), so this card
already works with any integration that exposes the same kind of entities — `ha-volvo-au` included.
The only thing that differs is *which* entities you point it at, plus two behavior differences
worth knowing about:

- **Climate control is a switch, not two buttons.** The official Volvo integration exposes
  `start_climatisation`/`stop_climatisation` as momentary buttons, so the card has to guess and
  remember on/off state itself. `ha-volvo-au` exposes a real `switch.*_climatization` entity
  instead — point `entities.climatisation` at it (new in this fork) and the card reads and toggles
  its actual state, rather than guessing.
- **No image auto-fetch.** The official integration can hand back a signed render URL via
  `volvo.get_image_url` (see [The image backend](#the-image-backend-required-separately--not-part-of-the-hacs-install)
  below); `ha-volvo-au` has no equivalent service. Skip straight to the
  [static, manually-downloaded image](#alternative-a-fully-static-manually-downloaded-image)
  approach — grab a render from your Volvo account/app once and serve it from `config/www/`.
- **EV only, no remote engine start.** `ha-volvo-au` targets electric Volvos, so there's no
  `fuel_amount`/`distance_to_empty_tank` (omit them — the card infers a BEV UI) and no
  `start_engine`/`stop_engine`/`engine_status`.
- **No standalone `honk`.** Only `honk_flash` (honk + flash together) exists as a button; leave
  `honk` unset.

Entity names depend on your car's own suffix (`ha-volvo-au` names entities after the model and the
last 6 characters of the VIN, e.g. `sensor.xc40_abc123_battery`) — check **Developer Tools → States**
for your exact IDs. The mapping itself looks like this:

| card entity | `ha-volvo-au` entity |
|---|---|
| `battery` | `sensor.<car>_battery` |
| `distance_to_empty_battery` | `sensor.<car>_range` |
| `charging_connection_status` | `sensor.<car>_charger_connection` |
| `charging_status` | `sensor.<car>_charging_status` |
| `charging_time_left` | `sensor.<car>_time_to_full` |
| `lock` | `lock.<car>_lock` |
| `location` | `device_tracker.<car>_location` |
| `location_address` | `sensor.<car>_location_address` (reverse-geocoded by the integration itself — no template needed) |
| `climatisation` *(new)* | `switch.<car>_climatization` |
| `flash` | `button.<car>_flash` |
| `honk_flash` | `button.<car>_honk_flash` |
| `target_soc` *(new)* | `number.<car>_target_soc` |
| `charge_current_limit` *(new)* | `number.<car>_charge_current_limit` |

```yaml
type: custom:volvo-car-card
name: XC40
header: app
controls: true
entities:
  battery: sensor.xc40_abc123_battery
  distance_to_empty_battery: sensor.xc40_abc123_range
  charging_connection_status: sensor.xc40_abc123_charger_connection
  charging_status: sensor.xc40_abc123_charging_status
  charging_time_left: sensor.xc40_abc123_time_to_full
  lock: lock.xc40_abc123_lock
  location: device_tracker.xc40_abc123_location
  location_address: sensor.xc40_abc123_location_address
  climatisation: switch.xc40_abc123_climatization
  flash: button.xc40_abc123_flash
  honk_flash: button.xc40_abc123_honk_flash
  target_soc: number.xc40_abc123_target_soc
  charge_current_limit: number.xc40_abc123_charge_current_limit
images:
  fallback: /local/assets/volvo-xc40.png   # see "No image auto-fetch" above
```

A [Home Assistant](https://www.home-assistant.io/) Lovelace card for vehicles exposed by the
[Volvo integration](https://www.home-assistant.io/integrations/volvo/), styled after the layout of
the official Volvo app. Works with combustion, plug-in hybrid, and full-electric Volvos — the card
figures out which stats to show based on which entities you give it, so the same card works whether
you drive a gas XC60 or an electric EX30.

The car render is pulled automatically for your specific vehicle from your Volvo account (see
[The image backend](#the-image-backend-required-separately--not-part-of-the-hacs-install) below),
cropped the same way as in the app, alongside a headline range/battery stat, a secondary fuel/
electric stat, lock/charging status text, and (for PHEV/BEV) a charging pulse animation and
charge-cable overlay when plugged in.

## Screenshots

![All card states](assets/volvo-card-overview.jpg)

| | Light | Dark |
|---|---|---|
| Parked | ![Parked, light mode](assets/light-mode-parked.jpg) | ![Parked, dark mode](assets/dark-mode-parked.jpg) |
| Plugged in | ![Plugged in, light mode](assets/light-mode-plugged-in.jpg) | ![Plugged in, dark mode](assets/dark-mode-plugged-in.jpg) |
| Charging | ![Charging, light mode](assets/light-mode-charging.jpg) | ![Charging, dark mode](assets/dark-mode-charging.jpg) |

## Installation

There are two ways to install the card. Pick whichever you're more comfortable with — both end up
in the same place.

### Option 1: Add as a custom repository (recommended if you have HACS)

1. Open **HACS** in your Home Assistant sidebar, then go to the **Frontend** section.
2. Click the **⋮** menu (top right) → **Custom repositories**.
3. Paste in this repository's URL, set **Category** to `Dashboard`, then click **Add**.
4. Search for **Volvo Car Card** in HACS → Frontend, open it, and click **Download**.
5. Reload your browser tab (or restart Home Assistant) so the new card is picked up.

### Option 2: Add manually (no HACS needed)

1. Download `volvo-car-card.js` from this repository (**Code → Download ZIP**, then unzip, or grab
   the file directly from the [repo](.)).
2. Copy `volvo-car-card.js` into the `www` folder inside your Home Assistant `config` directory
   (create a `www` folder there if it doesn't exist yet — e.g. `config/www/volvo-car-card.js`).
3. In Home Assistant, go to **Settings → Dashboards**, click the **⋮** menu (top right) →
   **Resources**.
4. Click **Add Resource**, set the URL to `/local/volvo-car-card.js` and the type to
   **JavaScript Module**, then click **Create**.

### Add the card to a dashboard

Once installed (via either option above), edit any dashboard, click **Add Card**, choose
**Manual**, and paste in a config like the one below — or add it as `type: custom:volvo-car-card`
directly (see config below).

## Card config

Every entity is optional — **which entities you set determines the vehicle type**:

- Set `battery` + `distance_to_empty_battery` **and** `fuel_amount` + `distance_to_empty_tank` → **hybrid** UI (charging states, fuel + electric sub-stats).
- Set only the battery ones → **BEV** UI (charging states, no fuel line).
- Set only the fuel ones → **ICE** UI (no charging states, no pulse/cable, just range + fuel %).

```yaml
type: custom:volvo-car-card
name: XC90                      # optional label above the header
entities:
  battery: sensor.volvo_xc90_battery
  distance_to_empty_battery: sensor.volvo_xc90_distance_to_empty_battery
  distance_to_empty_tank: sensor.volvo_xc90_distance_to_empty_tank
  fuel_amount: sensor.volvo_xc90_fuel_amount
  fuel_tank_capacity_l: 50          # static number — no HA entity for this
  charging_connection_status: sensor.volvo_xc90_charging_connection_status
  charging_status: sensor.volvo_xc90_charging_status
  lock: lock.volvo_xc90_lock
  location: device_tracker.volvo_xc90_location
  start_climatisation: button.volvo_xc90_start_climatisation   # optional — adds a climate button to the tap dialog
  stop_climatisation: button.volvo_xc90_stop_climatisation      # optional — needed to turn climate back off
images:
  exterior_back: sensor.volvo_xc90_images        # entity whose `exterior_back` attribute holds a URL
  exterior_side_left: sensor.volvo_xc90_images    # entity whose `exterior_side_left` attribute holds a URL
  fallback: /local/assets/volvo-xc90.png          # shown if the attribute is empty
```

For an EV, just drop the `fuel_amount` / `distance_to_empty_tank` / `fuel_tank_capacity_l` keys.
For a gas-only car, drop the `battery` / `distance_to_empty_battery` /
`charging_connection_status` / `charging_status` keys.

Entity IDs are never hardcoded in the card — HA generates them per-vehicle/per-account, so they're
always config, not code. This also means the card works with more than one Volvo: add one card
instance per vehicle, each pointing at that vehicle's own entities.

Tapping the card opens a small dialog with a lock toggle (shown when `lock` is set) and a climate
toggle (shown when either `start_climatisation` or `stop_climatisation` is set — the Volvo
integration exposes these as momentary `button.*` entities, not a single on/off switch, so the card
tracks the on/off state itself and presses whichever button matches).

## Cable & pulse overlay (per-model tuning)

The charge cable image and the charging-pulse glow are both positioned as an overlay on top of the
car photo, but the charge port isn't in the same spot on every car's crop — so the same fixed
position doesn't line up for every model. The card handles this two ways, and you can use either or
both:

1. **Built-in model presets.** Set `model` to a known model name and the card applies a preset
   tuned for it:
   ```yaml
   type: custom:volvo-car-card
   model: v60
   entities:
     ...
   ```
   Presets live in [`src/overlays.ts`](src/overlays.ts). Right now that list is short (`v60`, plus
   the default the card was originally tuned against) — if you measure a model that isn't in there,
   a PR adding it helps the next person with the same car.
2. **Manual override.** Set any of the four `overlay` values yourself — this takes precedence over
   whatever the `model` preset (or the default) would otherwise use, so you can fix it immediately
   without waiting on a preset:
   ```yaml
   overlay:
     cable_bottom: 22px   # distance from the bottom of the card
     cable_width: 58%     # cable image width, as % of card width
     pulse_left: 60%      # pulse glow anchor, as % of card width
     pulse_top: 59%       # pulse glow anchor, as % of card height
   ```

To find the right values for your own car: open your dashboard's browser dev tools, select the
`.cable` and `.pulse-container` elements, and nudge their `bottom`/`width`/`left`/`top` in the
inspector until the cable lines up with the charge port and the pulse glow sits behind it. Whatever
values you land on are exactly what goes into `overlay` above.

## Translations

The card ships in English. There are only a handful of on-screen labels — the status text over the
car photo (`Unlocked`, `Locked`, `Scheduled`, `Charging`) and the action-dialog buttons (`Lock`,
`Unlock`, `Climate`) — so instead of bundling full locale files, you can override just the ones you
want via a `labels` block in the card config. Anything you don't set stays in English:

```yaml
type: custom:volvo-car-card
name: XC90
entities:
  ...
labels:
  unlocked: Ontgrendeld
  locked: Vergrendeld
  scheduled: Gepland
  charging: Opladen
  lock: Vergrendel
  unlock: Ontgrendel
  climate: Klimaat
  electric: elektrisch
  fuel: brandstof
  fuel_level: Brandstof
  time_left: resterend
```

## App-style header (optional) — added in this fork

By default the header is range-first, and while a hybrid is charging it swaps the electric line
for the fuel level. Set `header: app` to get the layout of the Volvo Cars app instead: battery %
on top, electric range and fuel range below — always, including while charging.

Add `charging_time_left` to show the remaining charging time on the right of the status line
while charging ("1 h 17 min left"). Point it at the integration's `estimated_charging_time`
sensor (minutes); a non-numeric sensor is shown as-is.

```yaml
type: custom:volvo-car-card
header: app
entities:
  ...
  charging_time_left: sensor.volvo_xc60_estimated_charging_time
labels:            # optional, all have English defaults
  electric: electric
  fuel: fuel
  fuel_level: Fuel
  time_left: left
```

Set `appHeaderStat: range` to swap which stat is the big number: total range on top, and a
bare percentage below it — no lightning icon, no "electric" wording. Only affects BEV/ICE in
`header: app`; hybrids keep the default (they still need the icon/wording to tell electric and
fuel range apart).

```yaml
type: custom:volvo-car-card
header: app
appHeaderStat: range
entities:
  ...
```

## Card background (optional) — added in this fork

Set `background` to any CSS `background` value (a color, gradient, etc.) to override the card's
background — e.g. to recreate the Volvo app's dark-blue tint. It's per card instance, so a
dashboard with more than one `volvo-car-card` (different vehicles, different integrations) can
style each one differently, or leave the rest on the dashboard theme's default:

```yaml
type: custom:volvo-car-card
background: '#141d27'
entities:
  ...
```

## Controls and tiles (optional) — added in this fork

`controls: true` adds the row of buttons from the Volvo Cars app under the car photo, plus two tiles:

- **Lock / unlock** (`lock`). Unlocking asks for a second tap within 4 seconds.
- **Climate** (`start_climatisation` / `stop_climatisation`, or `climatisation` for integrations
  that expose it as a single switch — see [Using ha-volvo-au](#using-ha-volvo-au-instead-of-the-official-volvo-integration)).
  The official integration has no climate-status entity, so without `climatisation` the card tracks
  on/off itself, the same way the existing tap dialog does; with `climatisation` it reads the
  switch's real state instead. Starting it (like unlock and remote start) asks for a second tap;
  turning it off doesn't.
- **Remote start** (`start_engine` / `stop_engine`, with state from `engine_status`). Starting asks for a
  second tap.
- **"…" menu** (`flash`, `honk`, `honk_flash`, `unlock_boot`, `air_purification`).
  `unlock_boot` works with either an integration's `lock.*` tailgate entity (calls
  `lock.unlock`) or a momentary `button.*` "unlock trunk" entity — whichever domain you
  point it at. `air_purification` is a `switch.*` toggle, read and toggled the same way
  as `climatisation`.
- **Charge tile**: "Done at 19:58" while charging (needs `charging_time_left`), otherwise
  "Plugged in" / "Unplugged". Tapping it opens sliders for `target_soc` /
  `charge_current_limit` when either is configured, otherwise the charging status history.
- **Climate tile**: running / not running. Tapping it toggles climate.

A button only appears when its entity is configured.

Tapping any of the header stats (battery/range, electric/fuel sub-line, the status text, the
charging-time-left text) opens that entity's own history/more-info dialog instead of the
lock/climate popup — only the car photo itself opens the popup.

```yaml
type: custom:volvo-car-card
header: app
controls: true
locale: pl               # plural forms and clock; defaults to the HA user language
entities:
  # ...existing entities...
  charging_time_left: sensor.volvo_xc60_estimated_charging_time
  start_engine: button.volvo_xc60_start_engine
  stop_engine: button.volvo_xc60_stop_engine
  engine_status: binary_sensor.volvo_xc60_engine_status
  flash: button.volvo_xc60_flash
  honk: button.volvo_xc60_honk
  honk_flash: button.volvo_xc60_honk_flash
  unlock_boot: lock.volvo_xc60_tailgate_lock              # or a button.* "unlock trunk" entity
  air_purification: switch.volvo_xc60_air_purification
  target_soc: number.volvo_xc60_target_soc               # slider, under the Charge tile
  charge_current_limit: number.volvo_xc60_charge_current_limit
labels:
  minutes: { one: minuta, few: minuty, many: minut, other: minuty }
  charge_done_at: Gotowe o
  # all labels: start_car, stop_car, more, flash, honk, honk_flash, confirm, charge,
  # charge_done_at, charge_plugged_in, charge_not_plugged_in, climate_running, climate_not_running,
  # target_soc, charge_current_limit, done, unlock_boot, purify_air
```

Slider bounds (`min`/`max`/`step`) come from each `number.*` entity itself — same as HA's own
more-info dialog — so there's nothing to configure beyond pointing at the right entity.

### "Scheduled" vs "Done" vs plain idle

The status text over the car reads the `charging_status` entity's own text, not just whether
it's plugged in. "Scheduled" is the fallback for "connected but not charging" (waiting on a
timer); an entity that instead reports the session finished (containing "done", "complete", or
"finished" — e.g. ha-volvo-au's "Done", which can happen well under 100% when charging to a
lower target) shows **Done** instead, and one that reports "idle" falls back to the plain
locked/unlocked text rather than implying a schedule is pending. Override the "Done" wording
with `labels.done`.

## Address row (optional) — added in this fork

The Volvo API gives GPS coordinates (the integration's `device_tracker`) but no address.
Point `entities.location_address` at any sensor whose state is a readable address. If that sensor
has a `parked_since` attribute (an ISO timestamp), the row also shows "Last parked today at 17:08".
Tapping the row opens the `location` entity, which has a map.

One way to build that sensor is a trigger-based template that reverse-geocodes with OpenStreetMap Nominatim
whenever the tracker's coordinates change. It treats moves under 150 m as GPS jitter, so
`parked_since` doesn't reset on every poll:

```yaml
rest_command:
  nominatim_reverse:
    url: "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat={{ lat }}&lon={{ lon }}"
    headers:
      User-Agent: "HomeAssistant-volvo-address/1.0"

template:
  - trigger:
      - trigger: state
        entity_id: device_tracker.volvo_xc60_location
        attribute: latitude
      - trigger: state
        entity_id: device_tracker.volvo_xc60_location
        attribute: longitude
    action:
      - variables:
          lat: "{{ state_attr('device_tracker.volvo_xc60_location', 'latitude') | float(0) }}"
          lon: "{{ state_attr('device_tracker.volvo_xc60_location', 'longitude') | float(0) }}"
          plat: "{{ state_attr('sensor.volvo_xc60_address', 'latitude') | float(0) }}"
          plon: "{{ state_attr('sensor.volvo_xc60_address', 'longitude') | float(0) }}"
          moved: "{{ plat == 0 or distance(lat, lon, plat, plon) > 0.15 }}"
      - action: rest_command.nominatim_reverse
        data: { lat: "{{ lat }}", lon: "{{ lon }}" }
        response_variable: geo
        continue_on_error: true
    sensor:
      - name: "Volvo XC60 address"
        unique_id: volvo_xc60_address
        state: >-
          {% set a = geo.content.address if geo is defined and geo.status == 200 else {} %}
          {{ ([[a.road | default(''), a.house_number | default('')] | select | join(' '),
               a.city | default(a.town | default(a.village | default('')))] | select | join(', '))[:250] or 'unknown' }}
        attributes:
          parked_since: >-
            {{ now().isoformat() if moved else state_attr('sensor.volvo_xc60_address', 'parked_since') or now().isoformat() }}
          latitude: "{{ lat if moved else plat }}"
          longitude: "{{ lon if moved else plon }}"
```

## The image backend (required separately — not part of the HACS install)

The Volvo integration can hand back a signed, temporary render URL for your car
(`volvo.get_image_url`), but a Lovelace card is pure frontend JS — it can't call HA service actions,
so it can't fetch that image itself. That has to happen in your own `configuration.yaml` (or a
packages file), once, and the card just reads whatever URL/path the result ends up at.

**Known issue: server-side downloading gets blocked (HTTP 403).** Volvo's image CDN
(`cas.volvocars.com`) sits behind Akamai bot protection. HA's own `downloader.download_file`
action (and `curl` from the HA host) gets rejected with a 403 from `AkamaiGHost`, even though the
exact same URL opens fine in a real browser. This isn't a bug in this card or in `volvo.get_image_url`
— the URL is valid, but Akamai fingerprints the *request*, not just the URL, and HA's backend HTTP
client doesn't look enough like a browser to pass. **Don't route the image through
`downloader.download_file`** — it will fail for most users.

### Recommended: point the card straight at the live URL

Have your template sensor expose the raw signed URL as an attribute, and point the card's `images`
config directly at it. The image then loads in the *browser* viewing your dashboard, which is a real
browser and isn't blocked by Akamai — and the browser's normal HTTP cache means it isn't
re-fetched from Volvo on every dashboard load anyway, just when the cache expires or the URL
changes.

```yaml
template:
  - trigger:
      - trigger: homeassistant
        event: start
      - trigger: time_pattern
        hours: "/12"   # re-pull periodically in case Volvo rotates the signed URL
    action:
      - action: volvo.get_image_url
        data:
          entry: <VOLVO_CONFIG_ENTRY_ID>
          images:
            - exterior_back
            - exterior_side_left
        response_variable: volvo_images
    sensor:
      - name: "Volvo Images"
        unique_id: volvo_images
        state: "ok"
        attributes:
          exterior_back: >-
            {{ volvo_images.images | selectattr('type','eq','exterior_back') | map(attribute='url') | first | default('') }}
          exterior_side_left: >-
            {{ volvo_images.images | selectattr('type','eq','exterior_side_left') | map(attribute='url') | first | default('') }}
```

```yaml
images:
  exterior_back: sensor.volvo_images
  exterior_side_left: sensor.volvo_images
  fallback: /local/assets/volvo-xc90.png
```

Notes:
- `volvo.get_image_url` returns `{"images": [{"type": "exterior_back", "url": "..."}, ...]}` — a
  list keyed by `type`, not a flat dict.
- The URL is signed and time-limited, so re-pulling periodically (not just on HA start) keeps it
  from going stale — the `time_pattern` trigger above does this every 12 hours; adjust to taste.

### Alternative: a fully static, manually-downloaded image

If you'd rather not depend on Volvo's servers at dashboard-load time at all — e.g. for a fully
offline dashboard, or if your browser is *also* blocked by Akamai for some reason — you can fetch
the render once by hand and serve it as a static file instead:

1. Call `volvo.get_image_url` once from **Developer Tools → Actions** in HA (or use the template
   above and check the resulting sensor's attributes) to get the current signed URL.
2. Open that URL in a normal desktop browser tab and save the image (right-click → Save Image As).
3. Copy the saved file into `config/www/assets/`, e.g.
   `config/www/assets/volvo-xc90-exterior-back.png` (`config/www/...` maps to `/local/...`).
4. Point `exterior_back` / `exterior_side_left` at it directly as a plain path — no entity needed,
   the card accepts either an entity ID *or* a literal path/URL for these:
   ```yaml
   images:
     exterior_back: /local/assets/volvo-xc90-exterior-back.png
     exterior_side_left: /local/assets/volvo-xc90-exterior-side-left.png
   ```

Since this is a manual, one-time step, you'll need to repeat it if you ever want a fresher render
(e.g. after a repaint/respec in your Volvo account) — the URL itself doesn't need to be re-fetched
automatically since you're no longer depending on it after the download.

If you don't want to set any of this up, just omit `images` from the card config (or point
`fallback` at a static image you host yourself) — everything else still works.

## Development

```
npm install
npm run build     # outputs volvo-car-card.js at the repo root
npm run watch      # rebuild on change
```

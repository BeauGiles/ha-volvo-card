import { LitElement, html, css, unsafeCSS, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { HomeAssistant, VolvoCardConfig, VolvoCardEntities, VehicleKind, ChargeState } from "./types";
import {
  getState,
  numState,
  resolveImage,
  round,
  deriveVehicleKind,
  deriveChargeState,
  isConnected,
  isCharging,
  statusKey,
} from "./state";
import {
  HEDVIG_FONT_WOFF2,
  LIGHTNING_ICON_PATH,
  LOCK_ICON_INNER,
  LOCK_OPEN_ICON_INNER,
  FAN_ICON_INNER,
  CABLE_IMAGE_PNG,
  POWER_ICON_INNER,
  MORE_ICON_INNER,
  BOLT_ICON_INNER,
  PIN_ICON_INNER,
} from "./assets";
import { label, minutesWord } from "./labels";
import { resolveOverlay } from "./overlays";

interface HeaderMain {
  value: number;
  unit: string;
}

type SubIcon = "lightning" | "mdi:gas-station" | "none";

interface HeaderSub {
  icon: SubIcon;
  value: string;
  label: string;
}

@customElement("volvo-car-card")
export class VolvoCarCard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private config!: VolvoCardConfig;
  @state() private actionsOpen = false;
  @state() private climateOn = false;
  @state() private moreOpen = false;
  @state() private chargeSettingsOpen = false;
  /** Live slider positions while dragging, keyed by entity_id — kept separate from hass
   *  state so the thumb doesn't jump back to the last-known value between input events
   *  and the service call actually landing. */
  @state() private sliderDraft: Record<string, number> = {};
  /** Entity ids with a service call currently in flight — drives the brief spinner on a
   *  quick-control button, confirming a tap actually sent something. */
  @state() private pendingIds: Set<string> = new Set();
  /** Control waiting for a confirming second tap ("unlock" / "start"), cleared after a few seconds. */
  @state() private armed: string | null = null;
  private armTimer?: number;

  public setConfig(config: VolvoCardConfig): void {
    if (!config || !config.entities) {
      throw new Error("volvo-car-card: `entities` is required in card config");
    }
    this.config = config;
  }

  public getCardSize(): number {
    return 3;
  }

  public static getStubConfig(): VolvoCardConfig {
    return {
      type: "custom:volvo-car-card",
      entities: {
        battery: "sensor.volvo_xxx_battery",
        distance_to_empty_battery: "sensor.volvo_xxx_distance_to_empty_battery",
        distance_to_empty_tank: "sensor.volvo_xxx_distance_to_empty_tank",
        fuel_amount: "sensor.volvo_xxx_fuel_amount",
        fuel_tank_capacity_l: 50,
        charging_connection_status: "sensor.volvo_xxx_charging_connection_status",
        charging_status: "sensor.volvo_xxx_charging_status",
        lock: "lock.volvo_xxx_lock",
        location: "device_tracker.volvo_xxx_location",
        start_climatisation: "button.volvo_xxx_start_climatisation",
        stop_climatisation: "button.volvo_xxx_stop_climatisation",
      },
      images: {
        exterior_back: "sensor.volvo_xxx_images",
        exterior_side_left: "sensor.volvo_xxx_images",
      },
    };
  }

  /** In `header: app` mode, whether the big stat is battery % (default, matches the
   *  Volvo app) or total range — with `appHeaderStat: "range"`, the small stat below
   *  becomes a bare percentage (no icon, no "electric"/"fuel" wording). BEV/ICE only;
   *  hybrids keep the default battery-first behavior since they also need the fuel
   *  sub-line to disambiguate which range is which. */
  private get rangeFirst(): boolean {
    return this.appHeader && this.config.appHeaderStat === "range";
  }

  private headerMain(kind: VehicleKind, chargeState: ChargeState): HeaderMain {
    const { entities: e } = this.config;
    const dteBattery = numState(this.hass, e.distance_to_empty_battery) ?? 0;
    const dteTank = numState(this.hass, e.distance_to_empty_tank) ?? 0;
    const battery = numState(this.hass, e.battery) ?? 0;

    if (kind === "ice") {
      return { value: round(dteTank), unit: "km" };
    }
    if (this.rangeFirst && kind !== "hybrid") {
      return { value: round(dteBattery + dteTank), unit: "km" };
    }
    if (chargeState === "scheduled" || this.appHeader) {
      return { value: round(battery), unit: "%" };
    }
    // idle or charging: total range (battery-only vehicles simply have dteTank = 0)
    return { value: round(dteBattery + dteTank), unit: "km" };
  }

  private headerSub1(kind: VehicleKind, chargeState: ChargeState): HeaderSub | null {
    const { entities: e } = this.config;
    const dteBattery = numState(this.hass, e.distance_to_empty_battery) ?? 0;
    const battery = numState(this.hass, e.battery) ?? 0;
    const fuelAmount = numState(this.hass, e.fuel_amount);
    const tankCapacity = e.fuel_tank_capacity_l;

    const fuelSub = (): HeaderSub | null => {
      if (fuelAmount === undefined || !tankCapacity) return null;
      const pct = round((fuelAmount / tankCapacity) * 100);
      return { icon: "mdi:gas-station", value: `${pct}%`, label: label(this.config.labels, "fuel_level") };
    };

    if (kind === "ice") return fuelSub();

    if (kind === "hybrid") {
      if (chargeState === "charging" && !this.appHeader) return fuelSub();
      return { icon: "lightning", value: `${round(dteBattery)} km`, label: label(this.config.labels, "electric") };
    }

    // bev
    if (this.rangeFirst) {
      return { icon: "none", value: `${round(battery)}%`, label: "" };
    }
    if (chargeState === "scheduled" || this.appHeader) {
      return { icon: "lightning", value: `${round(dteBattery)} km`, label: label(this.config.labels, "electric") };
    }
    return null;
  }

  private headerSub2(kind: VehicleKind, chargeState: ChargeState): string | null {
    if (kind !== "hybrid" || (chargeState === "charging" && !this.appHeader)) return null;
    const dteTank = numState(this.hass, this.config.entities.distance_to_empty_tank) ?? 0;
    return `${round(dteTank)} km ${label(this.config.labels, "fuel")}`;
  }

  private get locale(): string {
    return this.config.locale || this.hass.locale?.language || "en";
  }

  /** Minutes left as a number, or null when unknown / not numeric. */
  private minutesLeft(): number | null {
    const id = this.config.entities.charging_time_left;
    if (!id) return null;
    const n = Number(getState(this.hass, id));
    if (!Number.isFinite(n) || n <= 0) return null;
    const unit = this.hass.states[id]?.attributes?.unit_of_measurement;
    return Math.round(unit === "h" ? n * 60 : unit === "s" ? n / 60 : n);
  }

  /** Clock time when charging will be done, counted from when the sensor last changed. */
  private chargeDoneAt(): string | null {
    const id = this.config.entities.charging_time_left;
    const minutes = this.minutesLeft();
    if (!id || minutes === null) return null;
    const since = this.hass.states[id]?.last_changed;
    const base = since ? new Date(since).getTime() : Date.now();
    return this.timeText(new Date(base + minutes * 60_000));
  }

  private get appHeader(): boolean {
    return this.config.header === "app";
  }

  /** "1 h 17 min left" from a minutes sensor; a non-numeric state is shown as-is. */
  private chargingTimeLeft(): string | null {
    const id = this.config.entities.charging_time_left;
    if (!id) return null;
    const raw = getState(this.hass, id);
    if (raw === undefined || raw === "" || raw === "unknown" || raw === "unavailable") return null;
    const n = Number(raw);
    let text: string;
    if (Number.isFinite(n)) {
      const unit = this.hass.states[id]?.attributes?.unit_of_measurement;
      const minutes = Math.round(unit === "h" ? n * 60 : unit === "s" ? n / 60 : n);
      if (minutes <= 0) return null;
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      text = h > 0 ? `${h} h ${m} min` : `${m} ${minutesWord(this.config.labels, m, this.locale)}`;
    } else {
      text = raw;
    }
    return `${text} ${label(this.config.labels, "time_left")}`.trim();
  }

  private carImageStyle(connected: boolean): { style: Record<string, string>; hasImage: boolean } {
    const { images } = this.config;
    const src =
      (connected
        ? images && resolveImage(this.hass, images.exterior_back, "exterior_back")
        : images && resolveImage(this.hass, images.exterior_side_left, "exterior_side_left")) ||
      images?.fallback ||
      "";

    const bg = src ? `url('${src}')` : "none";
    const size = connected ? "185% 100%" : "182% 100%";
    const marginLeft = connected ? "-60px" : "-48px";
    const marginTop = connected ? "-34px" : "-10px";
    const marginBottom = connected ? "-30px" : "-30px";

    return {
      style: {
        background: `${bg} left center / ${size} no-repeat transparent`,
        marginLeft,
        marginTop,
        marginBottom,
      },
      hasImage: !!src,
    };
  }

  protected render(): TemplateResult {
    if (!this.hass || !this.config) return html``;

    const { entities: e, name } = this.config;
    const kind = deriveVehicleKind(e);

    if (kind === "unknown") {
      return html`
        <ha-card>
          <div class="warning">
            volvo-car-card: no battery or fuel entities configured — nothing to show.
          </div>
        </ha-card>
      `;
    }

    const chargeState = deriveChargeState(this.hass, e, kind);
    const connected = kind !== "ice" && isConnected(this.hass, e);
    const charging = kind !== "ice" && isCharging(this.hass, e);
    const main = this.headerMain(kind, chargeState);
    const sub1 = this.headerSub1(kind, chargeState);
    const sub2 = this.headerSub2(kind, chargeState);
    const sKey = statusKey(this.hass, e, chargeState, kind);
    const status = sKey ? label(this.config.labels, sKey) : "";
    const timeLeft = chargeState === "charging" ? this.chargingTimeLeft() : null;
    const { style: imgStyle, hasImage } = this.carImageStyle(connected);
    const isDark = this.hass.themes?.darkMode ?? true;
    // Text over the car photo stays white regardless of theme (the photo's own
    // dark background makes that legible). Without a photo, or in light mode,
    // fall back to plain black/dark-grey text instead of white-on-nothing.
    const overlayClass = !hasImage || !isDark ? "theme-text" : "";

    // Which entity each stat's "more info" (history) should open — kept next to the
    // value that displays it, since both depend on the same kind/chargeState branching.
    const mainEntity =
      kind === "ice"
        ? e.distance_to_empty_tank
        : this.rangeFirst && kind !== "hybrid"
          ? e.distance_to_empty_battery
          : chargeState === "scheduled" || this.appHeader
            ? e.battery
            : e.distance_to_empty_battery;
    const sub1Entity = !sub1
      ? undefined
      : sub1.icon === "lightning"
        ? e.distance_to_empty_battery
        : sub1.icon === "none"
          ? e.battery
          : e.fuel_amount;
    const statusEntity =
      chargeState === "idle" || chargeState === "done" ? e.lock : e.charging_status || e.charging_connection_status;
    // Only the card's own background, not the tiles/charge-settings panel — those stay the
    // theme's normal gray on purpose, like the official app's Charge/Climate tiles do. The
    // ".controls" bar tints itself automatically: it's a translucent overlay, so it picks up
    // whatever color sits behind it here.
    const cardStyle =
      (this.config.background ? `background:${this.config.background};` : "") +
      (this.config.accentColor ? `--volvo-accent-color:${this.config.accentColor};` : "");

    return html`
      <ha-card style=${cardStyle}>
        <div class="volvo-card" @click=${this.openActions}>
          ${charging ? this.renderPulse() : nothing}
          <div
            class="car-image"
            style=${`background:${imgStyle.background};margin-left:${imgStyle.marginLeft};margin-top:${imgStyle.marginTop};margin-bottom:${imgStyle.marginBottom};`}
          ></div>
          ${connected ? this.renderCable() : nothing}
          <div class="header ${overlayClass}">
            ${name ? html`<div class="vehicle-name">${name}</div>` : nothing}
            <div class="row main-row" @click=${this.moreInfoStop(mainEntity)}>
              <span class="main-value"
                >${main.value}<span class="main-unit"> ${main.unit}</span></span
              >
            </div>
            ${sub1
              ? html`
                  <div class="row sub-row" @click=${this.moreInfoStop(sub1Entity)}>
                    ${sub1.icon === "lightning"
                      ? this.renderLightningIcon()
                      : sub1.icon === "none"
                        ? nothing
                        : html`<ha-icon icon=${sub1.icon}></ha-icon>`}
                    <span class="sub-value ${sub1.icon === "none" ? "sub-value-plain" : ""}">${sub1.value}</span>
                    ${sub1.label ? html`<span class="sub-label">${sub1.label}</span>` : nothing}
                  </div>
                `
              : nothing}
            ${sub2
              ? html`<div class="row sub-row-2" @click=${this.moreInfoStop(e.distance_to_empty_tank)}>${sub2}</div>`
              : nothing}
          </div>
          ${status
            ? html`<div class="status ${overlayClass}" @click=${this.moreInfoStop(statusEntity)}>${status}</div>`
            : nothing}
          ${timeLeft
            ? html`<div class="status-right ${overlayClass}" @click=${this.moreInfoStop(e.charging_time_left)}>${timeLeft}</div>`
            : nothing}
        </div>
        ${this.config.controls ? this.renderControls(e, kind, chargeState, connected) : nothing}
        ${e.location_address ? this.renderAddress(e) : nothing}
      </ha-card>
      ${this.actionsOpen ? this.renderActionsDialog(e, isDark) : nothing}
    `;
  }

  private openActions(ev: Event): void {
    ev.stopPropagation();
    this.actionsOpen = true;
  }

  /** Click handler for a stat that should open its entity's history/more-info dialog
   *  instead of the card's own lock/climate actions popup. Falls through to the
   *  card's own click (the actions popup) when no entity is configured for that stat. */
  private moreInfoStop(entityId?: string): (ev: Event) => void {
    return (ev: Event) => {
      if (!entityId) return;
      ev.stopPropagation();
      this.moreInfo(entityId);
    };
  }

  private closeActions(): void {
    this.actionsOpen = false;
  }

  /** Marks `key` (an entity_id, almost always) busy while `fn` runs, so a button can show
   *  a brief spinner confirming the tap actually sent something — HA's callService resolves
   *  once the call reaches the backend, not once the car has acted on it, so this confirms
   *  "sent", not "done". Padded to a minimum visible duration so a near-instant call (or one
   *  fired locally with no promise) doesn't just flicker. */
  private async withPending(key: string, fn: () => unknown): Promise<void> {
    const start = new Set(this.pendingIds);
    start.add(key);
    this.pendingIds = start;
    const startedAt = Date.now();
    try {
      await fn();
    } finally {
      const remaining = 450 - (Date.now() - startedAt);
      if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
      const done = new Set(this.pendingIds);
      done.delete(key);
      this.pendingIds = done;
    }
  }

  private callLock(lock: boolean): void {
    const entityId = this.config.entities.lock;
    if (!entityId) return;
    void this.withPending(entityId, () => this.hass.callService("lock", lock ? "lock" : "unlock", { entity_id: entityId }));
    this.closeActions();
  }

  private pressButton(entityId?: string): void {
    if (!entityId) return;
    void this.withPending(entityId, () => this.hass.callService("button", "press", { entity_id: entityId }));
  }

  /** Dispatches a "…" menu chip by its kind: a momentary press, a switch toggle
   *  (reads real state), or an unlock — which some integrations expose as a `lock.*`
   *  entity (call lock.unlock) and others as a momentary `button.*` (press it). */
  private runExtra(x: { id: string; kind: "press" | "switch" | "unlock" }): void {
    if (x.kind === "press") {
      this.pressButton(x.id);
      return;
    }
    if (x.kind === "switch") {
      const on = getState(this.hass, x.id) === "on";
      void this.withPending(x.id, () => this.hass.callService("switch", on ? "turn_off" : "turn_on", { entity_id: x.id }));
      return;
    }
    if (x.id.startsWith("lock.")) {
      void this.withPending(x.id, () => this.hass.callService("lock", "unlock", { entity_id: x.id }));
    } else {
      this.pressButton(x.id);
    }
  }

  private doToggleClimate(): void {
    const { start_climatisation, stop_climatisation, climatisation } = this.config.entities;
    if (climatisation) {
      const on = getState(this.hass, climatisation) === "on";
      void this.withPending(climatisation, () => this.hass.callService("switch", on ? "turn_off" : "turn_on", { entity_id: climatisation }));
      return;
    }
    this.pressButton(this.climateOn ? stop_climatisation : start_climatisation);
    this.climateOn = !this.climateOn;
  }

  /** Starting climate (remotely running the AC/heater) asks for a confirming second tap,
   *  the same way unlock and remote start do; turning it off needs no confirmation. */
  private onClimateControl(isOn: boolean): void {
    if (isOn) {
      this.disarm();
      this.doToggleClimate();
      return;
    }
    if (!this.arm("climate")) return;
    this.doToggleClimate();
  }

  /** Real switch state when `climatisation` is configured; otherwise the card's own
   *  locally-tracked guess (button-pair integrations have no on/off state to read). */
  private climateIsOn(e: VolvoCardEntities): boolean {
    return e.climatisation ? getState(this.hass, e.climatisation) === "on" : this.climateOn;
  }

  private arm(key: string): boolean {
    // true = already armed, go ahead; false = armed now, wait for the second tap
    if (this.armed === key) {
      this.disarm();
      return true;
    }
    this.armed = key;
    window.clearTimeout(this.armTimer);
    this.armTimer = window.setTimeout(() => this.disarm(), 4000);
    return false;
  }

  private disarm(): void {
    window.clearTimeout(this.armTimer);
    this.armed = null;
  }

  private moreInfo(entityId?: string): void {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
  }

  /** Current value + slider bounds for a `number.*` entity, or null if unconfigured/unknown.
   *  Bounds come from the entity's own `min`/`max`/`step` attributes, same as HA's built-in
   *  more-info slider — never hardcoded, since they vary per integration/vehicle. */
  private numberAttrs(entityId?: string): { value: number; min: number; max: number; step: number } | null {
    if (!entityId) return null;
    const st = this.hass.states[entityId];
    if (!st) return null;
    const value = this.sliderDraft[entityId] ?? parseFloat(st.state);
    if (Number.isNaN(value)) return null;
    const attrs = st.attributes || {};
    return { value, min: attrs.min ?? 0, max: attrs.max ?? 100, step: attrs.step ?? 1 };
  }

  private onSliderInput(entityId: string, ev: Event): void {
    const value = Number((ev.target as HTMLInputElement).value);
    this.sliderDraft = { ...this.sliderDraft, [entityId]: value };
  }

  private onSliderChange(entityId: string, ev: Event): void {
    const value = Number((ev.target as HTMLInputElement).value);
    this.hass.callService("number", "set_value", { entity_id: entityId, value });
    // Keep the draft value showing until the next hass update lands (avoids a snap-back
    // to the pre-change state while the service call is still in flight).
  }

  private renderSliderRow(entityId: string | undefined, rowLabel: string, unit: string): TemplateResult | typeof nothing {
    const n = this.numberAttrs(entityId);
    if (!entityId || !n) return nothing;
    return html`
      <div class="ctl-slider-row">
        <div class="ctl-slider-label">${rowLabel}</div>
        <input
          class="ctl-slider"
          type="range"
          min=${n.min}
          max=${n.max}
          step=${n.step}
          .value=${String(n.value)}
          @input=${(ev: Event) => this.onSliderInput(entityId, ev)}
          @change=${(ev: Event) => this.onSliderChange(entityId, ev)}
        />
        <div class="ctl-slider-value">${round(n.value)}${unit}</div>
      </div>
    `;
  }

  private onLockControl(isLocked: boolean): void {
    if (isLocked && !this.arm("unlock")) return; // unlocking needs a confirming tap
    this.disarm();
    const entityId = this.config.entities.lock;
    if (entityId) void this.withPending(entityId, () => this.hass.callService("lock", isLocked ? "unlock" : "lock", { entity_id: entityId }));
  }

  private onEngineControl(running: boolean): void {
    const { start_engine, stop_engine } = this.config.entities;
    if (running) {
      this.disarm();
      this.pressButton(stop_engine);
      return;
    }
    if (!this.arm("start")) return; // remote start needs a confirming tap
    this.pressButton(start_engine);
  }

  private renderControls(
    e: VolvoCardEntities,
    kind: VehicleKind,
    chargeState: ChargeState,
    connected: boolean
  ): TemplateResult {
    const L = (k: Parameters<typeof label>[1]) => label(this.config.labels, k);
    const isLocked = getState(this.hass, e.lock) === "locked";
    const hasFan = !!(e.start_climatisation || e.stop_climatisation || e.climatisation);
    const climateOn = this.climateIsOn(e);
    const hasEngine = !!(e.start_engine || e.stop_engine);
    const engineOn = getState(this.hass, e.engine_status) === "on";
    const isPending = (...ids: (string | undefined)[]) => ids.some((id) => id && this.pendingIds.has(id));
    const lockPending = isPending(e.lock);
    const climatePending = isPending(e.climatisation, e.start_climatisation, e.stop_climatisation);
    const enginePending = isPending(e.start_engine, e.stop_engine);
    const extras: { id: string; text: string; kind: "press" | "switch" | "unlock" }[] = [
      { id: e.flash, text: L("flash"), kind: "press" },
      { id: e.honk, text: L("honk"), kind: "press" },
      { id: e.honk_flash, text: L("honk_flash"), kind: "press" },
      { id: e.unlock_boot, text: L("unlock_boot"), kind: "unlock" },
      { id: e.air_purification, text: L("purify_air"), kind: "switch" },
    ].filter((x): x is { id: string; text: string; kind: "press" | "switch" | "unlock" } => !!x.id);
    const hasChargeSettings = !!(e.target_soc || e.charge_current_limit);

    let chargeSub = "";
    if (kind !== "ice") {
      if (chargeState === "charging") {
        const at = this.chargeDoneAt();
        chargeSub = at ? `${L("charge_done_at")} ${at}` : label(this.config.labels, "charging");
      } else if (chargeState === "done") {
        chargeSub = L("done");
      } else {
        chargeSub = connected ? L("charge_plugged_in") : L("charge_not_plugged_in");
      }
    }

    const hint =
      this.armed === "unlock"
        ? `${L("confirm")}: ${L("unlock")}`
        : this.armed === "start"
          ? `${L("confirm")}: ${L("start_car")}`
          : this.armed === "climate"
            ? `${L("confirm")}: ${L("climate")}`
            : "";

    return html`
      <div class="controls">
        ${e.lock
          ? html`<button
              class="ctl ${this.armed === "unlock" ? "armed" : ""} ${lockPending ? "pending" : ""} ${!isLocked ? "unlocked-glow" : ""}"
              title=${isLocked ? L("unlock") : L("lock")}
              aria-label=${isLocked ? L("unlock") : L("lock")}
              @click=${() => this.onLockControl(isLocked)}
            >
              ${this.renderStrokeIcon(isLocked ? LOCK_ICON_INNER : LOCK_OPEN_ICON_INNER)}
            </button>`
          : nothing}
        ${hasFan
          ? html`<button
              class="ctl ${climateOn ? "on" : ""} ${this.armed === "climate" ? "armed" : ""} ${climatePending ? "pending" : ""}"
              title=${L("climate")}
              aria-label=${L("climate")}
              @click=${() => this.onClimateControl(climateOn)}
            >
              ${this.renderStrokeIcon(FAN_ICON_INNER)}
            </button>`
          : nothing}
        ${hasEngine
          ? html`<button
              class="ctl ${engineOn ? "on" : ""} ${this.armed === "start" ? "armed" : ""} ${enginePending ? "pending" : ""}"
              title=${engineOn ? L("stop_car") : L("start_car")}
              aria-label=${engineOn ? L("stop_car") : L("start_car")}
              @click=${() => this.onEngineControl(engineOn)}
            >
              ${this.renderStrokeIcon(POWER_ICON_INNER)}
            </button>`
          : nothing}
        ${extras.length
          ? html`<button
              class="ctl ${this.moreOpen ? "on" : ""}"
              title=${L("more")}
              aria-label=${L("more")}
              @click=${() => (this.moreOpen = !this.moreOpen)}
            >
              ${this.renderStrokeIcon(MORE_ICON_INNER)}
            </button>`
          : nothing}
      </div>
      ${hint ? html`<div class="ctl-hint">${hint}</div>` : nothing}
      ${this.moreOpen && extras.length
        ? html`<div class="ctl-more">
            ${extras.map(
              (x) =>
                html`<button class="chip ${this.pendingIds.has(x.id) ? "pending" : ""}" @click=${() => this.runExtra(x)}>
                  ${x.text}
                </button>`
            )}
          </div>`
        : nothing}
      <div class="tiles">
        ${kind !== "ice"
          ? html`<div
              class="tile"
              @click=${() =>
                hasChargeSettings
                  ? (this.chargeSettingsOpen = !this.chargeSettingsOpen)
                  : this.moreInfo(e.charging_status || e.battery)}
            >
              ${this.renderStrokeIcon(BOLT_ICON_INNER)}
              <div class="tile-title">${L("charge")}</div>
              <div class="tile-sub">${chargeSub}</div>
            </div>`
          : nothing}
        ${hasFan
          ? html`<div class="tile ${climateOn ? "on" : ""}" @click=${() => this.onClimateControl(climateOn)}>
              ${this.renderStrokeIcon(FAN_ICON_INNER)}
              <div class="tile-title">${L("climate")}</div>
              <div class="tile-sub">${climateOn ? L("climate_running") : L("climate_not_running")}</div>
            </div>`
          : nothing}
      </div>
      ${this.chargeSettingsOpen && hasChargeSettings
        ? html`<div class="charge-settings">
            ${this.renderSliderRow(e.target_soc, L("target_soc"), "%")}
            ${this.renderSliderRow(e.charge_current_limit, L("charge_current_limit"), "A")}
          </div>`
        : nothing}
    `;
  }

  private timeText(d: Date): string {
    const tf = this.hass.locale?.time_format;
    const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
    if (tf === "24") opts.hourCycle = "h23";
    if (tf === "12") opts.hour12 = true;
    try {
      return d.toLocaleTimeString(this.locale, opts);
    } catch (_e) {
      return d.toLocaleTimeString(undefined, opts);
    }
  }

  /** "Last parked today at 17:08" / "yesterday at …" / "Last parked 25.09 17:08". */
  private parkedText(iso?: string): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const L = (k: Parameters<typeof label>[1]) => label(this.config.labels, k);
    const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(new Date()) - day(d)) / 86_400_000);
    if (diff === 0) return `${L("parked_today")} ${this.timeText(d)}`;
    if (diff === 1) return `${L("parked_yesterday")} ${this.timeText(d)}`;
    let date: string;
    try {
      date = d.toLocaleDateString(this.locale, { day: "numeric", month: "short" });
    } catch (_e) {
      date = d.toLocaleDateString();
    }
    return `${L("parked_on")} ${date} ${this.timeText(d)}`;
  }

  private renderAddress(e: VolvoCardEntities): TemplateResult {
    const st = this.hass.states[e.location_address!];
    const addr = st?.state;
    if (!addr || addr === "unknown" || addr === "unavailable") return html``;
    const sub = this.parkedText(st.attributes?.parked_since);
    return html`<div class="address" @click=${() => this.moreInfo(e.location || e.location_address)}>
      ${this.renderStrokeIcon(PIN_ICON_INNER)}
      <div>
        <div class="address-title">${addr}</div>
        ${sub ? html`<div class="address-sub">${sub}</div>` : nothing}
      </div>
    </div>`;
  }

  private renderActionsDialog(e: VolvoCardEntities, isDark: boolean): TemplateResult {
    const isLocked = getState(this.hass, e.lock) === "locked";
    const hasFan = !!(e.start_climatisation || e.stop_climatisation || e.climatisation);
    const climateOn = this.climateIsOn(e);
    const themeClass = isDark ? "dark" : "light";

    return html`
      <div class="actions-backdrop" @click=${this.closeActions}>
        <div class="actions-panel" @click=${(ev: Event) => ev.stopPropagation()}>
          ${e.lock
            ? html`
                <button
                  class="icon-button ${themeClass}"
                  aria-label=${isLocked ? label(this.config.labels, "unlock") : label(this.config.labels, "lock")}
                  @click=${() => this.callLock(!isLocked)}
                >
                  ${this.renderStrokeIcon(isLocked ? LOCK_ICON_INNER : LOCK_OPEN_ICON_INNER)}
                  <span>${isLocked ? label(this.config.labels, "unlock") : label(this.config.labels, "lock")}</span>
                </button>
              `
            : nothing}
          ${hasFan
            ? html`
                <button
                  class="icon-button ${themeClass} ${climateOn ? "active" : ""}"
                  aria-label=${label(this.config.labels, "climate")}
                  @click=${() => this.doToggleClimate()}
                >
                  ${this.renderStrokeIcon(FAN_ICON_INNER)}
                  <span>${label(this.config.labels, "climate")}</span>
                </button>
              `
            : nothing}
        </div>
      </div>
    `;
  }

  private renderLightningIcon(): TemplateResult {
    return html`<svg class="icon-svg" viewBox="0 0 24 24">
      <path fill="currentColor" d=${LIGHTNING_ICON_PATH}></path>
    </svg>`;
  }

  private renderStrokeIcon(inner: string): TemplateResult {
    return html`<svg
      class="icon-svg-stroke"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      ${unsafeSVG(inner)}
    </svg>`;
  }

  private renderCable(): TemplateResult {
    const overlay = resolveOverlay(this.config.model, this.config.overlay);
    return html`<img
      class="cable"
      src=${CABLE_IMAGE_PNG}
      style="bottom: ${overlay.cable_bottom}; width: ${overlay.cable_width};"
    />`;
  }

  private renderPulse(): TemplateResult {
    const overlay = resolveOverlay(this.config.model, this.config.overlay);
    return html`
      <div class="pulse-container" style="left: ${overlay.pulse_left}; top: ${overlay.pulse_top};">
        <span class="pulse" style="animation-delay: 0s"></span>
        <span class="pulse" style="animation-delay: 2s"></span>
        <span class="pulse" style="animation-delay: 4s"></span>
      </div>
    `;
  }

  static styles = css`
    @font-face {
      font-family: "Hedvig Letters Sans";
      src: url(${unsafeCSS(HEDVIG_FONT_WOFF2)}) format("woff2");
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }

    :host {
      --volvo-accent-color: #38f2e9;
    }

    ha-card {
      overflow: hidden;
      border-radius: 16px;
      position: relative;
    }
    .volvo-card {
      position: relative;
      width: 100%;
      aspect-ratio: 1 / 1;
      font-family: "Hedvig Letters Sans", sans-serif;
    }
    .warning {
      padding: 16px;
      font-family: "Hedvig Letters Sans", sans-serif;
      color: var(--primary-text-color);
    }

    /* z-index stacking: car image(0) -> pulse(1) -> cable(2) -> text(3)
       The car image has an opaque background (photo + fallback color), so a
       pulse placed behind it (a lower z-index) is fully hidden, not just
       occluded by the car silhouette. It has to sit above the image to be
       visible at all. */
    .pulse-container {
      position: absolute;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      /* left/top are set inline per-model — see resolveOverlay() in overlays.ts */
      width: 0;
      height: 0;
    }
    .pulse {
      position: absolute;
      left: -35px;
      top: -35px;
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background: radial-gradient(
        circle,
        rgba(40, 220, 90, 1) 0%,
        rgba(40, 220, 90, 1) 58%,
        rgba(40, 220, 90, 1) 72%
      );
      animation: volvoChargingPulse 6s ease-out infinite;
    }
    @keyframes volvoChargingPulse {
      0% {
        transform: scale(0.1);
        opacity: 1;
      }
      50% {
        opacity: 0.6;
      }
      100% {
        transform: scale(1.5);
        opacity: 0;
      }
    }

    .car-image {
      position: absolute;
      inset: 0;
      z-index: 1;
    }

    .cable {
      position: absolute;
      left: 0;
      /* bottom/width are set inline per-model — see resolveOverlay() in overlays.ts */
      height: auto;
      object-fit: contain;
      pointer-events: none;
      z-index: 2;
    }

    .header {
      position: absolute;
      left: 13px;
      top: 13px;
      z-index: 3;
      display: block;
      width: auto;
    }
    .vehicle-name {
      font-size: 12px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.6);
      margin-bottom: 4px;
    }
    .row {
      display: flex;
      flex-direction: row;
      align-items: flex-start;
      justify-content: flex-start;
      width: max-content;
      white-space: nowrap;
    }
    .main-row {
      align-items: flex-start;
      gap: 9px;
      cursor: pointer;
    }
    .main-value {
      font-size: 51px;
      font-weight: 300;
      letter-spacing: -0.07em;
      color: white;
      line-height: 1;
      text-shadow: 0 2px 12px rgba(0, 0, 0, 0.7);
    }
    .main-unit {
      font-weight: 300;
      margin-left: -4px;
    }
    .sub-row {
      align-items: center;
      gap: 4px;
      margin-top: 0px;
      cursor: pointer;
    }
    .sub-row ha-icon {
      --mdc-icon-size: 20px;
      color: white;
      flex-shrink: 0;
    }
    .icon-svg {
      width: 18px;
      height: 26px;
      color: white;
      flex-shrink: 0;
    }
    .sub-value {
      font-size: 18px;
      font-weight: 400;
      color: white;
      text-shadow: 0 2px 12px rgba(0, 0, 0, 0.7);
    }
    /* The bare-percentage sub-stat (appHeaderStat: "range") has no icon to anchor it,
       so it reads small at the default size — bump it up a bit. */
    .sub-value-plain {
      font-size: 24px;
    }
    .sub-label {
      font-size: 18px;
      font-weight: 300;
      color: rgba(255, 255, 255, 0.5);
    }
    .sub-row-2 {
      font-size: 16px;
      font-weight: 300;
      color: rgba(255, 255, 255, 0.5);
      margin-top: -7px;
      margin-left: 3px;
      cursor: pointer;
    }

    .controls {
      display: flex;
      justify-content: space-around;
      align-items: center;
      padding: 14px 8px;
      background: var(--volvo-controls-background, rgba(127, 127, 127, 0.18));
      font-family: "Hedvig Letters Sans", sans-serif;
    }
    .ctl {
      position: relative;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      border: none;
      background: transparent;
      color: var(--primary-text-color);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 0.2s;
    }
    .ctl .icon-svg-stroke {
      width: 28px;
      height: 28px;
      transition: opacity 0.15s;
    }
    .ctl:hover {
      background: rgba(127, 127, 127, 0.2);
    }
    .ctl.on {
      color: var(--volvo-accent-color);
    }
    .ctl.armed {
      background: rgba(255, 170, 0, 0.25);
      color: #ffb020;
    }
    /* Brief spinner confirming a tap actually sent a service call — see withPending(). */
    .ctl.pending {
      pointer-events: none;
    }
    .ctl.pending .icon-svg-stroke {
      opacity: 0.35;
    }
    .ctl.pending::after {
      content: "";
      position: absolute;
      inset: 8px;
      border-radius: 50%;
      border: 2px solid transparent;
      border-top-color: currentColor;
      border-right-color: currentColor;
      opacity: 0.85;
      animation: ctlSpin 0.6s linear infinite;
    }
    @keyframes ctlSpin {
      to {
        transform: rotate(360deg);
      }
    }
    /* Persistent visual confirmation that the car is unlocked — a slow green pulse,
       distinct from the plain accent-color ".on" state used for climate/engine. */
    .ctl.unlocked-glow {
      color: #2ecc71;
    }
    .ctl.unlocked-glow .icon-svg-stroke {
      animation: unlockGlow 2.2s ease-in-out infinite;
    }
    @keyframes unlockGlow {
      0%,
      100% {
        filter: drop-shadow(0 0 2px rgba(46, 204, 113, 0.5));
      }
      50% {
        filter: drop-shadow(0 0 7px rgba(46, 204, 113, 0.95));
      }
    }
    .ctl-hint {
      text-align: center;
      font-size: 13px;
      padding: 6px 0 0;
      color: #ffb020;
      font-family: "Hedvig Letters Sans", sans-serif;
    }
    .ctl-more {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
      padding: 10px 8px 0;
    }
    .chip {
      border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4));
      border-radius: 16px;
      padding: 6px 12px;
      background: transparent;
      color: var(--primary-text-color);
      font-family: "Hedvig Letters Sans", sans-serif;
      font-size: 13px;
      cursor: pointer;
    }
    .chip.pending {
      pointer-events: none;
      animation: chipPulse 0.8s ease-in-out infinite;
    }
    @keyframes chipPulse {
      0%,
      100% {
        opacity: 0.55;
      }
      50% {
        opacity: 0.9;
      }
    }
    .tiles {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1px;
      background: var(--divider-color, rgba(127, 127, 127, 0.25));
      font-family: "Hedvig Letters Sans", sans-serif;
    }
    .tile {
      background: var(--ha-card-background, var(--card-background-color));
      padding: 14px 14px 16px;
      cursor: pointer;
      color: var(--primary-text-color);
    }
    .tile .icon-svg-stroke {
      width: 26px;
      height: 26px;
    }
    .tile.on .icon-svg-stroke,
    .tile.on .tile-title {
      color: var(--volvo-accent-color);
    }
    .tile-title {
      font-size: 19px;
      margin-top: 18px;
    }
    .tile-sub {
      font-size: 14px;
      color: var(--secondary-text-color);
      margin-top: 2px;
    }

    .charge-settings {
      padding: 14px 16px 16px;
      background: var(--ha-card-background, var(--card-background-color));
      border-top: 1px solid var(--divider-color, rgba(127, 127, 127, 0.25));
      font-family: "Hedvig Letters Sans", sans-serif;
    }
    .ctl-slider-row {
      display: grid;
      grid-template-columns: 84px 1fr 44px;
      align-items: center;
      gap: 10px;
      padding: 6px 0;
      color: var(--primary-text-color);
    }
    .ctl-slider-label {
      font-size: 13px;
      color: var(--secondary-text-color);
    }
    .ctl-slider-value {
      font-size: 13px;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .ctl-slider {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 4px;
      border-radius: 2px;
      background: var(--divider-color, rgba(127, 127, 127, 0.4));
      outline: none;
    }
    .ctl-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--volvo-accent-color);
      cursor: pointer;
    }
    .ctl-slider::-moz-range-thumb {
      width: 18px;
      height: 18px;
      border: none;
      border-radius: 50%;
      background: var(--volvo-accent-color);
      cursor: pointer;
    }

    .address {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px 16px;
      border-top: 1px solid var(--divider-color, rgba(127, 127, 127, 0.25));
      cursor: pointer;
      color: var(--primary-text-color);
      font-family: "Hedvig Letters Sans", sans-serif;
    }
    .address .icon-svg-stroke {
      width: 26px;
      height: 26px;
      flex: none;
    }
    .address-title {
      font-size: 17px;
    }
    .address-sub {
      font-size: 14px;
      color: var(--secondary-text-color);
      margin-top: 2px;
    }

    .status-right {
      position: absolute;
      right: 16px;
      bottom: 19px;
      z-index: 3;
      font-size: 15px;
      font-weight: 300;
      color: #aaa;
      cursor: pointer;
      text-shadow: 0 2px 12px rgba(0, 0, 0, 0.7);
    }

    .status {
      position: absolute;
      left: 13px;
      bottom: 13px;
      z-index: 3;
      cursor: pointer;
      font-size: 24px;
      font-weight: 300;
      color: #aaa;
      text-shadow: 0 2px 12px rgba(0, 0, 0, 0.7);
    }

    /* No photo, or light theme: fall back to plain black/dark-grey text
       instead of white (white-on-photo only reads well against the dark
       image background; white-on-nothing or white-on-light doesn't). */
    .header.theme-text .vehicle-name {
      color: #5c5c5c;
    }
    .header.theme-text .main-value {
      color: #141414;
      text-shadow: none;
    }
    .header.theme-text .sub-row ha-icon,
    .header.theme-text .icon-svg,
    .header.theme-text .sub-value {
      color: #141414;
      text-shadow: none;
    }
    .header.theme-text .sub-label,
    .header.theme-text .sub-row-2 {
      color: #5c5c5c;
    }
    .status.theme-text,
    .status-right.theme-text {
      color: #5c5c5c;
      text-shadow: none;
    }

    .volvo-card {
      cursor: pointer;
    }

    .actions-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .actions-panel {
      display: flex;
      flex-direction: row;
      gap: 16px;
    }
    .icon-button {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 84px;
      height: 84px;
      border: none;
      border-radius: 20px;
      background: var(--card-background-color, var(--ha-card-background, white));
      color: var(--primary-text-color);
      font-family: "Hedvig Letters Sans", sans-serif;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }
    .icon-button .icon-svg-stroke {
      width: 28px;
      height: 28px;
    }
    .icon-button.light {
      color: #141414;
    }
    .icon-button.light .icon-svg-stroke {
      color: #141414;
    }
    .icon-button.dark {
      color: white;
    }
    .icon-button.dark .icon-svg-stroke {
      color: white;
    }
    .icon-button.light.active {
      background: #141414;
      color: white;
    }
    .icon-button.light.active .icon-svg-stroke {
      color: white;
    }
    .icon-button.dark.active {
      background: white;
      color: #0d0f10;
    }
    .icon-button.dark.active .icon-svg-stroke {
      color: #0d0f10;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "volvo-car-card": VolvoCarCard;
  }
  interface Window {
    customCards?: { type: string; name: string; description: string; preview?: boolean }[];
  }
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "volvo-car-card",
  name: "Volvo Car Card",
  description: "A card for Volvo integration vehicles (ICE, PHEV, BEV) with charging status.",
  preview: true,
});

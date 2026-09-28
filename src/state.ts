import { ChargeState, HomeAssistant, StatusKey, VehicleKind, VolvoCardEntities } from "./types";

export function getState(hass: HomeAssistant, entityId?: string): string | undefined {
  if (!entityId) return undefined;
  return hass.states[entityId]?.state;
}

export function getAttr(hass: HomeAssistant, entityId: string | undefined, attr: string): any {
  if (!entityId) return undefined;
  return hass.states[entityId]?.attributes?.[attr];
}

/**
 * `value` can be either an entity ID (whose `attr` attribute holds the image URL) or a literal
 * URL/local path (e.g. `/local/assets/car.png`) — whichever it is, this returns the URL to use.
 */
export function resolveImage(hass: HomeAssistant, value: string | undefined, attr: string): string | undefined {
  if (!value) return undefined;
  if (hass.states[value] !== undefined) {
    return getAttr(hass, value, attr) || undefined;
  }
  return value;
}

export function numState(hass: HomeAssistant, entityId?: string): number | undefined {
  const s = getState(hass, entityId);
  if (s === undefined) return undefined;
  const n = parseFloat(s);
  return Number.isNaN(n) ? undefined : n;
}

export function round(n: number | undefined): number {
  return Math.round(n ?? 0);
}

/**
 * Vehicle kind is derived from which entities the user configured, not a
 * config flag — an unconfigured entity means "this vehicle doesn't have
 * that system" (e.g. no fuel entities on a full EV).
 */
export function deriveVehicleKind(entities: VolvoCardEntities): VehicleKind {
  const hasBattery = !!(entities.battery && entities.distance_to_empty_battery);
  const hasFuel = !!(entities.fuel_amount && entities.distance_to_empty_tank);
  if (hasBattery && hasFuel) return "hybrid";
  if (hasBattery) return "bev";
  if (hasFuel) return "ice";
  return "unknown";
}

export function isConnected(hass: HomeAssistant, entities: VolvoCardEntities): boolean {
  const connStatus = (getState(hass, entities.charging_connection_status) || "").toLowerCase();
  return connStatus.includes("connect") && !connStatus.includes("disconnect");
}

export function isCharging(hass: HomeAssistant, entities: VolvoCardEntities): boolean {
  const chargeStateStr = (getState(hass, entities.charging_status) || "").toLowerCase();
  return chargeStateStr.includes("charg") && !chargeStateStr.includes("not");
}

/**
 * Charging state only applies to vehicles with a battery. ICE vehicles are
 * always treated as idle (no plug, no charging UI, no pulse/cable overlay) —
 * this falls out naturally since an ICE config has no charging entities set,
 * so isConnected()/isCharging() are already false, but it's made explicit
 * here rather than relying on that as an implicit side effect.
 *
 * "Scheduled" was originally the catch-all for "connected but not actively
 * charging" — accurate for an integration whose only other charging_status
 * value means "waiting for the timer". Some integrations (e.g. ha-volvo-au)
 * also report a distinct "Done" (session finished, possibly below 100% when
 * charging to a target below full) and/or "Idle" — neither of which implies
 * a pending schedule, so they're read from the entity's own text rather than
 * folded into "scheduled".
 */
export function deriveChargeState(
  hass: HomeAssistant,
  entities: VolvoCardEntities,
  kind: VehicleKind
): ChargeState {
  if (kind === "ice") return "idle";
  if (!isConnected(hass, entities)) return "idle";
  if (isCharging(hass, entities)) return "charging";
  const s = (getState(hass, entities.charging_status) || "").toLowerCase();
  if (/\bdone\b|complete|finished/.test(s)) return "done";
  if (/\bidle\b/.test(s)) return "idle";
  return "scheduled";
}

export function statusKey(
  hass: HomeAssistant,
  entities: VolvoCardEntities,
  chargeState: ChargeState,
  kind: VehicleKind
): StatusKey {
  if (kind === "ice") {
    const isHome = getState(hass, entities.location) === "home";
    const isLocked = getState(hass, entities.lock) === "locked";
    if (isHome && !isLocked) return "unlocked";
    return "";
  }

  const isHome = getState(hass, entities.location) === "home";
  const isLocked = getState(hass, entities.lock) === "locked";
  const battery = numState(hass, entities.battery) ?? 0;
  const isFullyCharged = battery >= 100;

  if (isHome && !isLocked) return "unlocked";
  // "Done" only shows on the Charge tile, not up here — repeating it over the car photo
  // is redundant, so a finished session just falls through to the plain locked/unlocked
  // text below, the same way idle does.
  if (chargeState === "scheduled") {
    return isFullyCharged && isLocked ? "locked" : "scheduled";
  }
  if (chargeState === "charging") return "charging";
  if (isLocked) return "locked";
  return "";
}

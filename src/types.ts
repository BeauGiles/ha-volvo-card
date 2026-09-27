export interface HomeAssistant {
  states: {
    [entityId: string]: {
      state: string;
      attributes: Record<string, any>;
      last_changed?: string;
    };
  };
  locale?: { language?: string; time_format?: string };
  themes?: {
    darkMode: boolean;
  };
  callService(domain: string, service: string, serviceData?: Record<string, unknown>): Promise<unknown>;
}

export interface VolvoCardEntities {
  battery?: string;
  distance_to_empty_battery?: string;
  distance_to_empty_tank?: string;
  fuel_amount?: string;
  fuel_tank_capacity_l?: number;
  charging_connection_status?: string;
  charging_status?: string;
  lock?: string;
  location?: string;
  start_climatisation?: string;
  stop_climatisation?: string;
  /** Remaining charging time, e.g. the Volvo integration's `estimated_charging_time` sensor (minutes).
   *  Shown on the right of the status line while charging, like the Volvo app ("1 h 17 min left"). */
  charging_time_left?: string;
  /** Optional remote-control entities used by `controls: true`. */
  start_engine?: string;
  stop_engine?: string;
  engine_status?: string;
  flash?: string;
  honk?: string;
  honk_flash?: string;
}

export interface VolvoCardImages {
  exterior_back?: string;
  exterior_side_left?: string;
  fallback?: string;
}

export interface VolvoCardOverlay {
  cable_bottom?: string;
  cable_width?: string;
  pulse_left?: string;
  pulse_top?: string;
}

export interface VolvoCardLabels {
  unlocked?: string;
  locked?: string;
  scheduled?: string;
  charging?: string;
  lock?: string;
  unlock?: string;
  climate?: string;
  /** Header sub-labels and the charging-time suffix. */
  electric?: string;
  fuel?: string;
  fuel_level?: string;
  time_left?: string;
  /** Minutes word when less than an hour is left. A string, or plural forms keyed by
   *  Intl.PluralRules category, e.g. { one: "minuta", few: "minuty", many: "minut" }. */
  minutes?: string | Record<string, string>;
  /** Controls bar and tiles (`controls: true`). */
  start_car?: string;
  stop_car?: string;
  more?: string;
  flash?: string;
  honk?: string;
  honk_flash?: string;
  confirm?: string;
  charge?: string;
  charge_done_at?: string;
  charge_plugged_in?: string;
  charge_not_plugged_in?: string;
  climate_running?: string;
  climate_not_running?: string;
}

export interface VolvoCardConfig {
  type: string;
  name?: string;
  entities: VolvoCardEntities;
  images?: VolvoCardImages;
  labels?: VolvoCardLabels;
  /** Selects a built-in cable/pulse overlay preset tuned for this model, e.g. "v60". See overlays.ts. */
  model?: string;
  /** Overrides individual overlay values — takes precedence over the `model` preset. */
  overlay?: VolvoCardOverlay;
  /** "classic" (default): range-first header. "app": battery-first header like the Volvo Cars app —
   *  a hybrid always shows battery %, electric range and fuel range, also while charging. */
  header?: "classic" | "app";
  /** Adds the Volvo Cars app controls under the car: lock, climate, remote start and a "more"
   *  menu (flash / honk), plus Charge and Climate tiles. Unlock and remote start ask for a
   *  second tap to confirm. */
  controls?: boolean;
  /** Locale for plural forms and the clock in the Charge tile. Defaults to the HA user language. */
  locale?: string;
}

export type ChargeState = "idle" | "scheduled" | "charging";
export type VehicleKind = "hybrid" | "bev" | "ice" | "unknown";
export type StatusKey = "unlocked" | "locked" | "scheduled" | "charging" | "";

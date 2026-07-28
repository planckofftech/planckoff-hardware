/**
 * Canonical hardware quantity maths — the single source of truth for
 * "how many physical doors does a hardware set cover".
 *
 * A door schedule row is NOT one door: its QUANTITY column says how many
 * identical physical doors it represents. Hardware totals must multiply by
 * the SUM of those quantities, never by the row count.
 *
 * Doors flagged `HARDWARE INCLUDE/EXCLUDE = EXCLUDE` are dropped — they get
 * no hardware, so they must not inflate hardware quantities.
 *
 * Pure functions only: safe to import from both client components and
 * server-side services. (`import type` is erased at build time, so the
 * server-only supabase client in lib/db/hardware is never pulled in.)
 */

import type { Door, HardwareItem } from '@/types';
import type { MergedDoor } from '@/lib/db/hardware';

// ─── UI Door (post-transform) ─────────────────────────────────────────────────

/**
 * Physical doors represented by a single schedule row.
 * `transformDoors`/`transformFromFinalJson` already parse QUANTITY from
 * basic_information or the door section into `door.quantity`.
 */
export function getDoorQty(door: Door): number {
  return door.quantity != null && door.quantity > 0 ? door.quantity : 1;
}

/** True when this door is flagged to receive no hardware. */
export function isHardwareExcluded(door: Door): boolean {
  return (door.hardwareIncludeExclude ?? '').trim().toUpperCase().startsWith('EXCLUD');
}

/**
 * Physical door count a hardware set covers — hardware-excluded rows removed,
 * remaining rows summed by QUANTITY.
 *
 * Safe to call on an already-filtered list; the exclude pass is idempotent.
 */
export function getSetDoorQty(doors: Door[]): number {
  return doors.reduce((sum, d) => (isHardwareExcluded(d) ? sum : sum + getDoorQty(d)), 0);
}

/**
 * Canonical procurement quantity for one hardware item across a door
 * population — `item.quantity × physical doors`.
 *
 * Derived on every read rather than trusted from the persisted
 * `multipliedQuantity`, so it stays correct when doors are reassigned and
 * when the pricing report regroups over a filtered door subset.
 *
 * No floor of 1: a set covering zero included doors needs zero hardware.
 * Flooring would invent one of every item for fully-excluded sets.
 */
export function computeItemTotalQty(item: HardwareItem, setDoors: Door[]): number {
  return item.quantity * getSetDoorQty(setDoors);
}

// ─── MergedDoor (raw final_json shape) ────────────────────────────────────────

/** MergedDoor equivalent of {@link getDoorQty}, reading straight from sections. */
export function getMergedDoorQty(door: MergedDoor): number {
  const raw =
    door.sections?.basic_information?.['QUANTITY'] ??
    door.sections?.door?.['QUANTITY'] ??
    String(door.quantity ?? 1);
  return parseInt(raw) || 1;
}

/** MergedDoor equivalent of {@link isHardwareExcluded}. */
export function isMergedDoorHardwareExcluded(door: MergedDoor): boolean {
  return (door.sections?.hardware?.['HARDWARE INCLUDE/EXCLUDE'] ?? '')
    .trim()
    .toUpperCase()
    .startsWith('EXCLUD');
}

/** MergedDoor equivalent of {@link getSetDoorQty}. */
export function getMergedSetDoorQty(doors: MergedDoor[]): number {
  return doors.reduce(
    (sum, d) => (isMergedDoorHardwareExcluded(d) ? sum : sum + getMergedDoorQty(d)),
    0,
  );
}

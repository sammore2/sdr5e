import { keptAttackD20 } from './attack-target-mechanics.mjs';

/** Natural 20 on the kept d20 of an attack roll; dropped advantage dice do not count. */
export function attackRollIsCritical(roll = {}) {
  return keptAttackD20(roll) === 20;
}

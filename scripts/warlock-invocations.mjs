export const WARLOCK_LEVEL_ONE_INVOCATIONS = Object.freeze([
  { identifier: 'armor-of-shadows', name: 'Armor of Shadows', summary: 'Cast Mage Armor on yourself without expending a spell slot.' },
  { identifier: 'eldritch-mind', name: 'Eldritch Mind', summary: 'Gain Advantage on Constitution saves to maintain Concentration.' },
  { identifier: 'pact-of-the-blade', name: 'Pact of the Blade', summary: 'Conjure or bond with a melee pact weapon; use Charisma for its attacks and damage.' },
  { identifier: 'pact-of-the-chain', name: 'Pact of the Chain', summary: 'Learn Find Familiar and gain the pact familiar options and reaction attack.' },
  { identifier: 'pact-of-the-tome', name: 'Pact of the Tome', summary: 'Conjure a Book of Shadows with three cantrips and two level-1 Ritual spells.' },
]);

export function resolveWarlockLevelOneInvocation(identifier) {
  const invocation = WARLOCK_LEVEL_ONE_INVOCATIONS.find((entry) => entry.identifier === identifier);
  return invocation
    ? { valid: true, reason: '', invocation }
    : { valid: false, reason: 'invocation-choice-required', invocation: null };
}

/** Validate a simple equal award amount entered per character on a group sheet. */
export function groupXpAwardPreview(xpPerCharacter, recipientCount) {
  const xp = Number(xpPerCharacter);
  const recipients = Number(recipientCount);
  if (!Number.isSafeInteger(xp) || xp <= 0) throw new RangeError('XP must be a positive whole number.');
  if (!Number.isSafeInteger(recipients) || recipients <= 0) throw new RangeError('At least one character must receive XP.');
  const totalXp = xp * recipients;
  if (!Number.isSafeInteger(totalXp)) throw new RangeError('The total XP award is too large.');
  return { xpPerCharacter: xp, recipientCount: recipients, totalXp };
}

/** Resolve selected recipients against current group membership; default to all. */
export function resolveGroupXpRecipients(groupMemberIds, selectedMemberIds, chooseSpecific = false) {
  if (!Array.isArray(groupMemberIds)) throw new TypeError('Group members must be an array.');
  const members = [...new Set(groupMemberIds.filter((id) => typeof id === 'string' && id.length > 0))];
  if (!chooseSpecific) return members;
  if (!Array.isArray(selectedMemberIds)) throw new TypeError('Selected members must be an array.');
  const selected = [...new Set(selectedMemberIds.filter((id) => typeof id === 'string' && id.length > 0))];
  if (selected.some((id) => !members.includes(id))) throw new RangeError('An XP recipient is not a group member.');
  return selected;
}

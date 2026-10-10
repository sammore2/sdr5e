import { isCurrentClassFeatureIdentity } from './class-feature-source-contract.mjs';

export function selectClassFeaturesToGrant(entries, classIdentifier, fromLevel, toLevel, existingItems = []) {
  const candidates = entries.filter((entry) => {
    const data = entry.data || {};
    const level = Number(data.levelGained) || 0;
    return data.classIdentifier === classIdentifier && level > fromLevel && level <= toLevel;
  });
  const compatible = candidates.filter((entry) => {
    const source = String(entry.data?.source || '');
    if (!source) return false;
    if (!source.startsWith('SRD')) return true; // explicitly sourced homebrew/third-party class content
    return source.startsWith('SRD 5.2')
      && isCurrentClassFeatureIdentity(classIdentifier, entry.data?.levelGained, entry.name);
  });
  const selected = compatible
    .sort((a, b) => (Number(a.data?.levelGained) || 0) - (Number(b.data?.levelGained) || 0))
    .filter((entry) => {
      const superseded = entry.data?.supersedesName;
      const replacing = superseded && existingItems.some((item) => {
        const data = item.system || item.data || {};
        return item.name === superseded && data.classIdentifier === classIdentifier;
      });
      if (replacing) return true;
      return !existingItems.some((item) => {
        const data = item.system || item.data || {};
        return item.name === entry.name
          && data.classIdentifier === classIdentifier
          && Number(data.levelGained) === Number(entry.data?.levelGained);
      });
    });
  return { candidates, compatible, selected, skippedSourceCount: candidates.length - compatible.length };
}

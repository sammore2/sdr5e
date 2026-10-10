function parseAdditiveDamageFormula(formula) {
  const compact = String(formula || '0').replace(/\s+/g, '');
  const tokens = [...compact.matchAll(/[+-]?(?:\d*d\d+|\d+)/gi)].map((match) => match[0]);
  if (!tokens.length || tokens.join('') !== compact) return null;
  return tokens.map((token) => {
    const sign = token.startsWith('-') ? -1 : 1;
    const body = token.replace(/^[+-]/, '');
    const die = body.match(/^(\d*)d(\d+)$/i);
    return { sign, body, count: die ? Number(die[1]) || 1 : 0, faces: die ? Number(die[2]) : 0 };
  });
}

function formatTerms(terms) {
  return terms.map(({ sign, body }, index) => `${index === 0 ? (sign < 0 ? '-' : '') : (sign < 0 ? ' - ' : ' + ')}${body}`).join('');
}

/**
 * Build an additive server-roll formula. SRD 5.2 (Critical Hits): roll the
 * damage dice twice; flat modifiers are added once.
 */
export function damageRollFormula(formula, critical = false) {
  const terms = parseAdditiveDamageFormula(formula);
  if (!terms) throw new TypeError(`Unsupported additive damage formula: ${formula}`);
  if (!critical) return formatTerms(terms);

  const result = terms.map((term) => (term.count
    ? { sign: term.sign, body: `${term.count * 2}d${term.faces}` }
    : { sign: term.sign, body: term.body }));
  return formatTerms(result);
}

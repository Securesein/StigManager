const { distance }         = require('fastest-levenshtein');
const { CONFIDENCE, FUZZY_THRESHOLD } = require('../shared/constants');

// ── Hulpfuncties ──────────────────────────────────────────────────────────────

function normalizeTitle(str) {
  return (str || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function titleSimilarity(a, b) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - distance(na, nb) / maxLen;
}

// ── Matching ──────────────────────────────────────────────────────────────────

/**
 * Vergelijkt twee lijsten van regels (oud → nieuw) via gelaagde matching.
 * Geeft een array van mapping-objecten terug, klaar voor insertie in version_mappings.
 *
 * Lagen:
 *  1. Exact Vuln-ID   → confidence 1.00
 *  2. Exact STIG-ID   → confidence 0.95
 *  3. Exacte title    → confidence 0.85
 *  4. Fuzzy title     → confidence variabel (Levenshtein), drempel 0.75
 *  5. Geen match      → method 'unmatched'
 *
 * Nieuwe regels zonder oud equivalent krijgen method 'new'.
 */
function matchRules(oldRules, newRules) {
  const mappings      = [];
  const matchedNewIds = new Set();

  // Bouw lookup-maps voor snelle exacte zoekopdrachten
  const byVulnId  = new Map();
  const byStigId  = new Map();
  const byTitle   = new Map();

  for (const r of newRules) {
    if (r.vuln_id) byVulnId.set(r.vuln_id.trim(),          r);
    if (r.stig_id) byStigId.set(r.stig_id.trim(),          r);
    if (r.rule_title) byTitle.set(normalizeTitle(r.rule_title), r);
  }

  for (const oldRule of oldRules) {
    let matched = null;

    // Laag 1: Exact Vuln-ID
    if (!matched && oldRule.vuln_id) {
      const found = byVulnId.get(oldRule.vuln_id.trim());
      if (found && !matchedNewIds.has(found.id)) {
        matched = { new_rule: found, confidence: CONFIDENCE.VULN_ID, match_method: 'vuln_id' };
      }
    }

    // Laag 2: Exact STIG-ID
    if (!matched && oldRule.stig_id) {
      const found = byStigId.get(oldRule.stig_id.trim());
      if (found && !matchedNewIds.has(found.id)) {
        matched = { new_rule: found, confidence: CONFIDENCE.STIG_ID, match_method: 'stig_id' };
      }
    }

    // Laag 3: Exacte title
    if (!matched && oldRule.rule_title) {
      const found = byTitle.get(normalizeTitle(oldRule.rule_title));
      if (found && !matchedNewIds.has(found.id)) {
        matched = { new_rule: found, confidence: CONFIDENCE.TITLE, match_method: 'title' };
      }
    }

    // Laag 4: Fuzzy title (Levenshtein)
    if (!matched && oldRule.rule_title) {
      let bestSim  = 0;
      let bestRule = null;

      for (const newRule of newRules) {
        if (matchedNewIds.has(newRule.id)) continue;
        const sim = titleSimilarity(oldRule.rule_title, newRule.rule_title);
        if (sim > bestSim) {
          bestSim  = sim;
          bestRule = newRule;
        }
      }

      if (bestSim >= FUZZY_THRESHOLD) {
        matched = { new_rule: bestRule, confidence: bestSim, match_method: 'fuzzy' };
      }
    }

    if (matched) {
      matchedNewIds.add(matched.new_rule.id);
      mappings.push({
        old_rule_id:  oldRule.id,
        new_rule_id:  matched.new_rule.id,
        confidence:   matched.confidence,
        match_method: matched.match_method,
      });
    } else {
      // Laag 5: Geen match gevonden
      mappings.push({
        old_rule_id:  oldRule.id,
        new_rule_id:  null,
        confidence:   0,
        match_method: 'unmatched',
      });
    }
  }

  // Nieuwe regels zonder oud equivalent
  for (const newRule of newRules) {
    if (!matchedNewIds.has(newRule.id)) {
      mappings.push({
        old_rule_id:  null,
        new_rule_id:  newRule.id,
        confidence:   0,
        match_method: 'new',
      });
    }
  }

  return mappings;
}

// ── Annotatie-overdracht beslissing ───────────────────────────────────────────

/**
 * Bepaalt of en hoe een annotatie overgedragen mag worden op basis van confidence.
 * @returns {{ carry: boolean, needsReview: boolean }}
 */
function shouldCarryOverAnnotation(confidence) {
  if (confidence >= 0.85) return { carry: true,  needsReview: false };
  if (confidence >= 0.75) return { carry: true,  needsReview: true  };
  return                         { carry: false, needsReview: false };
}

/**
 * Groepeert mappings in drie categorieën voor de VersionCompare UI.
 */
function categorizeMappings(mappings) {
  const autoCarried    = [];
  const needsReview    = [];
  const newOrUnmatched = [];

  for (const m of mappings) {
    if (m.match_method === 'new' || m.match_method === 'unmatched') {
      newOrUnmatched.push(m);
    } else {
      const { needsReview: review } = shouldCarryOverAnnotation(m.confidence);
      if (review) {
        needsReview.push(m);
      } else {
        autoCarried.push(m);
      }
    }
  }

  return { autoCarried, needsReview, newOrUnmatched };
}

module.exports = { matchRules, shouldCarryOverAnnotation, categorizeMappings, titleSimilarity };

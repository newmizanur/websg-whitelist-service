import type { WhitelistEntry } from '../entities/whitelist-entry.entity.js';

export interface WhitelistTfvarsEntryMetadata {
  tenant: string;
  addedAt: string;
}

export interface WhitelistTfvars {
  cms_whitelist_ips: Record<string, WhitelistTfvarsEntryMetadata>;
}

/**
 * When multiple tenants hold the same IP, the JSON structure has room for only
 * one {tenant, addedAt} per key — the earliest attribution wins so the
 * metadata reflects who first added it, not whoever's row happens to sort last.
 */
function isEarlierAttribution(
  candidate: WhitelistEntry,
  current: WhitelistEntry,
): boolean {
  const candidateTime = candidate.addedAt.getTime();
  const currentTime = current.addedAt.getTime();
  if (candidateTime !== currentTime) {
    return candidateTime < currentTime;
  }
  return candidate.tenantId < current.tenantId;
}

export function buildWhitelistTfvars(
  activeEntries: readonly WhitelistEntry[],
): WhitelistTfvars {
  const earliestByIp = new Map<string, WhitelistEntry>();

  for (const entry of activeEntries) {
    const current = earliestByIp.get(entry.ip);
    if (!current || isEarlierAttribution(entry, current)) {
      earliestByIp.set(entry.ip, entry);
    }
  }

  const cms_whitelist_ips: Record<string, WhitelistTfvarsEntryMetadata> = {};
  for (const ip of [...earliestByIp.keys()].sort()) {
    const entry = earliestByIp.get(ip)!;
    cms_whitelist_ips[ip] = {
      tenant: entry.tenantId,
      addedAt: entry.addedAt.toISOString(),
    };
  }

  return { cms_whitelist_ips };
}

export function generateWhitelistTfvarsContent(
  activeEntries: readonly WhitelistEntry[],
): string {
  return `${JSON.stringify(buildWhitelistTfvars(activeEntries), null, 2)}\n`;
}

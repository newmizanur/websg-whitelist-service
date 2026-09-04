import type { WhitelistEntry } from '../entities/whitelist-entry.entity.js';
import { normalizeWhitelistIpAddress } from '../validators/is-whitelist-ip-address.validator.js';

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
    // AWS WAFv2 IPSet requires CIDR notation for every address — normalizing
    // here (not just at write-time in IpAddressesService) is what's needed
    // for the generator's own output contract to actually be guaranteed
    // rather than just assumed, and it also correctly dedups a legacy
    // un-normalized row against its CIDR-form equivalent.
    const ip = normalizeWhitelistIpAddress(entry.ip);
    const current = earliestByIp.get(ip);
    if (!current || isEarlierAttribution(entry, current)) {
      earliestByIp.set(ip, entry);
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

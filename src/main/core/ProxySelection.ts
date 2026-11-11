import type { ProfileItem } from '@shared/profile'
import type { ProxyGroup } from '@shared/mihomo'
import type { MihomoApiClient } from './MihomoApiClient'
import { logger } from '../utils/logger'

export async function restoreProxySelection(
  profile: ProfileItem | null,
  client: Pick<MihomoApiClient, 'getProxies' | 'selectProxy'>
): Promise<void> {
  if (!profile?.selectedGroupProxies || !Object.keys(profile.selectedGroupProxies).length) return
  const proxies = await client.getProxies()
  for (const [group, node] of Object.entries(profile.selectedGroupProxies)) {
    if (!(proxies[group] as ProxyGroup | undefined)?.all?.includes(node)) continue
    try { await client.selectProxy(group, node) }
    catch (error) { logger.warn(`Could not restore selected proxy for ${group}: ${String(error)}`) }
  }
}

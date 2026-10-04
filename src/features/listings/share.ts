import type { PublicSettings } from '../../lib/api/types';

/** t.me/<bot>/<app>?startapp=p_<id> when configured, otherwise the web URL. */
export function listingShareLink(settings: PublicSettings | undefined, id: string): string {
  if (settings?.bot_username && settings.mini_app_short_name) {
    return `https://t.me/${settings.bot_username}/${settings.mini_app_short_name}?startapp=p_${id}`;
  }
  return `${window.location.origin}${window.location.pathname}#/p/${id}`;
}

import { Peer } from './types';

/**
 * Wire-format normaliser for the peer roster.
 *
 * The relay speaks snake_case (`peer_id`, `is_host`, `has_key`) because that
 * is the shape the REST/WebSocket API uses everywhere, while the UI works
 * with camelCase (`Peer`). Normalising once at the boundary keeps a single
 * source of truth and makes the UI resilient to a rolling deploy against an
 * older or newer backend.
 *
 * Getting this wrong used to blank the whole room screen: `ParticipantList`
 * rendered `p.peerId.replace(...)` on an `undefined` peer id, React unmounted
 * the tree, and the user saw a white page with no error.
 */
export function normalizePeer(raw: unknown): Peer {
  const p = (raw || {}) as Record<string, unknown>;
  const peerId = String(p.peer_id ?? p.peerId ?? '');
  return {
    peerId,
    alias: String(p.alias ?? ''),
    isHost: Boolean(p.is_host ?? p.isHost),
    hasKey: Boolean(p.has_key ?? p.hasKey),
  };
}

export function normalizePeers(raw: unknown): Peer[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizePeer)
    .filter((p) => p.peerId.length > 0);
}

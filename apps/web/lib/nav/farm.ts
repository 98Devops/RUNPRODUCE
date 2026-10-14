/**
 * What every farm tab reads first (AD-104, U7 D27): the user, their farm and
 * role, and the open batches. Read once per request: `cache` lets the layout
 * and the page both ask without a second round trip. A server action is its
 * own request and reads again, which is the point (D12).
 *
 * One farm per member: the first membership is the farm. A second farm is not
 * in scope, and `capture_batches()` would then mix the two farms' batches.
 */
import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requestSessionClient } from '@/lib/auth/server';
import {
  captureBatches,
  currentUser,
  myMemberships,
  type CaptureBatch,
  type Membership,
  type SignedInUser
} from '@/lib/repositories';

export type FarmContext =
  | { readonly kind: 'signed_out' }
  | { readonly kind: 'no_access'; readonly user: SignedInUser }
  | {
      readonly kind: 'farm';
      readonly client: SupabaseClient;
      readonly user: SignedInUser;
      readonly membership: Membership;
      readonly batches: readonly CaptureBatch[];
    };

export const loadFarm = cache(async (): Promise<FarmContext> => {
  const client = await requestSessionClient();
  const user = await currentUser(client);
  if (user === null) return { kind: 'signed_out' };
  const [membership] = await myMemberships(client);
  if (membership === undefined) return { kind: 'no_access', user };
  const batches = await captureBatches(client);
  return { kind: 'farm', client, user, membership, batches };
});

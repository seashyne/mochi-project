// Server-owned authority for replicated objects.
//
// The client-side replication channel refuses a delta for an object it owns, but
// that is only a local convention: a modified client can ignore it. This table is
// the room's own record of who owns what, so a peer cannot overwrite someone
// else's object no matter what it sends.

export class OwnershipTable {
  private readonly owners = new Map<string, string>();

  ownerOf(objectId: string): string | null {
    return this.owners.get(objectId) ?? null;
  }

  /**
   * First writer wins, enforced here rather than in each client. Returns false
   * when another player owns the object, which is the signal to drop the entry.
   */
  claim(objectId: string, playerId: string): boolean {
    const owner = this.owners.get(objectId);
    if (owner === undefined) {
      this.owners.set(objectId, playerId);
      return true;
    }
    return owner === playerId;
  }

  /** Only the owner may remove an object. */
  release(objectId: string, playerId: string): boolean {
    if (this.owners.get(objectId) !== playerId) return false;
    this.owners.delete(objectId);
    return true;
  }

  /** Frees everything a disconnected player owned, so the objects are claimable. */
  dropPlayer(playerId: string): string[] {
    const freed: string[] = [];
    for (const [objectId, owner] of this.owners) {
      if (owner !== playerId) continue;
      this.owners.delete(objectId);
      freed.push(objectId);
    }
    return freed;
  }

  get size(): number {
    return this.owners.size;
  }
}

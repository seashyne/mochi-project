// Multiplayer peer replication and interpolation manager for Mochi 3D runtime
// Synchronizes remote player avatars, orientations, and smooth lerp interpolation

import * as THREE from 'three';
import { RealtimeRoomClient } from '../api/rooms';
import { PlayerPresence, RoomEvent, TransformDeltaPayload } from '../api/types';
import { createPeerAvatar } from './peerAvatar';

// Every subscription is the same shape: add, return the remover.
function addListener<T>(set: Set<T>, listener: T): () => void {
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}

export interface RemotePeer {
  id: string;
  username: string;
  group: THREE.Group;
  targetPosition: THREE.Vector3;
  targetRotation: number;
  lastUpdate: number;
}

export class MultiplayerManager {
  private peers: Map<string, RemotePeer> = new Map();
  private scene: THREE.Scene | null = null;
  private roomClient: RealtimeRoomClient | null = null;
  private unsubscribeRoom: (() => void) | null = null;
  private lastBroadcastTime = 0;
  private readonly BROADCAST_INTERVAL_MS = 50; // 20Hz update tick
  private scriptRpcListeners: Set<(eventName: string, data: unknown) => void> = new Set();
  private stateReplicateListeners: Set<(key: string, value: unknown) => void> = new Set();
  private worldOpListeners: Set<(op: unknown) => void> = new Set();
  private localPlayerId: string | null = null;
  private correctionListeners = new Set<(position: { x: number; y: number; z: number }) => void>();
  private transformDeltaListeners: Set<
    (payload: TransformDeltaPayload, senderId: string) => void
  > = new Set();

  public attach(scene: THREE.Scene, client: RealtimeRoomClient): void {
    this.scene = scene;
    this.roomClient = client;

    this.unsubscribeRoom = client.subscribe((event: RoomEvent) => {
      this.handleRoomEvent(event);
    });
  }

  public detach(): void {
    if (this.unsubscribeRoom) {
      this.unsubscribeRoom();
      this.unsubscribeRoom = null;
    }
    this.peers.forEach((peer) => {
      if (this.scene) {
        this.scene.remove(peer.group);
      }
    });
    this.peers.clear();
    this.scene = null;
    this.roomClient = null;
  }

  // Update local player position and broadcast throttled state to room
  public updateLocalPlayer(position: THREE.Vector3, rotationY: number): void {
    if (!this.roomClient || !this.roomClient.isConnected()) return;

    const now = performance.now();
    if (now - this.lastBroadcastTime >= this.BROADCAST_INTERVAL_MS) {
      this.lastBroadcastTime = now;
      this.roomClient.send({
        type: 'player_state',
        timestamp: Date.now(),
        data: {
          x: Number(position.x.toFixed(2)),
          y: Number(position.y.toFixed(2)),
          z: Number(position.z.toFixed(2)),
          rotation: Number(rotationY.toFixed(2))
        }
      });
    }
  }

  // Interpolate remote peer avatars smoothly each render frame
  public update(deltaTime: number): void {
    const lerpFactor = Math.min(1, deltaTime * 12);
    this.peers.forEach((peer) => {
      peer.group.position.lerp(peer.targetPosition, lerpFactor);
      peer.group.rotation.y = THREE.MathUtils.lerp(peer.group.rotation.y, peer.targetRotation, lerpFactor);
    });
  }

  public getPeers(): RemotePeer[] {
    return Array.from(this.peers.values());
  }

  public sendScriptRpc(eventName: string, data?: unknown): void {
    if (!this.roomClient || !this.roomClient.isConnected()) return;
    this.roomClient.send({
      type: 'script_rpc',
      timestamp: Date.now(),
      data: { eventName, data }
    });
  }

  public onScriptRpc(listener: (eventName: string, data: unknown) => void): () => void {
    return addListener(this.scriptRpcListeners, listener);
  }

  public onStateReplicate(listener: (key: string, value: unknown) => void): () => void {
    return addListener(this.stateReplicateListeners, listener);
  }

  /** Relays a runtime world edit (object spawned/destroyed) to the other players. */
  public sendWorldOp(op: unknown): void {
    if (!this.roomClient || !this.roomClient.isConnected()) return;
    this.roomClient.send({ type: 'world_op', timestamp: Date.now(), data: op });
  }

  public onWorldOp(listener: (op: unknown) => void): () => void {
    return addListener(this.worldOpListeners, listener);
  }

  /** This client's own player id, so a server correction can be recognised. */
  public setLocalPlayerId(id: string | null): void {
    this.localPlayerId = id;
  }

  /** Fires when the room overrules this client's position. */
  public onCorrection(listener: (position: { x: number; y: number; z: number }) => void): () => void {
    return addListener(this.correctionListeners, listener);
  }

  /** Relays a delta of object transforms to the other players in the room. */
  public sendTransformDelta(payload: TransformDeltaPayload): void {
    if (!this.roomClient || !this.roomClient.isConnected()) return;
    this.roomClient.send({ type: 'transform_delta', timestamp: Date.now(), data: payload });
  }

  public onTransformDelta(
    listener: (payload: TransformDeltaPayload, senderId: string) => void
  ): () => void {
    this.transformDeltaListeners.add(listener);
    return () => this.transformDeltaListeners.delete(listener);
  }

  private handleRoomEvent(event: RoomEvent): void {
    switch (event.type) {
      case 'script_rpc': {
        const payload = event.data as { eventName?: string; data?: unknown } | undefined;
        if (payload?.eventName) {
          this.scriptRpcListeners.forEach((listener) => listener(payload.eventName!, payload.data));
        }
        break;
      }
      case 'state_replicate': {
        const payload = event.data as { key?: string; value?: unknown } | undefined;
        if (payload?.key) {
          this.stateReplicateListeners.forEach((listener) => listener(payload.key!, payload.value));
        }
        break;
      }
      case 'transform_delta': {
        const payload = event.data as TransformDeltaPayload | undefined;
        if (payload && Array.isArray(payload.entries)) {
          const senderId = event.senderId ?? 'peer';
          this.transformDeltaListeners.forEach((listener) => listener(payload, senderId));
        }
        break;
      }
      case 'world_op': {
        const payload = event.data as { kind?: string } | undefined;
        if (payload && (payload.kind === 'spawn' || payload.kind === 'destroy')) {
          this.worldOpListeners.forEach((listener) => listener(payload));
        }
        break;
      }
      case 'room_state': {
        const data = event.data as
          | { playerId?: string; players?: PlayerPresence[] }
          | undefined;
        if (data && Array.isArray(data.players)) {
          data.players.forEach((p) => {
            if (p.id && p.id !== data.playerId) {
              this.upsertPeer(p);
            }
          });
        }
        break;
      }
      case 'player_joined': {
        const presence = event.data as PlayerPresence | undefined;
        if (presence && presence.id) {
          this.upsertPeer(presence);
        }
        break;
      }
      case 'player_state': {
        const presence = event.data as (PlayerPresence & { corrected?: string }) | undefined;
        if (presence?.id) {
          // A correction about this client: snap instead of drawing a peer.
          if (presence.corrected && presence.id === this.localPlayerId) {
            const position = { x: presence.x ?? 0, y: presence.y ?? 0, z: presence.z ?? 0 };
            this.correctionListeners.forEach((listener) => listener(position));
            break;
          }
          this.upsertPeer(presence);
        }
        break;
      }
      case 'player_left': {
        const data = event.data as { playerId?: string } | undefined;
        const targetId = data?.playerId || event.senderId;
        if (targetId) {
          this.removePeer(targetId);
        }
        break;
      }
    }
  }

  private upsertPeer(presence: PlayerPresence): void {
    if (!this.scene) return;
    let peer = this.peers.get(presence.id);

    if (!peer) {
      const group = createPeerAvatar(presence.username);
      this.scene.add(group);
      peer = {
        id: presence.id,
        username: presence.username,
        group,
        targetPosition: new THREE.Vector3(presence.x || 0, presence.y || 0, presence.z || 0),
        targetRotation: presence.rotation || 0,
        lastUpdate: Date.now()
      };
      peer.group.position.copy(peer.targetPosition);
      this.peers.set(presence.id, peer);
    } else {
      if (typeof presence.x === 'number' && typeof presence.y === 'number' && typeof presence.z === 'number') {
        peer.targetPosition.set(presence.x, presence.y, presence.z);
      }
      if (typeof presence.rotation === 'number') {
        peer.targetRotation = presence.rotation;
      }
      peer.lastUpdate = Date.now();
    }
  }

  private removePeer(id: string): void {
    const peer = this.peers.get(id);
    if (peer && this.scene) {
      this.scene.remove(peer.group);
      this.peers.delete(id);
    }
  }

}

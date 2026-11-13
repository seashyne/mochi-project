// The client must snap to a room correction, not draw itself as a remote peer.

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { MultiplayerManager } from '../src/engine/multiplayerManager';
import type { RoomEvent } from '../src/api/types';

function harness() {
  let handler: ((event: RoomEvent) => void) | null = null;
  const client = {
    subscribe: (fn: (event: RoomEvent) => void) => {
      handler = fn;
      return () => {
        handler = null;
      };
    },
    isConnected: () => true,
    send: vi.fn()
  };
  const scene = new THREE.Scene();
  const manager = new MultiplayerManager();
  manager.attach(scene, client as never);
  return {
    manager,
    scene,
    emit: (event: RoomEvent) => handler?.(event)
  };
}

describe('player correction', () => {
  it('hands a server correction about this client to the snap listener', () => {
    const { manager, scene, emit } = harness();
    manager.setLocalPlayerId('me');
    const onCorrection = vi.fn();
    manager.onCorrection(onCorrection);

    emit({
      type: 'player_state',
      senderId: 'server',
      data: { id: 'me', username: 'me', x: 1, y: 2, z: 3, corrected: 'teleport' }
    });

    expect(onCorrection).toHaveBeenCalledWith({ x: 1, y: 2, z: 3 });
    expect(scene.children).toHaveLength(0);
  });

  it('ignores a correction about somebody else', () => {
    const { manager, emit } = harness();
    manager.setLocalPlayerId('me');
    const onCorrection = vi.fn();
    manager.onCorrection(onCorrection);

    emit({
      type: 'player_state',
      senderId: 'server',
      data: { id: 'other', x: 9, y: 0, z: 9, corrected: 'speed' }
    });

    expect(onCorrection).not.toHaveBeenCalled();
  });

  it('still draws a normal remote player as a peer', () => {
    const { scene, emit } = harness();
    emit({
      type: 'player_state',
      senderId: 'peer-2',
      data: { id: 'peer-2', username: 'Peer', x: 4, y: 0, z: 4 }
    });
    expect(scene.children).toHaveLength(1);
  });

  it('stops delivering corrections once the listener is detached', () => {
    const { manager, emit } = harness();
    manager.setLocalPlayerId('me');
    const onCorrection = vi.fn();
    const detach = manager.onCorrection(onCorrection);
    detach();

    emit({
      type: 'player_state',
      senderId: 'server',
      data: { id: 'me', x: 1, y: 0, z: 1, corrected: 'speed' }
    });

    expect(onCorrection).not.toHaveBeenCalled();
  });
});

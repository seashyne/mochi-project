// Unit and integration test suite for Realtime Multiplayer Runtime & WebSocket synchronization
// Verifies peer avatar creation, position replication, room events, and throttled state broadcast

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { MultiplayerManager } from '../src/engine/multiplayerManager';
import { getRoomWebSocketUrl, RealtimeRoomClient } from '../src/api/rooms';
import { RoomEvent } from '../src/api/types';

describe('Realtime Multiplayer Runtime Subsystem', () => {
  describe('Room WebSocket URL Resolution', () => {
    it('constructs valid wss:// URL from custom staging/production host', () => {
      const url = getRoomWebSocketUrl('room_speed_run', 'jwt_test_token', 'usr_99', 'https://api-game.lenout.com');
      expect(url).toContain('wss://api-game.lenout.com/api/v1/rooms/room_speed_run/ws');
      expect(url).toContain('token=jwt_test_token');
      expect(url).toContain('playerId=usr_99');
    });

    it('falls back to ws:// for non-secure HTTP local development endpoints', () => {
      const url = getRoomWebSocketUrl('lobby', undefined, undefined, 'http://localhost:8787');
      expect(url).toBe('ws://localhost:8787/api/v1/rooms/lobby/ws');
    });
  });

  describe('MultiplayerManager Peer Replication & Avatars', () => {
    let scene: THREE.Scene;
    let manager: MultiplayerManager;
    let mockClient: RealtimeRoomClient;
    let emittedEvents: RoomEvent[] = [];

    beforeEach(() => {
      scene = new THREE.Scene();
      manager = new MultiplayerManager();
      emittedEvents = [];

      mockClient = {
        roomId: 'room_test_1',
        isConnected: () => true,
        send: vi.fn((e: RoomEvent) => emittedEvents.push(e)),
        subscribe: (handler: (e: RoomEvent) => void) => {
          (mockClient as unknown as { emit: (e: RoomEvent) => void }).emit = handler;
          return () => {};
        }
      } as unknown as RealtimeRoomClient;

      manager.attach(scene, mockClient);
    });

    afterEach(() => {
      manager.detach();
      scene.clear();
    });

    it('creates 3D avatar mesh in scene upon player_joined room event', () => {
      expect(manager.getPeers()).toHaveLength(0);

      (mockClient as unknown as { emit: (e: RoomEvent) => void }).emit({
        type: 'player_joined',
        timestamp: Date.now(),
        data: {
          id: 'peer_1',
          username: 'CyberPilot',
          x: 5,
          y: 1,
          z: -10,
          rotation: 1.5,
          joinedAt: Date.now()
        }
      });

      const peers = manager.getPeers();
      expect(peers).toHaveLength(1);
      expect(peers[0].id).toBe('peer_1');
      expect(peers[0].username).toBe('CyberPilot');
      expect(peers[0].group.name).toBe('avatar_CyberPilot');
      expect(scene.children.some((c) => c === peers[0].group)).toBe(true);
    });

    it('updates remote peer targetPosition and rotation upon player_state event', () => {
      (mockClient as unknown as { emit: (e: RoomEvent) => void }).emit({
        type: 'player_joined',
        timestamp: Date.now(),
        data: { id: 'peer_2', username: 'Astra', x: 0, y: 0, z: 0, joinedAt: Date.now() }
      });

      (mockClient as unknown as { emit: (e: RoomEvent) => void }).emit({
        type: 'player_state',
        timestamp: Date.now(),
        data: { id: 'peer_2', username: 'Astra', x: 12.5, y: 3.0, z: -8.0, rotation: 3.14 }
      });

      const peer = manager.getPeers().find((p) => p.id === 'peer_2');
      expect(peer).toBeDefined();
      expect(peer?.targetPosition.x).toBe(12.5);
      expect(peer?.targetPosition.y).toBe(3.0);
      expect(peer?.targetPosition.z).toBe(-8.0);
      expect(peer?.targetRotation).toBe(3.14);
    });

    it('interpolates avatar position towards targetPosition during update tick', () => {
      (mockClient as unknown as { emit: (e: RoomEvent) => void }).emit({
        type: 'player_joined',
        timestamp: Date.now(),
        data: { id: 'peer_lerp', username: 'Lerper', x: 0, y: 0, z: 0, joinedAt: Date.now() }
      });

      const peer = manager.getPeers()[0];
      peer.targetPosition.set(10, 0, 10);

      const initialDist = peer.group.position.distanceTo(peer.targetPosition);
      manager.update(0.016); // 1 frame (~16ms)
      const afterDist = peer.group.position.distanceTo(peer.targetPosition);

      expect(afterDist).toBeLessThan(initialDist);
    });

    it('removes 3D avatar from scene upon player_left event', () => {
      (mockClient as unknown as { emit: (e: RoomEvent) => void }).emit({
        type: 'player_joined',
        timestamp: Date.now(),
        data: { id: 'peer_leaving', username: 'DepartingPlayer', x: 1, y: 1, z: 1, joinedAt: Date.now() }
      });

      expect(manager.getPeers()).toHaveLength(1);

      (mockClient as unknown as { emit: (e: RoomEvent) => void }).emit({
        type: 'player_left',
        timestamp: Date.now(),
        data: { playerId: 'peer_leaving' }
      });

      expect(manager.getPeers()).toHaveLength(0);
      expect(scene.children.some((c) => c.name === 'avatar_DepartingPlayer')).toBe(false);
    });

    it('throttles local player broadcast to maintain smooth network budget', () => {
      const pos = new THREE.Vector3(2, 0, 4);
      manager.updateLocalPlayer(pos, 0.5);
      expect(mockClient.send).toHaveBeenCalledTimes(1);

      // Immediate subsequent call should be throttled
      manager.updateLocalPlayer(pos, 0.5);
      expect(mockClient.send).toHaveBeenCalledTimes(1);
    });
  });
});

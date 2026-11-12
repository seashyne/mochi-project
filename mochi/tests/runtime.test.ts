// Unit tests for Mochi Web Client API, Rooms, and Input Controller

import { describe, it, expect } from 'vitest';
import { ApiClient, resolveDefaultApiUrl } from '../src/api/client';
import { getRoomWebSocketUrl } from '../src/api/rooms';
import { InputController } from '../src/engine/inputController';
import { RuntimeEngine } from '../src/engine/runtimeEngine';

describe('Mochi Web Client & Runtime Foundation', () => {
  it('resolves parameterized default API URL and allows runtime override', () => {
    const defaultUrl = resolveDefaultApiUrl();
    expect(defaultUrl).toContain('http');

    const client = new ApiClient({ baseUrl: 'https://custom-domain.example.com/' });
    expect(client.getBaseUrl()).toBe('https://custom-domain.example.com');
  });

  it('constructs parameterized WebSocket room URLs for secure and local origins', () => {
    const wssUrl = getRoomWebSocketUrl(
      'room_alpha',
      'tok_123',
      'plr_1',
      'https://api-game.lenout.com'
    );
    expect(wssUrl).toBe(
      'wss://api-game.lenout.com/api/v1/rooms/room_alpha/ws?token=tok_123&playerId=plr_1'
    );

    const wsUrl = getRoomWebSocketUrl(
      'room_local',
      undefined,
      undefined,
      'http://localhost:8787'
    );
    expect(wsUrl).toBe('ws://localhost:8787/api/v1/rooms/room_local/ws');
  });

  it('initializes InputController and polls normalized axes and actions cleanly', () => {
    const input = new InputController();
    const state = input.poll();
    expect(state.axes).toEqual({ x: 0, y: 0 });
    expect(state.actions).toEqual({ jump: false, sprint: false, pause: false });
    expect(state.pointer.isDown).toBe(false);
  });

  it('initializes RuntimeEngine state cleanly', () => {
    const engine = new RuntimeEngine();
    const state = engine.getState();
    expect(state.isRunning).toBe(false);
    expect(state.isPaused).toBe(false);
    expect(state.fps).toBe(60);
  });
});

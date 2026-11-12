// End-to-end integration test verifying sample .mochi package with client-server Lua scripting

import { describe, it, expect } from 'vitest';
import {
  createSampleMochiPackage,
  packMochi,
  unpackMochi,
  validateMochi
} from '../src/engine/package';
import { MochiLuaEngine } from '../src/engine/lua/luaEngine';
import { createDefaultPart } from '../src/engine/lua/bridge';

describe('End-to-End .mochi Package & Client-Server Lua Execution', () => {
  it('packages, unpacks, and executes client-server Lua interaction flow seamlessly', async () => {
    // 1. Generate standard sample .mochi game package
    const samplePackage = createSampleMochiPackage();
    const validation = validateMochi(samplePackage);
    expect(validation.valid).toBe(true);

    // 2. Export/package into binary .mochi bundle
    const mochiBinary = packMochi(samplePackage);
    expect(mochiBinary.length).toBeGreaterThan(500);

    // 3. Unpack in game runtime
    const runtimePackage = unpackMochi(mochiBinary);
    expect(runtimePackage.manifest.title).toBe('Cyber Obby Arena');
    expect(runtimePackage.scripts['scripts/main.client.lua']).toBeDefined();
    expect(runtimePackage.scripts['scripts/main.server.lua']).toBeDefined();

    // 4. Setup mock Server Authority state
    const serverState: Record<string, unknown> = {
      totalCoinsClaimed: 0,
      scores: {} as Record<string, number>
    };

    let serverAnnouncement: string | null = null;
    let clientScoreUpdated: number | null = null;

    // Simulated Server RPC router
    const handleClientRpc = (playerId: string, eventName: string, data: Record<string, unknown>) => {
      if (eventName === 'ClaimCoin') {
        const val = (data?.value as number) || 10;
        const currentScore = ((serverState.scores as Record<string, number>)[playerId] || 0) + val;
        (serverState.scores as Record<string, number>)[playerId] = currentScore;
        serverState.totalCoinsClaimed = ((serverState.totalCoinsClaimed as number) || 0) + 1;

        // Server responds to client with ScoreUpdated
        clientLuaEngine.dispatchClientEvent('ScoreUpdated', {
          score: currentScore,
          totalClaims: serverState.totalCoinsClaimed
        });

        // Server broadcasts milestone if >= 100
        if (currentScore >= 100) {
          serverAnnouncement = `Milestone: player reached ${currentScore} points!`;
          clientLuaEngine.dispatchClientEvent('ServerAnnouncement', {
            message: serverAnnouncement
          });
        }
      }
    };

    // 5. Initialize Client Lua Engine with mock Coin part
    const clientLuaEngine = new MochiLuaEngine();
    const coinPart = createDefaultPart('Coin');

    clientLuaEngine.setOnFireServer((eventName, data) => {
      handleClientRpc('player_local', eventName, (data || {}) as Record<string, unknown>);
    });

    const clientScriptCode = runtimePackage.scripts['scripts/main.client.lua'].code;
    const clientExecRes = await clientLuaEngine.executeScript(clientScriptCode, coinPart);
    expect(clientExecRes.success).toBe(true);

    // 6. Simulate Player touching Coin (Round 1: 50 pts)
    const mockPlayer = {
      id: 'player_local',
      username: 'TestHero',
      health: 100,
      maxHealth: 100,
      position: { x: 0, y: 1, z: 5 },
      addScore: () => {}
    };

    coinPart.triggerTouch?.(mockPlayer);

    // Verify Server received ClaimCoin and responded
    expect((serverState.scores as Record<string, number>)['player_local']).toBe(50);
    expect(serverState.totalCoinsClaimed).toBe(1);

    // Verify Client Lua received server ScoreUpdated response
    const logsAfterCoin1 = clientLuaEngine.getLogs();
    expect(
      logsAfterCoin1.some((l) => l.message.includes('[UI Notification] Server Synced Score: 50'))
    ).toBe(true);
    expect(serverAnnouncement).toBeNull();

    // 7. Simulate Player touching Coin again (Round 2: +50 = 100 pts milestone)
    coinPart.triggerTouch?.(mockPlayer);

    expect((serverState.scores as Record<string, number>)['player_local']).toBe(100);
    expect(serverState.totalCoinsClaimed).toBe(2);
    expect(serverAnnouncement).toContain('Milestone: player reached 100 points!');

    const logsAfterCoin2 = clientLuaEngine.getLogs();
    expect(
      logsAfterCoin2.some((l) => l.message.includes('[UI Notification] Server Synced Score: 100'))
    ).toBe(true);
    expect(
      logsAfterCoin2.some((l) => l.message.includes('[Server] Milestone: player reached 100 points!'))
    ).toBe(true);

    // Teardown
    clientLuaEngine.dispose();
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MochiLuaEngine, createDefaultPart, createDefaultPlayer } from '../src/engine/lua';

describe('Mochi Lua Scripting Engine', () => {
  let luaEngine: MochiLuaEngine;

  beforeEach(() => {
    luaEngine = new MochiLuaEngine();
  });

  afterEach(() => {
    luaEngine.dispose();
  });

  it('initializes and executes standard Lua arithmetic and string operations', async () => {
    const result = await luaEngine.executeScript(`
      local a = 15
      local b = 27
      return a + b
    `);
    expect(result.success).toBe(true);
    expect(result.returnValue).toBe(42);
  });

  it('captures Lua print() and warn() calls in real-time execution logs', async () => {
    const result = await luaEngine.executeScript(`
      print("Starting Mochi World...")
      warn("Player approaching danger zone")
      print("System initialized with status: OK")
    `);
    expect(result.success).toBe(true);
    expect(result.logs.some((l) => l.message.includes('Starting Mochi World...'))).toBe(true);
    expect(result.logs.some((l) => l.level === 'warn' && l.message.includes('danger zone'))).toBe(true);
  });

  it('manipulates 3D parts via script.parent in Lua', async () => {
    const testCoin = createDefaultPart('GoldCoin');
    const result = await luaEngine.executeScript(
      `
      local coin = script.parent
      coin.rotateY(45)
      coin.setVisible(false)
      print("Coin rotation is now: " .. tostring(coin.rotation.y))
    `,
      testCoin
    );
    expect(result.success).toBe(true);
    expect(testCoin.rotation.y).toBe(45);
    expect(testCoin.visible).toBe(false);
  });

  it('registers and executes onUpdate tick hooks during frame updates', async () => {
    const testCoin = createDefaultPart('Spinner');
    await luaEngine.executeScript(
      `
      local part = script.Parent
      script.onUpdate.Connect(function(dt)
        part.rotateY(90 * dt)
      end)
    `,
      testCoin
    );

    // Simulate 2 frames at 60Hz (dt = 0.0166)
    luaEngine.dispatchTick(0.0166);
    luaEngine.dispatchTick(0.0166);

    // 90 * 0.0166 * 2 ~= 2.988
    expect(testCoin.rotation.y).toBeGreaterThan(2.9);
    expect(testCoin.rotation.y).toBeLessThan(3.1);
  });

  it('triggers onTouch events and interacts with Player and World APIs', async () => {
    const testCoin = createDefaultPart('RewardCoin');
    const testPlayer = createDefaultPlayer();
    let scoreAdded = 0;

    testPlayer.addScore = (_category, amount) => {
      scoreAdded += amount;
    };

    await luaEngine.executeScript(
      `
      local coin = script.Parent
      coin.onTouch(function(player)
        player.addScore("Gold", 50)
        world.playSound("coin_sparkle", coin.position)
        ui.showNotification("Claimed 50 Gold Coins!", 3)
      end)
    `,
      testCoin
    );

    testCoin.triggerTouch?.(testPlayer);
    expect(scoreAdded).toBe(50);

    const logs = luaEngine.getLogs();
    expect(logs.some((l) => l.message.includes('coin_sparkle'))).toBe(true);
    expect(logs.some((l) => l.message.includes('Claimed 50 Gold Coins!'))).toBe(true);
  });

  it('safely handles syntax errors without terminating the host application', async () => {
    const result = await luaEngine.executeScript(`
      function brokenSyntax()
        local x = 10
        -- missing end statement
    `);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.logs.some((l) => l.level === 'error')).toBe(true);
  });
});

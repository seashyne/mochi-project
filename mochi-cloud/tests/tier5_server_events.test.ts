// Tier 5 adversarial tests: remote event registry, handler lifecycle, and the
// room script payload envelope used by the Durable Object loader.

import { describe, it, expect } from 'vitest';
import { ServerLuaRuntime } from '../src/services/serverLua';
import { parseScriptPayload } from '../src/do/roomLua';

async function load(script: string): Promise<ServerLuaRuntime> {
  const runtime = new ServerLuaRuntime();
  await runtime.loadScript(script);
  return runtime;
}

describe('Tier 5: Server Remote Event Hardening', () => {
  describe('Handler lifecycle', () => {
    it('lists handlers registered by the script', async () => {
      const runtime = await load(`
        network.OnServerEvent("A", function(player, data) end)
        network.OnServerEvent("B", function(player, data) end)
      `);
      expect(runtime.getHandlerNames().sort()).toEqual(['A', 'B']);
    });

    it('rejects OnServerEvent without a function', async () => {
      const runtime = new ServerLuaRuntime();
      const result = await runtime.loadScript('network.OnServerEvent("A", 42)');
      expect(result.success).toBe(false);
      expect(result.error).toContain('expects a function');
    });

    it('clears handlers when a new script is loaded', async () => {
      const runtime = await load('network.OnServerEvent("Old", function(player, data) end)');
      expect(runtime.getHandlerNames()).toContain('Old');
      await runtime.loadScript('network.OnServerEvent("New", function(player, data) end)');
      expect(runtime.getHandlerNames()).toEqual(['New']);
    });

    it('keeps the allowlist across script reloads', async () => {
      const runtime = await load('print("first")');
      runtime.setEventAllowlist(['Allowed']);
      await runtime.loadScript('network.OnServerEvent("Allowed", function(player, data) end)');
      expect(runtime.getEventAllowlist()).toEqual(['Allowed']);
      expect(runtime.dispatchServerEvent('p', 'Allowed', {})).toBe(true);
      expect(runtime.dispatchServerEvent('p', 'Blocked', {})).toBe(false);
    });

    it('returns false when no handler exists for an allowed event', async () => {
      const runtime = await load('print("no handlers")');
      runtime.setEventAllowlist(['Missing']);
      expect(runtime.dispatchServerEvent('p', 'Missing', {})).toBe(false);
    });

    it('treats an empty allowlist as "no restriction"', async () => {
      const runtime = await load('network.OnServerEvent("Any", function(player, data) end)');
      runtime.setEventAllowlist([]);
      expect(runtime.getEventAllowlist()).toBeNull();
      expect(runtime.dispatchServerEvent('p', 'Any', {})).toBe(true);
    });

    it('trims allowlist entries and drops blanks', async () => {
      const runtime = await load('network.OnServerEvent("Ping", function(player, data) end)');
      runtime.setEventAllowlist(['  Ping  ', '', '   ']);
      expect(runtime.getEventAllowlist()).toEqual(['Ping']);
    });

    it('prefers a JS handler when both a script and a JS handler exist', async () => {
      const runtime = await load('network.OnServerEvent("Dual", function(player, data) end)');
      const seen: string[] = [];
      runtime.registerHandler('Dual', (player) => seen.push(player.username));
      runtime.addPlayer({ id: 'p1', username: 'JsPath' });
      expect(runtime.dispatchServerEvent('p1', 'Dual', {})).toBe(true);
      expect(seen).toEqual(['JsPath']);
    });
  });

  describe('Room script payload parsing', () => {
    it('accepts the JSON envelope with an event registry', () => {
      const parsed = parseScriptPayload(
        JSON.stringify({ code: 'print("hi")', events: ['ClaimCoin', 42, 'Ping'] })
      );
      expect(parsed.code).toBe('print("hi")');
      expect(parsed.events).toEqual(['ClaimCoin', 'Ping']);
    });

    it('treats a missing registry as "no allowlist"', () => {
      const parsed = parseScriptPayload(JSON.stringify({ code: 'print("hi")' }));
      expect(parsed.events).toBeNull();
    });

    it('keeps plain-text bodies working for legacy clients', () => {
      const parsed = parseScriptPayload('print("legacy")');
      expect(parsed.code).toBe('print("legacy")');
      expect(parsed.events).toBeNull();
    });

    it('falls back to text for malformed JSON that is not an envelope', () => {
      const parsed = parseScriptPayload('{ not json');
      expect(parsed.code).toBe('{ not json');
      expect(parsed.events).toBeNull();
    });

    it('ignores an envelope whose code field is not a string', () => {
      const parsed = parseScriptPayload(JSON.stringify({ code: 7, events: ['A'] }));
      expect(parsed.code).toBe('{"code":7,"events":["A"]}');
      expect(parsed.events).toBeNull();
    });
  });
});

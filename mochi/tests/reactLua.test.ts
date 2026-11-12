// Automated test suite for React-Lua declarative components & Visual Novel Dialogue Bridge

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MochiLuaEngine } from '../src/engine/lua/luaEngine';
import { ReactLuaUIStore } from '../src/engine/lua/reactLuaBridge';
import { injectReactLuaBridge } from '../src/engine/lua/reactLuaBridge';

describe('React-Lua Declarative UI & Dialogue Bridge Suite', () => {
  let engine: MochiLuaEngine;
  let store: ReactLuaUIStore;

  beforeEach(async () => {
    engine = new MochiLuaEngine();
    store = new ReactLuaUIStore();
    await engine.init();
    // Inject custom isolated store for testing
    // @ts-expect-error internal access
    injectReactLuaBridge(engine.engine, engine.env, store);
  });

  afterEach(() => {
    engine.dispose();
    store.clearAll();
  });

  it('supports React.createElement and Roact.createElement declarative trees in Lua', async () => {
    const res = await engine.executeScript(`
      local card = React.createElement("Card", { title = "Quest 1" }, {
        React.createElement("Text", { content = "Collect 5 coins" })
      })
      return card.type
    `);

    expect(res.success).toBe(true);
    expect(res.returnValue).toBe('Card');
  });

  it('triggers ui.showDialogue and allows selecting choice with Lua callback invocation', async () => {
    let chosenIndex = -1;
    let chosenText = '';

    await engine.executeScript(`
      ui.showDialogue({
        speaker = "Luna",
        text = "Would you like to explore the dungeon?",
        choices = { "Yes, let's go!", "No, I need to prepare." },
        onChoice = function(index, text)
          print("Selected choice #" .. tostring(index) .. ": " .. tostring(text))
        end
      })
    `);

    const dialogue = store.getDialogue();
    expect(dialogue).toBeDefined();
    expect(dialogue?.speaker).toBe('Luna');
    expect(dialogue?.text).toBe('Would you like to explore the dungeon?');
    expect(dialogue?.choices).toHaveLength(2);
    expect(dialogue?.choices?.[0]).toBe("Yes, let's go!");

    // Simulate player clicking Choice 0 ("Yes, let's go!")
    store.selectChoice(0);

    // Dialogue is dismissed after choice
    expect(store.getDialogue()).toBeNull();

    // Verify Lua print log was triggered
    const logs = engine.getLogs();
    expect(
      logs.some((l) => l.message.includes("Selected choice #1: Yes, let's go!"))
    ).toBe(true);
  });

  it('manages dynamic HUD cards with reactive state updates and removal', async () => {
    await engine.executeScript(`
      ui.setHud("health_bar", { title = "Health", value = "100 HP", progress = 1.0, color = "#10b981" })
      ui.setHud("coin_tracker", { title = "Coins", value = 25, color = "#fbbf24" })
    `);

    let hud = store.getHudElements();
    expect(hud).toHaveLength(2);

    const hp = hud.find((h) => h.id === 'health_bar');
    expect(hp?.value).toBe('100 HP');
    expect(hp?.progress).toBe(1.0);

    // Update health
    await engine.executeScript(`
      ui.setHud("health_bar", { value = "60 HP", progress = 0.6 })
      ui.removeHud("coin_tracker")
    `);

    hud = store.getHudElements();
    expect(hud).toHaveLength(1);
    expect(hud[0].id).toBe('health_bar');
    expect(hud[0].value).toBe('60 HP');
    expect(hud[0].progress).toBe(0.6);
  });

  it('executes narrative story branching flow seamlessly', async () => {
    let step = 0;

    await engine.executeScript(`
      story.scene("castle_gate")
      story.show("Guard", "stern")
      story.say("Guard", "Halt! Who goes there?", { "I am a traveler", "None of your business" }, function(idx)
        if idx == 1 then
          story.say("Guard", "You may enter the city.")
        else
          story.say("Guard", "Draw your weapon!")
        end
      end)
    `);

    expect(store.getDialogue()?.speaker).toBe('Guard');
    expect(store.getDialogue()?.choices).toHaveLength(2);

    // Choose option 1
    store.selectChoice(0);

    // Follow-up dialogue should be rendered
    expect(store.getDialogue()?.speaker).toBe('Guard');
    expect(store.getDialogue()?.text).toBe('You may enter the city.');
  });
});

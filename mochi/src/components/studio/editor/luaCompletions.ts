// Context-aware Autocomplete and IntelliSense for Mochi Lua Engine

import { Completion, CompletionContext, CompletionResult, autocompletion } from '@codemirror/autocomplete';
import { Extension } from '@codemirror/state';
import { getSnippetCompletions } from './luaSnippets';

export const MOCHI_GLOBALS: Completion[] = [
  { label: 'Instance', type: 'class', detail: 'Instance.new(className)', info: 'Instantiates a 3D world node or 2D GUI element.', boost: 10 },
  { label: 'Vector3', type: 'class', detail: 'Vector3.new(x, y, z)', info: '3D Cartesian vector constructor with math constants zero and one.', boost: 10 },
  { label: 'CFrame', type: 'class', detail: 'CFrame.new(x, y, z)', info: 'Coordinate frame representing position and 3D orientation matrix.', boost: 10 },
  { label: 'task', type: 'class', detail: 'task.wait | task.delay | task.spawn', info: 'Coroutine task scheduling library for async timing and delays.', boost: 10 },
  { label: 'ui', type: 'class', detail: 'ui.showDialogue | ui.showNotification', info: 'Interactive UI system for dialogues, HUD widgets, and notifications.', boost: 10 },
  { label: 'players', type: 'class', detail: 'players.getLocalPlayer()', info: 'Player service managing connected players and local player proxy.', boost: 10 },
  { label: 'player', type: 'variable', detail: 'LuaPlayerProxy', info: 'Local character player proxy with health, score, and movement.', boost: 9 },
  { label: 'script', type: 'variable', detail: 'LuaScriptProxy', info: 'Reference to this running script and its parent node hierarchy.', boost: 9 },
  { label: 'world', type: 'class', detail: 'world.playSound | world.Raycast', info: 'Physics world interface for raycasting, spatial audio, and nodes.', boost: 8 },
  { label: 'TweenService', type: 'class', detail: 'TweenService:Create(...)', info: 'Service for interpolating object properties over time.', boost: 8 },
  { label: 'TweenInfo', type: 'class', detail: 'TweenInfo.new(time, style, dir)', info: 'Parameters object for tween duration, easing style, and loops.', boost: 8 },
  { label: 'RunService', type: 'class', detail: 'RunService.Heartbeat', info: 'Frame step simulation events and execution context flags.', boost: 7 },
  { label: 'Enum', type: 'constant', detail: 'Enum.Material | Enum.EasingStyle', info: 'Engine enumeration constants for materials, easings, and fonts.', boost: 7 },
  { label: 'Color3', type: 'class', detail: 'Color3.fromRGB(r, g, b)', info: 'RGB color representation for surface materials and GUI tinting.', boost: 6 },
  { label: 'UDim2', type: 'class', detail: 'UDim2.new(xs, xo, ys, yo)', info: '2D coordinate format with scale and pixel offset for GUI.', boost: 6 }
];

export const LUA_KEYWORDS: Completion[] = [
  'local', 'function', 'if', 'then', 'else', 'elseif', 'end', 'for', 'in', 'do',
  'while', 'repeat', 'until', 'return', 'break', 'true', 'false', 'nil', 'and', 'or', 'not'
].map((kw) => ({ label: kw, type: 'keyword', boost: 1 }));

export const LUA_BUILTINS: Completion[] = [
  { label: 'print', type: 'function', detail: 'print(...)', info: 'Outputs values to the Studio console.' },
  { label: 'warn', type: 'function', detail: 'warn(...)', info: 'Outputs warning message to console.' },
  { label: 'error', type: 'function', detail: 'error(message)', info: 'Throws a runtime script error.' },
  { label: 'pairs', type: 'function', detail: 'pairs(table)', info: 'Iterates over all key-value pairs in table.' },
  { label: 'ipairs', type: 'function', detail: 'ipairs(array)', info: 'Iterates over integer-indexed array elements.' },
  { label: 'type', type: 'function', detail: 'type(val) -> string', info: 'Returns string name of value type.' },
  { label: 'tostring', type: 'function', detail: 'tostring(val) -> string', info: 'Converts value to string.' },
  { label: 'tonumber', type: 'function', detail: 'tonumber(val) -> number', info: 'Parses string to numeric value.' },
  { label: 'math', type: 'class', detail: 'math library', info: 'Standard math functions (sin, cos, rad, deg, max, min, floor, ceil, random).' },
  { label: 'string', type: 'class', detail: 'string library', info: 'String manipulation routines (format, sub, find, match, gsub, len).' },
  { label: 'table', type: 'class', detail: 'table library', info: 'Table manipulation routines (insert, remove, sort, concat).' }
];

export const MEMBER_COMPLETIONS: Record<string, Completion[]> = {
  Instance: [
    { label: 'new', type: 'method', detail: '(className, [parent], [props])', info: 'Creates a new world node or UI instance.' }
  ],
  Vector3: [
    { label: 'new', type: 'method', detail: '(x, y, z) -> Vector3', info: 'Constructs 3D vector.' },
    { label: 'zero', type: 'constant', detail: 'Vector3(0, 0, 0)', info: 'Origin vector constant.' },
    { label: 'one', type: 'constant', detail: 'Vector3(1, 1, 1)', info: 'Unit vector constant.' }
  ],
  CFrame: [
    { label: 'new', type: 'method', detail: '(x, y, z) -> CFrame', info: 'Constructs coordinate frame.' },
    { label: 'Angles', type: 'method', detail: '(rx, ry, rz) -> CFrame', info: 'Constructs rotation from Euler angles (in radians).' },
    { label: 'lookAt', type: 'method', detail: '(at, target, [up]) -> CFrame', info: 'Creates frame at position facing target.' }
  ],
  task: [
    { label: 'wait', type: 'method', detail: '(seconds) -> number', info: 'Suspends coroutine execution for duration.' },
    { label: 'delay', type: 'method', detail: '(seconds, callback)', info: 'Schedules callback to run after duration.' },
    { label: 'spawn', type: 'method', detail: '(callback)', info: 'Runs callback on next engine cycle.' }
  ],
  ui: [
    { label: 'showDialogue', type: 'method', detail: '(options)', info: 'Opens narrative visual novel dialogue with choices.' },
    { label: 'hideDialogue', type: 'method', detail: '()', info: 'Closes active dialogue prompt.' },
    { label: 'showNotification', type: 'method', detail: '(message, [duration])', info: 'Displays brief toast notification banner.' },
    { label: 'setLeaderboard', type: 'method', detail: '(category, score)', info: 'Updates persistent player leaderboard score.' },
    { label: 'setHud', type: 'method', detail: '(id, element)', info: 'Sets dynamic HUD widget card.' },
    { label: 'removeHud', type: 'method', detail: '(id)', info: 'Removes HUD widget card.' }
  ],
  players: [
    { label: 'getLocalPlayer', type: 'method', detail: '() -> LuaPlayerProxy', info: 'Retrieves local player proxy.' },
    { label: 'LocalPlayer', type: 'property', detail: 'LuaPlayerProxy', info: 'Direct property reference to local player.' }
  ],
  player: [
    { label: 'damage', type: 'method', detail: '(amount)', info: 'Inflicts damage on player health and triggers death when <= 0.' },
    { label: 'heal', type: 'method', detail: '(amount)', info: 'Restores health up to maximum health.' },
    { label: 'respawn', type: 'method', detail: '()', info: 'Respawns character at active spawn point.' },
    { label: 'addScore', type: 'method', detail: '(category, amount)', info: 'Increments category score value.' },
    { label: 'getScore', type: 'method', detail: '(category) -> number', info: 'Retrieves current category score.' },
    { label: 'moveTo', type: 'method', detail: '(x, z, [speed])', info: 'Commands character navmesh pathfinding.' },
    { label: 'health', type: 'property', detail: 'number', info: 'Current character health value.' },
    { label: 'maxHealth', type: 'property', detail: 'number', info: 'Maximum character health limit.' },
    { label: 'position', type: 'property', detail: 'Vector3', info: 'Current world position of player character.' },
    { label: 'Character', type: 'property', detail: 'table', info: 'Avatar character object containing Humanoid.' }
  ],
  script: [
    { label: 'Parent', type: 'property', detail: 'LiveNode', info: 'World node instance this script is attached to.' },
    { label: 'onUpdate', type: 'property', detail: 'Signal(dt)', info: 'Per-frame step tick event.' }
  ],
  node: [
    { label: 'Touched', type: 'property', detail: 'Signal(player)', info: 'Signal fired when an entity touches this node.' },
    { label: 'TouchEnded', type: 'property', detail: 'Signal(player)', info: 'Signal fired when touch contact ends.' },
    { label: 'Changed', type: 'property', detail: 'Signal(property)', info: 'Signal fired when a node property changes.' },
    { label: 'Position', type: 'property', detail: 'Vector3', info: '3D position vector in world coordinates.' },
    { label: 'Rotation', type: 'property', detail: 'Vector3', info: 'Euler orientation angles in radians.' },
    { label: 'Size', type: 'property', detail: 'Vector3', info: '3D dimensions scale vector.' },
    { label: 'Color', type: 'property', detail: 'string', info: 'Hex color string or Color3 surface tint.' },
    { label: 'Anchored', type: 'property', detail: 'boolean', info: 'Static unmovable physics flag.' },
    { label: 'CFrame', type: 'property', detail: 'CFrame', info: 'Combined coordinate transform frame.' },
    { label: 'Material', type: 'property', detail: 'Enum.Material', info: 'Surface material texture preset.' },
    { label: 'Destroy', type: 'method', detail: '()', info: 'Removes this node and cleans up resources.' },
    { label: 'FindFirstChild', type: 'method', detail: '(name, [recur]) -> Node', info: 'Finds child node by name.' },
    { label: 'IsA', type: 'method', detail: '(className) -> boolean', info: 'Tests class inheritance.' },
    { label: 'rotateY', type: 'method', detail: '(degrees)', info: 'Rotates node around Y axis in degrees.' }
  ],
  TweenService: [
    { label: 'Create', type: 'method', detail: '(instance, tweenInfo, goals) -> Tween', info: 'Creates tween animation for object properties.' },
    { label: 'SmoothDamp', type: 'method', detail: '(cur, target, vel, st, ms, dt)', info: 'Critically damped spring smooth follower.' }
  ],
  TweenInfo: [
    { label: 'new', type: 'method', detail: '(time, [style], [dir], [repeat], [reverses], [delay])', info: 'Constructs tween timing settings.' }
  ],
  touchSignal: [
    { label: 'Connect', type: 'method', detail: '(function(player) ... end)', info: 'Subscribes listener callback to touch events receiving LuaPlayerProxy.' }
  ],
  signal: [
    { label: 'Connect', type: 'method', detail: '(function(arg) ... end)', info: 'Subscribes listener callback to signal events.' }
  ]
};

export function mochiLuaCompletionSource(context: CompletionContext): CompletionResult | null {
  const memberMatch = context.matchBefore(/([a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*)[:.]([a-zA-Z0-9_]*)$/);

  if (memberMatch) {
    const matchedText = memberMatch.text;
    const isColon = matchedText.includes(':');
    const parts = matchedText.split(/[:.]/);
    const target = parts[parts.length - 2];
    const prefix = parts[parts.length - 1];
    const from = context.pos - prefix.length;

    if (isColon) {
      if (['Touched', 'TouchEnded'].includes(target)) {
        return { from, options: MEMBER_COMPLETIONS.touchSignal };
      }
      if (['Changed', 'Completed', 'onUpdate'].includes(target)) {
        return { from, options: MEMBER_COMPLETIONS.signal };
      }
      if (target === 'TweenService') {
        return { from, options: MEMBER_COMPLETIONS.TweenService };
      }
      return {
        from,
        options: [
          ...MEMBER_COMPLETIONS.signal,
          ...MEMBER_COMPLETIONS.node.filter((m) => m.type === 'method')
        ]
      };
    }

    if (MEMBER_COMPLETIONS[target]) {
      return { from, options: MEMBER_COMPLETIONS[target] };
    }

    if (['Parent', 'parent', 'hazard', 'coin', 'npc', 'door', 'part'].includes(target)) {
      return { from, options: MEMBER_COMPLETIONS.node };
    }

    return null;
  }

  const wordMatch = context.matchBefore(/[a-zA-Z_][a-zA-Z0-9_]*$/);
  if (!wordMatch && !context.explicit) {
    return null;
  }

  const from = wordMatch ? wordMatch.from : context.pos;
  const snippets = getSnippetCompletions();
  const options: Completion[] = [
    ...MOCHI_GLOBALS,
    ...snippets,
    ...LUA_BUILTINS,
    ...LUA_KEYWORDS
  ];

  return { from, options, validFor: /^[a-zA-Z0-9_]*$/ };
}

export const luaCompletionsExtension: Extension = autocompletion({
  override: [mochiLuaCompletionSource]
});

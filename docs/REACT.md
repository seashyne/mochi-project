# React

A small React over the GUI tree. Elements go in, `ScreenGui` nodes come out.

It is not a port of React: there is no fiber scheduler, no priority, no concurrent
rendering. A state change re-renders the whole tree and diffs it against the previous
one. For an interface of tens of nodes that is the right trade - the reconciler stays
readable, and the only thing it has to be good at is not destroying nodes it did not
have to.

## The five minutes

```lua
local App = function()
  local count, setCount = React.useState(0)

  return React.createElement("Frame", {
    Size = UDim2.new(0, 240, 0, 96),
    Position = UDim2.new(0, 16, 0, 16),
    BackgroundColor3 = Color3.fromRGB(20, 22, 30)
  },
    React.createElement("TextLabel", {
      Size = UDim2.fromScale(1, 0.5),
      Text = "Clicks: " .. count,
      TextScaled = true
    }),
    React.createElement("TextButton", {
      Size = UDim2.new(0, 96, 0, 32),
      Position = UDim2.new(0, 12, 0, 52),
      Text = "+1",
      MouseButton1Click = function() setCount(count + 1) end
    })
  )
end

React.mount(React.createElement(App), player.PlayerGui)
```

## What a component is

A function that takes `props` and returns an element. A `type` that is a string is a
GUI class - `Frame`, `TextLabel`, `TextButton`, `ImageLabel`, `UIScale` and the rest -
and is created exactly as `Instance.new` would create it.

| Call | Behaviour |
| --- | --- |
| `React.createElement(type, props, ...)` | Builds an element. Children may be elements, strings or numbers |
| `React.mount(element, parent)` | Renders into a GUI node and returns a handle with `:unmount()` |
| `React.createRoot(parent)` | The same, but returns a root you can `:render(element)` into repeatedly |
| `React.useState(initial)` | Returns the value and a setter. The setter re-renders |
| `React.useEffect(fn, deps)` | Runs after the tree is patched, and again only when a dependency changes. A returned function is the cleanup |

`Roact` is an alias of `React`, so scripts ported from either name work.

## Events

`MouseButton1Click`, `Activated` and `onClick` are the same event. A handler is a plain
function; it is re-bound only when the function itself changes.

## What it does not do

- **No keys.** Children are matched by position, so reordering a list rebuilds the
  nodes that moved. Sort the data before rendering it.
- **No context, no memo, no reducer, no ref.** `useState` and `useEffect` are the whole
  hook set.
- **No portals or fragments.** Everything renders under the node you mounted into.
- **A prop removed from the element keeps its last value.** The reconciler writes the
  props it is given and does not reset the ones that disappeared.

For a static screen, `Instance.new` is still less code. React earns its keep when state
changes: a counter, a menu that opens, a list that filters.

// The public React table, written in Lua.
//
// `useState` returns the value and a setter as two values, and a JS function can only
// return one, so the shape a script uses is assembled here on top of the `__mochi_*`
// primitives. It also keeps `React.createElement` able to take varargs, which is how
// every React example is written.
//
// This is not a port of React: there is no scheduler and no component lifecycle beyond
// state and effects. It is the programming model, on top of the GUI tree.

export const REACT_PRELUDE = `React = React or {}

function React.createElement(component, props, ...)
  return __mochi_create(component, props, { ... })
end

function React.useState(initial)
  local hook = __mochi_hook(initial)
  local function set(next)
    __mochi_hook_set(hook.slot, next)
  end
  return hook.value, set
end

-- Runs after the tree is patched, and again only when a dependency changes. A returned
-- function is the cleanup, which also runs when the component goes away.
function React.useEffect(effect, deps)
  __mochi_effect(effect, deps)
end

function React.mount(element, parent)
  return __mochi_mount(element, parent)
end

function React.createRoot(parent)
  return __mochi_create_root(parent)
end

-- Roact is the older name for the same table; scripts ported from either work.
Roact = React
`;

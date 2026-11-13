# Runtime: HUD and Dialogue (`ui.*`)

Part of [`RUNTIME.md`](./RUNTIME.md). Split out when the main file reached its
300-line ceiling.

## HUD and Dialogue (`ui.*`)

`ui.*` writes into the store the React overlay renders: a flat list of HUD cards plus
one dialogue box. There is no GUI tree and no per-element layout - see the gap list in
[`API_PARITY.md`](./API_PARITY.md) for what that means when porting.

| Call | Effect |
| --- | --- |
| `ui.setHud(id, element)` | Creates or updates a card. Fields: `title`, `value`, `progress` (0..1), `color`, `font`, `size` |
| `ui.removeHud(id)` | Removes the card |
| `ui.showDialogue(options)` | Shows the dialogue box: `speaker`, `text`, `choices` |
| `ui.hideDialogue()` | Hides it |

### Typography

`font` and `size` style the value line. Both are curated: the app ships the faces, so
nothing is fetched at runtime and there is no upload path to moderate.

| `font` | Face |
| --- | --- |
| `mono` (default) | system monospace - what the HUD used before this existed |
| `ui` | IBM Plex Sans Thai |
| `display` | Mitr |

`size` is `sm`, `md` (default) or `lg`.

An unrecognised value is ignored rather than raised, and the previous value stays: a
typo in a style hint must not stop a running script. A `setHud` call that omits
`font`/`size` keeps whatever the card already had, so a value-only update does not
reset the style.

### Example

```lua
ui.setHud("score", { title = "Score", value = 0, font = "display", size = "lg" })
ui.setHud("health", { title = "Health", value = "100 HP", progress = 1.0, color = "#10b981" })
ui.setHud("score", { value = 250 })
ui.removeHud("health")
```

### Contract

- The store only notifies the overlay when a call actually changes something, so a
  script may call `setHud` every frame without re-rendering React each time.
- `progress` is clamped by the overlay, not the store, so a script can hold a value
  outside 0..1 without corrupting the card.
- Without a UI bridge (a headless run) every call is a no-op, so a script that draws a
  HUD still executes anywhere.

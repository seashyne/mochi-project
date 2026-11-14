# Materials

How a part's surface is chosen, and what each name resolves to. Split out of
[`SCRIPTING.md`](./SCRIPTING.md) when that file reached its line ceiling.

`part.Material` names a part's surface. Use `Enum.Material`, which is the set of names a
script may choose from:

```lua
part.Material = Enum.Material.Grass
print(part.Material)                              --> Grass
print(part.Material == Enum.Material.Grass)       --> true
```

A misspelled member is `nil`, and assigning it raises, so a typo is caught the moment it
runs instead of quietly doing nothing.

`Enum.Material` is a table of names rather than of objects, so a member compares equal to
its own name - `Enum.Material.Grass == "Grass"`. That also means the plain string still
works, which matters for scripts that pick a material from a config:

```lua
part.Material = config.material   -- "Grass" is accepted
```

A string we do not recognise logs one warning and leaves the part alone; it does not
raise, because a ported script should not die on a surface we have not built yet.

### What each name resolves to

A name becomes a shading mode plus one of the bundled PBR texture sets. Names we have no
texture for keep a sensible shading mode and render without a map.

| Names | Surface |
| --- | --- |
| `Grass`, `LeafyGrass` | grass texture |
| `Brick` | red brick |
| `Wood`, `WoodPlanks`, `Cardboard` | planks |
| `Concrete`, `Plaster`, `Asphalt` | plain concrete |
| `Fabric`, `Carpet` | woven cloth |
| `Marble`, `Snow`, `Salt` | white marble |
| `Granite`, `Slate`, `Cobblestone`, `Pebble`, `Rock`, `Basalt`, `Limestone`, `Pavement`, `Sandstone`, `Sand`, `Mud`, `Ground`, `CeramicTiles`, `ClayRoofTiles`, `RoofShingles` | stone paving |
| `Metal`, `CorrodedMetal`, `Foil` | metal plate |
| `DiamondPlate` | tread plate |
| `CrackedLava` | lava |
| `Neon`, `ForceField` | emissive, no texture |
| `Glass`, `Ice`, `Glacier` | transparent |
| `Plastic`, `SmoothPlastic`, `Rubber`, `Air` | flat colour |

### Choosing a surface without a script

The Studio inspector is the normal way: it shows the texture before you commit to it.
Setting a material from Lua is for scripts, and for worlds ported from elsewhere.

`part.materialTexture` takes a bundled preset id directly (`"marble_white"`,
`"lava_flow"`, ...) when you want a specific set rather than a name.

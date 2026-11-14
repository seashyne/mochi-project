// The `Material` and `materialTexture` properties a script sees on a part.
//
// Split out of the node API: the alias rules, the once-per-name warning and the nil
// guard are enough logic to deserve their own file, and the node API sits at the
// 300-line ceiling.

import type { RuntimeApiDeps } from './luaNodeApi';
import type { LiveNode } from './liveNode';
import { defineAlias } from './luaProxyUtils';
import { aliasForSurface, materialNameOf, MATERIAL_ALIAS_NAMES } from '../scene/materialAliases';
import { setNodeMaterial, setNodeMaterialTexture } from './nodeSurface';

/** Names already reported, so a per-frame assignment cannot flood the console. */
const warnedMaterials = new Set<string>();

export function attachMaterialProps(
  proxy: Record<string, unknown>,
  node: LiveNode,
  deps: RuntimeApiDeps
): void {
  defineAlias(
    proxy,
    ['material', 'Material'],
    () => aliasForSurface(node.def.material, node.def.materialTexture),
    (value) => {
      const name = materialNameOf(value);
      if (!name) {
        // nil here means the script read a member that does not exist: a misspelled
        // Enum.Material member evaluates to nil, and assigning nil would silently
        // clear the property. Refuse it, the way a typed property would.
        throw new Error(
          'Material must be an Enum.Material member (for example Enum.Material.Grass); ' +
            'a misspelled member evaluates to nil'
        );
      }
      if (setNodeMaterial(node.def, node.mesh, name)) return;
      // A name we do not know is almost always a typo. Say so once, and keep the script
      // running: dying on a surface we have not built would be worse.
      if (!warnedMaterials.has(name)) {
        warnedMaterials.add(name);
        deps.log(
          'warn',
          `Unknown material "${name}". Use Enum.Material, for example ${MATERIAL_ALIAS_NAMES.slice(0, 5).join(', ')}.`
        );
      }
    }
  );

  defineAlias(
    proxy,
    ['materialTexture'],
    () => node.def.materialTexture ?? null,
    (value) => setNodeMaterialTexture(node.def, node.mesh, value ? String(value) : null)
  );
}

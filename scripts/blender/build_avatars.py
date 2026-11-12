"""Generate the two blocky Mochi avatars and export them as GLB.

Run inside Blender (MCP execute_blender_code) or headless:
    blender --background --python scripts/blender/build_avatars.py

The exported hierarchy mirrors src/engine/avatar/avatarBuilder.ts so the existing
6-part group-rotation animation can drive it without an armature:
    humanoid_avatar
      avatar_head / avatar_torso / avatar_left_arm / avatar_right_arm
      avatar_left_leg / avatar_right_leg
Blender is Z-up; the glTF exporter converts to Y-up for Three.js.
"""

import bpy
import bmesh
import math
import os

OUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'mochi', 'public', 'models'))
FEET_Z = -0.4
PART_NODES = ('avatar_head', 'avatar_torso', 'avatar_left_arm', 'avatar_right_arm', 'avatar_left_leg', 'avatar_right_leg')
BODY_MATERIALS = ('head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg')


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_rgba(h):
    h = h.lstrip('#')
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4)) + (1.0,)


def make_material(name, color, roughness, metalness, emission=None, strength=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    tree.nodes.clear()
    out = tree.nodes.new('ShaderNodeOutputMaterial')
    out.location = (320, 0)
    bsdf = tree.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.location = (0, 0)
    bsdf.inputs['Base Color'].default_value = hex_to_rgba(color)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metalness
    if emission:
        bsdf.inputs['Emission Color'].default_value = hex_to_rgba(emission)
        bsdf.inputs['Emission Strength'].default_value = strength
    tree.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    mat.diffuse_color = hex_to_rgba(color)
    return mat


def build_materials():
    return {
        'head': make_material('head', '#fcd34d', 0.35, 0.10),
        'torso': make_material('torso', '#0284c7', 0.40, 0.10),
        'leftArm': make_material('leftArm', '#fcd34d', 0.35, 0.10),
        'rightArm': make_material('rightArm', '#fcd34d', 0.35, 0.10),
        'leftLeg': make_material('leftLeg', '#1e293b', 0.50, 0.10),
        'rightLeg': make_material('rightLeg', '#1e293b', 0.50, 0.10),
        'visor': make_material('visor', '#062229', 0.20, 0.0, emission='#00e5ff', strength=2.0),
        'hair_male': make_material('hair_male', '#2b2118', 0.65, 0.0),
        'hair_female': make_material('hair_female', '#4a2c1a', 0.55, 0.0),
    }


def apply_modifiers(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    evaluated = ob.evaluated_get(dg)
    baked = bpy.data.meshes.new_from_object(evaluated, depsgraph=dg)
    previous = ob.data
    ob.modifiers.clear()
    ob.data = baked
    if previous.users == 0:
        bpy.data.meshes.remove(previous)
    baked.polygons.foreach_set('use_smooth', [False] * len(baked.polygons))
    return ob


def bevel(ob, width=0.018, segments=2):
    mod = ob.modifiers.new('Bevel', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(35.0)
    return apply_modifiers(ob)


def loft(name, rings, collection, material, bevel_width=0.018):
    """Stack rectangular rings into a closed, flat-shaded blocky volume."""
    bm = bmesh.new()
    loops = []
    for z, hx, hy in rings:
        loops.append([bm.verts.new(v) for v in ((-hx, -hy, z), (hx, -hy, z), (hx, hy, z), (-hx, hy, z))])
    for lower, upper in zip(loops, loops[1:]):
        for j in range(4):
            k = (j + 1) % 4
            bm.faces.new((lower[j], lower[k], upper[k], upper[j]))
    bm.faces.new(tuple(reversed(loops[0])))
    bm.faces.new(tuple(loops[-1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mesh = bpy.data.meshes.new(name + '_mesh')
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    collection.objects.link(ob)
    ob.data.materials.append(material)
    if bevel_width:
        bevel(ob, bevel_width)
    return ob


def box(name, size, loc, collection, material, bevel_width=0.018):
    sx, sy, sz = (v / 2.0 for v in size)
    ob = loft(name, ((-sz, sx, sy), (sz, sx, sy)), collection, material, bevel_width)
    ob.location = loc
    return ob


def empty(name, loc, collection):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_type = 'PLAIN_AXES'
    ob.empty_display_size = 0.12
    collection.objects.link(ob)
    ob.location = loc
    return ob


def attach(child, parent):
    child.parent = parent
    return child


MALE = {
    'variant': 'male',
    'collection': 'Avatar_Male',
    'hair_material': 'hair_male',
    'pivots': {
        'head': (0.0, 0.0, 2.200), 'torso': (0.0, 0.0, 1.375),
        'left_arm': (-0.58, 0.0, 1.750), 'right_arm': (0.58, 0.0, 1.750),
        'left_leg': (-0.22, 0.0, 0.900), 'right_leg': (0.22, 0.0, 0.900),
    },
    'head_rings': ((-0.275, 0.245, 0.245), (-0.050, 0.275, 0.270), (0.180, 0.275, 0.275), (0.275, 0.255, 0.255)),
    'visor': ((0.58, 0.20, 0.16), (0.0, -0.220, 0.050)),
    'neck': ((0.24, 0.24, 0.14), (0.0, 0.0, -0.330)),
    'torso_rings': ((-0.475, 0.365, 0.235), (-0.180, 0.345, 0.225), (0.160, 0.425, 0.255), (0.475, 0.395, 0.235)),
    'pelvis': ((0.80, 0.44, 0.20), (0.0, 0.0, -0.440)),
    'shoulder': ((0.40, 0.42, 0.24), (0.0, 0.0, -0.020)),
    'arm_rings': ((-0.860, 0.145, 0.155), (-0.550, 0.155, 0.165), (-0.100, 0.175, 0.185)),
    'hand': ((0.30, 0.32, 0.24), (0.0, 0.0, -0.980)),
    'leg_rings': ((-1.120, 0.155, 0.165), (-0.550, 0.175, 0.185), (-0.020, 0.195, 0.205)),
    'foot': ((0.36, 0.58, 0.20), (0.0, -0.070, -1.200)),
    'hair': 'short',
}

FEMALE = {
    'variant': 'female',
    'collection': 'Avatar_Female',
    'hair_material': 'hair_female',
    'pivots': {
        'head': (0.0, 0.0, 2.075), 'torso': (0.0, 0.0, 1.300),
        'left_arm': (-0.475, 0.0, 1.650), 'right_arm': (0.475, 0.0, 1.650),
        'left_leg': (-0.20, 0.0, 0.850), 'right_leg': (0.20, 0.0, 0.850),
    },
    'head_rings': ((-0.275, 0.235, 0.240), (-0.050, 0.272, 0.265), (0.180, 0.275, 0.272), (0.275, 0.250, 0.250)),
    'visor': ((0.56, 0.20, 0.15), (0.0, -0.215, 0.045)),
    'neck': ((0.21, 0.21, 0.14), (0.0, 0.0, -0.330)),
    'torso_rings': ((-0.450, 0.375, 0.235), (-0.220, 0.360, 0.225), (0.0, 0.265, 0.185), (0.240, 0.335, 0.225), (0.450, 0.325, 0.210)),
    'pelvis': ((0.74, 0.42, 0.20), (0.0, 0.0, -0.400)),
    'shoulder': ((0.34, 0.36, 0.20), (0.0, 0.0, -0.010)),
    'arm_rings': ((-0.780, 0.118, 0.130), (-0.480, 0.128, 0.140), (-0.080, 0.150, 0.160)),
    'hand': ((0.25, 0.27, 0.21), (0.0, 0.0, -0.885)),
    'leg_rings': ((-1.070, 0.128, 0.140), (-0.500, 0.150, 0.160), (-0.020, 0.185, 0.195)),
    'foot': ((0.31, 0.52, 0.20), (0.0, -0.060, -1.150)),
    'hair': 'long',
}


def build_hair(spec, head, collection, mats):
    mat = mats[spec['hair_material']]
    if spec['hair'] == 'short':
        attach(loft('head_hair_cap', ((0.220, 0.283, 0.283), (0.315, 0.275, 0.275), (0.345, 0.240, 0.240)), collection, mat), head)
        attach(box('head_hair_back', (0.566, 0.10, 0.26), (0.0, 0.245, 0.100), collection, mat), head)
        for side, x in (('left', -0.253), ('right', 0.253)):
            attach(box('head_hair_' + side, (0.075, 0.40, 0.16), (x, 0.020, 0.140), collection, mat), head)
        return
    attach(loft('head_hair_cap', ((0.210, 0.285, 0.285), (0.320, 0.278, 0.278), (0.365, 0.235, 0.235)), collection, mat), head)
    tail = loft('head_hair_tail', ((-0.590, 0.240, 0.090), (-0.200, 0.280, 0.095), (0.240, 0.285, 0.100)), collection, mat)
    tail.location = (0.0, 0.235, 0.0)
    attach(tail, head)
    for side, x in (('left', -0.272), ('right', 0.272)):
        attach(box('head_hair_' + side, (0.10, 0.40, 0.62), (x, 0.030, -0.100), collection, mat), head)
    attach(box('head_hair_fringe', (0.50, 0.10, 0.10), (0.0, -0.245, 0.220), collection, mat), head)


def build_avatar(spec, mats):
    collection = bpy.data.collections.get(spec['collection'])
    if collection is None:
        collection = bpy.data.collections.new(spec['collection'])
        bpy.context.scene.collection.children.link(collection)

    root = empty('humanoid_avatar', (0.0, 0.0, 0.0), collection)
    root['rig_type'] = '6-part-procedural'
    root['variant'] = spec['variant']
    root['ground_offset_y'] = FEET_Z
    root['part_nodes'] = ','.join(PART_NODES)
    root['body_materials'] = ','.join(BODY_MATERIALS)

    pivots = spec['pivots']
    head = attach(empty('avatar_head', pivots['head'], collection), root)
    torso = attach(empty('avatar_torso', pivots['torso'], collection), root)
    arms = {side: attach(empty('avatar_' + side + '_arm', pivots[side + '_arm'], collection), root) for side in ('left', 'right')}
    legs = {side: attach(empty('avatar_' + side + '_leg', pivots[side + '_leg'], collection), root) for side in ('left', 'right')}

    attach(loft('head_shell', spec['head_rings'], collection, mats['head']), head)
    attach(box('head_visor', *spec['visor'], collection, mats['visor'], bevel_width=0.012), head)
    attach(box('head_neck', *spec['neck'], collection, mats['head'], bevel_width=0.012), head)
    build_hair(spec, head, collection, mats)

    attach(loft('torso_shell', spec['torso_rings'], collection, mats['torso']), torso)
    attach(box('torso_pelvis', *spec['pelvis'], collection, mats['torso']), torso)

    for side, group in arms.items():
        material = mats[side + 'Arm']
        attach(box(side + '_arm_shoulder', *spec['shoulder'], collection, material), group)
        attach(loft(side + '_arm_shell', spec['arm_rings'], collection, material), group)
        attach(box(side + '_arm_hand', *spec['hand'], collection, material), group)

    for side, group in legs.items():
        material = mats[side + 'Leg']
        attach(loft(side + '_leg_shell', spec['leg_rings'], collection, material), group)
        attach(box(side + '_leg_foot', *spec['foot'], collection, material), group)

    return root


def descendants(root):
    return [root] + [c for c in root.children_recursive]


def rename_tree(root, suffix):
    """Free the canonical node/mesh names so the next variant exports cleanly."""
    for ob in descendants(root):
        ob.name = ob.name + suffix
        if ob.data is not None and ob.data.users == 1:
            ob.data.name = ob.data.name + suffix


def export_glb(root, filepath):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in descendants(root):
        ob.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_extras=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_skins=False,
        export_morph=False,
        export_materials='EXPORT',
        export_image_format='NONE',
    )
    return os.path.getsize(filepath)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    mats = build_materials()
    report = {}
    for spec, suffix in ((MALE, '_male'), (FEMALE, '')):
        root = build_avatar(spec, mats)
        path = os.path.join(OUT_DIR, 'avatar_' + spec['variant'] + '.glb')
        report[spec['variant']] = {'file': path, 'bytes': export_glb(root, path), 'objects': len(descendants(root))}
        if suffix:
            rename_tree(root, suffix)
    for ob in bpy.data.objects:
        if ob.name in {'Cube'}:
            ob.hide_render = True
            ob.hide_viewport = True
    return report


if __name__ == '__main__':
    result = main()
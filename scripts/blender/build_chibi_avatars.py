"""Build the two reference-based chibi avatars and export them as GLB.

Usage inside Blender:
    exec(compile(open('scripts/blender/build_chibi_avatars.py').read(), ..., 'exec'),
         {'__file__': ..., '__name__': '__main__'})
or headless:
    blender --background --python scripts/blender/build_chibi_avatars.py
"""

import math
import os
import sys
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy  # noqa: E402

from chibi_lib import (  # noqa: E402
    Projector, attach, clump, ellipse_points, ellipsoid, material, mesh_object, sweep, tube,
)
from chibi_body import (  # noqa: E402
    build_arm, build_head, build_leg, build_rig, build_torso, jaw_taper,
)

OUT_DIR = os.path.abspath(os.path.join(HERE, '..', '..', 'mochi', 'public', 'models'))

PALETTES = {
    'female': {
        'head': ('#ffe9ec', 0.55), 'torso': ('#fdfdfd', 0.75),
        'leftArm': ('#ffe9ec', 0.55), 'rightArm': ('#ffe9ec', 0.55),
        'leftLeg': ('#ffe9ec', 0.55), 'rightLeg': ('#ffe9ec', 0.55),
        'hair': ('#f2a9c6', 0.45), 'hair_shade': ('#dd86ab', 0.45),
        'hat': ('#7ba6d9', 0.6), 'hat_dark': ('#5d84b8', 0.6), 'hat_patch': ('#f2f6ff', 0.6),
        'jacket': ('#8fb4e4', 0.7), 'shorts': ('#45526e', 0.8),
        'sock': ('#f7dce6', 0.8), 'shoe': ('#7fa8dc', 0.5),
        'sole': ('#f4f7ff', 0.6), 'trim': ('#ffffff', 0.6),
        'blush': ('#f6b6c6', 0.7), 'mouth': ('#b4636f', 0.6), 'print': ('#a9c6e8', 0.8),
    },
    'male': {
        'head': ('#ffeae6', 0.55), 'torso': ('#8ea6cf', 0.75),
        'leftArm': ('#ffeae6', 0.55), 'rightArm': ('#ffeae6', 0.55),
        'leftLeg': ('#ffeae6', 0.55), 'rightLeg': ('#ffeae6', 0.55),
        'hair': ('#eef3fb', 0.45), 'hair_shade': ('#c6d5ec', 0.45),
        'hat': ('#93a9d2', 0.75), 'hat_dark': ('#7e95c0', 0.75), 'hat_patch': ('#f2f6ff', 0.7),
        'jacket': ('#7288b0', 0.75), 'shorts': ('#3c4459', 0.8),
        'sock': ('#f2f5fc', 0.85), 'shoe': ('#e8eefb', 0.5),
        'sole': ('#ffffff', 0.6), 'trim': ('#f6f8ff', 0.6),
        'blush': ('#f3b3b8', 0.7), 'mouth': ('#a9666a', 0.6), 'print': ('#f4f7ff', 0.8),
        'clip': ('#f7d774', 0.4),
    },
}

FACES = {
    'female': {'iris': '#e0567f', 'iris_shade': '#f490a9', 'pupil': '#7c2a45', 'lash': '#4a2c3a', 'glint': '#ffffff'},
    'male': {'iris': '#6b6f8c', 'iris_shade': '#9aa0bd', 'pupil': '#2e3145', 'lash': '#3a3a4d', 'glint': '#ffffff'},
}


def build_materials(variant):
    # Namespaced while editing so the two characters keep independent palettes;
    # export_glb() strips the prefix so the GLB keeps the canonical material names.
    mats = {key: material(variant + '__' + key, *values) for key, values in PALETTES[variant].items()}
    face = FACES[variant]
    mats['face'] = {key: material(variant + '__face_' + key, color, 0.35) for key, color in face.items()}
    mats['face']['glint'] = material(variant + '__face_glint', face['glint'], 0.2,
                                     emission=face['glint'], strength=0.35)
    return mats


def lock(name, root, mid, tip, width, thick, collection, mat, steps=7):
    points = []
    for i in range(steps):
        t = i / (steps - 1)
        a, b, c = (1 - t) ** 2, 2 * (1 - t) * t, t * t
        co = tuple(a * root[k] + b * mid[k] + c * tip[k] for k in range(3))
        taper = max(0.004, (1 - t) ** 0.7)
        points.append(co + (width * taper, thick * taper))
    return clump(name, points, collection, mat)


def scalp(collection, mats, parent, radii=(0.485, 0.425, 0.445), loc=(0, 0.045, 0.085)):
    offset = Vector(loc)

    def shape(co):
        return jaw_taper(co + offset)

    def keep(co):
        # Leave the face open; the bangs cover the resulting hairline.
        return not (co.y < -0.06 and co.z < 0.16)

    return attach(ellipsoid('hair_scalp', radii, (0, 0, 0), collection, mats['hair'],
                            shape=shape, keep=keep), parent)


def girl_hair(collection, mats, head):
    scalp(collection, mats, head)
    tips = [(-0.38, -0.20), (-0.30, 0.00), (-0.16, 0.18), (0.0, 0.22), (0.16, 0.18), (0.30, 0.00), (0.38, -0.20)]
    for index, (x, z) in enumerate(tips):
        attach(lock('hair_bang' + str(index), (x * 0.72, -0.16, 0.40), (x * 1.06, -0.38, 0.26),
                    (x * 1.12, -0.435, z), 0.095, 0.038, collection, mats['hair']), head)
    attach(lock('hair_ahoge', (0.02, -0.20, 0.40), (0.12, -0.26, 0.56), (0.22, -0.20, 0.58),
                0.035, 0.028, collection, mats['hair']), head)
    for sign, side in ((-1, 'left'), (1, 'right')):
        attach(lock('hair_frame_' + side, (sign * 0.40, -0.10, 0.24), (sign * 0.47, -0.22, -0.14),
                    (sign * 0.43, -0.27, -0.55), 0.115, 0.040, collection, mats['hair']), head)
    attach(ellipsoid('hair_back_mass', (0.36, 0.22, 0.60), (0, 0.30, -0.30), collection, mats['hair_shade'], sub=1), head)
    for sign, side in ((-1, 'left'), (1, 'right')):
        for index in range(5):
            spread = 0.26 + index * 0.15
            drop = -1.00 - index * 0.09
            attach(lock('hair_tail_%s%d' % (side, index),
                        (sign * 0.16, 0.26, 0.20 - index * 0.06),
                        (sign * (spread * 0.75), 0.42, -0.45),
                        (sign * spread, 0.30 - index * 0.05, drop),
                        0.205 - index * 0.010, 0.052, collection, mats['hair']), head)
    for index in range(2):
        attach(lock('hair_back' + str(index), ((index - 0.5) * 0.16, 0.34, 0.05),
                    ((index - 0.5) * 0.30, 0.46, -0.60), ((index - 0.5) * 0.36, 0.38, -1.20),
                    0.19, 0.055, collection, mats['hair_shade']), head)


def girl_hat(collection, mats, head):
    crown = tube('hat_crown', (
        (0.30, 0, 0.04, 0.480, 0.430), (0.45, 0, 0.04, 0.470, 0.425),
        (0.58, 0, 0.04, 0.405, 0.365), (0.68, 0, 0.04, 0.270, 0.250), (0.72, 0, 0.04, 0.050, 0.050),
    ), collection, mats['hat'], sides=24, sub=1)
    attach(crown, head)
    frames = []
    for y, z, half_w in ((-0.26, 0.345, 0.335), (-0.44, 0.325, 0.345), (-0.60, 0.275, 0.310), (-0.70, 0.225, 0.220)):
        frames.append((Vector((0, y, z)), Vector((1, 0, 0)), Vector((0, -0.35, 1)), half_w, 0.026))
    attach(sweep('hat_brim', frames, collection, mats['hat_dark'], sides=16, exponent=3.0, sub=1), head)
    for sign, side in ((-1, 'left'), (1, 'right')):
        ear = ellipsoid('hat_ear_' + side, (0.135, 0.085, 0.145), (sign * 0.29, 0.08, 0.700), collection, mats['hat'], sub=1)
        ear.rotation_euler = (0.0, sign * math.radians(20), 0.0)
        attach(ear, head)
        inner = ellipsoid('hat_ear_inner_' + side, (0.082, 0.030, 0.092), (sign * 0.30, 0.015, 0.705), collection, mats['hat_dark'], sub=1)
        inner.rotation_euler = (0.0, sign * math.radians(20), 0.0)
        attach(inner, head)
    patch = ellipse_points(0.280, 0.460, 0.072, 0.048, 28)
    attach(Projector(crown).decal('hat_patch', patch, collection, mats['hat_patch'], offset=0.006), head)
    text = bpy.data.curves.new('hat_label_curve', type='FONT')
    text.body = 'SKI'
    text.align_x = 'CENTER'
    text.align_y = 'CENTER'
    text.size = 0.062
    text.extrude = 0.0008
    label = bpy.data.objects.new('hat_label', text)
    collection.objects.link(label)
    label.data.materials.append(mats['hat_dark'])
    surface = Projector(crown).project(0.280, 0.460, 0.014)
    label.location = surface
    label.rotation_euler = (math.radians(90), 0.0, math.radians(38))
    attach(label, head)


def girl_outfit(collection, mats, nodes, torso_info):
    projector = torso_info['projector']
    torso = nodes['torso']
    head = nodes['head']
    attach(projector.decal('print_cat_head', ellipse_points(0.0, 0.055, 0.082, 0.070, 32),
                           collection, mats['print'], offset=0.005), torso)
    for sign in (-1, 1):
        ear = [(sign * 0.070 - 0.026, 0.100), (sign * 0.070 + 0.026, 0.104), (sign * 0.078, 0.158)]
        attach(projector.decal('print_cat_ear' + str(sign), ear, collection, mats['print'], offset=0.005), torso)
    attach(projector.decal('print_cat_body', ellipse_points(0.015, -0.045, 0.078, 0.042, 28),
                           collection, mats['print'], offset=0.005), torso)
    attach(tube('jacket_back', (
        (0.20, 0, 0.170, 0.300, 0.075), (-0.05, 0, 0.200, 0.345, 0.085), (-0.42, 0, 0.190, 0.365, 0.080),
    ), collection, mats['jacket'], exponent=3.0, sub=1), torso)
    for sign, side in ((-1, 'left'), (1, 'right')):
        attach(tube('jacket_front_' + side, (
            (0.16, sign * 0.295, -0.060, 0.080, 0.200),
            (-0.10, sign * 0.330, -0.070, 0.090, 0.210),
            (-0.45, sign * 0.345, -0.075, 0.085, 0.200),
        ), collection, mats['jacket'], exponent=3.0, sub=1), torso)
    attach(tube('torso_shorts', (
        (-0.30, 0, 0, 0.248, 0.172), (-0.38, 0, 0, 0.252, 0.174), (-0.46, 0, 0, 0.243, 0.168),
    ), collection, mats['shorts'], sides=20, exponent=5.0, sub=1), torso)
    attach(ellipsoid('hair_ribbon_left', (0.075, 0.055, 0.045), (-0.36, 0.02, -0.52), collection, mats['hat'], sub=1), head)


def boy_hair(collection, mats, head):
    scalp(collection, mats, head, radii=(0.475, 0.420, 0.430), loc=(0, 0.040, 0.075))
    tips = [(-0.40, -0.14), (-0.32, 0.00), (-0.24, 0.17), (-0.13, 0.21), (0.0, 0.16),
            (0.13, 0.21), (0.24, 0.17), (0.32, 0.00), (0.40, -0.14)]
    for index, (x, z) in enumerate(tips):
        attach(lock('hair_bang' + str(index), (x * 0.70, -0.15, 0.34), (x * 1.05, -0.36, 0.24),
                    (x * 1.14, -0.415, z), 0.075, 0.045, collection, mats['hair']), head)
    for sign in (-1, 1):
        attach(lock('hair_stray' + str(sign), (sign * 0.03, -0.18, 0.30), (sign * 0.05, -0.38, 0.14),
                    (sign * 0.045, -0.425, -0.02), 0.028, 0.022, collection, mats['hair']), head)
    for sign, side in ((-1, 'left'), (1, 'right')):
        attach(lock('hair_frame_' + side, (sign * 0.38, -0.08, 0.20), (sign * 0.47, -0.18, -0.05),
                    (sign * 0.50, -0.20, -0.34), 0.100, 0.060, collection, mats['hair']), head)
        for index in range(3):
            attach(lock('hair_spike_%s%d' % (side, index),
                        (sign * 0.24, 0.20 + index * 0.06, 0.05 - index * 0.10),
                        (sign * 0.44, 0.30 + index * 0.05, -0.20 - index * 0.08),
                        (sign * (0.50 - index * 0.04), 0.26 + index * 0.05, -0.46 - index * 0.06),
                        0.105, 0.070, collection, mats['hair_shade']), head)
    attach(ellipsoid('hair_back_mass', (0.32, 0.20, 0.34), (0, 0.28, -0.12), collection, mats['hair_shade'], sub=1), head)


def boy_hat(collection, mats, head):
    attach(tube('hat_crown', (
        (0.12, 0, 0.03, 0.495, 0.450), (0.30, 0, 0.03, 0.490, 0.445),
        (0.45, 0, 0.03, 0.430, 0.395), (0.56, 0, 0.03, 0.290, 0.270), (0.60, 0, 0.03, 0.070, 0.070),
    ), collection, mats['hat'], sides=24, sub=1), head)
    attach(tube('hat_rim', (
        (0.070, 0, 0.03, 0.500, 0.455), (0.130, 0, 0.03, 0.518, 0.473), (0.190, 0, 0.03, 0.505, 0.460),
    ), collection, mats['hat_dark'], sides=24, exponent=2.5, sub=1), head)
    attach(ellipsoid('hat_pom', (0.130, 0.125, 0.125), (0.05, 0.16, 0.635), collection, mats['hat_patch'], sub=1), head)
    star = []
    for i in range(10):
        angle = math.pi / 2 + i * math.pi / 5
        radius = 0.062 if i % 2 == 0 else 0.028
        star.append((math.cos(angle) * radius, math.sin(angle) * radius))
    clip = mesh_object('hair_star_clip', [(x - 0.325, -0.395, z + 0.115) for x, z in star],
                       [tuple(range(10))], collection, mats['clip'])
    clip.rotation_euler = (0.0, 0.0, 0.0)
    attach(clip, head)


def boy_outfit(collection, mats, nodes, torso_info):
    projector = torso_info['projector']
    torso = nodes['torso']
    outer = [(0.014, 0.250 - i * 0.020) for i in range(28)]
    inner = [(-0.014, 0.250 - i * 0.020) for i in range(28)]
    attach(projector.ribbon('hoodie_zipper', outer, inner, collection, mats['trim'], offset=0.006), torso)
    attach(projector.decal('hoodie_zip_pull', ellipse_points(0.0, 0.075, 0.026, 0.038, 20),
                           collection, mats['jacket'], offset=0.010), torso)
    for sign, side in ((-1, 'left'), (1, 'right')):
        attach(lock('hoodie_string_' + side, (sign * 0.070, -0.150, 0.230), (sign * 0.105, -0.235, 0.090),
                    (sign * 0.098, -0.245, -0.055), 0.016, 0.016, collection, mats['trim'], steps=5), torso)
        attach(ellipsoid('hoodie_string_tip_' + side, (0.020, 0.018, 0.026),
                         (sign * 0.098, -0.245, -0.060), collection, mats['trim'], sub=1), torso)
    attach(ellipsoid('hoodie_hood', (0.235, 0.150, 0.135), (0, 0.170, 0.215), collection, mats['torso'], sub=1), torso)
    attach(ellipsoid('hoodie_hood_inner', (0.185, 0.090, 0.100), (0, 0.130, 0.230), collection, mats['jacket'], sub=1), torso)
    attach(projector.decal('print_bunny_head', ellipse_points(-0.165, 0.020, 0.042, 0.032, 24),
                           collection, mats['print'], offset=0.006), torso)
    for sign in (-1, 1):
        attach(projector.decal('print_bunny_ear' + str(sign),
                               ellipse_points(-0.165 + sign * 0.022, 0.068, 0.013, 0.030, 18),
                               collection, mats['print'], offset=0.006), torso)
    attach(tube('hoodie_belt', (
        (-0.298, 0, 0, 0.302, 0.219), (-0.334, 0, 0, 0.302, 0.219),
    ), collection, mats['trim'], sides=24, exponent=6.0, sub=0), torso)
    attach(tube('torso_shorts', (
        (-0.34, 0, 0, 0.270, 0.190), (-0.46, 0, 0, 0.260, 0.180),
    ), collection, mats['shorts'], exponent=3.0, sub=1), torso)


def descendants(root):
    return [root] + list(root.children_recursive)


def export_glb(root, filepath, mats):
    materials = [m for m in mats.values() if not isinstance(m, dict)] + list(mats['face'].values())
    namespaced = [(mat, mat.name) for mat in materials]
    for mat, _original in namespaced:
        mat.name = mat.name.split('__', 1)[-1]
    bpy.ops.object.select_all(action='DESELECT')
    for ob in descendants(root):
        ob.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=filepath, export_format='GLB', use_selection=True, export_apply=True,
        export_yup=True, export_extras=True, export_animations=False, export_cameras=False,
        export_lights=False, export_skins=False, export_morph=False, export_materials='EXPORT',
        export_image_format='NONE',
    )
    for mat, original in namespaced:
        mat.name = original
    return os.path.getsize(filepath)


def build(variant):
    collection = bpy.data.collections.new('Chibi_' + variant)
    bpy.context.scene.collection.children.link(collection)
    mats = build_materials(variant)
    nodes = build_rig(collection, variant)
    head_info = build_head(nodes, collection, mats)
    if variant == 'female':
        top_rings = ((-0.30, 0, 0, 0.295, 0.200), (-0.16, 0, 0, 0.285, 0.190),
                     (0.04, 0, 0, 0.250, 0.172), (0.18, 0, 0, 0.245, 0.168), (0.26, 0, 0, 0.150, 0.120))
        sleeve = ((0.06, 0, 0, 0.130, 0.140), (-0.16, 0, 0, 0.150, 0.155),
                  (-0.36, 0, 0, 0.140, 0.145), (-0.44, 0, 0, 0.115, 0.120))
        legwear = [
            (
                ((-0.50, 0, 0, 0.086, 0.086), (-0.56, 0, 0, 0.090, 0.090),
                 (-0.74, 0, 0, 0.082, 0.082), (-0.78, 0, 0, 0.080, 0.080)),
                'sock',
            ),
            (
                ((-0.515, 0, 0, 0.092, 0.092), (-0.550, 0, 0, 0.093, 0.093)),
                'trim',
            ),
        ]
    else:
        top_rings = ((-0.30, 0, 0, 0.300, 0.215), (-0.14, 0, 0, 0.315, 0.225),
                     (0.06, 0, 0, 0.295, 0.215), (0.20, 0, 0, 0.275, 0.200), (0.28, 0, 0, 0.170, 0.135))
        sleeve = ((0.06, 0, 0, 0.140, 0.150), (-0.16, 0, 0, 0.155, 0.160),
                  (-0.36, 0, 0, 0.140, 0.145), (-0.44, 0, 0, 0.110, 0.115))
        legwear = [
            (
                ((-0.40, 0, 0, 0.098, 0.098), (-0.48, 0, 0, 0.112, 0.112), (-0.60, 0, 0, 0.118, 0.118),
                 (-0.72, 0, 0, 0.108, 0.108), (-0.76, 0, 0, 0.100, 0.100)),
                'sock',
            ),
            (
                ((-0.395, 0, 0, 0.100, 0.100), (-0.435, 0, 0, 0.106, 0.106)),
                'trim',
            ),
        ]
    torso_info = build_torso(nodes, collection, mats, top_rings)
    for side in ('left', 'right'):
        build_arm(nodes, collection, mats, side, sleeve, 'jacket' if variant == 'female' else 'torso')
        build_leg(nodes, collection, mats, side, side + 'Leg', legwear)
    if variant == 'female':
        girl_hair(collection, mats, nodes['head'])
        girl_hat(collection, mats, nodes['head'])
        girl_outfit(collection, mats, nodes, torso_info)
    else:
        boy_hair(collection, mats, nodes['head'])
        boy_hat(collection, mats, nodes['head'])
        boy_outfit(collection, mats, nodes, torso_info)
    return {'root': nodes['root'], 'nodes': nodes, 'collection': collection, 'mats': mats,
            'projector_misses': head_info['projector'].misses + torso_info['projector'].misses}


def rename_tree(root, suffix):
    for ob in descendants(root):
        ob.name = ob.name + suffix
        if ob.data is not None and ob.data.users == 1:
            ob.data.name = ob.data.name + suffix


def clear_chibi_collections():
    """Drop previous chibi drafts so rebuilding is idempotent."""
    for collection in list(bpy.data.collections):
        if not collection.name.startswith('Chibi_'):
            continue
        for ob in list(collection.all_objects):
            bpy.data.objects.remove(ob, do_unlink=True)
        bpy.data.collections.remove(collection)


def prepare_scene():
    """Park the earlier blocky drafts so the canonical rig names stay free."""
    for name in ('Avatar_Male', 'Avatar_Female'):
        collection = bpy.data.collections.get(name)
        if not collection:
            continue
        for ob in collection.all_objects:
            if not ob.name.endswith('_blocky'):
                ob.name = ob.name + '_blocky'
        collection.hide_render = True
        collection.hide_viewport = True
    cube = bpy.data.objects.get('Cube')
    if cube:
        cube.hide_render = True
        cube.hide_viewport = True


def main(variants=('female', 'male')):
    os.makedirs(OUT_DIR, exist_ok=True)
    clear_chibi_collections()
    prepare_scene()
    report = {}
    for variant in variants:
        built = build(variant)
        path = os.path.join(OUT_DIR, 'avatar_' + variant + '.glb')
        report[variant] = {'file': path, 'bytes': export_glb(built['root'], path, built['mats']),
                           'objects': len(descendants(built['root'])), 'decal_misses': built['projector_misses']}
        rename_tree(built['root'], '_' + variant)
        built['collection'].hide_render = True
        built['collection'].hide_viewport = True
    return report


if __name__ == '__main__':
    result = main()
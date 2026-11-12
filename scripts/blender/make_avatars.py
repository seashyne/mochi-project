"""Headless driver: build both chibi avatars, export GLB, render previews.

    blender --background --python scripts/blender/make_avatars.py
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy  # noqa: E402

import build_chibi_avatars as B  # noqa: E402
import studio_preview as S  # noqa: E402

TMP = os.path.abspath(os.path.join(HERE, '..', '..', '.tmp'))
VARIANTS = ('female', 'male')


def show(variant, visible):
    collection = bpy.data.collections.get('Chibi_' + variant)
    collection.hide_render = not visible
    collection.hide_viewport = not visible


def place(variant, x):
    root = bpy.data.objects.get('humanoid_avatar_' + variant)
    root.location = (x, 0.0, 0.0)


def soften_faces():
    """Hair and hats shadow the face too hard for a clean character preview."""
    for ob in bpy.data.objects:
        if ob.type == 'MESH' and ob.name.startswith(('hair_', 'hat_')):
            ob.visible_shadow = False


def main():
    os.makedirs(TMP, exist_ok=True)
    report = B.main(VARIANTS)
    S.setup_studio()
    soften_faces()
    bpy.context.scene.view_settings.view_transform = 'Khronos PBR Neutral'
    images = {}
    for variant in VARIANTS:
        for other in VARIANTS:
            show(other, other == variant)
        place(variant, 0.0)
        S.aim_camera(target=(0, 0, 1.02), offset=(1.5, -6.0, 1.6))
        images[variant] = S.render(os.path.join(TMP, 'chibi_' + variant + '.png'), resolution=(900, 1200))
    for variant in VARIANTS:
        show(variant, True)
    place('female', -1.15)
    place('male', 1.15)
    S.aim_camera(target=(0, 0, 1.02), offset=(0.6, -7.4, 1.7))
    images['pair'] = S.render(os.path.join(TMP, 'chibi_pair.png'), resolution=(1600, 1150))
    blend = os.path.join(TMP, 'mochi_chibi_avatars.blend')
    bpy.ops.wm.save_as_mainfile(filepath=blend)
    return {'exports': report, 'images': images, 'blend': blend}


if __name__ == '__main__':
    result = main()
    print('MOCHI_RESULT', result)
"""Shared chibi body: oversized head, small torso, slim limbs, 6-node rig.

Both reference characters share the same chibi proportions, so only the palette,
hair, hat and outfit differ. All coordinates below are local to their rig node.
"""

import math
from mathutils import Vector

from chibi_lib import (
    Projector, attach, build_eye, ellipse_points, ellipsoid, empty, tube,
)

HEAD_Z = 1.62
HEAD_RADII = (0.46, 0.40, 0.43)
TORSO_Z = 0.92
SHOULDER = (0.30, 1.10)
HIP = (0.135, 0.55)


def jaw_taper(co):
    if co.z >= 0:
        return co
    factor = 1.0 + (co.z / HEAD_RADII[2]) * 0.45
    return Vector((co.x * factor, co.y * (factor * 0.95 + 0.05), co.z))


def build_rig(collection, variant):
    root = empty('humanoid_avatar', (0, 0, 0), collection)
    root['rig_type'] = '6-part-procedural'
    root['variant'] = variant
    root['ground_offset_y'] = -0.4
    root['part_nodes'] = 'avatar_head,avatar_torso,avatar_left_arm,avatar_right_arm,avatar_left_leg,avatar_right_leg'
    root['body_materials'] = 'head,torso,leftArm,rightArm,leftLeg,rightLeg'
    nodes = {
        'root': root,
        'head': attach(empty('avatar_head', (0, 0, HEAD_Z), collection), root),
        'torso': attach(empty('avatar_torso', (0, 0, TORSO_Z), collection), root),
    }
    for side, sign in (('left', -1), ('right', 1)):
        nodes[side + '_arm'] = attach(
            empty('avatar_' + side + '_arm', (sign * SHOULDER[0], 0, SHOULDER[1]), collection), root)
        nodes[side + '_leg'] = attach(
            empty('avatar_' + side + '_leg', (sign * HIP[0], 0, HIP[1]), collection), root)
    return nodes


def build_head(nodes, collection, mats):
    head = nodes['head']
    skull = ellipsoid('head_shell', HEAD_RADII, (0, 0, 0), collection, mats['head'],
                      segments=44, rings=30, shape=jaw_taper, sub=1)
    attach(skull, head)
    projector = Projector(skull)
    face = mats['face']
    for side, sign in (('left', -1), ('right', 1)):
        build_eye(projector, 'eye_' + side, sign * 0.20, -0.02, 0.125, 0.155, face, collection, head)
        brow = ellipse_points(sign * 0.205, 0.205, 0.062, 0.016, 24)
        attach(projector.decal('brow_' + side, brow, collection, face['lash'], offset=0.006), head)
        blush = ellipse_points(sign * 0.255, -0.155, 0.050, 0.028, 28)
        attach(projector.decal('blush_' + side, blush, collection, mats['blush'], offset=0.005), head)
    attach(projector.decal('mouth', ellipse_points(0.0, -0.30, 0.024, 0.030, 28),
                           collection, mats['mouth'], offset=0.006), head)
    attach(ellipsoid('head_neck', (0.085, 0.08, 0.10), (0, 0.02, -0.46), collection, mats['head'], sub=1), head)
    return {'skull': skull, 'projector': projector}


def build_torso(nodes, collection, mats, top_rings, top_key='torso'):
    torso = nodes['torso']
    shell = tube('torso_top', top_rings, collection, mats[top_key], exponent=3.0, sub=1)
    attach(shell, torso)
    return {'shell': shell, 'projector': Projector(shell)}


def build_arm(nodes, collection, mats, side, sleeve_rings, sleeve_key, cuff=None):
    group = nodes[side + '_arm']
    sleeve = tube(side + '_arm_sleeve', sleeve_rings, collection, mats[sleeve_key], exponent=2.5, sub=1)
    attach(sleeve, group)
    if cuff:
        rings, key = cuff
        attach(tube(side + '_arm_cuff', rings, collection, mats[key], exponent=2.5, sub=1), group)
    hand = ellipsoid(side + '_arm_hand', (0.075, 0.062, 0.085), (0, -0.01, -0.50), collection, mats[side + 'Arm'], sub=1)
    attach(hand, group)


def build_leg(nodes, collection, mats, side, leg_key, legwear):
    group = nodes[side + '_leg']
    leg = tube(side + '_leg_shell', (
        (0.02, 0, 0, 0.100, 0.100),
        (-0.20, 0, 0, 0.105, 0.105),
        (-0.45, 0, 0, 0.082, 0.082),
        (-0.72, 0, 0, 0.070, 0.070),
    ), collection, mats[leg_key], exponent=2.0, sub=1)
    attach(leg, group)
    for rings, key in legwear:
        attach(tube(side + '_leg_' + key, rings, collection, mats[key], exponent=2.5, sub=1), group)
    build_shoe(nodes, collection, mats, side)


def build_shoe(nodes, collection, mats, side):
    group = nodes[side + '_leg']
    prefix = side + '_shoe'
    attach(tube(prefix + '_sole', (
        (-0.950, 0, -0.055, 0.112, 0.198),
        (-0.905, 0, -0.055, 0.118, 0.205),
        (-0.865, 0, -0.055, 0.110, 0.196),
    ), collection, mats['sole'], exponent=3.5, sub=1), group)
    attach(tube(prefix + '_upper', (
        (-0.880, 0, -0.050, 0.104, 0.186),
        (-0.800, 0, -0.045, 0.104, 0.180),
        (-0.740, 0, -0.020, 0.092, 0.135),
        (-0.720, 0, -0.005, 0.080, 0.090),
    ), collection, mats['shoe'], exponent=3.0, sub=1), group)
    attach(ellipsoid(prefix + '_toe', (0.098, 0.100, 0.062), (0, -0.175, -0.855), collection, mats['sole'], sub=1), group)
    attach(ellipsoid(prefix + '_knot', (0.022, 0.020, 0.020), (0, -0.105, -0.735), collection, mats['trim'], sub=1), group)
    for sign in (-1, 1):
        bow = ellipsoid(prefix + '_bow' + str(sign), (0.048, 0.024, 0.028),
                        (sign * 0.052, -0.105, -0.730), collection, mats['trim'], sub=1)
        bow.rotation_euler = (0.0, sign * math.radians(-18), 0.0)
        attach(bow, group)
    for index in range(3):
        z = -0.762 - index * 0.024
        attach(ellipsoid(prefix + '_lace' + str(index), (0.055, 0.012, 0.010),
                         (0, -0.132 + index * 0.014, z), collection, mats['trim'], segments=16, rings=10, sub=0), group)

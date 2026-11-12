"""Reusable procedural modelling helpers for the chibi Mochi avatars.

Everything is built in Blender Z-up space, parented under the 6 canonical rig
empties so the exported GLB can be driven by the existing runtime walk cycle.
Facial features and prints are projected onto their host mesh with ray casts so
they follow the surface instead of floating or sinking.
"""

import bpy
import bmesh
import math
from mathutils import Vector

TAU = math.pi * 2.0


def rgba(value):
    def linear(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    value = value.lstrip('#')
    return tuple(linear(int(value[i:i + 2], 16) / 255.0) for i in (0, 2, 4)) + (1.0,)


def material(name, color, roughness=0.6, metallic=0.0, emission=None, strength=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    tree.nodes.clear()
    out = tree.nodes.new('ShaderNodeOutputMaterial')
    out.location = (320, 0)
    bsdf = tree.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = rgba(color)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if emission:
        bsdf.inputs['Emission Color'].default_value = rgba(emission)
        bsdf.inputs['Emission Strength'].default_value = strength
    tree.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    mat.diffuse_color = rgba(color)
    return mat


def smooth(ob):
    ob.data.polygons.foreach_set('use_smooth', [True] * len(ob.data.polygons))
    return ob


def subsurf(ob, levels=1):
    mod = ob.modifiers.new('Subsurf', 'SUBSURF')
    mod.levels = levels
    mod.render_levels = levels
    return ob


def mesh_object(name, verts, faces, collection, mat):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    collection.objects.link(ob)
    if mat:
        mesh.materials.append(mat)
    return ob


def attach(ob, parent):
    ob.parent = parent
    return ob


def empty(name, loc, collection, parent=None):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_type = 'PLAIN_AXES'
    ob.empty_display_size = 0.1
    collection.objects.link(ob)
    ob.location = loc
    if parent:
        ob.parent = parent
    return ob


def ellipsoid(name, radii, loc, collection, mat, segments=24, rings=14, shape=None, sub=1, keep=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1.0)
    for vert in bm.verts:
        co = Vector((vert.co.x * radii[0], vert.co.y * radii[1], vert.co.z * radii[2]))
        vert.co = shape(co) if shape else co
    if keep:
        doomed = [vert for vert in bm.verts if not keep(vert.co)]
        bmesh.ops.delete(bm, geom=doomed, context='VERTS')
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    collection.objects.link(ob)
    ob.location = loc
    mesh.materials.append(mat)
    smooth(ob)
    if sub:
        subsurf(ob, sub)
    return ob


def signed_pow(value, power):
    return math.copysign(abs(value) ** power, value)


def sweep(name, frames, collection, mat, sides=16, exponent=2.0, sub=1, cap_start=True, cap_end=True):
    """Loft a super-ellipse section along frames of (center, side, normal, half_w, half_h)."""
    verts = []
    power = 2.0 / exponent
    for center, side, normal, half_w, half_h in frames:
        center, side, normal = Vector(center), Vector(side), Vector(normal)
        for i in range(sides):
            angle = TAU * i / sides
            u = signed_pow(math.cos(angle), power) * half_w
            v = signed_pow(math.sin(angle), power) * half_h
            verts.append(tuple(center + side * u + normal * v))
    faces = []
    for ring in range(len(frames) - 1):
        base, nxt = ring * sides, (ring + 1) * sides
        for i in range(sides):
            j = (i + 1) % sides
            faces.append((base + i, base + j, nxt + j, nxt + i))
    if cap_start:
        faces.append(tuple(reversed(range(sides))))
    if cap_end:
        faces.append(tuple((len(frames) - 1) * sides + i for i in range(sides)))
    ob = mesh_object(name, verts, faces, collection, mat)
    smooth(ob)
    if sub:
        subsurf(ob, sub)
    return ob


def tube(name, rings, collection, mat, sides=14, exponent=2.0, sub=1):
    """Vertical loft; rings are (z, cx, cy, half_x, half_y)."""
    frames = [(Vector((cx, cy, z)), Vector((1, 0, 0)), Vector((0, 1, 0)), hx, hy)
              for z, cx, cy, hx, hy in rings]
    return sweep(name, frames, collection, mat, sides=sides, exponent=exponent, sub=sub)


def clump(name, path, collection, mat, sides=8, exponent=2.0, sub=1):
    """Tapered hair lock; path is a list of (x, y, z, half_width, half_thickness)."""
    centers = [Vector(p[:3]) for p in path]
    frames = []
    for index, point in enumerate(path):
        prev = centers[max(0, index - 1)]
        nxt = centers[min(len(centers) - 1, index + 1)]
        tangent = (nxt - prev)
        tangent = tangent.normalized() if tangent.length > 1e-6 else Vector((0, 0, -1))
        side = tangent.cross(Vector((0, 1, 0)))
        side = side.normalized() if side.length > 1e-6 else Vector((1, 0, 0))
        normal = side.cross(tangent).normalized()
        frames.append((centers[index], side, normal, point[3], point[4]))
    return sweep(name, frames, collection, mat, sides=sides, exponent=exponent, sub=sub)


def ellipse_points(cx, cz, half_w, half_h, count=40, start=0.0, end=TAU):
    return [(cx + math.cos(start + (end - start) * i / count) * half_w,
             cz + math.sin(start + (end - start) * i / count) * half_h) for i in range(count)]


class Projector:
    """Ray-casts flat artwork onto a host mesh, in the host's local space."""

    def __init__(self, target, direction=(0, 1, 0), distance=6.0):
        self.target = target
        self.direction = Vector(direction)
        self.distance = distance
        self.misses = 0

    def _evaluated(self):
        return self.target.evaluated_get(bpy.context.evaluated_depsgraph_get())

    def project(self, x, z, offset):
        origin = Vector((x, 0.0, z)) - self.direction * self.distance
        hit, loc, _normal, _index = self._evaluated().ray_cast(origin, self.direction)
        if not hit:
            self.misses += 1
            return Vector((x, -0.30, z))
        return loc + self.direction * (-offset)

    def decal(self, name, ring, collection, mat, offset=0.004, center=None):
        if center is None:
            center = (sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring))
        verts = [tuple(self.project(center[0], center[1], offset))]
        verts += [tuple(self.project(x, z, offset)) for x, z in ring]
        faces = [(0, i + 1, (i + 1) % len(ring) + 1) for i in range(len(ring))]
        ob = mesh_object(name, verts, faces, collection, mat)
        smooth(ob)
        return ob

    def ribbon(self, name, outer, inner, collection, mat, offset=0.005):
        verts = []
        for (ox, oz), (ix, iz) in zip(outer, inner):
            verts.append(tuple(self.project(ox, oz, offset)))
            verts.append(tuple(self.project(ix, iz, offset)))
        faces = [(2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2) for i in range(len(outer) - 1)]
        ob = mesh_object(name, verts, faces, collection, mat)
        smooth(ob)
        return ob


def build_eye(projector, prefix, cx, cz, half_w, half_h, palette, collection, parent):
    """Layered anime eye: dark outline, iris, pupil, two highlights and a lash line."""
    made = []
    def add(ob):
        made.append(attach(ob, parent))
    add(projector.decal(prefix + '_outline', ellipse_points(cx, cz, half_w * 1.07, half_h * 1.03),
                        collection, palette['lash'], offset=0.004))
    add(projector.decal(prefix + '_iris', ellipse_points(cx, cz, half_w, half_h),
                        collection, palette['iris'], offset=0.007))
    add(projector.decal(prefix + '_shade', ellipse_points(cx, cz + half_h * 0.42, half_w * 0.94, half_h * 0.52),
                        collection, palette['iris_shade'], offset=0.009))
    add(projector.decal(prefix + '_pupil', ellipse_points(cx, cz - half_h * 0.06, half_w * 0.46, half_h * 0.60),
                        collection, palette['pupil'], offset=0.011))
    add(projector.decal(prefix + '_glint_big', ellipse_points(cx - half_w * 0.34, cz + half_h * 0.42, half_w * 0.26, half_h * 0.20, 24),
                        collection, palette['glint'], offset=0.013))
    add(projector.decal(prefix + '_glint_small', ellipse_points(cx + half_w * 0.38, cz - half_h * 0.40, half_w * 0.14, half_h * 0.12, 20),
                        collection, palette['glint'], offset=0.013))
    outer = ellipse_points(cx, cz, half_w * 1.16, half_h * 1.10, 22, start=-0.15, end=math.pi + 0.15)
    inner = ellipse_points(cx, cz, half_w * 0.96, half_h * 0.90, 22, start=-0.15, end=math.pi + 0.15)
    add(projector.ribbon(prefix + '_lash', outer, inner, collection, palette['lash'], offset=0.015))
    return made

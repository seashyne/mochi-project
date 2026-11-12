"""Studio lighting and camera for preview renders of the generated avatars."""

import math
import os

import bpy
from mathutils import Vector

STUDIO = 'Preview_Studio'


def area_light(name, loc, energy, size, color, collection, target=(0, 0, 1.0)):
    data = bpy.data.lights.new(name, type='AREA')
    data.energy = energy
    data.shape = 'DISK'
    data.size = size
    data.color = color
    ob = bpy.data.objects.new(name, data)
    collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (Vector(target) - ob.location).to_track_quat('-Z', 'Y').to_euler()
    return ob


def setup_studio(ground_z=-0.42):
    existing = bpy.data.collections.get(STUDIO)
    if existing:
        return existing
    collection = bpy.data.collections.new(STUDIO)
    bpy.context.scene.collection.children.link(collection)

    world = bpy.data.worlds.get('PreviewWorld') or bpy.data.worlds.new('PreviewWorld')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.68, 0.72, 0.80, 1.0)
    world.node_tree.nodes['Background'].inputs[1].default_value = 0.95
    bpy.context.scene.world = world

    mesh = bpy.data.meshes.new('preview_ground')
    mesh.from_pydata([(-60, -60, ground_z), (60, -60, ground_z), (60, 60, ground_z), (-60, 60, ground_z)], [], [(0, 1, 2, 3)])
    mesh.update()
    ground = bpy.data.objects.new('preview_ground', mesh)
    collection.objects.link(ground)
    mat = bpy.data.materials.new('preview_ground_mat')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (0.42, 0.46, 0.55, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.9
    mesh.materials.append(mat)

    area_light('preview_key', (-2.6, -6.5, 2.4), 620, 6.0, (1.0, 0.96, 0.92), collection)
    area_light('preview_fill', (3.4, -5.2, 1.1), 420, 5.0, (0.86, 0.92, 1.0), collection)
    area_light('preview_rim', (1.0, 4.5, 4.5), 520, 4.0, (1.0, 0.97, 0.92), collection)

    camera_data = bpy.data.cameras.new('preview_camera')
    camera = bpy.data.objects.new('preview_camera', camera_data)
    collection.objects.link(camera)
    camera_data.lens = 70
    bpy.context.scene.camera = camera

    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'Khronos PBR Neutral'
    return collection


def aim_camera(target=(0, 0, 1.0), offset=(2.0, -6.4, 2.2)):
    camera = bpy.context.scene.camera
    camera.location = Vector(target) + Vector(offset)
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()


def render(output_path, resolution=(1000, 1300)):
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    scene.render.filepath = output_path
    bpy.ops.render.render(write_still=True)
    return output_path

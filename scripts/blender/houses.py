# Casas del pueblo montadas con piezas del Medieval Village MegaKit (Quaternius, CC0). Cada casa sale en un .glb con una
# malla por material. Uso: python build.py -- <carpeta glTF del kit> <carpeta de salida> [render]
import bpy, sys, math, mathutils
args = sys.argv[sys.argv.index('--')+1:]
KIT, OUT = args[0], args[1]; RENDER = len(args) > 2
R = math.radians

def place(name, x, y, z=0.0, rot=0.0, sx=1.0):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=f'{KIT}/{name}.gltf')
    new = [o for o in bpy.context.scene.objects if o not in before]
    roots = [o for o in new if o.parent is None or o.parent not in new]
    for o in roots:
        o.matrix_world = mathutils.Matrix.Translation((x, y, z)) @ mathutils.Matrix.Rotation(R(rot), 4, 'Z') @ o.matrix_world
    return new

def walls(W, D, front, back, left, right, base=True):
    """Paredes de W × D m (piezas de 2 m). front/back/left/right: lista de piezas de izquierda a derecha mirando desde fuera."""
    sides = [(front, -D / 2, 0, 'x'), (back, D / 2, 180, 'x'), (left, -W / 2, -90, 'y'), (right, W / 2, 90, 'y')]
    for pieces, off, rot, axis in sides:
        n = len(pieces)
        for i, p in enumerate(pieces):
            t = -n + 1 + 2 * i  # centros a -n+1, -n+3...
            if rot == 0: x, y = t, off
            elif rot == 180: x, y = -t, off
            elif rot == -90: x, y = off, -t
            else: x, y = off, t
            for name in p if isinstance(p, (list, tuple)) else [p]:
                place(name, x, y, 0, rot)
            if base: place('Wall_BottomCover', x, y, 0, rot)
    for cx in (-W / 2, W / 2):
        for cy in (-D / 2, D / 2): place('Corner_Exterior_Wood', cx, cy)

def finish(name):
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active; o.name = name
    for e in [x for x in bpy.context.scene.objects if x.type != 'MESH']: bpy.data.objects.remove(e)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    print(name, 'verts', len(o.data.vertices), 'mats', [m.name for m in o.data.materials])
    if RENDER:
        s = bpy.context.scene
        cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); s.collection.objects.link(cam); s.camera = cam
        cam.location = (9, -12, 7); cam.rotation_euler = (mathutils.Vector((0, 0, 2.6)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3; sun.rotation_euler = (0.8, 0.2, 0.6); s.collection.objects.link(sun)
        w = bpy.data.worlds.new('w'); s.world = w; w.color = (0.6, 0.65, 0.75)
        s.render.engine = 'CYCLES'; s.cycles.samples = 8; s.cycles.device = 'CPU'; s.render.resolution_x = 640; s.render.resolution_y = 480
        s.render.filepath = f'{OUT}/{name}.png'; bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(cam); bpy.data.objects.remove(sun)
    bpy.ops.export_scene.gltf(filepath=f'{OUT}/{name}.glb', export_format='GLB', export_yup=True, export_image_format='AUTO')

# ---------- casa de huerto (4 × 6 m, entramado, tejado de teja redonda y chimenea) ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
walls(4, 6,
      front=[['Wall_Plaster_Door_Round', ], ['Wall_Plaster_Window_Wide_Round', 'Window_Wide_Round1', 'WindowShutters_Wide_Round_Open']],
      back=['Wall_Plaster_WoodGrid', 'Wall_Plaster_Straight'],
      left=['Wall_Plaster_Straight', ['Wall_Plaster_Window_Wide_Round', 'Window_Wide_Round1', 'WindowShutters_Wide_Round_Open'], 'Wall_Plaster_WoodGrid'],
      right=['Wall_Plaster_WoodGrid', ['Wall_Plaster_Window_Wide_Round', 'Window_Wide_Round1', 'WindowShutters_Wide_Round_Open'], 'Wall_Plaster_Straight'])
place('Door_1_Round', -1.56, -3.0)
place('Roof_RoundTiles_4x6', 0, 0, 3)
place('Roof_Front_Brick4', 0, -3, 3); place('Roof_Front_Brick4', 0, 3, 3, 180)
place('Prop_Chimney', 1.1, 1.6, 3)
place('Prop_Vine2', 2.05, -1.0, 2.9, 90); place('Prop_Vine4', -1.0, 3.05, 2.9, 180)
place('Prop_Crate', 1.7, -3.7)
finish('house-cottage')

# ---------- cabaña (4 × 4 m, de madera, con escalón) ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
walls(4, 4,
      front=[['Wall_UnevenBrick_Door_Round'], ['Wall_UnevenBrick_Window_Wide_Round', 'Window_Wide_Round1']],
      back=['Wall_UnevenBrick_Straight', 'Wall_UnevenBrick_Straight'],
      left=[['Wall_UnevenBrick_Window_Wide_Round', 'Window_Wide_Round1', 'WindowShutters_Wide_Round_Open'], 'Wall_UnevenBrick_Straight'],
      right=['Wall_UnevenBrick_Straight', ['Wall_UnevenBrick_Window_Wide_Round', 'Window_Wide_Round1']])
place('Door_1_Round', -1.56, -2.0)
place('Roof_RoundTiles_4x4', 0, 0, 3)
place('Roof_Front_Brick4', 0, -2, 3); place('Roof_Front_Brick4', 0, 2, 3, 180)
place('Prop_Vine1', -2.05, 0.5, 2.9, -90)
finish('house-cabin')

# Robot "Claude": se queda con el robot de frente (el más completo) de los 4 del .glb de Tripo, lo reduce, hornea su textura
# a 1024 px, le pone un esqueleto rígido (cuerpo, brazos y piernas) y tres animaciones: Idle, Walk y Wave.
import bpy, bmesh, sys, math, mathutils
src, out = sys.argv[sys.argv.index('--')+1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
hi = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
for o in list(bpy.context.scene.objects):
    if o is not hi and o.type != 'MESH': bpy.data.objects.remove(o)
hi.parent = None
bpy.context.view_layer.objects.active = hi; hi.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bm = bmesh.new(); bm.from_mesh(hi.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.x > -0.2], context='VERTS')
bm.to_mesh(hi.data); bm.free()
xs = [v.co.x for v in hi.data.vertices]; ys = [v.co.y for v in hi.data.vertices]
cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
cy = 0.0 if abs(cy) < 0.02 else cy
for v in hi.data.vertices: v.co.x -= cx
print('verts', len(hi.data.vertices), 'cx', cx)

# copia reducida con UV nuevas
lo = hi.copy(); lo.data = hi.data.copy(); bpy.context.scene.collection.objects.link(lo); lo.name = 'Robot'
bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = lo; lo.select_set(True)
dec = lo.modifiers.new('dec', 'DECIMATE'); dec.ratio = 0.3
bpy.ops.object.modifier_apply(modifier='dec')
print('lo faces', len(lo.data.polygons))
while lo.data.uv_layers: lo.data.uv_layers.remove(lo.data.uv_layers[0])
lo.data.uv_layers.new(name='UVMap')
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004)
bpy.ops.object.mode_set(mode='OBJECT')
img = bpy.data.images.new('robot_color', 1024, 1024)
mat = bpy.data.materials.new('Robot'); mat.use_nodes = True
nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.6; bsdf.inputs['Metallic'].default_value = 0
lo.data.materials.clear(); lo.data.materials.append(mat)
nt.nodes.active = tex
# horneado del color: del original (alta) a la copia (baja)
s = bpy.context.scene; s.render.engine = 'CYCLES'; s.cycles.device = 'CPU'; s.cycles.samples = 4
s.render.bake.use_pass_direct = False; s.render.bake.use_pass_indirect = False; s.render.bake.use_pass_color = True
s.render.bake.use_selected_to_active = True; s.render.bake.cage_extrusion = 0.004; s.render.bake.margin = 4
bpy.ops.object.select_all(action='DESELECT'); hi.select_set(True); lo.select_set(True); bpy.context.view_layer.objects.active = lo
bpy.ops.object.bake(type='DIFFUSE')
img.filepath_raw = out.replace('.glb', '_color.png'); img.file_format = 'PNG'; img.save()
bpy.data.objects.remove(hi)

# esqueleto rígido
BODY_X, ARM_Z, HIP_Z = 0.095, 0.128, 0.07
arm = bpy.data.armatures.new('RobotRig'); rig = bpy.data.objects.new('RobotRig', arm); s.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='EDIT')
def bone(name, head, tail, parent=None):
    b = arm.edit_bones.new(name); b.head = head; b.tail = tail; b.roll = 0
    if parent: b.parent = arm.edit_bones[parent]
    return b
bone('root', (0, 0, 0), (0, 0, 0.05))
bone('body', (0, 0, HIP_Z), (0, 0, 0.2), 'root')
bone('arm.R', (-BODY_X, 0, 0.125), (-BODY_X, 0, 0.16), 'body')   # su derecha (mira a -Y)
bone('arm.L', (BODY_X, 0, 0.125), (BODY_X, 0, 0.16), 'body')
bone('leg.R', (-0.05, 0, HIP_Z), (-0.05, 0, 0.1), 'body')
bone('leg.L', (0.05, 0, HIP_Z), (0.05, 0, 0.1), 'body')
bpy.ops.object.mode_set(mode='OBJECT')
groups = {n: lo.vertex_groups.new(name=n) for n in ['body', 'arm.R', 'arm.L', 'leg.R', 'leg.L']}
for v in lo.data.vertices:
    x, z = v.co.x, v.co.z
    if abs(x) > BODY_X and z < ARM_Z: g = 'arm.R' if x < 0 else 'arm.L'
    elif z < HIP_Z and abs(x) < 0.08: g = 'leg.R' if x < 0 else 'leg.L'
    else: g = 'body'
    groups[g].add([v.index], 1.0, 'REPLACE')
lo.parent = rig
mod = lo.modifiers.new('rig', 'ARMATURE'); mod.object = rig

# animaciones (24 fps)
s.render.fps = 24
rig.animation_data_create()
pb = rig.pose.bones
for b in pb: b.rotation_mode = 'XYZ'
def anim(name, frames, fn):
    act = bpy.data.actions.new(name); rig.animation_data.action = act
    for f in range(frames + 1):
        t = f / frames
        for b in pb: b.location = (0, 0, 0); b.rotation_euler = (0, 0, 0)
        fn(t)
        for b in pb:
            b.keyframe_insert('location', frame=f); b.keyframe_insert('rotation_euler', frame=f)
    act.use_fake_user = True
    return act
TAU = math.tau
# ejes del hueso (apunta a +Z): X local = X mundo (cabeceo), Z local = -Y mundo (balanceo lateral), Y local = Z mundo
def idle(t):
    pb['body'].location.y = 0.003 * math.sin(TAU * t)                 # arriba y abajo (Y local = Z mundo)
    pb['body'].rotation_euler.z = 0.03 * math.sin(TAU * t + 1)
    pb['arm.R'].rotation_euler.z = 0.12 * math.sin(TAU * t)
    pb['arm.L'].rotation_euler.z = -0.12 * math.sin(TAU * t)
def walk(t):
    a = math.sin(TAU * t)
    pb['leg.R'].rotation_euler.x = 0.55 * a
    pb['leg.L'].rotation_euler.x = -0.55 * a
    pb['arm.R'].rotation_euler.x = -0.5 * a
    pb['arm.L'].rotation_euler.x = 0.5 * a
    pb['body'].location.y = 0.006 * abs(math.sin(TAU * t))
    pb['body'].rotation_euler.y = 0.06 * a
    pb['body'].rotation_euler.z = 0.04 * a
def wave(t):
    up = min(1, t / 0.18, (1 - t) / 0.18)                              # sube, saluda y baja
    up = up * up * (3 - 2 * up)
    pb['arm.R'].rotation_euler.z = -(1.75 + 0.35 * math.sin(TAU * 3 * t)) * up   # hacia fuera y arriba
    pb['body'].rotation_euler.z = 0.05 * up
    pb['arm.L'].rotation_euler.z = -0.06 * math.sin(TAU * t)
    pb['body'].location.y = 0.002 * math.sin(TAU * 2 * t)
acts = [anim('Idle', 48, idle), anim('Walk', 20, walk), anim('Wave', 60, wave)]
rig.animation_data.action = acts[0]
for a in acts:
    tr = rig.animation_data.nla_tracks.new(); tr.name = a.name; tr.strips.new(a.name, 1, a)
rig.animation_data.action = None
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animation_mode='NLA_TRACKS', export_skins=True, export_image_format='WEBP', export_yup=True)
print('OK', out)

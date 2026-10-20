# Misu: el gato (chibi con capucha de gato) del FBX que pasó Domingo, sin la base hexagonal ni la hierba, con esqueleto
# rígido (cuerpo, cabeza, brazos y piernas), animaciones Idle/Wave/Talk y un retrato para el diálogo.
import bpy, bmesh, sys, math, mathutils
src, tex_path, out, portrait = sys.argv[sys.argv.index('--')+1:][:4]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src)
for o in list(bpy.context.scene.objects):
    if o.name != 'Cat': bpy.data.objects.remove(o)
cat = bpy.data.objects['Cat']
bpy.context.view_layer.objects.active = cat; cat.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
vs = cat.data.vertices
mn = mathutils.Vector([min(v.co[i] for v in vs) for i in range(3)]); mx = mathutils.Vector([max(v.co[i] for v in vs) for i in range(3)])
H = mx.z - mn.z; cx = (mn.x + mx.x) / 2
for v in vs: v.co.x -= cx; v.co.z -= mn.z
for v in vs: v.co /= H   # altura 1: el juego la escala
print('H', H)
img = bpy.data.images.load(tex_path)
mat = bpy.data.materials.new('Misu'); mat.use_nodes = True
nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
t = nt.nodes.new('ShaderNodeTexImage'); t.image = img; t.interpolation = 'Closest'
nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.8
cat.data.materials.clear(); cat.data.materials.append(mat)
cat.name = 'Misu'

# zonas (altura normalizada): piernas < 0.24, brazos entre 0.24 y 0.42 por fuera de |x| 0.2, cabeza > 0.42
LEG_Z, NECK_Z, ARM_X = 0.24 , 0.42, 0.2
arm = bpy.data.armatures.new('MisuRig'); rig = bpy.data.objects.new('MisuRig', arm); bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='EDIT')
def bone(name, head, tail, parent=None):
    b = arm.edit_bones.new(name); b.head = head; b.tail = tail; b.roll = 0
    if parent: b.parent = arm.edit_bones[parent]
bone('root', (0, 0, 0), (0, 0, 0.1))
bone('body', (0, 0.05, LEG_Z), (0, 0.05, NECK_Z), 'root')
bone('head', (0, 0.05, NECK_Z), (0, 0.05, 0.8), 'body')
bone('arm.R', (-ARM_X * 0.75, 0.05, 0.34), (-ARM_X * 0.75, 0.05, 0.44), 'body')
bone('arm.L', (ARM_X * 0.75, 0.05, 0.34), (ARM_X * 0.75, 0.05, 0.44), 'body')
bone('leg.R', (-0.06, 0.05, LEG_Z), (-0.06, 0.05, 0.3), 'body')
bone('leg.L', (0.06, 0.05, LEG_Z), (0.06, 0.05, 0.3), 'body')
bpy.ops.object.mode_set(mode='OBJECT')
groups = {n: cat.vertex_groups.new(name=n) for n in ['body', 'head', 'arm.R', 'arm.L', 'leg.R', 'leg.L']}
for v in cat.data.vertices:
    x, z = v.co.x, v.co.z
    if z < LEG_Z: g = 'leg.R' if x < 0 else 'leg.L'
    elif z < NECK_Z and abs(x) > ARM_X: g = 'arm.R' if x < 0 else 'arm.L'
    elif z >= NECK_Z: g = 'head'
    else: g = 'body'
    groups[g].add([v.index], 1.0, 'REPLACE')
cat.parent = rig
m = cat.modifiers.new('rig', 'ARMATURE'); m.object = rig

s = bpy.context.scene; s.render.fps = 24
rig.animation_data_create(); pb = rig.pose.bones
for b in pb: b.rotation_mode = 'XYZ'
TAU = math.tau
REST = 1.0  # brazos bajados (el modelo viene con los brazos en cruz)
def base():
    for b in pb: b.location = (0, 0, 0); b.rotation_euler = (0, 0, 0)
    pb['arm.R'].rotation_euler.z = REST; pb['arm.L'].rotation_euler.z = -REST
def anim(name, frames, fn):
    act = bpy.data.actions.new(name); rig.animation_data.action = act
    for f in range(frames + 1):
        base(); fn(f / frames)
        for b in pb: b.keyframe_insert('location', frame=f); b.keyframe_insert('rotation_euler', frame=f)
    act.use_fake_user = True
    return act
def idle(t):
    pb['body'].location.y = 0.006 * math.sin(TAU * t)
    pb['head'].rotation_euler.z = 0.06 * math.sin(TAU * t)          # ladea la cabeza
    pb['head'].rotation_euler.x = 0.03 * math.sin(TAU * t * 2)
    pb['arm.R'].rotation_euler.z += 0.08 * math.sin(TAU * t)
    pb['arm.L'].rotation_euler.z -= 0.08 * math.sin(TAU * t)
def wave(t):
    up = min(1, t / 0.15, (1 - t) / 0.15); up = up * up * (3 - 2 * up)
    pb['arm.R'].rotation_euler.z = REST + (-(1.0 + 0.45 * math.sin(TAU * 3 * t)) - REST) * up
    pb['head'].rotation_euler.z = 0.12 * up
    pb['body'].location.y = 0.01 * abs(math.sin(TAU * 3 * t)) * up   # saltitos
def talk(t):
    pb['head'].rotation_euler.x = 0.07 * math.sin(TAU * t * 4)
    pb['head'].rotation_euler.z = 0.05 * math.sin(TAU * t)
    pb['arm.L'].rotation_euler.z = -REST + 0.35 * (0.5 + 0.5 * math.sin(TAU * t * 2))
    pb['arm.R'].rotation_euler.z = REST - 0.2 * (0.5 + 0.5 * math.sin(TAU * t * 2 + 2))
    pb['body'].location.y = 0.004 * math.sin(TAU * t * 4)
acts = [anim('Idle', 72, idle), anim('Wave', 60, wave), anim('Talk', 48, talk)]
for a in acts:
    tr = rig.animation_data.nla_tracks.new(); tr.name = a.name; tr.strips.new(a.name, 1, a)

# retrato: pose de reposo, cabeza y hombros de frente, fondo transparente
rig.animation_data.action = None
for tr in rig.animation_data.nla_tracks: tr.mute = True
base(); bpy.context.view_layer.update()
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); s.collection.objects.link(cam); s.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 0.78
cam.location = (0, -3, 0.62); cam.rotation_euler = (math.pi / 2, 0, 0)
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.2; sun.rotation_euler = (0.9, 0.25, -0.4); s.collection.objects.link(sun)
w = bpy.data.worlds.new('w'); s.world = w; w.color = (0.75, 0.75, 0.8)
s.render.engine = 'CYCLES'; s.cycles.samples = 24; s.cycles.device = 'CPU'; s.render.film_transparent = True
s.render.resolution_x = s.render.resolution_y = 320; s.render.filepath = portrait
bpy.ops.render.render(write_still=True)
bpy.data.objects.remove(cam); bpy.data.objects.remove(sun)
for tr in rig.animation_data.nla_tracks: tr.mute = False
for b in pb: b.location = (0, 0, 0); b.rotation_euler = (0, 0, 0)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animation_mode='NLA_TRACKS', export_skins=True, export_yup=True)
print('OK', out)

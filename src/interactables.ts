import * as THREE from 'three';
import data from './data/projects.json';
import { heightAt } from './world/terrain';
import { makeStation, type Obstacle, type ProjectType } from './world/props';

export interface Project {
  id: string;
  type: ProjectType;
  title: string;
  description: string;
  tech: string[];
  repo: string;
  position: [number, number];
}

interface Station { project: Project; group: THREE.Group; marker: THREE.Mesh; beam: THREE.Mesh; tick?: (t: number) => void; baseY: number }

const REACH = 3.2;

export class Interactables {
  stations: Station[] = [];
  nearest: Station | null = null;

  constructor(scene: THREE.Scene, obstacles: Obstacle[]) {
    for (const project of data as Project[]) {
      const [x, z] = project.position;
      const { group, accent, tick } = makeStation(project.type);
      const y = heightAt(x, z);
      group.position.set(x, y, z);
      group.rotation.y = Math.atan2(-x, -z) + (Math.random() - 0.5) * 0.4; // mirando al centro de la isla
      scene.add(group);
      obstacles.push({ x, z, r: 1.0 });

      const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshBasicMaterial({ color: accent }));
      marker.position.set(x, y + 3.7, z);
      scene.add(marker);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 0.9, 6, 20, 1, true),
        new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      beam.position.set(x, y + 3, z);
      scene.add(beam);
      this.stations.push({ project, group, marker, beam, tick, baseY: y + 3.7 });
    }
  }

  update(t: number, player: THREE.Vector3) {
    let best: Station | null = null, bd = REACH;
    for (const s of this.stations) {
      s.marker.position.y = s.baseY + Math.sin(t * 2 + s.baseY) * 0.15;
      s.marker.rotation.y = t * 1.2;
      s.tick?.(t);
      const d = Math.hypot(player.x - s.group.position.x, player.z - s.group.position.z);
      if (d < bd) { bd = d; best = s; }
      (s.beam.material as THREE.MeshBasicMaterial).opacity = 0.1 + (d < REACH ? 0.12 : 0);
    }
    this.nearest = best;
  }
}

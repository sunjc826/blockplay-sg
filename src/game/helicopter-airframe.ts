import * as THREE from 'three';

type Section = { z: number; width: number; bottom: number; top: number };

/** Smooth elliptical cross-sections, with UVs for the existing vehicle liveries. */
export function airframeLoft(name: string, sections: Section[], material: THREE.Material, profilePower = 1) {
  const segments = 24, positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (const [i, section] of sections.entries()) {
    for (let j = 0; j <= segments; j++) {
      const angle = j / segments * Math.PI * 2;
      positions.push(Math.sign(Math.cos(angle)) * Math.abs(Math.cos(angle)) ** profilePower * section.width, (section.top + section.bottom) / 2 + Math.sign(Math.sin(angle)) * Math.abs(Math.sin(angle)) ** profilePower * (section.top - section.bottom) / 2, section.z);
      uvs.push(j / segments, i / (sections.length - 1));
      if (i < sections.length - 1 && j < segments) {
        const a = i * (segments + 1) + j, b = a + segments + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  // Separate cap vertices keep the flat end normals out of the curved skin.
  for (const [i, section] of sections.entries()) {
    if (i !== 0 && i !== sections.length - 1) continue;
    const center = positions.length / 3;
    positions.push(0, (section.top + section.bottom) / 2, section.z); uvs.push(.5, .5);
    for (let j = 0; j <= segments; j++) {
      const angle = j / segments * Math.PI * 2;
      positions.push(Math.sign(Math.cos(angle)) * Math.abs(Math.cos(angle)) ** profilePower * section.width, (section.top + section.bottom) / 2 + Math.sign(Math.sin(angle)) * Math.abs(Math.sin(angle)) ** profilePower * (section.top - section.bottom) / 2, section.z);
      uvs.push(.5 + Math.cos(angle) / 2, .5 + Math.sin(angle) / 2);
      if (j < segments) {
        if (i === 0) indices.push(center, center + j + 2, center + j + 1);
        else indices.push(center, center + j + 1, center + j + 2);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material); mesh.name = name;
  mesh.userData.rainReceiver = mesh.userData.wetSurface = true;
  return mesh;
}

/** A painted skin swept around the same curved rim as the windscreen. */
export function helicopterNose(paint: THREE.Material) {
  const geometry = new THREE.BufferGeometry(), positions: number[] = [], indices: number[] = [], uvs: number[] = [];
  const segments = 24, rings = 8;
  for (let i = 0; i <= rings; i++) {
    const angle = i / rings * Math.PI / 2, scale = Math.cos(angle);
    for (let j = 0; j <= segments; j++) {
      const arc = -Math.PI / 2 + j / segments * Math.PI;
      positions.push(1.08 * Math.sin(arc) * scale, 1.51 - .86 * Math.sin(angle), -1.55 - .9 * Math.cos(arc) * scale);
      uvs.push(j / segments, i / rings);
      if (i < rings && j < segments) {
        const a = i * (segments + 1) + j, b = a + segments + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, paint); mesh.name = 'nose-fairing'; return mesh;
}

import * as THREE from 'three';
const canvas = document.getElementById('game') as HTMLCanvasElement;
const r = new THREE.WebGLRenderer({ canvas });
r.setSize(innerWidth, innerHeight);
r.render(new THREE.Scene(), new THREE.PerspectiveCamera());

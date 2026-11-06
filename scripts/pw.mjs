// Shared Playwright helpers for the check scripts.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
export const { chromium } = require('playwright');

export const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];

export async function launch() {
  return chromium.launch({ args: GL_ARGS });
}

export function collectErrors(page, errors, label = '') {
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${label}console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`${label}pageerror: ${e.message}`));
}

export const BASE = process.env.BASE || 'http://localhost:5173/';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

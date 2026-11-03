import { bakeNavigation } from './lib/bake-navigation.mjs';
const report = await bakeNavigation({ districts: process.env.NAVIGATION_DISTRICTS?.split(','), output: process.env.NAVIGATION_OUTPUT });
console.log(`Navigation bake: ${report.maps.length} districts, ${(report.totalMs / 1000).toFixed(2)}s wall, ${(report.cpuMs / 1000).toFixed(2)}s CPU, ${(report.gzipBytes / 1024).toFixed(1)} KiB gzip total.`);

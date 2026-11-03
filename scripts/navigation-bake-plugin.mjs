import { bakeNavigation } from './lib/bake-navigation.mjs';

const id = 'virtual:navigation-assets', resolved = '\0' + id;
export default function navigationBakePlugin() {
  let building = false, entries = [];
  return {
    name: 'blockplay-navigation-bake',
    configResolved(config) { building = config.command === 'build'; },
    resolveId(source) { if (source === id) return resolved; },
    async buildStart() {
      entries = [];
      if (!building) return;
      const report = await bakeNavigation({ onMap: (name, source) => {
        const ref = this.emitFile({ type: 'asset', name: `navigation-${name}.json`, source });
        entries.push(`${JSON.stringify(name)}:import.meta.ROLLUP_FILE_URL_${ref}`);
      } });
      this.info(`Baked ${report.maps.length} districts in ${(report.totalMs / 1000).toFixed(2)}s; ${(report.gzipBytes / 1024).toFixed(1)} KiB gzip total. Profile: .cache/navigation-bake/profile.json`);
    },
    load(source) { if (source === resolved) return `export default {${entries.join(',')}};`; },
  };
}

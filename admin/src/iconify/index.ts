import { addCollection } from '@iconify/vue';
import data from './data.json';

export async function downloadAndInstall(name: string) {
  const iconData = Object.freeze(await fetch(`./icons/${name}-raw.json`).then((r) => r.json()));
  addCollection(iconData);
}

export const icons = data.sort((a, b) => a.info.name.localeCompare(b.info.name));

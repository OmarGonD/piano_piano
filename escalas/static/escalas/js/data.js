/* Catálogo que envía Django (editable desde el admin). */
import {readJson} from './dom.js';

export const SCALE_TYPES=readJson('scale-types')||[];
export const TYPES=Object.fromEntries(SCALE_TYPES.map(t=>[t.slug,t]));
export const PROGS=Object.assign({major:[],minor:[]},readJson('progressions'));

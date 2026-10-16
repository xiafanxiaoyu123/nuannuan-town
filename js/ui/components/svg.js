// 无状态矢量图标，供 UI 与玩法面板共用；不依赖 ui 单例。
import { h } from '../../core/util.js';

export const SVG = {
  more: '<svg viewBox="0 0 24 24"><circle class="fill" cx="5" cy="12" r="1.8"/><circle class="fill" cx="12" cy="12" r="1.8"/><circle class="fill" cx="19" cy="12" r="1.8"/></svg>',
  hanger: '<svg viewBox="0 0 24 24"><path d="M12 8.4V7.6c0-.8.6-1.1 1.1-1.5a2.1 2.1 0 1 0-3.2-1.8M12 8.4l8.4 6.2c1.1.8.5 2.6-.9 2.6h-15c-1.400 0-2-1.800-.9-2.600L12 8.400z"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M3.500 11.500 12 4l8.500 7.500M5.500 10v8.500a1 1 0 0 0 1 1H10v-5h4v5h3.500a1 1 0 0 0 1-1V10"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.200"/><path d="M12 2.800v2.600M12 18.600v2.600M2.800 12h2.600M18.600 12h2.600M5.500 5.500l1.800 1.800M16.700 16.700l1.800 1.800M5.500 18.500l1.800-1.800M16.700 7.300l1.800-1.800"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6.500 6.500l11 11M17.500 6.500l-11 11"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2.500 12c2.400-4.200 5.600-6.300 9.500-6.300s7.100 2.100 9.500 6.300c-2.400 4.200-5.600 6.300-9.500 6.300S4.900 16.200 2.500 12z"/><circle cx="12" cy="12" r="2.800"/></svg>',
  rotate: '<svg viewBox="0 0 24 24"><path d="M4.500 12a7.500 7.500 0 1 1 2.400 5.500M4.500 18.500v-4.300h4.300"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.500l4.500 4.500L19 7.500"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M14.500 5.500 8 12l6.500 6.500"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path class="fill" d="M12 2.800l2.800 5.900 6.400.8-4.700 4.400 1.200 6.400L12 17.200l-5.700 3.100 1.200-6.400L2.800 9.500l6.400-.8z"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path class="fill" d="M12 20.500s-7.500-4.600-7.500-10A4.300 4.300 0 0 1 12 7.900a4.300 4.300 0 0 1 7.500 2.600c0 5.400-7.500 10-7.500 10z"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.500"/><path d="M12 7.500V12l3 2"/></svg>',
  drop: '<svg viewBox="0 0 24 24"><path class="fill" d="M12 3.5c3 3.900 5.500 6.700 5.500 10a5.500 5.500 0 0 1-11 0c0-3.300 2.500-6.100 5.500-10z"/></svg>',
    flag: '<svg viewBox="0 0 24 24"><path d="M6 21V4M6 5h11l-2.200 3.500L17 12H6"/></svg>',
  trophy: '<svg viewBox="0 0 24 24"><path d="M7.500 4.500h9v4.800a4.500 4.500 0 0 1-9 0zM7.500 6H4.800v1.200a3 3 0 0 0 3 3M16.500 6h2.700v1.200a3 3 0 0 1-3 3M12 13.800v3.400M8.500 19.500h7M9.800 17.200h4.400"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.2"/><path d="M5.2 20c.5-3.4 2.7-5.2 6.8-5.2s6.3 1.8 6.8 5.2"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4.5 7 7.5 6 7.5-6"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5.500" y="10.500" width="13" height="9" rx="2.200"/><path d="M8.500 10.500V8a3.500 3.500 0 0 1 7 0v2.500"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M12 19V6M6.500 11.500 12 6l5.500 5.500"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path class="fill" d="M8 5.500v13l11-6.500z"/></svg>',
  hand: '<svg viewBox="0 0 24 24"><path d="M8.500 12.500V6a1.500 1.500 0 0 1 3 0v5m0-1.500a1.500 1.500 0 0 1 3 0V11m0-.5a1.500 1.500 0 0 1 3 0v4c0 3.500-2 6-5.500 6-2.500 0-3.800-1-5-3l-2.300-3.800a1.400 1.400 0 0 1 2.300-1.500l1.500 1.800"/></svg>',
};
export const svg = (name, cls) => {
  const s = h('span', { html: SVG[name] }).firstChild;
  if (cls) s.setAttribute('class', cls);
  return s;
};

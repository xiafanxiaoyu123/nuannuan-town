// 说明页与活动入口共用同一套说明，避免教程和玩法各写一份后失配。
import * as spring from './festival-spring.js';
import * as summer from './festival-summer.js';
import * as harvest from './festival-harvest.js';
import * as winter from './festival-winter.js';

export const FESTIVAL_GAMES = Object.freeze({ sakura: spring, summer, harvest, snow: winter });
export const FESTIVAL_ACTIVITIES = Object.freeze(Object.fromEntries(Object.entries(FESTIVAL_GAMES).map(([id, game]) => [id, game.config])));

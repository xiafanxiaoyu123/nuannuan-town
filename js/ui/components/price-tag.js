// 只创建价格标签，不读取或修改玩家余额。
import { h, fmt } from '../../core/util.js';
import { coinIco } from '../../core/icons.js';

export const priceTag = (n) => h('span', { class: 'price' }, h('img', { src: coinIco(), alt: '' }), fmt(n));

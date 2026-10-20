// 共享内容定义：保持稳定 ID 与原有数值；运行时玩家进度由 core/state.js 管理。
// ——— 小镇居民 ———（like：偏爱的穿搭风格；egg：各自藏着的小彩蛋）
export const NPCS = [
  { id: 'man', name: '小满', job: '面包店学徒', like: 'sweet',
    hello: '你好呀！我是小满，在面包店当学徒。你身上有奶油的味道，一定常去咖啡屋吧？',
    lines: ['今天的可颂烤得刚刚好，可惜被大喵先尝了一口。', '听说咖啡屋的客人最喜欢甜美风的店员，穿对衣服小费都多。', '我在练习拉花，目前只会拉出一团云。', '甜点自动补货？那是我凌晨四点起来烤的啦！'],
    night: ['这么晚还不睡，是在等刚出炉的夜宵吗？', '晚上的小镇有黄油的香味，你闻到了吗？'],
    gift: '这个给你，今天多烤的，别告诉店长！', friend: '我们已经是好朋友啦！这是我攒的零花钱，拿去买条新裙子吧。' },
  { id: 'he', name: '青禾', job: '花农', like: 'fresh',
    hello: '我是青禾，花语小筑的花都是我种的。你的后院也种东西吗？',
    lines: ['浇过水的作物长得快，别偷懒哦。', '回收小铺每天都有一种作物特别值钱，看准了再卖。', '向日葵要等久一点，但它最值得。', '田地是可以挪位置的，在装修里重新摆就行。'],
    night: ['夜里花会睡觉，说话要小声一点。', '月光下的郁金香像一排小灯笼。'],
    gift: '这是今早多出来的花钱，拿着拿着。', friend: '把你当自己人了！这笔钱算我入股你的后院。' },
  { id: 'xu', name: '阿絮', job: '裁缝铺常客', like: 'elegant',
    hello: '我叫阿絮，每周都要去星梦裁缝铺看新布料。你的衣服是在搭配小屋买的吗？',
    lines: ['一整套穿齐了，会有人夸你的——比如我。', '缝纫机踩到节拍上的时候，线迹会自己发光呢。', '典雅不是颜色深，是把每一颗纽扣都扣好。', '我在等「绘色未明」那顶玫瑰宽檐帽降价，等了很久了。'],
    night: ['夜色是最好看的一匹布，可惜没人裁得下来。', '晚上逛街不用排试衣间，真好。'],
    gift: '上次你帮裁缝铺赶工，这是老板托我带的谢礼。', friend: '我认定你是小镇最会穿的人了！一点心意，别推辞。' },
  { id: 'shi', name: '石头', job: '钓鱼佬', like: 'cool',
    hello: '嗯……我是石头。钓场那边的。鱼不咬钩的时候我就出来走走。',
    lines: ['浮漂一沉就按住，早了晚了都白搭。', '大鱼会突然发力，别慌，松一下再收。', '今天空军了。不说了。', '帅气的人钓到的鱼都比较大，这是科学。'],
    night: ['夜钓时别只盯着宝箱，先看清鱼往哪儿游，再决定怎么收线。', '星星倒映在水里的时候，鱼也会抬头看。'],
    gift: '……给。卖鱼的钱，分你一点。', friend: '你是我见过最有耐心的人。这个你拿着，买根好竿。' },
  { id: 'nuo', name: '小桃', job: '暖暖的小粉丝', like: 'sweet', egg: 'fan',
    hello: '是、是暖暖！我是小桃，我有你每一套衣服的剪报！',
    lines: ['你今天的发型我明天就要学！', '我在攒钱买「轻盈泡泡」，还差好多好多。', '大喵可以摸一下吗？就一下！', '你走路的样子都好好看呀。'],
    night: ['晚上也能遇到你，今天是幸运日！', '妈妈说天黑要回家，可是我想再看你一会儿。'],
    gift: '这是我的零花钱！请、请收下！', friend: '我们是好朋友了对不对！这是我全部的压岁钱！' },
  { id: 'qi', name: '七弦', job: '云游诗人', like: 'elegant', egg: 'night',
    hello: '在下七弦，走到哪儿唱到哪儿。这座小镇的风，是甜的。',
    lines: ['白天的故事留给白天，我的好故事要等到晚上才讲。', '你听，彩旗被风吹动的声音，是四分之三拍。', '诗人不种地，但诗人知道草莓什么时候最甜。', '镜头转一转，同一座小镇会变成另一首诗。'],
    night: ['夜深了，告诉你一个秘密：对着喷泉许愿，每到第七次，喷泉一定会回礼。', '星星出来的时候，把愿望说给喷泉听——记得数到七。'],
    gift: '方才那首歌是为你写的，这是听众的赏钱，分你一半。', friend: '知音难得。这袋盘缠你收着，我的下一首歌写你。' },
];

// ——— 居民的家 ———（小镇上的位置与配色；门口可以拜访、接委托）
export const HOMES = {
  // 住宅区在小镇西边：两排三栋，都朝南开门。北排门前是樱花巷，南排门前就是主路
  man: { x: -40.2, z: -10, kind: 'bakery', wall: '#fff1dc', roof: '#f6a56b', door: '#d98a52' },
  he: { x: -35, z: -10, kind: 'greenhouse', wall: '#f3fbe9', roof: '#7fcf8f', door: '#5fae72' },
  xu: { x: -29.8, z: -10, kind: 'townhouse', wall: '#f6f0ff', roof: '#b39be8', door: '#8f77cf' },
  shi: { x: -40.2, z: -0.7, kind: 'cabin', wall: '#eef6fb', roof: '#6faede', door: '#4f8fc2' },
  nuo: { x: -35, z: -0.7, kind: 'candy', wall: '#fff0f5', roof: '#ff9fbd', door: '#f0679a' },
  qi: { x: -29.8, z: -0.7, kind: 'tower', wall: '#fbf6e6', roof: '#c9a45a', door: '#a8843f' },
};

// ——— 居民委托 ———
// type: score 在指定店铺单局营业额达到 n / deliver 带来 n 个作物 / stat 接下委托后某项统计增加 n /
//       wear 穿着 n 件指定风格来见面 / night 夜里来见面
export const REQS = {
  man: [
    { type: 'score', shop: 'cafe', n: 120, title: '帮店里撑一场', text: '在甜心咖啡屋单局营业额达到 120', say: '店长说今天人手不够……你能去咖啡屋顶一场吗？', reward: 160 },
    { type: 'deliver', crop: 'strawberry', n: 3, title: '草莓蛋糕缺草莓', text: '带 3 个奶油草莓给小满', say: '我想练草莓蛋糕，可是草莓被大喵吃光了。', reward: 240 },
    { type: 'stat', stat: 'play_cafe', n: 2, title: '陪我练手', text: '去甜心咖啡屋打工 2 次', say: '你端盘子的样子我想多看几遍，学一学！', reward: 200 },
    { type: 'score', shop: 'cafe', n: 220, title: '周末大客流', text: '在甜心咖啡屋单局营业额达到 220', say: '周末的客人像潮水一样，只有你顶得住。', reward: 360 },
  ],
  he: [
    { type: 'stat', stat: 'watered', n: 6, title: '别让它们渴着', text: '给作物浇水 6 次', say: '这两天太阳大，后院的苗该喝水啦。', reward: 120 },
    { type: 'deliver', crop: 'tulip', n: 2, title: '借两枝郁金香', text: '带 2 个郁金香给青禾', say: '花店订了一束郁金香，我这儿刚好差两枝。', reward: 260 },
    { type: 'stat', stat: 'harvested', n: 8, title: '丰收的手感', text: '收获 8 株作物', say: '种地的人要多收几茬，手才不生。', reward: 220 },
    { type: 'deliver', crop: 'apple', n: 3, title: '想做苹果酱', text: '带 3 个苹果给青禾', say: '听说你后院能种果树了？我想讨几个苹果做酱。', reward: 320 },
    { type: 'score', shop: 'flower', n: 150, title: '花店的大单', text: '在花语小筑单局营业额达到 150', say: '今天订单堆成山，帮花店合几束好的吧。', reward: 320 },
    { type: 'deliver', crop: 'sunflower', n: 2, title: '向日葵的种子', text: '带 2 个向日葵给青禾', say: '我想留点向日葵的种，你种的最饱满。', reward: 900 },
  ],
  xu: [
    { type: 'wear', style: 'elegant', n: 2, title: '让我看看典雅风', text: '穿着 2 件「典雅」风格的服饰来见阿絮', say: '我在研究典雅的搭配，你穿两件给我看看？', reward: 180 },
    { type: 'stat', stat: 'play_tailor', n: 2, title: '帮裁缝铺赶工', text: '去星梦裁缝铺打工 2 次', say: '我订的裙子还没缝好……你能去帮帮忙吗？', reward: 220 },
    { type: 'stat', stat: 'bought_clothes', n: 1, title: '陪我逛街', text: '去搭配小屋买 1 件新衣服', say: '一个人逛街没意思，你买一件，我替你高兴。', reward: 260 },
    { type: 'score', shop: 'tailor', n: 140, title: '线迹要发光', text: '在星梦裁缝铺单局营业额达到 140', say: '踩准节拍的线迹会发光，我想再看一次。', reward: 340 },
  ],
  shi: [
    { type: 'score', shop: 'fish', n: 60, title: '替我钓一竿', text: '在悠然钓场单局营业额达到 60', say: '……今天空军。你去，替我钓一竿。', reward: 160 },
    { type: 'stat', stat: 'play_fish', n: 2, title: '多甩几竿', text: '去悠然钓场打工 2 次', say: '钓鱼这事，急不得。多去几次。', reward: 200 },
    { type: 'deliver', crop: 'pumpkin', n: 2, title: '南瓜炖鱼', text: '带 2 个小南瓜给石头', say: '鱼有了。缺南瓜。', reward: 580 },
    { type: 'score', shop: 'fish', n: 130, title: '大鱼', text: '在悠然钓场单局营业额达到 130', say: '那条大的，我盯了三天。你来。', reward: 380 },
  ],
  nuo: [
    { type: 'wear', style: 'sweet', n: 3, title: '想看甜美的暖暖', text: '穿着 3 件「甜美」风格的服饰来见小桃', say: '可以……可以穿一身甜甜的给我看吗！', reward: 150 },
    { type: 'stat', stat: 'wishes', n: 3, title: '替我许个愿', text: '对喷泉许愿 3 次', say: '我的零花钱不够投喷泉了，你能替我许愿吗？', reward: 160 },
    { type: 'stat', stat: 'placed', n: 2, title: '想看你的家', text: '在家里或后院摆放 2 件家具', say: '你的家一定很好看吧！再摆两件，我去偷偷看！', reward: 200 },
    { type: 'deliver', crop: 'radish', n: 5, title: '给大喵的零食', text: '带 5 个樱桃萝卜给小桃', say: '我想喂大喵！听说它喜欢樱桃萝卜？', reward: 220 },
  ],
  qi: [
    { type: 'night', title: '月下听歌', text: '在夜里来见七弦', say: '我的新歌只在月亮出来以后唱。夜里来找我。', reward: 150 },
    { type: 'stat', stat: 'npc_talk', n: 5, title: '替我采风', text: '和居民们聊天 5 次', say: '诗人要听很多人说话。你替我去听一听。', reward: 180 },
    { type: 'deliver', crop: 'rose', n: 1, title: '一朵星光玫瑰', text: '带 1 个星光玫瑰给七弦', say: '下一首歌写的是星光玫瑰，可我从没见过真的。', reward: 880 },
    { type: 'stat', stat: 'plays', n: 4, title: '小镇的一天', text: '在任意店铺打工 4 次', say: '把你忙碌的一天讲给我听，我把它写成歌。', reward: 300 },
  ],
};

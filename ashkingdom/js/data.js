// =====================================================================
// 잿빛 왕국 — 게임 데이터 테이블 (기획서 docs/GAME_DESIGN_KO.md 와 1:1 대응)
// 숫자를 바꾸면 tools/balance-sim.mjs 로 난이도 곡선을 반드시 다시 확인할 것.
// =====================================================================

export const VERSION = 1;

// ---------------- 시간 ----------------
// 실제 1초 = 게임 4분 → 게임 하루 = 실제 6분, 계절 7일, 1년 28일
export const TIME = {
  gameMinPerRealSec: 4,
  daysPerSeason: 7,
  seasons: [
    { id: "spring", name: "봄", temp: 14, spoil: 1.0, icon: "🌱" },
    { id: "summer", name: "여름", temp: 28, spoil: 1.35, icon: "☀️" },
    { id: "autumn", name: "가을", temp: 10, spoil: 0.9, icon: "🍂" },
    { id: "winter", name: "핵겨울", temp: -14, spoil: 0.55, icon: "❄️" },
  ],
  offlineCapHours: 8, // 오프라인 진행 상한(실제 시간)
  offlineRate: 0.5, // 오프라인 생산 효율
};

// ---------------- 난이도 ----------------
// bossPower: 최종장 '재의 군주' 권장 전투력. reviveGemCost: 챕터 내 n번째 부활 비용(보석) 배열
export const DIFFICULTY = {
  easy: {
    id: "easy", name: "쉬움", desc: "이야기를 즐기는 모드. 무과금으로 2~4주면 엔딩.",
    enemy: 0.7, needs: 0.8, spoil: 0.75, loot: 1.3, bossPower: 520,
    adRevive: true, freeReviveEveryRealHours: 24, reviveGemCost: [100, 100, 200], raidEveryDays: 10,
  },
  normal: {
    id: "normal", name: "보통", desc: "생존의 긴장감. 무과금으로 2~3개월.",
    enemy: 1.0, needs: 1.0, spoil: 1.0, loot: 1.0, bossPower: 1250,
    adRevive: true, freeReviveEveryRealHours: 72, reviveGemCost: [200, 400, 800], raidEveryDays: 7,
  },
  hard: {
    id: "hard", name: "어려움", desc: "진짜 종말. 꾸준한 과금 또는 오랜 기간 혈통을 키운 생존자만 왕관을 쓴다.",
    enemy: 1.6, needs: 1.25, spoil: 1.3, loot: 0.8, bossPower: 3400,
    adRevive: false, freeReviveEveryRealHours: 168, reviveGemCost: [300, 900, 2700], raidEveryDays: 5,
  },
};

// ---------------- 능력치 ----------------
export const STATS = [
  { id: "str", name: "힘" },
  { id: "agi", name: "민첩" },
  { id: "vit", name: "체력" },
  { id: "int", name: "지능" },
  { id: "cha", name: "매력" },
  { id: "cra", name: "손재주" },
];

// ---------------- 직업 ----------------
// 성별은 외형만 다르고 능력치는 동일(공정성 원칙).
export const JOBS = {
  soldier: {
    name: "군인", icon: "🎖️", color: "#8a9a5b",
    desc: "전투 피해 +20%, 방어전 사기 상승. 전쟁으로 왕국을 지킨다.",
    stats: { str: 8, agi: 7, vit: 8, int: 4, cha: 5, cra: 4 },
    start: [["knife", 1], ["pipe_pistol", 1], ["ammo", 12], ["canned_food", 2], ["water_clean", 2]],
    perks: { dmg: 0.2 },
    skills: [
      { lv: 2, id: "aim", name: "정조준", desc: "원거리 피해 +15%" },
      { lv: 5, id: "command", name: "지휘", desc: "동행 동료 전투력 +25%" },
      { lv: 10, id: "fortify", name: "요새화", desc: "방어 시설 효과 +30%" },
      { lv: 20, id: "warlord", name: "전쟁 영웅", desc: "모든 전투 피해 +15%" },
    ],
    ending: "iron",
  },
  doctor: {
    name: "의사", icon: "🩺", color: "#7fb8c9",
    desc: "치료 효과 +50%, 방사능 저항 +30%. 챕터마다 스스로를 1회 소생.",
    stats: { str: 4, agi: 5, vit: 6, int: 9, cha: 7, cra: 5 },
    start: [["bandage", 4], ["medkit", 1], ["radaway", 1], ["knife", 1], ["water_clean", 2]],
    perks: { heal: 0.5, radRes: 0.3, selfRevive: 1 },
    skills: [
      { lv: 2, id: "triage", name: "응급처치", desc: "붕대로 출혈 즉시 정지" },
      { lv: 5, id: "surgeon", name: "외과의", desc: "동료 부상 회복 2배" },
      { lv: 10, id: "vaccine", name: "백신", desc: "질병 면역" },
      { lv: 20, id: "miracle", name: "기적의 손", desc: "자가 소생 챕터당 2회" },
    ],
    ending: "healer",
  },
  engineer: {
    name: "기술자", icon: "🔧", color: "#c98a3c",
    desc: "건설 비용 -20%, 내구도 소모 -30%. 탈것을 일찍 만든다.",
    stats: { str: 6, agi: 5, vit: 6, int: 7, cha: 4, cra: 9 },
    start: [["stone_hammer", 1], ["scrap", 10], ["electronics", 2], ["water_clean", 1], ["canned_food", 1]],
    perks: { buildCost: -0.2, wear: -0.3 },
    skills: [
      { lv: 2, id: "repair", name: "정비", desc: "수리 시 최대 내구도 감소 없음" },
      { lv: 5, id: "vehicle", name: "엔진공", desc: "탈것 1시대 일찍 해금" },
      { lv: 10, id: "turret", name: "포탑 설계", desc: "포탑 피해 +40%" },
      { lv: 20, id: "architect", name: "건축왕", desc: "성 업그레이드 시간 절반" },
    ],
    ending: "machine",
  },
  cook: {
    name: "요리사", icon: "🍳", color: "#d9734e",
    desc: "음식이 25% 늦게 썩고 영양 +30%. 굶주린 세상에서 가장 귀한 손.",
    stats: { str: 5, agi: 6, vit: 7, int: 6, cha: 7, cra: 6 },
    start: [["knife", 1], ["salt", 4], ["jerky", 3], ["water_clean", 2], ["seed", 3]],
    perks: { spoil: -0.25, food: 0.3 },
    skills: [
      { lv: 2, id: "preserve", name: "저장의 달인", desc: "훈제/염장 생산량 2배" },
      { lv: 5, id: "feast", name: "잔치", desc: "주민 사기 +20" },
      { lv: 10, id: "gourmet", name: "미식가", desc: "요리 버프 시간 2배" },
      { lv: 20, id: "bounty", name: "풍요", desc: "기근 이벤트 무효" },
    ],
    ending: "bounty",
  },
  researcher: {
    name: "연구자", icon: "🔬", color: "#9b7fd1",
    desc: "연구 속도 +50%, 경험치 +10%. 잃어버린 기술을 되살린다.",
    stats: { str: 4, agi: 5, vit: 5, int: 10, cha: 5, cra: 7 },
    start: [["notebook", 1], ["electronics", 3], ["herb", 3], ["water_clean", 2], ["canned_food", 1]],
    perks: { research: 0.5, xp: 0.1 },
    skills: [
      { lv: 2, id: "analyze", name: "분석", desc: "채집 시 희귀품 확률 +10%" },
      { lv: 5, id: "purify", name: "정화학", desc: "정수 효율 2배" },
      { lv: 10, id: "reactor", name: "원자로 지식", desc: "발전기 연료 -50%" },
      { lv: 20, id: "dawn", name: "새벽의 학자", desc: "연구 비용 -40%" },
    ],
    ending: "dawn",
  },
  politician: {
    name: "정치인", icon: "🎩", color: "#b04a5a",
    desc: "생존자 영입 확률 +50%, 주민 사기 +15. 올림픽 상금 +20%.",
    stats: { str: 4, agi: 5, vit: 5, int: 7, cha: 10, cra: 4 },
    start: [["gold_watch", 1], ["canned_food", 3], ["water_clean", 2], ["knife", 1]],
    perks: { recruit: 0.5, morale: 15, prize: 0.2 },
    skills: [
      { lv: 2, id: "speech", name: "연설", desc: "적대 생존자 설득 가능" },
      { lv: 5, id: "treaty", name: "조약", desc: "동맹 정착지 +1" },
      { lv: 10, id: "tax", name: "세제 개혁", desc: "왕국 금화 수입 +30%" },
      { lv: 20, id: "statesman", name: "국부", desc: "전쟁 없이 정착지 병합" },
    ],
    ending: "republic",
  },
  farmer: {
    name: "농부", icon: "🌾", color: "#7c9c3a",
    desc: "농장 수확 +50%, 동물 길들이기 쉬움. 땅을 다시 푸르게.",
    stats: { str: 7, agi: 5, vit: 8, int: 5, cha: 5, cra: 6 },
    start: [["seed", 8], ["stone_hoe", 1], ["berry", 4], ["water_clean", 2]],
    perks: { farm: 0.5, tame: 0.3 },
    skills: [
      { lv: 2, id: "greenthumb", name: "녹색 손", desc: "방사능 토양에서도 재배" },
      { lv: 5, id: "breeder", name: "목축", desc: "동물 번식 2배" },
      { lv: 10, id: "harvest", name: "대풍년", desc: "수확 시 씨앗 추가" },
      { lv: 20, id: "eden", name: "에덴", desc: "핵겨울에도 재배" },
    ],
    ending: "green",
  },
  jobless: {
    name: "백수", icon: "🛋️", color: "#8d8d8d",
    desc: "모든 능력치 낮음. 대신 행운 +30%, 경험치 +25%. 의외의 성장형.",
    stats: { str: 4, agi: 4, vit: 4, int: 4, cha: 6, cra: 4 },
    start: [["instant_noodle", 3], ["water_clean", 1], ["game_console", 1]],
    perks: { luck: 0.3, xp: 0.25 },
    skills: [
      { lv: 2, id: "lucky", name: "운빨", desc: "보급 상자 추가 아이템" },
      { lv: 5, id: "anything", name: "뭐든 해봄", desc: "모든 직업 레시피 사용" },
      { lv: 10, id: "underdog", name: "언더독", desc: "강적 상대로 피해 +30%" },
      { lv: 20, id: "accidental", name: "얼떨결 왕", desc: "모든 능력치 +5" },
    ],
    ending: "accidental",
  },
};

// ---------------- 아이템 ----------------
// type: res(재료) food tool weapon cloth med misc
// dur: 최대 내구도(사용할수록 닳음) / spoil: 상온(배낭) 기준 완전히 썩기까지 게임시간(h). 0=안 썩음
// slot: head body legs feet back hand
export const ITEMS = {
  // 재료
  wood: { name: "나무", type: "res", icon: "🪵" },
  twig: { name: "나뭇가지", type: "res", icon: "🥢", desc: "덤불·나무에서 맨손으로도 쉽게 얻는다. 불쏘시개·도구 손잡이." },
  coal: { name: "숯", type: "res", icon: "⚫", desc: "모닥불에서 나무를 태워 만든다. 제련 연료." },
  iron_ore: { name: "철광석", type: "res", icon: "🟤", desc: "곡괭이로 바위를 캐면 가끔 나온다. 대장간에서 철괴로." },
  steel: { name: "강철", type: "res", icon: "🔷", desc: "철괴+숯을 대장간에서 단련. 고급 무기·장비 재료.", era: 2 },
  stone: { name: "돌", type: "res", icon: "🪨" },
  fiber: { name: "섬유", type: "res", icon: "🌿" },
  scrap: { name: "고철", type: "res", icon: "🔩" },
  cloth: { name: "천 조각", type: "res", icon: "🧶" },
  leather: { name: "가죽", type: "res", icon: "🟫" },
  bone: { name: "뼈", type: "res", icon: "🦴" },
  herb: { name: "약초", type: "res", icon: "🌱" },
  salt: { name: "소금", type: "res", icon: "🧂" },
  fuel: { name: "연료", type: "res", icon: "🛢️" },
  electronics: { name: "전자부품", type: "res", icon: "💾" },
  gunpowder: { name: "화약", type: "res", icon: "🧨" },
  iron: { name: "철괴", type: "res", icon: "⛓️" },
  seed: { name: "씨앗", type: "res", icon: "🫘" },
  fertilizer: { name: "퇴비", type: "res", icon: "💩" },
  ammo: { name: "탄약", type: "res", icon: "🔸" },
  arrow: { name: "화살", type: "res", icon: "➶", arrow: { atk: 0, recover: 0.9 } },
  notebook: { name: "연구 노트", type: "misc", icon: "📓" },
  gold_watch: { name: "금시계", type: "misc", icon: "⌚", value: 120 },
  game_console: { name: "휴대 게임기", type: "misc", icon: "🎮", value: 40 },
  rotten_food: { name: "썩은 음식", type: "res", icon: "🤢" },

  // 물
  speed_5m: { name: "가속 5분", type: "misc", icon: "⏩", desc: "기지 확장 공사 5분 단축" },
  speed_1h: { name: "가속 1시간", type: "misc", icon: "⏩", desc: "기지 확장 공사 1시간 단축" },
  speed_8h: { name: "가속 8시간", type: "misc", icon: "⏭️", desc: "기지 확장 공사 8시간 단축" },
  ring: { name: "결혼 반지", type: "misc", icon: "💍", value: 30, desc: "청혼할 때 필요하다. 거절당하면 돌려받는다." },
  bottle: { name: "빈 물병", type: "misc", icon: "🍶", desc: "물을 뜨려면 필요하다. 물을 마시면 다시 빈 병이 된다." },
  water_dirty: { name: "더러운 물", type: "food", icon: "🫗", spoil: 0, food: { thirst: 25, rad: 6, sick: 0.4 }, raw: true },
  water_clean: { name: "깨끗한 물", type: "food", icon: "💧", spoil: 0, food: { thirst: 35 } },

  // 음식 (spoil = 상온 기준 게임시간)
  berry: { name: "산딸기", type: "food", icon: "🫐", spoil: 40, food: { hunger: 8, thirst: 3 } },
  mushroom: { name: "버섯", type: "food", icon: "🍄", spoil: 36, food: { hunger: 10, rad: 2 } },
  raw_meat: { name: "생고기", type: "food", icon: "🥩", spoil: 24, food: { hunger: 12, sick: 0.45 }, raw: true },
  cooked_meat: { name: "구운 고기", type: "food", icon: "🍖", spoil: 60, food: { hunger: 30, hp: 4 } },
  jerky: { name: "훈제 육포", type: "food", icon: "🥓", spoil: 600, food: { hunger: 22, thirst: -4 } },
  salted_meat: { name: "염장 고기", type: "food", icon: "🧂", spoil: 420, food: { hunger: 24, thirst: -8 } },
  raw_fish: { name: "생선", type: "food", icon: "🐟", spoil: 16, food: { hunger: 10, sick: 0.4, rad: 3 }, raw: true },
  grilled_fish: { name: "생선구이", type: "food", icon: "🍢", spoil: 48, food: { hunger: 24, hp: 3 } },
  egg: { name: "달걀", type: "food", icon: "🥚", spoil: 120, food: { hunger: 8, sick: 0.1 } },
  milk: { name: "염소젖", type: "food", icon: "🥛", spoil: 30, food: { hunger: 6, thirst: 12 } },
  potato: { name: "감자", type: "food", icon: "🥔", spoil: 300, food: { hunger: 9 } },
  baked_potato: { name: "군감자", type: "food", icon: "🍠", spoil: 72, food: { hunger: 22 } },
  bread: { name: "빵", type: "food", icon: "🍞", spoil: 96, food: { hunger: 28 } },
  stew: { name: "생존자 스튜", type: "food", icon: "🍲", spoil: 36, food: { hunger: 45, thirst: 15, hp: 10 }, buff: { warm: 6 } },
  gukbap: { name: "국밥", type: "food", icon: "🍲", spoil: 40, food: { hunger: 42, thirst: 12, hp: 8 }, buff: { warm: 5 } },
  fish_soup: { name: "생선탕", type: "food", icon: "🥣", spoil: 36, food: { hunger: 34, thirst: 15, hp: 6 } },
  mushroom_porridge: { name: "버섯죽", type: "food", icon: "🥣", spoil: 40, food: { hunger: 30, thirst: 8, hp: 4 } },
  hotpot: { name: "보양 전골", type: "food", icon: "🍲", spoil: 48, food: { hunger: 60, thirst: 20, hp: 20 }, buff: { warm: 10 } },
  meat_skewer: { name: "고기 버섯 꼬치", type: "food", icon: "🍢", spoil: 50, food: { hunger: 32, hp: 6 } },
  mystery_mush: { name: "정체불명의 죽", type: "food", icon: "🫕", spoil: 20, food: { hunger: 8, thirst: 4, sick: 0.15 }, desc: "아무렇게나 섞어 끓인 것. 먹을 수는 있다…" },
  book_cook1: { name: "생존 요리책", type: "misc", icon: "📙", cookbook: 1, desc: "읽으면 화덕 요리법을 알게 되고, 처음 만들 때 실패 확률이 크게 줄어든다." },
  book_cook2: { name: "왕궁 요리책", type: "misc", icon: "📕", cookbook: 2, era: 2, desc: "주방·고급 주방 요리법을 알게 된다." },
  canned_food: { name: "통조림", type: "food", icon: "🥫", spoil: 0, food: { hunger: 25 } },
  instant_noodle: { name: "라면", type: "food", icon: "🍜", spoil: 0, food: { hunger: 20, thirst: -6 } },

  // 의료
  bandage: { name: "붕대", type: "med", icon: "🩹", med: { hp: 18 } },
  medkit: { name: "구급상자", type: "med", icon: "⛑️", med: { hp: 60, cure: true } },
  radaway: { name: "항방사능제", type: "med", icon: "💊", med: { rad: -50 } },
  herbal_tea: { name: "약초차", type: "med", icon: "🍵", med: { hp: 8, cure: true, warm: 4 } },
  sleeping_bag: { name: "침낭", type: "misc", icon: "🛌", desc: "어디서나 잠잘 수 있다(침대보다 회복이 적고, 밖이라 습격 위험)." },
  revive_kit: { name: "소생 키트", type: "med", icon: "💉", med: { revive: true } },

  // 도구 (tool: 채집 효율 / dur: 내구도)
  stone_axe: { name: "돌도끼", type: "tool", icon: "🪓", slot: "hand", dur: 60, tool: { wood: 2 }, atk: 5 },
  stone_pick: { name: "돌곡괭이", type: "tool", icon: "⛏️", slot: "hand", dur: 60, tool: { stone: 2, scrap: 1 }, atk: 4 },
  stone_hammer: { name: "망치", type: "tool", icon: "🔨", slot: "hand", dur: 80, tool: { scrap: 2, stone: 1 }, atk: 5 },
  stone_hoe: { name: "괭이", type: "tool", icon: "⚒️", slot: "hand", dur: 70, tool: { fiber: 2 }, atk: 3 },
  iron_axe: { name: "철도끼", type: "tool", icon: "🪓", slot: "hand", dur: 220, tool: { wood: 4 }, atk: 10, era: 1 },
  iron_pick: { name: "철곡괭이", type: "tool", icon: "⛏️", slot: "hand", dur: 220, tool: { stone: 4, scrap: 3 }, atk: 9, era: 1 },
  fishing_rod: { name: "낚싯대", type: "tool", icon: "🎣", slot: "hand", dur: 50, tool: { fish: 1 }, atk: 1 },

  // 무기
  knife: { name: "생존 나이프", type: "weapon", icon: "🔪", slot: "hand", dur: 90, atk: 7 },
  spear: { name: "창", type: "weapon", icon: "🗡️", slot: "hand", dur: 70, atk: 11, twoHand: true },
  machete: { name: "마체테", type: "weapon", icon: "⚔️", slot: "hand", dur: 140, atk: 16, era: 1, req: { blade: 1 } },
  bow: { name: "활", type: "weapon", icon: "🏹", slot: "hand", dur: 100, atk: 14, ranged: "arrow", twoHand: true },
  pipe_pistol: { name: "파이프 권총", type: "weapon", icon: "🔫", slot: "hand", dur: 80, atk: 20, ranged: "ammo", req: { firearms: 1 } },
  rifle: { name: "소총", type: "weapon", icon: "🔫", slot: "hand", dur: 200, atk: 34, ranged: "ammo", era: 2, twoHand: true, req: { firearms: 2 } },
  royal_blade: { name: "왕검", type: "weapon", icon: "🗡️", slot: "hand", dur: 600, atk: 55, era: 3, req: { blade: 2 } },
  // 왼손 · 활통 · 던지기 · 화살
  wood_shield: { name: "나무 방패", type: "cloth", icon: "🛡️", slot: "off", dur: 120, def: 4, desc: "왼손에 든다. 방어 +4." },
  quiver_s: { name: "작은 활통", type: "cloth", icon: "🎯", slot: "quiver", dur: 9999, cap: 20, desc: "등에 메는 화살통(손을 쓰지 않음). 화살 20발." },
  quiver_l: { name: "큰 활통", type: "cloth", icon: "🎯", slot: "quiver", dur: 9999, cap: 50, era: 1, desc: "화살 50발. 여러 종류를 함께 담는다." },
  iron_arrow: { name: "철화살", type: "res", icon: "➶", arrow: { atk: 7, recover: 0.92 }, era: 1 },
  fire_arrow: { name: "불화살", type: "res", icon: "➶", arrow: { atk: 5, burn: 6, recover: 0.4 }, desc: "맞은 적이 불탄다(지속 피해). 대부분 타 버려 회수가 어렵다." },
  shuriken: { name: "표창", type: "weapon", icon: "⭐", throw: { atk: 9, recover: 0.85 }, era: 1, desc: "던지기(R). 대부분 다시 주울 수 있다." },
  throw_knife: { name: "투척 단검", type: "weapon", icon: "🔪", throw: { atk: 13, recover: 0.9 }, era: 1, desc: "던지기(R). 묵직한 한 방." },
  scent_lure: { name: "냄새 미끼", type: "misc", icon: "🍖", desc: "동물 탐색을 기다리지 않고 바로 1회 쓴다." },
  rusty_key: { name: "녹슨 열쇠", type: "misc", icon: "🗝️", desc: "건물 안 잠긴 문 하나를 연다. 그 층의 적이 지니고 있다." },
  keycard: { name: "보안 카드키", type: "misc", icon: "💳", desc: "보안문을 연다. 보안 담당자가 가지고 있다." },
  whetstone: { name: "정화 숫돌", type: "misc", icon: "🪨", desc: "장비에 붙은 특성(좋든 나쁘든)을 갈아 없앤다." },
  book_firearms1: { name: "총기 교본 Ⅰ", type: "misc", icon: "📕", book: { skill: "firearms", lv: 1 }, desc: "읽으면 '총기 다루기 1' — 권총을 쓸 수 있다." },
  book_firearms2: { name: "총기 교본 Ⅱ", type: "misc", icon: "📕", book: { skill: "firearms", lv: 2 }, era: 2, desc: "'총기 다루기 2' — 소총을 쓸 수 있다(1단계 필요)." },
  book_blade1: { name: "검술서 Ⅰ", type: "misc", icon: "📘", book: { skill: "blade", lv: 1 }, desc: "'검술 1' — 마체테를 쓸 수 있다." },
  book_blade2: { name: "검술서 Ⅱ", type: "misc", icon: "📘", book: { skill: "blade", lv: 2 }, era: 2, desc: "'검술 2' — 왕검을 쓸 수 있다(1단계 필요)." },

  // 옷 (warm: 보온, def: 방어, rad: 방사능 차단율)
  rag_shirt: { name: "누더기 셔츠", type: "cloth", icon: "👕", slot: "body", dur: 120, warm: 3, def: 1, look: { color: "#8b7d6b", style: "rag" } },
  rag_pants: { name: "누더기 바지", type: "cloth", icon: "👖", slot: "legs", dur: 120, warm: 2, def: 1, look: { color: "#6b6152", style: "rag" } },
  sandals: { name: "타이어 샌들", type: "cloth", icon: "🩴", slot: "feet", dur: 80, warm: 1, def: 0, look: { color: "#333" } },
  leather_jacket: { name: "가죽 재킷", type: "cloth", icon: "🧥", slot: "body", dur: 260, warm: 8, def: 4, look: { color: "#5a3a22", style: "jacket" } },
  leather_pants: { name: "가죽 바지", type: "cloth", icon: "👖", slot: "legs", dur: 240, warm: 5, def: 3, look: { color: "#4a3020", style: "pants" } },
  boots: { name: "전투화", type: "cloth", icon: "🥾", slot: "feet", dur: 260, warm: 4, def: 2, look: { color: "#2b2118" } },
  fur_coat: { name: "모피 코트", type: "cloth", icon: "🧥", slot: "body", dur: 300, warm: 18, def: 3, look: { color: "#9c8468", style: "fur" } },
  gas_mask: { name: "방독면", type: "cloth", icon: "😷", slot: "head", dur: 200, warm: 1, def: 1, rad: 0.5, look: { color: "#3d4a3a", style: "mask" } },
  helmet: { name: "철모", type: "cloth", icon: "⛑️", slot: "head", dur: 300, warm: 1, def: 5, look: { color: "#4f5a3c", style: "helmet" } },
  hazmat: { name: "방호복", type: "cloth", icon: "🦺", slot: "body", dur: 220, warm: 6, def: 2, rad: 0.8, look: { color: "#d8c23a", style: "hazmat" }, era: 2 },
  combat_vest: { name: "방탄 조끼", type: "cloth", icon: "🦺", slot: "body", dur: 400, warm: 5, def: 12, look: { color: "#3f4a35", style: "vest" }, era: 2 },
  backpack: { name: "배낭", type: "cloth", icon: "🎒", slot: "back", dur: 400, bag: 8, look: { color: "#5b4a33" } },
  royal_robe: { name: "왕의 망토", type: "cloth", icon: "👘", slot: "back", dur: 9999, warm: 10, def: 6, look: { color: "#7a1f2b", style: "cape" }, era: 3 },
  crown: { name: "재건의 왕관", type: "cloth", icon: "👑", slot: "head", dur: 9999, def: 3, look: { color: "#d4af37", style: "crown" } },
};

// 무기 기술: 총·고급 무기는 기술이 있어야 쓴다. 교본(전리품)을 읽거나 훈련소에서 배운다.
export const WSKILLS = {
  firearms: { name: "총기 다루기", max: 2, gold: [120, 400] },
  blade: { name: "검술", max: 2, gold: [100, 360] },
};
// 무기별 필살기(F 키 / 필살기 버튼). cd: 재사용 대기(초)
export const SPECIALS = {
  knife: { name: "급소 찌르기", cd: 8, kind: "pierce", mult: 3, desc: "한 적에게 3배 피해" },
  spear: { name: "돌진 찌르기", cd: 10, kind: "dash", mult: 2.2, desc: "앞으로 돌진하며 앞의 적 모두 관통" },
  machete: { name: "회전 베기", cd: 9, kind: "spin", mult: 1.6, desc: "주변 모든 적 베기" },
  royal_blade: { name: "왕의 일격", cd: 12, kind: "spin", mult: 3, desc: "주변 모든 적에게 강한 일격" },
  bow: { name: "연사", cd: 9, kind: "volley", n: 3, desc: "화살 3발을 부채꼴로" },
  pipe_pistol: { name: "속사", cd: 10, kind: "volley", n: 3, desc: "3발 연속 사격" },
  rifle: { name: "저격", cd: 12, kind: "snipe", mult: 2.6, desc: "먼 적에게 강력한 한 발" },
  stone_axe: { name: "내려찍기", cd: 9, kind: "pierce", mult: 2.2, desc: "한 적에게 강한 일격" },
  iron_axe: { name: "내려찍기", cd: 9, kind: "pierce", mult: 2.5, desc: "한 적에게 강한 일격" },
};

// 동물 탐색: 3시간(실제)에 1번 충전, 최대 2번 저장. 기다리기 싫으면 보석이나 냄새 미끼
export const SCOUT = { rechargeMs: 3 * 3600 * 1000, maxCharges: 2, gemCost: 30, revealSec: 180 };
// 약탈자 무리(NPC): 실제 다른 플레이어와 전쟁하기 전에 먼저 만나는 적 집단. 우두머리와 대화로 풀 수도 있다
export const RAIDER_BANDS = [
  { id: "redhand", name: "붉은 손", leader: "외눈 갈고리" },
  { id: "rust", name: "녹슨 이빨단", leader: "쇳소리 박" },
  { id: "ash", name: "잿빛 까마귀", leader: "까마귀 할멈" },
  { id: "dogs", name: "들개 무리단", leader: "개장수 최" },
];

// ---------------- 요리(모닥불·화덕·주방에 재료를 넣어 끓이기) ----------------
// 단계: 1 모닥불(재료 2칸) · 2 돌 화덕(3칸) · 3 주방(4칸) · 4 고급 주방(5칸)
export const COOK_SLOTS = { 1: 2, 2: 3, 3: 4, 4: 5 };
// basic: 요리법 없이도 처음부터 안다(굽기·끓이기). 나머지는 처음엔 '?'로 보이고, 한 번 만들어 보거나 요리책으로 안다
export const COOKS = [
  { id: "cooked_meat", in: { raw_meat: 1 }, tier: 1, basic: true },
  { id: "grilled_fish", in: { raw_fish: 1 }, tier: 1, basic: true },
  { id: "baked_potato", in: { potato: 1 }, tier: 1, basic: true },
  { id: "water_clean", in: { water_dirty: 1 }, tier: 1, basic: true },
  { id: "herbal_tea", in: { herb: 2, water_clean: 1 }, tier: 2, book: 1 },
  { id: "meat_skewer", in: { raw_meat: 1, mushroom: 1 }, tier: 1, book: 1 },
  { id: "gukbap", in: { raw_meat: 1, potato: 1, water_clean: 1 }, tier: 2, book: 1 },
  { id: "fish_soup", in: { raw_fish: 1, herb: 1, water_clean: 1 }, tier: 2, book: 1 },
  { id: "mushroom_porridge", in: { mushroom: 2, water_clean: 1 }, tier: 2, book: 1 },
  { id: "stew", in: { raw_meat: 1, potato: 2, water_clean: 1 }, tier: 3, book: 2 },
  { id: "bread", in: { potato: 3, egg: 1 }, tier: 3, book: 2 },
  { id: "hotpot", in: { raw_meat: 2, potato: 1, mushroom: 1, salt: 1 }, tier: 4, book: 2 },
];
// 서툴러서 망친 요리: '맛없는 ○○' (영양 절반, 약간 탈 날 수 있음)
for (const c of COOKS) if (!c.basic) {
  const it = ITEMS[c.id];
  ITEMS["bad_" + c.id] = { name: "맛없는 " + it.name, type: "food", icon: it.icon, spoil: it.spoil, food: Object.fromEntries(Object.entries(it.food || { thirst: 12, hunger: 2 }).map(([k, v]) => [k, k === "sick" ? v : Math.round(v * 0.5)]).concat([["sick", 0.08]])), desc: "서툴게 만든 요리. 다음엔 더 잘할 수 있다." };
}

export function itemName(id) { return ITEMS[id]?.name ?? id; }

// ---------------- 시대(기술) ----------------
export const ERAS = [
  { id: 0, name: "잿더미 시대", desc: "돌과 나무, 불" },
  { id: 1, name: "재건 시대", desc: "제련, 철 도구, 말" },
  { id: 2, name: "산업 시대", desc: "전기, 엔진, 소총" },
  { id: 3, name: "왕국 시대", desc: "성벽, 왕권, 대규모 군대" },
];

// ---------------- 연구 ----------------
export const RESEARCH = [
  { id: "smelting", name: "제련", cost: 40, era: 1, desc: "철괴 제작, 재건 시대 진입" },
  { id: "husbandry", name: "축산", cost: 30, era: 0, desc: "동물 우리, 번식" },
  { id: "riding", name: "승마", cost: 60, era: 1, desc: "말을 탈 수 있음 (이동 +60%)" },
  { id: "purifier", name: "정수 장치", cost: 70, era: 1, desc: "방사능 강 정화, 깨끗한 물 대량 생산" },
  { id: "electricity", name: "전기", cost: 120, era: 2, desc: "발전기·냉장고, 산업 시대 진입" },
  { id: "engine", name: "내연기관", cost: 150, era: 2, desc: "오토바이 (이동 +120%)" },
  { id: "firearms", name: "총기 제조", cost: 140, era: 2, desc: "소총, 탄약 대량 생산" },
  { id: "statecraft", name: "국가론", cost: 220, era: 3, desc: "왕국 선포, 왕국 시대 진입" },
];

// ---------------- 레시피 ----------------
// station: null(손) campfire workbench forge kitchen smokehouse lab
export const RECIPES = [
  { id: "stone_axe", out: ["stone_axe", 1], in: { twig: 3, stone: 2, fiber: 2 }, station: null },
  { id: "stone_pick", out: ["stone_pick", 1], in: { twig: 3, stone: 3, fiber: 2 }, station: null },
  { id: "stone_hoe", out: ["stone_hoe", 1], in: { twig: 3, stone: 1, fiber: 2 }, station: null },
  { id: "spear", out: ["spear", 1], in: { wood: 2, twig: 2, stone: 1, fiber: 3 }, station: null },
  { id: "bottle", out: ["bottle", 1], in: { leather: 1, fiber: 2 }, station: null, name: "가죽 물주머니" },
  { id: "bottle_scrap", out: ["bottle", 2], in: { scrap: 2 }, station: "workbench" },
  { id: "ring", out: ["ring", 1], in: { scrap: 3, electronics: 1 }, station: "workbench" },
  { id: "sleeping_bag", out: ["sleeping_bag", 1], in: { cloth: 3, fiber: 4 }, station: null },
  { id: "rag_shirt", out: ["rag_shirt", 1], in: { cloth: 3, fiber: 2 }, station: null },
  { id: "rag_pants", out: ["rag_pants", 1], in: { cloth: 3, fiber: 2 }, station: null },
  { id: "sandals", out: ["sandals", 1], in: { scrap: 1, fiber: 3 }, station: null },
  { id: "bandage", out: ["bandage", 2], in: { cloth: 2, herb: 1 }, station: null },

  { id: "cooked_meat", out: ["cooked_meat", 1], in: { raw_meat: 1 }, station: "campfire" },
  { id: "grilled_fish", out: ["grilled_fish", 1], in: { raw_fish: 1 }, station: "campfire" },
  { id: "baked_potato", out: ["baked_potato", 1], in: { potato: 1 }, station: "campfire" },
  { id: "water_clean", out: ["water_clean", 1], in: { water_dirty: 1, twig: 1 }, station: "campfire" },
  { id: "coal", out: ["coal", 1], in: { wood: 2 }, station: "campfire" },
  { id: "herbal_tea", out: ["herbal_tea", 1], in: { herb: 2, water_clean: 1 }, station: "campfire" },

  { id: "scent_lure", out: ["scent_lure", 1], in: { raw_meat: 1, herb: 2 }, station: null },
  { id: "wood_shield", out: ["wood_shield", 1], in: { wood: 6, leather: 1 }, station: "workbench" },
  { id: "quiver_s", out: ["quiver_s", 1], in: { leather: 2, fiber: 4 }, station: "workbench" },
  { id: "whetstone", out: ["whetstone", 1], in: { stone: 4, salt: 1, herb: 1 }, station: "workbench" },
  { id: "fire_arrow", out: ["fire_arrow", 4], in: { arrow: 4, fuel: 1, cloth: 1 }, station: "workbench" },
  { id: "fishing_rod", out: ["fishing_rod", 1], in: { wood: 2, fiber: 4, scrap: 1 }, station: "workbench" },
  { id: "bow", out: ["bow", 1], in: { wood: 5, fiber: 5, leather: 1 }, station: "workbench" },
  { id: "arrow", out: ["arrow", 6], in: { wood: 2, stone: 1, fiber: 1 }, station: "workbench" },
  { id: "leather_jacket", out: ["leather_jacket", 1], in: { leather: 5, fiber: 3 }, station: "workbench" },
  { id: "leather_pants", out: ["leather_pants", 1], in: { leather: 4, fiber: 3 }, station: "workbench" },
  { id: "boots", out: ["boots", 1], in: { leather: 3, scrap: 2 }, station: "workbench" },
  { id: "fur_coat", out: ["fur_coat", 1], in: { leather: 8, cloth: 4, bone: 2 }, station: "workbench" },
  { id: "gas_mask", out: ["gas_mask", 1], in: { scrap: 4, cloth: 2, electronics: 1 }, station: "workbench" },
  { id: "backpack", out: ["backpack", 1], in: { leather: 4, cloth: 4, fiber: 4 }, station: "workbench" },
  { id: "pipe_pistol", out: ["pipe_pistol", 1], in: { scrap: 8, wood: 2 }, station: "workbench" },
  { id: "ammo", out: ["ammo", 8], in: { scrap: 2, gunpowder: 1 }, station: "workbench" },
  { id: "gunpowder", out: ["gunpowder", 2], in: { fertilizer: 2, salt: 1, wood: 1 }, station: "workbench" },
  { id: "medkit", out: ["medkit", 1], in: { bandage: 2, herb: 3, cloth: 1 }, station: "workbench" },

  { id: "iron", out: ["iron", 1], in: { scrap: 4, coal: 1 }, station: "forge", research: "smelting" },
  { id: "iron_from_ore", out: ["iron", 2], in: { iron_ore: 3, coal: 1 }, station: "forge", research: "smelting" },
  { id: "steel", out: ["steel", 1], in: { iron: 2, coal: 2 }, station: "forge", research: "smelting" },
  { id: "quiver_l", out: ["quiver_l", 1], in: { leather: 5, iron: 1, fiber: 4 }, station: "forge", research: "smelting" },
  { id: "iron_arrow", out: ["iron_arrow", 8], in: { iron: 1, wood: 2, fiber: 2 }, station: "forge", research: "smelting" },
  { id: "shuriken", out: ["shuriken", 6], in: { iron: 1 }, station: "forge", research: "smelting" },
  { id: "throw_knife", out: ["throw_knife", 3], in: { iron: 1, leather: 1 }, station: "forge", research: "smelting" },
  { id: "iron_axe", out: ["iron_axe", 1], in: { iron: 3, wood: 2 }, station: "forge", research: "smelting" },
  { id: "iron_pick", out: ["iron_pick", 1], in: { iron: 3, wood: 2 }, station: "forge", research: "smelting" },
  { id: "machete", out: ["machete", 1], in: { iron: 2, steel: 1, leather: 1 }, station: "forge", research: "smelting" },
  { id: "helmet", out: ["helmet", 1], in: { iron: 4, leather: 1 }, station: "forge", research: "smelting" },
  { id: "rifle", out: ["rifle", 1], in: { iron: 4, steel: 3, wood: 3, electronics: 1 }, station: "forge", research: "firearms" },
  { id: "combat_vest", out: ["combat_vest", 1], in: { iron: 6, cloth: 6, leather: 2 }, station: "forge", research: "firearms" },
  { id: "hazmat", out: ["hazmat", 1], in: { cloth: 8, electronics: 2, fuel: 2 }, station: "lab", research: "purifier" },
  { id: "radaway", out: ["radaway", 1], in: { herb: 3, electronics: 1, water_clean: 1 }, station: "lab" },
  { id: "revive_kit", out: ["revive_kit", 1], in: { medkit: 1, electronics: 2, herb: 4 }, station: "lab" },
  { id: "royal_blade", out: ["royal_blade", 1], in: { steel: 12, gold_watch: 1, electronics: 4 }, station: "forge", research: "statecraft" },

  { id: "jerky", out: ["jerky", 2], in: { raw_meat: 2, wood: 2 }, station: "smokehouse" },
  { id: "salted_meat", out: ["salted_meat", 2], in: { raw_meat: 2, salt: 1 }, station: "kitchen" },
  { id: "stew", out: ["stew", 2], in: { raw_meat: 1, potato: 2, water_clean: 1 }, station: "kitchen" },
  { id: "bread", out: ["bread", 2], in: { potato: 3, egg: 1 }, station: "kitchen" },
  { id: "fertilizer", out: ["fertilizer", 1], in: { rotten_food: 2 }, station: null },
];

// ---------------- 거점 (집 → 성) ----------------
export const BASE_LEVELS = [
  { lv: 1, name: "모닥불 캠프", slots: 3, wall: 3, residents: 2, cost: {}, chapter: 0 },
  { lv: 2, name: "판잣집", slots: 5, wall: 4, residents: 4, cost: { wood: 30, stone: 10, scrap: 5 }, chapter: 1 },
  { lv: 3, name: "통나무 오두막", slots: 7, wall: 5, residents: 6, cost: { wood: 80, stone: 40, scrap: 15 }, chapter: 3 },
  { lv: 4, name: "목책 요새", slots: 9, wall: 6, residents: 10, cost: { wood: 160, stone: 100, scrap: 40, leather: 10 }, chapter: 5 },
  { lv: 5, name: "석조 성채", slots: 11, wall: 7, residents: 16, cost: { stone: 300, iron: 30, wood: 150 }, chapter: 7 },
  { lv: 6, name: "성", slots: 13, wall: 8, residents: 24, cost: { stone: 600, iron: 80, wood: 250, electronics: 10 }, chapter: 9 },
  { lv: 7, name: "왕성", slots: 15, wall: 9, residents: 36, cost: { stone: 1000, iron: 160, electronics: 30, fuel: 30 }, chapter: 10 },
  { lv: 8, name: "새 수도", slots: 18, wall: 10, residents: 60, cost: { stone: 2000, iron: 400, electronics: 80, fuel: 80 }, chapter: 12 },
];

// 건물: storage(보관 배율 — 낮을수록 덜 썩음), defense, prod(일일 생산)
export const BUILDINGS = {
  campfire: { name: "모닥불", icon: "🔥", cost: { twig: 6, stone: 3 }, baseLv: 1, station: "campfire", cookTier: 1, warm: 10, max: 1 },
  stove: { name: "돌 화덕", icon: "🧱", cost: { stone: 20, wood: 10, scrap: 2 }, baseLv: 2, cookTier: 2, warm: 12, max: 1 },
  grand_kitchen: { name: "고급 주방", icon: "🍽️", cost: { stone: 60, iron: 10, wood: 30, electronics: 2 }, baseLv: 5, cookTier: 4, max: 1 },
  workbench: { name: "작업대", icon: "🛠️", cost: { wood: 15, stone: 5 }, baseLv: 1, station: "workbench", max: 1 },
  crate: { name: "나무 상자", icon: "📦", cost: { wood: 12 }, baseLv: 1, storage: { slots: 16, spoil: 0.8 }, max: 4 },
  bed: { name: "침대", icon: "🛏️", cost: { wood: 10, cloth: 4 }, baseLv: 1, rest: true, max: 1 },
  cellar: { name: "지하 저장고", icon: "🕳️", cost: { stone: 30, wood: 20 }, baseLv: 2, storage: { slots: 24, spoil: 0.4 }, max: 2 },
  smokehouse: { name: "훈제실", icon: "🏚️", cost: { wood: 25, stone: 15 }, baseLv: 2, station: "smokehouse", max: 1 },
  farm: { name: "밭", icon: "🌾", cost: { wood: 8, fertilizer: 2 }, baseLv: 2, prod: { potato: 3 }, needWorker: "farmer", max: 4 },
  rain_collector: { name: "빗물 집수기", icon: "🛢️", cost: { wood: 10, scrap: 6, cloth: 2 }, baseLv: 2, prod: { water_clean: 3 }, max: 3 },
  pen: { name: "동물 우리", icon: "🐐", cost: { wood: 30, fiber: 10 }, baseLv: 2, research: "husbandry", animals: 4, max: 3 },
  watchtower: { name: "감시탑", icon: "🗼", cost: { wood: 30, stone: 10 }, baseLv: 2, defense: 25, max: 4 },
  training: { name: "훈련소", icon: "🎯", cost: { wood: 40, stone: 20, leather: 4 }, baseLv: 3, train: true, max: 1 },
  forge: { name: "대장간", icon: "⚒️", cost: { stone: 40, scrap: 20 }, baseLv: 3, station: "forge", max: 1 },
  kitchen: { name: "주방", icon: "🍳", cost: { wood: 20, stone: 20, scrap: 6 }, baseLv: 3, station: "kitchen", cookTier: 3, max: 1 },
  clinic: { name: "진료소", icon: "🏥", cost: { wood: 40, cloth: 10, scrap: 10 }, baseLv: 3, heal: 3, max: 1 },
  house: { name: "주민 집", icon: "🏠", cost: { wood: 40, stone: 20 }, baseLv: 3, housing: 4, max: 8 },
  lab: { name: "연구소", icon: "🔬", cost: { stone: 40, scrap: 30, electronics: 5 }, baseLv: 3, station: "lab", researchPts: 1, max: 1 },
  stable: { name: "마구간", icon: "🐎", cost: { wood: 60, iron: 4 }, baseLv: 4, research: "riding", animals: 3, max: 2 },
  barracks: { name: "병영", icon: "⛺", cost: { wood: 60, stone: 40, iron: 6 }, baseLv: 4, defense: 40, army: 6, max: 2 },
  wall_gate: { name: "성문", icon: "🚪", cost: { stone: 80, iron: 10 }, baseLv: 4, defense: 60, max: 1 },
  generator: { name: "발전기", icon: "⚡", cost: { iron: 15, electronics: 8, scrap: 30 }, baseLv: 5, research: "electricity", power: 10, fuelPerDay: 1, max: 2 },
  fridge: { name: "냉장고", icon: "🧊", cost: { iron: 8, electronics: 6 }, baseLv: 5, research: "electricity", storage: { slots: 20, spoil: 0.15, needPower: 2 }, max: 3 },
  turret: { name: "자동 포탑", icon: "🛡️", cost: { iron: 20, electronics: 6, ammo: 40 }, baseLv: 5, research: "firearms", defense: 120, max: 6 },
  purifier: { name: "정수 시설", icon: "🚰", cost: { iron: 12, electronics: 4, stone: 30 }, baseLv: 4, research: "purifier", prod: { water_clean: 6 }, max: 2 },
  garage: { name: "차고", icon: "🏍️", cost: { iron: 30, electronics: 10 }, baseLv: 5, research: "engine", max: 1 },
  arena: { name: "올림픽 경기장", icon: "🏟️", cost: { stone: 200, wood: 120, iron: 20 }, baseLv: 4, olympics: true, max: 1 },
  throne: { name: "왕좌의 홀", icon: "🏰", cost: { stone: 400, iron: 60, gold_watch: 1 }, baseLv: 7, research: "statecraft", max: 1 },
};

// ---------------- 동물 ----------------
// tame: 길들이기 난이도(0~1), mount: 이동배율, combat: 전투력, prod: 일일 생산, meat: 도축 시 고기
export const ANIMALS = {
  chicken: { name: "닭", icon: "🐔", lv: 1, hp: 10, tame: 0.15, prod: { egg: 1 }, meat: 1, food: "seed", color: "#e8e2d0" },
  goat: { name: "염소", icon: "🐐", lv: 2, hp: 25, tame: 0.3, prod: { milk: 1 }, meat: 3, food: "fiber", color: "#cfc6b0" },
  dog: { name: "들개", icon: "🐕", lv: 3, hp: 30, tame: 0.45, combat: 12, meat: 2, food: "raw_meat", color: "#8a6a45", hostileWild: true },
  boar: { name: "멧돼지", icon: "🐗", lv: 5, hp: 45, tame: 0.6, combat: 8, meat: 5, food: "potato", color: "#5b4636", hostileWild: true },
  cow: { name: "돌연변이 소", icon: "🐄", lv: 4, hp: 60, tame: 0.4, prod: { milk: 2, fertilizer: 1 }, farmBoost: 0.25, meat: 8, food: "fiber", color: "#d9d2c3" },
  horse: { name: "야생마", icon: "🐎", lv: 6, hp: 55, tame: 0.65, mount: 1.6, combat: 6, meat: 6, food: "fiber", research: "riding", color: "#7a4e2d" },
  wolf: { name: "잿빛 늑대", icon: "🐺", lv: 8, hp: 50, tame: 0.8, combat: 24, meat: 3, food: "raw_meat", color: "#6e6e72", hostileWild: true },
  deer: { name: "두 머리 사슴", icon: "🦌", lv: 10, hp: 30, tame: 0.9, meat: 4, food: "berry", color: "#a47a4f", flee: true },
};

export const VEHICLES = {
  bicycle: { name: "자전거", icon: "🚲", mount: 1.35, cost: { scrap: 25, iron: 4 }, research: "smelting" },
  motorbike: { name: "오토바이", icon: "🏍️", mount: 2.2, cost: { iron: 30, electronics: 10, fuel: 5 }, research: "engine", fuelPerHour: 0.2 },
};

// ---------------- 적 ----------------
export const ENEMIES = {
  rad_rat: { name: "방사능 쥐", hp: 14, atk: 3, speed: 70, xp: 6, loot: [["raw_meat", 0.4], ["bone", 0.4]], color: "#8bb24a", r: 7 },
  feral_dog: { name: "광견", hp: 30, atk: 6, speed: 95, xp: 12, loot: [["raw_meat", 0.8], ["leather", 0.5], ["bone", 0.5]], color: "#7a5a3a", r: 10 },
  mutant: { name: "변이체", hp: 60, atk: 10, speed: 55, xp: 25, loot: [["electronics", 0.25], ["herb", 0.5], ["cloth", 0.6]], color: "#6b8f5e", r: 12, night: true },
  raider: { name: "약탈자", hp: 70, atk: 12, speed: 75, xp: 35, loot: [["ammo", 0.6], ["scrap", 0.8], ["cloth", 0.6], ["canned_food", 0.3], ["book_firearms1", 0.04], ["book_blade1", 0.04], ["arrow", 0.3]], color: "#a0392c", r: 11, ranged: true },
  ash_knight: { name: "재의 기사", hp: 220, atk: 26, speed: 70, xp: 120, loot: [["iron", 0.9], ["electronics", 0.7], ["gunpowder", 0.6], ["book_firearms2", 0.08], ["book_blade2", 0.08], ["steel", 0.3]], color: "#444", r: 14 },
};

// ---------------- 동료(스토리 + 무작위 생존자) ----------------
export const ROLES = {
  cook: { name: "요리사", icon: "🍳", effect: "기지 음식 부패 -25%, 요리 생산" },
  researcher: { name: "연구자", icon: "🔬", effect: "연구 포인트 +6/일" },
  doctor: { name: "의사", icon: "🩺", effect: "부상 치료, 챕터당 1회 소생술" },
  soldier: { name: "군인", icon: "🎖️", effect: "방어력 +30, 원정·전쟁 참여" },
  jobless: { name: "백수", icon: "🛋️", effect: "가끔 뜻밖의 물건을 주워 옴, 사기 +5" },
  politician: { name: "정치인", icon: "🎩", effect: "주민 영입 +, 금화 세수 +" },
  engineer: { name: "기술자", icon: "🔧", effect: "건설비 -15%, 기지 장비 수리" },
  farmer: { name: "농부", icon: "🌾", effect: "밭 1개당 수확 +50%" },
  hunter: { name: "사냥꾼", icon: "🏹", effect: "매일 생고기·가죽 획득" },
};

export const STORY_COMPANIONS = {
  seoyun: { name: "한서윤", gender: "F", role: "doctor", chapter: 2, bio: "방송국 지하 벙커의 마지막 의사.", stats: { str: 4, agi: 5, vit: 6, int: 9, cha: 7, cra: 5 } },
  dokgo: { name: "독고철", gender: "M", role: "engineer", chapter: 5, bio: "철의 도시 발전소를 혼자 지킨 기술자.", stats: { str: 7, agi: 4, vit: 7, int: 7, cha: 3, cra: 10 } },
  mira: { name: "유미라", gender: "F", role: "soldier", chapter: 6, bio: "붉은 손에서 탈영한 저격수.", stats: { str: 6, agi: 9, vit: 6, int: 5, cha: 5, cra: 5 } },
  bongsu: { name: "봉수", gender: "M", role: "cook", chapter: 3, bio: "핵겨울에 국밥집을 다시 연 사내.", stats: { str: 6, agi: 4, vit: 8, int: 5, cha: 8, cra: 6 } },
  ara: { name: "진아라", gender: "F", role: "researcher", chapter: 8, bio: "방사능 강의 비밀을 아는 생물학자.", stats: { str: 3, agi: 5, vit: 4, int: 10, cha: 6, cra: 7 } },
  taeho: { name: "남궁태호", gender: "M", role: "politician", chapter: 9, bio: "남쪽 정착지 연합의 대변인.", stats: { str: 4, agi: 4, vit: 5, int: 7, cha: 10, cra: 3 } },
};

// 여성 영웅(삼국지의 장수처럼 능력치·특기가 있다). 건물에서 만나고, 매력(요구치)이 있어야 동료가 된다.
// talent: 동행하거나 배우자로 기지에 있으면 효과. 자녀에게 50% 확률로 물려준다.
export const HEROINES = {
  seolhwa: { name: "백설화", title: "눈의 궁수", role: "hunter", req: 6, meet: ["airport", "gym"], stats: { str: 6, agi: 10, vit: 6, int: 6, cha: 8, cra: 6 }, talent: "archer", bio: "설원에서 혼자 살아남은 명궁." },
  harin: { name: "윤하린", title: "폐허의 상인", role: "politician", req: 5, meet: ["mall", "apartment"], stats: { str: 4, agi: 6, vit: 5, int: 8, cha: 10, cra: 6 }, talent: "merchant", bio: "쇼핑몰을 통째로 장부에 올린 여자." },
  eunbi: { name: "강은비", title: "강철 손", role: "engineer", req: 6, meet: ["power", "subway"], stats: { str: 7, agi: 5, vit: 7, int: 8, cha: 6, cra: 10 }, talent: "smith", bio: "발전소 터빈을 맨손으로 고친 기술자." },
  ahyeon: { name: "서아현", title: "잿빛의 가수", role: "politician", req: 8, meet: ["broadcast"], stats: { str: 3, agi: 6, vit: 5, int: 7, cha: 12, cra: 5 }, talent: "idol", bio: "방송국 지하에서 매일 밤 노래를 송출했다." },
  soyul: { name: "차소율", title: "검의 그림자", role: "soldier", req: 7, meet: ["highrise", "gym"], stats: { str: 9, agi: 10, vit: 7, int: 5, cha: 7, cra: 5 }, talent: "blade", bio: "고층 빌딩 옥상에서 홀로 칼을 갈던 검객." },
  chaeryeong: { name: "문채령", title: "책사", role: "researcher", req: 7, meet: ["broadcast", "hospital"], stats: { str: 3, agi: 5, vit: 5, int: 12, cha: 8, cra: 7 }, talent: "strategist", bio: "옛 정부의 마지막 전략 보좌관." },
  dain: { name: "오다인", title: "들판의 손", role: "cook", req: 4, meet: ["apartment", "mall"], stats: { str: 6, agi: 6, vit: 8, int: 6, cha: 8, cra: 7 }, talent: "chef", bio: "통조림 하나로 열 사람을 먹이는 요리사." },
  eunsol: { name: "남은솔", title: "늑대의 친구", role: "farmer", req: 5, meet: ["subway", "airport"], stats: { str: 7, agi: 8, vit: 8, int: 5, cha: 7, cra: 5 }, talent: "beast", bio: "늑대 무리와 함께 다니는 사냥꾼." },
  yerin: { name: "한예린", title: "백의의 천사", role: "doctor", req: 6, meet: ["hospital"], stats: { str: 3, agi: 5, vit: 6, int: 10, cha: 9, cra: 6 }, talent: "medic", bio: "무너진 병원에 끝까지 남은 간호사." },
  mina: { name: "류미나", title: "그림자 정찰병", role: "soldier", req: 6, meet: ["subway", "highrise"], stats: { str: 6, agi: 11, vit: 6, int: 7, cha: 7, cra: 6 }, talent: "scout", bio: "지하철 노선도를 머릿속에 다 넣은 정찰병." },
};
export const TALENTS = {
  archer: { name: "명궁", desc: "원거리 피해 +15%" }, blade: { name: "검성", desc: "근접 피해 +15%" },
  merchant: { name: "흥정", desc: "약탈자 통행료 -40%, 금화 수입 +10%" }, smith: { name: "명장", desc: "제작 시 좋은 품질 확률 ↑" },
  idol: { name: "인기", desc: "주민 사기 +10, 생존자 영입 ↑" }, strategist: { name: "책략", desc: "경험치 +10%" },
  chef: { name: "요리", desc: "음식 영양 +15%" }, beast: { name: "조련", desc: "길들이기 쉬움" },
  medic: { name: "의술", desc: "잠잘 때 회복 +30%" }, scout: { name: "정찰", desc: "동물 탐색 충전 최대 +1" },
};

export const SURVIVOR_NAMES = {
  M: ["민준", "도윤", "서진", "하람", "지호", "건우", "우진", "현수", "재석", "동하", "태양", "정민"],
  F: ["서연", "하윤", "지우", "수아", "다은", "예린", "소희", "나래", "은비", "가온", "보람", "채원"],
};

// ---------------- 스토리 ----------------
// goal: systems.checkGoal 이 해석하는 조건
export const CHAPTERS = [
  { id: 0, title: "프롤로그 · 섬광의 날", text: "하늘이 하얗게 타오른 날, 당신은 지하 대피소에서 살아남았다. 문을 열자 잿빛 눈이 내리고 있었다.", goal: { craft: "stone_axe" }, hint: "덤불에서 나뭇가지·섬유, 바위에서 돌을 모아 돌도끼를 만드세요." },
  { id: 1, title: "1장 · 잿더미 위의 아침", text: "불이 있어야 밤을 넘긴다. 첫 거처를 세우자.", goal: { building: "campfire", building2: "workbench" }, hint: "기지 메뉴에서 모닥불과 작업대를 지으세요." },
  { id: 2, title: "2장 · 첫 번째 목소리", text: "낡은 라디오에서 목소리가 들린다. \"누구 없어요? 방송탑에 부상자가…\"", goal: { visit: "radio_tower" }, hint: "지도 북쪽 방송탑(📡)에 가세요.", recruit: "seoyun" },
  { id: 3, title: "3장 · 굶주린 겨울", text: "핵겨울이 다가온다. 음식이 썩지 않게 보관할 곳이 필요하다.", goal: { building: "cellar", baseLv: 2 }, hint: "판잣집으로 업그레이드하고 지하 저장고를 지으세요.", recruit: "bongsu" },
  { id: 4, title: "4장 · 들개의 왕", text: "들개 무리를 이끄는 우두머리. 죽일 것인가, 길들일 것인가.", goal: { tamed: 1 }, hint: "동물에게 다가가 [길들이기] 미니게임을 성공하세요." },
  { id: 5, title: "5장 · 철의 도시", text: "무너진 공업 도시의 발전소에 아직 불이 켜져 있다.", goal: { visit: "iron_city", baseLv: 3 }, hint: "오두막(Lv3)을 짓고 동쪽 철의 도시(🏭)를 탐사하세요.", recruit: "dokgo" },
  { id: 6, title: "6장 · 붉은 손", text: "약탈자 집단 '붉은 손'이 기지를 노린다. 오늘 밤, 그들이 온다.", goal: { raidWon: 1 }, hint: "약탈자 습격을 막아내세요(사격전).", recruit: "mira" },
  { id: 7, title: "7장 · 다시 푸른 땅", text: "사람들이 모여든다. 먹여 살릴 땅이 필요하다.", goal: { residents: 5, building: "farm", baseLv: 4 }, hint: "주민 5명, 밭, 목책 요새(Lv4)." },
  { id: 8, title: "8장 · 방사능 강", text: "강물이 빛난다. 정화하지 못하면 모두 병들 것이다.", goal: { research: "purifier", visit: "rad_river" }, hint: "정수 장치를 연구하고 방사능 강(☢️)을 조사하세요.", recruit: "ara" },
  { id: 9, title: "9장 · 연합", text: "남쪽 정착지들이 사절을 보냈다. 동맹인가, 정복인가.", goal: { baseLv: 5, olympics: 1 }, hint: "석조 성채(Lv5)를 짓고 재건 올림픽에 1회 참가하세요.", recruit: "taeho" },
  { id: 10, title: "10장 · 왕관", text: "사람들은 지도자를 원한다. 당신의 이름으로 새 나라를 세운다.", goal: { research: "statecraft", baseLv: 6, residents: 12 }, hint: "국가론 연구, 성(Lv6), 주민 12명." },
  { id: 11, title: "11장 · 재의 군주", text: "북쪽 요새의 '재의 군주'가 마지막 전쟁을 선포했다.", goal: { boss: true }, hint: "전투력을 키워 재의 요새(🏯)에서 최종 결전을 치르세요." },
  { id: 12, title: "에필로그 · 세계 재건", text: "왕국이 섰다. 그러나 세계는 아직 잿빛이다. 멸망 전의 모든 땅을 되살릴 때까지.", goal: { restore: 100 }, hint: "원정으로 세계 지역을 복구하세요 (무한 콘텐츠)." },
];

// 지도 상 지점 (월드 크기 대비 비율 좌표)
export const POIS = {
  radio_tower: { name: "방송탑", icon: "📡", fx: 0.5, fy: 0.22 },
  iron_city: { name: "철의 도시", icon: "🏭", fx: 0.8, fy: 0.5 },
  rad_river: { name: "방사능 강", icon: "☢️", fx: 0.28, fy: 0.72 },
  raider_camp: { name: "붉은 손 야영지", icon: "🏴", fx: 0.18, fy: 0.3 },
  ash_fortress: { name: "재의 요새", icon: "🏯", fx: 0.5, fy: 0.06 },
  trader: { name: "떠돌이 상인", icon: "🛒", fx: 0.62, fy: 0.62 },
};

// ---------------- 엔딩 (직업 × 업보) ----------------
export const ENDINGS = {
  iron: { mercy: ["강철의 수호왕", "칼은 백성을 지키기 위해서만 뽑혔다. 국경엔 평화가, 성벽엔 사람들의 웃음이."], tyrant: ["철혈 군주", "질서는 돌아왔다. 대가는 자유였다. 사람들은 당신의 이름을 두려움으로 부른다."] },
  healer: { mercy: ["치유의 군주", "병원이 궁전보다 먼저 세워진 나라. 아이들은 방사능을 모른 채 자란다."], tyrant: ["격리의 지배자", "병든 자는 성 밖으로. 살아남은 나라는 깨끗했지만 차가웠다."] },
  machine: { mercy: ["기계 도시의 설계자", "발전소의 불빛이 대륙을 다시 밝혔다. 왕관 대신 렌치를 든 왕."], tyrant: ["강철 공장의 주인", "모든 이가 기계를 위해 일하는 효율의 제국."] },
  bounty: { mercy: ["풍요의 군주", "굶는 이 없는 첫 번째 겨울. 사람들은 당신의 국밥을 전설로 남겼다."], tyrant: ["곡창의 독점자", "빵을 가진 자가 왕이다. 당신은 빵을 모두 가졌다."] },
  dawn: { mercy: ["새벽의 학자왕", "도서관이 다시 열리고, 잊힌 기술이 되살아났다. 문명 재부팅 완료."], tyrant: ["금지된 지식의 수호자", "지식은 왕만의 것. 탑 위의 실험은 계속된다."] },
  republic: { mercy: ["공화국의 첫 의장", "당신은 왕관을 거절했다. 사람들은 처음으로 투표했다."], tyrant: ["종신 총통", "선거는 한 번뿐이었다. 그 뒤로는 필요가 없었다."] },
  green: { mercy: ["녹색 대지의 왕", "잿빛 들판에 밀이 출렁인다. 지구가 다시 숨을 쉰다."], tyrant: ["대지주", "모든 땅은 왕의 것, 백성은 소작인."] },
  accidental: { mercy: ["얼떨결에 왕", "\"제가요? 진짜요?\" 소파에서 일어난 사람이 세상을 구했다."], tyrant: ["게으른 폭군", "아무것도 안 하는 왕 덕분에 신하들이 알아서 나라를 망쳤다… 아니, 살렸다?"] },
  fallen: ["잿더미의 끝", "당신의 이름을 기억하는 이는 없다. 하지만 혈통은 다음 생존자에게 이어진다."],
};

// ---------------- 재건 올림픽 ----------------
// stat: 자동 출전 시 사용하는 능력치 가중치 / minigame: 직접 조작 시 미니게임
export const OLYMPIC_EVENTS = [
  { id: "shooting", name: "사격", icon: "🎯", w: { agi: 0.6, cra: 0.2, int: 0.2 }, minigame: "shooter" },
  { id: "sprint", name: "폐허 질주", icon: "🏃", w: { agi: 0.7, vit: 0.3 }, minigame: "race" },
  { id: "wrestling", name: "씨름", icon: "🤼", w: { str: 0.7, vit: 0.3 }, minigame: "timing" },
  { id: "cooking", name: "생존 요리", icon: "🍲", w: { cra: 0.5, int: 0.2, cha: 0.3 }, minigame: "timing" },
  { id: "horse", name: "기마 경주", icon: "🏇", w: { agi: 0.4, cha: 0.2, vit: 0.4 }, minigame: "race", needAnimal: "horse" },
  { id: "build", name: "건축 대회", icon: "🧱", w: { cra: 0.7, str: 0.3 }, minigame: "timing" },
  { id: "quiz", name: "구세계 퀴즈", icon: "📚", w: { int: 0.8, cha: 0.2 }, minigame: "timing" },
];
export const OLYMPICS = {
  unlockBaseLv: 4,
  seasonRealDays: 14,
  luckBand: 0.15, // 운: ±15%
  manualMaxBonus: 0.3, // 직접 조작 미니게임 최대 +30%
  rewards: [
    { rank: 1, gems: 1500, gold: 5000, title: "올림픽 챔피언", item: "royal_robe" },
    { rank: 3, gems: 800, gold: 2500, title: "시상대" },
    { rank: 10, gems: 300, gold: 1000 },
    { rank: 50, gems: 100, gold: 400 },
    { rank: 9999, gems: 30, gold: 150 },
  ],
};

// ---------------- 과금 (야생소년 수준: 광고 + 소액 + 월정액, 확률형 없음) ----------------
export const SHOP = {
  products: [
    { id: "gems_s", name: "보석 한 줌", gems: 300, price: 1200 },
    { id: "gems_m", name: "보석 주머니", gems: 1700, price: 5900, tag: "+13%" },
    { id: "gems_l", name: "보석 상자", gems: 3800, price: 12000, tag: "+27%" },
    { id: "gems_xl", name: "보석 금고", gems: 10500, price: 29000, tag: "+45%" },
    { id: "pass_month", name: "생존자 월정액", price: 4900, monthly: true, desc: "30일간 매일 보석 120, 주 1회 부활권, 경험치 +20%, 광고 없이 광고 보상" },
    { id: "season_pass", name: "재건 시즌 패스", price: 9900, desc: "시즌 미션 보상 2배, 전용 외형(장식만)" },
    { id: "starter", name: "생존 스타터 팩", price: 2900, once: true, desc: "보석 500 + 배낭 + 가죽 재킷 + 통조림 10" },
    { id: "growth_fund", name: "재건 성장 펀드", price: 9900, once: true, desc: "구매 후 기지 Lv3~8 달성 때마다 보석 지급 — 총 6,000 보석(가격 대비 약 6배). 이미 지난 단계도 바로 받음" },
    { id: "speed_pack", name: "공사 가속 꾸러미", price: 3900, desc: "가속 8시간 ×8 + 가속 1시간 ×10 (=74시간, 보석으로 1,480개분)" },
    { id: "vip_pack", name: "VIP 점수 상자", price: 6900, once: true, desc: "VIP 점수 1,500 + 보석 600 (접속만으로도 VIP 는 오른다)" },
  ],
  gemUses: [
    { id: "revive", name: "즉시 부활", desc: "난이도·챕터 내 횟수에 따라 비용 증가" },
    { id: "speedup", name: "건설/연구 즉시 완료", rate: "남은 1시간당 보석 20" },
    { id: "supply", name: "보급 투하", gems: 120, desc: "무작위 자원 상자(내용물 확률 공개)" },
    { id: "repair", name: "즉시 수리", gems: 40 },
    { id: "xp_boost", name: "훈련 교본", gems: 150, desc: "실제 플레이 1시간 동안 경험치 +50% (일일 미션 보석으로도 구매 가능)" },
  ],
  ads: { dailyLimit: 6, rewards: ["무료 부활 1회(일 1회)", "채집 2배 10분", "보급 상자", "건설 30분 단축"] },
  growthFund: { 3: 400, 4: 600, 5: 900, 6: 1100, 7: 1300, 8: 1700 },
  f2pGemSources: ["일일 미션 30~60", "업적", "올림픽 순위", "챕터 클리어 100", "주간 전쟁 보상"],
  rules: [
    "확률형 상품은 '구세계 금고' 하나뿐 — 확률 전부 공개, 200점 천장(전설 확정), 12시간마다 무료 금고, 모든 유물 칸은 생존 기록으로 무료 해금.",
    "그 외 유료 상품은 내용물이 확정(보석·월정액·성장 펀드·가속 꾸러미).",
    "유료로만 얻는 전투력 없음 — 과금은 시간 단축·편의·외형만.",
    "어려움 난이도 엔딩은 무과금으로도 장기 육성 시 도달 가능 (balance-sim 으로 검증).",
    "미성년자 월 결제 한도 7만원, 결제 전 연령 확인, 청약철회 7일 안내.",
  ],
};

export const XP_CURVE = {
  runLevelXp: (lv) => Math.floor(100 * Math.pow(lv, 1.5)), // lv → lv+1 필요 경험치
  runLevelCap: 60,
  legacyLevel: (totalXp) => Math.floor(Math.sqrt(totalXp / 400)), // 직업별 누적 경험치 → 혈통 레벨 (상한 없음)
};

// ---------------- 제작 품질 & 특성(접두어) ----------------
// 같은 레시피라도 손재주·행운·혈통·시설에 따라 결과가 달라진다.
export const QUALITY = [
  { id: 0, name: "조악한", mult: 0.75, dur: 0.6, color: "#9a9a9a" },
  { id: 1, name: "", mult: 1.0, dur: 1.0, color: "#ece4d8" },
  { id: 2, name: "우수한", mult: 1.15, dur: 1.25, color: "#7ed957" },
  { id: 3, name: "명품", mult: 1.35, dur: 1.5, color: "#5ab0e0" },
  { id: 4, name: "전설의", mult: 1.6, dur: 2.0, color: "#e0a24a" },
];
// good: 좋은 특성 / 나쁜 특성. stat: 보정 대상, v: 배율 또는 가산
export const AFFIXES = {
  sharp: { name: "날카로운", good: true, atk: 1.12, desc: "공격 +12%" },
  sturdy: { name: "튼튼한", good: true, dur: 1.25, desc: "내구도 +25%" },
  light: { name: "가벼운", good: true, wear: 0.75, desc: "닳는 속도 -25%" },
  warm: { name: "따뜻한", good: true, warmAdd: 4, desc: "보온 +4" },
  guarded: { name: "단단한", good: true, defAdd: 2, desc: "방어 +2" },
  lucky: { name: "행운의", good: true, luck: 0.1, desc: "채집 희귀품 확률 +10%" },
  rusty: { name: "녹슨", good: false, dur: 0.7, desc: "내구도 -30%" },
  dull: { name: "무딘", good: false, atk: 0.88, desc: "공격 -12%" },
  creaky: { name: "삐걱대는", good: false, wear: 1.35, desc: "닳는 속도 +35%" },
  drafty: { name: "바람 새는", good: false, warmAdd: -3, desc: "보온 -3" },
};

// ---------------- 던전 보스 (매 생애 같은 보스, 위치는 지도마다 다름) ----------------
export const DUNGEONS = {
  raider_camp: { boss: "붉은 손 두목 '강철곰'", hp: 600, power: 260, minChapter: 2, reward: [["ammo", 30], ["gunpowder", 6], ["leather", 8], ["pipe_pistol", 1]], look: "raider" },
  iron_city: { boss: "폭주한 발전소 감독관", hp: 900, power: 520, minChapter: 5, reward: [["electronics", 10], ["iron", 15], ["fuel", 6]], look: "mutant" },
  rad_river: { boss: "강의 포식자(거대 변이체)", hp: 1200, power: 800, minChapter: 8, reward: [["radaway", 4], ["hazmat", 1], ["electronics", 8]], look: "mutant" },
  ash_fortress: { boss: "재의 군주", hp: 1400, power: 0, minChapter: 11, final: true, look: "knight" },
};
// 장소 배치 규칙: 기지에서의 거리 범위(월드 반폭 비율). 방향은 시드마다 무작위.
export const POI_RULES = {
  trader: [0.18, 0.3], radio_tower: [0.3, 0.45], raider_camp: [0.4, 0.6], iron_city: [0.45, 0.65], rad_river: [0.45, 0.65], ash_fortress: [0.78, 0.88],
};

// ---------------- 지구 생물군계 (낙하 지점의 기후로 결정) ----------------
// tiles: 지형 생성 비율 / nodes: 자원 노드 배율 / animals: 야생 동물 / needs: 고유 압박(정규화 전)
// start: 그 지역에서 살아남을 최소 준비물(난이도 흐름을 맞추는 보정) / weather: 날씨 가중치
export const BIOMES = {
  temperate: { name: "온대림", spawn: true, grass: "#5b7a3e", tree: "broad", tiles: { water: 0.24, rock: 0.8, grass: 0.58, ruin: 0.3, sand: 0, snow: 0 }, nodes: { tree: 1, bush: 1, herb: 1, rock: 1, scrap: 1 }, animals: ["deer", "goat", "chicken", "horse", "cow", "boar", "dog", "wolf"], needs: { hunger: 1, thirst: 1 }, start: [], weather: { clear: 38, cloudy: 22, rain: 20, storm: 5, fog: 8, ashfall: 6, radstorm: 1 } },
  rainforest: { name: "열대우림", spawn: true, grass: "#2f6b2a", tree: "jungle", tiles: { water: 0.28, rock: 0.85, grass: 0.4, ruin: 0.25, sand: 0, snow: 0 }, nodes: { tree: 2, bush: 1.6, herb: 2, rock: 0.6, scrap: 0.8 }, animals: ["boar", "deer", "chicken", "goat", "dog", "wolf"], needs: { hunger: 0.95, thirst: 0.9 }, start: [["herb", 3]], weather: { clear: 18, cloudy: 20, rain: 35, storm: 15, fog: 9, ashfall: 2, radstorm: 1 } },
  savanna: { name: "사바나", spawn: true, grass: "#9a9a45", tree: "acacia", tiles: { water: 0.2, rock: 0.82, grass: 0.5, ruin: 0.3, sand: 0.12, snow: 0 }, nodes: { tree: 0.55, bush: 1.2, herb: 0.8, rock: 1, scrap: 1 }, animals: ["horse", "cow", "boar", "deer", "dog", "goat"], needs: { hunger: 0.95, thirst: 1.15 }, start: [["water_clean", 2]], weather: { clear: 45, cloudy: 15, rain: 14, storm: 8, heatwave: 10, ashfall: 6, radstorm: 2 } },
  desert: { name: "사막", spawn: true, grass: "#a89a62", tree: "scrub", tiles: { water: 0.16, rock: 0.78, grass: 0.82, ruin: 0.32, sand: 0.55, snow: 0 }, nodes: { tree: 0.25, bush: 0.6, herb: 0.5, rock: 1.4, scrap: 1.5 }, animals: ["goat", "dog", "chicken", "horse", "boar"], needs: { hunger: 0.85, thirst: 1.35 }, start: [["water_clean", 4], ["cloth", 2]], weather: { clear: 52, cloudy: 8, rain: 4, heatwave: 16, sandstorm: 14, ashfall: 5, radstorm: 1 } },
  steppe: { name: "초원·스텝", spawn: true, grass: "#8a8f52", tree: "broad", tiles: { water: 0.2, rock: 0.8, grass: 0.45, ruin: 0.3, sand: 0.08, snow: 0 }, nodes: { tree: 0.35, bush: 1.3, herb: 1, rock: 1, scrap: 1 }, animals: ["horse", "goat", "cow", "wolf", "dog", "chicken"], needs: { hunger: 1, thirst: 1.1 }, start: [["water_clean", 1]], weather: { clear: 42, cloudy: 22, rain: 12, storm: 6, sandstorm: 6, snow: 4, ashfall: 7, radstorm: 1 } },
  taiga: { name: "침엽수림(타이가)", spawn: true, grass: "#3e5a3a", tree: "conifer", tiles: { water: 0.25, rock: 0.78, grass: 0.5, ruin: 0.22, sand: 0, snow: 0.25 }, nodes: { tree: 1.7, bush: 0.8, herb: 0.7, rock: 1, scrap: 0.7 }, animals: ["wolf", "deer", "boar", "dog", "horse"], needs: { hunger: 1.15, thirst: 0.9 }, start: [["leather", 5], ["cloth", 3]], weather: { clear: 30, cloudy: 26, rain: 14, snow: 18, fog: 6, ashfall: 5, radstorm: 1 } },
  tundra: { name: "툰드라", spawn: true, grass: "#7a8270", tree: "dwarf", tiles: { water: 0.22, rock: 0.72, grass: 0.62, ruin: 0.2, sand: 0, snow: 0.55 }, nodes: { tree: 0.3, bush: 0.7, herb: 0.6, rock: 1.4, scrap: 0.8 }, animals: ["wolf", "deer", "goat", "dog"], needs: { hunger: 1.2, thirst: 0.85 }, start: [["leather", 8], ["cloth", 4], ["bone", 2]], weather: { clear: 26, cloudy: 24, snow: 24, blizzard: 12, fog: 8, ashfall: 5, radstorm: 1 } },
  ice: { name: "빙원", spawn: false, grass: "#dfe4e8", tree: "dwarf", tiles: { water: 0.1, rock: 0.7, grass: 0.9, ruin: 0.1, sand: 0, snow: 0.95 }, nodes: { tree: 0, bush: 0.1, herb: 0, rock: 1, scrap: 0.3 }, animals: ["wolf"], needs: { hunger: 1.3, thirst: 0.8 }, start: [], weather: { snow: 40, blizzard: 40, clear: 20 } },
};

// 계절 이름: 지역마다 다르게(열대=건기·우기, 극지=백야·극야). 게임 연도는 항상 그 지역의 '봄'에 시작.
export const SEASON_NAMES = {
  default: ["봄", "여름", "가을", "핵겨울"],
  rainforest: ["건기", "우기", "건기", "우기"],
  savanna: ["건기", "우기", "건기", "우기"],
  desert: ["봄", "혹서기", "가을", "겨울"],
  tundra: ["해빙기", "백야", "결빙기", "극야"],
};

// 날씨: temp(℃ 가감) thirst(갈증 배율) move(이동 배율) fog(시야 0~1) rad(시간당 피폭) water(빗물)
export const WEATHER = {
  clear: { name: "맑음", temp: 1 },
  cloudy: { name: "흐림", temp: -1, fog: 0.1 },
  rain: { name: "비", temp: -3, thirst: 0.85, water: true, fog: 0.25 },
  storm: { name: "폭풍우", temp: -5, thirst: 0.85, move: 0.85, water: true, fog: 0.45 },
  snow: { name: "눈", temp: -4, move: 0.9, fog: 0.3 },
  blizzard: { name: "눈보라", temp: -9, move: 0.7, fog: 0.65 },
  fog: { name: "짙은 안개", temp: -1, fog: 0.7 },
  heatwave: { name: "폭염", temp: 7, thirst: 1.35 },
  sandstorm: { name: "모래폭풍", temp: 2, thirst: 1.2, move: 0.7, fog: 0.6 },
  ashfall: { name: "잿가루", temp: -2, fog: 0.35 },
  radstorm: { name: "방사능 폭풍", temp: -1, rad: 4, fog: 0.35 },
};
export const NUCLEAR_WINTER = -4; // 핵전쟁 이후 전 지구 평균 기온 하락(세계관)

// ---------------- 의뢰 게시판(매일 3개) · 동료 개인 이야기 ----------------
// kind: gather(가방+창고 보유) kill(처치 수 증가) tame(길들인 수 증가) build(건물 보유) craft(제작 횟수 증가)
export const QUEST_TEMPLATES = [
  { kind: "gather", item: "wood", n: [15, 40], title: "땔감이 모자라요", from: "주민", reward: { gold: 60, xp: 60 } },
  { kind: "gather", item: "stone", n: [10, 30], title: "벽을 보수할 돌", from: "기술자", reward: { gold: 70, xp: 60 } },
  { kind: "gather", item: "berry", n: [6, 15], title: "아이들 간식", from: "요리사", reward: { gold: 50, xp: 50, affinity: 5 } },
  { kind: "gather", item: "herb", n: [4, 10], title: "약초가 필요해요", from: "의사", reward: { gold: 80, xp: 70, item: ["bandage", 3] } },
  { kind: "gather", item: "scrap", n: [10, 25], title: "고철 모으기", from: "기술자", reward: { gold: 80, xp: 70 } },
  { kind: "gather", item: "leather", n: [3, 8], title: "겨울옷 가죽", from: "주민", reward: { gold: 90, xp: 80 } },
  { kind: "gather", item: "cooked_meat", n: [3, 6], title: "잔치 준비", from: "요리사", reward: { gold: 100, xp: 80, morale: 5 } },
  { kind: "kill", n: [3, 8], title: "주변 정리", from: "군인", reward: { gold: 90, xp: 100 } },
  { kind: "kill", n: [10, 20], title: "변이체 소탕", from: "군인", reward: { gold: 160, xp: 180, item: ["ammo", 12] } },
  { kind: "tame", n: [1, 1], title: "새 식구", from: "농부", reward: { gold: 120, xp: 120 } },
  { kind: "craft", n: [3, 8], title: "손재주 시험", from: "기술자", reward: { gold: 80, xp: 90 } },
];
export const COMPANION_STORIES = {
  seoyun: [
    { aff: 40, title: "한서윤 · 마지막 방송", text: "\"방송탑에서 마지막으로 들은 목소리가 내 동생이었어요. 아직 어딘가 살아 있을지도…\"", reward: { item: ["medkit", 2] } },
    { aff: 80, title: "한서윤 · 진료소의 등불", text: "그녀는 진료소 문에 작은 등불을 걸었다. \"누구든, 언제든 와도 돼요.\"", reward: { item: ["revive_kit", 1] } },
  ],
  bongsu: [
    { aff: 40, title: "봉수 · 국밥의 비밀", text: "\"국밥은 국물이 아니라 기다림이야. 사람을 기다리는 맛.\"", reward: { item: ["stew", 4] } },
    { aff: 80, title: "봉수 · 다시 여는 가게", text: "기지 한쪽에 간판이 걸렸다. '봉수네 — 외상 됩니다'.", reward: { item: ["salt", 6] } },
  ],
  dokgo: [
    { aff: 40, title: "독고철 · 꺼지지 않는 발전기", text: "\"철의 도시 불을 혼자 지킨 이유? 누군가 돌아올 때 길을 잃지 않게.\"", reward: { item: ["electronics", 4] } },
    { aff: 80, title: "독고철 · 설계도", text: "그가 낡은 설계도를 건넸다. 성벽을 더 높이 쌓는 방법이 적혀 있다.", reward: { item: ["iron", 10] } },
  ],
  mira: [
    { aff: 40, title: "유미라 · 붉은 손을 떠난 날", text: "\"명령이었어요. 아이가 있는 집을 쏘라는. 그날 총을 내려놨죠.\"", reward: { item: ["ammo", 30] } },
    { aff: 80, title: "유미라 · 망루의 약속", text: "\"이제 이 망루는 내가 지켜요. 당신은 앞만 봐요.\"", reward: { item: ["helmet", 1] } },
  ],
  ara: [
    { aff: 40, title: "진아라 · 빛나는 강의 기록", text: "\"강이 빛나는 건 독 때문만이 아니에요. 새로운 생명이 자라고 있어요.\"", reward: { item: ["radaway", 3] } },
    { aff: 80, title: "진아라 · 씨앗 금고", text: "그녀는 멸망 전 씨앗 금고의 좌표를 기억해 냈다.", reward: { item: ["seed", 20] } },
  ],
  taeho: [
    { aff: 40, title: "남궁태호 · 협상의 기술", text: "\"전쟁은 마지막 수단이에요. 먼저 밥을 같이 먹어 보세요.\"", reward: { gold: 300 } },
    { aff: 80, title: "남궁태호 · 연합 헌장", text: "그가 초안을 내밀었다. 첫 줄: '누구도 굶지 않는다.'", reward: { gold: 600 } },
  ],
};

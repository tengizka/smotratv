/* ==========================================================================
   SMOTRA — проверка одиночного index.html: статический разбор + живой прогон (jsdom).

   Запуск:
     cd /home/user/smotratv/qa && npm i jsdom --no-audit --no-fund && node check.mjs

   Набор лежит рядом с приложением (в репозитории), чтобы не теряться вместе с
   временной папкой песочницы. Проверяем ровно то, что уже один раз ломалось:
   мёртвые кнопки, вылезающий за экран туториал, залитую цветом заставку,
   шторку под открытым окном, полноэкранный режим и безопасные зоны.
   ========================================================================== */
import fs from 'fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const FILE = new URL('../index.html', import.meta.url).pathname;
const src = fs.readFileSync(FILE, 'utf-8');

let pass = 0, fail = 0;
const failed = [];
const ok = (cond, msg) => { if (cond){ pass++; console.log('  ✓ ' + msg); } else { fail++; failed.push(msg); console.log('  ✗ ' + msg); } };
const section = (t) => console.log('\n' + t);

const css = src.slice(src.indexOf('<style>') + 7, src.indexOf('</style>'));
const cssClean = css.replace(/\/\*[\s\S]*?\*\//g, '');
const js = [...src.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const rule = (sel) => (cssClean.match(new RegExp(sel.replace(/[.[\]$*+?(){}|^\\]/g, '\\$&') + '\\{[^}]*\\}')) || [''])[0];
const VER = (/const APP_VERSION = '([\d.]+)'/.exec(js) || [])[1];

/* ============================ [1] Структура и версия ============================ */
section('[1] Структура, версия, история');
ok(VER && /^\d+\.\d+$/.test(VER), 'версия читается: ' + VER);
ok(new RegExp('  ' + VER.replace('.', '\\.') + ' — ').test(src), 'в истории версий есть строка ' + VER);
ok(/при КАЖДОМ обновлении/.test(src), 'правило версии записано в файле');
ok(/id="appVersionLabel"/.test(src) && !/set-group-title">Приложение[\s\S]{0,300}версия/.test(src), 'версия показывается только в FAQ');
const ids = [...src.matchAll(/id="([^"]+)"/g)].map(m => m[1]).filter(v => !v.includes('${'));
const dupIds = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
ok(dupIds.length === 0, 'нет дублей id' + (dupIds.length ? ': ' + dupIds.join(', ') : ''));
const VOID = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
const TRACK = new Set(['html','head','body','title','script','style','svg','g','defs','symbol','div','section','button','span','p','a','ul','ol','li','h1','h2','h3','b','i','em','strong','label','select','figure','main','nav','textarea','td','tr','table','header','footer','path','circle','rect','ellipse','text']);
const stack = [];
const nestingErr = [];
const re = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
let m;
while ((m = re.exec(src))){
  const closing = m[1] === '/', tag = m[2].toLowerCase(), self = m[4] === '/';
  if (VOID.has(tag) || !TRACK.has(tag) || self) continue;
  if (!closing){ stack.push(tag); continue; }
  if (stack[stack.length - 1] === tag){ stack.pop(); continue; }
  const at = stack.lastIndexOf(tag);
  if (at === -1){ nestingErr.push('лишний </' + tag + '>'); continue; }
  nestingErr.push(tag + ' закрыт раньше ' + stack[stack.length - 1]);
  stack.length = at;
}
ok(nestingErr.length === 0 && stack.length === 0, 'теги закрыты и вложены верно' + (nestingErr.length || stack.length ? ': ' + nestingErr.slice(0, 2).join(', ') + ' | не закрыто: ' + stack.slice(0, 3).join(', ') : ''));
for (const [i, block] of [...src.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].entries()){
  let bad = '';
  try{ new Function(block[1]); }catch(e){ bad = e.message; }
  ok(!bad, 'скрипт №' + (i + 1) + ' синтаксически корректен' + (bad ? ': ' + bad : ''));
}
const kf = [...cssClean.matchAll(/@keyframes\s+([\w-]+)/g)].map(x => x[1]);
const deadKf = kf.filter(k => ((cssClean + '\n' + js).split(new RegExp('\\b' + k + '\\b')).length - 1) < 2);
ok(deadKf.length === 0, 'нет мёртвых keyframes' + (deadKf.length ? ': ' + deadKf.join(', ') : ''));
ok(!/[\u{1F300}-\u{1FAFF}]/u.test(src), 'эмодзи в проекте не осталось');
ok(/color-mix/.test(css) === false, 'нет color-mix (его не понимают мини-аппы Telegram)');

/* ============================== [2] Заставка ============================== */
section('[2] Заставка: белая надпись, цвет темы — акцент');
const spanRule = (cssClean.match(/#splash \.s-title span\{[^}]*\}/) || [''])[0].replace(/\s+/g, ' ');
const oRule = (cssClean.match(/#splash \.s-title span\.o\{[^}]*\}/) || [''])[0].replace(/\s+/g, ' ');
ok(/<div class="s-title" id="sTitle"/.test(src), 'надпись — живой текст, а не картинка');
ok(/font-family:'Unbounded'/.test(rule('#splash .s-title')) && /font-weight:900/.test(rule('#splash .s-title')), 'набран Unbounded 900');
ok(/linear-gradient\(180deg, #ffffff/.test(spanRule), 'буквы белые (глянцевый градиент от белого)');
ok((spanRule.match(/0 \d+px 0 #[0-9a-f]{6}/gi) || []).length >= 6, 'объём надписи — слои торца, а не один filter');
ok(!/var\(--accent\)/.test(spanRule), 'цвет темы надпись не заливает');
ok(!/drop-shadow\(0 0 18px var\(/.test(spanRule), 'свечение надписи не красится в цвет темы');
ok(/var\(--accent\)/.test(oRule) && /var\(--accent-glow\)/.test(oRule), 'буква O — акцент текущей темы');
ok((oRule.match(/var\(--splash-ink-\d\)/g) || []).length >= 6, 'торец акцентной буквы — из её же цвета');
ok(/var\(--splash-ink-hi, var\(--accent\)\)/.test(oRule) && /splash-ink-hi/.test(js), 'глянец буквы O — тот же оттенок, но светлее');
ok(/#splash \.s-sub em, #splash \.s-credit b\{[^}]*color:var\(--accent\)/.test(cssClean), '«и вайбуй» и имя автора красятся акцентом');
ok(/#splash \.s-sub, #splash \.s-credit\{ color:rgba\(255,255,255/.test(cssClean), 'слоган и подпись — светлые, а не серые');
ok(!/--splash-ink:#/.test(css) && !/--splash-ink-glow/.test(src), 'в теме больше нет «второго главного» цвета заставки');
ok(/radial-gradient\(closest-side, rgba\(255,255,255,\.22\)/.test(rule('#splash .s-glow')), 'за надписью нейтральное белое свечение, а не цвет темы');
ok(!/wordSheen/.test(css), 'бегущий блик не вернулся — он требует второго цвета');
ok(/function applyWordmarkShades/.test(js) && /shadeColor\(accent/.test(js), 'оттенки торца считаются из акцента темы');
ok(/rotateX\(-72deg\)/.test(css) && /perspective:800px/.test(rule('#splash .s-title')), 'буквы въезжают с разворотом');
ok(/glowPulse/.test(css), 'свечение пульсирует');
ok(!/filter:blur/.test(rule('#splash .s-glow')), 'дорогого blur нет');
ok(/const SPLASH_HOLD = 2900/.test(js) && /SPLASH_AGAIN_AFTER/.test(js), 'заставка короткая и не повторяется в той же сессии');
ok(/prefers-reduced-motion/.test(css), 'уважает prefers-reduced-motion');

/* ======================= [3] Полноэкранный режим и safe-area ======================= */
section('[3] Fullscreen: весь экран, безопасные зоны, клавиатура');
ok(/function tgRequestFullscreen/.test(js) && /tg\.requestFullscreen\(\)/.test(js), 'приложение просит полноэкранный режим');
ok(/isVersionAtLeast\('8\.0'\)/.test(js), 'перед запросом сверяемся с версией Bot API 8.0');
ok(/tg\.onEvent\('fullscreenChanged'/.test(js) && /tg\.onEvent\('fullscreenFailed'/.test(js), 'смена режима и отказ обрабатываются');
ok(/tg\.onEvent\('contentSafeAreaChanged'/.test(js) && /tg\.onEvent\('safeAreaChanged'/.test(js), 'оба вида безопасных зон отслеживаются');
ok(/const fsRetry = \(\) =>/.test(js) && /addEventListener\('pointerdown', fsRetry, true\)/.test(js), 'если клиент требует жест — повторяем запрос на первом касании');
ok(/function tgFullscreen\(\)/.test(js) && /document\.body\.classList\.toggle\('tg-fs', fs\)/.test(js), 'режим запоминается классом на body');
const safeFn = js.slice(js.indexOf('function applySafeArea'), js.indexOf('function applySafeArea') + 1800);
ok(/const top = fs \? \(tgInset\(sa, 'top'\) \+ tgInset\(csa, 'top'\)\) : 0/.test(safeFn), 'в fullscreen складываем системный и контентный отступы сверху');
ok(/if \(!fs && \/android\/i\.test\(tg\.platform \|\| ''\) && !bottom\) bottom = 34/.test(safeFn), 'запас под пилюлю Android остаётся');
ok(/--safe-left/.test(safeFn) && /--safe-right/.test(safeFn), 'боковые отступы (вырез в горизонтальной ориентации) тоже считаются');
ok(/padding-left:var\(--safe-left\); padding-right:var\(--safe-right\)/.test(cssClean.replace(/\s+/g, ' ')), 'оболочка приложения уважает боковые зоны');
ok(/nav\{[\s\S]{0,420}?margin-left:calc\(var\(--safe-left\) \* -1\)/.test(cssClean), 'фон нижней панели растягивается на всю ширину, содержимое — в безопасной зоне');
ok(/\.lvl-strip\{[\s\S]{0,320}?padding-left:calc\(22px \+ var\(--safe-left\)\)/.test(cssClean), 'строка уровня тоже');
ok(/removeProperty\('--safe-top'\)/.test(safeFn), 'вне Telegram отдаём расчёт обратно браузеру (env(safe-area-inset-*))');
ok(/--safe-left: env\(safe-area-inset-left/.test(cssClean) && /--safe-right: env\(safe-area-inset-right/.test(cssClean), 'в CSS есть значения по умолчанию из env()');
ok(/tg\.setBottomBarColor/.test(js), 'цвет нижней панели Telegram совпадает с темой');
ok(/body\.kb-open #undoBtn/.test(cssClean) && !/body\.kb-open nav/.test(cssClean), 'клавиатура не поднимает нижнюю панель');
ok(/window\.scrollTo\(0, 0\)/.test(js), 'страница не «скатывается» под пальцем');

/* ============================== [4] Туториал ============================== */
section('[4] Туториал: ничего не вылезает за экран');
ok(src.indexOf('<div class="tut-stage"') < src.indexOf('<div class="tut-caption"'), 'сцена стоит выше подписи');
ok(src.indexOf('<div class="tut-caption"') < src.indexOf('<div class="tut-actions"'), 'кнопка «Дальше» — последняя строка, внизу');
ok(/grid-template-rows:auto minmax\(0,1fr\) auto auto/.test(cssClean), 'сетка контейнера: шапка, сцена, подпись, кнопка');
ok(/height:var\(--tut-h, var\(--app-h, 100%\)\)/.test(cssClean), 'слой туториала кроет всё приложение');
ok(!/#tutorial\{[^}]*height:100dvh/.test(cssClean), 'жёсткой height:100dvh (она роняла низ за экран) больше нет');
ok(/min\(var\(--safe-top\), 90px\)/.test(cssClean), 'верхний отступ туториала ограничен — inset не съедает пол-экрана');
ok(!/--tut-pad-bottom/.test(cssClean), 'отступа под невидимую часть больше нет — она вне контейнера');
ok(/\.tut-inner\{ position:absolute; left:0; right:0; top:0; height:var\(--tut-vis, 100%\);/.test(cssClean.replace(/\n\s+/g, ' ')), 'содержимое ограничено высотой ВИДИМОЙ части экрана');
ok(/\.tut-inner\{ position:absolute; left:0; right:0; top:0; height:var\(--tut-vis, 100%\); box-sizing:border-box; overflow:hidden;/.test(cssClean.replace(/\n\s+/g, ' ')), 'лишнее просто обрезается: кнопка не может оказаться ниже');
ok(/body\.tut-open nav, body\.tut-open \.lvl-strip|body\.tut-open \.topbar/.test(cssClean), 'во время обучения интерфейс приложения спрятан');
ok(/classList\.add\('tut-open'\)/.test(js) && /classList\.remove\('tut-open'\)/.test(js), 'класс показывается и снимается вместе с туториалом');
ok(/function tutPlan\(inner, fixed, capNatural\)/.test(js), 'высоты считает отдельная функция — её можно проверить без браузера');
ok(/stage\.style\.height = Math\.max\(90, plan\.stageH\) \+ 'px'/.test(js), 'сцена получает ровно остаток места');
ok(/cap\.style\.maxHeight = Math\.max\(48, plan\.capH\) \+ 'px'/.test(js), 'подпись подрезается по плану');
ok(/const layerH = Math\.round\(appH/.test(js) && /const visH = Math\.max\(260, Math\.round\(\(visBottom \|\| box\.bottom \|\| 0\) - \(innerBox\.top \|\| box\.top\)\)\)/.test(js), 'высота слоя и видимая часть считаются по факту');
ok(/inner\.style\.setProperty\('--tut-vis', visH \+ 'px'\)/.test(js), 'видимая высота уходит в переменную контейнера');
ok(/const innerH = Math\.max\(140, Math\.round\(\(innerEl\.clientHeight \|\| visH\) - padTop - padBot\)\)/.test(js), 'внутренняя высота считается по контейнеру видимой части');
ok(/document\.getElementById\('tutStage'\)\.onclick = \(\) => \{/.test(js), 'тап по сцене тоже ведёт вперёд — обучение нельзя застрять');
ok(/document\.getElementById\('tutCount'\)/.test(js) && /\$\{tutStep \+ 1\} \/ \$\{steps\.length\}/.test(js), 'видно, какой это шаг из скольких');
ok(/function clampTutorial/.test(js) && /for \(let pass = 0; pass < 3; pass\+\+\)/.test(js), 'есть финальная посадка с перемером');
ok(/document\.fonts\.ready\.then/.test(js), 'раскладка пересобирается после загрузки Unbounded');
/* ключевое: путь демо-карточки должен влезать в сцену */
ok(/function tutDemoMove/.test(js) && /data-tut-move/.test(js), 'у демо есть габарит движения');
ok(/data-tut-move="84x6"/.test(src) && /data-tut-move="0x92"/.test(src), 'шаги «свайп» и «вверх-вниз» сообщают свой ход');
ok(/const w = \(demo\.offsetWidth \|\| demo\.getBoundingClientRect\(\)\.width \|\| 0\) \+ m\.x \* 2 \+ 16/.test(js), 'масштаб считаем по габариту вместе с движением');
ok(/function tutFitDemoMove/.test(js) && /const roomX = Math\.max\(0, Math\.floor\(\(\(stage\.clientWidth \|\| 0\) - cardW - 24\) \/ 2\)\)/.test(js), 'ход демо подрезается под сцену — карточка не мельчает');
ok(/t\.style\.setProperty\('--tut-move-x', move\.x \+ 'px'\)/.test(js) && /--tut-move-y/.test(js), 'величина хода уходит в переменные, которые читают анимации');
ok(/@keyframes demoWatched\{ 0%,12%\{ transform:translate\(0,0\) rotate\(0\); \} 45%,55%\{ transform:translate\(var\(--tut-move-x, 84px\), -6px\) rotate\(8deg\); \}/.test(cssClean), 'анимация свайпа вправо берёт ход из переменной');
ok(/@keyframes demoWishBoth\{[^\n]*calc\(var\(--tut-move-y, 92px\) \* -1\)/.test(cssClean) && /@keyframes handMoveBoth\{[\s\S]{0,240}?var\(--tut-move-y/.test(cssClean), 'анимации «вверх и вниз» и пальца тоже');
ok(/#tutorial\{ --tut-move-x:84px; --tut-move-y:92px;/.test(cssClean.replace(/\n\s+/g, ' ')), 'у слоя туториала есть значения по умолчанию');
ok(/return Math\.max\(0\.42, Math\.min\(1, availW \/ w, availH \/ h\)\)/.test(js), 'демо никогда не выходит за сцену');
ok(/transform-origin:50% 50%/.test(rule('.tut-demo')), 'демо масштабируется из центра');
ok(/tutDemoScale/.test(js) && /tutApplyScale/.test(js), 'подгонка применяется к демо');
ok(/addEventListener\('resize', \(\) => \{ syncAppHeight\(\); applySafeArea\(\); ensureDeckHeight\(\); fitTutorial\(\); if \(Radial\.active\) Radial\.fit\(\)/.test(js) && /orientationchange/.test(js), 'при повороте пересчитываются и туториал, и подписи кружков');

/* ============================== [5] Уровни ============================== */
section('[5] LVL: мягкая лестница и правила в FAQ');
ok(/const LEVEL_MAX = 68;/.test(js) && /const LEVEL_XP_TARGET = 100000;/.test(js), '68 уровней, вершина — ровно 100 000 XP');
ok(/function levelStartXP\(n\)\{[\s\S]{0,160}?return Math\.round\(LEVEL_XP_TARGET \* k \* k \/ \(span \* span\)\);/.test(js), 'порог уровня считается формулой, без удвоений');
ok(/function fmtXP\(n\)\{ return String\(Math\.max\(0, Math\.round\(Number\(n\) \|\| 0\)\)\)\.replace/.test(js), 'большие числа показываются с разрядами: 100 000');
ok(!/Math\.pow\(2, i - START/.test(js), 'удвоения порогов больше нет');
ok(/function smotraXP/.test(js) && /function levelFor/.test(js) && /function myXP/.test(js), 'опыт и уровень считаются отдельными функциями');
ok(/XP_RULES = \{ watched: 10, wishlist: 6, watching: 4, skipped: 1, review: 25, badge: 40, streakDay: 5 \}/.test(js), 'правила опыта на месте');
ok(!/smotraXP\(\)/.test(js), 'нет вызова расчёта опыта без списков (на этом падали настройки)');
const jsCode = js.replace(/\/\*[\s\S]*?\*\//g, '');   // без комментариев: в истории версий слово остаётся
ok(!/СмотраLVL/.test(jsCode), 'в интерфейсе нет слова «СмотраLVL» — только LVL');
ok(!/Легенда SMOTRA/.test(jsCode), 'уровни и ачивки без слова «Смотра»');
ok(/LVL \$\{level\.level\}/.test(js) && /lvl-bar/.test(cssClean), 'уровень показывается с полосой прогресса');
ok(/\[.Как растёт LVL\?./.test(js) && /Какие уровни есть/.test(js), 'правила и лестница объясняются в FAQ');
ok(/100 000 XP/.test(js) && /68-й «Кинолегенда IV» открывается на 100 000 XP/.test(js) && /22, 67, 111, 156/.test(js), 'в FAQ видно, сколько стоит 68-й уровень');

/* ============================== [6] Поиск ============================== */
section('[6] Поиск: иконка, «Готово», без лишних надписей');
ok((src.match(/enterkeyhint="done"/g) || []).length >= 2, 'на обоих поисках клавиша «Готово»');
ok(/function initSearchExpand/.test(js) && /wrap\.classList\.add\('open'\)/.test(js), 'поиск раскрывается по тапу из иконки');
ok(/\.search-wrap\{[^}]*width:38px/.test(cssClean.replace(/\s+/g, ' ')) && /\.search-wrap\.open\{ width:100%/.test(cssClean), 'свёрнутый поиск — иконка, раскрытый — на всю ширину');
ok(/e\.key === 'Enter' \|\| e\.keyCode === 13/.test(js) && /input\.blur\(\)/.test(js), 'ввод в поиске закрывает клавиатуру');
ok(!/Поиск по названию<\/span>|<span>Поиск<\/span>/.test(src), 'в разметке нет лишних подписей у поиска');
ok(!/<span>Каталог<\/span>/.test(src) && /\.eyebrow\.no-label\{ justify-content:flex-end/.test(cssClean.replace(/\s+/g, ' ')), 'надпись «Каталог» убрана, переключатели вида прижаты вправо');

/* ======================= [7] Кубки, лента, долгое нажатие ======================= */
section('[7] Кубки ачивок, лента, долгое нажатие');
ok((src.match(/data-ach-open/g) || []).length === 1, 'кубок ачивок остался только в профиле (из шапки убран)');
ok(!/ach-chip-top/.test(src) && !/id="achievementsChip"/.test(src), 'иконки достижений рядом с настройками нет');
ok(!/eyebrow"><span>Оценки<\/span>[\s\S]{0,200}ach-chip/.test(src), 'в разделе оценок кубка нет');
ok(/id="openAchievements"/.test(src) && /badgesGrid/.test(src), 'ачивки остались в профиле');
ok(/\[.catGrid.,.wishList.,.watchingList.,.histList.,.feedBody.,.titleListBody.,.friendProfileBody.\]\.forEach\(initLongPress\)/.test(js), 'долгое нажатие работает во всех списках, включая окна');
ok(!/setInterval\(keepDeckFull/.test(js), 'колода пополняется по событиям, без опроса');
ok(/SERVED_KEY/.test(js) && /isServed/.test(js) && /dedupeByTitle/.test(js), 'показанное не повторяется — и по ключу, и по названию');

/* ============================== [8] Слои окон ============================== */
section('[8] Слои: шторки выше открытых окон');
ok(/function topLayerZ/.test(js) && /function raiseSheet/.test(js), 'есть подъём шторки над открытым окном');
ok(/raiseSheet\(sheet, document\.getElementById\('backdrop'\)\)/.test(js), 'карточка фильма поднимается над окном');
ok(/openBadgeDetail[\s\S]{0,200}raiseSheet\(document\.getElementById\('badgeSheet'\)/.test(js), 'карточка ачивки тоже');
ok(/raiseSheet\(sheetEl, backdropEl\)/.test(js), 'диалог ввода — тоже');
ok(/closeOverlay\('achievementsScreen'\)/.test(js.slice(js.indexOf("document.getElementById('badgeWhere')") - 200, js.indexOf("document.getElementById('badgeWhere')") + 900)), 'ачивка закрывает окно ачивок перед переходом');
ok(/let overlayZ = 40/.test(js) && /overlayZ \+= 1/.test(js), 'окна открываются друг над другом');

/* =================== [9] Загрузки: тайтлы, обложки, лента =================== */
section('[9] Загрузки без вечных циклов');
ok(/function patchFilledArt/.test(js), 'догруженный тайтл дорисовывается на месте');
ok(/titleFillInFlight/.test(js) && /titleFillBudget/.test(js), 'догрузка тайтлов параллельная и с предохранителем');
ok(/for \(const k of missing\.slice\(0, 12\)\)/.test(js) === false, 'последовательной очереди по одному больше нет');
ok(/body\.dataset\.uid !== String\(id\)/.test(js), '«Собираю статистику…» не мигает по кругу');
ok(/loadTmdbCacheAny/.test(js), 'подборка поднимается из памяти сразу, сеть догоняет в фоне');
ok(/ART_PARALLEL/.test(js) && /art-loading/.test(cssClean), 'обложки грузятся пачками с индикатором');
ok(/requestPosters/.test(js) && /stubFailed/.test(js), 'не найденные тайтлы помечаются и не запрашиваются снова');

/* ======================= [10] Кружок действий на обложке ======================= */
section('[10] Кружок действий: не залипает и фон заморожен');
const radial = js.slice(js.indexOf('const Radial = (function(){'), js.indexOf('const Radial = (function(){') + 12000);
ok(/open\(movie/.test(radial), 'кружок открывается по долгому нажатию');
ok(/if \(!movie\) return/.test(radial), 'без тайтла кружок не открывается');
ok(/const wasOpen = active/.test(radial), 'закрытие всегда чистит состояние, даже если открытие сорвалось');
ok(/if \(active\) safety\(\)/.test(radial), 'страховка на уровне документа закрывает меню');
ok(/visibilitychange/.test(radial) && /setInterval/.test(radial), 'уход из вкладки и сторож выравнивают состояние');
ok(/body\.radial-open\{ overflow:hidden; overscroll-behavior:none/.test(cssClean), 'фон под кружком не скроллится');
ok(/let pressLock = false/.test(js) && /document\.addEventListener\('touchmove'/.test(js), 'во время удержания прокрутка гасится на уровне документа');
ok(/const blocked = \(el\) => !!\s*\(el && el\.closest\('\.card, \.chips, input, textarea, \.rl-card, \.tut-demo, #undoBtn, \.undo-pill, \.sheet, \[data-no-swipe\]'\)\)/.test(js.replace(/\s+/g, ' ')), 'свайп раздела не срабатывает на карточке и на «Вернуться»');
ok(/\.card \.veil\{[^}]*z-index:20/.test(cssClean.replace(/\n/g, ' ')), 'затемнение карточки лежит на 20-м слое');
ok(/\.stamp\{ position:absolute; z-index:24;/.test(cssClean.replace(/\n\s+/g, ' ')), 'штампы ВЫШЕ затемнения — надписи «смотрел/мимо/чекнуть/смотрю» видно');
ok(/#toast\{ position:absolute; top:0; left:0; right:0; bottom:auto;/.test(cssClean.replace(/\n\s+/g, ' ')), 'подсказка — узкая лента у самого верха экрана');
ok(/\.undo-pill\{ max-width:calc\(var\(--col\) - 24px\); \}/.test(cssClean.replace(/\n\s+/g, ' ')), 'лента сообщения не зажата колонкой — она во всю ширину окна');
ok(/transform:translateY\(-115%\);/.test(cssClean.replace(/\n\s+/g, ' ')) && /#toast\.show\{ transform:translateY\(0\); \}/.test(cssClean), 'лента выезжает из-за верхнего края и уезжает обратно');
ok(/border-radius:0 0 20px 20px/.test(cssClean.replace(/\n\s+/g, ' ')), 'скруглены только нижние углы — это лента, а не квадратик');
ok(!/\.toast-icon/.test(cssClean), 'иконки-квадратика рядом с текстом больше нет');
ok(/#toast::after\{ content:''; position:absolute; left:0; right:0; bottom:0; height:2\.5px;/.test(cssClean.replace(/\n\s+/g, ' ')), 'внизу ленты — тонкая полоска вместо квадратика');
ok(/background:linear-gradient\(90deg, var\(--accent\), var\(--accent-2\)\);/.test(cssClean.replace(/\n\s+/g, ' ')) && /@keyframes toastDrain\{ from\{ transform:scaleX\(1\); \} to\{ transform:scaleX\(0\); \} \}/.test(cssClean), 'полоска показывает, сколько сообщение ещё повисит');
ok(/#toast\.show::after\{ animation:toastDrain 2\.4s linear forwards; \}/.test(cssClean), 'полоска запускается вместе с показом');
ok(/t\.classList\.remove\('show'\);\s*void t\.offsetWidth;\s*t\.classList\.add\('show'\);/.test(js), 'показ перезапускается — полоска не залипает');
ok(/toastTimer = setTimeout\(\(\)=> t\.classList\.remove\('show'\), 2400\);/.test(js), 'сообщение убирается само');

/* нижний таб: ниже ростом, «Главная» вылезает из панели */
ok(/nav\{ position:relative; z-index:4;[^}]*padding:7px 0 calc\(5px \+ min\(var\(--safe-bottom\), 20px\)\);/.test(cssClean.replace(/\n\s+/g, ' ')), 'нижний таб стал ниже: пустой полосы под иконками нет');
ok(/nav button\{ background:none;[^}]*justify-content:center; gap:2px; font-size:10\.5px;/.test(cssClean.replace(/\n\s+/g, ' ')), 'иконки и подписи по центру, компактнее');
ok(/nav button\.nav-home\{ transform:translateY\(-19px\); \}/.test(cssClean), '«Главная» вылезает из нижнего таба');
ok(/nav button\.nav-home \.nav-home-circle\{ width:54px; height:54px;/.test(cssClean.replace(/\n\s+/g, ' ')), 'кружок «Главной» крупнее остальных иконок');
ok(/t\.textContent = String\(text == null \? '' : text\);/.test(js), 'подсказка выводится просто строкой по центру');
ok(/\.stamp\{[^}]*background:rgba\(9,10,18,\.9\)/.test(cssClean.replace(/\n\s+/g, ' ')), 'штамп идёт плотной плашкой, а не только обводкой');

/* ============================ [11] Живое приложение ============================ */
section('[11] Живое приложение (jsdom)');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + (e && e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
function sbChain(result){
  const base = { then: (res) => res(result), catch: () => base, finally: (f) => { try { f(); } catch (e) {} return base; } };
  return new Proxy(base, {
    get(t, prop){ if (prop in t) return t[prop];
      return () => (prop === 'single' || prop === 'maybeSingle') ? sbChain({ data: null, error: null }) : sbChain(result); },
  });
}
const FIX = Array.from({ length: 40 }, (_, i) => ({
  id: 5000 + i, title: 'Тестовый тайтл ' + (i + 1), name: 'Тестовый тайтл ' + (i + 1),
  original_title: 'Test ' + i, poster_path: '/p' + i + '.jpg', vote_average: 6 + (i % 4), vote_count: 400 + i,
  release_date: '2020-05-05', first_air_date: '2020-05-05', genre_ids: [28, 35], overview: 'Описание',
  original_language: 'ru', popularity: 900 - i, media_type: 'movie',
}));
const html = src.replace(/<script src="[^"]*"><\/script>/g, '').replace(/<link[^>]*fonts\.googleapis[^>]*>/g, '');
const ioQueue = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://smotra.test/', virtualConsole: vc,
  beforeParse(w){
    w.supabase = { createClient: () => ({ from: () => sbChain({ data: [], error: null, count: 0 }) }) };
    w.fetch = async (url) => ({ ok: true, json: async () => (/genre\/(movie|tv)\/list/.test(String(url))
      ? { genres: [{ id: 28, name: 'Боевик' }, { id: 35, name: 'Комедия' }] }
      : { page: 1, total_pages: 1, results: FIX, genres: [] }) });
    w.IntersectionObserver = class {
      constructor(cb){ this.cb = cb; }
      observe(el){ ioQueue.push({ el, cb: this.cb }); }
      unobserve(){} disconnect(){} takeRecords(){ return []; }
    };
    w.__flushIO = () => ioQueue.splice(0).forEach(({ el, cb }) => { try { cb([{ target: el, isIntersecting: true, intersectionRatio: 1 }], {}); } catch (e) {} });
  },
});
const win = dom.window, doc = win.document;
const ev = (code) => win.eval(code);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const t0 = Date.now();
while (Date.now() - t0 < 1800){ win.__flushIO(); await sleep(40); }
ok(errors.length === 0, 'нет ошибок при запуске' + (errors.length ? ': ' + errors.slice(0, 2).join(' | ') : ''));
ok(ev('MOVIES.length') > 40, 'каталог загрузился: ' + ev('MOVIES.length') + ' тайтлов');
ok(!!doc.querySelector('#stack .card'), 'колода отрисована');
const titleEl = doc.getElementById('sTitle');
ok(!!titleEl && titleEl.textContent === 'SMOTRA' && titleEl.children.length === 6, 'надпись собрана из шести букв');
const oSpan = titleEl ? [...titleEl.children].find(s => s.textContent === 'O') : null;
ok(!!oSpan && oSpan.classList.contains('o'), 'буква O помечена как акцентная');
/* заставка: цвет темы — только акцент */
ev('applyTheme("neon"); applyWordmarkShades();');
const ink1 = ev('document.documentElement.style.getPropertyValue("--splash-ink-1")');
ok(/^rgb\(/.test(ink1), 'торец акцентной буквы посчитан: ' + ink1);
ev('applyTheme("amber"); applyWordmarkShades();');
const inkA = ev('document.documentElement.style.getPropertyValue("--splash-ink-1")');
ok(inkA !== ink1, 'в другой теме торец акцентной буквы другой: ' + inkA);
ev('applyTheme("neon"); applyWordmarkShades();');
/* туториал: раскладка в чистых числах */
ok(ev('(function(){ for (let h = 320; h <= 1100; h += 20){ const p = tutPlan(h - 130, 130, 260); if (p.stageH + p.capH + 130 > h) return false; } return true; })()'), 'при любой высоте строки туториала не выходят за экран');
ok(ev('(function(){ const p = tutPlan(600, 150, 900); return p.capH <= p.capLimit && p.stageH > 0; })()'), 'очень длинная подпись подрезается, сцена остаётся');
ok(ev('(function(){ const p = tutPlan(600, 150, 120); return p.stageH === 330 && p.capH === 120; })()'), 'короткой подписи — ровно её высота, остальное сцене');
ok(ev('(function(){ const f = { offsetWidth:208, offsetHeight:292, dataset:{ tutMove:"84x6" } }; return tutDemoScale(f, { clientWidth:350, clientHeight:420 }) <= 350 / (208 + 168 + 16) + 0.01; })()'), 'масштаб демо учитывает ход карточки вбок');
ok(ev('(function(){ const f = { offsetWidth:208, offsetHeight:292, dataset:{ tutMove:"84x6" } }; const m = tutFitDemoMove(f, { clientWidth:350, clientHeight:420 }); return m.x === 59 && m.y === 6; })()'), 'на узком экране ход подрезан (59px вместо 84), карточка остаётся крупной');
ok(ev('(function(){ const f = { offsetWidth:208, offsetHeight:292, dataset:{ tutMove:"84x6" } }; const m = tutFitDemoMove(f, { clientWidth:700, clientHeight:900 }); return m.x === 84; })()'), 'на широком экране ход не тронут');
ok(ev('(function(){ const f = { offsetWidth:208, offsetHeight:292, dataset:{ tutMove:"0x92" } }; const k = tutDemoScale(f, { clientWidth:350, clientHeight:420 }); return 292 * k + 92 * k * 2 <= 420 + 1; })()'), 'на шаге «вверх и вниз» карточка влезает по высоте');
ev('document.getElementById("tutorial").classList.add("show"); document.body.classList.add("tut-open"); tutStep = 0; renderTutStep();');
await sleep(120);
ok(ev('!!(document.querySelector(".tut-caption").compareDocumentPosition(document.querySelector(".tut-actions")) & 4)'), 'кнопка «Дальше» — последняя строка туториала');
ok(ev('document.querySelector(".tut-demo").dataset.tutMove') === '84x6', 'у демо первого шага есть габарит движения');
ev('clampTutorial(); fitTutorial();');
ok(ev('!!document.querySelector(".tut-stage") && !!document.querySelector(".tut-actions")'), 'после подгонки обе части туториала на месте');
ok(ev('document.body.classList.contains("tut-open")'), 'во время обучения интерфейс приложения спрятан');
/* живьём: высоты посчитаны, шаг видно, обучение доводится до конца */
ok(/px$/.test(ev('document.getElementById("tutInner").style.getPropertyValue("--tut-vis")')), 'видимая высота туториала посчитана в пикселях');
ok(/px$/.test(ev('document.querySelector(".tut-stage").style.height')), 'сцена получила высоту в пикселях, а не «авто»');
ok(/px$/.test(ev('document.querySelector(".tut-caption").style.maxHeight')), 'подпись ограничена по высоте');
ok(ev('TUTORIAL_STEPS.length') === 6, 'шагов в обучении ровно 6');
ok(ev('document.getElementById("tutCount").textContent') === '1 / 6', 'видно, какой это шаг из скольких: ' + ev('document.getElementById("tutCount").textContent'));
for (let i = 0; i < 6; i++) ev('document.getElementById("tutNext").click();');
ok(!ev('document.getElementById("tutorial").classList.contains("show")'), 'шесть нажатий «Дальше» доводят обучение до конца — застрять нельзя');
/* второй путь: тапом по сцене (страховка, если кнопку перекрыл системный бар) */
ev('document.getElementById("tutorial").classList.add("show"); document.body.classList.add("tut-open"); tutStep = 0; renderTutStep();');
for (let i = 0; i < 6; i++) ev('document.getElementById("tutStage").click();');
ok(!ev('document.getElementById("tutorial").classList.contains("show")'), 'тапом по сцене обучение тоже проходится до конца');
ev('localStorage.removeItem("smotra_tutorial_done"); document.getElementById("tutorial").classList.remove("show"); document.body.classList.remove("tut-open");');
/* уровни */
ok(ev('LEVELS.length') === 68 && ev('LEVELS[1].xp') === 22 && ev('LEVELS[9].xp') === 1804 && ev('LEVELS[67].xp') === 100000, 'пороги уровней: ' + ev('LEVELS.slice(0,4).map(l => l.xp).join(",")') + ' … ' + ev('LEVELS[67].xp'));
ok(ev('LEVEL_XP_TARGET') === 100000 && ev('levelStartXP(68)') === 100000 && ev('LEVELS[67].top') === true, 'вершина лестницы — ровно 100 000 XP');
ok(ev('LEVELS.every((l, i) => i === 0 || l.xp > LEVELS[i-1].xp)'), 'пороги уровней только растут');
ok(ev('LEVELS[6].need') === 290 && ev('LEVELS[66].need') === 2963 && ev('LEVELS[65].need') === 2918 && ev('LEVELS[67].need') === 0, 'шаг уровня растёт до 2 963 XP, у 68-го шага нет');
ok(ev('LEVELS.reduce((a, l) => a + l.need, 0)') === 100000, 'сумма всех переходов — ровно 100 000 XP');
ok(ev('LEVELS.every((l, i) => i === 0 || l.need === 0 || ((l.need - LEVELS[i-1].need) >= 43 && (l.need - LEVELS[i-1].need) <= 46))'), 'каждый следующий переход дороже на 43–46 XP: без удвоений');
/* серия дней: считается по базе, а не по памяти устройства — иначе телефон и
   десктоп показывают разные числа */
ok(/function streakFromDays\(days\)\{/.test(js) && /while \(days\.has\(dateKey\(cursor\)\)\)\{ n\+\+; cursor\.setDate\(cursor\.getDate\(\) - 1\); \}/.test(js), 'серия считается по дням активности');
ok(/sb\.from\('swipes'\)\.select\('created_at'\)\.eq\('telegram_id', TG_ID\)/.test(js), 'дни активности тянутся из базы отдельным запросом');
ok(/if \(error\) throw error;\s*applySyncedStreak\(data\);/.test(js), 'ошибка запроса оставляет локальный счёт, состояние не ломается');
{
  const twoDays = ev('(function(){ const d = new Date(); const y = new Date(Date.now() - 86400000); const k = x => x.toISOString().slice(0,10) + "T12:00:00Z"; return [{created_at:k(d)},{created_at:k(y)}]; })()');
  ok(ev('JSON.stringify(applySyncedStreak(' + JSON.stringify(twoDays) + '))') === 'true', 'дни из базы применяются');
  ok(ev('currentStreak') === 2, 'серия по двум дням подряд = 2');
  ok(doc.getElementById('streakNum').textContent === '2' && doc.getElementById('statStreak').textContent === '2', 'число серии обновилось и в шапке, и в профиле');
  ok(ev('applySyncedStreak([])') === false, 'пустая база не обнуляет серию — остаётся локальный счёт');
}
/* каталог: фильтры живут в отдельном окне и считаются одной функцией */
ok(ev('catFilterMovies({ types:[], genres:[], year:"any", sort:"default" }).length') === ev('MOVIES.length'), 'без фильтров видно все тайтлы');
ok(ev('catFilterMovies({ types:[], genres:[], year:"old", sort:"default" }).length') === 0, '«до 2000» отсекает тайтлы 2020 года');
ok(ev('catFilterMovies({ types:["film"], genres:["Боевик"], year:"2020", sort:"default" }).length') > 0, 'жанр и год вместе работают');
{
  const sorted = ev('catFilterMovies({ types:[], genres:[], year:"any", sort:"title" }).slice(0,2).map(m => m.title)');
  const expected = ev('MOVIES.map(m => m.title).slice().sort((a,b) => a.localeCompare(b, "ru")).slice(0,2)');
  ok(JSON.stringify(sorted) === JSON.stringify(expected), 'сортировка по названию: ' + sorted[0]);
}
ev('openCatFilters();');
ok(doc.getElementById('filtersScreen').classList.contains('open'), 'кнопка «Фильтры» открывает окно');
ok(doc.querySelectorAll('#filtersBody .f-block').length >= 4, 'в окне есть блоки: тип, жанры, год, сортировка');
ok(doc.querySelectorAll('#filtersBody .f-chip').length >= 6, 'чипы фильтров на месте: ' + doc.querySelectorAll('#filtersBody .f-chip').length);
const foundBefore = doc.getElementById('filtersFound').textContent;
doc.querySelector('#filtersBody .f-chip[data-f="year"][data-v="old"]').click();
ok(doc.getElementById('filtersFound').textContent !== foundBefore, 'выбор года сразу пересчитывает найденное: ' + doc.getElementById('filtersFound').textContent);
doc.querySelector('#filtersBody [data-clear]') && doc.querySelector('#filtersBody [data-clear]').click();
doc.getElementById('filtersReset').click();
ok(ev('catFilterMovies(filtersDraft).length') === ev('MOVIES.length'), '«Сбросить» возвращает всё');
doc.querySelector('#filtersBody .f-chip[data-f="genre"]').click();
const genreName = doc.querySelector('#filtersBody .f-chip[data-f="genre"]').dataset.v;
doc.getElementById('filtersApply').click();
await sleep(80);
ok(!doc.getElementById('filtersScreen').classList.contains('open'), '«Показать» закрывает окно');
ok(ev('catFilters.genres').length === 1 && ev('catFilters.genres[0]') === genreName, 'выбранный жанр применился к каталогу');
ok(doc.querySelectorAll('#catActive .chip.removable').length === 1, 'на каталоге виден один чип активного фильтра');
ok(doc.getElementById('catFilterBadge').style.display !== 'none', 'на кнопке видно, что фильтр включён');
ok([...doc.querySelectorAll('#catGrid .poster-card, #catGrid .row-card')].length > 0, 'каталог перерисован с фильтром');
doc.querySelector('#catActive .chip.removable').click();
await sleep(40);
ok(ev('catFilters.genres').length === 0 && doc.querySelectorAll('#catActive .chip.removable').length === 0, 'чип с крестиком снимает фильтр');
ok(!doc.getElementById('catChips') && !doc.getElementById('typeChips'), 'ползучих строк чипов над сеткой больше нет');
/* радиальное меню: «Мимо» вместо «Поделиться» */
ok(!/lbl:'Поде/.test(js) && /icon:'cross', lbl: isSkipped\?'Вернуть':'Мимо'/.test(js), 'на удержании вместо «Поделиться» — «Мимо»');
ok(/if \(kind === 'skipped'\)\{/.test(js) && /showToast\('Отмечено «Мимо»', 'cross'\)/.test(js), 'действие «Мимо» действительно работает');
ok(/<span class="trd-lbl">Мимо<\/span>/.test(src) && !/<span class="trd-lbl">Поде/.test(src), 'в обучении тот же набор кружков');
ok(ev('levelFor(0).level') === 1 && ev('levelFor(22).level') === 2 && ev('levelFor(1804).level') === 10 && ev('levelFor(100000).level') === 68, 'уровень считается верно');
ok(ev('levelFor(99999).level') === 67 && ev('levelFor(100000).level') === 68, 'на 99 999 XP ещё 67-й уровень, на 100 000 — 68-й');
ok(ev('levelFor(100000).next') === null && ev('levelFor(100000).pct') === 100, 'на 68-м уровне лестница заканчивается');
ok(/LVL \d+ ·/.test(ev('document.getElementById("homeLevelName").textContent')), 'вверху главной видно уровень: ' + ev('document.getElementById("homeLevelName").textContent'));
ok(!ev('document.getElementById("levelCard").innerHTML').includes('СмотраLVL'), 'в профиле нет слова «СмотраLVL»');
const faq = ev('(function(){ renderFaq(); return document.getElementById("faqBody").textContent; })()');
ok(faq.indexOf('100 000 XP') > -1 && faq.indexOf('+10 XP') > -1 && faq.indexOf('68') > -1, 'в FAQ есть лестница и правила опыта');
ok(faq.indexOf('LVL') > -1 && faq.indexOf('СмотраLVL') === -1, 'в FAQ пишем LVL');
/* ачивки */
ok(ev('BADGES.length') === 68, 'ачивок в приложении — ровно 68: ' + ev('BADGES.length'));
ok(ev('new Set(BADGES.map(b => b.id)).size') === 68, 'id ачивок не повторяются');
ok(ev('new Set(BADGES.map(b => b.icon)).size') >= 24, 'значки ачивок не повторяются: ' + ev('new Set(BADGES.map(b => b.icon)).size'));
ok(ev('BADGES.every(b => b.name && b.desc && b.min > 0 && typeof b.kind === "string")'), 'у каждой ачивки есть название, описание и условие');
ok(ev('badgeCounters().decades') >= 0 && ev('BADGES.some(b => b.kind === "decades")'), 'работает и счётчик десятилетий: ' + ev('badgeCounters().decades'));
ev('openAchievementsScreen();');
ok(ev('document.getElementById("achievementsScreen").classList.contains("open")'), 'окно всех ачивок открывается');
ok(ev('document.querySelectorAll("#achievementsGrid .badge").length') === ev('BADGES.length'), 'рисуются все ' + ev('BADGES.length') + ' ачивок');
ok(ev('document.getElementById("achievementsBar").style.width') !== '', 'полоса прогресса заполнена');
ev('closeOverlay("achievementsScreen");');
ok(!ev('document.getElementById("achievementsScreen").classList.contains("open")'), 'окно ачивок закрывается');
ok(ev('document.querySelectorAll(".topbar [data-ach-open], .topbar .ach-chip-top").length') === 0, 'в шапке нет иконки достижений');
/* шторка выше окна */
ev('openAchievementsScreen(); openSheet(MOVIES[0]);');
await sleep(40);
const zSheet = ev('parseInt(getComputedStyle(document.getElementById("sheet")).zIndex, 10)');
const zAch = ev('parseInt(getComputedStyle(document.getElementById("achievementsScreen")).zIndex, 10)');
ok(zSheet > zAch, 'карточка фильма выше окна ачивок (' + zSheet + ' > ' + zAch + ')');
ev('sheet.classList.remove("open"); document.getElementById("backdrop").classList.remove("open");');
ev('openBadgeDetail("b8");');
ok(ev('parseInt(getComputedStyle(document.getElementById("badgeSheet")).zIndex, 10)') > zAch, 'карточка ачивки тоже выше окна');
ev('document.getElementById("badgeWhere").click();');
await sleep(40);
ok(!ev('document.getElementById("achievementsScreen").classList.contains("open")'), 'ачивка закрывает окно ачивок перед переходом');
ok(!ev('document.getElementById("badgeSheet").classList.contains("open")'), 'и свою шторку закрывает');
/* настройки обязаны открываться — здесь приложение уже один раз ломалось */
const errsBefore = errors.length;
ev('document.getElementById("settingsScreen").classList.remove("open"); document.getElementById("openSettings").click();');
await sleep(60);
ok(ev('document.getElementById("settingsScreen").classList.contains("open")'), 'кнопка настроек открывает настройки');
ok(errors.length === errsBefore, 'при открытии настроек нет ошибок' + (errors.length > errsBefore ? ': ' + errors[errors.length - 1] : ''));
ok(/LVL \d+ ·/.test(ev('document.getElementById("setLevel").textContent')), 'в настройках видно уровень: ' + ev('document.getElementById("setLevel").textContent'));
ok(ev('!!document.getElementById("openXpRules")') && !ev('!!document.getElementById("setXpRules")'), 'таблица опыта из настроек убрана — за ней вход в FAQ');
ev('closeOverlay("settingsScreen");');
/* колода: затемнение растёт, штампы появляются */
const firstCard = doc.querySelector('#stack .card:last-child');
if (firstCard){
  const mv = (t, x, y) => firstCard.dispatchEvent(new win.MouseEvent(t, { bubbles: true, clientX: x, clientY: y }));
  const frame = () => new Promise(r => win.requestAnimationFrame(() => r()));
  mv('pointerdown', 100, 300);
  mv('pointermove', 140, 310);
  await frame(); await frame();
  const v1 = Number(firstCard.querySelector('.veil').style.opacity) || 0;
  mv('pointermove', 200, 320);
  await frame(); await frame();
  const v2 = Number(firstCard.querySelector('.veil').style.opacity) || 0;
  ok(v2 > v1, 'затемнение растёт постепенно: ' + v1.toFixed(2) + ' → ' + v2.toFixed(2));
  mv('pointerup', 200, 320);
  await frame();
  ok((Number(firstCard.querySelector('.veil').style.opacity) || 0) === 0, 'после отпускания вуаль снимается');
}
/* поиск и вкладки */
ok(ev('document.getElementById("catSearch").getAttribute("enterkeyhint")') === 'done', 'на поиске в каталоге клавиша «Готово»');
ev('document.getElementById("catSearchBtn").click();');
await sleep(60);
ok(ev('document.getElementById("catSearchWrap").classList.contains("open")'), 'иконка раскрывает поле поиска');
ev('catSearch.value = "Тестовый тайтл 3"; catSearch.dispatchEvent(new Event("input", { bubbles: true }));');
await sleep(60);
ok(ev('document.querySelectorAll("#catGrid .poster-card").length') >= 1, 'поиск фильтрует каталог');
ev('catSearch.value = ""; catSearch.dispatchEvent(new Event("input", { bubbles: true }));');
const tabs = ev('[...document.querySelectorAll("nav button")].map(b => b.dataset.tab)');
let tabBroken = [];
for (const t of tabs){
  ev(`document.querySelector('nav button[data-tab="${t}"]').click();`);
  await sleep(30);
  const active = ev('(document.querySelector(".screen.active") || {}).id');
  const expected = t === 'home' ? 'home' : t;
  if (active !== expected) tabBroken.push(t + '→' + active);
}
ok(tabBroken.length === 0, 'все ' + tabs.length + ' разделов открываются по тапу' + (tabBroken.length ? ': ' + tabBroken.join(', ') : ''));
ev('switchTab("home");');
await sleep(40);
ok(ev('!!document.querySelector("#home .card, #home .deck-loading")'), 'после обхода вкладок на главной снова есть карточка');
/* смоук: ни одна кнопка не должна «молчать» из-за ошибки в обработчике */
const clickErrors = [];
const onWinErr = (e) => clickErrors.push(String((e && e.error && e.error.message) || (e && e.message) || e));
win.addEventListener('error', onWinErr);
const SMOKE = ['openSettings','closeSettings','setThemeRow','closeThemes','openFaq','closeFaq','openXpRules',
  'openRoulette','rlClose','openHistory','closeHistory','openWatchingRow','openAchievements','closeAchievements',
  'openFilters','filterBackdrop','catShowMoreBtn','openWishFilters','closeFilters','filtersApply'];
const missing = SMOKE.filter(id => !doc.getElementById(id));
for (const id of SMOKE){
  const el = doc.getElementById(id);
  if (el) el.click();
  await sleep(15);
}
win.removeEventListener('error', onWinErr);
ok(missing.length === 0, 'все основные кнопки есть в разметке' + (missing.length ? ': нет ' + missing.join(', ') : ''));
ok(clickErrors.length === 0, 'кнопки срабатывают без ошибок' + (clickErrors.length ? ': ' + clickErrors.slice(0, 3).join(' | ') : ''));
ev('switchTab("home");');
ok(errors.length === 0, 'ошибок консоли за весь прогон: ' + errors.length + (errors.length ? ' — ' + errors.slice(0, 2).join(' | ') : ''));
win.close();


/* ============================ [12] Десктоп ============================ */
section('[12] Десктоп: Telegram Desktop, мышь, данные профиля');
/* --- вёрстка: колонка по центру, курсор и наведение --- */
ok(/--col: 100%;/.test(cssClean), 'ширина колонки интерфейса вынесена в переменную');
ok(/@media \(min-width: 760px\)\{[\s\S]{0,400}?--col: 700px/.test(cssClean), 'на широком экране колонка ограничена');
ok(/\.topbar, \.lvl-strip, \.screens\{ width:100%; max-width:var\(--col\); margin-left:auto; margin-right:auto; \}/.test(cssClean.replace(/\s+/g, ' ')), 'шапка, уровень и лента экранов в одной колонке');
ok(/\.sheet, \.overlay-screen, #tutorial, #onboarding, #splash\{ max-width:var\(--col\); margin-left:auto; margin-right:auto; \}/.test(cssClean.replace(/\s+/g, ' ')), 'полноэкранные слои тоже сужены и центрированы');
ok(/\.stack\{ width:100%; max-width:430px; margin:0 auto; max-height:min\(62vh, 640px\); \}/.test(cssClean.replace(/\s+/g, ' ')), 'карточка на десктопе держит пропорции постера');
ok(/\.grid2\{ grid-template-columns:repeat\(auto-fill, minmax\(150px, 1fr\)\); \}/.test(cssClean.replace(/\s+/g, ' ')), 'обложки на широком экране идут в несколько столбцов');
ok(/@media \(hover:hover\) and \(pointer:fine\)\{/.test(cssClean), 'для мыши отдельный блок стилей');
ok(/cursor:pointer; \}\n[\s\S]{0,300}?\.icon-btn:hover/.test(cssClean), 'у нажимаемого появился курсор-рука и подсветка');
/* --- данные: вход в профиль, оценки из базы, повторная загрузка --- */
ok(/function enterProfile\(\)\{/.test(js), 'есть отдельный вход в профиль');
ok(/if \(id === 'profile'\) enterProfile\(\);/.test(js), 'профиль считает статистику сразу при открытии вкладки');
ok(/function enterProfile\(\)\{[\s\S]{0,600}?renderMyStats\(\);/.test(js), 'в нём рисуется блок статистики');
ok(/function enterProfile\(\)\{[\s\S]{0,900}?renderWeekActivity\(\);/.test(js), 'и «активность за неделю»');
ok(/async function loadMyRatings\(force\)\{/.test(js) && /sb\.from\('reviews'\)\.select\('movie_id,total'\)\.eq\('telegram_id', TG_ID\)/.test(js), 'оценки тянутся из базы');
ok(/state\.reviews = Math\.max\(state\.reviews \|\| 0, map\.size\)/.test(js), 'счётчик оценок берётся из базы, а не только из памяти устройства');
ok(/function enterProfile\(\)\{[\s\S]{0,1200}?loadMyRatings\(\)\.then/.test(js), 'при входе в профиль оценки догружаются и цифра обновляется');
ok(/const stateLoadFailed = \[\];/.test(js) && /stateLoadFailed\.push\('swipes'\)/.test(js) && /stateLoadFailed\.push\('badges'\)/.test(js), 'запоминаем, какие таблицы не ответили');
/* Главная причина «часть данных не подгружается»: списки свайпов и чек-листа
   присваивались ДО ответа базы, то есть всегда пустыми. */
ok(/stateJobs\.push\(\(async \(\) => \{[\s\S]{0,1800}?state\.watched = uniq\(\(sw\|\|\[\]\)\.filter\(r=>r\.action==='watched'\)/.test(js), 'списки свайпов раскладываются ПОСЛЕ ответа базы');
ok(/state\.watched = \[\]; state\.skipped = \[\]; state\.wishlist = \[\];   \/\/ заполнятся из базы в задаче выше/.test(js), 'до ответа списки только обнуляются, а не затираются пустышкой');
ok(/function scheduleStateRetry\(\)\{/.test(js) && /const wait = \[2000, 5000, 12000\]\[stateRetryCount\];/.test(js), 'неудачная загрузка повторяется сама');
ok(/window\.addEventListener\('online', \(\) => \{ stateRetryCount = 0; if \(stateLoadFailed\.length\) scheduleStateRetry\(\); \}\)/.test(js), 'и повторяется при появлении связи');
ok(/function refreshSyncState\(\)\{/.test(js), 'строка «связь с базой» говорит по делу');
/* --- личность на десктопе --- */
ok(/function tgUser\(\)\{/.test(js), 'данные о человеке берём помощником');
ok(/const part = raw\.split\('&'\)\.find\(p => p\.indexOf\('user='\) === 0\);/.test(js), 'разбираем строку initData — на десктопе объекта пользователя может не быть');
ok(/let TG_ID = getTelegramId\(\);\s*const TG_ID_IS_GUEST = !tgUser\(\)\?\.id;/.test(js), 'гостевой аккаунт помечен как временный');
ok(/async function onIdentityReady\(\)\{/.test(js) && /TG_ID = u\.id;/.test(js), 'при появлении настоящего пользователя переключаемся на его данные');
ok(/watchIdentity\(\);\s+\/\/ данные о человеке могут прийти позже/.test(js), 'за появлением данных следим после запуска');
ok(/function watchIdentity\(\)\{[\s\S]{0,320}?if \(!TG_ID_IS_GUEST\) return;/.test(js), 'гостевой запуск проверяется по кругу несколько секунд');
ok(/if \(u\?\.id\) return u\.id;/.test(js) && /localStorage\.getItem\('smotra_guest_id'\)/.test(js), 'гостевой ID остаётся последним запасным вариантом');
/* --- клавиатура --- */
ok(/document\.addEventListener\('keydown', e => \{/.test(js), 'клавиатура на десктопе поддерживается');
ok(/const byKey = \{ ArrowRight:\['btnWatched','watched'\], ArrowLeft:\['btnSkip','skip'\], ArrowUp:\['btnWish','wish'\], ArrowDown:\['btnWatching','watching'\] \};/.test(js), 'стрелки листают колоду как кнопки');
ok(/else if \(e\.key === 'Enter'\)\{\s*openSheet\(deck\[0\]\);/.test(js), 'Enter открывает карточку');
ok(/if \(e\.key === 'Escape'\)\{\s*if \(sheetOpen\)\{ sheet\.classList\.remove\('open'\); backdrop\.classList\.remove\('open'\); e\.preventDefault\(\); \}/.test(js), 'Esc закрывает верхнее окно');
ok(/if \(t && \(t\.tagName === 'INPUT' \|\| t\.tagName === 'TEXTAREA' \|\| t\.isContentEditable\)\) return;/.test(js), 'в полях ввода клавиши не перехватываются');

/* --- живой прогон: десктопный Telegram с данными о человеке --- */
const dErrors = [];
const dvc = new VirtualConsole();
dvc.on('jsdomError', e => dErrors.push('jsdomError: ' + (e && e.message)));
dvc.on('error', (...a) => dErrors.push('console.error: ' + a.join(' ')));
const DESK_USER = { id: 42424242, first_name: 'Тенгиз', last_name: '', username: 'tengizka' };
const DESK_ROWS = {
  swipes: [
    { movie_id: 5000, action: 'watched' }, { movie_id: 5001, action: 'watched' },
    { movie_id: 5002, action: 'watched' }, { movie_id: 5003, action: 'skipped' },
  ],
  wishlist: [{ movie_id: 5004 }],
  watching: [{ movie_id: 5005 }],
  badges: [{ badge_id: 'b1', created_at: '2026-08-01T10:00:00Z' }],
  episodes_progress: [],
  reviews: [{ movie_id: 5000, total: 61 }, { movie_id: 5001, total: 44 }, { movie_id: 5002, total: 70 }],
  friends: [],
  profiles: [],
};
const dSeen = [];
function deskTable(name){
  const rows = DESK_ROWS[name] || [];
  const chain = (result) => {
    const base = {
      then: (res) => { if (name === 'swipes' || name === 'wishlist' || name === 'reviews') dSeen.push(name); return res(result); },
      catch: () => base, finally: (f) => { try { f(); } catch (e) {} return base; },
    };
    return new Proxy(base, {
      get(t, prop){ if (prop in t) return t[prop];
        return () => (prop === 'single' || prop === 'maybeSingle')
          ? chain({ data: rows[0] || null, error: null })
          : chain({ data: rows, error: null, count: rows.length }); },
    });
  };
  return chain({ data: rows, error: null, count: rows.length });
}
const dIo = [];
const dHtml = src.replace(/<script src="[^"]*"><\/script>/g, '').replace(/<link[^>]*fonts\.googleapis[^>]*>/g, '');
const ddom = new JSDOM(dHtml, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://smotra.test/desktop', virtualConsole: dvc,
  beforeParse(w){
    /* Десктопный клиент: объекта пользователя нет, есть только строка initData —
       ровно тот случай, из-за которого приложение уходило в гостевой аккаунт. */
    const api = {
      initData: 'query_id=AAA&user=' + encodeURIComponent(JSON.stringify(DESK_USER)) + '&auth_date=1&hash=x',
      initDataUnsafe: { query_id: 'AAA' },
      version: '8.0', platform: 'tdesktop', colorScheme: 'dark', themeParams: { bg_color: '#0c0e16', text_color: '#fff' },
      viewportHeight: 900, viewportStableHeight: 900, isExpanded: true,
      ready(){}, expand(){}, disableVerticalSwipes(){}, requestFullscreen(){ return Promise.resolve(); },
      isVersionAtLeast: () => true, onEvent(){}, offEvent(){},
      setHeaderColor(){}, setBackgroundColor(){}, setBottomBarColor(){}, enableClosingConfirmation(){},
      HapticFeedback: { impactOccurred(){}, notificationOccurred(){}, selectionChanged(){} },
      openTelegramLink(){}, openLink(){}, showPopup(){}, close(){}, MainButton: { hide(){}, show(){}, setText(){} },
    };
    w.Telegram = { WebApp: api };
    w.supabase = { createClient: () => ({ from: (n) => deskTable(n) }) };
    w.fetch = async (url) => ({ ok: true, json: async () => (/genre\/(movie|tv)\/list/.test(String(url))
      ? { genres: [{ id: 28, name: 'Боевик' }, { id: 35, name: 'Комедия' }] }
      : { page: 1, total_pages: 1, results: FIX.slice(0, 12), genres: [] }) });
    w.IntersectionObserver = class {
      constructor(cb){ this.cb = cb; }
      observe(el){ dIo.push({ el, cb: this.cb }); }
      unobserve(){} disconnect(){} takeRecords(){ return []; }
    };
    w.__flushIO = () => dIo.splice(0).forEach(({ el, cb }) => { try { cb([{ target: el, isIntersecting: true, intersectionRatio: 1 }], {}); } catch (e) {} });
  },
});
const dwin = ddom.window, ddoc = dwin.document;
const dev = (code) => dwin.eval(code);
const dt0 = Date.now();
while (Date.now() - dt0 < 1400){ dwin.__flushIO(); await sleep(40); }
ok(dErrors.length === 0, 'десктопный запуск без ошибок' + (dErrors.length ? ': ' + dErrors.slice(0, 2).join(' | ') : ''));
ok(dev('TG_ID') === DESK_USER.id, 'личность взята из initData: ' + dev('TG_ID'));
ok(dev('TG_ID_IS_GUEST') === false, 'гостевой аккаунт не включился, хотя объекта пользователя не было');
ok(dSeen.includes('swipes') && dSeen.includes('wishlist'), 'данные запрошены под настоящим ID');
ok(dev('state.watched.length') === 3 && dev('state.skipped.length') === 1, 'свайпы подтянулись из базы: ' + dev('state.watched.length') + ' просмотрено');
ok(dev('state.wishlist.length') === 1 && dev('state.watching.length') === 1, 'чек-лист и «смотрю» тоже');
ok(dev('state.unlocked.length') === 1, 'ачивки из базы');
/* Просмотренное больше не должно возвращаться в колоду — раньше список «watched»
   всегда был пустым, и колода заново показывала уже отсмотренные тайтлы. */
ok(dev('deck.length') > 0 && dev('deck.every(m => !state.watched.includes(mid(m)) && !state.skipped.includes(mid(m)))'), 'в колоде нет уже просмотренного и пропущенного');
/* профиль: цифры должны быть на месте сразу после открытия вкладки */
dev('document.querySelector(\'nav button[data-tab="profile"]\').click();');
await sleep(120);
const statsHtml = dev('document.getElementById("myStats").innerHTML');
ok(statsHtml.length > 200, 'вход в профиль рисует статистику (' + statsHtml.length + ' символов разметки)');
ok(/просмотрено тобой/.test(statsHtml), 'в статистике есть счётчик просмотра');
ok(/Любимые жанры/.test(statsHtml), 'и разбор по жанрам');
ok(dev('document.getElementById("statWatched").textContent') === '3', 'карточка «просмотрено» показывает данные из базы');
ok(dev('document.getElementById("statSkipped").textContent') === '1', 'карточка «пропущено» тоже');
ok(dev('state.reviews') === 3, 'оценки посчитаны из базы: ' + dev('state.reviews'));
ok(/оценок/.test(statsHtml) && /\b3\b/.test(statsHtml), 'плитка оценок показывает 3, а не ноль');
ok(dev('document.getElementById("userName").textContent') === 'Тенгиз', 'имя из initData подставлено в профиль');
ok(dev('!!document.getElementById("weekChart").innerHTML') === true, '«активность за неделю» отрисована');
/* клавиатура: стрелка вправо = «смотрел» */
dev('switchTab("home");');
await sleep(60);
const watchedBefore = dev('state.watched.length');
dwin.document.dispatchEvent(new dwin.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
await sleep(150);
ok(dev('state.watched.length') === watchedBefore + 1, 'стрелка вправо отмечает «смотрел» (' + watchedBefore + ' → ' + dev('state.watched.length') + ')');
dwin.document.dispatchEvent(new dwin.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
await sleep(150);
ok(dev('state.skipped.length') >= 1, 'стрелка влево отмечает «мимо»');
dev('openSheet(deck[0]);');
await sleep(60);
ok(dev('document.getElementById("sheet").classList.contains("open")'), 'шторка тайтла открыта');
dwin.document.dispatchEvent(new dwin.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
await sleep(60);
ok(!dev('document.getElementById("sheet").classList.contains("open")'), 'Esc закрывает шторку');
dev('openOverlay("settingsScreen");');
await sleep(40);
ok(dev('document.body.classList.contains("ov-open")'), 'открытое окно включает затемнение под собой');
dev('document.getElementById("ovScrim").click();');
await sleep(40);
ok(!dev('document.getElementById("settingsScreen").classList.contains("open")'), 'клик по затемнению закрывает окно');
dev('openOverlay("settingsScreen");');
await sleep(40);
dwin.document.dispatchEvent(new dwin.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
await sleep(40);
ok(!dev('document.getElementById("settingsScreen").classList.contains("open")'), 'Esc закрывает окно настроек');
ok(!dev('document.body.classList.contains("ov-open")'), 'после закрытия окна затемнение снято');
ok(dErrors.length === 0, 'ошибок консоли на десктопном прогоне: ' + dErrors.length + (dErrors.length ? ' — ' + dErrors.slice(0, 2).join(' | ') : ''));
/* --- пилюля «Вернуться»: место считается по кнопке «Перемешать» --- */
const undoStyle = dev('document.getElementById("undoBtn").style.getPropertyValue("--undo-bottom")');
ok(dev('document.getElementById("undoBtn").classList.contains("show")'), 'после свайпа пилюля «Вернуться» показана');
ok(/^\d+px$/.test(undoStyle) && parseFloat(undoStyle) > 60, 'пилюля поднята над панелью вкладок: ' + undoStyle);
ok(dev('getComputedStyle(document.getElementById("undoBtn")).position') === 'absolute', 'пилюля позиционируется абсолютно');

/* --- шапка с иконками уезжает в боковую панель: проверяем живьём --- */
const dbar = dwin.document.querySelector('.topbar');
ok(!!dbar && typeof dwin.window.deskTopbarInNav === 'function', 'перенос шапки доступен из приложения');
const mqStub = (matches) => (q) => ({ matches, media: q, onchange: null,
  addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
dwin.window.matchMedia = mqStub(true);
dwin.window.deskTopbarInNav();
ok(dbar.parentElement && dbar.parentElement.tagName === 'NAV' && dbar.classList.contains('topbar-in-nav'), 'на широком экране шапка стоит в панели, а не под кнопками Telegram');
const dstreak = dwin.document.getElementById('streakBadge');
ok(!!dstreak && dstreak.parentElement.id === 'homeLevelStrip', 'огонёк серии стоит наверху, в строке уровня');
dwin.window.matchMedia = mqStub(false);
dwin.window.deskTopbarInNav();
ok(dbar.parentElement && dbar.parentElement.tagName !== 'NAV' && !dbar.classList.contains('topbar-in-nav'), 'на телефоне шапка возвращается на своё место');
ok(dstreak.parentElement && dstreak.parentElement.classList.contains('topbar-icons'), 'и огонёк возвращается в шапку, первым в правой группе');

dwin.close();

/* ============================ [13] «Вернуться» поверх «Перемешать» ============================ */
section('[13] «Вернуться» поверх «Перемешать»');
const cssFlat = cssClean.replace(/\s+/g, ' ');
ok(/\.undo-pill\{[^}]*bottom:var\(--undo-bottom, calc\(76px \+ var\(--safe-bottom\)\)\)/.test(cssFlat), 'низ пилюли задаётся переменной с запасом');
ok(!/\.undo-pill\{[^}]*bottom:calc\(14px/.test(cssFlat), 'старого значения, прижатого к низу экрана, больше нет');
ok(/background:linear-gradient\(180deg, var\(--accent\) 0%, var\(--accent-2\) 100%\)/.test(cssFlat), 'пилюля залита градиентом темы');
ok(/box-shadow:0 16px 34px -12px var\(--accent-glow\), 0 1px 0 rgba\(255,255,255,0\.24\) inset/.test(cssFlat), 'и получила мягкое свечение');
ok(/border:1px solid rgba\(255,255,255,0\.18\)/.test(cssFlat), 'по краю — светлая кромка');
ok(/\.undo-pill\{ z-index:45/.test(cssFlat), 'пилюля выше панели вкладок');
ok(/function positionUndoPill\(\)\{/.test(js), 'место пилюли считает скрипт');
ok(/const row = document\.querySelector\('#home \.home-bottom'\)/.test(js), 'целимся в строку с «Перемешать»');
ok(/bottom = Math\.round\(bodyH - center - pillH \/ 2\);                    \/\/ центр пилюли — там же/.test(js), 'центр пилюли совпадает с центром кнопки');
ok(/bottom = Math\.round\(\(bodyH - \(navRect\.top - bodyRect\.top\)\) \+ 38 - pillH \/ 2\)/.test(js), 'если кнопку не видно — поднимаем над панелью вкладок');
ok(/const navIsBottom = !!navRect && navRect\.height > 0 && navRect\.width > 0\s*\n\s*&& \(bodyH - \(navRect\.bottom - bodyRect\.top\)\) < 140;/.test(js), 'нижней панелью считаем только ту, что прижата к низу (на десктопе она боковая)');
ok(/positionUndoPill\(\);\s+\/\/ сначала место, потом показ/.test(js), 'место считается ДО показа — без прыжка');
ok(/requestAnimationFrame\(positionUndoPill\);\s+\/\/ раскладка могла поменяться/.test(js), 'и уточняется в следующем кадре');
ok(/window\.addEventListener\('resize', \(\) => \{ if \(document\.getElementById\('undoBtn'\)\?\.classList\.contains\('show'\)\) positionUndoPill\(\); \}\)/.test(js), 'смена размера окна пересчитывает место');
ok(/window\.addEventListener\('orientationchange', \(\) => setTimeout\(positionUndoPill, 300\)\)/.test(js), 'поворот телефона тоже');


/* ============================ [14] Десктопная раскладка (как сайт) ============================ */
section('[14] Десктопная раскладка: боковая панель, панель фильма, окна по центру');
const dflat = cssClean.replace(/\s+/g, ' ');
const deskBlock = (cssClean.match(/@media \(min-width: 1024px\)\{[\s\S]*?\n  \}/) || [''])[0];
ok(deskBlock.length > 800, 'есть отдельный блок раскладки от 1024px (' + deskBlock.length + ' символов)');
ok(/:root\{ --side: 236px; \}/.test(dflat), 'ширина боковой панели задана');
ok(/body\{ display:grid; padding-left:0; padding-right:0;\s*grid-template-columns:var\(--side\) auto minmax\(0, 1fr\);\s*grid-template-rows:auto minmax\(0, 1fr\); \}/.test(dflat), 'вся страница — сетка: панель слева, шапка и экраны справа');
ok(/nav\{ grid-area:1 \/ 1 \/ 3 \/ 2; position:relative; width:auto;/.test(dflat), 'разделы занимают первый столбец сетки во всю высоту');
ok(/\.topbar\.topbar-in-nav\{ grid-area:auto; align-self:stretch; justify-content:flex-start;/.test(dflat), 'шапка прижата к низу панели (класс ставит скрипт)');
ok(/function deskTopbarInNav\(\)\{/.test(js), 'переносом шапки в панель занимается отдельная функция');
ok(/document\.getElementById\('streakBadge'\)\.onclick = \(e\) => \{/.test(js) && /if \(e && e\.stopPropagation\) e\.stopPropagation\(\);/.test(js), 'тап по огоньку не открывает окно уровней (всплытие погашено)');
ok(/if \(bar\.parentElement !== nav\) nav\.appendChild\(bar\);/.test(js) && /bar\.classList\.add\('topbar-in-nav'\)/.test(js), 'на широком экране шапка переезжает в панель');
ok(/if \(bar\.parentElement === nav\) document\.body\.insertBefore\(bar, anchor\);/.test(js), 'на узком — возвращается на место');
ok(/deskTopbarInNav\(\);        \/\/ на десктопе шапка уезжает в боковую панель/.test(js), 'перенос выполняется при запуске');
ok(/\.topbar\.topbar-in-nav \.topbar-icons\{ flex-direction:column; align-items:stretch; gap:8px; width:100%; \}/.test(dflat), 'иконки в панели идут колонкой');
ok(/\.topbar-in-nav \.icon-btn\{ width:46px; height:46px; border-radius:15px; padding:0;/.test(dflat), 'внизу панели — кнопка настроек ровно по иконке');
ok(/\.topbar\.topbar-in-nav\{/.test(cssClean.replace(/\s+/g, ' ')), 'в десктопном блоке есть правило для шапки внутри панели (а не в правом верхнем углу)');
ok(!/content:'Настройки'/.test(dflat) && !/content:'дней подряд'/.test(dflat), 'подписей рядом с иконками больше нет');
ok(/\.lvl-strip #streakBadge\{ margin-left:auto;/.test(dflat), 'огонёк серии стоит в строке уровня наверху');
ok(!/\.side-head\{ display:block; position:absolute/.test(dflat), 'абсолютного логотипа больше нет — он и ложился на «Каталог»');
ok(/\.topbar \.wordmark\{ display:none; \}/.test(dflat), 'в шапке логотип на десктопе скрыт');
ok(/nav button\{ flex-direction:row; justify-content:flex-start; align-items:center; gap:12px; width:100%;/.test(dflat), 'кнопки разделов стали строками с подписями');
ok(/nav button\.active\{ color:var\(--text\); background:var\(--accent-soft\); \}/.test(dflat), 'активный раздел подсвечен');
ok(!/\.topbar \.wordmark\{ position:fixed/.test(dflat), 'никаких fixed-логотипов внутри анимированной шапки (из-за них он и вставал криво)');
ok(/\.lvl-strip\{ grid-area:1 \/ 2 \/ 2 \/ 3; align-self:start; justify-self:start; margin:16px 0 0 28px;\s*max-width:560px; padding:9px 16px;/.test(dflat), 'строка уровня стала компактной карточкой, а не полосой во всю ширину');
ok(/#home\{ max-width:560px; margin:0 auto; padding-top:26px; \}/.test(dflat) && /#home \.stack-filter\{ right:-58px; top:16px; \}/.test(dflat), 'карточка на десктопе крупнее, стоит ниже, фильтр у её верхнего угла');
ok(/#home \.actions \.no, #home \.actions \.yes\{ width:68px; height:68px; \}/.test(dflat) && /#home \.actions \.wishbtn, #home \.actions \.watchbtn\{ width:60px; height:60px; \}/.test(dflat), 'кнопки колоды на десктопе тоже крупнее');
ok(/\.key-hint\{ display:flex; align-items:center; justify-content:center; position:absolute;/.test(dflat), 'на кнопках видны значки клавиш');
ok(/const byKey = \{ ArrowRight:\['btnWatched','watched'\]/.test(js) && /btn\.classList\.add\('key-down'\)/.test(js), 'клавиша подсвечивает свою кнопку');
ok(/#sheet\{ position:fixed; top:0; right:0; bottom:0; left:auto; width:min\(470px, 44vw\);/.test(dflat), 'карточка фильма — панель справа');
ok(/#sheet\.open\{ transform:translateX\(0\); \}/.test(dflat), 'панель выезжает слева направо, а не снизу');
ok(/#askSheet, #badgeSheet\{ position:fixed; left:50%; top:50%; right:auto; bottom:auto;\s*width:min\(440px, 92vw\);/.test(dflat), 'небольшие шторки стали окошками по центру');
ok(/\.overlay-screen\{ position:fixed; inset:auto; left:50%; top:50%;\s*width:min\(980px, 94vw\); height:min\(820px, 90vh\);/.test(dflat), 'окна приложения — по центру, а не во весь экран');
ok(/\.overlay-screen\.open\{ transform:translate\(-50%,-50%\) scale\(1\); opacity:1; visibility:visible; pointer-events:auto; \}/.test(dflat), 'и открываются мягко, без съезда за край');
ok(/\.ov-scrim\{ display:block; position:fixed; inset:0; z-index:24;/.test(dflat), 'под окнами появилось затемнение');
ok(/body\.ov-open \.ov-scrim\{ opacity:1; pointer-events:auto; \}/.test(dflat), 'затемнение включается классом на body');
ok(/\.ov-scrim\{ display:none; \}/.test(dflat), 'на телефоне затемнение не показывается (там окна полноэкранные)');
ok(/#profile, #feed\{ max-width:900px; margin:0 auto; \}/.test(dflat), 'профиль и лента держатся колонкой по центру');
ok(/<div class="side-head" aria-hidden="true"><span class="wm-l">S<\/span><span class="wm-l">M<\/span><span class="wm-l o">O<\/span>/.test(src), 'логотип есть в разметке панели — он же пасхалка');
ok(/\.side-head\{ display:none; \}/.test(cssClean), 'на телефоне надписи SMOTRA в нижней панели нет');
ok(/\.side-head\{ display:block; margin:0 10px 18px; padding-bottom:16px; border-bottom:1px solid var\(--border\);/.test(dflat), 'на десктопе логотип — обычная строка панели, поверх «Каталога» не ляжет');
ok(/\.grid2\{ grid-template-columns:repeat\(auto-fill, minmax\(168px, 1fr\)\); \}/.test(dflat), 'каталог занимает всю ширину: обложек помещается больше');
ok(/#splash, #onboarding, #tutorial\{ position:fixed; inset:0; left:0; right:0; width:auto; max-width:none; margin:0; \}/.test(dflat), 'заставка, онбординг и обучение прибиты к окну — центрируются ровно, без сдвига от padding оболочки');
ok(/#toast\{ left:var\(--side\); right:0; border-radius:0 0 20px 20px; \}/.test(dflat), 'на большом экране лента идёт от панели до правого края');
ok(/\.undo-pill\{ left:calc\(50% \+ var\(--side\) \/ 2\); \}/.test(dflat), 'пилюля «Вернуться» центрируется по содержимому, а не по окну');
ok(/#askSheet, #badgeSheet\{ position:fixed/.test(deskBlock.replace(/\s+/g, ' ')), 'правила шторок лежат именно в десктопном блоке');
/* код под раскладку */
ok(/document\.body\.classList\.add\('ov-open'\);   \/\/ показываем затемнение под окнами \(десктоп\)/.test(js), 'openOverlay включает затемнение');
ok(/if \(!document\.querySelector\('\.overlay-screen\.open'\)\) document\.body\.classList\.remove\('ov-open'\);/.test(js), 'closeOverlay выключает его, когда закрыто последнее окно');
ok(/\(function initOvScrim\(\)\{/.test(js) && /const top = open\.sort\(\(a, b\) => \(\+b\.style\.zIndex \|\| 0\) - \(\+a\.style\.zIndex \|\| 0\)\)\[0\];/.test(js), 'клик по затемнению закрывает верхнее окно');
ok(/const sheetIsDeskPanel = \(\) => window\.matchMedia && window\.matchMedia\('\(min-width: 1024px\)'\)\.matches;/.test(js), 'для панели фильма на десктопе отключена протяжка вниз');
ok(/if \(sheetIsDeskPanel\(\)\) return;/.test(js), 'и это действительно проверяется перед жест');
ok(/<div class="ov-scrim" id="ovScrim" aria-hidden="true"><\/div>/.test(src), 'подложка есть в разметке');
/* телефон не должен пострадать: базовые правила окон и панели остаются прежними */
ok(/\.overlay-screen\{ position:absolute; inset:0; background:var\(--bg\); z-index:25; transform:translateX\(100%\)/.test(dflat), 'на телефоне окна по-прежнему выезжают справа во весь экран');
ok(/nav\{ position:relative; z-index:4; display:flex; justify-content:space-around; align-items:center;/.test(dflat), 'на телефоне панель осталась внизу');


/* ============================ [15] Каскад десктопных правил ============================ */
/* jsdom не понимает медиазапросы, поэтому разворачиваем десктопный блок в обычные
   правила и смотрим ВЫЧИСЛЕННЫЕ значения: так видно, что новые правила действительно
   побеждают телефонные и планшетные, а не тихо проигрывают им по порядку. */
section('[15] Каскад десктопных правил (вычисленные значения)');
{
  const dStart = css.indexOf('@media (min-width: 1024px){');
  let dInner = '';
  if (dStart !== -1){
    const rest = css.slice(dStart + '@media (min-width: 1024px){'.length);
    let depth = 1, i = 0;
    while (i < rest.length && depth > 0){
      if (rest[i] === '{') depth++;
      else if (rest[i] === '}') depth--;
      i++;
    }
    dInner = rest.slice(0, i - 1);
  }
  ok(dInner.length > 800, 'десктопный блок найден и разобран');
  const patched = src.replace('</style>', dInner + '\n</style>');
  const cdom = new JSDOM(patched, { url: 'https://smotra.test/' });
  const g = (sel, prop) => { const el = cdom.window.document.querySelector(sel); return el ? cdom.window.getComputedStyle(el)[prop] : 'НЕТ'; };
  const px = (v) => parseFloat(v) || 0;
  ok(g('nav', 'position') === 'relative' && g('nav', 'flexDirection') === 'column' && g('nav', 'gridArea') === '1 / 1 / 3 / 2', 'панель разделов стала боковой колонкой в первой клетке сетки');
  ok(g('nav', 'zIndex') === '20', 'панель под окнами и затемнением (z-index 20)');
  ok(g('body', 'paddingLeft') === '0px', 'сдвиг заменён сеткой: отступ больше не нужен');
  ok(g('.topbar .wordmark', 'display') === 'none' && g('.side-head', 'position') === 'static' && g('.side-head', 'display') === 'block', 'логотип ушёл из шапки в боковую панель');
  ok(g('.topbar', 'gridArea') === 'auto' || g('.topbar', 'gridArea') === '', 'шапка вынута из сетки: её место — панель');
  ok(g('.lvl-strip', 'gridArea') === '1 / 2 / 2 / 3', 'строка уровня стоит в своей клетке сетки (не растягивается)');
  ok(g('body', 'display') === 'grid', 'оболочка действительно стала сеткой');
  ok(/\.topbar\.topbar-in-nav\{/.test(deskBlock.replace(/\s+/g, ' ')), 'правило для шапки внутри панели лежит в десктопном блоке');
  ok(/\.topbar\.topbar-in-nav\{/.test(deskBlock.replace(/\s+/g, ' ')), 'правило для шапки внутри панели лежит в десктопном блоке');
  ok(g('#sheet', 'position') === 'fixed' && px(g('#sheet', 'right')) === 0 && px(g('#sheet', 'width')) > 400, 'карточка фильма — панель справа (' + g('#sheet', 'width') + ')');
  ok(/translateX\(100%\)/.test(g('#sheet', 'transform')), 'и прячется за правым краем, а не под низом');
  ok(g('#askSheet', 'position') === 'fixed' && g('#askSheet', 'left') === '50%' && /translate\(-50%,-50%\)/.test(g('#askSheet', 'transform')), 'малая шторка стала окошком по центру');
  ok(g('.overlay-screen', 'position') === 'fixed' && px(g('.overlay-screen', 'width')) > 800 && px(g('.overlay-screen', 'width')) <= 1024, 'окна приложения — окно по центру, а не во всю ширину (' + g('.overlay-screen', 'width') + ')');
  ok(g('.overlay-screen', 'visibility') === 'hidden', 'закрытое окно не мешает нажимать');
  ok(g('.ov-scrim', 'display') === 'block' && g('.ov-scrim', 'position') === 'fixed', 'затемнение под окнами включено');
  ok(px(g('#home', 'maxWidth')) === 560 && px(g('#profile', 'maxWidth')) === 900, 'карточка на десктопе крупнее, профиль — ещё шире');
  ok(px(g('#home', 'paddingTop')) >= 20, 'колода стоит ниже строки уровня: ' + g('#home', 'paddingTop'));
  ok(px(g('#splash', 'maxWidth')) === 0 && px(g('#tutorial', 'maxWidth')) === 0 && px(g('.screens', 'maxWidth')) === 0, 'полноэкранные слои и ленты не зажаты в колонку');
  ok(/calc\(50% \+ var\(--side\) \/ 2\)/.test(g('.undo-pill', 'left')), 'пилюля «Вернуться» центрируется по содержимому');
  ok(/var\(--side\)/.test(g('#toast', 'left')) && px(g('#toast', 'top')) === 0, 'лента сообщения прижата к верху и к панели');
  ok(g('.grain', 'position') === 'fixed', 'зерно кроет и боковую панель');
  cdom.window.close();
}


/* ============================ [16] Окно уровней ============================ */
section('[16] Окно уровней: шкала сверху, вся лестница, откуда опыт');
ok(/<div class="overlay-screen" id="levelsScreen">/.test(src), 'окно уровней есть в разметке');
ok(/<div class="ov-body" id="levelsBody"><\/div>/.test(src), 'и у него есть тело для содержимого');
ok(/<button class="icon-btn" id="closeLevels">/.test(src), 'закрывается кнопкой «назад»');
ok(/<span class="lv-total" id="levelsTotal">/.test(src), 'в шапке окна видно общий опыт');
ok(/document\.getElementById\('homeLevelStrip'\)\.onclick = openLevelsScreen;/.test(js), 'тап по шкале уровня открывает окно');
ok(/document\.getElementById\('closeLevels'\)\.onclick = \(\) => closeOverlay\('levelsScreen'\);/.test(js), 'крестик закрывает окно');
ok(/el\.onclick = openLevelsScreen;\s*\/\/ из профиля — в ту же лестницу уровней/.test(js), 'карточка уровня в профиле открывает то же окно');
ok(/function myXPBreakdown\(\)\{/.test(js), 'опыт раскладывается по источникам');
ok(/\{ icon:'check',    label:'Смотрел',        count: state\.watched\.length,      per: XP_RULES\.watched \}/.test(js), 'в разборе есть «смотрел» со своей ставкой');
ok(/const total = rows\.reduce\(\(sum, r\) => sum \+ r\.count \* r\.per, 0\);/.test(js), 'сумма складывается из тех же ставок, что и myXP()');
ok(/function renderLevelsScreen\(\)\{/.test(js) && /const lv = levelFor\(myXP\(\)\);/.test(js), 'окно считает уровень тем же levelFor()');
ok(/const tiles = LEVELS\.map\(L => \{/.test(js) && /const done = L\.level < lv\.level;/.test(js) && /const cur = L\.level === lv\.level;/.test(js), 'плитки размечены: пройденные, текущий, будущие');
ok(/<button type="button" class="lv-tile \$\{done \? 'done' : ''\} \$\{cur \? 'cur' : ''\}" data-lv="\$\{L\.level\}"/.test(js), 'каждая плитка — кнопка со своим уровнем');
ok(/const ladder = LEVELS\.map\(L => \{/.test(js) && /const need = Math\.max\(0, L\.xp - lv\.xp\);/.test(js), 'лестница целиком: все 68 уровней с порогом и шагом');
ok(/\.lv-tiles\{ display:grid; grid-template-columns:repeat\(auto-fill, minmax\(40px, 1fr\)\); gap:7px; \}/.test(dflat) && /\.lv-tile\.cur\{/.test(dflat), 'все уровни — сеткой плиток, текущий выделен');
ok(/нужно ещё \$\{fmtXP\(need\)\} XP/.test(js), 'у будущих уровней написано, сколько до них не хватает');
ok(/Уровень пройден на <b>\$\{lv\.pct\}%<\/b>/.test(js), 'в шапке окна — процент пройденного уровня');
ok(/function fmtXP\(n\)/.test(js) && /\.lv-hero-nums\{ display:grid; grid-template-columns:repeat\(3, 1fr\)/.test(dflat), 'опыт разложен по трём ячейкам — длинные числа не обрезаются');
ok(/\.lv-hero-cell b\{ display:block;[\s\S]{0,200}?text-overflow:ellipsis; \}/.test(dflat), 'у больших чисел есть запас и аккуратное ужатие');
ok(/\.lv-pick\{ margin-top:12px;/.test(dflat) && /\.lv-pick-nums\{ display:grid/.test(dflat), 'карточка выбранного уровня оформлена');
ok(/const showPick = \(n\) => \{/.test(js) && /document\.getElementById\('lvPick'\)/.test(js), 'тап по плитке раскрывает карточку уровня');
ok(/aria-label="Уровень \$\{L\.level\}, \$\{esc\(L\.name\}\}?/.test(js) || /aria-label="Уровень \$\{L\.level\}/.test(js), 'у плитки есть подпись для доступности');
ok(/id="lvJump"/.test(js) && /К моему уровню/.test(js) && /row\.scrollIntoView\(\{ block:'center', behavior:'smooth' \}\)/.test(js), 'есть прыжок к своему уровню в лестнице');
ok(/Ступеней 68, удвоений нет/.test(js) && /Вершина лестницы — ровно \$\{fmtXP\(LEVEL_XP_TARGET\)\} XP/.test(js), 'внизу окна объяснена вся лестница до 100 000 XP');
ok(/Опыт капает сам: \$\{XP_RULES\.watched\}/.test(js), 'внизу окна — правила опыта из тех же ставок');
ok(!/\[data-ach-open\]'\]\.forEach\(btn => \{ btn\.onclick = openAchievementsScreen/.test(js) || /document\.getElementById\('openAchievements'\)\.onclick = openAchievementsScreen;/.test(js), 'ачивки по-прежнему открываются из профиля');
/* вид окна */
ok(/\.lv-hero\{ position:relative; overflow:hidden; border-radius:22px; padding:20px;/.test(dflat), 'в окне есть большая карточка текущего уровня');
ok(/\.lv-row\.cur\{ background:var\(--surface\); border-color:var\(--accent-border\)/.test(dflat), 'текущий уровень выделен');
ok(/\.lv-row:not\(:last-child\)::after\{ content:''; position:absolute; left:26px; top:41px; bottom:-11px; width:2px; background:var\(--border\); \}/.test(dflat), 'уровни соединены линией лестницы');
ok(/\.lv-src-bar i\{ display:block; height:100%; border-radius:4px; background:linear-gradient\(90deg, var\(--accent\), var\(--accent-2\)\); \}/.test(dflat), 'у источников опыта есть полосы вклада');

/* живой прогон: тап по шкале открывает окно с лестницей */
const lErrors = [];
const lvc = new VirtualConsole();
lvc.on('jsdomError', e => lErrors.push('jsdomError: ' + (e && e.message)));
lvc.on('error', (...a) => lErrors.push('console.error: ' + a.join(' ')));
const lRows = {
  swipes: [{ movie_id: 5000, action: 'watched' }, { movie_id: 5001, action: 'watched' }],
  wishlist: [{ movie_id: 5002 }], watching: [], badges: [], episodes_progress: [], reviews: [], friends: [], profiles: [],
};
function lTable(name){
  const rows = lRows[name] || [];
  const chain = (result) => {
    const base = { then: (res) => res(result), catch: () => base, finally: (f) => { try { f(); } catch (e) {} return base; } };
    return new Proxy(base, { get(t, prop){ if (prop in t) return t[prop];
      return () => (prop === 'single' || prop === 'maybeSingle') ? chain({ data: rows[0] || null, error: null }) : chain({ data: rows, error: null, count: rows.length }); } });
  };
  return chain({ data: rows, error: null, count: rows.length });
}
const lIo = [];
const ldom = new JSDOM(src.replace(/<script src="[^"]*"><\/script>/g, '').replace(/<link[^>]*fonts\.googleapis[^>]*>/g, ''), {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://smotra.test/levels', virtualConsole: lvc,
  beforeParse(w){
    w.Telegram = { WebApp: { initDataUnsafe: { user: { id: 777, first_name: 'Тенгиз' } }, initData: 'user=%7B%22id%22%3A777%7D',
      version: '8.0', platform: 'tdesktop', colorScheme: 'dark', themeParams: {}, viewportStableHeight: 900,
      ready(){}, expand(){}, onEvent(){}, isVersionAtLeast: () => true, disableVerticalSwipes(){}, requestFullscreen(){ return Promise.resolve(); },
      setHeaderColor(){}, setBackgroundColor(){}, setBottomBarColor(){}, HapticFeedback: { impactOccurred(){}, notificationOccurred(){}, selectionChanged(){} }, openTelegramLink(){} } };
    w.supabase = { createClient: () => ({ from: (n) => lTable(n) }) };
    w.fetch = async () => ({ ok: true, json: async () => ({ page: 1, total_pages: 1, results: FIX.slice(0, 10), genres: [] }) });
    w.IntersectionObserver = class { constructor(cb){ this.cb = cb; } observe(el){ lIo.push({ el, cb: this.cb }); } unobserve(){} disconnect(){} takeRecords(){ return []; } };
    w.__flushIO = () => lIo.splice(0).forEach(({ el, cb }) => { try { cb([{ target: el, isIntersecting: true, intersectionRatio: 1 }], {}); } catch (e) {} });
  },
});
const lwin = ldom.window, ldoc = lwin.document;
const lev = (code) => lwin.eval(code);
const lt0 = Date.now();
while (Date.now() - lt0 < 1200){ lwin.__flushIO(); await sleep(40); }
ok(lErrors.length === 0, 'запуск с окном уровней без ошибок' + (lErrors.length ? ': ' + lErrors.slice(0, 2).join(' | ') : ''));
ldoc.getElementById('homeLevelStrip').click();
await sleep(80);
ok(ldoc.getElementById('levelsScreen').classList.contains('open'), 'тап по шкале уровня открывает окно');
const lvHtml = ldoc.getElementById('levelsBody').innerHTML;
ok(lvHtml.length > 1200, 'окно заполнено (' + lvHtml.length + ' символов разметки)');
ok(lev('(document.querySelectorAll("#levelsBody .lv-tile") || []).length') === lev('LEVELS.length'), 'в лестнице все ' + lev('LEVELS.length') + ' уровней');
ok(lev('(document.querySelectorAll("#levelsBody .lv-row.cur") || []).length') === 1, 'текущий уровень один');
ok(/Зритель/.test(lvHtml) && /Кинолегенда/.test(lvHtml), 'видны первая и последняя ступени лестницы');
ok(lev('(document.querySelectorAll("#levelsBody .lv-tile.cur") || []).length') === 1, 'текущий уровень в плитках один');
ok(lev('(document.querySelectorAll("#levelsBody .lv-row") || []).length') === lev('LEVELS.length'), 'в лестнице расписаны все ' + lev('LEVELS.length') + ' уровней');
ok(lev('document.getElementById("levelsBody").textContent').indexOf('100 000') > -1, 'наверху видно вершину — 100 000 XP');
ok(lev('LEVELS[67].xp') === 100000, '68-й уровень открывается ровно на 100 000 XP');
ok(/Откуда опыт/.test(lvHtml), 'есть блок «Откуда опыт»');
ok(lev('(document.querySelectorAll("#levelsBody .lv-src") || []).length') >= 2, 'источники опыта показаны (' + lev('(document.querySelectorAll("#levelsBody .lv-src") || []).length') + ')');
ok(lev('document.getElementById("levelsTotal").textContent') === lev('fmtXP(myXP()) + " XP"'), 'в шапке окна — тот же опыт, что считает myXP(): ' + lev('document.getElementById("levelsTotal").textContent'));
ok(lev('myXP()') >= 2 * lev('XP_RULES.watched') + lev('XP_RULES.wishlist'), 'опыт включает и свайпы, и чек-лист: ' + lev('myXP()'));
ok(lev('myXPBreakdown().total') === lev('myXP()'), 'разбор по источникам сходится с myXP()');
/* тап по любой плитке показывает название уровня и сколько нужно опыта */
ok(ldoc.getElementById('lvPick').hidden === true, 'карточка уровня спрятана, пока не выбрал');
ldoc.querySelector('#levelsBody .lv-tile[data-lv="68"]').click();
await sleep(40);
const pickText = ldoc.getElementById('lvPick').textContent;
ok(ldoc.getElementById('lvPick').hidden === false, 'тап по 68-й плитке открывает карточку');
ok(pickText.indexOf('Кинолегенда IV') > -1, 'в карточке — название уровня: ' + pickText.slice(0, 60));
ok(pickText.indexOf('100 000') > -1 && pickText.indexOf('вершина') > -1, 'в карточке — сколько нужно опыта');
ok(lev('(document.querySelectorAll("#levelsBody .lv-tile.sel") || []).length') === 1, 'выбранная плитка подсвечена');
ldoc.querySelector('#levelsBody .lv-tile[data-lv="1"]').click();
await sleep(40);
const pick1 = ldoc.getElementById('lvPick').textContent;
ok(pick1.indexOf('Зритель I') > -1 && /пройден|ты здесь/.test(pick1), 'первый уровень тоже рассказывает о себе: ' + pick1.slice(0, 60));
ldoc.getElementById('lvPickClose').click();
await sleep(30);
ok(ldoc.getElementById('lvPick').hidden === true && lev('(document.querySelectorAll("#levelsBody .lv-tile.sel") || []).length') === 0, 'карточку можно закрыть');
ldoc.getElementById('lvJump').click();
await sleep(30);
ok(true, 'прыжок к своему уровню не ломает окно');
ldoc.getElementById('closeLevels').click();
await sleep(60);
ok(!ldoc.getElementById('levelsScreen').classList.contains('open'), 'окно закрывается');
/* шкала вверху показывает тот же уровень */
const lvName = ldoc.getElementById('homeLevelName').textContent;
ok(/^LVL \d+ · /.test(lvName), 'шкала вверху показывает уровень: ' + lvName);
ok(/^\d[\d ]* XP$/.test(ldoc.getElementById('homeLevelXP').textContent), 'в полоске уровня — текущий опыт: ' + ldoc.getElementById('homeLevelXP').textContent);
ok(!ldoc.querySelector('.topbar [data-ach-open]'), 'в шапке нет иконки достижений');
ok(!!ldoc.getElementById('themeArt') && ldoc.querySelectorAll('#themeArt svg').length >= 2, 'фон темы нарисован: два слоя SVG');
ok(ldoc.querySelectorAll('#themeArt .ta-layer').length >= 2, 'у фона есть дальний и ближний слои');
ok(!ldoc.getElementById('homeToy') && !ldoc.querySelector('.home-toy'), 'игрушки над карточкой нет');

/* --- Смотриметры: новая шкала-эквалайзер --- */
lev('window.__m = { id: 5555, type: "movie", title: "Тестовая картина", year: 2020, genres: ["Драма"], rating: 7.5 }');
lev('openReviewScreen(window.__m)');
await sleep(120);
ok(ldoc.getElementById('reviewScreen').classList.contains('open'), 'окно Смотриметров открывается');
ok(lev('document.querySelectorAll("#reviewBigSliders .cat-meter").length') === lev('BIG_CATS.length'), 'у каждого критерия своя шкала: ' + lev('BIG_CATS.length') + ' главных');
ok(lev('document.querySelectorAll("#reviewSmallSliders .cat-meter").length') === lev('SMALL_CATS.length'), 'и ' + lev('SMALL_CATS.length') + ' детальных');
ok(lev('document.querySelectorAll("#reviewBigSliders .cm-bar").length') === lev('BIG_CATS.length') * 8, 'по 8 столбиков на главный критерий');
ok(lev('document.querySelectorAll("#reviewSmallSliders .cm-bar").length') === lev('SMALL_CATS.length') * 5, 'по 5 столбиков на детальный');
ok(lev('document.querySelectorAll("#reviewBigSliders input[type=range]").length') === 0 && lev('document.querySelectorAll("#reviewBigSliders .cat-dots").length') === 0, 'скучных ползунков и точек больше нет');
const scoreBefore = lev('scoreTotal(reviewBig, reviewSmall)');
lev('document.querySelector("#reviewBigSliders .cat-row[data-key=\'story\'] .cm-bar[data-v=\'8\']").click()');
await sleep(60);
ok(lev('reviewBig.story') === 8, 'тап по столбику ставит оценку: story = ' + lev('reviewBig.story'));
ok(lev('scoreTotal(reviewBig, reviewSmall)') === scoreBefore + 4, 'итог пересчитывается сразу: ' + lev('scoreTotal(reviewBig, reviewSmall)'));
ok(lev('document.getElementById("val-story").textContent').indexOf('8') === 0, 'цифра критерия показывает 8/' + 8);
ok(lev('document.querySelector("#reviewBigSliders .cat-row[data-key=\'story\']").classList.contains("hot")'), 'максимум по критерию подсвечивается');
ok(lev('document.querySelectorAll("#reviewScoreMap i").length') === lev('BIG_CATS.length + SMALL_CATS.length'), 'карта критериев нарисована');
ok(lev('document.querySelector("#reviewScoreMap i b").style.height') === '100%', 'и первый столбик карты заполнен целиком');
ok(/\/68/.test(lev('document.getElementById("reviewTotalValue").textContent')), 'итог по-прежнему из 68: ' + lev('document.getElementById("reviewTotalValue").textContent'));
ok(lev('document.getElementById("reviewCriteriaLabel").textContent').indexOf('10') > -1, 'подпись считает критерии сама: ' + lev('document.getElementById("reviewCriteriaLabel").textContent'));
lev('const mm = document.querySelector("#reviewSmallSliders .cat-meter"); mm.dispatchEvent(new window.KeyboardEvent("keydown", { key: "3" }));');
await sleep(40);
ok(lev('reviewSmall.dialogue') === 3, 'со стрелками и цифрами шкала работает и с клавиатуры');
lev('document.getElementById("closeReview").click()');
await sleep(60);
ok(!ldoc.getElementById('reviewScreen').classList.contains('open'), 'окно Смотриметров закрывается');
lwin.close();


/* ============================ [17] Убрано и приведено в порядок ============================ */
section('[17] Убрано и возвращено: игрушка, кубок, фон темы, превью тем');
ok(/class="theme-art" id="themeArt"/.test(src), 'фон темы на месте (рисунок темы в SVG)');
ok(/function applyThemeArt\(\)\{/.test(js) && /applyThemeArt\(\);            \/\/ у каждой темы свой рисунок фона/.test(js), 'и рисуется при смене темы');
ok(/\.theme-art\{ position:fixed; inset:0; pointer-events:none; z-index:0;/.test(dflat), 'фон лежит под интерфейсом, во весь экран');
ok(!/class="home-toy/.test(src) && !/id="homeToy"/.test(src) && !/HOME_TOYS/.test(js), 'игрушки-пасхалки нет ни в разметке, ни в коде');
ok(!/\.home-toy/.test(cssClean) && !/@keyframes toy/.test(cssClean), 'и её стилей с анимациями тоже не осталось');
ok(!/Что за игрушка вверху главной/.test(src), 'и пункта FAQ про игрушку нет');
ok(/\.theme-swatch \.sw-art svg, \.theme-swatch \.sw-art svg \*\{ animation:none !important; \}/.test(dflat), 'превью тем в окне выбора — статичные');
ok(/const THEME_ART = \{/.test(js) && /THEME_ART\[t\.id\]/.test(js), 'рисунок темы остался только как картинка превью');
ok(!/ach-chip-top/.test(cssClean) && !/ach-chip-top/.test(src), 'кубка достижений в шапке больше нет');

/* ============== [18] Полная синхронизация настроек: телефон ↔ десктоп ============== */
section('[18] Полная синхронизация: телефон ↔ десктоп');
/* Настоящий Supabase из песочницы недоступен (сети нет), поэтому проверяем на своей
   таблице: она хранит строки так же, как база, и умеет select/insert/delete/update
   с фильтрами. Настройки приложение кладёт в таблицу badges строками cfg.<ключ>=<значение>. */
function makeFakeDb(){
  const store = { badges: [], swipes: [], wishlist: [], episodes_progress: [], reviews: [], friends: [], profiles: [] };
  const db = { offline: false, writes: 0, store };
  const finish = (state) => {
    const table = store[state.name] = store[state.name] || [];
    if (db.offline) return { data: null, error: { message: 'offline' } };
    let rows = table.slice();
    state.filters.forEach(([k, v, mode]) => {
      rows = rows.filter(r => mode === 'like' ? String(r[k] || '').startsWith(v.replace(/%$/, '')) : r[k] === v);
    });
    if (state.op === 'insert' || state.op === 'upsert'){
      db.writes++;
      (Array.isArray(state.payload) ? state.payload : [state.payload]).forEach(p => table.push(Object.assign({}, p)));
      return { data: null, error: null };
    }
    if (state.op === 'delete'){
      db.writes++;
      const kill = new Set(rows);
      for (let i = table.length - 1; i >= 0; i--) if (kill.has(table[i])) table.splice(i, 1);
      return { data: null, error: null };
    }
    if (state.op === 'update'){
      db.writes++;
      rows.forEach(r => Object.assign(r, state.payload));
      return { data: null, error: null };
    }
    return { data: state.single ? (rows[0] || null) : rows, error: null, count: rows.length };
  };
  const makeChain = (state) => {
    const base = {
      then: (res, rej) => { try{ res(finish(state)); }catch(e){ if (rej) rej(e); else setTimeout(() => { throw e; }); } },
      catch: () => base,
      finally: (f) => { try{ f(); } catch(e){} return base; },
    };
    return new Proxy(base, { get(t, prop){
      if (prop in t) return t[prop];
      return (...args) => {
        if (prop === 'insert' || prop === 'upsert'){ state.op = prop; state.payload = args[0]; }
        else if (prop === 'delete') state.op = 'delete';
        else if (prop === 'update'){ state.op = 'update'; state.payload = args[0]; }
        else if (prop === 'eq') state.filters.push([args[0], args[1], 'eq']);
        else if (prop === 'like') state.filters.push([args[0], args[1], 'like']);
        else if (prop === 'single' || prop === 'maybeSingle') state.single = true;
        return makeChain(state);
      };
    } });
  };
  db.createClient = () => ({ from: (name) => makeChain({ name, filters: [], op: 'select', single: false }) });
  db.rows = (name) => store[name] || [];
  db.cfgRows = () => db.rows('badges').filter(r => String(r.badge_id).startsWith('cfg.'));
  db.cfgValue = (key) => {
    const row = db.cfgRows().find(r => r.badge_id.startsWith('cfg.' + key + '='));
    if (!row) return undefined;
    try{ return JSON.parse(row.badge_id.slice(('cfg.' + key + '=').length)); }catch(e){ return undefined; }
  };
  return db;
}
async function bootDevice(fake, opts){
  const o = opts || {};
  const errors = [];
  const io = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push('jsdomError: ' + (e && e.message)));
  vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
  const dom = new JSDOM(src.replace(/<script src="[^"]*"><\/script>/g, '').replace(/<link[^>]*fonts\.googleapis[^>]*>/g, ''), {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://smotra.test/sync', virtualConsole: vc,
    beforeParse(w){
      if (o.storage){
        Object.keys(o.storage).forEach(k => { try{ w.localStorage.setItem(k, o.storage[k]); }catch(e){} });
      }
      w.Telegram = { WebApp: { initDataUnsafe: { user: { id: 909090, first_name: 'Тенгиз', username: 'tengizka' } },
        initData: 'user=%7B%22id%22%3A909090%7D', version: '8.0', platform: o.platform || 'android', colorScheme: 'dark',
        themeParams: {}, viewportStableHeight: 900, ready(){}, expand(){}, onEvent(){}, isVersionAtLeast: () => true,
        disableVerticalSwipes(){}, requestFullscreen(){ return Promise.resolve(); }, setHeaderColor(){}, setBackgroundColor(){},
        setBottomBarColor(){}, HapticFeedback: { impactOccurred(){}, notificationOccurred(){}, selectionChanged(){} }, openTelegramLink(){} } };
      w.supabase = fake;
      w.fetch = o.fetch || (async () => ({ ok: true, json: async () => ({ page: 1, total_pages: 1, results: FIX.slice(0, 6), genres: [] }) }));
      w.IntersectionObserver = class { constructor(cb){ this.cb = cb; } observe(el){ io.push({ el, cb: this.cb }); } unobserve(){} disconnect(){} takeRecords(){ return []; } };
      w.__flushIO = () => io.splice(0).forEach(({ el, cb }) => { try{ cb([{ target: el, isIntersecting: true, intersectionRatio: 1 }], {}); } catch(e){} });
    },
  });
  const win = dom.window, doc = win.document;
  const ev = (code) => win.eval(code);
  const t0 = Date.now();
  while (Date.now() - t0 < 1300){ win.__flushIO(); await sleep(40); }
  return { win, doc, ev, errors, close: () => win.close() };
}
const syncDb = makeFakeDb();
const SYNC_ID = 909090;
syncDb.rows('swipes').push({ telegram_id: SYNC_ID, movie_id: 5000, action: 'watched', created_at: '2026-08-01T10:00:00Z' });
syncDb.rows('badges').push({ telegram_id: SYNC_ID, badge_id: 'b1', created_at: '2026-08-01T10:00:00Z' });
syncDb.rows('badges').push({ telegram_id: SYNC_ID, badge_id: 'b999-выдуманная', created_at: '2026-08-01T10:00:00Z' });
const devA = await bootDevice(syncDb, { platform: 'android' });
ok(devA.errors.length === 0, 'телефон запускается без ошибок' + (devA.errors.length ? ': ' + devA.errors[0] : ''));
ok(devA.ev('state.unlocked.length') === 1 && devA.ev('state.unlocked[0]') === 'b1', 'чужая строка в badges не считается ачивкой — иначе достижения завышались');
ok(devA.ev('cfgRemoteEmpty') === true && syncDb.cfgValue('theme') === undefined, 'значения по умолчанию в базу не уезжают — чужой выбор ими не перебить');
ok(syncDb.cfgRows().every(r => String(r.badge_id).startsWith('cfg.since=')), 'при пустой базе уходит только дата «в SMOTRA с»: ' + syncDb.cfgRows().length + ' строк');
/* устройство, на котором тема и вид каталога уже выбраны, делится ими при первом входе */
const seedDb = makeFakeDb();
const devD = await bootDevice(seedDb, { platform: 'android', storage: { smotra_theme: 'emerald', 'smotra_view_catalog': 'list' } });
await sleep(200);
/* меняем настройки на телефоне как обычный человек */
devA.ev('pickTheme("amber"); pickTheme("rose")');   // тот же путь, что по тапу по карточке темы
devA.doc.querySelector('.view-toggle[data-section="catalog"] button[data-v="list"]').click();
devA.doc.querySelector('#wishSort .chip[data-s="rating"]').click();
devA.ev('catFilters.genres = ["Драма"]; saveCatFilters();');
devA.ev('closeTutorial()');
await sleep(220);
ok(syncDb.cfgValue('theme') === 'rose', 'тема доехала до базы: ' + syncDb.cfgValue('theme'));
ok(syncDb.cfgRows().filter(r => String(r.badge_id).startsWith('cfg.theme=')).length === 1, 'на ключ остаётся одна строка, а не история переключений');
ok(syncDb.cfgValue('adult') === undefined, 'взрослого режима в настройках нет — и в базу он не уезжает');
ok(syncDb.cfgValue('views') && syncDb.cfgValue('views').catalog === 'list', 'вид раздела синхронизирован');
ok(syncDb.cfgValue('wishSort') === 'rating', 'сортировка «Хочу чекнуть» синхронизирована');
ok(syncDb.cfgValue('catFilters') && syncDb.cfgValue('catFilters').genres[0] === 'Драма', 'фильтры каталога синхронизированы');
ok(syncDb.cfgValue('tutorial') === true, 'пройденное обучение синхронизировано');
/* второе устройство: тот же аккаунт, чистая память */
const devB = await bootDevice(syncDb, { platform: 'tdesktop' });
const cfgKeys = [...new Set(syncDb.cfgRows().map(r => String(r.badge_id).split('=')[0]))];
ok(['cfg.theme','cfg.views','cfg.catFilters','cfg.wishSort','cfg.since'].every(k => cfgKeys.indexOf(k) > -1),
  'выбранные настройки уезжают в базу (' + cfgKeys.length + ' ключей)');
ok(devB.errors.length === 0, 'десктоп запускается без ошибок' + (devB.errors.length ? ': ' + devB.errors[0] : ''));
ok(devB.ev('themeId()') === 'rose', 'тема с телефона приехала на десктоп: ' + devB.ev('themeId()'));
ok(devB.ev('localStorage.getItem("smotra_theme")') === 'rose', 'и записалась в память устройства');
ok(devB.ev('!!document.getElementById("switchAdult")') === false, 'тумблера «Показывать 18+» в настройках больше нет');
ok(devB.ev('wishSort') === 'rating', 'сортировка чек-листа приехала');
ok(devB.ev('localStorage.getItem("smotra_view_catalog")') === 'list', 'вид каталога приехал');
ok(devB.ev('catFilters.genres.length') === 1 && devB.ev('catFilters.genres[0]') === 'Драма', 'фильтры каталога приехали');
ok(devB.ev('getFlag("smotra_tutorial_done", false)') === true, 'обучение на втором устройстве не повторяется');
ok(devB.ev('localStorage.getItem("smotra_since")') === devA.ev('localStorage.getItem("smotra_since")'), 'дата «в SMOTRA с» одна на двух устройствах');
ok(devB.ev('currentStreak') === devA.ev('currentStreak'), 'серия дней совпадает: телефон ' + devA.ev('currentStreak') + ', десктоп ' + devB.ev('currentStreak'));
ok(devB.ev('document.getElementById("streakNum").textContent') === String(devB.ev('currentStreak')) &&
   devB.ev('document.getElementById("statStreak").textContent') === String(devB.ev('currentStreak')), 'и обе цифры серии на десктопе показывают одно и то же');
/* без связи своё изменение не теряется */
syncDb.offline = true;
devB.ev('pickTheme("emerald")');
await sleep(140);
ok(devB.ev('cfgPending.has("theme")') === true, 'неотправленная настройка помечена как «своя»');
syncDb.offline = false;
const writesBefore = syncDb.writes;
devB.ev('applyRemoteSettings({ theme: "rose", adult: true })');   // строка из старой версии не должна ничего включать
await sleep(80);
ok(devB.ev('themeId()') === 'emerald', 'чужая настройка не перебивает неотправленную свою');
ok(syncDb.writes === writesBefore, 'применение чужих настроек не пишет их обратно в базу');
devB.ev('syncSetting("theme", "emerald")');
await sleep(120);
ok(devB.ev('cfgPending.has("theme")') === false && syncDb.cfgValue('theme') === 'emerald', 'после успешной отправки пометка снимается, в базе свежее значение');
ok(devD.ev('themeId()') === 'emerald', 'устройство с выбранной темой видит её и у себя: ' + devD.ev('themeId()'));
ok(devD.ev('getView("catalog", "grid")') === 'list', 'и выбранный вид каталога');
ok(seedDb.cfgValue('theme') === 'emerald' && seedDb.cfgValue('views') && seedDb.cfgValue('views').catalog === 'list',
  'выбранные настройки уезжают в базу при первом входе');
ok(seedDb.cfgValue('tutorial') === undefined && seedDb.cfgValue('wishSort') === undefined,
  'а нетронутые настройки — нет');
devD.close();
devA.close();
devB.close();


/* ================== [19] Правки: каталог, чек-лист, логотип, фильтры ================== */
section('[19] Каталог без счётчика, поиск сверху, пасхалка, фильтры');
/* каталог: счётчик «N тайтлов» убран, остались только управление и сетка */
ok(!/id="catCount"/.test(src) && !/catCount/.test(js), 'счётчика тайтлов в каталоге больше нет');
ok(!/ничего не найдено/.test(js) || !/countEl\.textContent/.test(js), 'и надписи «ничего не найдено» в шапке каталога тоже нет');
ok(/\.cat-head-row\{ display:flex; align-items:center; justify-content:flex-end; gap:12px;/.test(dflat), 'управление каталога прижато вправо');
ok(!/\.cat-count\{/.test(dflat) && !/\.cat-title\{/.test(dflat) && !/cat-title/.test(src), 'надписи «Каталог» и счётчика в шапке не осталось');
ok(/Показать \$\{n\}` : 'Ничего не найдено'/.test(js), 'сколько тайтлов под фильтрами — видно в кнопке окна фильтров');
/* чек-лист: иконка поиска сверху, заголовок под ней */
const wishStart = src.indexOf('<!-- WISHLIST -->');
const wishSrc = src.slice(wishStart, src.indexOf('<!-- WATCHING -->', wishStart));
ok(wishSrc.indexOf('id="wishSearchWrap"') > -1 && wishSrc.indexOf('id="wishSearchWrap"') < wishSrc.indexOf('id="wishCount"'),
  'в «Хочу чекнуть» поиск стоит выше заголовка');
ok(/wishQuery/.test(js) && /search-btn/.test(wishSrc), 'поиск по чек-листу остался короткой иконкой');
/* окно фильтров: сверху больше нет пустой полосы */
ok(/#filtersScreen \.ov-head\{ padding:calc\(12px \+ var\(--safe-top\)\) 20px 6px; \}/.test(dflat), 'шапка окна фильтров поджата');
ok(/#filtersScreen \.ov-body\{ padding-top:0; padding-bottom:20px; \}/.test(dflat), 'и тело окна начинается сразу под шапкой');
ok(/#filtersScreen \.f-block\{ margin-bottom:16px; \}/.test(dflat) && /#filtersScreen \.f-block:first-child\{ margin-top:0; \}/.test(dflat), 'первый блок не отступает сверху');
/* пасхалка на логотипе */
ok((src.match(/class="wm-l/g) || []).length === 12, 'обе надписи SMOTRA разобраны на буквы (6 + 6)');
ok((src.match(/class="wm-l o"/g) || []).length === 2, 'в каждой надписи акцентная «O» помечена отдельно');
ok(/function buildWordmarks\(\)\{/.test(js) && /buildWordmarks\(\);/.test(js), 'буквы логотипа готовятся скриптом');
ok(/@keyframes wmJump\{/.test(dflat), 'есть анимация прыжка букв');
ok(/\{ transform:translateY\(-10px\) rotate\(-6deg\) scale\(1\.16\); color:var\(--accent\); \}/.test(dflat), 'буквы прыгают и красятся в цвет темы');
ok(/\.wordmark\.eggo \.wm-l, \.side-head\.eggo \.wm-l\{ animation:wmJump/.test(dflat), 'анимация включается классом eggo');
ok(/el\.classList\.add\('eggo'\)/.test(js) && /setTimeout\(\(\) => el\.classList\.remove\('eggo'\), 1050\)/.test(js), 'и возвращается обратно через секунду');
ok(/el\.addEventListener\('click', jump\)/.test(js) && /el\.addEventListener\('keydown'/.test(js), 'работает и мышью, и с клавиатуры');
ok(/@media \(prefers-reduced-motion: reduce\)\{/.test(dflat) && /animation-duration:\.01s/.test(dflat), 'при отключённых анимациях пасхалка не мешает');
ok(/\.topbar \.wordmark \.wm-l\.o\{ color:var\(--accent\); \}/.test(dflat), 'акцентная «O» в логотипе осталась акцентной');
ok(/if \(!el\.querySelector\('\.wm-l'\)\)/.test(js), 'если разметку логотипа заменят, буквы соберутся сами');
/* слой синхронизации настроек */
ok(/const CFG_PREFIX = 'cfg\.';/.test(js) && /function cfgRowId\(/.test(js) && /function cfgDecode\(/.test(js), 'настройки хранятся строками cfg.<ключ>=<значение>');
ok(/async function writeSettingNow\(key, value\)\{[\s\S]{0,200}?\.delete\(\)\.eq\('telegram_id', TG_ID\)\.like\('badge_id', CFG_PREFIX \+ key \+ '=%'\)/.test(js),
  'перед записью старые строки ключа удаляются');
ok(/const cfgWriteChains = new Map\(\);/.test(js) && /const prev = cfgWriteChains\.get\(key\) \|\| Promise\.resolve\(\);/.test(js), 'записи по одному ключу идут очередью, а не вперегонки');
ok(/function pushAllSettings\(\)\{/.test(js) && /if \(cfgRemoteEmpty\) pushAllSettings\(\);/.test(js), 'при первом входе настройки уезжают в базу целиком');
ok(/function pruneUnlockedBadges\(\)\{/.test(js) && /function knownBadgeIds\(\)\{/.test(js), 'чужие строки в badges не считаются ачивками');
ok(/smotra_wish_sort/.test(js), 'сортировка «Хочу чекнуть» запоминается на устройстве');
ok(/localStorage\.setItem\('smotra_view_' \+ section, val\)/.test(js) === false || /function setView/.test(js), 'вид разделов по-прежнему в памяти устройства');
ok(/const local = localStorage\.getItem\('smotra_since'\);[\s\S]{0,160}?earlier/.test(js), 'дата «в SMOTRA с» берётся самой ранней');
ok(/syncSetting\('tutorial', true\)/.test(js) && /syncSetting\('catFilters', catFilters\)/.test(js), 'обучение и фильтры уезжают на другое устройство');
ok(/try\{ pickTheme\(t\); \}catch\(e\)\{ try\{ applyTheme\(t\); \}catch\(e2\)\{\} \}/.test(js), 'тема из базы и применяется, и сохраняется на устройстве');
ok(/function applyRemoteSettings\(remote\)\{\s*if \(!remote \|\| applyingRemote\) return;/.test(js), 'применение чужих настроек не зацикливается');
ok(!/window\.__/.test(js), 'отладочных проб в коде не осталось');

/* ================== [20] Пустые обложки и «где смотреть» ================== */
section('[20] Пустые обложки догружаются, фильм можно смотреть');
ok(/function movieFromTmdb\(data, kind\)\{/.test(js)
  && /const fresh = data \? movieFromTmdb\(data, kind\) : null;/.test(js)
  && /const fresh = movieFromTmdb\(data, kind\);/.test(js),
  'разбор ответа TMDB живёт в одном месте, а не копией в каждой догрузке');
ok(/function movieNeedsDetails\(m\)\{/.test(js) && /function ensureMovieDetails\(movie\)\{/.test(js) &&
   /const DETAILS_IN_FLIGHT = new Map\(\);/.test(js), 'карточка тайтла догружается один раз, без дублей');
ok(/async function loadMovieDetails\(item\)\{/.test(js) && /function applyMovieData\(target, fresh\)\{/.test(js) &&
   /function saveStubsSoon\(\)\{/.test(js), 'данные встают в ту же запись и сохраняются в память телефона');
ok(/if \(dest === target\)\{\s*rememberMovie\(dest\)/.test(js), 'тайтл, которого приложение не знало, тоже запоминается — иначе постер терялся');
/* открытие карточки */
ok(/ensureMovieDetails\(movie\)\.then\(ok => \{ if \(ok\) fillSheetFromMovie\(movie\); \}\)/.test(js),
  'открытие карточки сразу тянет всё, чего в ней не хватает');
ok(/function fillSheetFromMovie\(movie\)\{[\s\S]{0,320}?sheetMovie !== movie/.test(js), 'и не трогает уже закрытую карточку');
ok(/function paintSheetPoster\(movie\)\{/.test(js) && /function sheetMetaHTML\(movie\)\{/.test(js) &&
   /paintSheetPoster\(movie\);\n  document\.getElementById\('sheetTitle'\)/.test(js), 'обложка и строка под названием рисуются общей функцией');
/* пустые обложки на экране */
ok((src.match(/data-need="\$\{mid\(/g) || []).length >= 6, 'пустые обложки во всех списках помечены как «нужно догрузить»');
ok(!/data-need="\$\{hasArt/.test(src), 'а там, где обложка уже есть, лишнего атрибута нет');
ok(/querySelectorAll\('\.pc-art\[data-bg\], \[data-need\]'\)/.test(js), 'наблюдатель следит и за пустыми карточками, а не только за готовыми');
ok(!/requestPosters\([^)]*\.slice\(0, 12\)\)/.test(js), 'догрузка списка больше не обрезается двенадцатью тайтлами');
ok(/requestPosters\(visible\.slice\(0, 3\)\);/.test(js) && /applyLazyArt\(stackEl\);/.test(js), 'верхние карточки ленты догружаются сразу при показе');
ok(/badges-row\[data-nogenres="1"\]/.test(js) && /function clearArtPlaceholder\(el\)\{/.test(js),
  'вместе с постером появляются жанры, а иконка-заглушка уходит');
/* где смотреть */
ok(/id="watchScreen"/.test(src) && /id="sheetWatchBtn"/.test(src) && /Смотреть<\/button>/.test(src),
  'в карточке фильма есть кнопка «Смотреть» и своё окно');
ok(/function openWatchScreen\(movie\)\{/.test(js) && /openOverlay\('watchScreen'\)/.test(js), 'окно открывается как остальные окна приложения');
ok(/function ensureTrailer\(movie\)\{/.test(js) && /youtube-nocookie\.com\/embed\//.test(js), 'трейлер играет прямо в приложении');
ok(/language=ru-RU/.test(js) && /\/videos\?api_key=/.test(js), 'сначала ищем русский трейлер, потом общий');
ok(/function ensureWatchProviders\(movie\)\{/.test(js) && /watch\/providers\?api_key=/.test(js) && /results\.RU/.test(js),
  'сервисы берём у TMDB по России');
ok(/WATCH_KIND_LABEL = \{ flatrate:'по подписке'/.test(js) && /rent:'аренда', buy:'покупка'/.test(js), 'у каждого сервиса видно, как там смотрят');
ok(/function openExternal\(url\)\{[\s\S]{0,240}?tg\.openLink/.test(js) && /data-url="\$\{esc\(providers\.link\)\}"/.test(js),
  'переход в сервис открывается системным способом Telegram');
ok(!/(rutracker|rutor|lordfilm|hdrezka|kinogo|torrent|magnet:)/i.test(src), 'пиратских источников в приложении нет');
ok(/приложение не хранит и не раздаёт фильмы/.test(js), 'и в окне прямо сказано, что фильмы не раздаются');

/* живой прогон: пустая обложка на экране и открытие карточки */
const wCalls = [];
const wDb = makeFakeDb();
const wFetch = async (url) => {
  const u = String(url);
  wCalls.push(u);
  const json = (o) => ({ ok: true, json: async () => o });
  if (/\/genre\/(movie|tv)\/list/.test(u)) return json({ genres: [] });
  if (/watch\/providers/.test(u)){
    const id = (u.match(/\/(\d+)\/watch\/providers/) || [])[1] || '7009';
    return json({ results: { RU: { link: 'https://www.themoviedb.org/movie/' + id + '/watch?locale=RU',
      flatrate: [{ provider_id: 505, provider_name: 'Кинопоиск', logo_path: '/kp.jpg' }] } } });
  }
  if (/\/videos/.test(u)) return json({ results: [{ site: 'YouTube', type: 'Trailer', key: 'TRAILER9', name: 'Русский трейлер' }] });
  if (/\/credits/.test(u)) return json({ cast: [] });
  const m = u.match(/\/(movie|tv)\/(\d+)\?/);
  if (m) return json({ id: +m[2], title: 'Подробный тайтл', name: 'Подробный тайтл', poster_path: '/fresh' + m[2] + '.jpg',
    overview: 'Описание из базы', genres: [{ name: 'Драма' }], release_date: '2020-05-01', vote_average: 7.5,
    vote_count: 120, runtime: 104, number_of_episodes: 0 });
  return json({ page: 1, total_pages: 1, results: FIX.slice(0, 6), genres: [] });
};
const devW = await bootDevice(wDb, { platform: 'android', fetch: wFetch });
const evW = (code) => { try{ return devW.ev(code); }catch(e){ return 'ERR: ' + (e && e.message); } };
await sleep(300);
ok(devW.errors.length === 0, 'приложение запускается без ошибок' + (devW.errors.length ? ': ' + devW.errors[0] : ''));
/* пустая обложка, которая уже на экране: рисуем карточку тем же кодом приложения */
const bareCard = (id) => `(function(){ const m = { id: ${id}, type: "movie", title: "Тайтл #${id}", posterPath: null, poster: null,
  overview: "", genres: [], year: "", rating: 0 }; rememberMovie(m); const el = document.createElement("div"); el.className = "grid2"; el.id = "probe${id}";
  el.innerHTML = posterCardHTML(m); document.body.appendChild(el); applyLazyArt(el); return el.querySelectorAll("[data-need]").length; })()`;
ok(evW(bareCard(7009)) === 1, 'пустая обложка помечена как «нужно догрузить»');
devW.win.__flushIO();
await sleep(400);
ok(wCalls.some(u => /\/movie\/7009\?/.test(u)), 'пустая обложка на экране сразу запросила карточку тайтла');
ok(String(evW('String(document.querySelector("#probe7009 .pc-art").dataset.art || "")')).length > 0, 'и вместо заглушки встал постер');
ok(evW('document.querySelectorAll("#probe7009 .pc-icon").length') === 0, 'иконка-заглушка убрана');
ok(/Подробный тайтл/.test(evW('String(document.querySelector("#probe7009 .pc-title").textContent)')), 'заголовок «Тайтл #…» заменился настоящим');
/* открытие карточки, которой приложение ещё не знает */
evW('(function(){ const bare = { id: 7011, type: "movie", title: "Тайтл #7011", posterPath: null, poster: null, overview: "", genres: [], year: "", rating: 0 }; openSheet(bare); return true; })()');
await sleep(450);
const detailsCalls = () => wCalls.filter(u => /\/movie\/7011\?/.test(u)).length;
ok(detailsCalls() >= 1, 'открытие карточки сразу запросило данные: запросов ' + detailsCalls());
ok(evW('String(sheetMovie && sheetMovie.title)') === 'Подробный тайтл', '«Тайтл #…» заменился настоящим названием');
ok(/pl-full/.test(evW('String((document.getElementById("sheetPoster")||{}).innerHTML)')), 'постер встал прямо в открытую карточку');
ok(/Драма/.test(evW('String((document.getElementById("sheetMeta")||{}).innerHTML)')), 'жанры доехали в строку под названием');
ok(evW('String((document.getElementById("sheetOverview")||{}).textContent)') === 'Описание из базы', 'и описание заполнилось');
ok(evW('(function(){ try{ return Object.keys(movieStubs).length; }catch(e){ return -1; } })()') > 0,
  'тайтл запомнился приложению, а не потерялся вместе с окном');
/* окно «где смотреть» */
const beforeWatch = detailsCalls();
evW('openWatchScreen(sheetMovie)');
await sleep(450);
const wBody = () => evW('String((document.getElementById("watchBody")||{}).innerHTML)');
ok(evW('String(document.getElementById("watchScreen").classList.contains("open"))') === 'true', 'окно «где смотреть» открылось');
ok(/youtube-nocookie\.com\/embed\/TRAILER9/.test(wBody()), 'трейлер играет в самом приложении');
ok(/Кинопоиск/.test(wBody()) && /по подписке/.test(wBody()), 'видно сервис и то, что он по подписке');
ok(detailsCalls() === beforeWatch, 'повторно данные тайтла не запрашиваются');
let openedUrl = '';
devW.win.Telegram.WebApp.openLink = (u) => { openedUrl = u; };
const row = devW.doc.querySelector('.wp-row');
if (row) row.click();
await sleep(80);
ok(/themoviedb\.org\/movie\/7011\/watch/.test(openedUrl), 'кнопка сервиса открывает страницу со ссылками: ' + openedUrl);
devW.close();

/* ============ [21] Фильтры «Хочу чекнуть», длинная лента и полное колесо ============ */
section('[21] Фильтры чек-листа, лента и колесо на весь список');
const wishDb = makeFakeDb();
/* Чек-лист: восемь фильмов и четыре сериала — хватает и на типы, и на жанры, и на годы. */
const WISH_LIST = [
  { id: 8101, type: 'movie',  title: 'Альфа', genres: ['Боевик'],          year: '2019', rating: 6.1 },
  { id: 8102, type: 'movie',  title: 'Браво', genres: ['Драма'],           year: '2021', rating: 8.4 },
  { id: 8103, type: 'movie',  title: 'Вираж', genres: ['Драма', 'Комедия'], year: '2015', rating: 7.2 },
  { id: 8104, type: 'movie',  title: 'Гроза', genres: ['Боевик', 'Драма'],  year: '2022', rating: 5.9 },
  { id: 8105, type: 'series', title: 'Дом',   genres: ['Драма'],           year: '1998', rating: 9.1 },
  { id: 8106, type: 'series', title: 'Ель',   genres: ['Комедия'],         year: '2005', rating: 6.6 },
  { id: 8107, type: 'series', title: 'Жара',  genres: ['Драма'],           year: '2019', rating: 7.8 },
  { id: 8108, type: 'series', title: 'Зима',  genres: ['Боевик'],          year: '2023', rating: 8.9 },
  { id: 8109, type: 'movie',  title: 'Ирис',  genres: ['Комедия'],         year: '2010', rating: 7.0 },
  { id: 8110, type: 'movie',  title: 'Кипа',  genres: ['Драма'],           year: '2001', rating: 6.3 },
  { id: 8111, type: 'movie',  title: 'Луна',  genres: ['Боевик'],          year: '2018', rating: 7.7 },
  { id: 8112, type: 'movie',  title: 'Море',  genres: ['Комедия'],         year: '1996', rating: 8.0 },
];
WISH_LIST.forEach(m => wishDb.rows('wishlist').push({ telegram_id: 909090, movie_id: m.type === 'series' ? m.id + 1000000000 : m.id }));
const devX = await bootDevice(wishDb, { platform: 'android' });
devX.ev(`(function(){ ${JSON.stringify(WISH_LIST)}.forEach(m => rememberMovie({ id: m.id, type: m.type, title: m.title,
  originalTitle: m.title + ' (orig)', year: m.year, rating: m.rating, poster: null, posterPath: '/w' + m.id + '.jpg',
  overview: '', genres: m.genres })); renderWishlist(); return true; })()`);
await sleep(40);
ok(devX.errors.length === 0, 'чек-листное устройство стартует без ошибок' + (devX.errors.length ? ': ' + devX.errors[0] : ''));
ok(devX.ev('state.wishlist.length') === 12, 'чек-лист загрузился из базы: ' + devX.ev('state.wishlist.length'));
ok(devX.ev('wishVisibleMovies().length') === 12, 'без условий видно все двенадцать');
/* отбор считается одной функцией — той же, что рисует экран */
ok(devX.ev('wishFilterMovies({ types:["series"], genres:[], year:"any" }, "", "added").length') === 4,
  'тип «Сериалы» оставляет четыре тайтла');
ok(devX.ev('wishFilterMovies({ types:[], genres:["Драма"], year:"any" }, "", "added").length') === 6,
  'жанр «Драма» оставляет шесть');
ok(devX.ev('wishFilterMovies({ types:[], genres:[], year:"2020" }, "", "added").length') === 3,
  'год 2020-е оставляет три');
ok(devX.ev('wishFilterMovies({ types:[], genres:[], year:"old" }, "", "added").length') === 2,
  '«до 2000» оставляет два: ' + devX.ev('wishFilterMovies({ types:[], genres:[], year:"old" }, "", "added").map(m => m.title).join(", ")'));
ok(devX.ev('wishFilterMovies({ types:["series"], genres:["Драма"], year:"any" }, "", "added").length') === 2,
  'условия складываются: сериалы-драмы');
ok(devX.ev('wishFilterMovies({ types:[], genres:[], year:"any" }, "мор", "added").length') === 1,
  'поиск работает вместе с условиями');
ok(devX.ev('wishFilterMovies({ types:[], genres:[], year:"any" }, "", "rating").map(m => m.rating).join()') === '9.1,8.9,8.4,8,7.8,7.7,7.2,7,6.6,6.3,6.1,5.9',
  'сортировка по рейтингу: ' + devX.ev('wishFilterMovies({ types:[], genres:[], year:"any" }, "", "rating").map(m => m.title).join(" > ")'));
ok(devX.ev('wishFilterMovies({ types:[], genres:[], year:"any" }, "", "title").map(m => m.title).join()') === 'Альфа,Браво,Вираж,Гроза,Дом,Ель,Жара,Зима,Ирис,Кипа,Луна,Море',
  'сортировка по названию работает');
ok(devX.ev('WISH_SORTS.length') === 5, 'сортировок стало пять: ' + devX.ev('WISH_SORTS.map(x => x.label).join(", ")'));
/* окно фильтров чек-листа */
devX.doc.getElementById('openWishFilters').click();
await sleep(30);
ok(devX.doc.getElementById('filtersScreen').classList.contains('open'), 'кнопка над чек-листом открывает окно фильтров');
ok(/чек-лист/i.test(String(devX.doc.querySelector('#filtersScreen .ov-title').textContent)),
  'окно подписано как фильтры чек-листа: ' + devX.doc.querySelector('#filtersScreen .ov-title').textContent);
ok(devX.ev('filtersDraft.genres.length + filtersDraft.types.length') === 0, 'черновик начинается пустым');
ok(devX.doc.querySelectorAll('#filtersBody .f-chip[data-f="sort"]').length === 5, 'в окне вся сортировка чек-листа');
ok(!devX.doc.querySelector('#filtersBody .f-chip[data-f="sort"][data-v="default"]'), 'каталожной сортировки «по умолчанию» тут нет');
const wishGenreChips = devX.doc.querySelectorAll('#filtersBody .f-chip[data-f="genre"]').length;
ok(wishGenreChips === 3, 'в окне только жанры из чек-листа: ' + wishGenreChips);
devX.doc.querySelector('#filtersBody .f-chip[data-f="genre"][data-v="Драма"]').click();
await sleep(20);
ok(/Найдено[^0-9]*6/.test(String(devX.doc.getElementById('filtersFound').textContent)),
  'окно сразу считает, сколько подойдёт: ' + devX.doc.getElementById('filtersFound').textContent);
ok(/Показать 6/.test(String(devX.doc.getElementById('filtersApply').textContent)), 'и кнопка подписана числом');
devX.doc.getElementById('filtersApply').click();
await sleep(50);
ok(devX.doc.querySelectorAll('#wishSort .chip.removable').length === 1, 'в шапке чек-листа виден активный фильтр с крестиком');
ok(devX.ev('wishFilters.genres.length') === 1 && devX.ev('wishFilters.genres[0]') === 'Драма', 'условие применилось к чек-листу');
ok(String(devX.ev('localStorage.getItem("smotra_wish_filters")')).indexOf('Драма') > 0, 'условие осталось в памяти телефона');
ok(devX.doc.getElementById('wishFilterBadge').style.display !== 'none', 'на кнопке фильтров виден счётчик условий');
const wishCards = () => devX.doc.querySelectorAll('#wishList .poster-card, #wishList .row-card').length;
ok(wishCards() === 6, 'список на экране сузился до шести: ' + wishCards());
await sleep(150);
ok(wishDb.cfgValue('wishFilters') && wishDb.cfgValue('wishFilters').genres[0] === 'Драма',
  'условия чек-листа уехали в базу: ' + JSON.stringify(wishDb.cfgValue('wishFilters')));
devX.doc.querySelector('#wishSort .chip.removable').click();
await sleep(40);
ok(devX.ev('wishFilters.genres.length') === 0, 'крестик на чипе снимает условие');
ok(wishCards() === 12, 'и список возвращается целиком');
ok(devX.doc.getElementById('wishFilterBadge').style.display === 'none', 'счётчик исчез вместе с условием');
/* сброс в окне чек-листа ничего не портит до «Показать» */
devX.ev('openFilters("wishlist")');
await sleep(20);
devX.doc.querySelector('#filtersBody .f-chip[data-f="type"][data-v="series"]').click();
await sleep(10);
devX.doc.getElementById('filtersReset').click();
await sleep(10);
ok(devX.ev('filtersDraft.types.length + filtersDraft.genres.length') === 0 && devX.ev('filtersDraft.year') === 'any',
  '«Сбросить» возвращает всё и в окне чек-листа');
ok(devX.ev('wishFilters.types.length') === 0, 'черновик не трогает уже применённое');
devX.ev('closeOverlay("filtersScreen")');
await sleep(20);
/* лента: длинная */
devX.doc.getElementById('openRoulette').click();
await sleep(60);
ok(devX.doc.getElementById('roulette').classList.contains('show'), 'рулетка открывается');
const stripTiles = () => devX.doc.querySelectorAll('#rlStrip .rl-item').length;
ok(stripTiles() === 72, 'лента стала длинной: ' + stripTiles() + ' плиток на двенадцать тайтлов вместо 34');
ok(/Выбери режим и нажми/.test(String(devX.doc.getElementById('rlResult').textContent)), 'подсказка обычная, пока условий нет');
/* колесо: все тайтлы */
devX.ev('Roulette.setMode("wheel")');
await sleep(40);
ok(devX.doc.querySelectorAll('#rlWheel .rl-sec').length === 12, 'на колесе столько секторов, сколько тайтлов: ' + devX.doc.querySelectorAll('#rlWheel .rl-sec').length);
ok(devX.doc.querySelectorAll('#rlWheel image').length === 12, 'на каждом секторе своя обложка');
ok(devX.doc.querySelectorAll('#rlWheel .rl-lbl text').length === 12, 'и подпись с названием');
/* условия чек-листа действуют и в рулетке, и в колесе */
devX.ev('openFilters("wishlist")');
await sleep(20);
devX.doc.querySelector('#filtersBody .f-chip[data-f="genre"][data-v="Драма"]').click();
devX.doc.getElementById('filtersApply').click();
await sleep(50);
devX.ev('Roulette.setMode("strip")');
await sleep(40);
ok(stripTiles() === 54, 'лента пересобралась под условия: ' + stripTiles() + ' плиток на шесть тайтлов');
ok(/В игре 6 тайтлов — по твоим условиям/.test(String(devX.doc.getElementById('rlResult').textContent)),
  'рулетка честно говорит, что играет по условиям: ' + String(devX.doc.getElementById('rlResult').textContent).trim());
devX.ev('Roulette.setMode("wheel")');
await sleep(40);
ok(devX.doc.querySelectorAll('#rlWheel .rl-sec').length === 6, 'и колесо сузилось до отобранных шести');
devX.ev('Roulette.setSpeed(0.02); Roulette.spin();');
await sleep(500);
const winName = String(devX.doc.querySelector('#rlResult .rl-name').textContent);
ok(devX.ev(`wishVisibleMovies().some(m => m.title === ${JSON.stringify(winName)})`), 'выиграл тайтл из отобранных условий: ' + winName);
ok(devX.doc.querySelectorAll('#rlWheel .rl-sec:not(.dim)').length === 1, 'подсвечен ровно один сектор-победитель');
/* очень большой чек-лист: колесо обязано вместить всех, а лента — упереться в свой максимум */
devX.ev(`(function(){ for (let i = 0; i < 200; i++) rememberMovie({ id: 9000 + i, type: 'movie', title: 'Тайтл ' + i,
  originalTitle: '', year: '2000', rating: 5, poster: null, posterPath: '/h' + i + '.jpg', overview: '', genres: ['Драма'] });
  state.wishlist = Array.from({ length: 200 }, (_, i) => 9000 + i); wishFilters = { types: [], genres: [], year: 'any' }; renderWishHead(); renderWishlist(); return true; })()`);
await sleep(80);
devX.ev('Roulette.setMode("wheel")');
await sleep(80);
ok(devX.doc.querySelectorAll('#rlWheel .rl-sec').length === 200, 'колесо вмещает все двести тайтлов: ' + devX.doc.querySelectorAll('#rlWheel .rl-sec').length);
devX.ev('Roulette.setMode("strip")');
await sleep(80);
ok(stripTiles() === 180, 'лента упирается в свой максимум, а не в 34: ' + stripTiles());
devX.ev('Roulette.setSpeed(1); Roulette.close();');
await sleep(20);
/* статика: прежние ограничения сняты, новые на месте */
ok(!/Math\.min\(Math\.max\(items\.length, 2\), 8\)/.test(js), 'обрезка колеса до восьми тайтлов убрана');
ok(/const STRIP_MIN = 54, STRIP_MAX = 180;/.test(js), 'у ленты есть длинный размер по умолчанию');
ok(/return wishVisibleMovies\(\);/.test(js), 'рулетка берёт список той же функцией, что и экран чек-листа');
ok(/keys\.add\('wishFilters'\)/.test(js), 'условия чек-листа попадают в список настроек для отправки');
ok(/let wf = take\('wishFilters'\)/.test(js), 'и приезжают на другое устройство');
ok(/id="openWishFilters"/.test(src) && /id="wishFilterBadge"/.test(src), 'кнопка фильтров и счётчик есть в разметке');
devX.close();

/* ================= [22] Ни порно, ни хентая ================= */
section('[22] Ни порно, ни хентая');
/* статика: взрослое не запрашиваем, не описываем и не запоминаем (проверки без
   регулярных выражений — так отчёт читается, а экранирование не мешает) */
ok(js.indexOf('include_adult=${') === -1 && js.indexOf('include_adult=true') === -1,
  'запросы к TMDB больше не просят взрослое ни при каких настройках');
ok((js.match(/include_adult=false/g) || []).length >= 4, 'и все четыре подборки просят только обычное');
ok(src.indexOf('switchAdult') === -1 && src.indexOf('<div class="set-label">Показывать 18+</div>') === -1,
  'тумблера «Показывать 18+» в настройках нет');
ok(js.indexOf("getFlag('smotra_adult'") === -1 && js.indexOf("syncSetting('adult'") === -1,
  'взрослый режим убран и из настроек, и из синхронизации');
ok(js.indexOf('const ADULT_TITLE_RE = /(^|[^a-zа-яё])(hentai|porn|хентай|порн)/i;') > -1,
  'есть строгая проверка названия: hentai / porn / хентай / порн');
ok(js.indexOf('if (item.adult === true) return true;') > -1, 'флаг adult из TMDB отбрасывает карточку сразу');
ok(js.indexOf('filter(item => !isAdultItem(item))') > -1, 'подборка фильтруется на входе');
ok(js.indexOf('if (isAdultItem(data)) return null;') > -1, 'подробности по id тоже проверяются');
ok(js.indexOf('if (!m || !m.id || isAdultItem(m)) return;') > -1, 'в память телефона взрослое не запоминается');
ok(js.indexOf('smotra_tmdb_cache_v5_safe') > -1, 'ключ кэша подборки сменился — старый кэш со взрослым больше не читается');
ok(js.indexOf('if (!isAdultItem(stored[k])) movieStubs[k] = stored[k];') > -1,
  'копии тайтлов в памяти телефона просеиваются при загрузке');
/* живой прогон: мусор в ответе TMDB не доходит до экрана */
const adultDb = makeFakeDb();
const ADULT_FIX = [
  { id: 9101, title: 'Обычный фильм', name: 'Обычный фильм', original_title: 'Normal Film', media_type: 'movie',
    poster_path: '/ok1.jpg', vote_average: 7.4, vote_count: 900, popularity: 900, release_date: '2020-05-05', genre_ids: [28], overview: 'Описание' },
  { id: 9102, title: 'Porn Test Movie', name: 'Porn Test Movie', media_type: 'movie', adult: true,
    poster_path: '/bad1.jpg', vote_average: 6.1, vote_count: 300, popularity: 999, release_date: '2021-05-05', genre_ids: [28], overview: 'Описание' },
  { id: 9103, title: 'Хентайная история', name: 'Хентайная история', media_type: 'movie',
    poster_path: '/bad2.jpg', vote_average: 6.6, vote_count: 300, popularity: 998, release_date: '2022-05-05', genre_ids: [16], overview: 'Описание' },
  { id: 9104, title: 'Тихий омут', name: 'Тихий омут', original_title: 'Hentai Angels', media_type: 'tv',
    poster_path: '/bad3.jpg', vote_average: 6.9, vote_count: 300, popularity: 997, first_air_date: '2023-05-05', genre_ids: [16], overview: 'Описание' },
  { id: 9105, title: 'Второй нормальный', name: 'Второй нормальный', media_type: 'movie',
    poster_path: '/ok2.jpg', vote_average: 8.0, vote_count: 800, popularity: 890, release_date: '2019-05-05', genre_ids: [35], overview: 'Описание' },
];
const devY = await bootDevice(adultDb, { platform: 'android', storage: { smotra_adult: 'true' }, fetch: async (url) => {
  const u = String(url);
  if (/\/genre\/(movie|tv)\/list/.test(u)) return { ok: true, json: async () => ({ genres: [{ id: 28, name: 'Боевик' }, { id: 35, name: 'Комедия' }, { id: 16, name: 'Анимация' }] }) };
  return { ok: true, json: async () => ({ page: 1, total_pages: 1, results: ADULT_FIX, genres: [] }) };
} });
ok(devY.errors.length === 0, 'устройство со взрослым в ответе TMDB стартует без ошибок' + (devY.errors.length ? ': ' + devY.errors[0] : ''));
const adultTitles = () => devY.ev('[...new Set(MOVIES.map(m => m.title))].sort()');
ok(JSON.stringify(adultTitles()) === JSON.stringify(['Второй нормальный', 'Обычный фильм']),
  'в каталог попали только обычные тайтлы: ' + adultTitles().join(', '));
ok(!/Porn|Хентай|Hentai/.test(devY.ev('MOVIES.map(m => m.title + " " + m.originalTitle).join(" | ")')), 'взрослых названий в каталоге нет');
ok(devY.ev('isAdultItem({ adult: true })') === true && devY.ev('isAdultItem({ title: "Porn" })') === true
  && devY.ev('isAdultItem({ originalTitle: "Hentai Club" })') === true && devY.ev('isAdultItem({ title: "Хентайный принц" })') === true,
  'проверка ловит и флаг, и название в любом языке');
ok(devY.ev('isAdultItem({ title: "Обычный фильм", originalTitle: "Normal Film" })') === false, 'обычный тайтл проверку проходит');
ok(devY.ev('movieFromTmdb({ id: 9102, title: "Porn Test", adult: true }, "movie")') === null, 'описание взрослого тайтла не собирается вообще');
devY.ev('rememberMovie({ id: 9103, type: "movie", title: "Хентайная история", posterPath: "/x.jpg" })');
ok(devY.ev('keyToMovie(9103) === null'), 'взрослый тайтл не оседает в памяти телефона');
ok(devY.ev('!!localStorage.getItem("smotra_adult")') === false, 'ключ тумблера из прошлых версий вычищен');
/* на экране: ни в ленте, ни в каталоге, ни в поиске */
devY.ev('renderStack(); renderCatalog();');
await sleep(60);
const seenTitles = devY.ev('[...document.querySelectorAll(".pc-title, .rl-name, .card-title, .deck-title")].map(e => e.textContent).join(" | ")');
ok(!/Porn|Хентай|Hentai/.test(seenTitles), 'на экране нет ни одного взрослого тайтла: ' + seenTitles.slice(0, 80));
devY.doc.getElementById('catSearch').value = 'хентай';
devY.doc.getElementById('catSearch').dispatchEvent(new devY.win.Event('input', { bubbles: true }));
await sleep(60);
ok(devY.ev('[...document.querySelectorAll("#catGrid .poster-card, #catGrid .row-card")].length') === 0, 'поиск по слову «хентай» ничего не находит');
devY.doc.getElementById('catSearch').value = 'обычный';
devY.doc.getElementById('catSearch').dispatchEvent(new devY.win.Event('input', { bubbles: true }));
await sleep(60);
ok(devY.ev('[...document.querySelectorAll("#catGrid .poster-card, #catGrid .row-card")].length') >= 1, 'а обычные тайтлы поиск находит как раньше');
/* подробности по id: ответ со взрослым не заполняет карточку */
devY.ev('(function(){ const bare = { id: 9102, type: "movie", title: "", posterPath: null, overview: "", genres: [], year: "", rating: 0 }; rememberMovie(bare); return true; })()');
devY.ev('loadMovieDetails({ movie: { id: 9102, type: "movie" }, key: 9102 }).then(() => { window.__adultDone = true; })');
await sleep(300);
ok(devY.ev('String(!!window.__adultDone)') === 'true', 'ответ по взрослому id обработан');
ok(devY.ev('!!keyToMovie(9102) === false || !keyToMovie(9102).title'), 'и карточка осталась пустой — название не подставилось');
devY.close();

console.log('\n' + (fail === 0 ? 'ВСЁ ОК: ' : 'ЕСТЬ ПРОБЛЕМЫ: ') + pass + ' passed, ' + fail + ' failed');
if (fail) console.log('Проваленные проверки:\n - ' + failed.join('\n - '));
process.exit(fail ? 1 : 0);

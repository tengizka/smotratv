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
ok(/grid-template-rows:auto minmax\(0,1fr\) minmax\(0,auto\) auto/.test(cssClean), 'сетка: шапка, сцена, подпись, кнопка');
ok(/height:var\(--tut-h, var\(--app-h, 100%\)\)/.test(cssClean), 'слой туториала кроет всё приложение');
ok(!/#tutorial\{[^}]*height:100dvh/.test(cssClean), 'жёсткой height:100dvh (она роняла низ за экран) больше нет');
ok(/min\(var\(--safe-top\), 90px\)/.test(cssClean), 'верхний отступ туториала ограничен — inset не съедает пол-экрана');
ok(/--tut-pad-bottom, 0px/.test(cssClean), 'нижняя невидимая часть экрана уходит в отступ, а не в обрезку контента');
ok(/body\.tut-open nav, body\.tut-open \.lvl-strip|body\.tut-open \.topbar/.test(cssClean), 'во время обучения интерфейс приложения спрятан');
ok(/classList\.add\('tut-open'\)/.test(js) && /classList\.remove\('tut-open'\)/.test(js), 'класс показывается и снимается вместе с туториалом');
ok(/function tutPlan\(inner, fixed, capNatural\)/.test(js), 'высоты считает отдельная функция — её можно проверить без браузера');
ok(/stage\.style\.height = plan\.stageH/.test(js), 'сцена получает ровно остаток места');
ok(/cap\.style\.maxHeight = Math\.max\(48, Math\.round\(plan\.capH\)\)/.test(js), 'подпись подрезается по плану');
ok(/const layerH = Math\.round\(appH/.test(js) && /const hiddenBottom = Math\.max\(0, Math\.round\(layerH - visH\)\)/.test(js), 'высота слоя и скрытая снизу часть считаются отдельно');
ok(/const inner = Math\.max\(120, Math\.min\(t\.clientHeight - padTop - padBot, \(visH \|\| t\.clientHeight\) - padTop - padBot\)\)/.test(js), 'содержимое обязано влезть в видимую часть экрана');
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
ok(/const START = \[0, 50, 250, 500, 1000, 2000\]/.test(js), 'пороги: 50 / 250 / 500 / 1000 / 2000 XP');
ok(/Math\.pow\(2, i - START\.length \+ 1\)/.test(js), 'дальше каждый порог удваивается');
ok(/function smotraXP/.test(js) && /function levelFor/.test(js) && /function myXP/.test(js), 'опыт и уровень считаются отдельными функциями');
ok(/XP_RULES = \{ watched: 10, wishlist: 6, watching: 4, skipped: 1, review: 25, badge: 40, streakDay: 5 \}/.test(js), 'правила опыта на месте');
ok(!/smotraXP\(\)/.test(js), 'нет вызова расчёта опыта без списков (на этом падали настройки)');
const jsCode = js.replace(/\/\*[\s\S]*?\*\//g, '');   // без комментариев: в истории версий слово остаётся
ok(!/СмотраLVL/.test(jsCode), 'в интерфейсе нет слова «СмотраLVL» — только LVL');
ok(!/Легенда SMOTRA/.test(jsCode), 'уровни и ачивки без слова «Смотра»');
ok(/LVL \$\{level\.level\}/.test(js) && /lvl-bar/.test(cssClean), 'уровень показывается с полосой прогресса');
ok(/\[.Как растёт LVL\?./.test(js) && /Какие уровни есть/.test(js), 'правила и лестница объясняются в FAQ');
ok(/32 000 XP/.test(js), 'в FAQ видно последний порог');

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
ok((src.match(/data-ach-open/g) || []).length === 2, 'кубок ачивок только на главной и в профиле');
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
ok(/\.card \.veil\{[^}]*z-index:20/.test(cssClean.replace(/\n/g, ' ')), 'затемнение при удержании поверх штампов');

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
ev('document.getElementById("tutorial").classList.remove("show"); document.body.classList.remove("tut-open");');
/* уровни */
ok(ev('LEVELS.map(l => l.xp).join(",")') === '0,50,250,500,1000,2000,4000,8000,16000,32000', 'пороги уровней: ' + ev('LEVELS.map(l => l.xp).join(",")'));
ok(ev('levelFor(0).level') === 1 && ev('levelFor(50).level') === 2 && ev('levelFor(2000).level') === 6, 'уровень считается верно');
ok(/LVL \d+ ·/.test(ev('document.getElementById("homeLevelName").textContent')), 'вверху главной видно уровень: ' + ev('document.getElementById("homeLevelName").textContent'));
ok(!ev('document.getElementById("levelCard").innerHTML').includes('СмотраLVL'), 'в профиле нет слова «СмотраLVL»');
const faq = ev('(function(){ renderFaq(); return document.getElementById("faqBody").textContent; })()');
ok(faq.indexOf('32 000') > -1 && faq.indexOf('+10 XP') > -1, 'в FAQ есть лестница и правила опыта');
ok(faq.indexOf('LVL') > -1 && faq.indexOf('СмотраLVL') === -1, 'в FAQ пишем LVL');
/* ачивки */
ok(ev('BADGES.length') >= 20, 'ачивок в приложении: ' + ev('BADGES.length'));
ok(ev('new Set(BADGES.map(b => b.icon)).size') >= 24, 'значки ачивок не повторяются: ' + ev('new Set(BADGES.map(b => b.icon)).size'));
ev('openAchievementsScreen();');
ok(ev('document.getElementById("achievementsScreen").classList.contains("open")'), 'окно всех ачивок открывается');
ok(ev('document.querySelectorAll("#achievementsGrid .badge").length') === ev('BADGES.length'), 'рисуются все ' + ev('BADGES.length') + ' ачивок');
ok(ev('document.getElementById("achievementsBar").style.width') !== '', 'полоса прогресса заполнена');
ev('closeOverlay("achievementsScreen");');
ok(!ev('document.getElementById("achievementsScreen").classList.contains("open")'), 'окно ачивок закрывается');
ok(ev('document.querySelectorAll("[data-ach-open]").length') === 1, 'кубок ачивок на главной один');
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
  'openFilters','filterBackdrop','catShowMoreBtn'];
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
ok(/body\{ padding-left:var\(--side\); padding-right:0; \}/.test(dflat), 'содержимое сдвинуто вправо от панели');
ok(/nav\{ position:fixed; left:0; top:0; bottom:0; width:var\(--side\); max-width:none; height:auto;/.test(dflat), 'разделы живут в боковой панели во всю высоту');
ok(/nav button\{ flex-direction:row; justify-content:flex-start; align-items:center; gap:12px; width:100%;/.test(dflat), 'кнопки разделов стали строками с подписями');
ok(/nav button\.active\{ color:var\(--text\); background:var\(--accent-soft\); \}/.test(dflat), 'активный раздел подсвечен');
ok(/\.topbar \.wordmark\{ position:fixed; left:24px; top:calc\(22px \+ var\(--safe-top\)\); z-index:21; font-size:20px; \}/.test(dflat), 'логотип переехал в боковую панель');
ok(/#sheet\{ position:fixed; top:0; right:0; bottom:0; left:auto; width:min\(470px, 44vw\);/.test(dflat), 'карточка фильма — панель справа');
ok(/#sheet\.open\{ transform:translateX\(0\); \}/.test(dflat), 'панель выезжает слева направо, а не снизу');
ok(/#askSheet, #badgeSheet\{ position:fixed; left:50%; top:50%; right:auto; bottom:auto;\s*width:min\(440px, 92vw\);/.test(dflat), 'небольшие шторки стали окошками по центру');
ok(/\.overlay-screen\{ position:fixed; inset:auto; left:50%; top:50%;\s*width:min\(980px, 94vw\); height:min\(820px, 90vh\);/.test(dflat), 'окна приложения — по центру, а не во весь экран');
ok(/\.overlay-screen\.open\{ transform:translate\(-50%,-50%\) scale\(1\); opacity:1; visibility:visible; pointer-events:auto; \}/.test(dflat), 'и открываются мягко, без съезда за край');
ok(/\.ov-scrim\{ display:block; position:fixed; inset:0; z-index:24;/.test(dflat), 'под окнами появилось затемнение');
ok(/body\.ov-open \.ov-scrim\{ opacity:1; pointer-events:auto; \}/.test(dflat), 'затемнение включается классом на body');
ok(/\.ov-scrim\{ display:none; \}/.test(dflat), 'на телефоне затемнение не показывается (там окна полноэкранные)');
ok(/#home\{ max-width:780px; margin:0 auto; \}/.test(dflat) && /#profile, #feed\{ max-width:900px; margin:0 auto; \}/.test(dflat), 'колода, профиль и лента держатся колонкой по центру');
ok(/\.grid2\{ grid-template-columns:repeat\(auto-fill, minmax\(168px, 1fr\)\); \}/.test(dflat), 'каталог занимает всю ширину: обложек помещается больше');
ok(/#splash, #onboarding, #tutorial\{ max-width:none; \}/.test(dflat), 'заставка и обучение на десктопе кроют всё окно (их содержимое центрирует flex)');
ok(/\.undo-pill, #toast\{ left:calc\(50% \+ var\(--side\) \/ 2\); \}/.test(dflat), 'пилюля и сообщение центрируются по содержимому, а не по окну');
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

console.log('\n' + (fail === 0 ? 'ВСЁ ОК: ' : 'ЕСТЬ ПРОБЛЕМЫ: ') + pass + ' passed, ' + fail + ' failed');
if (fail) console.log('Проваленные проверки:\n - ' + failed.join('\n - '));
process.exit(fail ? 1 : 0);

// Тесты: связь с сервером в Google Apps Script.
// Все ответы сервера и данные из памяти браузера проверяются, текст выводится только как текст (без разметки).
(function () {
  'use strict';
  var root = document.getElementById('quiz');
  if (!root) return;
  var SITE = 'https://xajdahax.github.io/igpr/';
  var LS = 'igpr-test-v2';
  var URL_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,200}\/exec$/;
  var URL_ = String(window.IGPR_TEST_URL || '').trim();
  var ATT_RE = /^[A-Za-z0-9-]{8,80}$/;
  var FIO_RE, GROUP_RE;
  try {
    FIO_RE = new RegExp("^\\p{L}[\\p{L}\\p{M}'’.\\- ]*$", 'u');
    GROUP_RE = new RegExp('^[\\p{L}\\p{N}][\\p{L}\\p{N}\\p{M}./\\- ]*$', 'u');
  } catch (e) {
    FIO_RE = /^[A-Za-zА-Яа-яЁёӘәӨөҮүҠҡҒғҢңҺһҘҙҪҫ][A-Za-zА-Яа-яЁёӘәӨөҮүҠҡҒғҢңҺһҘҙҪҫ'’.\- ]*$/;
    GROUP_RE = /^[0-9A-Za-zА-Яа-яЁё][0-9A-Za-zА-Яа-яЁё.\/\- ]*$/;
  }
  var $ = function (id) { return document.getElementById(id); };
  var st = { tests: [], test: null, attemptId: null, questions: [], answers: Object.create(null), i: 0, deadline: 0, skew: 0, timer: null, sending: false, fio: '', group: '', no: 1, max: 2 };

  function h(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = String(txt); return e; }
  function str(v, max) { return typeof v === 'string' && v.length <= max; }
  function int(v, lo, hi) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= lo && v <= hi; }
  function num(v, lo, hi) { return typeof v === 'number' && isFinite(v) && v >= lo && v <= hi; }
  function count(v) { if (typeof v === 'number' && isFinite(v)) return v; if (typeof v === 'string' && /^\d{1,5}$/.test(v)) return Number(v); return null; }
  function plural(n, a, b, c) { var m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c); }

  var bar = document.querySelector('.bar');
  var setBar = function () { if (bar) document.documentElement.style.setProperty('--barh', bar.offsetHeight + 'px'); };
  setBar(); window.addEventListener('resize', setBar);

  /* ---------- память браузера ---------- */
  function load() {
    var o = null, out = { fio: '', group: '', test: '', attemptId: '', answers: Object.create(null) };
    try { o = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { o = null; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
    if (str(o.fio, 120)) out.fio = o.fio;
    if (str(o.group, 40)) out.group = o.group;
    if (str(o.test, 40)) out.test = o.test;
    if (str(o.attemptId, 80) && ATT_RE.test(o.attemptId)) out.attemptId = o.attemptId;
    if (o.answers && typeof o.answers === 'object' && !Array.isArray(o.answers)) {
      Object.keys(o.answers).slice(0, 400).forEach(function (k) {
        if (k.length <= 40 && str(o.answers[k], 200)) out.answers[k] = o.answers[k];
      });
    }
    return out;
  }
  function save() { try { localStorage.setItem(LS, JSON.stringify({ fio: st.fio, group: st.group, test: st.test && st.test.id, attemptId: st.attemptId, answers: st.answers })); } catch (e) {} }
  function forget() { try { var o = load(); localStorage.setItem(LS, JSON.stringify({ fio: o.fio, group: o.group, test: o.test })); } catch (e) {} }
  function msg(t, bad) { var m = $('qz-msg'); m.textContent = t; m.classList.toggle('bad', !!bad); }

  /* ---------- адрес сервера ---------- */
  if (!URL_RE.test(URL_)) {
    $('qz-start').hidden = true;
    var off = $('qz-off'); off.hidden = false; off.textContent = '';
    off.appendChild(document.createTextNode('Тесты проходятся на сайте курса: '));
    var a = h('a', null, SITE); a.href = SITE + '#test'; a.target = '_blank'; a.rel = 'noopener noreferrer';
    off.appendChild(a);
    off.appendChild(document.createTextNode('. Если вы уже там и видите это сообщение, тесты ещё не открыты.'));
    return;
  }

  function call(payload) {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 45000) : 0;
    var opt = { method: payload ? 'POST' : 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'follow' };
    if (payload) opt.body = JSON.stringify(payload);
    if (ctl) opt.signal = ctl.signal;
    return fetch(URL_, opt).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      if (r.url && !/^https:\/\/script\.(google|googleusercontent)\.com\//.test(r.url)) throw new Error('host');
      return r.text();
    }).then(function (t) {
      clearTimeout(timer);
      if (t.length > 1000000) throw new Error('size');
      var j = JSON.parse(t);
      if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('shape');
      return j;
    }, function (e) { clearTimeout(timer); throw e; });
  }

  /* ---------- проверка ответов сервера ---------- */
  function okTest(t) {
    return !!t && typeof t === 'object' && str(t.id, 40) && /^[A-Za-z0-9_-]{1,40}$/.test(t.id) && str(t.name, 200) && t.name.length > 0 &&
      int(t.questions, 1, 500) && int(t.closed, 0, 500) && int(t.open, 0, 500) && num(t.minutes, 1, 600) && int(t.attempts, 1, 50);
  }
  function okQuestion(q) {
    if (!q || typeof q !== 'object' || !str(q.id, 40) || !q.id || q.id === '__proto__' || !str(q.topic, 300) || !str(q.text, 4000)) return false;
    if (q.type === 'open') return true;
    return Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 12 &&
      q.options.every(function (o) { return !!o && typeof o === 'object' && str(o.id, 12) && o.id.length > 0 && str(o.text, 1500); });
  }
  function okStart(r) {
    return r.ok === true && str(r.attemptId, 80) && ATT_RE.test(r.attemptId) && Array.isArray(r.questions) &&
      r.questions.length >= 1 && r.questions.length <= 300 && r.questions.every(okQuestion) &&
      num(r.deadline, 0, 1e14) && num(r.now, 0, 1e14) && int(r.attemptNo, 1, 50) && int(r.maxAttempts, 1, 50);
  }
  var ERR = {
    need_name: 'Укажите фамилию, имя и группу.',
    bad_test: 'Выберите тест из списка.',
    busy: 'Сервер тестов занят, попробуйте через минуту.',
    not_found: 'Попытка не найдена. Обновите страницу.',
    server_error: 'Ошибка на сервере тестов. Сообщите преподавателю.'
  };
  function errText(code, fallback) { return (typeof code === 'string' && Object.prototype.hasOwnProperty.call(ERR, code)) ? ERR[code] : fallback; }

  var saved = load();
  $('qz-fio').value = saved.fio;
  $('qz-group').value = saved.group;

  function describe(t) {
    if (!t) return '';
    return t.questions + ' ' + plural(t.questions, 'вопрос', 'вопроса', 'вопросов') + ': ' + t.closed + ' закр., ' + t.open + ' откр. · ' +
      t.minutes + ' мин · попыток: ' + t.attempts + (t.id === 'final' ? ' · вопросы из всех разделов, у каждого свой набор' : '');
  }
  function pick() {
    var id = $('qz-test').value;
    st.test = st.tests.filter(function (t) { return t.id === id; })[0] || null;
    $('qz-tinfo').textContent = describe(st.test);
    var cur = load();
    var resume = !!cur.attemptId && cur.test === id;
    $('qz-go').textContent = resume ? 'Продолжить попытку' : 'Начать попытку';
    if (resume) $('qz-agree').checked = true;
  }
  function fillSelect(list, empty) {
    var sel = $('qz-test'); sel.textContent = '';
    if (!list.length) { var o = h('option', null, empty); o.value = ''; sel.appendChild(o); return; }
    list.forEach(function (t) { var o = h('option', null, t.name); o.value = t.id; sel.appendChild(o); });
  }

  function loadTests() {
    $('qz-go').disabled = true;
    return call(null).then(function (res) {
      if (!Array.isArray(res.tests) || res.tests.length > 60) throw new Error('shape');
      st.tests = res.tests.filter(okTest);
      if (!st.tests.length) throw new Error('empty');
      fillSelect(st.tests);
      var want = load().test;
      if (want && st.tests.some(function (t) { return t.id === want; })) $('qz-test').value = want;
      pick(); msg('');
    }).catch(function () {
      st.tests = [];
      fillSelect([], 'Список тестов не загрузился');
      msg('Нет связи с сервером тестов. Проверьте интернет и обновите страницу.', true);
    }).then(function () { $('qz-go').disabled = false; });
  }
  $('qz-test').addEventListener('change', pick);
  loadTests();

  $('qz-go').addEventListener('click', function () {
    if (!st.tests.length) { loadTests(); return; }
    var fio = $('qz-fio').value.replace(/\s+/g, ' ').trim();
    var group = $('qz-group').value.replace(/\s+/g, ' ').trim();
    if (!st.test) return msg('Выберите тест.', true);
    if (fio.split(' ').length < 2 || fio.length > 120) return msg('Введите фамилию и имя полностью, лучше с отчеством.', true);
    if (!FIO_RE.test(fio)) return msg('В ФИО можно писать только буквы, пробел, дефис и апостроф.', true);
    if (!group) return msg('Укажите группу.', true);
    if (group.length > 40 || !GROUP_RE.test(group)) return msg('В номере группы можно писать только буквы, цифры, дефис, точку и косую черту.', true);
    if (!$('qz-agree').checked) return msg('Отметьте, что понимаете правила попыток.', true);
    $('qz-go').disabled = true; msg('Загружаю вопросы…');
    var test = st.test;
    call({ action: 'start', test: test.id, fio: fio, group: group }).then(function (res) {
      if (res.ok !== true) {
        if (res.error === 'no_attempts') {
          var list = (Array.isArray(res.results) ? res.results.slice(0, 10) : []).map(function (r) {
            if (!r || typeof r !== 'object') return '';
            var c = count(r.correct), t = count(r.total), p = count(r.percent);
            return 'попытка ' + (count(r.attemptNo) || '?') + ': ' + (c === null ? String(r.status || '').slice(0, 40) : c + ' из ' + t + ' (' + p + '%)');
          }).filter(Boolean).join('; ');
          msg('По тесту «' + test.name + '» обе попытки уже использованы' + (list ? '. Ваши результаты: ' + list + '.' : '.'), true);
        } else msg(errText(res.error, 'Не удалось начать попытку.'), true);
        return;
      }
      if (!okStart(res)) throw new Error('shape');
      st.fio = fio; st.group = group; st.attemptId = res.attemptId; st.questions = res.questions;
      st.deadline = res.deadline; st.skew = res.now - Date.now(); st.no = res.attemptNo; st.max = res.maxAttempts;
      if (okTest(res.test)) st.test = res.test;
      var prev = load();
      st.answers = prev.attemptId === res.attemptId ? prev.answers : Object.create(null);
      save(); msg(''); run(res.resumed === true);
    }).catch(function () {
      msg('Нет связи с сервером тестов. Проверьте интернет и попробуйте ещё раз.', true);
    }).then(function () { $('qz-go').disabled = false; });
  });

  /* ---------- попытка ---------- */
  function run(resumed) {
    $('qz-start').hidden = true; $('qz-done').hidden = true; $('qz-run').hidden = false;
    $('qz-who').textContent = st.fio + ', ' + st.group + ' · ' + st.test.name + ' · попытка ' + st.no + ' из ' + st.max + (resumed ? ' (продолжение)' : '');
    var grid = $('qz-grid'); grid.textContent = '';
    st.questions.forEach(function (q, k) { var b = h('button', 'qz-n', k + 1); b.type = 'button'; b.setAttribute('data-k', String(k)); grid.appendChild(b); });
    show(0); tick(); clearInterval(st.timer); st.timer = setInterval(tick, 1000);
    setBar(); root.scrollIntoView({ block: 'start' });
  }

  function remaining() { return st.deadline - (Date.now() + st.skew); }
  function tick() {
    var ms = remaining();
    if (ms <= 0) { $('qz-timer').textContent = '00:00'; clearInterval(st.timer); send(true); return; }
    var s = Math.ceil(ms / 1000);
    $('qz-timer').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    $('qz-timer').classList.toggle('low', s < 300);
  }

  function answered() { return st.questions.filter(function (q) { return !!st.answers[q.id]; }).length; }
  function marks() {
    $('qz-prog').textContent = 'отвечено ' + answered() + ' из ' + st.questions.length;
    var bs = $('qz-grid').children;
    for (var k = 0; k < bs.length; k++) {
      bs[k].classList.toggle('done', !!st.answers[st.questions[k].id]);
      bs[k].classList.toggle('cur', k === st.i);
    }
  }

  function show(k) {
    st.i = Math.max(0, Math.min(st.questions.length - 1, k));
    var q = st.questions[st.i], box = $('qz-q');
    box.textContent = '';
    box.appendChild(h('div', 'qz-meta', 'Вопрос ' + (st.i + 1) + ' из ' + st.questions.length + ' · ' + q.topic));
    box.appendChild(h('p', 'qz-text', q.text));
    if (q.type === 'open') {
      box.appendChild(h('p', 'qz-hint', 'Открытый вопрос: впишите ответ (слово, термин или число)'));
      var inp = h('input', 'qz-in');
      inp.id = 'qz-in'; inp.type = 'text'; inp.maxLength = 200; inp.spellcheck = false;
      inp.setAttribute('autocomplete', 'off'); inp.setAttribute('aria-label', 'Ваш ответ');
      inp.value = st.answers[q.id] || '';
      box.appendChild(inp);
    } else {
      box.appendChild(h('p', 'qz-hint', 'Закрытый вопрос: выберите один ответ'));
      var opts = h('div', 'qz-opts'); opts.setAttribute('role', 'radiogroup');
      q.options.forEach(function (o) {
        var lab = h('label', 'qz-opt'), r = h('input');
        r.type = 'radio'; r.name = 'qz-a'; r.value = o.id;
        if (st.answers[q.id] === o.id) r.checked = true;
        lab.appendChild(r); lab.appendChild(h('span', null, o.text));
        opts.appendChild(lab);
      });
      box.appendChild(opts);
    }
    $('qz-prev').disabled = st.i === 0;
    $('qz-next').textContent = st.i === st.questions.length - 1 ? 'К завершению' : 'Далее';
    $('qz-confirm').hidden = true;
    marks();
  }

  $('qz-grid').addEventListener('click', function (e) { var b = e.target.closest('.qz-n'); if (b) show(Number(b.getAttribute('data-k'))); });
  $('qz-q').addEventListener('change', function (e) {
    if (e.target.name !== 'qz-a') return;
    st.answers[st.questions[st.i].id] = String(e.target.value).slice(0, 12); save(); marks();
  });
  $('qz-q').addEventListener('input', function (e) {
    if (e.target.id !== 'qz-in') return;
    var id = st.questions[st.i].id, v = e.target.value.replace(/\s+/g, ' ').trim();
    if (v) st.answers[id] = e.target.value.slice(0, 200); else delete st.answers[id];
    save(); marks();
  });
  $('qz-q').addEventListener('keydown', function (e) {
    if (e.target.id === 'qz-in' && e.key === 'Enter') { e.preventDefault(); $('qz-next').click(); }
  });
  ['copy', 'cut', 'paste', 'drop', 'contextmenu'].forEach(function (ev) { $('qz-q').addEventListener(ev, function (e) { e.preventDefault(); }); });
  $('qz-prev').addEventListener('click', function () { show(st.i - 1); });
  $('qz-next').addEventListener('click', function () { if (st.i === st.questions.length - 1) ask(); else show(st.i + 1); });
  $('qz-finish').addEventListener('click', ask);
  $('qz-cancel').addEventListener('click', function () { $('qz-confirm').hidden = true; });
  $('qz-send').addEventListener('click', function () { send(false); });

  function ask() {
    var miss = st.questions.length - answered();
    $('qz-confirm-text').textContent = miss
      ? 'Без ответа осталось вопросов: ' + miss + '. Они будут засчитаны как неверные. Отправить ответы?'
      : 'Все вопросы отвечены. Отправить ответы? Изменить их после отправки будет нельзя.';
    $('qz-confirm').hidden = false;
    $('qz-confirm').scrollIntoView({ block: 'nearest' });
  }

  function send(auto) {
    if (st.sending) return;
    st.sending = true; $('qz-send').disabled = true;
    var ans = {};
    st.questions.forEach(function (q) { if (typeof st.answers[q.id] === 'string') ans[q.id] = st.answers[q.id]; });
    call({ action: 'submit', attemptId: st.attemptId, answers: ans }).then(function (res) {
      if (res.ok !== true || count(res.correct) === null || count(res.total) === null) throw new Error('fail');
      clearInterval(st.timer); st.attemptId = null; forget(); done(res, auto);
    }).catch(function () {
      $('qz-confirm-text').textContent = 'Не удалось отправить ответы: нет связи с сервером. Ответы сохранены в этом браузере, нажмите «Отправить ответы» ещё раз.';
      $('qz-confirm').hidden = false;
    }).then(function () { st.sending = false; $('qz-send').disabled = false; });
  }

  function done(res, auto) {
    $('qz-run').hidden = true;
    var d = $('qz-done'); d.hidden = false; d.textContent = '';
    var correct = count(res.correct), total = count(res.total), pct = count(res.percent);
    var no = count(res.attemptNo), left = count(res.attemptsLeft);
    d.appendChild(h('h3', null, st.test.name + ': ' + (auto ? 'время вышло, ответы отправлены' : 'ответы отправлены')));
    var sc = h('p', 'qz-score'); sc.appendChild(h('b', null, correct)); sc.appendChild(document.createTextNode(' из ' + total + (pct === null ? '' : ' · ' + pct + '%')));
    d.appendChild(sc);
    var bt = res.byType;
    if (bt && typeof bt === 'object' && bt.choice && bt.open) {
      var cc = count(bt.choice.correct), ct = count(bt.choice.total), oc = count(bt.open.correct), ot = count(bt.open.total);
      if ([cc, ct, oc, ot].every(function (x) { return x !== null; })) d.appendChild(h('p', null, 'Закрытые вопросы: ' + cc + ' из ' + ct + ' · открытые: ' + oc + ' из ' + ot));
    }
    if (res.late === true) d.appendChild(h('p', 'qz-msg bad', 'Ответы пришли после окончания времени, преподаватель увидит эту отметку.'));
    d.appendChild(h('p', null, (no === null ? '' : 'Попытка ' + no + '. ') + (left > 0 ? 'По этому тесту осталось попыток: ' + left + '.' : 'Попытки по этому тесту исчерпаны.') + ' Результат уже у преподавателя.'));
    var topics = Array.isArray(res.byTopic) ? res.byTopic.slice(0, 40).filter(function (t) { return t && str(t.topic, 300) && count(t.correct) !== null && count(t.total) !== null; }) : [];
    if (topics.length > 1) {
      var wrap = h('div', 'tbl'), tb = h('table', 'cmp'), th = h('thead'), tr = h('tr'), body = h('tbody');
      tr.appendChild(h('th', null, 'Раздел')); tr.appendChild(h('th', null, 'Верно')); th.appendChild(tr); tb.appendChild(th);
      topics.forEach(function (t) { var row = h('tr'); row.appendChild(h('td', null, t.topic)); row.appendChild(h('td', null, count(t.correct) + ' из ' + count(t.total))); body.appendChild(row); });
      tb.appendChild(body); wrap.appendChild(tb); d.appendChild(wrap);
    }
    var p = h('p'), back = h('button', 'btn', 'К выбору теста'); back.type = 'button'; p.appendChild(back); d.appendChild(p);
    back.addEventListener('click', function () { d.hidden = true; $('qz-start').hidden = false; $('qz-agree').checked = false; pick(); root.scrollIntoView({ block: 'start' }); });
    d.scrollIntoView({ block: 'start' });
  }
})();

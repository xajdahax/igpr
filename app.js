// Защита от встраивания сайта в чужую страницу (кликджекинг): внутри чужой рамки страница не показывается.
if (window.top !== window.self) {
  document.documentElement.hidden = true;
  try { window.top.location.replace(window.self.location.href); } catch (e) {}
}

// Поиск по хабу и фильтр глоссария по периодам. Разметка готова заранее, скрипт только прячет и показывает блоки.
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  var q = document.getElementById('q');
  var count = document.getElementById('count');
  var gl = document.getElementById('gloss');
  var empty = document.getElementById('gloss-empty');
  if (!q || !count || !gl) return;
  var total = gl.querySelectorAll('.term').length;
  var period = 'all';

  function norm(s) { return String(s).toLowerCase().replace(/ё/g, 'е'); }
  function plural(n, a, b, c) { var m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c); }

  function apply() {
    var v = norm(q.value.trim()).slice(0, 100);
    var shown = 0;
    var items = document.querySelectorAll('.s');
    for (var i = 0; i < items.length; i++) {
      var el = items[i];
      var okText = !v || norm(el.textContent).indexOf(v) > -1;
      var okPer = !el.classList.contains('term') || period === 'all' || el.getAttribute('data-p') === period;
      el.hidden = !(okText && okPer);
      if (!el.hidden) shown++;
      if (v && okText && el.tagName === 'DETAILS') el.open = true;
    }
    var groups = document.querySelectorAll('.group');
    for (var k = 0; k < groups.length; k++) groups[k].hidden = !groups[k].querySelector('.s:not([hidden])');
    if (empty) empty.hidden = !!gl.querySelector('.term:not([hidden])');
    count.textContent = v ? 'найдено: ' + shown : total + ' ' + plural(total, 'термин', 'термина', 'терминов');
  }

  q.addEventListener('input', apply);
  var chips = document.querySelectorAll('.chip');
  for (var c = 0; c < chips.length; c++) {
    chips[c].addEventListener('click', function (e) {
      var b = e.currentTarget;
      period = b.getAttribute('data-p') || 'all';
      for (var j = 0; j < chips.length; j++) chips[j].setAttribute('aria-pressed', String(chips[j] === b));
      apply();
    });
  }
  apply();
});

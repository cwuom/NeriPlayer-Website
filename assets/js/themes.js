(function () {
  'use strict';
  var NP = window.NP;
  var root = document.documentElement;
  var style = 'clean';
  var descriptions;

  function updateChoices() {
    NP.$$('[data-app-theme-group]').forEach(function (group) {
      var target = document.getElementById(group.dataset.appThemeTarget || '');
      var current = target ? target.dataset.appStyle : style;
      NP.$$('[data-app-style]', group).forEach(function (button) {
        var selected = button.getAttribute('data-app-style') === current;
        button.classList.toggle('is-on', selected);
        button.setAttribute('aria-checked', String(selected));
        button.tabIndex = selected ? 0 : -1;
      });
    });
  }

  function select(value) {
    style = value === 'material' ? 'material' : 'clean';
    root.setAttribute('data-app-style', style);
    NP.$$('.ph').forEach(function (ph) { ph.dataset.appStyle = ph.dataset.appStyleOverride || style; });
    updateChoices();
    NP.$$('[data-theme-description]').forEach(function (el) { el.textContent = descriptions[style]; });
    document.dispatchEvent(new CustomEvent('np-app-style'));
  }

  function selectLocal(id, value) {
    var ph = document.getElementById(id);
    if (!ph) return;
    ph.dataset.appStyleOverride = value === 'material' ? 'material' : 'clean';
    ph.dataset.appStyle = ph.dataset.appStyleOverride;
    updateChoices();
    document.dispatchEvent(new CustomEvent('np-app-style', { detail: { target: id } }));
  }
  function choose(group, value) {
    if (group.dataset.appThemeTarget) selectLocal(group.dataset.appThemeTarget, value);
    else select(value);
  }

  NP.themes = {
    select: select,
    selectLocal: selectLocal,
    init: function () {
      descriptions = {
        clean: NP.L('Clean 用中性色、清晰的字重和悬浮玻璃底栏，让封面与音乐站到前面。', 'Clean brings your music forward with neutral surfaces, clear typography and a floating glass navigation bar.'),
        material: NP.L('Material You 用动态色彩、圆角卡片与熟悉的底部导航，延续原生 Android 的亲切感。', 'Material You pairs dynamic color with rounded cards and familiar navigation for a native Android feel.'),
      };
      NP.$$('[data-app-theme-group]').forEach(function (group) {
        var buttons = NP.$$('[data-app-style]', group);
        buttons.forEach(function (button, index) {
          button.addEventListener('click', function () { choose(group, button.getAttribute('data-app-style')); });
          button.addEventListener('keydown', function (event) {
            var next = index;
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % buttons.length;
            else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + buttons.length - 1) % buttons.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = buttons.length - 1;
            else return;
            event.preventDefault();
            choose(group, buttons[next].getAttribute('data-app-style'));
            buttons[next].focus();
          });
        });
      });
      select(style);
    },
  };
})();

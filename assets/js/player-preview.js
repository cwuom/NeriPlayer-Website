(function () {
  'use strict';
  var NP = window.NP;
  var pages = ['cover', 'lyrics'];
  var unavailable = '[data-ph-more],[data-ph-collapse],[data-ph-timer],[data-ph-volume],[data-ph-add],[data-ph-repeat],.sh-q__more,.sh-q__fab';
  function lockUnavailable(phone) {
    function refresh() {
      if (!phone.hasAttribute('data-player-demo')) return;
      phone.querySelectorAll(unavailable).forEach(function (control) {
        control.dataset.playerDisabled = '';
        control.disabled = true;
      });
    }
    refresh();
    new MutationObserver(refresh).observe(phone, { childList: true, subtree: true });
    ['pointerdown', 'pointerup', 'click', 'dblclick', 'contextmenu', 'keydown'].forEach(function (type) {
      phone.addEventListener(type, function (event) {
        if (!event.target.closest('[data-player-disabled]')) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      }, true);
    });
  }
  function syncPage() {
    var page = document.getElementById('phPlay').classList.contains('is-lyrics') ? 'lyrics' : 'cover';
    document.querySelectorAll('[data-player-page]').forEach(function (button) {
      var selected = button.dataset.playerPage === page;
      button.classList.toggle('is-on', selected);
      button.setAttribute('aria-checked', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
  }
  function selectPage(page) {
    var phone = document.getElementById('phPlay');
    var ui = NP.phoneUI.uis.find(function (candidate) { return candidate.ph === phone; });
    if (ui) ui.setPage(page === 'lyrics');
    syncPage();
  }
  NP.playerPreview = {
    restrict: function (phone) {
      phone.setAttribute('data-player-demo', '');
      lockUnavailable(phone);
    },
    init: function () {
      document.querySelectorAll('[data-player-demo]').forEach(lockUnavailable);
      document.querySelectorAll('[data-player-page]').forEach(function (button, index) {
        button.addEventListener('click', function () { selectPage(button.dataset.playerPage); });
        button.addEventListener('keydown', function (event) {
          var next = index;
          if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % pages.length;
          else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + pages.length - 1) % pages.length;
          else if (event.key === 'Home') next = 0;
          else if (event.key === 'End') next = pages.length - 1;
          else return;
          event.preventDefault(); selectPage(pages[next]);
          document.querySelector('[data-player-page="' + pages[next] + '"]').focus();
        });
      });
      new MutationObserver(syncPage).observe(document.getElementById('phPlay'), { attributes: true, attributeFilter: ['class'] });
      syncPage();
    }
  };
}());

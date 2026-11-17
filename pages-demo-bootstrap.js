(function () {
  'use strict';
  window.__PAGES_DEMO__ = true;

  function sqlRows(url, sql) {
    return window.DemoSqlEngine ? DemoSqlEngine.runForUrl(url, sql) : [];
  }

  window.domo = {
    post: function (url, sql) {
      return Promise.resolve(sqlRows(url, sql));
    },
    get: function () { return Promise.resolve([]); }
  };

  (function patchXhr() {
    var open = XMLHttpRequest.prototype.open;
    var send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__demoUrl = url;
      return open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
      var url = this.__demoUrl || '';
      if (/\/sql\/v1\//i.test(url) && typeof body === 'string') {
        var rows = sqlRows(url, body);
        var self = this;
        setTimeout(function () {
          Object.defineProperty(self, 'status', { value: 200 });
          Object.defineProperty(self, 'responseText', { value: JSON.stringify(rows) });
          Object.defineProperty(self, 'readyState', { value: 4 });
          if (typeof self.onload === 'function') self.onload();
        }, 5);
        return;
      }
      return send.apply(this, arguments);
    };
  })();
})();
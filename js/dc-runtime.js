/* between pages and flowers: tiny page runtime.
   Renders each page's <template id="dc-template"> with its Component's renderVals(),
   supports {{holes}}, <sc-for>, <sc-if> and onClick, and patches the page with morphdom
   so animations keep running when something on the page changes. */
(function () {
  var registry = {};
  var nextId = 0;
  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;

  function lookup(path, scope) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return parseFloat(path);
    if (/^'.*'$/.test(path) || /^".*"$/.test(path)) return path.slice(1, -1);
    var parts = path.split('.');
    var v = scope;
    for (var i = 0; i < parts.length; i++) {
      if (v == null) return undefined;
      v = v[parts[i]];
    }
    return v;
  }

  function interp(str, scope) {
    return str.replace(HOLE, function (_, p) {
      var v = lookup(p, scope);
      return v == null ? '' : String(v);
    });
  }

  function renderChildren(parent, out, scope) {
    for (var c = parent.firstChild; c; c = c.nextSibling) renderNode(c, out, scope);
  }

  function renderNode(node, out, scope) {
    if (node.nodeType === 3) {
      out.appendChild(document.createTextNode(interp(node.nodeValue, scope)));
      return;
    }
    if (node.nodeType !== 1) return;
    var tag = node.localName;
    if (tag === 'sc-for') {
      var m = WHOLE.exec(node.getAttribute('list') || '');
      var list = m ? lookup(m[1], scope) : [];
      var as = node.getAttribute('as') || 'item';
      (list || []).forEach(function (item, idx) {
        var s = Object.create(scope);
        s[as] = item;
        s.$index = idx;
        renderChildren(node, out, s);
      });
      return;
    }
    if (tag === 'sc-if') {
      var m2 = WHOLE.exec(node.getAttribute('value') || '');
      var val = m2 ? lookup(m2[1], scope) : node.getAttribute('value');
      if (val) renderChildren(node, out, scope);
      return;
    }
    var el = document.importNode(node, false);
    for (var i = el.attributes.length - 1; i >= 0; i--) {
      var a = el.attributes[i];
      var name = a.name;
      if (name.indexOf('hint-') === 0) { el.removeAttribute(name); continue; }
      if (/^on[a-z]+$/.test(name)) {
        var mm = WHOLE.exec(a.value);
        el.removeAttribute(name);
        if (mm) {
          var fn = lookup(mm[1], scope);
          if (typeof fn === 'function') {
            var id = 'h' + (nextId++);
            registry[id] = fn;
            el.setAttribute('data-dc-' + name.slice(2), id);
          }
        }
        continue;
      }
      if (a.value.indexOf('{{') >= 0) el.setAttribute(name, interp(a.value, scope));
    }
    renderChildren(node, el, scope);
    out.appendChild(el);
  }

  function DCLogic(props) {
    this.props = props || {};
    this.state = {};
  }
  DCLogic.prototype.setState = function (patch, cb) {
    var p = typeof patch === 'function' ? patch(this.state, this.props) : patch;
    this.state = Object.assign({}, this.state, p);
    if (this.__render) this.__render();
    if (typeof cb === 'function') cb();
  };
  DCLogic.prototype.forceUpdate = function () { if (this.__render) this.__render(); };
  window.DCLogic = DCLogic;

  ['click', 'change', 'input'].forEach(function (type) {
    document.addEventListener(type, function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-dc-' + type + ']') : null;
      if (!t) return;
      var fn = registry[t.getAttribute('data-dc-' + type)];
      if (fn) fn(e);
    });
  });

  window.dcBoot = function (Comp) {
    var tpl = document.getElementById('dc-template');
    var root = document.getElementById('dc-root');
    var inst = new Comp({});
    var mounted = false;
    inst.__render = function () {
      registry = {};
      nextId = 0;
      var vals = inst.renderVals();
      var next = document.createElement('div');
      next.id = 'dc-root';
      renderChildren(tpl.content, next, vals);
      if (!mounted) {
        root.parentNode.replaceChild(next, root);
        root = next;
        mounted = true;
        if (inst.componentDidMount) inst.componentDidMount();
      } else {
        window.morphdom(root, next, {
          onBeforeElUpdated: function (fromEl, toEl) { return !fromEl.isEqualNode(toEl); }
        });
        if (inst.componentDidUpdate) inst.componentDidUpdate();
      }
    };
    inst.__render();
  };
})();

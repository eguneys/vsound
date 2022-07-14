var VSound = (function () {
  'use strict';

  const sharedConfig = {};
  function setHydrateContext(context) {
    sharedConfig.context = context;
  }

  const equalFn = (a, b) => a === b;
  const $PROXY = Symbol("solid-proxy");
  const $TRACK = Symbol("solid-track");
  const signalOptions = {
    equals: equalFn
  };
  let runEffects = runQueue;
  const NOTPENDING = {};
  const STALE = 1;
  const PENDING = 2;
  const UNOWNED = {
    owned: null,
    cleanups: null,
    context: null,
    owner: null
  };
  var Owner = null;
  let Transition = null;
  let Listener = null;
  let Pending = null;
  let Updates = null;
  let Effects = null;
  let ExecCount = 0;
  function createRoot(fn, detachedOwner) {
    const listener = Listener,
          owner = Owner,
          unowned = fn.length === 0,
          root = unowned && !false ? UNOWNED : {
      owned: null,
      cleanups: null,
      context: null,
      owner: detachedOwner || owner
    },
          updateFn = unowned ? fn : () => fn(() => cleanNode(root));
    Owner = root;
    Listener = null;
    try {
      return runUpdates(updateFn, true);
    } finally {
      Listener = listener;
      Owner = owner;
    }
  }
  function createSignal(value, options) {
    options = options ? Object.assign({}, signalOptions, options) : signalOptions;
    const s = {
      value,
      observers: null,
      observerSlots: null,
      pending: NOTPENDING,
      comparator: options.equals || undefined
    };
    const setter = value => {
      if (typeof value === "function") {
        value = value(s.pending !== NOTPENDING ? s.pending : s.value);
      }
      return writeSignal(s, value);
    };
    return [readSignal.bind(s), setter];
  }
  function createRenderEffect(fn, value, options) {
    const c = createComputation(fn, value, false, STALE);
    updateComputation(c);
  }
  function createEffect(fn, value, options) {
    runEffects = runUserEffects;
    const c = createComputation(fn, value, false, STALE);
    c.user = true;
    Effects ? Effects.push(c) : updateComputation(c);
  }
  function createMemo(fn, value, options) {
    options = options ? Object.assign({}, signalOptions, options) : signalOptions;
    const c = createComputation(fn, value, true, 0);
    c.pending = NOTPENDING;
    c.observers = null;
    c.observerSlots = null;
    c.comparator = options.equals || undefined;
    updateComputation(c);
    return readSignal.bind(c);
  }
  function batch(fn) {
    if (Pending) return fn();
    let result;
    const q = Pending = [];
    try {
      result = fn();
    } finally {
      Pending = null;
    }
    runUpdates(() => {
      for (let i = 0; i < q.length; i += 1) {
        const data = q[i];
        if (data.pending !== NOTPENDING) {
          const pending = data.pending;
          data.pending = NOTPENDING;
          writeSignal(data, pending);
        }
      }
    }, false);
    return result;
  }
  function untrack(fn) {
    let result,
        listener = Listener;
    Listener = null;
    result = fn();
    Listener = listener;
    return result;
  }
  function on(deps, fn, options) {
    const isArray = Array.isArray(deps);
    let prevInput;
    let defer = options && options.defer;
    return prevValue => {
      let input;
      if (isArray) {
        input = Array(deps.length);
        for (let i = 0; i < deps.length; i++) input[i] = deps[i]();
      } else input = deps();
      if (defer) {
        defer = false;
        return undefined;
      }
      const result = untrack(() => fn(input, prevInput, prevValue));
      prevInput = input;
      return result;
    };
  }
  function onCleanup(fn) {
    if (Owner === null) ;else if (Owner.cleanups === null) Owner.cleanups = [fn];else Owner.cleanups.push(fn);
    return fn;
  }
  function getOwner() {
    return Owner;
  }
  function readSignal() {
    const runningTransition = Transition ;
    if (this.sources && (this.state || runningTransition )) {
      const updates = Updates;
      Updates = null;
      this.state === STALE || runningTransition  ? updateComputation(this) : lookUpstream(this);
      Updates = updates;
    }
    if (Listener) {
      const sSlot = this.observers ? this.observers.length : 0;
      if (!Listener.sources) {
        Listener.sources = [this];
        Listener.sourceSlots = [sSlot];
      } else {
        Listener.sources.push(this);
        Listener.sourceSlots.push(sSlot);
      }
      if (!this.observers) {
        this.observers = [Listener];
        this.observerSlots = [Listener.sources.length - 1];
      } else {
        this.observers.push(Listener);
        this.observerSlots.push(Listener.sources.length - 1);
      }
    }
    return this.value;
  }
  function writeSignal(node, value, isComp) {
    if (Pending) {
      if (node.pending === NOTPENDING) Pending.push(node);
      node.pending = value;
      return value;
    }
    if (node.comparator) {
      if (node.comparator(node.value, value)) return value;
    }
    let TransitionRunning = false;
    node.value = value;
    if (node.observers && node.observers.length) {
      runUpdates(() => {
        for (let i = 0; i < node.observers.length; i += 1) {
          const o = node.observers[i];
          if (TransitionRunning && Transition.disposed.has(o)) ;
          if (TransitionRunning && !o.tState || !TransitionRunning && !o.state) {
            if (o.pure) Updates.push(o);else Effects.push(o);
            if (o.observers) markDownstream(o);
          }
          if (TransitionRunning) ;else o.state = STALE;
        }
        if (Updates.length > 10e5) {
          Updates = [];
          if (false) ;
          throw new Error();
        }
      }, false);
    }
    return value;
  }
  function updateComputation(node) {
    if (!node.fn) return;
    cleanNode(node);
    const owner = Owner,
          listener = Listener,
          time = ExecCount;
    Listener = Owner = node;
    runComputation(node, node.value, time);
    Listener = listener;
    Owner = owner;
  }
  function runComputation(node, value, time) {
    let nextValue;
    try {
      nextValue = node.fn(value);
    } catch (err) {
      handleError(err);
    }
    if (!node.updatedAt || node.updatedAt <= time) {
      if (node.observers && node.observers.length) {
        writeSignal(node, nextValue);
      } else node.value = nextValue;
      node.updatedAt = time;
    }
  }
  function createComputation(fn, init, pure, state = STALE, options) {
    const c = {
      fn,
      state: state,
      updatedAt: null,
      owned: null,
      sources: null,
      sourceSlots: null,
      cleanups: null,
      value: init,
      owner: Owner,
      context: null,
      pure
    };
    if (Owner === null) ;else if (Owner !== UNOWNED) {
      {
        if (!Owner.owned) Owner.owned = [c];else Owner.owned.push(c);
      }
    }
    return c;
  }
  function runTop(node) {
    const runningTransition = Transition ;
    if (node.state === 0 || runningTransition ) return;
    if (node.state === PENDING || runningTransition ) return lookUpstream(node);
    if (node.suspense && untrack(node.suspense.inFallback)) return node.suspense.effects.push(node);
    const ancestors = [node];
    while ((node = node.owner) && (!node.updatedAt || node.updatedAt < ExecCount)) {
      if (node.state || runningTransition ) ancestors.push(node);
    }
    for (let i = ancestors.length - 1; i >= 0; i--) {
      node = ancestors[i];
      if (node.state === STALE || runningTransition ) {
        updateComputation(node);
      } else if (node.state === PENDING || runningTransition ) {
        const updates = Updates;
        Updates = null;
        lookUpstream(node, ancestors[0]);
        Updates = updates;
      }
    }
  }
  function runUpdates(fn, init) {
    if (Updates) return fn();
    let wait = false;
    if (!init) Updates = [];
    if (Effects) wait = true;else Effects = [];
    ExecCount++;
    try {
      const res = fn();
      completeUpdates(wait);
      return res;
    } catch (err) {
      if (!Updates) Effects = null;
      handleError(err);
    }
  }
  function completeUpdates(wait) {
    if (Updates) {
      runQueue(Updates);
      Updates = null;
    }
    if (wait) return;
    if (Effects.length) batch(() => {
      runEffects(Effects);
      Effects = null;
    });else {
      Effects = null;
    }
  }
  function runQueue(queue) {
    for (let i = 0; i < queue.length; i++) runTop(queue[i]);
  }
  function runUserEffects(queue) {
    let i,
        userLength = 0;
    for (i = 0; i < queue.length; i++) {
      const e = queue[i];
      if (!e.user) runTop(e);else queue[userLength++] = e;
    }
    if (sharedConfig.context) setHydrateContext();
    const resume = queue.length;
    for (i = 0; i < userLength; i++) runTop(queue[i]);
    for (i = resume; i < queue.length; i++) runTop(queue[i]);
  }
  function lookUpstream(node, ignore) {
    const runningTransition = Transition ;
    node.state = 0;
    for (let i = 0; i < node.sources.length; i += 1) {
      const source = node.sources[i];
      if (source.sources) {
        if (source.state === STALE || runningTransition ) {
          if (source !== ignore) runTop(source);
        } else if (source.state === PENDING || runningTransition ) lookUpstream(source, ignore);
      }
    }
  }
  function markDownstream(node) {
    const runningTransition = Transition ;
    for (let i = 0; i < node.observers.length; i += 1) {
      const o = node.observers[i];
      if (!o.state || runningTransition ) {
        o.state = PENDING;
        if (o.pure) Updates.push(o);else Effects.push(o);
        o.observers && markDownstream(o);
      }
    }
  }
  function cleanNode(node) {
    let i;
    if (node.sources) {
      while (node.sources.length) {
        const source = node.sources.pop(),
              index = node.sourceSlots.pop(),
              obs = source.observers;
        if (obs && obs.length) {
          const n = obs.pop(),
                s = source.observerSlots.pop();
          if (index < obs.length) {
            n.sourceSlots[s] = index;
            obs[index] = n;
            source.observerSlots[index] = s;
          }
        }
      }
    }
    if (node.owned) {
      for (i = 0; i < node.owned.length; i++) cleanNode(node.owned[i]);
      node.owned = null;
    }
    if (node.cleanups) {
      for (i = 0; i < node.cleanups.length; i++) node.cleanups[i]();
      node.cleanups = null;
    }
    node.state = 0;
    node.context = null;
  }
  function handleError(err) {
    throw err;
  }

  const FALLBACK = Symbol("fallback");
  function dispose(d) {
    for (let i = 0; i < d.length; i++) d[i]();
  }
  function mapArray(list, mapFn, options = {}) {
    let items = [],
        mapped = [],
        disposers = [],
        len = 0,
        indexes = mapFn.length > 1 ? [] : null;
    onCleanup(() => dispose(disposers));
    return () => {
      let newItems = list() || [],
          i,
          j;
      newItems[$TRACK];
      return untrack(() => {
        let newLen = newItems.length,
            newIndices,
            newIndicesNext,
            temp,
            tempdisposers,
            tempIndexes,
            start,
            end,
            newEnd,
            item;
        if (newLen === 0) {
          if (len !== 0) {
            dispose(disposers);
            disposers = [];
            items = [];
            mapped = [];
            len = 0;
            indexes && (indexes = []);
          }
          if (options.fallback) {
            items = [FALLBACK];
            mapped[0] = createRoot(disposer => {
              disposers[0] = disposer;
              return options.fallback();
            });
            len = 1;
          }
        }
        else if (len === 0) {
          mapped = new Array(newLen);
          for (j = 0; j < newLen; j++) {
            items[j] = newItems[j];
            mapped[j] = createRoot(mapper);
          }
          len = newLen;
        } else {
          temp = new Array(newLen);
          tempdisposers = new Array(newLen);
          indexes && (tempIndexes = new Array(newLen));
          for (start = 0, end = Math.min(len, newLen); start < end && items[start] === newItems[start]; start++);
          for (end = len - 1, newEnd = newLen - 1; end >= start && newEnd >= start && items[end] === newItems[newEnd]; end--, newEnd--) {
            temp[newEnd] = mapped[end];
            tempdisposers[newEnd] = disposers[end];
            indexes && (tempIndexes[newEnd] = indexes[end]);
          }
          newIndices = new Map();
          newIndicesNext = new Array(newEnd + 1);
          for (j = newEnd; j >= start; j--) {
            item = newItems[j];
            i = newIndices.get(item);
            newIndicesNext[j] = i === undefined ? -1 : i;
            newIndices.set(item, j);
          }
          for (i = start; i <= end; i++) {
            item = items[i];
            j = newIndices.get(item);
            if (j !== undefined && j !== -1) {
              temp[j] = mapped[i];
              tempdisposers[j] = disposers[i];
              indexes && (tempIndexes[j] = indexes[i]);
              j = newIndicesNext[j];
              newIndices.set(item, j);
            } else disposers[i]();
          }
          for (j = start; j < newLen; j++) {
            if (j in temp) {
              mapped[j] = temp[j];
              disposers[j] = tempdisposers[j];
              if (indexes) {
                indexes[j] = tempIndexes[j];
                indexes[j](j);
              }
            } else mapped[j] = createRoot(mapper);
          }
          mapped = mapped.slice(0, len = newLen);
          items = newItems.slice(0);
        }
        return mapped;
      });
      function mapper(disposer) {
        disposers[j] = disposer;
        if (indexes) {
          const [s, set] = createSignal(j);
          indexes[j] = set;
          return mapFn(newItems[j], s);
        }
        return mapFn(newItems[j]);
      }
    };
  }
  function createComponent(Comp, props) {
    return untrack(() => Comp(props || {}));
  }
  function trueFn() {
    return true;
  }
  const propTraps = {
    get(_, property, receiver) {
      if (property === $PROXY) return receiver;
      return _.get(property);
    },
    has(_, property) {
      return _.has(property);
    },
    set: trueFn,
    deleteProperty: trueFn,
    getOwnPropertyDescriptor(_, property) {
      return {
        configurable: true,
        enumerable: true,
        get() {
          return _.get(property);
        },
        set: trueFn,
        deleteProperty: trueFn
      };
    },
    ownKeys(_) {
      return _.keys();
    }
  };
  function splitProps(props, ...keys) {
    const blocked = new Set(keys.flat());
    const descriptors = Object.getOwnPropertyDescriptors(props);
    const res = keys.map(k => {
      const clone = {};
      for (let i = 0; i < k.length; i++) {
        const key = k[i];
        Object.defineProperty(clone, key, descriptors[key] ? descriptors[key] : {
          get() {
            return props[key];
          },
          set() {
            return true;
          }
        });
      }
      return clone;
    });
    res.push(new Proxy({
      get(property) {
        return blocked.has(property) ? undefined : props[property];
      },
      has(property) {
        return blocked.has(property) ? false : property in props;
      },
      keys() {
        return Object.keys(props).filter(k => !blocked.has(k));
      }
    }, propTraps));
    return res;
  }

  function For(props) {
    const fallback = "fallback" in props && {
      fallback: () => props.fallback
    };
    return createMemo(mapArray(() => props.each, props.children, fallback ? fallback : undefined));
  }
  function Show(props) {
    let strictEqual = false;
    const condition = createMemo(() => props.when, undefined, {
      equals: (a, b) => strictEqual ? a === b : !a === !b
    });
    return createMemo(() => {
      const c = condition();
      if (c) {
        const child = props.children;
        return (strictEqual = typeof child === "function" && child.length > 0) ? untrack(() => child(c)) : child;
      }
      return props.fallback;
    });
  }

  const booleans = ["allowfullscreen", "async", "autofocus", "autoplay", "checked", "controls", "default", "disabled", "formnovalidate", "hidden", "indeterminate", "ismap", "loop", "multiple", "muted", "nomodule", "novalidate", "open", "playsinline", "readonly", "required", "reversed", "seamless", "selected"];
  const Properties = /*#__PURE__*/new Set(["className", "value", "readOnly", "formNoValidate", "isMap", "noModule", "playsInline", ...booleans]);
  const ChildProperties = /*#__PURE__*/new Set(["innerHTML", "textContent", "innerText", "children"]);
  const Aliases = {
    className: "class",
    htmlFor: "for"
  };
  const PropAliases = {
    class: "className",
    formnovalidate: "formNoValidate",
    ismap: "isMap",
    nomodule: "noModule",
    playsinline: "playsInline",
    readonly: "readOnly"
  };
  const DelegatedEvents = /*#__PURE__*/new Set(["beforeinput", "click", "dblclick", "contextmenu", "focusin", "focusout", "input", "keydown", "keyup", "mousedown", "mousemove", "mouseout", "mouseover", "mouseup", "pointerdown", "pointermove", "pointerout", "pointerover", "pointerup", "touchend", "touchmove", "touchstart"]);
  const SVGElements = /*#__PURE__*/new Set([
  "altGlyph", "altGlyphDef", "altGlyphItem", "animate", "animateColor", "animateMotion", "animateTransform", "circle", "clipPath", "color-profile", "cursor", "defs", "desc", "ellipse", "feBlend", "feColorMatrix", "feComponentTransfer", "feComposite", "feConvolveMatrix", "feDiffuseLighting", "feDisplacementMap", "feDistantLight", "feFlood", "feFuncA", "feFuncB", "feFuncG", "feFuncR", "feGaussianBlur", "feImage", "feMerge", "feMergeNode", "feMorphology", "feOffset", "fePointLight", "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence", "filter", "font", "font-face", "font-face-format", "font-face-name", "font-face-src", "font-face-uri", "foreignObject", "g", "glyph", "glyphRef", "hkern", "image", "line", "linearGradient", "marker", "mask", "metadata", "missing-glyph", "mpath", "path", "pattern", "polygon", "polyline", "radialGradient", "rect",
  "set", "stop",
  "svg", "switch", "symbol", "text", "textPath",
  "tref", "tspan", "use", "view", "vkern"]);
  const SVGNamespace = {
    xlink: "http://www.w3.org/1999/xlink",
    xml: "http://www.w3.org/XML/1998/namespace"
  };

  function reconcileArrays(parentNode, a, b) {
    let bLength = b.length,
        aEnd = a.length,
        bEnd = bLength,
        aStart = 0,
        bStart = 0,
        after = a[aEnd - 1].nextSibling,
        map = null;
    while (aStart < aEnd || bStart < bEnd) {
      if (a[aStart] === b[bStart]) {
        aStart++;
        bStart++;
        continue;
      }
      while (a[aEnd - 1] === b[bEnd - 1]) {
        aEnd--;
        bEnd--;
      }
      if (aEnd === aStart) {
        const node = bEnd < bLength ? bStart ? b[bStart - 1].nextSibling : b[bEnd - bStart] : after;
        while (bStart < bEnd) parentNode.insertBefore(b[bStart++], node);
      } else if (bEnd === bStart) {
        while (aStart < aEnd) {
          if (!map || !map.has(a[aStart])) a[aStart].remove();
          aStart++;
        }
      } else if (a[aStart] === b[bEnd - 1] && b[bStart] === a[aEnd - 1]) {
        const node = a[--aEnd].nextSibling;
        parentNode.insertBefore(b[bStart++], a[aStart++].nextSibling);
        parentNode.insertBefore(b[--bEnd], node);
        a[aEnd] = b[bEnd];
      } else {
        if (!map) {
          map = new Map();
          let i = bStart;
          while (i < bEnd) map.set(b[i], i++);
        }
        const index = map.get(a[aStart]);
        if (index != null) {
          if (bStart < index && index < bEnd) {
            let i = aStart,
                sequence = 1,
                t;
            while (++i < aEnd && i < bEnd) {
              if ((t = map.get(a[i])) == null || t !== index + sequence) break;
              sequence++;
            }
            if (sequence > index - bStart) {
              const node = a[aStart];
              while (bStart < index) parentNode.insertBefore(b[bStart++], node);
            } else parentNode.replaceChild(b[bStart++], a[aStart++]);
          } else aStart++;
        } else a[aStart++].remove();
      }
    }
  }

  const $$EVENTS = "_$DX_DELEGATE";
  function render(code, element, init) {
    let disposer;
    createRoot(dispose => {
      disposer = dispose;
      element === document ? code() : insert(element, code(), element.firstChild ? null : undefined, init);
    });
    return () => {
      disposer();
      element.textContent = "";
    };
  }
  function template(html, check, isSVG) {
    const t = document.createElement("template");
    t.innerHTML = html;
    let node = t.content.firstChild;
    if (isSVG) node = node.firstChild;
    return node;
  }
  function delegateEvents(eventNames, document = window.document) {
    const e = document[$$EVENTS] || (document[$$EVENTS] = new Set());
    for (let i = 0, l = eventNames.length; i < l; i++) {
      const name = eventNames[i];
      if (!e.has(name)) {
        e.add(name);
        document.addEventListener(name, eventHandler);
      }
    }
  }
  function setAttribute(node, name, value) {
    if (value == null) node.removeAttribute(name);else node.setAttribute(name, value);
  }
  function setAttributeNS(node, namespace, name, value) {
    if (value == null) node.removeAttributeNS(namespace, name);else node.setAttributeNS(namespace, name, value);
  }
  function className(node, value) {
    if (value == null) node.removeAttribute("class");else node.className = value;
  }
  function addEventListener(node, name, handler, delegate) {
    if (delegate) {
      if (Array.isArray(handler)) {
        node[`$$${name}`] = handler[0];
        node[`$$${name}Data`] = handler[1];
      } else node[`$$${name}`] = handler;
    } else if (Array.isArray(handler)) {
      const handlerFn = handler[0];
      node.addEventListener(name, handler[0] = e => handlerFn.call(node, handler[1], e));
    } else node.addEventListener(name, handler);
  }
  function classList(node, value, prev = {}) {
    const classKeys = Object.keys(value || {}),
          prevKeys = Object.keys(prev);
    let i, len;
    for (i = 0, len = prevKeys.length; i < len; i++) {
      const key = prevKeys[i];
      if (!key || key === "undefined" || value[key]) continue;
      toggleClassKey(node, key, false);
      delete prev[key];
    }
    for (i = 0, len = classKeys.length; i < len; i++) {
      const key = classKeys[i],
            classValue = !!value[key];
      if (!key || key === "undefined" || prev[key] === classValue || !classValue) continue;
      toggleClassKey(node, key, true);
      prev[key] = classValue;
    }
    return prev;
  }
  function style(node, value, prev = {}) {
    const nodeStyle = node.style;
    const prevString = typeof prev === "string";
    if (value == null && prevString || typeof value === "string") return nodeStyle.cssText = value;
    prevString && (nodeStyle.cssText = undefined, prev = {});
    value || (value = {});
    let v, s;
    for (s in prev) {
      value[s] == null && nodeStyle.removeProperty(s);
      delete prev[s];
    }
    for (s in value) {
      v = value[s];
      if (v !== prev[s]) {
        nodeStyle.setProperty(s, v);
        prev[s] = v;
      }
    }
    return prev;
  }
  function spread(node, accessor, isSVG, skipChildren) {
    if (typeof accessor === "function") {
      createRenderEffect(current => spreadExpression(node, accessor(), current, isSVG, skipChildren));
    } else spreadExpression(node, accessor, undefined, isSVG, skipChildren);
  }
  function insert(parent, accessor, marker, initial) {
    if (marker !== undefined && !initial) initial = [];
    if (typeof accessor !== "function") return insertExpression(parent, accessor, initial, marker);
    createRenderEffect(current => insertExpression(parent, accessor(), current, marker), initial);
  }
  function assign(node, props, isSVG, skipChildren, prevProps = {}, skipRef = false) {
    props || (props = {});
    for (const prop in prevProps) {
      if (!(prop in props)) {
        if (prop === "children") continue;
        assignProp(node, prop, null, prevProps[prop], isSVG, skipRef);
      }
    }
    for (const prop in props) {
      if (prop === "children") {
        if (!skipChildren) insertExpression(node, props.children);
        continue;
      }
      const value = props[prop];
      prevProps[prop] = assignProp(node, prop, value, prevProps[prop], isSVG, skipRef);
    }
  }
  function getNextElement(template) {
    let node, key;
    if (!sharedConfig.context || !(node = sharedConfig.registry.get(key = getHydrationKey()))) {
      return template.cloneNode(true);
    }
    if (sharedConfig.completed) sharedConfig.completed.add(node);
    sharedConfig.registry.delete(key);
    return node;
  }
  function toPropertyName(name) {
    return name.toLowerCase().replace(/-([a-z])/g, (_, w) => w.toUpperCase());
  }
  function toggleClassKey(node, key, value) {
    const classNames = key.trim().split(/\s+/);
    for (let i = 0, nameLen = classNames.length; i < nameLen; i++) node.classList.toggle(classNames[i], value);
  }
  function assignProp(node, prop, value, prev, isSVG, skipRef) {
    let isCE, isProp, isChildProp;
    if (prop === "style") return style(node, value, prev);
    if (prop === "classList") return classList(node, value, prev);
    if (value === prev) return prev;
    if (prop === "ref") {
      if (!skipRef) {
        value(node);
      }
    } else if (prop.slice(0, 3) === "on:") {
      const e = prop.slice(3);
      prev && node.removeEventListener(e, prev);
      value && node.addEventListener(e, value);
    } else if (prop.slice(0, 10) === "oncapture:") {
      const e = prop.slice(10);
      prev && node.removeEventListener(e, prev, true);
      value && node.addEventListener(e, value, true);
    } else if (prop.slice(0, 2) === "on") {
      const name = prop.slice(2).toLowerCase();
      const delegate = DelegatedEvents.has(name);
      if (!delegate && prev) {
        const h = Array.isArray(prev) ? prev[0] : prev;
        node.removeEventListener(name, h);
      }
      if (delegate || value) {
        addEventListener(node, name, value, delegate);
        delegate && delegateEvents([name]);
      }
    } else if ((isChildProp = ChildProperties.has(prop)) || !isSVG && (PropAliases[prop] || (isProp = Properties.has(prop))) || (isCE = node.nodeName.includes("-"))) {
      if (prop === "class" || prop === "className") className(node, value);else if (isCE && !isProp && !isChildProp) node[toPropertyName(prop)] = value;else node[PropAliases[prop] || prop] = value;
    } else {
      const ns = isSVG && prop.indexOf(":") > -1 && SVGNamespace[prop.split(":")[0]];
      if (ns) setAttributeNS(node, ns, prop, value);else setAttribute(node, Aliases[prop] || prop, value);
    }
    return value;
  }
  function eventHandler(e) {
    const key = `$$${e.type}`;
    let node = e.composedPath && e.composedPath()[0] || e.target;
    if (e.target !== node) {
      Object.defineProperty(e, "target", {
        configurable: true,
        value: node
      });
    }
    Object.defineProperty(e, "currentTarget", {
      configurable: true,
      get() {
        return node || document;
      }
    });
    if (sharedConfig.registry && !sharedConfig.done) {
      sharedConfig.done = true;
      document.querySelectorAll("[id^=pl-]").forEach(elem => elem.remove());
    }
    while (node !== null) {
      const handler = node[key];
      if (handler && !node.disabled) {
        const data = node[`${key}Data`];
        data !== undefined ? handler.call(node, data, e) : handler.call(node, e);
        if (e.cancelBubble) return;
      }
      node = node.host && node.host !== node && node.host instanceof Node ? node.host : node.parentNode;
    }
  }
  function spreadExpression(node, props, prevProps = {}, isSVG, skipChildren) {
    props || (props = {});
    if (!skipChildren && "children" in props) {
      createRenderEffect(() => prevProps.children = insertExpression(node, props.children, prevProps.children));
    }
    props.ref && props.ref(node);
    createRenderEffect(() => assign(node, props, isSVG, true, prevProps, true));
    return prevProps;
  }
  function insertExpression(parent, value, current, marker, unwrapArray) {
    if (sharedConfig.context && !current) current = [...parent.childNodes];
    while (typeof current === "function") current = current();
    if (value === current) return current;
    const t = typeof value,
          multi = marker !== undefined;
    parent = multi && current[0] && current[0].parentNode || parent;
    if (t === "string" || t === "number") {
      if (sharedConfig.context) return current;
      if (t === "number") value = value.toString();
      if (multi) {
        let node = current[0];
        if (node && node.nodeType === 3) {
          node.data = value;
        } else node = document.createTextNode(value);
        current = cleanChildren(parent, current, marker, node);
      } else {
        if (current !== "" && typeof current === "string") {
          current = parent.firstChild.data = value;
        } else current = parent.textContent = value;
      }
    } else if (value == null || t === "boolean") {
      if (sharedConfig.context) return current;
      current = cleanChildren(parent, current, marker);
    } else if (t === "function") {
      createRenderEffect(() => {
        let v = value();
        while (typeof v === "function") v = v();
        current = insertExpression(parent, v, current, marker);
      });
      return () => current;
    } else if (Array.isArray(value)) {
      const array = [];
      const currentArray = current && Array.isArray(current);
      if (normalizeIncomingArray(array, value, current, unwrapArray)) {
        createRenderEffect(() => current = insertExpression(parent, array, current, marker, true));
        return () => current;
      }
      if (sharedConfig.context) {
        for (let i = 0; i < array.length; i++) {
          if (array[i].parentNode) return current = array;
        }
      }
      if (array.length === 0) {
        current = cleanChildren(parent, current, marker);
        if (multi) return current;
      } else if (currentArray) {
        if (current.length === 0) {
          appendNodes(parent, array, marker);
        } else reconcileArrays(parent, current, array);
      } else {
        current && cleanChildren(parent);
        appendNodes(parent, array);
      }
      current = array;
    } else if (value instanceof Node) {
      if (sharedConfig.context && value.parentNode) return current = multi ? [value] : value;
      if (Array.isArray(current)) {
        if (multi) return current = cleanChildren(parent, current, marker, value);
        cleanChildren(parent, current, null, value);
      } else if (current == null || current === "" || !parent.firstChild) {
        parent.appendChild(value);
      } else parent.replaceChild(value, parent.firstChild);
      current = value;
    } else ;
    return current;
  }
  function normalizeIncomingArray(normalized, array, current, unwrap) {
    let dynamic = false;
    for (let i = 0, len = array.length; i < len; i++) {
      let item = array[i],
          prev = current && current[i];
      if (item instanceof Node) {
        normalized.push(item);
      } else if (item == null || item === true || item === false) ; else if (Array.isArray(item)) {
        dynamic = normalizeIncomingArray(normalized, item, prev) || dynamic;
      } else if ((typeof item) === "function") {
        if (unwrap) {
          while (typeof item === "function") item = item();
          dynamic = normalizeIncomingArray(normalized, Array.isArray(item) ? item : [item], prev) || dynamic;
        } else {
          normalized.push(item);
          dynamic = true;
        }
      } else {
        const value = String(item);
        if (prev && prev.nodeType === 3 && prev.data === value) {
          normalized.push(prev);
        } else normalized.push(document.createTextNode(value));
      }
    }
    return dynamic;
  }
  function appendNodes(parent, array, marker) {
    for (let i = 0, len = array.length; i < len; i++) parent.insertBefore(array[i], marker);
  }
  function cleanChildren(parent, current, marker, replacement) {
    if (marker === undefined) return parent.textContent = "";
    const node = replacement || document.createTextNode("");
    if (current.length) {
      let inserted = false;
      for (let i = current.length - 1; i >= 0; i--) {
        const el = current[i];
        if (node !== el) {
          const isParent = el.parentNode === parent;
          if (!inserted && !i) isParent ? parent.replaceChild(node, el) : parent.insertBefore(node, marker);else isParent && el.remove();
        } else inserted = true;
      }
    } else parent.insertBefore(node, marker);
    return [node];
  }
  function getHydrationKey() {
    const hydrate = sharedConfig.context;
    return `${hydrate.id}${hydrate.count++}`;
  }
  const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
  function createElement(tagName, isSVG = false) {
    return isSVG ? document.createElementNS(SVG_NAMESPACE, tagName) : document.createElement(tagName);
  }
  function Dynamic(props) {
    const [p, others] = splitProps(props, ["component"]);
    const cached = createMemo(() => p.component);
    return createMemo(() => {
      const component = cached();
      switch (typeof component) {
        case "function":
          return untrack(() => component(others));
        case "string":
          const isSvg = SVGElements.has(component);
          const el = sharedConfig.context ? getNextElement() : createElement(component, isSvg);
          spread(el, others, isSvg);
          return el;
      }
    });
  }

  class Vec2 {
    static from_angle = n => new Vec2(Math.cos(n), Math.sin(n));
    static make = (x, y) => new Vec2(x, y);

    static get unit() {
      return new Vec2(1, 1);
    }

    static get zero() {
      return new Vec2(0, 0);
    }

    get vs() {
      return [this.x, this.y];
    }

    get mul_inverse() {
      return new Vec2(1 / this.x, 1 / this.y);
    }

    get inverse() {
      return new Vec2(-this.x, -this.y);
    }

    get half() {
      return new Vec2(this.x / 2, this.y / 2);
    }

    get length_squared() {
      return this.x * this.x + this.y * this.y;
    }

    get length() {
      return Math.sqrt(this.length_squared);
    }

    get normalize() {
      if (this.length === 0) {
        return Vec2.zero;
      }

      return this.scale(1 / this.length);
    }

    get perpendicular() {
      return new Vec2(-this.y, this.x);
    }

    get clone() {
      return new Vec2(this.x, this.y);
    }

    get angle() {
      return Math.atan2(this.y, this.x);
    }

    constructor(x, y) {
      this.x = x;
      this.y = y;
    }

    dot(v) {
      return this.x * v.x + this.y * v.y;
    }

    cross(v) {
      return this.x * v.y - this.y * v.x;
    }

    project_to(v) {
      let lsq = v.length_squared;
      let dp = this.dot(v);
      return Vec2.make(dp * v.x / lsq, dp * v.y / lsq);
    }

    distance(v) {
      return this.sub(v).length;
    }

    addy(n) {
      return Vec2.make(this.x, this.y + n);
    }

    add_angle(n) {
      return Vec2.from_angle(this.angle + n);
    }

    scale(n) {
      let {
        clone
      } = this;
      return clone.scale_in(n);
    }

    scale_in(n) {
      this.x *= n;
      this.y *= n;
      return this;
    }

    add(v) {
      let {
        clone
      } = this;
      return clone.add_in(v);
    }

    add_in(v) {
      this.x += v.x;
      this.y += v.y;
      return this;
    }

    sub(v) {
      let {
        clone
      } = this;
      return clone.sub_in(v);
    }

    sub_in(v) {
      this.x -= v.x;
      this.y -= v.y;
      return this;
    }

    mul(v) {
      let {
        clone
      } = this;
      return clone.mul_in(v);
    }

    mul_in(v) {
      this.x *= v.x;
      this.y *= v.y;
      return this;
    }

    div(v) {
      let {
        clone
      } = this;
      return clone.div_in(v);
    }

    div_in(v) {
      this.x /= v.x;
      this.y /= v.y;
      return this;
    }

    set_in(x, y = this.y) {
      this.x = x;
      this.y = y;
      return this;
    }

  }

  function loop(fn) {
    let animation_frame_id;
    let fixed_dt = 1000 / 60;
    let timestamp0,
        min_dt = fixed_dt,
        max_dt = fixed_dt * 2,
        dt0 = fixed_dt;

    function step(timestamp) {
      let dt = timestamp0 ? timestamp - timestamp0 : fixed_dt;
      dt = Math.min(max_dt, Math.max(min_dt, dt));

      if (fn(dt, dt0)) {
        return;
      }

      dt0 = dt;
      timestamp0 = timestamp;
      animation_frame_id = requestAnimationFrame(step);
    }

    animation_frame_id = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(animation_frame_id);
    };
  }
  function owrite(signal, fn) {
    if (typeof fn === 'function') {
      return signal[1](fn);
    } else {
      signal[1](_ => fn);
    }
  }
  function read(signal) {
    if (Array.isArray(signal)) {
      return signal[0]();
    } else {
      return signal();
    }
  }
  class DragDecay {
    static make = (drag, orig, target, no_start = false) => {
      return new DragDecay(drag, orig, target, no_start);
    };

    get drag_move() {
      return Vec2.make(...this.drag.move);
    }

    get move() {
      return Vec2.make(...this.drag.move).add(this.decay);
    }

    get translate() {
      return Vec2.make(...this.drag.move).sub(this.start);
    }

    get drop() {
      return this.drag.drop;
    }

    constructor(drag, orig, target, no_start) {
      this.drag = drag;
      this.orig = orig;
      this.target = target;
      this.no_start = no_start;
      this.start = Vec2.make(...(no_start ? drag.move : drag.start));
      this.decay = orig.sub(this.start);
    }

  }

  function eventPosition(e) {
    if (e.clientX !== undefined && e.clientY !== undefined) {
      return [e.clientX, e.clientY];
    }

    if (e.targetTouches?.[0]) {
      return [e.targetTouches[0].clientX, e.targetTouches[0].clientY];
    }
  }

  function move_threshold(move, start) {
    let dx = move[0] - start[0],
        dy = move[1] - start[1];
    let length = Math.sqrt(dx * dx + dy * dy);
    return length > 3;
  }

  class Mouse {
    _wheel = 0;
    _wheel0 = 0;

    $clear_bounds() {
      this._bounds = undefined;
    }

    get bounds() {
      if (!this._bounds) {
        this._bounds = this.$canvas.getBoundingClientRect();
      }

      return this._bounds;
    }

    get wheel() {
      return this._wheel;
    }

    get drag() {
      if (!!this._drag?.move) {
        return this._drag;
      }
    }

    get click() {
      if (!this._drag?.move && !!this._drag?.drop) {
        return this._drag.drop;
      }
    }

    get lclick() {
      if (this._drag?.button === 0) {
        return this.click;
      }
    }

    get rclick() {
      if (this._drag?.button === 2) {
        return this.click;
      }
    }

    get click_down() {
      if (!this._drag0 && !!this._drag && !this._drag?.move && !this._drag?.drop) {
        return this._drag.start;
      }
    }

    get hover() {
      if (!this._drag) {
        return this._hover;
      }
    }

    get drag_delta() {
      if (!!this._drag?.move) {
        return [this._drag.move[0] - this._drag.start[0], this._drag.move[1] - this._drag.start[1]];
      }
    }

    get up() {
      return this._up > 0;
    }

    constructor($canvas) {
      this.$canvas = $canvas;
    }

    eventPosition(e) {
      let res = eventPosition(e);
      let {
        bounds
      } = this;
      let scaleX = 1,
          scaleY = 1;

      if (res) {
        res[0] -= bounds.left;
        res[1] -= bounds.top;
        res[0] *= scaleX;
        res[1] *= scaleY;
      }

      return res;
    }

    disposes = [];

    dispose() {
      this.disposes.forEach(_ => _());
    }

    init() {
      this._up = 0;
      this._up0 = 0;
      let {
        $canvas,
        disposes
      } = this;
      $canvas.addEventListener('wheel', ev => {
        this._wheel = Math.sign(ev.deltaY);
      });
      $canvas.addEventListener('mousedown', ev => {
        if (!this._drag) {
          this._drag1 = {
            button: ev.button,
            start: this.eventPosition(ev)
          };
        }
      });
      $canvas.addEventListener('mousemove', ev => {
        if (this._drag) {
          this._drag.r_move = this.eventPosition(ev);
        } else {
          this._hover = this.eventPosition(ev);
        }
      });
      $canvas.addEventListener('contextmenu', ev => {
        ev.preventDefault();

        if (!this._drag) {
          this._drag1 = {
            button: ev.button,
            start: this.eventPosition(ev)
          };
        }
      });

      let onMouseUp = ev => {
        if (this._drag) {
          this._drag.drop = this.eventPosition(ev);
          this._drop0 = this._drag;
        }

        this._up = 1;
      };

      document.addEventListener('mouseup', onMouseUp);
      disposes.push(() => document.removeEventListener('mouseup', onMouseUp));

      const onScroll = () => {
        this._bounds = undefined;
      };

      window.addEventListener('resize', onScroll);
      document.addEventListener('scroll', onScroll);
      disposes.push(() => window.removeEventListener('resize', onScroll));
      disposes.push(() => document.removeEventListener('scroll', onScroll));
      return this;
    }

    update(dt, dt0) {
      if (this._up0 === this._up) {
        this._up = 0;
      } else {
        this._up0 = this._up;
      }

      if (this._wheel0 === this._wheel) {
        this._wheel = 0;
      } else {
        this._wheel0 = this._wheel;
      }

      if (this._drag) {
        this._drag.move0 = this._drag.move;

        if (this._drag.r_move !== undefined) {
          if (this._drag.move || move_threshold(this._drag.r_move, this._drag.start)) {
            this._drag.move = this._drag.r_move;
          }
        }

        if (!this._drop0) {
          if (this._drag.drop) {
            this._drag1 = undefined;
          }
        } else {
          this._drop0 = undefined;
        }
      }

      this._drag0 = this._drag;

      if (this._drag1 !== this._drag) {
        this._drag = this._drag1;
      }
    }

  }

  function make_ref() {
    let _$ref = createSignal();

    let _$clear_bounds = createSignal(undefined, {
      equals: false
    });

    let m_rect = createMemo(() => {
      read(_$clear_bounds);
      return read(_$ref)?.getBoundingClientRect();
    });
    let m_orig = createMemo(() => {
      let rect = m_rect();

      if (rect) {
        return Vec2.make(rect.x, rect.y);
      }
    });
    let m_size = createMemo(() => {
      let rect = m_rect();

      if (rect) {
        return Vec2.make(rect.width, rect.height);
      }
    });
    return {
      $clear_bounds() {
        owrite(_$clear_bounds);
      },

      get $ref() {
        return read(_$ref);
      },

      set $ref($ref) {
        owrite(_$ref, $ref);
      },

      get rect() {
        return m_rect();
      },

      get_normal_at_abs_pos(vs) {
        let size = m_size(),
            orig = m_orig();

        if (size && orig) {
          return vs.div(size); //return vs.sub(orig).div(size)
        }
      }

    };
  }
  function make_drag(hooks, $ref) {
    let {
      on_hover,
      on_up,
      on_click,
      find_inject_drag,
      on_drag_update,
      find_on_drag_start
    } = hooks;

    let _drag_decay = createSignal();

    let m_drag_decay = createMemo(() => read(_drag_decay));

    let _update = createSignal([16, 16], {
      equals: false
    });

    let update = createMemo(() => read(_update));
    let mouse = new Mouse($ref).init();
    loop((dt, dt0) => {
      mouse.update(dt, dt0);
      owrite(_update, [dt, dt0]);
      let {
        click,
        hover,
        drag,
        up
      } = mouse;

      if (click) {
        on_click(click);
      }

      if (hover) {
        on_hover(hover);
      }

      if (up) {
        on_up();
      }

      if (drag && !!drag.move0) {
        if (!read(_drag_decay)) {
          let inject_drag = find_inject_drag();

          if (inject_drag) {
            owrite(_drag_decay, new DragDecay(drag, inject_drag.abs_pos, inject_drag));
          }
        }
      }

      if (drag && !drag.move0) {
        let res = find_on_drag_start(drag);

        if (res) {
          owrite(_drag_decay, new DragDecay(drag, res.vs, res));
        }
      }
    });
    createEffect(on(update, (dt, dt0) => {
      let decay = m_drag_decay();

      if (decay) {
        on_drag_update(decay);
        decay.target.lerp_vs(decay.move);

        if (decay.drop) {
          owrite(_drag_decay, undefined);
        }
      }
    }));
    return {
      $clear_bounds() {
        mouse.$clear_bounds();
      },

      get decay() {
        return m_drag_decay();
      }

    };
  }

  function make_position(x, y) {
    let _x = createSignal(x);

    let _y = createSignal(y);

    let m_p = createMemo(() => point(read(_x), read(_y)));
    let m_vs = createMemo(() => Vec2.make(read(_x), read(_y)));
    return {
      get point() {
        return m_p();
      },

      get x() {
        return read(_x);
      },

      set x(v) {
        owrite(_x, v);
      },

      get y() {
        return read(_y);
      },

      set y(v) {
        owrite(_y, v);
      },

      lerp(x, y, t = 0.5) {
        owrite(_x, _ => rlerp(_, x, ease(t)));
        owrite(_y, _ => rlerp(_, y, ease(t)));
      },

      lerp_vs(vs, t = 0.5) {
        batch(() => {
          owrite(_x, _ => rlerp(_, vs.x, ease(t)));
          owrite(_y, _ => rlerp(_, vs.y, ease(t)));
        });
      },

      get vs() {
        return m_vs();
      },

      set vs(vs) {
        batch(() => {
          owrite(_x, vs.x);
          owrite(_y, vs.y);
        });
      },

      get clone() {
        return untrack(() => make_position(read(_x), read(_y)));
      }

    };
  }

  const make_id_gen = () => {
    let id = 0;
    return () => ++id;
  };

  const id_gen = make_id_gen();
  /* https://gist.github.com/gre/1650294 */

  function ease(t) {
    return t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function rlerp(a, b, t) {
    let res = lerp(a, b, t);
    return Math.round(res * 100) / 100;
  }

  function point(x, y) {
    return `${x} ${y} ${id_gen()}`;
  }
  point(0, 0);

  const pitch_mask = 0x0000000f;
  const octave_mask = 0x000000f0;
  const accidental_mask = 0x0000f000;
  function make_note_po(po, duration) {
    return make_note(po[0], po[1], po[2], duration);
  }
  function make_note(pitch, octave, accidental, duration) {
    return pitch | octave << 4 | duration << 8 | (accidental || 0) << 12;
  }
  function note_pitch(note) {
    return note & pitch_mask;
  }
  function note_octave(note) {
    return (note & octave_mask) >> 4;
  }
  function note_accidental(note) {
    return (note & accidental_mask) >> 12;
  }

  function make_adsr(a, d, s, r) {
    return {
      a,
      d,
      s,
      r
    };
  }
  /* C C# D D# E F F# G G# A A# B */

  const pitch_to_freq_index = [1, 1.5, 2, 2.5, 3, 4, 4.5, 5, 5.5, 6, 6.5, 7];
  /* https://github.com/jergason/notes-to-frequencies/blob/master/index.js */

  /* http://techlib.com/reference/musical_note_frequencies.htm#:~:text=Starting%20at%20any%20note%20the,be%20positive%2C%20negative%20or%20zero. */

  /* https://newt.phys.unsw.edu.au/jw/notes.html */

  function note_freq(note) {
    let octave = note_octave(note);
    let pitch = note_pitch(note);
    let accidental = note_accidental(note);

    if (accidental === 1) {
      pitch += 0.5;
    }

    let n = pitch_to_freq_index.indexOf(pitch);
    n += octave * 12;
    return 440 * Math.pow(2, (n - 57) / 12);
  }

  function ads(param, now, {
    a,
    d,
    s,
    r
  }, start, max) {
    a /= 1000;
    d /= 1000;
    r /= 1000;
    param.setValueAtTime(start, now);
    param.linearRampToValueAtTime(max, now + a);
    param.linearRampToValueAtTime(s, now + a + d);
    /* not needed ? */
    //param.setValueAtTime(s, now + a + d)
  }

  function r(param, now, {
    r
  }, min) {
    r /= 1000;
    param.cancelScheduledValues(now);
    param.linearRampToValueAtTime(min, now + (r || 0));
  }

  class PlayerController {
    get context() {
      if (!this._context) {
        this._context = new AudioContext();
      }

      return this._context;
    }

    get currentTime() {
      return this.context.currentTime;
    }

    _gen_id = 0;

    get next_id() {
      return ++this._gen_id;
    }

    players = new Map();

    attack(synth, note, time = 0) {
      let {
        next_id
      } = this;
      this.players.set(next_id, new MidiPlayer(this.context)._set_data({
        synth,
        freq: note_freq(note)
      }).attack(time));
      return next_id;
    }

    release(id, time = 0) {
      let player = this.players.get(id);

      if (player) {
        player.release(time);
      }

      this.players.delete(id);
    }

  }

  class HasAudioAnalyser {
    get maxFilterFreq() {
      return this.context.sampleRate / 2;
    }

    constructor(context) {
      this.context = context;
    }

    attack(time = this.context.currentTime) {
      let {
        context
      } = this;
      this.gain = context.createGain();
      this.analyser = context.createAnalyser();
      this.gain.gain.setValueAtTime(1, time);
      this.gain.connect(this.analyser);
      this.analyser.connect(context.destination);

      this._attack(time);

      return this;
    }

    release(time = this.context.currentTime) {
      this._release(time);

      return this;
    }

  }

  function getOscillator(context, type) {
    return new OscillatorNode(context, {
      type
    });
  }

  class MidiPlayer extends HasAudioAnalyser {
    _set_data(data) {
      this.data = data;
      return this;
    }

    _attack(now) {
      let {
        context,
        maxFilterFreq
      } = this;
      let out_gain = this.gain;
      let {
        freq,
        synth
      } = this.data;
      let {
        wave,
        volume,
        cutoff,
        cutoff_max,
        amplitude,
        filter_adsr,
        amp_adsr
      } = synth;
      let osc1 = getOscillator(context, wave);
      this.osc1 = osc1;
      let osc2 = getOscillator(context, wave);
      this.osc2 = osc2;
      let osc1_mix = new GainNode(context);
      osc1.connect(osc1_mix);
      let osc2_mix = new GainNode(context);
      osc2.connect(osc2_mix);
      osc1_mix.gain.setValueAtTime(0.5, now);
      osc2_mix.gain.setValueAtTime(0.5, now);
      osc2.detune.setValueAtTime(700, now);
      let filter = new BiquadFilterNode(context, {
        type: 'lowpass'
      });
      this.filter = filter;
      osc1_mix.connect(filter);
      osc2_mix.connect(filter);
      out_gain.gain.setValueAtTime(volume, now);
      let envelope = new GainNode(context);
      this.envelope = envelope;
      filter.connect(envelope);
      envelope.connect(out_gain);
      osc1.frequency.setValueAtTime(freq, now);
      osc2.frequency.setValueAtTime(freq, now);
      /* Syntorial */

      let _filter_adsr = { ...filter_adsr,
        s: cutoff * maxFilterFreq * 0.4 + filter_adsr.s * cutoff_max * maxFilterFreq * 0.6
      };
      ads(filter.frequency, now, _filter_adsr, cutoff * maxFilterFreq * 0.4, cutoff * maxFilterFreq * 0.4 + cutoff_max * maxFilterFreq * 0.6);
      ads(envelope.gain, now, amp_adsr, 0, amplitude * 0.5);
      osc1.start(now);
      osc2.start(now);
    }

    _release(now) {
      let {
        synth: {
          cutoff,
          amp_adsr,
          filter_adsr
        }
      } = this.data;
      let {
        a,
        d,
        r: _r
      } = amp_adsr;
      a /= 1000;
      d /= 1000;
      _r /= 1000;
      r(this.envelope.gain, now, amp_adsr, 0);
      r(this.filter.frequency, now, filter_adsr, cutoff * this.maxFilterFreq * 0.4);
      this.osc1.stop(now + a + d + _r);
      this.osc2.stop(now + a + d + _r);
    }

  }

  const nb_white = 5 * 7;
  const black_c3 = index_black(0);
  const white_c3 = index_white(0);
  const black_c6 = index_black(5 + 5 + 5);
  const white_c6 = index_white(7 + 7 + 7);
  const black_c4 = index_black(5);
  const black_c5 = index_black(5 + 5);
  const white_c4 = index_white(7);
  const white_c5 = index_white(7 + 7);
  function white_key(key, index) {
    return index_white(white_index(key) + index);
  }
  function black_key(key, index) {
    return index_black(black_index(key) + index);
  }
  function index_black(idx) {
    return idx + 1 + nb_white + 1;
  }
  function index_white(idx) {
    return idx + 1;
  }
  function black_index(b) {
    return b - nb_white - 2;
  }
  function white_index(w) {
    return w - 1;
  }
  function is_black(_) {
    return _ > nb_white;
  }
  function pianokey_pitch_octave(key) {
    if (is_black(key)) {
      let idx = black_index(key);
      let octave = Math.floor(idx / 5) + 1,
          pitch = idx % 5 + 1;

      if (pitch > 2) {
        pitch += 1;
      }

      octave += 2;
      return [pitch, octave, 1];
    } else {
      let idx = white_index(key);
      let octave = Math.floor(idx / 7) + 1;
      let pitch = idx % 7 + 1;
      octave += 2;
      return [pitch, octave, undefined];
    }
  }

  let pitch_ucis = ['', 'c', 'd', 'e', 'f', 'g', 'a', 'b'];
  function note_uci(note) {
    let pitch = note_pitch(note),
        accidental = note_accidental(note);
    return [pitch_ucis[pitch], !!accidental ? '#' : ''].join('');
  }

  let RE = /^[A-Za-z0-9\+\-;'\\\[\]]$/;
  let RE2 = /^(\s|Shift|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Backspace|Enter|Tab|\*)$/;
  let RE3 = /^(\!|\$)$/;

  function capture_key(key) {
    return key.match(RE) || key.match(RE2) || key.match(RE3);
  }

  class Input {
    get left() {
      return this.btn('left');
    }

    get right() {
      return this.btn('right');
    }

    _btn = new Map();
    press = (key, e) => {
      let ctrl = e.ctrlKey,
          shift = e.shiftKey;

      if (!this._btn.has(key)) {
        this._btn.set(key, {
          just_pressed: true,
          just_released: false,
          ctrl,
          shift,
          t: 0,
          t0: 0
        });

        return;
      }

      this._btn.get(key).just_pressed = true;
    };
    release = key => {
      let res = this._btn.get(key);

      if (res) {
        res.just_released = true;
      }
    };
    btn = (key, shift, ctrl) => {
      let btn = this._btn.get(key);

      if (btn && !!shift === !!btn.shift) {
        return btn.t;
      } else {
        return 0;
      }
    };
    btn0 = (key, shift, ctrl) => {
      let btn = this._btn.get(key);

      if (btn && !!shift === !!btn.shift) {
        return btn.t0;
      } else {
        return 0;
      }
    };
    btnp = (key, shift, ctrl) => {
      return this.btn(key, shift, ctrl) > 0 && this.btn0(key, shift, ctrl) === 0;
    };
    btnpp = key => {
      return this._btnpp === key;
    };
    update = (dt, dt0) => {
      this._btnpp = undefined;

      for (let [key, s] of this._btn) {
        if (s.t === 0) {
          s.t0 = s.t;
        }

        if (s.just_pressed || s.t > 0) {
          s.t0 = s.t;
          s.t += dt;
          s.just_pressed = false;
        }

        if (s.just_released) {
          s.t0 = s.t;
          s.t = 0;
          s.just_released = false;

          if (this._last_released && this._last_released === key) {
            this._btnpp = key;
            this._last_released = undefined;
          } else {
            this._last_released = key;
          }
        }
      }
    };

    init() {
      let {
        press,
        release
      } = this;
      document.addEventListener('keydown', e => {
        if (e.ctrlKey || !capture_key(e.key)) {
          return;
        }

        e.preventDefault();

        switch (e.key) {
          case 'ArrowUp':
            press('up', e);
            break;

          case 'ArrowDown':
            press('down', e);
            break;

          case 'ArrowLeft':
            press('left', e);
            break;

          case 'ArrowRight':
            press('right', e);
            break;

          default:
            press(e.key, e);
            break;
        }
      });
      document.addEventListener('keyup', e => {
        if (e.ctrlKey || !capture_key(e.key)) {
          return;
        }

        e.preventDefault();

        switch (e.key) {
          case 'ArrowUp':
            release('up');
            break;

          case 'ArrowDown':
            release('down');
            break;

          case 'ArrowLeft':
            release('left');
            break;

          case 'ArrowRight':
            release('right');
            break;

          default:
            release(e.key);
            break;
        }
      });
      return this;
    }

  }

  let btn_accidentals = ['i', 'o', 'p', '[', ']'];
  let btn_accidentals_octave_up = ['w', 'e', 'r', 't', 'y'];
  let btn_pitches = [' ', 'j', 'k', 'l', ';', '\'', '\\'];
  let btn_pitches_octave_up = ['a', 's', 'd', 'f', 'g', 'h'];
  let btn_pitches_all = [...btn_accidentals, ...btn_accidentals_octave_up, ...btn_pitches, ...btn_pitches_octave_up];
  const octaves_for_buttons = [[white_c3, white_c4, black_c3, black_c4], [white_c4, white_c5, black_c4, black_c5], [white_c5, white_c6, black_c5, black_c6]];
  const keys_by_button0 = new Map(btn_pitches_all.map(_ => [_, btn_pianokey(_, 0)]));
  const keys_by_button1 = new Map(btn_pitches_all.map(_ => [_, btn_pianokey(_, 1)]));
  const keys_by_button2 = new Map(btn_pitches_all.map(_ => [_, btn_pianokey(_, 2)]));
  function btn_pianokey(key, octave_ref = 1) {
    let [white_c4, white_c5, black_c4, black_c5] = octaves_for_buttons[octave_ref];
    let pitch = btn_pitches.indexOf(key) + 1;

    if (pitch > 0) {
      return white_key(white_c4, pitch - 1);
    }

    pitch = btn_pitches_octave_up.indexOf(key) + 1;

    if (pitch > 0) {
      return white_key(white_c5, pitch - 1);
    }

    pitch = btn_accidentals.indexOf(key) + 1;

    if (pitch > 0) {
      return black_key(black_c4, pitch - 1);
    }

    pitch = btn_accidentals_octave_up.indexOf(key) + 1;

    if (pitch > 0) {
      return black_key(black_c5, pitch - 1);
    }
  }

  function make_input(hooks) {
    let input = new Input().init();
    loop((dt, dt0) => {
      input.update(dt, dt0);
      [...keys_by_button0.keys()].forEach(key => {
        if (input.btnp(key)) {
          let bs = [keys_by_button0.get(key), keys_by_button1.get(key), keys_by_button2.get(key)];
          hooks.piano_bs(bs);
        }
      });
    });
    return input;
  }

  const waves = ['sine', 'sawtooth', 'triangle', 'square'];
  function synth_con(vol, octave, wave) {
    return waves.indexOf(wave) | octave << 4 | vol << 8;
  }

  function make_hooks(sound) {
    return {
      on_hover() {},

      on_up(decay) {},

      on_click(click) {
        sound.pitch.find_on_drag_start(Vec2.make(...click));
      },

      find_inject_drag() {},

      on_drag_update(decay) {
        sound.pitch.find_on_drag_start(decay.drag_move);
      },

      find_on_drag_start(drag) {
        return sound.pitch.find_on_drag_start(Vec2.make(...drag.move));
      }

    };
  }

  function make_vhooks(sound) {
    return {
      on_hover() {},

      on_up(decay) {},

      on_click(click) {
        sound.pitch.find_on_volume_start(Vec2.make(...click));
      },

      find_inject_drag() {},

      on_drag_update(decay) {
        sound.pitch.find_on_volume_start(decay.drag_move);
      },

      find_on_drag_start(drag) {
        return sound.pitch.find_on_volume_start(Vec2.make(...drag.move));
      }

    };
  }

  function make_input_hooks(sound) {
    return {
      piano_bs(bs) {
        let key = bs[sound.controls.octave - 3];
        sound.pitch.press(key);
      }

    };
  }

  class Sound {
    onScroll() {
      this.refs.forEach(_ => _.$clear_bounds());
    }

    get overlay() {
      return read(this._overlay);
    }

    set overlay(overlay) {
      owrite(this._overlay, overlay);
    }

    constructor($element) {
      this._overlay = createSignal();
      this.input = make_input(make_input_hooks(this));
      this.refs = [];
      this.controls = make_controls(this);
      this.tabbar = make_tabbar();
      this.player = make_player(this);
      this.pitch = make_pitch(this);
      this.loop = make_loop(this);
    }

  }

  const make_controls = sound => {
    let _octave = createSignal(4);

    let _volume = createSignal(5);

    let _wave = createSignal('sine');

    return {
      get wave() {
        return read(_wave);
      },

      set wave(wave) {
        owrite(_wave, wave);

        if (sound.input.btn('Shift', true)) {
          sound.pitch.set_all_waves(wave);
        }
      },

      set volume(volume) {
        owrite(_volume, volume);

        if (sound.input.btn('Shift', true)) {
          sound.pitch.set_all_volume(volume);
        }
      },

      get volume() {
        return read(_volume);
      },

      set octave(octave) {
        owrite(_octave, octave);
      },

      get octave() {
        return read(_octave);
      }

    };
  };

  const make_tabbar = sound => {
    let _active = createSignal('graph');

    return {
      set active(active) {
        owrite(_active, active);
      },

      get active() {
        return read(_active);
      }

    };
  };

  function merge_notes(a, b) {
    return a.note_value === b.note_value && a.volume === b.volume && a.wave === b.wave;
  }

  const make_player = sound => {
    let play_buffer = [];
    return {
      set cursor(cursor) {
        if (cursor !== undefined && !play_buffer.includes(cursor)) {
          let cbar = sound.pitch.bars[cursor];
          let {
            player,
            synth
          } = sound.pitch.bars[cursor];
          let duration = sound.loop.speed * 16 / 1000;
          let note = sound.pitch.bars[cursor].note_value;
          let lookaheads = [[cursor + 1, cursor + 2, cursor + 3], [cursor + 1, cursor + 2], [cursor + 1]].map(lookahead => lookahead.filter(_ => _ < 32).map(_ => sound.pitch.bars[_]));
          let note_duration = 1;

          if (lookaheads[0].length === 3 && lookaheads[0].every(_ => merge_notes(cbar, _))) {
            note_duration = 4;
            play_buffer = [cursor + 1, cursor + 2, cursor + 3];
          } else if (lookaheads[1].length === 2 && lookaheads[1].every(_ => merge_notes(cbar, _))) {
            note_duration = 3;
            play_buffer = [cursor + 1, cursor + 2];
          } else if (lookaheads[2].length === 1 && lookaheads[2].every(_ => merge_notes(cbar, _))) {
            note_duration = 2;
            play_buffer = [cursor + 1];
          } else {
            play_buffer = [];
          }

          duration *= note_duration;
          let i = player.attack(synth, note, player.currentTime);
          player.release(i, player.currentTime + duration);
        }
      }

    };
  };

  const y_key = [...Array(4).keys()].flatMap(octave => [index_white(0 + octave * 7), index_black(0 + octave * 5), index_white(1 + octave * 7), index_black(1 + octave * 5), index_white(2 + octave * 7), index_white(3 + octave * 7), index_black(2 + octave * 5), index_white(4 + octave * 7), index_black(3 + octave * 5), index_white(5 + octave * 7), index_black(4 + octave * 5), index_white(6 + octave * 7)]);
  const volume_klass = ['zero', 'one', 'two', 'three', 'four', 'five'];

  const make_pitch_bar = (sound, edit_cursor, i, y) => {
    let _wave = createSignal('triangle');

    let _volume = createSignal(5);

    let _y = createSignal(y);

    let _hi = createSignal(false);

    let m_wave = createMemo(() => read(_wave));
    let m_volume = createMemo(() => read(_volume));
    let m_y = createMemo(() => Math.floor(read(_y) * 48));
    let m_key = createMemo(() => y_key[m_y()]);
    let m_note = createMemo(() => make_note_po(pianokey_pitch_octave(m_key()), 2));
    let m_style = createMemo(() => ({
      height: `${read(_y) * 100}%`
    }));
    let m_klass = createMemo(() => [read(_hi) ? 'hi' : ''].join(' '));
    let m_lklass = createMemo(() => [edit_cursor() === i ? 'edit' : ''].join(' '));
    let m_vstyle = createMemo(() => ({
      height: `${read(_volume) / 5 * 100}%`
    }));
    let m_vklass = createMemo(() => [volume_klass[read(_volume)]].join(' '));
    let m_synth = createMemo(() => ({
      wave: m_wave(),
      volume: m_volume() / 5,
      amplitude: 0.9,
      cutoff: 0.6,
      cutoff_max: 0.2,
      amp_adsr: make_adsr(2, 8, 0.2, 10),
      filter_adsr: make_adsr(0, 8, 0.2, 0)
    }));
    let m_player = createMemo(() => new PlayerController());
    return {
      get export() {
        return [this.note_value, synth_con(this.volume, this.octave, read(_wave))];
      },

      get synth() {
        return m_synth();
      },

      set volume(volume) {
        owrite(_volume, volume);
      },

      set wave(wave) {
        owrite(_wave, wave);
      },

      get wave() {
        return read(_wave).slice(0, 3);
      },

      get player() {
        return m_player();
      },

      set piano_key(key) {
        owrite(_y, y_key.indexOf(key) / 48);
        owrite(_volume, sound.controls.volume);
        owrite(_wave, sound.controls.wave);
      },

      get note_value() {
        return m_note();
      },

      get note() {
        return note_uci(m_note());
      },

      get volume() {
        return read(_volume);
      },

      get octave() {
        return note_octave(m_note());
      },

      get lklass() {
        return m_lklass();
      },

      set hi(v) {
        owrite(_hi, v);
      },

      set vy(y) {
        y = Math.round(y * 5);
        owrite(_volume, y);
      },

      set y(y) {
        y = Math.floor(y * 48) / 48;
        owrite(_y, y);
        owrite(_volume, sound.controls.volume);
        owrite(_wave, sound.controls.wave);
      },

      get y() {
        return read(_y);
      },

      get klass() {
        return m_klass();
      },

      get style() {
        return m_style();
      },

      get vklass() {
        return m_vklass();
      },

      get vstyle() {
        return m_vstyle();
      },

      select() {
        sound.pitch.select(i);
      }

    };
  };

  const make_pitch = sound => {
    let vref = make_ref();
    sound.refs.push(vref);
    let vdrag;
    createEffect(() => {
      let $ref = vref.$ref;

      if ($ref) {
        if (vdrag) {
          sound.refs.splice(sound.refs.indexOf(vdrag), 1);
        }

        vdrag = make_drag(make_vhooks(sound), $ref);
        sound.refs.push(vdrag);
      }
    });
    let ref = make_ref();
    sound.refs.push(ref);
    let drag;
    let drag_target = make_position(0, 0);
    createEffect(() => {
      let $ref = ref.$ref;

      if ($ref) {
        if (drag) {
          sound.refs.splice(sound.refs.indexOf(drag), 1);
        }

        drag = make_drag(make_hooks(sound), $ref);
        sound.refs.push(drag);
      }
    });

    let _edit_cursor = createSignal();

    let m_edit_cursor = createMemo(() => read(_edit_cursor));

    function set_y(n, y) {
      m_bars()[n].y = y;
    }

    function set_vy(n, y) {
      m_bars()[n].vy = y;
    }

    let _bars = createSignal([...Array(32).keys()].map(_ => 0.5));

    let m_bars = createMemo(mapArray(_bars[0], (_, i) => make_pitch_bar(sound, m_edit_cursor, i(), _)));
    return {
      get export() {
        let begin = sound.loop.begin;
        let end = sound.loop.end;

        if (begin === end) {
          begin = 0;
          end = 32;
        }

        return [[sound.loop.speed, ...m_bars().slice(begin, end + 1).flatMap(_ => _.export)]];
      },

      set_all_waves(wave) {
        m_bars().forEach(_ => _.wave = wave);
      },

      set_all_volume(volume) {
        m_bars().forEach(_ => _.volume = volume);
      },

      press(key) {
        if (!m_edit_cursor()) {
          owrite(_edit_cursor, 0);
        }

        m_bars()[m_edit_cursor()].piano_key = key;
        owrite(_edit_cursor, (m_edit_cursor() + 1) % 32);
      },

      get edit_cursor() {
        return read(_edit_cursor);
      },

      select(i) {
        owrite(_edit_cursor, i);
      },

      set cursor(cursor) {
        m_bars().forEach((bar, i) => bar.hi = cursor === i);
      },

      get bars() {
        return m_bars();
      },

      find_on_volume_start(drag) {
        let res = vref.get_normal_at_abs_pos(drag);

        if (0 <= res.x && res.x <= 1 && 0 <= res.y && res.y <= 1.0) {
          let i = res.x * 32;
          set_vy(Math.floor(i), 1 - res.y);
          return drag_target;
        }
      },

      find_on_drag_start(drag) {
        let res = ref.get_normal_at_abs_pos(drag);

        if (0 <= res.x && res.x <= 1 && 0 <= res.y && res.y <= 1.0) {
          let i = res.x * 32;
          set_y(Math.floor(i), 1 - res.y);
          return drag_target;
        }
      },

      ref,
      vref
    };
  };

  const make_loop = sound => {
    let _speed = createSignal(9);

    let _mode = createSignal('stop');

    let _begin = createSignal(0);

    let _end = createSignal(0);

    let _cursor = createSignal();

    let m_one_duration = createMemo(() => {
      let i = read(_speed);
      return i * 16;
    });
    createEffect(on(_mode[0], value => {
      if (value === 'play') {
        owrite(_cursor, read(_begin));
        let i = 0;
        let cancel = loop((dt, dt0) => {
          i += dt;
          let begin = read(_begin);
          let end = read(_end);
          let dur = m_one_duration();

          if (i > dur) {
            i -= dur;
            owrite(_cursor, _ => {
              let res = (_ + 1) % 32;

              if (begin !== end && res > end || res === 31 && end === 31) {
                res = begin;
              }

              return res;
            });
          }
        });
        onCleanup(() => {
          owrite(_cursor, undefined);
          cancel();
        });
      }
    }));
    createEffect(() => {
      let cursor = read(_cursor);
      sound.pitch.cursor = cursor;
      sound.player.cursor = cursor;
    });
    return {
      set speed(speed) {
        if (speed < 1 || speed > 20) {
          return;
        }

        owrite(_speed, speed);
      },

      get speed() {
        return read(_speed);
      },

      change_mode() {
        owrite(_mode, this.mode);
      },

      get mode() {
        return read(_mode) === 'play' ? 'stop' : 'play';
      },

      get begin() {
        return read(_begin);
      },

      set begin(v) {
        owrite(_begin, (v + 32) % 32);
      },

      get end() {
        return read(_end);
      },

      set end(v) {
        owrite(_end, (v + 32) % 32);
      }

    };
  };

  var audiolib_code = "var VSound = (function () {\n  'use strict';\n\n  const pitch_mask = 0x0000000f;\n  const octave_mask = 0x000000f0;\n  const accidental_mask = 0x0000f000;\n  function note_pitch(note) {\n    return note & pitch_mask;\n  }\n  function note_octave(note) {\n    return (note & octave_mask) >> 4;\n  }\n  function note_accidental(note) {\n    return (note & accidental_mask) >> 12;\n  }\n\n  function make_adsr(a, d, s, r) {\n    return {\n      a,\n      d,\n      s,\n      r\n    };\n  }\n  /* C C# D D# E F F# G G# A A# B */\n\n  const pitch_to_freq_index = [1, 1.5, 2, 2.5, 3, 4, 4.5, 5, 5.5, 6, 6.5, 7];\n  /* https://github.com/jergason/notes-to-frequencies/blob/master/index.js */\n\n  /* http://techlib.com/reference/musical_note_frequencies.htm#:~:text=Starting%20at%20any%20note%20the,be%20positive%2C%20negative%20or%20zero. */\n\n  /* https://newt.phys.unsw.edu.au/jw/notes.html */\n\n  function note_freq(note) {\n    let octave = note_octave(note);\n    let pitch = note_pitch(note);\n    let accidental = note_accidental(note);\n\n    if (accidental === 1) {\n      pitch += 0.5;\n    }\n\n    let n = pitch_to_freq_index.indexOf(pitch);\n    n += octave * 12;\n    return 440 * Math.pow(2, (n - 57) / 12);\n  }\n\n  function ads(param, now, {\n    a,\n    d,\n    s,\n    r\n  }, start, max) {\n    a /= 1000;\n    d /= 1000;\n    r /= 1000;\n    param.setValueAtTime(start, now);\n    param.linearRampToValueAtTime(max, now + a);\n    param.linearRampToValueAtTime(s, now + a + d);\n    /* not needed ? */\n    //param.setValueAtTime(s, now + a + d)\n  }\n\n  function r(param, now, {\n    r\n  }, min) {\n    r /= 1000;\n    param.cancelScheduledValues(now);\n    param.linearRampToValueAtTime(min, now + (r || 0));\n  }\n\n  class PlayerController {\n    get context() {\n      if (!this._context) {\n        this._context = new AudioContext();\n      }\n\n      return this._context;\n    }\n\n    get currentTime() {\n      return this.context.currentTime;\n    }\n\n    _gen_id = 0;\n\n    get next_id() {\n      return ++this._gen_id;\n    }\n\n    players = new Map();\n\n    attack(synth, note, time = 0) {\n      let {\n        next_id\n      } = this;\n      this.players.set(next_id, new MidiPlayer(this.context)._set_data({\n        synth,\n        freq: note_freq(note)\n      }).attack(time));\n      return next_id;\n    }\n\n    release(id, time = 0) {\n      let player = this.players.get(id);\n\n      if (player) {\n        player.release(time);\n      }\n\n      this.players.delete(id);\n    }\n\n  }\n\n  class HasAudioAnalyser {\n    get maxFilterFreq() {\n      return this.context.sampleRate / 2;\n    }\n\n    constructor(context) {\n      this.context = context;\n    }\n\n    attack(time = this.context.currentTime) {\n      let {\n        context\n      } = this;\n      this.gain = context.createGain();\n      this.analyser = context.createAnalyser();\n      this.gain.gain.setValueAtTime(1, time);\n      this.gain.connect(this.analyser);\n      this.analyser.connect(context.destination);\n\n      this._attack(time);\n\n      return this;\n    }\n\n    release(time = this.context.currentTime) {\n      this._release(time);\n\n      return this;\n    }\n\n  }\n\n  function getOscillator(context, type) {\n    return new OscillatorNode(context, {\n      type\n    });\n  }\n\n  class MidiPlayer extends HasAudioAnalyser {\n    _set_data(data) {\n      this.data = data;\n      return this;\n    }\n\n    _attack(now) {\n      let {\n        context,\n        maxFilterFreq\n      } = this;\n      let out_gain = this.gain;\n      let {\n        freq,\n        synth\n      } = this.data;\n      let {\n        wave,\n        volume,\n        cutoff,\n        cutoff_max,\n        amplitude,\n        filter_adsr,\n        amp_adsr\n      } = synth;\n      let osc1 = getOscillator(context, wave);\n      this.osc1 = osc1;\n      let osc2 = getOscillator(context, wave);\n      this.osc2 = osc2;\n      let osc1_mix = new GainNode(context);\n      osc1.connect(osc1_mix);\n      let osc2_mix = new GainNode(context);\n      osc2.connect(osc2_mix);\n      osc1_mix.gain.setValueAtTime(0.5, now);\n      osc2_mix.gain.setValueAtTime(0.5, now);\n      osc2.detune.setValueAtTime(700, now);\n      let filter = new BiquadFilterNode(context, {\n        type: 'lowpass'\n      });\n      this.filter = filter;\n      osc1_mix.connect(filter);\n      osc2_mix.connect(filter);\n      out_gain.gain.setValueAtTime(volume, now);\n      let envelope = new GainNode(context);\n      this.envelope = envelope;\n      filter.connect(envelope);\n      envelope.connect(out_gain);\n      osc1.frequency.setValueAtTime(freq, now);\n      osc2.frequency.setValueAtTime(freq, now);\n      /* Syntorial */\n\n      let _filter_adsr = { ...filter_adsr,\n        s: cutoff * maxFilterFreq * 0.4 + filter_adsr.s * cutoff_max * maxFilterFreq * 0.6\n      };\n      ads(filter.frequency, now, _filter_adsr, cutoff * maxFilterFreq * 0.4, cutoff * maxFilterFreq * 0.4 + cutoff_max * maxFilterFreq * 0.6);\n      ads(envelope.gain, now, amp_adsr, 0, amplitude * 0.5);\n      osc1.start(now);\n      osc2.start(now);\n    }\n\n    _release(now) {\n      let {\n        synth: {\n          cutoff,\n          amp_adsr,\n          filter_adsr\n        }\n      } = this.data;\n      let {\n        a,\n        d,\n        r: _r\n      } = amp_adsr;\n      a /= 1000;\n      d /= 1000;\n      _r /= 1000;\n      r(this.envelope.gain, now, amp_adsr, 0);\n      r(this.filter.frequency, now, filter_adsr, cutoff * this.maxFilterFreq * 0.4);\n      this.osc1.stop(now + a + d + _r);\n      this.osc2.stop(now + a + d + _r);\n    }\n\n  }\n\n  const waves = ['sine', 'sawtooth', 'triangle', 'square'];\n  const vol_mask = 0x00000f00;\n  const oct_mask = 0x000000f0;\n  const wave_mask = 0x0000000f;\n  function con_synth(synth) {\n    let wave = synth & wave_mask;\n    let octave = (synth & oct_mask) >> 4;\n    let vol = (synth & vol_mask) >> 8;\n    return [waves[wave], octave, vol];\n  }\n\n  function merge_notes(a, b) {\n    return a.every((_, i) => i === 0 || _ === b[i]);\n  }\n  /*\n   * vol, wave, note\n   * []\n   */\n\n\n  function VSound(data) {\n    let player = new PlayerController();\n    data = data.map(data => {\n      let [speed, ...rest] = data;\n      let res = [];\n\n      for (let i = 0; i < rest.length; i += 2) {\n        let note = rest[i],\n            [wave, oct, vol] = con_synth(rest[i + 1]);\n        let synth = {\n          wave: wave,\n          volume: vol / 5,\n          amplitude: 0.9,\n          cutoff: 0.6,\n          cutoff_max: 0.2,\n          amp_adsr: make_adsr(2, 8, 0.2, 10),\n          filter_adsr: make_adsr(0, 8, 0.2, 0)\n        };\n        res.push([synth, note, wave, oct, vol]);\n      }\n\n      return [speed, res];\n    });\n    return k => {\n      let [speed, res] = data[k];\n      let ttt = player.currentTime;\n      let play_buffer = [];\n\n      for (let i = 0; i < res.length; i++) {\n        let duration = speed * 16 / 1000;\n\n        if (play_buffer.includes(i)) {\n          ttt += duration;\n          continue;\n        }\n\n        let ri = res[i];\n        let lookaheads = [[i + 1, i + 2, i + 3], [i + 1, i + 2], [i + 1]].map(lookahead => lookahead.filter(_ => _ < res.length).map(_ => res[_]));\n        let note_duration = 1;\n\n        if (lookaheads[0].length === 3 && lookaheads[0].every(_ => merge_notes(ri, _))) {\n          note_duration = 4;\n          play_buffer = [i + 1, i + 2, i + 3];\n        } else if (lookaheads[1].length === 2 && lookaheads[1].every(_ => merge_notes(ri, _))) {\n          note_duration = 3;\n          play_buffer = [i + 1, i + 2];\n        } else if (lookaheads[2].length === 1 && lookaheads[2].every(_ => merge_notes(ri, _))) {\n          note_duration = 2;\n          play_buffer = [i + 1];\n        } else {\n          play_buffer = [];\n        }\n\n        duration *= note_duration;\n        let synth = ri[0],\n            note = ri[1];\n        let id = player.attack(synth, note, ttt);\n        player.release(id, ttt + duration);\n        console.log(synth, duration, ttt);\n        ttt += duration;\n      }\n    };\n  }\n\n  return VSound;\n\n})();\n";

  const _tmpl$ = /*#__PURE__*/template(`<vsound><tabbar><label>graph</label><label>list</label></tabbar><toolbar><box><label>speed</label> </box><box><label>loop</label><label class="play"></label></box><box><label class="export">export</label><label class="help">help</label></box><box class="wave"><label>wave</label></box></toolbar><statusbar><span>&nbsp</span></statusbar></vsound>`),
        _tmpl$2 = /*#__PURE__*/template(`<span></span>`),
        _tmpl$3 = /*#__PURE__*/template(`<overlay></overlay>`),
        _tmpl$4 = /*#__PURE__*/template(`<export><h2> Export</h2><p><span> Data </span></p><h3> Usage </h3><p><span>// Include Player Library</span><br><span>// Include Data</span><br><span>// Then use it like</span><br></p><p><span> Player Library </span></p></export>`),
        _tmpl$5 = /*#__PURE__*/template(`<copycode><span></span><code></code></copycode>`),
        _tmpl$6 = /*#__PURE__*/template(`<help><h2> V Sound v0.9 </h2><small>Designed to export sound effects with small size for use in JS13k.</small><p><span> Inspired by PICO-8 </span></p><h3> Shortcuts </h3><p><span>Black keys: i o p [ ]</span><span>White keys: Space j k l ; ' \</span><span>Octave higher:</span><span>Black keys: w e r t y</span><span>White keys: a s d f g h</span><span> Hold shift and select a waveform or volume will set all notes </span></p><p><small> Search "PICO 8 Sound Editor" if you get confused on how to use this. </small></p><footer><i><small> Music tracker feature is planned to be made in future release.</small> </i></footer></help>`),
        _tmpl$7 = /*#__PURE__*/template(`<label class="pitch">:pitch</label>`),
        _tmpl$8 = /*#__PURE__*/template(`<pitch-bar></pitch-bar>`),
        _tmpl$9 = /*#__PURE__*/template(`<label class="volume">:volume</label>`),
        _tmpl$10 = /*#__PURE__*/template(`<volume-bar></volume-bar>`),
        _tmpl$11 = /*#__PURE__*/template(`<list-list><div><div class="group"><label>octave</label><octave></octave></div><div class="group"><label>volume</label><volume></volume></div></div><list-bar></list-bar></list-list>`),
        _tmpl$12 = /*#__PURE__*/template(`<bar><span></span><span></span><span></span><span></span></bar>`),
        _tmpl$13 = /*#__PURE__*/template(`<bar></bar>`),
        _tmpl$14 = /*#__PURE__*/template(`<vbar></vbar>`),
        _tmpl$15 = /*#__PURE__*/template(`<div class="up-down"><span class="value-down">&lt;</span><span class="value"> <!> </span> <span class="value-up">></span></div>`);

  function unbindable(el, eventName, callback, options) {
    el.addEventListener(eventName, callback, options);
    return () => el.removeEventListener(eventName, callback, options);
  }

  const App = sound => props => {
    let unbinds = [];
    unbinds.push(unbindable(document, 'scroll', () => sound.onScroll(), {
      capture: true,
      passive: true
    }));
    unbinds.push(unbindable(window, 'resize', () => sound.onScroll(), {
      passive: true
    }));
    onCleanup(() => unbinds.forEach(_ => _()));
    return (() => {
      const _el$ = _tmpl$.cloneNode(true),
            _el$2 = _el$.firstChild,
            _el$3 = _el$2.firstChild,
            _el$4 = _el$3.nextSibling,
            _el$5 = _el$2.nextSibling,
            _el$6 = _el$5.firstChild,
            _el$7 = _el$6.firstChild;
            _el$7.nextSibling;
            const _el$9 = _el$6.nextSibling,
            _el$10 = _el$9.firstChild,
            _el$11 = _el$10.nextSibling,
            _el$12 = _el$9.nextSibling,
            _el$13 = _el$12.firstChild,
            _el$14 = _el$13.nextSibling,
            _el$15 = _el$12.nextSibling;
            _el$15.firstChild;
            const _el$17 = _el$5.nextSibling;

      _el$.$$click = _ => sound.overlay = undefined;

      _el$3.$$click = _ => sound.tabbar.active = 'graph';

      _el$4.$$click = _ => sound.tabbar.active = 'list';

      insert(_el$6, createComponent(UpDownControl, {
        get value() {
          return sound.loop.speed;
        },

        setValue: _ => sound.loop.speed = _
      }), null);

      insert(_el$9, createComponent(UpDownControl, {
        get value() {
          return sound.loop.begin;
        },

        setValue: _ => sound.loop.begin = _
      }), _el$11);

      insert(_el$9, createComponent(UpDownControl, {
        get value() {
          return sound.loop.end;
        },

        setValue: _ => sound.loop.end = _
      }), _el$11);

      _el$11.$$click = _ => sound.loop.change_mode();

      insert(_el$11, () => sound.loop.mode);

      _el$13.$$click = _ => {
        _.stopPropagation();

        sound.overlay = sound.overlay === 'export' ? undefined : 'export';
      };

      _el$14.$$click = _ => {
        _.stopPropagation();

        sound.overlay = sound.overlay === 'help' ? undefined : 'help';
      };

      insert(_el$15, createComponent(For, {
        each: ['sine', 'square', 'triangle', 'sawtooth'],
        children: i => (() => {
          const _el$18 = _tmpl$2.cloneNode(true);

          _el$18.$$click = _ => sound.controls.wave = i;

          insert(_el$18, () => i.slice(0, 3));

          createRenderEffect(() => className(_el$18, sound.controls.wave === i ? 'active' : ''));

          return _el$18;
        })()
      }), null);

      insert(_el$, createComponent(Dynamic, {
        sound: sound,

        get component() {
          return comps[sound.tabbar.active];
        }

      }), _el$17);

      insert(_el$, createComponent(Show, {
        get when() {
          return sound.overlay;
        },

        children: value => (() => {
          const _el$19 = _tmpl$3.cloneNode(true);

          _el$19.$$click = e => e.stopPropagation();

          insert(_el$19, createComponent(Dynamic, {
            sound: sound,

            get component() {
              return overlays[value];
            }

          }));

          return _el$19;
        })()
      }), null);

      createRenderEffect(_p$ => {
        const _v$ = sound.tabbar.active === 'graph' ? 'active' : '',
              _v$2 = sound.tabbar.active === 'list' ? 'active' : '';

        _v$ !== _p$._v$ && className(_el$3, _p$._v$ = _v$);
        _v$2 !== _p$._v$2 && className(_el$4, _p$._v$2 = _v$2);
        return _p$;
      }, {
        _v$: undefined,
        _v$2: undefined
      });

      return _el$;
    })();
  };

  const Export = props => {
    let data_res = `let data = ${JSON.stringify(props.sound.pitch.export)}`;
    return (() => {
      const _el$20 = _tmpl$4.cloneNode(true),
            _el$21 = _el$20.firstChild,
            _el$22 = _el$21.nextSibling;
            _el$22.firstChild;
            const _el$24 = _el$22.nextSibling,
            _el$25 = _el$24.nextSibling,
            _el$26 = _el$25.firstChild,
            _el$27 = _el$26.nextSibling,
            _el$28 = _el$27.nextSibling,
            _el$29 = _el$28.nextSibling,
            _el$30 = _el$29.nextSibling;
            _el$30.nextSibling;
            const _el$32 = _el$25.nextSibling;
            _el$32.firstChild;

      insert(_el$22, createComponent(CopyCode, {
        children: data_res
      }), null);

      insert(_el$25, createComponent(CopyCode, {
        children: "let p = VSound(data); p(0) // play a sound by index"
      }), null);

      insert(_el$32, createComponent(CopyCode, {
        children: audiolib_code
      }), null);

      return _el$20;
    })();
  };

  const CopyCode = props => {
    let text = createSignal('copy');

    function copy() {
      navigator.clipboard.writeText(props.children).then(function () {
        text[1]('copied');
        setTimeout(() => {
          text[1]('copy');
        }, 1000);
      }, function (err) {
        console.error('Async: Could not copy text: ', err);
      });
    }

    return (() => {
      const _el$34 = _tmpl$5.cloneNode(true),
            _el$35 = _el$34.firstChild,
            _el$36 = _el$35.nextSibling;

      _el$35.$$click = _ => copy();

      insert(_el$35, () => text[0]());

      insert(_el$36, () => props.children);

      return _el$34;
    })();
  };

  const Help = props => {
    return _tmpl$6.cloneNode(true);
  };

  const overlays = {
    'help': Help,
    'export': Export
  };

  const PitchBar = props => {
    let {
      sound
    } = props;
    return [_tmpl$7.cloneNode(true), (() => {
      const _el$39 = document.importNode(_tmpl$8, true);

      (_ => setTimeout(() => sound.pitch.ref.$ref = _))(_el$39);

      _el$39._$owner = getOwner();

      insert(_el$39, createComponent(For, {
        get each() {
          return sound.pitch.bars;
        },

        children: item => createComponent(Bar, {
          item: item
        })
      }));

      return _el$39;
    })(), _tmpl$9.cloneNode(true), (() => {
      const _el$41 = document.importNode(_tmpl$10, true);

      (_ => setTimeout(() => sound.pitch.vref.$ref = _))(_el$41);

      _el$41._$owner = getOwner();

      insert(_el$41, createComponent(For, {
        get each() {
          return sound.pitch.bars;
        },

        children: item => createComponent(VolumeBar, {
          item: item
        })
      }));

      return _el$41;
    })()];
  };

  const ListBar = props => {
    let {
      sound
    } = props;
    return (() => {
      const _el$42 = document.importNode(_tmpl$11, true),
            _el$43 = _el$42.firstChild,
            _el$44 = _el$43.firstChild,
            _el$45 = _el$44.firstChild,
            _el$46 = _el$45.nextSibling,
            _el$47 = _el$44.nextSibling,
            _el$48 = _el$47.firstChild,
            _el$49 = _el$48.nextSibling,
            _el$50 = _el$43.nextSibling;

      _el$42._$owner = getOwner();

      insert(_el$46, createComponent(For, {
        each: [3, 4, 5],
        children: i => (() => {
          const _el$51 = _tmpl$2.cloneNode(true);

          _el$51.$$click = _ => sound.controls.octave = i;

          insert(_el$51, i);

          createRenderEffect(() => className(_el$51, sound.controls.octave === i ? 'active' : ''));

          return _el$51;
        })()
      }));

      insert(_el$49, createComponent(For, {
        each: [0, 1, 2, 3, 4, 5],
        children: i => (() => {
          const _el$52 = _tmpl$2.cloneNode(true);

          _el$52.$$click = _ => sound.controls.volume = i;

          insert(_el$52, i);

          createRenderEffect(() => className(_el$52, sound.controls.volume === i ? 'active' : ''));

          return _el$52;
        })()
      }));

      _el$50._$owner = getOwner();

      insert(_el$50, createComponent(For, {
        get each() {
          return sound.pitch.bars;
        },

        children: item => createComponent(LBar, {
          item: item
        })
      }));

      return _el$42;
    })();
  };

  const comps = {
    graph: PitchBar,
    list: ListBar
  };

  const LBar = props => {
    const or_dot = _ => !!_ ? _ : '.';

    return (() => {
      const _el$53 = _tmpl$12.cloneNode(true),
            _el$54 = _el$53.firstChild,
            _el$55 = _el$54.nextSibling,
            _el$56 = _el$55.nextSibling,
            _el$57 = _el$56.nextSibling;

      _el$53.$$click = _ => props.item.select();

      insert(_el$54, () => or_dot(props.item.note));

      insert(_el$55, () => or_dot(props.item.octave));

      insert(_el$56, () => or_dot(props.item.wave));

      insert(_el$57, () => or_dot(props.item.volume));

      createRenderEffect(() => className(_el$53, [props.item.klass, props.item.lklass].join(' ')));

      return _el$53;
    })();
  };

  const Bar = props => {
    return (() => {
      const _el$58 = _tmpl$13.cloneNode(true);

      createRenderEffect(_p$ => {
        const _v$3 = props.item.klass,
              _v$4 = props.item.style;
        _v$3 !== _p$._v$3 && className(_el$58, _p$._v$3 = _v$3);
        _p$._v$4 = style(_el$58, _v$4, _p$._v$4);
        return _p$;
      }, {
        _v$3: undefined,
        _v$4: undefined
      });

      return _el$58;
    })();
  };

  const VolumeBar = props => {
    return (() => {
      const _el$59 = _tmpl$14.cloneNode(true);

      createRenderEffect(_p$ => {
        const _v$5 = props.item.vklass,
              _v$6 = props.item.vstyle;
        _v$5 !== _p$._v$5 && className(_el$59, _p$._v$5 = _v$5);
        _p$._v$6 = style(_el$59, _v$6, _p$._v$6);
        return _p$;
      }, {
        _v$5: undefined,
        _v$6: undefined
      });

      return _el$59;
    })();
  };

  const dformat = v => v < 10 ? `0${v}` : `${v}`;

  const UpDownControl = props => {
    const value = value => {
      props.setValue(props.value + value);
    };

    return (() => {
      const _el$60 = _tmpl$15.cloneNode(true),
            _el$61 = _el$60.firstChild,
            _el$62 = _el$61.nextSibling,
            _el$63 = _el$62.firstChild,
            _el$65 = _el$63.nextSibling;
            _el$65.nextSibling;
            const _el$66 = _el$62.nextSibling,
            _el$67 = _el$66.nextSibling;

      _el$61.$$click = _ => value(-1);

      _el$62.$$click = _ => value(+1);

      insert(_el$62, () => dformat(props.value), _el$65);

      _el$67.$$click = _ => value(+1);

      return _el$60;
    })();
  };

  delegateEvents(["click"]);

  function VSound(element, options = {}) {
    let sound = new Sound(element);
    render(App(sound), element);
    return {};
  }

  return VSound;

})();

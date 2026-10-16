/** Minimal hook lifecycle: render, dependency changes, functional updates and unmount. */
exports.hookHarness = function hookHarness() {
  const slots = [];
  let cursor = 0;
  let effects = [];
  const same = (a, b) =>
    a && b && a.length === b.length && b.every((value, i) => Object.is(value, a[i]));
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: (initial) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [
        slots[index],
        (value) => {
          slots[index] = typeof value === 'function' ? value(slots[index]) : value;
        },
      ];
    },
    useRef: (initial) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useMemo: (calculate, dependencies) => {
      const index = cursor++;
      if (!same(slots[index]?.dependencies, dependencies))
        slots[index] = { dependencies, value: calculate() };
      return slots[index].value;
    },
    useEffect: (effect, dependencies) => {
      const index = cursor++;
      if (same(slots[index]?.dependencies, dependencies)) return;
      const previous = slots[index];
      const current = { dependencies };
      slots[index] = current;
      effects.push(() => {
        previous?.cleanup?.();
        current.cleanup = effect();
      });
    },
  };
  react.useCallback = (callback, dependencies) => react.useMemo(() => callback, dependencies);
  return {
    react,
    render: (component) => {
      cursor = 0;
      const value = component();
      const pending = effects;
      effects = [];
      for (const effect of pending) effect();
      return value;
    },
    unmount: () => {
      for (const slot of slots) slot?.cleanup?.();
    },
  };
};

exports.elements = function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...elements(tree.props?.children)];
};

/**
 * DOM Patch: защита от конфликта React DOM reconciler и внешних виджетов.
 *
 * Внешний софтфон-виджет (softphone-*.js) императивно модифицирует DOM —
 * добавляет/удаляет/перемещает элементы. При навигации React пытается
 * удалить узлы, которые уже перемещены виджетом, и падает с NotFoundError.
 *
 * Этот патч перехватывает removeChild/insertBefore и пропускает операции
 * с узлами, которые уже не являются children целевого элемента.
 *
 * React issue #11538 — стандартный workaround для third-party DOM manipulation.
 *
 * ВАЖНО: Должен быть импортирован ДО React (первая строка main.tsx).
 */
if (typeof Node !== 'undefined') {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      console.warn(
        '[DOM Patch] removeChild: node is not a child of this parent, skipping to prevent React crash.',
        { parent: this, child }
      );
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, refNode: Node | null): T {
    if (refNode && refNode.parentNode !== this) {
      console.warn(
        '[DOM Patch] insertBefore: ref node is not a child of this parent, skipping.',
        { parent: this, newNode, refNode }
      );
      return newNode;
    }
    return originalInsertBefore.call(this, newNode, refNode) as T;
  };
}

export {};

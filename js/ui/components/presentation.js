// 只比较已有 DOM，不缓存或改写游戏数据。
export function setText(node, value) {
  const text = String(value);
  if (node.textContent !== text) node.textContent = text;
}

export function setProperty(node, name, value) {
  if (node[name] !== value) node[name] = value;
}

export function setAttribute(node, name, value) {
  const text = String(value);
  if (node.getAttribute(name) !== text) node.setAttribute(name, text);
}

export function setClass(node, name, on) {
  const enabled = !!on;
  if (node.classList.contains(name) !== enabled) node.classList.toggle(name, enabled);
}

// 内容相同但元素被外部替换时也必须重画，防止复用失去事件处理器的节点。
export function captureContent(node) {
  return { node, html: node.innerHTML, elements: [...node.querySelectorAll('*')] };
}

export function matchesContent(node, snapshot) {
  if (!snapshot || node !== snapshot.node || node.innerHTML !== snapshot.html) return false;
  const elements = node.querySelectorAll('*');
  return elements.length === snapshot.elements.length && snapshot.elements.every((element, i) => element === elements[i]);
}

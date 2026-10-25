export function makeEFixture() {
	const scalarHtmlContexts = [];

	function E(tag, attributes, children) {
		const node = { nodeType: 1, tag, attributes: attributes || {}, children: [], listeners: [] };

		function append(child) {
			if (child == null)
				return;
			if (Array.isArray(child)) {
				child.forEach(append);
				return;
			}
			if (child && child.nodeType)
				node.children.push(child);
			else
				node.children.push({ nodeType: 3, textContent: String(child) });
		}

		if (Array.isArray(children))
			children.forEach(append);
		else if (children && children.nodeType)
			append(children);
		else if (children != null) {
			// LuCI dom.append() sends scalar children to innerHTML; array strings become text nodes.
			scalarHtmlContexts.push({ tag, value: String(children) });
			node.innerHTML = String(children);
		}

		node.addEventListener = function(type, listener) {
			node.listeners.push({ type, listener });
		};
		Object.defineProperty(node, "textContent", {
			get: function() {
				return node.children.map(child => child.nodeType === 3 ? child.textContent : child.textContent || "").join("");
			},
			set: function(value) {
				node.children = [ { nodeType: 3, textContent: String(value) } ];
			}
		});
		return node;
	}

	return { E, scalarHtmlContexts };
}

export function makeTranslator() {
	return function _(message) {
		const translated = new String(message);
		translated.format = (...values) => {
			let index = 0;
			return String(message).replace(/%[sd]/g, () => String(values[index++]));
		};
		return translated;
	};
}

export function evaluateLuCIView(source, bindings) {
	const names = Object.keys(bindings);
	return new Function(...names, source)(...names.map(name => bindings[name]));
}

export function containsTextNode(node, value) {
	if (!node || typeof node !== "object")
		return false;
	if (node.nodeType === 3)
		return node.textContent.includes(value);
	return Array.isArray(node.children) && node.children.some(child => containsTextNode(child, value));
}

export function installStringFormat() {
	const previous = String.prototype.format;
	String.prototype.format = function(...values) {
		let index = 0;
		return String(this).replace(/%[sd]/g, () => String(values[index++]));
	};
	return function restore() {
		if (previous === undefined)
			delete String.prototype.format;
		else
			String.prototype.format = previous;
	};
}

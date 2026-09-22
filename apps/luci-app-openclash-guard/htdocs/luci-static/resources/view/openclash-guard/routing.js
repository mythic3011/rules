'use strict';
'require view';
'require form';

function serviceMode(section, key, title) {
	var o = section.option(form.ListValue, key, title);
	o.value('proxy', _('Proxy'));
	o.value('direct', _('Direct'));
	o.value('auto', _('Automatic'));
	o.value('block', _('Block'));
	o.default = 'proxy';
	return o;
}

return view.extend({
	render: function() {
		var m = new form.Map('openclash_guard', _('Routing'),
			_('Declarative routing intent shared by LuCI and OpenClash Guard.'));
		var s = m.section(form.TypedSection, 'routing', _('Regions and services'));
		s.anonymous = true;
		s.addremove = false;

		var direct = s.option(form.Value, 'direct_region', _('Direct region'));
		direct.placeholder = 'hk';
		direct.rmempty = false;

		var proxy = s.option(form.Value, 'proxy_region', _('Proxy region'));
		proxy.placeholder = 'hk';
		proxy.rmempty = false;

		serviceMode(s, 'chatgpt', 'ChatGPT');
		serviceMode(s, 'claude', 'Claude');
		serviceMode(s, 'grok', 'Grok');

		return m.render();
	}
});

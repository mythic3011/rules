'use strict';
'require view';
'require form';
'require rpc';

var callRegions = rpc.declare({
	object: 'luci.openclash-guard',
	method: 'getRegions',
	expect: { '': {} }
});

function serviceMode(section, key, title) {
	var o = section.option(form.ListValue, key, title);
	o.value('proxy', _('Proxy'));
	o.value('direct', _('Direct'));
	o.value('auto', _('Automatic'));
	o.value('block', _('Block'));
	o.default = 'proxy';
	return o;
}

function addRegions(option, catalog) {
	var regions = catalog && Array.isArray(catalog.regions) ? catalog.regions : [];
	regions.forEach(function(region) {
		option.value(region.id, '%s (%s)'.format(region.name || region.id, region.id));
	});
	option.editable = regions.length === 0;
}

return view.extend({
	load: function() {
		return callRegions();
	},

	render: function(catalog) {
		var m = new form.Map('openclash_guard', _('Routing'),
			_('Declarative routing intent shared by LuCI and OpenClash Guard. Region choices come from the repository Region Registry.'));
		var s = m.section(form.TypedSection, 'routing', _('Regions and services'));
		s.anonymous = true;
		s.addremove = false;

		var direct = s.option(form.ListValue, 'direct_region', _('Direct region'));
		addRegions(direct, catalog);
		direct.rmempty = false;

		var proxy = s.option(form.ListValue, 'proxy_region', _('Proxy region'));
		addRegions(proxy, catalog);
		proxy.rmempty = false;

		serviceMode(s, 'chatgpt', 'ChatGPT');
		serviceMode(s, 'claude', 'Claude');
		serviceMode(s, 'grok', 'Grok');

		return m.render();
	}
});

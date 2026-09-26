'use strict';
'require view';
'require form';

return view.extend({
	render: function() {
		var m = new form.Map('openclash_guard', _('Rules'),
			_('Manage Guard-owned local rules and remote rule-source URLs as data. Saving this form does not execute shell commands.'));
		var s = m.section(form.TypedSection, 'rules', _('Rule sources'));
		s.anonymous = true;
		s.addremove = false;

		var directRules = s.option(form.DynamicList, 'direct_rule', _('Direct rules'));
		directRules.placeholder = 'DOMAIN-SUFFIX,example.com';

		var proxyRules = s.option(form.DynamicList, 'proxy_rule', _('Proxy rules'));
		proxyRules.placeholder = 'IP-CIDR,203.0.113.0/24';

		var directSources = s.option(form.DynamicList, 'direct_source', _('Remote direct-rule URLs'));
		directSources.placeholder = 'https://raw.githubusercontent.com/OWNER/REPO/REF/path.txt';
		directSources.validate = function(section_id, value) {
			return !value || /^https:\/\//i.test(value) ? true : _('Remote rule URLs must use HTTPS.');
		};

		var proxySources = s.option(form.DynamicList, 'proxy_source', _('Remote proxy-rule URLs'));
		proxySources.placeholder = 'https://raw.githubusercontent.com/OWNER/REPO/REF/path.txt';
		proxySources.validate = directSources.validate;

		return m.render();
	}
});

'use strict';
'require view';
'require form';

return view.extend({
	render: function() {
		var m = new form.Map('openclash_guard', _('DNS'),
			_('DNS backend and fail-closed policy configuration.'));
		var s = m.section(form.TypedSection, 'dns', _('DNS policy'));
		s.anonymous = true;
		s.addremove = false;

		var backend = s.option(form.ListValue, 'backend', _('Backend'));
		backend.value('auto', _('Automatic detection'));
		backend.value('adguardhome', 'AdGuard Home');
		backend.value('dnsmasq', 'dnsmasq');
		backend.default = 'auto';

		var resolver = s.option(form.Flag, 'resolver_sync', _('Resolver sync'));
		resolver.default = '1';
		resolver.rmempty = false;

		var failClosed = s.option(form.Flag, 'fail_closed', _('Fail closed for protected services'));
		failClosed.default = '1';
		failClosed.rmempty = false;

		return m.render();
	}
});

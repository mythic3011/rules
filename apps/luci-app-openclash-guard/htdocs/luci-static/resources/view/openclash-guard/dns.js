'use strict';
'require view';
'require form';

return view.extend({
	render: function() {
		var m = new form.Map('openclash_guard', _('DNS'),
			_('DNS backend intent and resolver-sync configuration. Runtime-effective kill switches are configured on the Protection page.'));
		var s = m.section(form.TypedSection, 'dns', _('DNS policy intent'));
		s.anonymous = true;
		s.addremove = false;

		var backend = s.option(form.ListValue, 'backend', _('Preferred backend'));
		backend.value('auto', _('Automatic detection'));
		backend.value('adguardhome', 'AdGuard Home');
		backend.value('dnsmasq', 'dnsmasq');
		backend.default = 'auto';
		backend.description = _('Staged intent. Current Guard runtime still detects its live DNS backend and validates capabilities independently.');

		var resolver = s.option(form.Flag, 'resolver_sync', _('Resolver sync intent'));
		resolver.default = '1';
		resolver.rmempty = false;
		resolver.description = _('Staged intent for LuCI/runtime integration. The current signed Guard runtime remains authoritative for resolver-sync capability and health.');

		var failClosed = s.option(form.Flag, 'fail_closed', _('Protected-service fail-closed intent'));
		failClosed.default = '1';
		failClosed.rmempty = false;
		failClosed.description = _('Staged intent; not yet a direct Guard runtime input. Use Protection for the current global and router-DNS kill switches.');

		return m.render();
	}
});

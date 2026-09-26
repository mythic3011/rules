'use strict';
'require view';
'require form';

return view.extend({
	render: function() {
		var m = new form.Map('openclash_guard', _('Protection'),
			_('Runtime-effective Guard controls. These options are consumed directly by the current OpenClash Guard shell runtime, unlike staged routing/DNS intent that still requires the next runtime integration release.'));

		var core = m.section(form.NamedSection, 'main', 'core', _('Guard runtime protection'));
		core.addremove = false;

		var enabled = core.option(form.Flag, 'enabled', _('Enable OpenClash Guard'));
		enabled.default = '1';
		enabled.rmempty = false;
		enabled.description = _('Effective now. Disabling Guard removes its nftables table during reconciliation.');

		var kill = core.option(form.Flag, 'kill_switch', _('Global kill switch when OpenClash is unhealthy'));
		kill.default = '1';
		kill.rmempty = false;
		kill.description = _('Effective now. This controls infrastructure-wide fail-closed behavior when the OpenClash dataplane is unhealthy; ordinary service degradation does not imply a LAN-wide reject.');

		var dnsKill = core.option(form.Flag, 'dns_kill_switch', _('Router DNS input kill switch'));
		dnsKill.default = '0';
		dnsKill.rmempty = false;
		dnsKill.description = _('Effective now. When enabled, Guard rejects non-loopback TCP/UDP port 53 traffic to the router itself. This is separate from forwarded-client DNS policy.');

		var udp = m.section(form.NamedSection, 'udp', 'udp', _('Scoped UDP direct-routing clients'));
		udp.addremove = false;

		var udpEnabled = udp.option(form.Flag, 'enabled', _('Enable scoped UDP direct routing'));
		udpEnabled.default = '1';
		udpEnabled.rmempty = false;
		udpEnabled.description = _('Effective now. Guard still requires a healthy OpenClash dataplane and the signed runtime policy determines eligible/protected ports.');

		var src = udp.option(form.DynamicList, 'src_ip', _('Client IPv4 addresses'));
		src.datatype = 'ip4addr';
		src.placeholder = '10.0.0.169';
		src.description = _('Effective now. Only these explicit clients may use the signed policy’s scoped UDP direct-routing capability; no any-client/any-UDP bypass is created.');

		return m.render();
	}
});

'use strict';
'require view';
'require form';

return view.extend({
	render: function() {
		var m = new form.Map('openclash_guard', _('Monitoring'),
			_('Optional background egress probes for dashboard history. Results are stored only in /tmp, so they do not write persistent flash storage.'));
		var s = m.section(form.TypedSection, 'monitoring', _('Background egress monitor'));
		s.anonymous = true;
		s.addremove = false;

		var enabled = s.option(form.Flag, 'enabled', _('Enable background monitoring'));
		enabled.default = '0';
		enabled.rmempty = false;
		enabled.description = _('Disabled by default. When enabled, the router periodically probes only the fixed ChatGPT, Claude, and Grok trace endpoints.');

		var interval = s.option(form.ListValue, 'interval', _('Probe interval'));
		interval.value('300', _('5 minutes'));
		interval.value('900', _('15 minutes'));
		interval.value('1800', _('30 minutes'));
		interval.value('3600', _('60 minutes'));
		interval.default = '900';
		interval.depends('enabled', '1');
		interval.description = _('The backend enforces a hard minimum of 5 minutes even if the UCI file is edited manually.');

		var chatgpt = s.option(form.Flag, 'chatgpt', 'ChatGPT');
		chatgpt.default = '1';
		chatgpt.rmempty = false;
		chatgpt.depends('enabled', '1');

		var claude = s.option(form.Flag, 'claude', 'Claude');
		claude.default = '1';
		claude.rmempty = false;
		claude.depends('enabled', '1');

		var grok = s.option(form.Flag, 'grok', 'Grok');
		grok.default = '1';
		grok.rmempty = false;
		grok.depends('enabled', '1');

		return m.render();
	}
});

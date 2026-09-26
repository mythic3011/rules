'use strict';
'require view';
'require form';
'require rpc';
'require ui';

var callProbeProfile = rpc.declare({
	object: 'luci.openclash-guard',
	method: 'probeProfile',
	params: [ 'url' ],
	expect: { '': {} }
});

return view.extend({
	render: function() {
		var m = new form.Map('openclash_guard', _('Profile'),
			_('Use one HTTPS custom-template INI URL. Opaque Profile Service URLs such as /p/<token>.ini are supported.'));
		var s = m.section(form.TypedSection, 'core', _('Profile source'));
		s.anonymous = true;
		s.addremove = false;

		var mode = s.option(form.ListValue, 'profile_mode', _('Mode'));
		mode.value('remote_ini', _('Remote INI URL'));
		mode.value('local', _('Local/runtime-managed'));
		mode.default = 'remote_ini';

		var url = s.option(form.Value, 'profile_url', _('Custom Template URL'));
		url.placeholder = 'https://example.net/p/opaque-token.ini';
		url.depends('profile_mode', 'remote_ini');
		url.validate = function(section_id, value) {
			if (!value)
				return true;
			if (!/^https:\/\//i.test(value))
				return _('The profile URL must use HTTPS.');
			return true;
		};

		var source = s.option(form.ListValue, 'distribution_source', _('Guard distribution source'));
		source.value('auto', _('Automatic'));
		source.value('github-raw', 'GitHub Raw');
		source.value('jsdelivr', 'jsDelivr');
		source.default = 'auto';

		var refresh = s.option(form.Flag, 'auto_refresh', _('Automatic profile refresh'));
		refresh.default = '1';
		refresh.rmempty = false;

		var probe = s.option(form.Button, '_probe', _('Validate URL'));
		probe.inputtitle = _('Fetch and inspect');
		probe.inputstyle = 'apply';
		probe.onclick = function(section_id) {
			var value = url.formvalue(section_id) || '';
			return callProbeProfile(value).then(function(result) {
				if (!result.ok)
					return ui.addNotification(null, E('p', {}, result.error || _('Profile probe failed.')), 'error');
				var message = '%s: %d bytes, %d INI sections%s'.format(
					result.looksLikeIni ? _('Looks valid') : _('Unexpected format'),
					result.bytes || 0,
					result.sections || 0,
					result.firstSection ? ', first=[' + result.firstSection + ']' : '');
				ui.addNotification(null, E('p', {}, message), result.looksLikeIni ? 'info' : 'warning');
			});
		};

		return m.render();
	}
});

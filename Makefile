.PHONY: help bootstrap install-hooks doctor check check-all check-profile-service check-bootstrap-alias generate build ci refresh

help:
	@printf '%s\n' \
	  'make bootstrap  - install contributor dependencies' \
	  'make install-hooks - enable repository Git hooks' \
	  'make doctor     - inspect local prerequisites' \
	  'make check      - core Python + profile-service contracts' \
	  'make check-all  - Python + TypeScript checks' \
	  'make check-profile-service - Worker solver/renderer tests' \
	  'make check-bootstrap-alias - smoke-test the public Guard bootstrap alias' \
	  'make generate   - deterministic local generation' \
	  'make build      - build standalone OpenClash Guard distribution' \
	  'make ci         - run CI validation and generated-output drift checks' \
	  'make refresh    - refresh upstream network inputs + regenerate'

bootstrap:
	mise install
	mise run bootstrap
install-hooks:
	git config core.hooksPath .githooks
doctor:
	mise run doctor
check:
	mise run check
check-all:
	mise run check-all
check-profile-service:
	mise run check-profile-service
check-bootstrap-alias:
	mise run check-bootstrap-alias
generate:
	mise run generate
build:
	mise run build
ci:
	@mise run ci || { rc=$$?; printf '%s\n' 'generated drift details:' >&2; git status --short >&2; git diff --name-only >&2; git diff --no-ext-diff -- dist/openclash-guard.release.json >&2; exit $$rc; }
refresh:
	mise run refresh

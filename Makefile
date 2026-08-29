.PHONY: help bootstrap doctor check check-all check-profile-service check-bootstrap-alias generate build ci refresh

help:
	@printf '%s\n' \
	  'make bootstrap  - install contributor dependencies' \
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
	python3 -m pip install -r requirements-dev.txt
	npm ci
doctor:
	./rulesctl doctor
check:
	./rulesctl check
check-all:
	./rulesctl check --node
check-profile-service:
	npm run test:profile-service
check-bootstrap-alias:
	python3 internal/python/check_bootstrap_alias.py
generate:
	./rulesctl generate
	python3 tools/shbundle.py build --all
build:
	python3 tools/shbundle.py build --all
ci:
	./rulesctl ci
refresh:
	./rulesctl refresh --yes

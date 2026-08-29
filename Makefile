.PHONY: help bootstrap doctor check check-all check-profile-service generate build refresh

help:
	@printf '%s\n' \
	  'make bootstrap  - install contributor dependencies' \
	  'make doctor     - inspect local prerequisites' \
	  'make check      - core Python + profile-service contracts' \
	  'make check-all  - Python + TypeScript checks' \
	  'make check-profile-service - Worker solver/renderer tests' \
	  'make generate   - deterministic local generation' \
	  'make build      - build standalone OpenClash Guard distribution' \
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
generate:
	./rulesctl generate
	python3 tools/shbundle.py build --all
build:
	python3 tools/shbundle.py build --all
refresh:
	./rulesctl refresh --yes

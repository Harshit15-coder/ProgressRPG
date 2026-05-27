#!/bin/sh
set -e
python manage.py collectstatic --noinput --clear --skip-checks
python manage.py migrate --skip-checks

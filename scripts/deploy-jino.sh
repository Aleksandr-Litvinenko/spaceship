#!/usr/bin/env bash
# Выкладка сайта на VPS хостинга: сборка, заливка в /var/www, подмена каталога, проверка ответа.
# Использование: npm run deploy
# Адрес сервера, порт и ключ задаются переменными окружения — в репозиторий они не попадают:
#   JINO_HOST=<IP VPS> JINO_PORT=<порт SSH> JINO_KEY=<путь к приватному ключу> \
#   [JINO_HOSTKEY_ALIAS=<алиас из known_hosts>] npm run deploy
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOMAIN="spaceship.product1c.ru"
REMOTE_DIR="/var/www/${DOMAIN}"
HOST="${JINO_HOST:?Задайте JINO_HOST — IP сервера}"
PORT="${JINO_PORT:?Задайте JINO_PORT — порт SSH}"
KEY="${JINO_KEY:?Задайте JINO_KEY — путь к приватному ключу}"

SSH_OPTS=(-i "$KEY" -p "$PORT" -o BatchMode=yes -o ConnectTimeout=25)
if [ -n "${JINO_HOSTKEY_ALIAS:-}" ]; then
  SSH_OPTS+=(-o "HostKeyAlias=${JINO_HOSTKEY_ALIAS}")
fi
ssh_run() { ssh "${SSH_OPTS[@]}" "root@${HOST}" "$@"; }

cd "$ROOT"
echo "→ сборка"
node scripts/build.mjs

echo "→ конфиг nginx"
if ! ssh_run "test -f /etc/nginx/sites-available/${DOMAIN}"; then
  scp -i "$KEY" -P "$PORT" "${SSH_OPTS[@]:4}" \
    deploy/nginx-spaceship.conf "root@${HOST}:/etc/nginx/sites-available/${DOMAIN}"
  ssh_run "ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/${DOMAIN} && nginx -t && systemctl reload nginx"
  echo "  конфиг установлен"
else
  echo "  конфиг уже стоит"
fi

echo "→ заливка во временный каталог"
STAMP="$(date +%Y%m%d-%H%M%S)"
ssh_run "rm -rf ${REMOTE_DIR}.new && mkdir -p ${REMOTE_DIR}.new"
# COPYFILE_DISABLE — чтобы macOS не добавлял файлы ._* в архив
COPYFILE_DISABLE=1 tar -C dist -czf - . | ssh "${SSH_OPTS[@]}" "root@${HOST}" "tar -xzf - -C ${REMOTE_DIR}.new"

echo "→ подмена каталога (старый уходит в бэкап)"
ssh_run "mkdir -p /root/backups && if [ -d ${REMOTE_DIR} ]; then mv ${REMOTE_DIR} /root/backups/${DOMAIN}-${STAMP}; fi && mv ${REMOTE_DIR}.new ${REMOTE_DIR} && nginx -t && systemctl reload nginx"

echo "→ проверка"
code="$(curl -s -o /dev/null -w '%{http_code}' "https://${DOMAIN}/" || true)"
echo "  https://${DOMAIN}/ → HTTP ${code}"
if [ "$code" != "200" ]; then
  echo "Сайт не отвечает 200. Предыдущая версия в /root/backups/${DOMAIN}-${STAMP} (если она была)." >&2
  exit 1
fi
echo "готово"
